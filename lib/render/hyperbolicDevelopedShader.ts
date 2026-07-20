// Per-pixel Poincaré-disk shader for a DEVELOPED hyperbolic tiling (any vertex configuration, mixed tiles).
// It REDUCES each pixel into a fundamental domain by repeatedly applying the tiling's symmetry-group
// generators (lib/render/hyperbolicGroup.ts), then colours it by which fundamental tile it lands in.
// Infinite, pixel-perfect to the rim, GPU, and k-general — the generators carry the full symmetry, so any
// vertex configuration renders with SU(1,1) pan, geodesic edges, and per-tile depth dimming.
//
// Uniforms are the packed HyperbolicTilingGL: generator inverses + their basepoint images (the reduction
// sites), and the central tiles as geodesic-conic edge tests. buildDevelopedUniforms() flattens the group.

import type { HyperbolicTilingGL } from "@/lib/render/hyperbolicGroup";

export const MAX_GEN = 64;
export const MAX_TILE = 40;
export const MAX_TILE_EDGES = 8; // largest polygon in the palette (octagon)
export const MAX_EDGE = MAX_TILE * MAX_TILE_EDGES;

export const DEVELOPED_VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const DEVELOPED_FRAG = `#version 300 es
precision highp float;

#define MAX_GEN ${MAX_GEN}
#define MAX_TILE ${MAX_TILE}
#define MAX_TILE_EDGES ${MAX_TILE_EDGES}
#define MAX_EDGE ${MAX_EDGE}
#define MAX_RED 160        // reduction iterations — pixel-perfect to well past any practical zoom
#define PI 3.14159265358979323846

uniform vec2 uRes;         // CSS pixel size
uniform float uDpr;        // device pixel ratio
uniform float uPadPx;      // disk inset (CSS px)
uniform vec2 uMa;          // SU(1,1) view: a
uniform vec2 uMb;          // SU(1,1) view: b  (z ↦ (a z + b)/(b̄ z + ā))
uniform float uHueOffset;  // global hue rotation (deg)
uniform int uDark;         // 1 = dark theme
uniform vec3 uSurface;     // background / out-of-disk
uniform vec3 uLine;        // edge stroke
uniform int uStrokeMode;   // 0 = geometry (constant hyperbolic width, tapers to rim), 1 = constant screen px
uniform float uStrokePx;   // constant-mode stroke half-width, device px (0 = none)
uniform float uStrokeGeom; // geometry-mode stroke half-width, hyperbolic units
uniform int uShowFill;     // 1 = coloured fill, 0 = surface fill (edges only)

uniform vec2 uO;           // fundamental-domain basepoint
uniform float uOInvDen;    // 1/(1-|o|²)
uniform int uNGen;
uniform vec4 uGenInv[MAX_GEN];   // g⁻¹ as (a.x,a.y,b.x,b.y)
uniform vec2 uSite[MAX_GEN];     // g·o (reduction sites)
uniform float uSiteInvDen[MAX_GEN]; // 1/(1-|site|²)

uniform int uNTile;
uniform float uTileHue[MAX_TILE];
uniform vec2 uTileCentroid[MAX_TILE]; // fundamental-frame tile centre, for per-TILE depth shading
uniform int uTileEdgeOff[MAX_TILE];
uniform int uTileEdgeCount[MAX_TILE];
uniform vec4 uEdge[MAX_EDGE];    // geodesic conic (c0,c1,c2,interiorSign)

out vec4 frag;

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { float d = dot(b, b); return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d; }

// Inverse view V⁻¹(z) = (ā z − b)/(−b̄ z + a): screen disk → tiling frame.
vec2 viewInverse(vec2 z) {
	vec2 abar = vec2(uMa.x, -uMa.y);
	vec2 num = cmul(abar, z) - uMb;
	vec2 den = cmul(vec2(-uMb.x, uMb.y), z) + uMa;
	return cdiv(num, den);
}

// Forward view V(z) = (a z + b)/(b̄ z + ā): tiling frame → screen disk.
vec2 viewForward(vec2 z) {
	vec2 num = cmul(uMa, z) + uMb;
	vec2 den = cmul(vec2(uMb.x, -uMb.y), z) + vec2(uMa.x, -uMa.y);
	return cdiv(num, den);
}

// Apply an SU(1,1) element (a,b packed as vec4) forward: z ↦ (a z + b)/(b̄ z + ā).
vec2 applyMobius(vec4 m, vec2 z) {
	vec2 a = m.xy, b = m.zw;
	vec2 num = cmul(a, z) + b;
	vec2 den = cmul(vec2(b.x, -b.y), z) + vec2(a.x, -a.y);
	return cdiv(num, den);
}

// SU(1,1) product m·n (both packed a,b as vec4).
vec4 su11mul(vec4 m, vec4 n) {
	vec2 ma = m.xy, mb = m.zw, na = n.xy, nb = n.zw;
	return vec4(cmul(ma, na) + cmul(mb, vec2(nb.x, -nb.y)), cmul(ma, nb) + cmul(mb, vec2(na.x, -na.y)));
}

// distance proxy monotone in hyperbolic distance from z to p: |z−p|²/(1−|p|²) (drop the common 1−|z|²).
float distProxy(vec2 z, vec2 p, float invDen) { vec2 d = z - p; return dot(d, d) * invDen; }

// Tile palette, byte-identical to the euclidean/spherical fill (lib/render/hueRing.ts tileHueRgb01):
// HSB(h, 0.40, 1.0), h in [0,1]. Keeps hyperbolic tiles the same material as the other two geometries so
// their brightness matches.
vec3 hsb2rgb(float h, float s, float v) {
	vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
	return v * mix(vec3(1.0), k, s);
}

void main() {
	vec2 fragCss = gl_FragCoord.xy / uDpr;
	vec2 s = vec2(fragCss.x - uRes.x * 0.5, uRes.y * 0.5 - fragCss.y);
	float R = max(0.5 * min(uRes.x, uRes.y) - uPadPx, 1.0);
	vec2 zScreen = s / R;
	float rs2 = dot(zScreen, zScreen);
	if (rs2 >= 1.0) { frag = vec4(uSurface, 1.0); return; }

	// tiling-frame point at this pixel, then reduce into the fundamental domain. Accumulate the reduction
	// isometry G (z_reduced = G · z0) so the tile's centre can be mapped back for per-TILE depth shading.
	vec2 z0 = viewInverse(zScreen);
	vec2 z = z0;
	vec4 G = vec4(1.0, 0.0, 0.0, 0.0); // identity
	for (int i = 0; i < MAX_RED; i++) {
		float bestF = distProxy(z, uO, uOInvDen);
		int best = -1;
		for (int j = 0; j < MAX_GEN; j++) {
			if (j >= uNGen) break;
			float f = distProxy(z, uSite[j], uSiteInvDen[j]);
			if (f < bestF - 1e-7) { bestF = f; best = j; }
		}
		if (best < 0) break;
		z = applyMobius(uGenInv[best], z);
		G = su11mul(uGenInv[best], G);
	}

	// which fundamental tile contains the reduced point (+ distance to its nearest edge, for the stroke)
	int found = -1;
	float minHyp = 1e9;
	float zz = dot(z, z);
	for (int t = 0; t < MAX_TILE; t++) {
		if (t >= uNTile) break;
		int off = uTileEdgeOff[t];
		int cnt = uTileEdgeCount[t];
		bool inside = true;
		float md = 1e9;
		for (int e = 0; e < MAX_TILE_EDGES; e++) {
			if (e >= cnt) break;
			vec4 ed = uEdge[off + e];
			float val = ed.x * (zz + 1.0) + ed.y * z.x + ed.z * z.y;
			if (val * ed.w < 0.0) { inside = false; break; }
			vec2 grad = vec2(2.0 * ed.x * z.x + ed.y, 2.0 * ed.x * z.y + ed.z);
			// hyperbolic distance to the edge (isometry-invariant): Euclid perpendicular × local metric.
			md = min(md, (abs(val) / max(length(grad), 1e-6)) * 2.0 / max(1.0 - zz, 1e-6));
		}
		if (inside) { found = t; minHyp = md; break; }
	}

	if (found < 0) { frag = vec4(uSurface, 1.0); return; }

	// PER-TILE depth: map the found tile's centre back through the reduction (G⁻¹) to this tile instance, put
	// it on screen, and dim by its distance from the disk centre. Every pixel of one tile shares this centre,
	// so the whole tile takes ONE shade (the fold-shader look) rather than a per-pixel radial gradient.
	vec4 Ginv = vec4(G.x, -G.y, -G.z, -G.w);
	vec2 tileCentreScreen = viewForward(applyMobius(Ginv, uTileCentroid[found]));
	// Base colour is the bright euclidean/spherical pastel (HSB 0.40, 1.0), then dimmed by tile DEPTH:
	// dim = 1 − 0.5·r² with r the tile centre's screen radius (full brightness at the disk centre, ×0.5 at
	// the rim). One shade per tile (the fold-shader look), theme-independent like the flat tiles.
	float depth = clamp(length(tileCentreScreen), 0.0, 1.0);
	float dim = 1.0 - 0.5 * depth * depth;
	vec3 fill = uShowFill == 1
		? hsb2rgb(mod(uTileHue[found] + uHueOffset, 360.0) / 360.0, 0.40, 1.0) * dim
		: uSurface;

	// stroke: geometry mode keeps a constant HYPERBOLIC half-width (so it tapers toward the rim with the
	// tiles); constant mode keeps a fixed device-px width. minHyp is the frame-free hyperbolic edge distance.
	// Edge distance in device px at this pixel (the metric factor 0.5·(1−rs2) collapses to 0 at the rim, so
	// stroke width and antialias band are both measured in the SAME screen units everywhere).
	float screenPx = minHyp * 0.5 * (1.0 - rs2) * R * uDpr;
	float edge;
	if (uStrokeMode == 1) {
		// constant: fixed device-px half-width, crisp 1px antialias band.
		edge = uStrokePx > 0.0 ? (1.0 - smoothstep(uStrokePx - 1.0, uStrokePx + 1.0, screenPx)) : 0.0;
	} else {
		// geometry (perspective): half-width constant in HYPERBOLIC units so it tapers toward the rim, but
		// the antialias band is a fixed ~1px in screen space. The old code smoothstepped over [0.8w,1.2w] in
		// hyperbolic units — a band that grew with the width, so a wide stroke blurred. Convert the width to
		// device px and antialias with the same ±1px as constant mode.
		float wPx = uStrokeGeom * 0.5 * (1.0 - rs2) * R * uDpr;
		edge = uStrokeGeom > 0.0 ? (1.0 - smoothstep(wPx - 1.0, wPx + 1.0, screenPx)) : 0.0;
	}
	vec3 line = (uShowFill == 0 && uDark == 1) ? vec3(0.9, 0.9, 0.92) : uLine;
	vec3 col = mix(fill, line, edge);

	// disk boundary ring — the PIXEL's screen radius, not the tile-centre depth
	float ring = smoothstep(0.995, 1.0, sqrt(rs2));
	col = mix(col, uSurface, ring);
	frag = vec4(col, 1.0);
}
`;

