// Batched WebGL2 renderer for the Sub Rosa substitution patches (app/(app)/aperiodic).
//
// Unlike FlatCellRenderer (periodic, instanced: one cell mesh × a lattice of offsets), a Sub Rosa
// patch is APERIODIC — the tiles never repeat — so there is nothing to instance. We triangulate the
// whole patch ONCE into a single vertex buffer and draw it in one glDrawArrays. Pan/zoom is then just
// three uniforms (scale, origin) read in the vertex shader: the geometry never re-tessellates, so a
// drag or a wheel is "change a uniform, redraw" and stays at frame rate even at ~1M tiles.
//
// The view model is flatTilingGL's, so a pan, a wheel notch and a Shift+wheel turn mean the same
// thing here as on /play: screen_centred = offset + zoom · R'(θ) · (p − centre), with R'(θ)·(x,y) =
// (c·x + s·y, s·x − c·y) — rotation composed with the y-flip. lib/hooks/useAperiodicView.ts owns the
// state that feeds it and documents the frame in full.
//
// Tile outlines come in two flavours, and which one runs is decided by the patch's size.
//
// THE DEFAULT: a second pass of real geometry, one instanced quad per polygon side, expanded to the
// stroke width in SCREEN space by the vertex shader and shaded as a capsule (distance to the segment)
// by the fragment. Screen-space expansion is what keeps a static vertex buffer compatible with a
// stroke measured in px: the quad is four corners and a pair of endpoints, and zoom, pan and rotation
// stay uniforms. Capsule shading gives round joins for free: two sides meeting at a corner are two
// capsules sharing an endpoint, and their union IS the round join, so there is no miter maths and
// nothing to get wrong at the hat's 60° and 300° corners.
//
// THE FALLBACK, for patches too large to carry a second buffer: the single-pass barycentric wireframe
// (Celes/NVIDIA trick) this renderer used everywhere until 2026-07-31. Each vertex carries a vec3 of
// the triangle's barycentric coords with the internal-diagonal channel pinned to 1 so it never
// strokes, and the fragment paints out to the half-width from whichever real edge is nearest.
//
// Why the wireframe stopped being the default. Its stroke lives INSIDE the triangles of the tile's own
// ear clip, so a band can only be painted where a triangle owning that edge covers it. Near a corner
// the ear triangle is thinner than the band, and the ink stops dead along the invented diagonal: the
// join comes out with a straight bite taken out of it, and consecutive sides step instead of meeting.
// The defect scales with stroke width over triangle size in px, so it is invisible zoomed in and
// plainly visible at the size a landing card or a fitted patch actually shows. Measured on the hat at
// 24 CSS px a tile, where a 1.5 px line leaves a 0.75 px band inside ear triangles a couple of px
// across. Nothing about it is fixable from three barycentric channels: the triangle simply does not
// know about the edge next door. The second flavour also gains analytic AA, where the wireframe had
// only a smoothstep over a per-quad derivative estimate (MSAA never touched it, the stroke being
// interior shading and not a primitive boundary), which is the other half of why those lines looked hard
// and stepped.
//
// Sides are NOT deduplicated, so an interior edge is drawn once by each of the two tiles that share
// it. Both copies are opaque and coincident, so the only difference is that the AA ramp composites
// twice and the line reads ~10% heavier than a single pass would, uniformly across the patch, and
// cheaper than a 700k-entry hash. It does assume an OPAQUE stroke; a semi-transparent one would show
// its interior edges darker than its boundary.

import type { Vector } from "@/classes/Vector";
import { edgeMask, triangulate } from "./triangulate";

interface Pt {
	x: number;
	y: number;
}

/**
 * Most polygon sides the outline pass will carry, counted before any sharing: 16 B of instance data
 * each, so 24 MB of buffer at the cap. Penrose depth 11 (572k sides) and hat level 6 (706k) both fit;
 * a 1.5M-tile Sub Rosa patch is 6M sides and does not, and falls back to the wireframe.
 */
export const MAX_OUTLINE_EDGES = 1_500_000;

/**
 * Pack every side of every ring into the instanced outline buffer: 4 floats per side, (ax, ay, bx,
 * by) in world coordinates. Returns null when the patch is over budget (the caller then keeps the
 * barycentric wireframe) or has no sides at all.
 *
 * Exported for the unit test; the renderer is the only real caller.
 */
export function packOutlineEdges<T>(items: readonly T[], ringOf: (item: T) => readonly Pt[]): Float32Array | null {
	let sides = 0;
	for (const it of items) {
		const r = ringOf(it);
		if (r.length >= 2) sides += r.length;
	}
	if (sides === 0 || sides > MAX_OUTLINE_EDGES) return null;

	const out = new Float32Array(sides * 4);
	let i = 0;
	for (const it of items) {
		const r = ringOf(it);
		if (r.length < 2) continue;
		for (let k = 0, j = r.length - 1; k < r.length; j = k++) {
			out[i++] = r[j].x;
			out[i++] = r[j].y;
			out[i++] = r[k].x;
			out[i++] = r[k].y;
		}
	}
	return out;
}

const FILL_VERT = `#version 300 es
in vec2 aPos;
in float aHue;
in vec3 aEdge;
uniform float uZoom;
uniform vec2 uOffset;  // pan, centred CSS px, y down
uniform float uRot;    // view angle, radians
uniform vec2 uCentre;  // world point the view is centred on
uniform vec2 uHalf;    // canvas CSS half-size (w/2, h/2)
out float vHue;
out vec3 vEdge;
void main() {
	// Transcribes applyViewTransform in lib/hooks/useAperiodicView.ts — keep the two in step.
	float c = cos(uRot), s = sin(uRot);
	vec2 p = aPos - uCentre;
	float sx = uOffset.x + uZoom * (c * p.x + s * p.y);
	float sy = uOffset.y + uZoom * (s * p.x - c * p.y);
	gl_Position = vec4(sx / uHalf.x, -sy / uHalf.y, 0.0, 1.0);
	vHue = aHue;
	vEdge = aEdge;
}
`;

const FILL_FRAG = `#version 300 es
precision highp float;
in float vHue;
in vec3 vEdge;
uniform float uLight;    // HSL lightness 0..100 (theme-dependent), to match the 2D path's hsl(h 58% L%)
uniform float uSat;      // HSL saturation 0..1
uniform float uStrokePx; // outline HALF-width in DEVICE px (draw() converts from the CSS width); 0 = off
uniform vec4 uStroke;    // outline colour, rgb 0..1 + alpha
out vec4 frag;
// Compact CSS hsl()→rgb (the spec's modulo form).
vec3 hsl2rgb(float h, float s, float l) {
	float a = s * min(l, 1.0 - l);
	vec3 k = mod(vec3(0.0, 8.0, 4.0) + h / 30.0, 12.0);
	return l - a * clamp(min(min(k - 3.0, 9.0 - k), 1.0), -1.0, 1.0);
}
void main() {
	vec3 base = hsl2rgb(vHue, uSat, uLight * 0.01);
	if (uStrokePx > 0.0) {
		float d = min(min(vEdge.x, vEdge.y), vEdge.z); // distance (barycentric) to nearest REAL edge
		// True screen-space gradient, NOT fwidth. fwidth is |∂d/∂x| + |∂d/∂y| — the Manhattan length of
		// the same vector — which overstates it by up to √2 depending on how the edge lies against the
		// pixel grid, so an fwidth-scaled outline is up to 41% wider on a diagonal edge than on an axis-
		// aligned one. In a rhombic patch every edge sits at a different angle, so that shows up as
		// outlines of visibly unequal weight within one tiling. length() is the real distance.
		float g = length(vec2(dFdx(d), dFdy(d)));
		// g == 0 means d is constant over the whole triangle, which happens when every one of its three
		// edges is an invented diagonal — all three channels pinned to 1. Ear clipping a 13-gon produces
		// such interior triangles routinely (the fixed quad split never could, since two of its edges
		// are always real). Push them past the threshold instead of dividing by zero: nothing to stroke.
		float dpx = g > 0.0 ? d / g : 1e9; // distance to the edge, in device px
		// A LINE, not a gradient: full stroke colour out to the half-width, then one pixel of AA. The
		// former smoothstep(0, width, d) ramped the whole way from edge to width, which is a blur —
		// it is what made these outlines look soft next to /play's, where the stroke is real geometry
		// (flatTilingGL's expanded edge quads) and only its own boundary is antialiased.
		float e = 1.0 - smoothstep(uStrokePx - 0.5, uStrokePx + 0.5, dpx);
		base = mix(base, uStroke.rgb, e * uStroke.a);
	}
	frag = vec4(base, 1.0);
}
`;