const UNIFORM_NAMES = [
	"uRes", "uDpr", "uPadPx", "uMa", "uMb", "uHueOffset", "uDark", "uSurface", "uLine",
	"uStrokeMode", "uStrokePx", "uStrokeGeom", "uShowFill",
	"uO", "uOInvDen", "uNGen", "uGenInv", "uSite", "uSiteInvDen",
	"uNTile", "uTileHue", "uTileCentroid", "uTileEdgeOff", "uTileEdgeCount", "uEdge",
] as const;

export type DevelopedUniforms = Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>;

export interface DevelopedProgram {
	program: WebGLProgram;
	vs: WebGLShader;
	fs: WebGLShader;
	uniforms: DevelopedUniforms;
	quad: WebGLBuffer;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
	const sh = gl.createShader(type);
	if (!sh) return null;
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		console.error("developed hyperbolic shader compile failed:", gl.getShaderInfoLog(sh));
		gl.deleteShader(sh);
		return null;
	}
	return sh;
}

export function createDevelopedProgram(gl: WebGL2RenderingContext): DevelopedProgram | null {
	const vs = compile(gl, gl.VERTEX_SHADER, DEVELOPED_VERT);
	const fs = compile(gl, gl.FRAGMENT_SHADER, DEVELOPED_FRAG);
	if (!vs || !fs) return null;
	const program = gl.createProgram();
	if (!program) return null;
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error("developed hyperbolic program link failed:", gl.getProgramInfoLog(program));
		return null;
	}
	gl.useProgram(program);
	const uniforms = {} as DevelopedUniforms;
	for (const name of UNIFORM_NAMES) uniforms[name] = gl.getUniformLocation(program, name);
	const quad = gl.createBuffer()!;
	gl.bindBuffer(gl.ARRAY_BUFFER, quad);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
	const aPos = gl.getAttribLocation(program, "aPos");
	gl.enableVertexAttribArray(aPos);
	gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
	return { program, vs, fs, uniforms, quad };
}