// The outline pass. One instance per polygon side; the four corners of a quad that hugs the segment,
// expanded in screen space so a px width means px at every zoom. Both stages work in the same centred
// CSS-px frame the fill's vertex shader computes, so the two passes cannot drift apart.
const LINE_VERT = `#version 300 es
in vec2 aQuad;  // (±1, ±1): (along the segment, across it)
in vec2 aSegA;  // per instance: the side's world endpoints
in vec2 aSegB;
uniform float uZoom;
uniform vec2 uOffset;
uniform float uRot;
uniform vec2 uCentre;
uniform vec2 uHalf;      // canvas CSS half-size
uniform float uExtend;   // half-width + AA slack, CSS px: how far past the segment the quad reaches
flat out vec2 vA;
flat out vec2 vB;
out vec2 vP;
vec2 toScreen(vec2 w) {
	float c = cos(uRot), s = sin(uRot);
	vec2 p = w - uCentre;
	return vec2(uOffset.x + uZoom * (c * p.x + s * p.y), uOffset.y + uZoom * (s * p.x - c * p.y));
}
void main() {
	vec2 a = toScreen(aSegA), b = toScreen(aSegB);
	vec2 d = b - a;
	float len = length(d);
	// A side can collapse to a point in screen space (zoomed far out, or a degenerate ring). Any
	// direction will do then: the capsule the fragment shades is a disc either way.
	vec2 dir = len > 1e-6 ? d / len : vec2(1.0, 0.0);
	vec2 nrm = vec2(-dir.y, dir.x);
	vec2 base = aQuad.x < 0.0 ? a : b;
	vec2 p = base + dir * (aQuad.x * uExtend) + nrm * (aQuad.y * uExtend);
	vA = a; vB = b; vP = p;
	gl_Position = vec4(p.x / uHalf.x, -p.y / uHalf.y, 0.0, 1.0);
}
`;