/** Flatten a HyperbolicTilingGL into the shader's uniform arrays. Tiles beyond MAX_TILE / edges beyond
 *  MAX_EDGE are dropped (log-free; the fundamental domain needs only a handful). */
export interface DevelopedUniformData {
	o: [number, number];
	oInvDen: number;
	nGen: number;
	genInv: Float32Array; // MAX_GEN * 4
	site: Float32Array; // MAX_GEN * 2
	siteInvDen: Float32Array; // MAX_GEN
	nTile: number;
	tileHue: Float32Array; // MAX_TILE
	tileCentroid: Float32Array; // MAX_TILE * 2
	tileEdgeOff: Int32Array; // MAX_TILE
	tileEdgeCount: Int32Array; // MAX_TILE
	edge: Float32Array; // MAX_EDGE * 4
}

export function buildDevelopedUniforms(gl: HyperbolicTilingGL): DevelopedUniformData {
	const invDen = (p: { x: number; y: number }) => 1 / Math.max(1 - (p.x * p.x + p.y * p.y), 1e-9);
	const gens = gl.generators.slice(0, MAX_GEN);
	const genInv = new Float32Array(MAX_GEN * 4);
	const site = new Float32Array(MAX_GEN * 2);
	const siteInvDen = new Float32Array(MAX_GEN);
	gens.forEach((g, i) => {
		genInv[4 * i] = g.gInv.a.x;
		genInv[4 * i + 1] = g.gInv.a.y;
		genInv[4 * i + 2] = g.gInv.b.x;
		genInv[4 * i + 3] = g.gInv.b.y;
		site[2 * i] = g.site.x;
		site[2 * i + 1] = g.site.y;
		siteInvDen[i] = invDen(g.site);
	});

	const tileHue = new Float32Array(MAX_TILE);
	const tileCentroid = new Float32Array(MAX_TILE * 2);
	const tileEdgeOff = new Int32Array(MAX_TILE);
	const tileEdgeCount = new Int32Array(MAX_TILE);
	const edge = new Float32Array(MAX_EDGE * 4);
	let nTile = 0;
	let e = 0;
	for (const t of gl.tiles) {
		if (nTile >= MAX_TILE || e + t.edges.length > MAX_EDGE) break;
		tileHue[nTile] = t.hue;
		tileCentroid[2 * nTile] = t.centroid[0];
		tileCentroid[2 * nTile + 1] = t.centroid[1];
		tileEdgeOff[nTile] = e;
		tileEdgeCount[nTile] = t.edges.length;
		for (const ed of t.edges) {
			edge[4 * e] = ed.c0;
			edge[4 * e + 1] = ed.c1;
			edge[4 * e + 2] = ed.c2;
			edge[4 * e + 3] = ed.sign;
			e++;
		}
		nTile++;
	}

	return {
		o: [gl.basepoint.x, gl.basepoint.y],
		oInvDen: invDen(gl.basepoint),
		nGen: gens.length,
		genInv,
		site,
		siteInvDen,
		nTile,
		tileHue,
		tileCentroid,
		tileEdgeOff,
		tileEdgeCount,
		edge,
	};
}