const LINE_FRAG = `#version 300 es
precision highp float;
flat in vec2 vA;
flat in vec2 vB;
in vec2 vP;
uniform float uHalfWidth; // CSS px
uniform float uFeather;   // CSS px: half the AA ramp, set to half a DEVICE px by draw()
uniform vec4 uStroke;
out vec4 frag;
void main() {
	// Distance to the segment, analytically, which is the whole point of the pass. The old wireframe had to
	// reconstruct this from a barycentric coordinate and a screen-space derivative estimate.
	vec2 pa = vP - vA, ba = vB - vA;
	float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-12), 0.0, 1.0);
	float d = length(pa - ba * h);
	float cov = 1.0 - smoothstep(uHalfWidth - uFeather, uHalfWidth + uFeather, d);
	if (cov <= 0.0) discard;
	frag = vec4(uStroke.rgb, uStroke.a * cov);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
	const sh = gl.createShader(type);
	if (!sh) return null;
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		console.error("subrosa shader compile failed:", gl.getShaderInfoLog(sh));
		gl.deleteShader(sh);
		return null;
	}
	return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
	const v = compile(gl, gl.VERTEX_SHADER, vs);
	const f = compile(gl, gl.FRAGMENT_SHADER, fs);
	if (!v || !f) return null;
	const prog = gl.createProgram();
	gl.attachShader(prog, v);
	gl.attachShader(prog, f);
	gl.linkProgram(prog);
	gl.deleteShader(v);
	gl.deleteShader(f);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
		console.error("subrosa program link failed:", gl.getProgramInfoLog(prog));
		gl.deleteProgram(prog);
		return null;
	}
	return prog;
}

// The two triangles' per-vertex barycentric edge attributes for one rhombus (c0,c1,c2,c3), split on
// the diagonal c0–c2. The channel that would vanish on that diagonal is pinned to 1 at every vertex so
// the internal edge is never stroked; the other two channels carry the real barycentric coords.
// tri A = (c0,c1,c2): diagonal c2c0 is opposite c1 ⇒ pin channel 1.
// tri B = (c0,c2,c3): diagonal c0c2 is opposite c3 ⇒ pin channel 2 (the c3 channel here).
const EDGE_A = [
	[1, 1, 0], // c0
	[0, 1, 0], // c1
	[0, 1, 1], // c2
];
const EDGE_B = [
	[1, 0, 1], // c0
	[0, 1, 1], // c2
	[0, 0, 1], // c3
];

export interface SubRosaTile {
	protoId: number;
	corners: Vector[]; // 4 world corners
}

export interface SubRosaDrawParams {
	widthCss: number;
	heightCss: number;
	zoom: number; // px per world unit
	offsetX: number; // pan, centred CSS px, y down
	offsetY: number;
	rot: number; // view angle, radians
	centreX: number; // world point held at the view centre
	centreY: number;
	light: number; // HSL lightness 0..100
	/** HSL saturation 0..1. Defaults to the rhombic views' 0.58; the finite-patch views pass 1.0 with
	 *  light 80, which is exactly the atlas' HSB(h, 40, 100) tile fill in HSL terms. */
	sat?: number;
	/** Outline width in CSS px — the whole line across a shared edge, as /play's `lineWidth` means it.
	 *  0 disables outlines. The outline pass draws it centred on the edge; the wireframe fallback halves
	 *  it and scales to device px, since there each tile strokes inward from its own edge. Either way a
	 *  given width looks the same on a 1× and a 2× display. */
	strokePx: number;
	strokeRGBA: [number, number, number, number];
	clearRGBA?: [number, number, number, number]; // default transparent
}

// Retained-mode: uploadTiles() once per tile set, then draw() every frame with fresh view uniforms.
export class SubRosaGL {
	private gl: WebGL2RenderingContext;
	private prog: WebGLProgram;
	private posBuf: WebGLBuffer;
	private hueBuf: WebGLBuffer;
	private edgeBuf: WebGLBuffer;
	private vao: WebGLVertexArrayObject;
	private u: Record<string, WebGLUniformLocation | null> = {};
	private vertexCount = 0;
	private disposed = false;

	// The outline pass. `lineProg` is null only if its shaders failed to build, in which case the
	// renderer keeps working on the wireframe instead of throwing away the whole patch.
	private lineProg: WebGLProgram | null = null;
	private quadBuf: WebGLBuffer | null = null;
	private segBuf: WebGLBuffer | null = null;
	private lineVao: WebGLVertexArrayObject | null = null;
	private ul: Record<string, WebGLUniformLocation | null> = {};
	private edgeInstances = 0;

	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		const prog = link(gl, FILL_VERT, FILL_FRAG);
		if (!prog) throw new Error("subrosa renderer: shader compile/link failed");
		this.prog = prog;
		for (const name of ["uZoom", "uOffset", "uRot", "uCentre", "uHalf", "uLight", "uSat", "uStrokePx", "uStroke"]) {
			this.u[name] = gl.getUniformLocation(prog, name);
		}
		const aPos = gl.getAttribLocation(prog, "aPos");
		const aHue = gl.getAttribLocation(prog, "aHue");
		const aEdge = gl.getAttribLocation(prog, "aEdge");

		this.posBuf = gl.createBuffer();
		this.hueBuf = gl.createBuffer();
		this.edgeBuf = gl.createBuffer();
		this.vao = gl.createVertexArray();

		// Bake attribute layout into a VAO so each draw is bind-VAO + one drawArrays.
		gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
		gl.enableVertexAttribArray(aPos);
		gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.hueBuf);
		gl.enableVertexAttribArray(aHue);
		gl.vertexAttribPointer(aHue, 1, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuf);
		gl.enableVertexAttribArray(aEdge);
		// Edge channels are 0/1, so a normalized unsigned byte (255→1.0) is exact and 1/4 the memory
		// of a float — meaningful at ~1M tiles.
		gl.vertexAttribPointer(aEdge, 3, gl.UNSIGNED_BYTE, true, 0, 0);
		gl.bindVertexArray(null);

		this.initLinePass();
	}

	/** The outline pass' program, its unit quad and the VAO that binds one instance per polygon side. */
	private initLinePass(): void {
		const gl = this.gl;
		const prog = link(gl, LINE_VERT, LINE_FRAG);
		if (!prog) return; // wireframe fallback; the fill pass is unaffected
		this.lineProg = prog;
		for (const name of ["uZoom", "uOffset", "uRot", "uCentre", "uHalf", "uExtend", "uHalfWidth", "uFeather", "uStroke"]) {
			this.ul[name] = gl.getUniformLocation(prog, name);
		}
		const aQuad = gl.getAttribLocation(prog, "aQuad");
		const aSegA = gl.getAttribLocation(prog, "aSegA");
		const aSegB = gl.getAttribLocation(prog, "aSegB");

		this.quadBuf = gl.createBuffer();
		this.segBuf = gl.createBuffer();
		this.lineVao = gl.createVertexArray();

		gl.bindVertexArray(this.lineVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
		// Triangle-strip order for the four corners: (along, across).
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(aQuad);
		gl.vertexAttribPointer(aQuad, 2, gl.FLOAT, false, 0, 0);
		// One (ax, ay, bx, by) record per side, stepped once per instance.
		gl.bindBuffer(gl.ARRAY_BUFFER, this.segBuf);
		gl.enableVertexAttribArray(aSegA);
		gl.vertexAttribPointer(aSegA, 2, gl.FLOAT, false, 16, 0);
		gl.vertexAttribDivisor(aSegA, 1);
		gl.enableVertexAttribArray(aSegB);
		gl.vertexAttribPointer(aSegB, 2, gl.FLOAT, false, 16, 8);
		gl.vertexAttribDivisor(aSegB, 1);
		gl.bindVertexArray(null);
	}

	/**
	 * Hand the outline pass the sides of whatever was just uploaded. `null` (over budget, or no line
	 * program) leaves `edgeInstances` at 0, which is what makes draw() fall back to the wireframe.
	 */
	private setOutlineEdges(edges: Float32Array | null): void {
		const gl = this.gl;
		this.edgeInstances = 0;
		if (!edges || !this.lineProg || !this.segBuf) return;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.segBuf);
		gl.bufferData(gl.ARRAY_BUFFER, edges, gl.STATIC_DRAW);
		this.edgeInstances = edges.length / 4;
	}

	// Triangulate the patch into one flat buffer. hueOf maps a tile's protoId to its HSL hue (degrees).
	uploadTiles(tiles: SubRosaTile[], hueOf: (protoId: number) => number): void {
		const gl = this.gl;
		const n = tiles.length;
		const pos = new Float32Array(n * 12); // 6 verts × 2
		const hue = new Float32Array(n * 6);
		const edge = new Uint8Array(n * 18); // 6 verts × 3, normalized (255 → 1.0)
		let pi = 0, hi = 0, ei = 0;
		for (const t of tiles) {
			const c = t.corners;
			const h = hueOf(t.protoId);
			// Two triangles: (c0,c1,c2) then (c0,c2,c3). Guard against a non-quad defensively.
			const triA = [c[0], c[1], c[2]];
			const triB = [c[0], c[2], c[3 % c.length]];
			for (let k = 0; k < 3; k++) {
				pos[pi++] = triA[k].x; pos[pi++] = triA[k].y;
				hue[hi++] = h;
				edge[ei++] = EDGE_A[k][0] * 255; edge[ei++] = EDGE_A[k][1] * 255; edge[ei++] = EDGE_A[k][2] * 255;
			}
			for (let k = 0; k < 3; k++) {
				pos[pi++] = triB[k].x; pos[pi++] = triB[k].y;
				hue[hi++] = h;
				edge[ei++] = EDGE_B[k][0] * 255; edge[ei++] = EDGE_B[k][1] * 255; edge[ei++] = EDGE_B[k][2] * 255;
			}
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
		gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.hueBuf);
		gl.bufferData(gl.ARRAY_BUFFER, hue, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuf);
		gl.bufferData(gl.ARRAY_BUFFER, edge, gl.STATIC_DRAW);
		this.vertexCount = n * 6;
		this.setOutlineEdges(packOutlineEdges(tiles, (t) => t.corners));
	}

	/**
	 * The general-polygon upload: any simple polygon, convex or not, of any vertex count. Used by the
	 * finite-patch views (Penrose rhombi, the hat's 13-gons), where uploadTiles' fixed quad split does
	 * not apply. Each polygon is ear-clipped (lib/render/triangulate.ts) and its triangles carry the
	 * barycentric mask that keeps the wireframe on real polygon edges and off invented diagonals.
	 *
	 * `hueOf` runs once per polygon, not per vertex. Returns the vertex count uploaded.
	 */
	uploadPolygons<T extends { vertices: { x: number; y: number }[] }>(
		polys: readonly T[],
		hueOf: (poly: T, index: number) => number,
	): number {
		const gl = this.gl;
		// Exact total: an n-gon yields n−2 triangles, so 3(n−2) vertices.
		let verts = 0;
		for (const p of polys) verts += 3 * Math.max(0, p.vertices.length - 2);

		const pos = new Float32Array(verts * 2);
		const hue = new Float32Array(verts);
		const edge = new Uint8Array(verts * 3);
		let pi = 0, hi = 0, ei = 0;

		polys.forEach((poly, pIdx) => {
			const v = poly.vertices;
			const n = v.length;
			if (n < 3) return;
			const h = hueOf(poly, pIdx);
			const idx = triangulate(v);
			for (let t = 0; t < idx.length; t += 3) {
				const ia = idx[t], ib = idx[t + 1], ic = idx[t + 2];
				const mask = edgeMask(ia, ib, ic, n);
				const tri = [v[ia], v[ib], v[ic]];
				for (let k = 0; k < 3; k++) {
					pos[pi++] = tri[k].x;
					pos[pi++] = tri[k].y;
					hue[hi++] = h;
					edge[ei++] = mask[k * 3] * 255;
					edge[ei++] = mask[k * 3 + 1] * 255;
					edge[ei++] = mask[k * 3 + 2] * 255;
				}
			}
		});

		gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
		gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.hueBuf);
		gl.bufferData(gl.ARRAY_BUFFER, hue, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuf);
		gl.bufferData(gl.ARRAY_BUFFER, edge, gl.STATIC_DRAW);
		this.vertexCount = pi / 2;
		this.setOutlineEdges(packOutlineEdges(polys, (p) => p.vertices));
		return this.vertexCount;
	}

	// One frame. The caller owns the canvas backing-store size; we set the viewport from device px.
	draw(p: SubRosaDrawParams, dpr: number): void {
		const gl = this.gl;
		if (this.disposed || p.widthCss <= 0 || p.heightCss <= 0) return;
		gl.viewport(0, 0, Math.round(p.widthCss * dpr), Math.round(p.heightCss * dpr));
		const [cr, cg, cb, ca] = p.clearRGBA ?? [0, 0, 0, 0];
		gl.clearColor(cr, cg, cb, ca);
		gl.clear(gl.COLOR_BUFFER_BIT);
		if (this.vertexCount === 0) return;

		const outlined = this.edgeInstances > 0 && this.lineProg !== null;

		gl.useProgram(this.prog);
		gl.bindVertexArray(this.vao);
		gl.uniform1f(this.u.uZoom, p.zoom);
		gl.uniform2f(this.u.uOffset, p.offsetX, p.offsetY);
		gl.uniform1f(this.u.uRot, p.rot);
		gl.uniform2f(this.u.uCentre, p.centreX, p.centreY);
		gl.uniform2f(this.u.uHalf, p.widthCss / 2, p.heightCss / 2);
		gl.uniform1f(this.u.uLight, p.light);
		gl.uniform1f(this.u.uSat, p.sat ?? 0.58);
		// The wireframe's width, used only when the outline pass is not carrying this patch. CSS width →
		// device half-width: that shader measures distance in device px, and both tiles meeting at an edge
		// stroke inward, so each paints half the line.
		gl.uniform1f(this.u.uStrokePx, outlined ? 0 : p.strokePx * dpr * 0.5);
		gl.uniform4f(this.u.uStroke, p.strokeRGBA[0], p.strokeRGBA[1], p.strokeRGBA[2], p.strokeRGBA[3]);
		gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
		gl.bindVertexArray(null);

		if (!outlined || p.strokePx <= 0) return;

		// The outlines, over the fills. Blending is on for this pass only, and separate for alpha so the
		// canvas keeps a correct alpha channel where a stroke overhangs the patch boundary, these
		// contexts being created with premultipliedAlpha: false.
		const half = p.strokePx / 2;
		const feather = 0.5 / dpr; // half the AA ramp: one device px across, wherever the display sits
		gl.enable(gl.BLEND);
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.useProgram(this.lineProg);
		gl.bindVertexArray(this.lineVao);
		gl.uniform1f(this.ul.uZoom, p.zoom);
		gl.uniform2f(this.ul.uOffset, p.offsetX, p.offsetY);
		gl.uniform1f(this.ul.uRot, p.rot);
		gl.uniform2f(this.ul.uCentre, p.centreX, p.centreY);
		gl.uniform2f(this.ul.uHalf, p.widthCss / 2, p.heightCss / 2);
		gl.uniform1f(this.ul.uHalfWidth, half);
		gl.uniform1f(this.ul.uFeather, feather);
		gl.uniform1f(this.ul.uExtend, half + feather + 1);
		gl.uniform4f(this.ul.uStroke, p.strokeRGBA[0], p.strokeRGBA[1], p.strokeRGBA[2], p.strokeRGBA[3]);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.edgeInstances);
		gl.bindVertexArray(null);
		gl.disable(gl.BLEND);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		const gl = this.gl;
		gl.deleteProgram(this.prog);
		gl.deleteBuffer(this.posBuf);
		gl.deleteBuffer(this.hueBuf);
		gl.deleteBuffer(this.edgeBuf);
		gl.deleteVertexArray(this.vao);
		if (this.lineProg) gl.deleteProgram(this.lineProg);
		if (this.quadBuf) gl.deleteBuffer(this.quadBuf);
		if (this.segBuf) gl.deleteBuffer(this.segBuf);
		if (this.lineVao) gl.deleteVertexArray(this.lineVao);
		this.edgeInstances = 0;
	}
}
