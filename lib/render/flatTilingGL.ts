// The flat (Euclidean) WebGL2 rendering core, shared by the /play shader view
// (components/euclidean-canvas.tsx) and the theory-page preview cards
// (components/interactive-tiling-preview-card.tsx). Owns the GLSL sources — single source of truth so
// the two surfaces can never drift — plus compile/link helpers and FlatCellRenderer, a self-contained
// draw pipeline over a CellMesh (euclidean-canvas.tsx still runs its own inline plumbing; migrating it
// onto FlatCellRenderer is a welcome follow-up once its in-flight work lands).

import { Vector } from "@/classes/Vector";
import { TILE_PALETTE_GLSL, TILE_SAT_PCT } from "@/lib/render/tilePalette";
import type { CellMesh } from "@/lib/render/buildCellMesh";
import type { OrbitDotMesh } from "@/lib/render/buildOrbitDotMesh";
import { IDENTITY_DEFORM, computeFillGrid, fillGridInstances, wrapOffset, type Mat2 } from "@/lib/render/flatView";
import { ORBIT_DOT_RADIUS_PX, hoveredOrbitAt, screenToWorld, stepOrbitScales } from "@/lib/render/orbitHover";

// Selection-transition wave (M2), shared by the fill and stroke vertex shaders. A transcription of
// waveTileScale + WAVE_MIN_SCALE in lib/utils/tilingTransition.ts — KEEP THE TWO IN STEP. `phase` is +1
// grow-in / -1 collapse-out (0 = inactive, handled at the call site); `u` is the tile centroid's
// normalised screen distance from the canvas centre; `p` the phase progress in [0,1]. Returns the tile's
// [0,1] scale about its centroid. WAVE_MIN_SCALE (0.02) is applied by the caller so the tile is dropped
// (zero-area) instead of lingering as a stroke speck.
/** How many orbits get a hover scale (uOrbitScale, packed four to a vec4 so 256 cost 64 uniform vectors); an orbit
 *  past it stays at rest. At 32, with one shared slot for the rest, every orbit from the 32nd on grew together. */
export const ORBIT_MAX = 256;

// An orbit's hover scale, 1 for none (-1) and for one past ORBIT_MAX.
const ORBIT_SCALE_GLSL = `
uniform vec4 uOrbitScale[${ORBIT_MAX / 4}];
float orbitScale(float orbit) {
	int oi = int(floor(orbit + 0.5));
	return oi < 0 || oi >= ${ORBIT_MAX} ? 1.0 : uOrbitScale[oi >> 2][oi & 3];
}
`;

// Tile orbit mode (the Orbits overlay's tiles) colours the fills themselves, by an orbit id per vertex
// (aOrbit; -1 for none): the orbit's colour, faded toward the background as another orbit is hovered
// (uOrbitHover 0..1), and back to full strength for the hovered one (its uOrbitScale above 1). Hue =
// id·360/k, as orbitColor. Edges are marks of their own (ORBIT_VERT), with the same fade.
const ORBIT_TINT_GLSL = `
uniform float uOrbitK;
${ORBIT_SCALE_GLSL}
uniform float uOrbitHover;
vec3 orbitTint(float orbit, vec3 col, vec3 bg) {
	float lift = clamp(orbitScale(orbit) - 1.0, 0.0, 1.0);
	return mix(bg, col, 1.0 - 0.65 * uOrbitHover * (1.0 - lift));
}
`;

export const WAVE_GLSL = `
float waveTileScale(int phase, float u, float p) {
	float travel = 0.8; // WAVE_TRAVEL
	float local = clamp((p - clamp(u, 0.0, 1.0) * travel) / (1.0 - travel), 0.0, 1.0);
	float eased = local < 0.5 ? 4.0 * local * local * local : 1.0 - pow(-2.0 * local + 2.0, 3.0) / 2.0;
	return phase > 0 ? eased : 1.0 - eased;
}
`;

export const FILL_VERT = `#version 300 es
in vec2 aPos;
in float aHue;
in vec2 aInst;
in vec2 aCentroid;      // tile fan-apex centroid, for the selection-transition wave
in float aOrbit;        // tile orbit id in tile mode; a constant -1 everywhere else
uniform vec2 uOffset;   // wrapped pan, centred CSS px, y down
uniform float uZoom;
uniform float uRot;
uniform vec2 uV1;
uniform vec2 uV2;
uniform mat2 uDeform;   // world-space 2x2 (the sidebar's basis pad); identity = no deformation
uniform vec2 uHalf;     // canvas CSS half-size (w/2, h/2)
uniform int uWavePhase; // 0 inactive, +1 grow-in, -1 collapse-out
uniform float uWaveP;   // wave phase progress [0,1]
out float vHue;
out float vOrbit;
${WAVE_GLSL}
void main() {
	vOrbit = aOrbit;
	// Transcribes flatWorldToClip in lib/render/flatView.ts — keep the two in step.
	float c = cos(uRot), s = sin(uRot);
	vec2 pos = aPos;
	if (uWavePhase != 0) {
		// Scale the tile about its centroid. u = centroid's screen distance from centre / half-diagonal,
		// so the wave stays radial about the canvas centre under any pan/zoom/rotation (matches makeWaveScale).
		vec2 wc = uDeform * (aCentroid + aInst.x * uV1 + aInst.y * uV2);
		float csx = uOffset.x + uZoom * (c * wc.x + s * wc.y);
		float csy = uOffset.y + uZoom * (s * wc.x - c * wc.y);
		float dmax = max(1.0, length(uHalf));
		float scale = waveTileScale(uWavePhase, length(vec2(csx, csy)) / dmax, uWaveP);
		if (scale < 0.02) scale = 0.0; // WAVE_MIN_SCALE: collapse to a point (zero-area triangle)
		pos = aCentroid + scale * (aPos - aCentroid);
	}
	// uDeform is applied to the REPLICATED point. It is linear, so that is the same as deforming the cell
	// and the lattice basis separately — which is exactly what the CPU does when it sizes the instance
	// grid (computeFillGrid), so the two cannot disagree about where a copy lands.
	vec2 world = uDeform * (pos + aInst.x * uV1 + aInst.y * uV2);
	float sx = uOffset.x + uZoom * (c * world.x + s * world.y);
	float sy = uOffset.y + uZoom * (s * world.x - c * world.y);
	gl_Position = vec4(sx / uHalf.x, -sy / uHalf.y, 0.0, 1.0);
	vHue = aHue;
}
`;

export const FILL_FRAG = `#version 300 es
precision highp float;
in float vHue;
uniform float uHueOffset; // global hue rotation, degrees (the sidebar hue ring); tileFill wraps via mod
uniform float uTileSat;   // tile saturation 0..1 — the sidebar's Fill slider. Programs that draw tiles the
                          // slider does not govern still have to SET it; it has no safe default (0 is white),
                          // which is why the draw call falls back to TILE_SAT rather than leaving it unset.
uniform float uFillDim;   // 0 = full colour; 1 fades the tile toward uDimTarget for vertex-orbit mode (M3).
                          // Default 0 keeps every other consumer (theory cards, FlatCellRenderer) untouched.
uniform vec3 uDimTarget;  // the surface background colour to fade toward when dimming (theme-dependent)
in float vOrbit;
uniform int uOrbitMode;   // 1 = tile mode: each tile in its orbit's colour (0 everywhere else)
out vec4 frag;
${TILE_PALETTE_GLSL}
${ORBIT_TINT_GLSL}
void main() {
	if (uOrbitMode == 1) {
		vec3 col = vOrbit < -0.5 ? uDimTarget : tileFill(vOrbit * 360.0 / max(uOrbitK, 1.0));
		frag = vec4(orbitTint(vOrbit, col, uDimTarget), 1.0);
		return;
	}
	// tileFill is the shared palette (lib/render/tilePalette.ts), so this agrees with Tiling.show and the
	// inversive shader by construction instead of by hand. In orbit
	// mode (uFillDim=1) the tile fades to 0.3 of its colour over the surface background, OPAQUELY: p5 draws
	// the fill at alpha 0.3 over its background, which is exactly mix(bg, tile, 0.3). Doing it as an opaque
	// mix (not a translucent fragment) sidesteps the premultiplied-alpha double-fade on this alpha canvas.
	//
	// A NEGATIVE hue means ink: fill this prim with the near-black the tile edges use, ignoring the hue
	// ring. Brightness is pinned at 1.0 above, so no hue in [0,360) can produce a dark fill, and the
	// isohedral shelf's interior markings have to be neutral — they carry orientation in their shape, and
	// a second colour scale on top of the aspect tints only makes the tints harder to read. Same sentinel
	// the PeriodicCell IR already uses (see lib/render/periodicCell.ts), so the lens and the flat view
	// agree without a second convention.
	vec3 tile = vHue < 0.0 ? vec3(0.05, 0.05, 0.07) : tileFillAt(vHue + uHueOffset, uTileSat);
	frag = vec4(mix(uDimTarget, tile, 1.0 - 0.7 * uFillDim), 1.0);
}
`;

export const STROKE_VERT = `#version 300 es
in vec2 aPos;
in vec2 aNorm;    // world-space edge normal
in float aSide;   // signed half-width multiplier: ±1 for a tile edge, ±k for a stroke drawn k times
                  // thicker. It multiplies uHalfStrokePx directly below, so a magnitude other than 1 is
                  // a per-segment width, which is how the isohedral shelf's interior marks sit a little
                  // heavier than the tile edges without a second draw call.
in vec2 aInst;
in vec2 aCentroid;            // tile fan-apex centroid, for the selection-transition wave
uniform vec2 uOffset;
uniform float uZoom;
uniform float uRot;
uniform vec2 uV1;
uniform vec2 uV2;
uniform mat2 uDeform;   // world-space 2x2 (the sidebar's basis pad); identity = no deformation
uniform vec2 uHalf;
uniform float uHalfStrokePx;  // half stroke width, CSS px
uniform int uWavePhase;       // 0 inactive, +1 grow-in, -1 collapse-out
uniform float uWaveP;         // wave phase progress [0,1]
${WAVE_GLSL}
void main() {
	float c = cos(uRot), s = sin(uRot);
	vec2 pos = aPos;
	// The outline follows the SCALED tile (its position scales), but its width stays constant CSS px —
	// exactly as p5 draws the transition (strokeWeight is fixed; only the polygon it outlines shrinks).
	// strokeMul kills the outline push once the tile has collapsed, so no stroke speck lingers at the centroid.
	float strokeMul = 1.0;
	if (uWavePhase != 0) {
		vec2 wc = uDeform * (aCentroid + aInst.x * uV1 + aInst.y * uV2);
		float csx = uOffset.x + uZoom * (c * wc.x + s * wc.y);
		float csy = uOffset.y + uZoom * (s * wc.x - c * wc.y);
		float dmax = max(1.0, length(uHalf));
		float scale = waveTileScale(uWavePhase, length(vec2(csx, csy)) / dmax, uWaveP);
		if (scale < 0.02) { scale = 0.0; strokeMul = 0.0; } // WAVE_MIN_SCALE: drop the tile entirely
		pos = aCentroid + scale * (aPos - aCentroid);
	}
	vec2 world = uDeform * (pos + aInst.x * uV1 + aInst.y * uV2);
	// Same centred-screen map as the fill.
	float sx = uOffset.x + uZoom * (c * world.x + s * world.y);
	float sy = uOffset.y + uZoom * (s * world.x - c * world.y);
	// The outline direction comes from the edge TANGENT, not from the stored normal.
	//
	// Pushing the normal through the linear map is only right when that map is conformal, which
	// zoom*R*flip is and uDeform is not: under a shear, a normal maps to something that is no longer
	// perpendicular to the mapped edge, and the outline slides off its own edge. A tangent has no such
	// problem — it is a difference of two points, so any linear map carries it correctly — and the
	// perpendicular is then taken in SCREEN space where it is wanted.
	//
	// At uDeform = identity this is the previous formula exactly: the screen map L is a scaled reflection,
	// so L*J = -J*L for the quarter-turn J, and J*(L*J*n) = L*n.
	vec2 td = uDeform * vec2(-aNorm.y, aNorm.x);
	float tsx = uZoom * (c * td.x + s * td.y);
	float tsy = uZoom * (s * td.x - c * td.y);
	float tl = length(vec2(tsx, tsy));
	vec2 n = tl > 0.0 ? vec2(-tsy, tsx) / tl : vec2(0.0);
	// uHalfStrokePx is applied AFTER the whole map, so the outline is that many CSS px wide whatever
	// uDeform does: sheared tiles, uniform outlines.
	sx += aSide * uHalfStrokePx * strokeMul * n.x;
	sy += aSide * uHalfStrokePx * strokeMul * n.y;
	gl_Position = vec4(sx / uHalf.x, -sy / uHalf.y, 0.0, 1.0);
}
`;

export const STROKE_FRAG = `#version 300 es
precision highp float;
uniform vec3 uStroke;
uniform float uStrokeDim; // 0 = opaque; 1 fades the outline toward uDimTarget (vertex-orbit mode, with the fill)
uniform vec3 uDimTarget;  // surface background to fade toward when dimming (matches the fill)
out vec4 frag;
void main() { frag = vec4(mix(uDimTarget, uStroke, 1.0 - 0.7 * uStrokeDim), 1.0); }
`;

// Points (showPolygonPoints): each centroid/halfway/vertex is a quad billboarded to a constant CSS-px
// radius; the fragment shader carves an anti-aliased disk with a dark rim out of it. Instanced by the
// same lattice grid as the fill, so every replicated cell shows its dots. aCorner is the unit-quad corner
// in [-1,1]; the world point maps like the fill, then the corner pushes by uRadiusPx in screen space.

/** Disk radius in CSS px, shared by /play's inline pipeline and FlatCellRenderer so a preview card's
 *  dots are the same size as the ones on /play. p5 drew a 5px-diameter dot (5/zoom world units). */
export const POINT_DOT_RADIUS_PX = 2.5;

export const POINTS_VERT = `#version 300 es
in vec2 aPos;
in vec2 aCorner;   // unit-quad corner in [-1,1]
in vec3 aColor;
in vec2 aInst;
uniform vec2 uOffset;
uniform float uZoom;
uniform float uRot;
uniform vec2 uV1;
uniform vec2 uV2;
uniform mat2 uDeform;   // world-space 2x2 (the sidebar's basis pad); identity = no deformation
uniform vec2 uHalf;
uniform float uRadiusPx; // disk radius, CSS px
out vec2 vCorner;
out vec3 vColor;
void main() {
	vec2 world = uDeform * (aPos + aInst.x * uV1 + aInst.y * uV2);
	float c = cos(uRot), s = sin(uRot);
	float sx = uOffset.x + uZoom * (c * world.x + s * world.y);
	float sy = uOffset.y + uZoom * (s * world.x - c * world.y);
	sx += aCorner.x * uRadiusPx;
	sy += aCorner.y * uRadiusPx;
	gl_Position = vec4(sx / uHalf.x, -sy / uHalf.y, 0.0, 1.0);
	vCorner = aCorner;
	vColor = aColor;
}
`;

export const POINTS_FRAG = `#version 300 es
precision highp float;
in vec2 vCorner;
in vec3 vColor;
out vec4 frag;
void main() {
	float d = length(vCorner);              // 0 at centre, 1 at the disk edge
	float aa = fwidth(d);
	float alpha = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
	if (alpha <= 0.0) discard;
	float ring = smoothstep(0.6, 0.72, d);  // dark rim, matching the p5 dot's 1px black border
	frag = vec4(mix(vColor, vec3(0.0), ring), alpha);
}
`;

// The Orbits overlay's marks (OrbitMarkPass): a vertex as a disk, an edge as a bar with round caps, both
// a capsule around the segment aPos-aEnd (a vertex has aEnd = aPos). The GPU port of
// Tiling.drawVertexOrbits and drawFeatureOrbits: coloured by orbit id (hue = id·360/k, as orbitColor) and
// grown per orbit on hover, uOrbitScale[id] scaling the radius (1 at rest, up to ORBIT_HOVER_GROW). Drawn
// in two layers, the orbits at rest and then the lifted ones, so a hovered edge lies over its neighbours
// instead of under whichever was drawn later. Instanced by the fill's lattice grid.
export const ORBIT_VERT = `#version 300 es
in vec2 aPos;
in vec2 aEnd;      // the edge's other end; aPos again for a vertex
in vec2 aCorner;   // unit-quad corner in [-1,1]: x picks the end and reaches past it by the radius, y the side
in float aOrbit;   // orbit id
in vec2 aInst;
uniform vec2 uOffset;
uniform float uZoom;
uniform float uRot;
uniform vec2 uV1;
uniform vec2 uV2;
uniform mat2 uDeform;   // world-space 2x2 (the sidebar's basis pad); identity = no deformation
uniform vec2 uHalf;
uniform float uRadiusPx;          // base radius (a dot's, or half an edge's width), CSS px
uniform float uK;                 // orbit count, for the equidistant hue
${ORBIT_SCALE_GLSL}
uniform int uLayer;     // 1: the orbits at rest; 2: the lifted ones (scale above 1)
uniform float uEdge;    // 1 for edges: a shade darker, faded by a hover, no rim
uniform float uFade;    // how far a hover fades the other orbits toward uDimTarget
uniform vec3 uDimTarget;
out vec2 vLocal;   // CSS px from the mark's first end: x along it, y across
out float vLen;    // the segment's screen length, CSS px
out float vR;      // the radius, CSS px
out vec3 vCol;
${TILE_PALETTE_GLSL}
vec2 screen(vec2 p) {
	vec2 w = uDeform * (p + aInst.x * uV1 + aInst.y * uV2);
	float c = cos(uRot), s = sin(uRot);
	return vec2(uOffset.x + uZoom * (c * w.x + s * w.y), uOffset.y + uZoom * (s * w.x - c * w.y));
}
void main() {
	float scale = orbitScale(aOrbit); // per-orbit hover-grow scale (1 at rest)
	float lift = clamp(scale - 1.0, 0.0, 1.0);
	if ((uLayer == 2) != (lift > 0.0)) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // not this layer's: outside the clip volume
		return;
	}
	vec2 a = screen(aPos), b = screen(aEnd);
	float len = length(b - a);
	vec2 t = len > 1e-4 ? (b - a) / len : vec2(1.0, 0.0);
	vec2 n = vec2(-t.y, t.x);
	float r = uRadiusPx * scale;
	vec2 p = (aCorner.x < 0.0 ? a : b) + r * (aCorner.x * t + aCorner.y * n);
	gl_Position = vec4(p.x / uHalf.x, -p.y / uHalf.y, 0.0, 1.0);
	vLocal = vec2(dot(p - a, t), dot(p - a, n));
	vLen = len;
	vR = r;
	vec3 col = mix(1.0, 0.8, uEdge) * tileFill(aOrbit * 360.0 / max(uK, 1.0));
	vCol = mix(uDimTarget, col, 1.0 - 0.65 * uFade * (1.0 - lift));
}
`;

export const ORBIT_FRAG = `#version 300 es
precision highp float;
uniform float uEdge;
in vec2 vLocal;
in float vLen;
in float vR;
in vec3 vCol;
out vec4 frag;
void main() {
	// distance to the segment in radii: 0 on it, 1 at the mark's outline (a disk when vLen is 0)
	float d = length(vec2(vLocal.x - clamp(vLocal.x, 0.0, vLen), vLocal.y)) / vR;
	float aa = fwidth(d);
	float alpha = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
	if (alpha <= 0.0) discard;
	float ring = (1.0 - uEdge) * smoothstep(0.62, 0.76, d); // a dot's black outline, as drawVertexOrbits' stroke
	frag = vec4(mix(vCol, vec3(0.0), ring), alpha);
}
`;

/** Floats per vertex of an orbit-mark buffer: x, y, end x, end y, corner x, corner y, orbit. */
export const ORBIT_MARK_FLOATS = 7;

export interface OrbitMarkDraw {
	inst: WebGLBuffer; // the fill's lattice instance grid
	instCount: number;
	offset: { x: number; y: number }; // wrapped pan, centred CSS px
	zoom: number;
	rot: number; // radians
	v1: [number, number];
	v2: [number, number];
	deform: Float32List;
	width: number; // CSS px
	height: number;
	k: number; // orbit count of the kind drawn
	scales: Float32Array; // stepOrbitScales' per-orbit scales
	radiusPx: number;
	dim: [number, number, number]; // what a hover fades the other edges toward
}

/** The vertex dots and edge bars of an orbit mesh: one program, one buffer per kind. Shared by /play
 *  (euclidean-canvas.tsx) and FlatCellRenderer. */
export class OrbitMarkPass {
	private gl: WebGL2RenderingContext;
	private prog: WebGLProgram;
	private bufs: Record<"vertex" | "edge", WebGLBuffer>;
	private counts = { vertex: 0, edge: 0 };
	private u: Record<string, WebGLUniformLocation | null> = {};
	private a: Record<string, number> = {};

	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		const prog = linkProgram(gl, ORBIT_VERT, ORBIT_FRAG);
		if (!prog) throw new Error("orbit mark program failed to link");
		this.prog = prog;
		this.bufs = { vertex: gl.createBuffer(), edge: gl.createBuffer() };
		for (const name of ["uOffset", "uZoom", "uRot", "uV1", "uV2", "uDeform", "uHalf", "uRadiusPx", "uK"])
			this.u[name] = gl.getUniformLocation(prog, name);
		for (const name of ["uOrbitScale", "uLayer", "uEdge", "uFade", "uDimTarget"])
			this.u[name] = gl.getUniformLocation(prog, name);
		for (const name of ["aPos", "aEnd", "aCorner", "aOrbit", "aInst"]) this.a[name] = gl.getAttribLocation(prog, name);
	}

	/** Upload the dots and edge bars of an orbit mesh, or clear them. */
	upload(mesh: OrbitDotMesh | null): void {
		const gl = this.gl;
		for (const kind of ["vertex", "edge"] as const) {
			const marks = kind === "vertex" ? mesh?.marks : mesh?.edges?.marks;
			this.counts[kind] = marks ? marks.length / ORBIT_MARK_FLOATS : 0;
			if (!marks) continue;
			gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[kind]);
			gl.bufferData(gl.ARRAY_BUFFER, marks, gl.STATIC_DRAW);
		}
	}

	/** Paint one kind over the frame: the orbits at rest, then the lifted ones on top. No VAOs, so every
	 *  attribute is rebound here, as the other passes do. */
	draw(kind: "vertex" | "edge", p: OrbitMarkDraw): void {
		const gl = this.gl,
			A = this.a,
			U = this.u;
		if (!this.counts[kind]) return;
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.useProgram(this.prog);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[kind]);
		const fields = [
			["aPos", 2],
			["aEnd", 2],
			["aCorner", 2],
			["aOrbit", 1],
		] as const;
		let at = 0;
		for (const [name, size] of fields) {
			gl.enableVertexAttribArray(A[name]);
			gl.vertexAttribPointer(A[name], size, gl.FLOAT, false, ORBIT_MARK_FLOATS * 4, at * 4);
			gl.vertexAttribDivisor(A[name], 0);
			at += size;
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, p.inst);
		gl.enableVertexAttribArray(A.aInst);
		gl.vertexAttribPointer(A.aInst, 2, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(A.aInst, 1);
		gl.uniform2f(U.uOffset, p.offset.x, p.offset.y);
		gl.uniform1f(U.uZoom, p.zoom);
		gl.uniform1f(U.uRot, p.rot);
		gl.uniform2f(U.uV1, p.v1[0], p.v1[1]);
		gl.uniform2f(U.uV2, p.v2[0], p.v2[1]);
		gl.uniformMatrix2fv(U.uDeform, false, p.deform);
		gl.uniform2f(U.uHalf, p.width / 2, p.height / 2);
		gl.uniform1f(U.uRadiusPx, p.radiusPx);
		gl.uniform1f(U.uK, p.k);
		gl.uniform4fv(U.uOrbitScale, p.scales);
		gl.uniform1f(U.uEdge, kind === "edge" ? 1 : 0);
		// edges fade the others by how far the hover has lifted its orbit; dots grow, and nothing fades
		gl.uniform1f(U.uFade, kind === "edge" ? Math.min(1, Math.max(0, ...Array.from(p.scales, (s) => s - 1))) : 0);
		gl.uniform3f(U.uDimTarget, p.dim[0], p.dim[1], p.dim[2]);
		for (const layer of [1, 2]) {
			gl.uniform1i(U.uLayer, layer);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, this.counts[kind], p.instCount);
		}
	}

	dispose(): void {
		this.gl.deleteProgram(this.prog);
		this.gl.deleteBuffer(this.bufs.vertex);
		this.gl.deleteBuffer(this.bufs.edge);
	}
}

/** Pin a per-vertex attribute to one value for a draw with no buffer for it (aOrbit outside tile mode).
 *  There are no VAOs, so a location another pass left enabled would otherwise feed this draw. */
export function constantAttrib(gl: WebGL2RenderingContext, loc: number | undefined, value: number): void {
	if (loc == null || loc < 0) return;
	gl.disableVertexAttribArray(loc);
	gl.vertexAttrib1f(loc, value);
}

export function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
	const sh = gl.createShader(type);
	if (!sh) return null;
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		console.error("flat shader compile failed:", gl.getShaderInfoLog(sh));
		gl.deleteShader(sh);
		return null;
	}
	return sh;
}

export function linkProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram | null {
	const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
	const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
	if (!vs || !fs) return null;
	const prog = gl.createProgram();
	gl.attachShader(prog, vs);
	gl.attachShader(prog, fs);
	gl.linkProgram(prog);
	// Shaders can be flagged for deletion once linked; the program keeps them alive.
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
		console.error("flat program link failed:", gl.getProgramInfoLog(prog));
		gl.deleteProgram(prog);
		return null;
	}
	return prog;
}

export interface FlatDrawParams {
	width: number; // CSS px
	height: number; // CSS px
	offset: { x: number; y: number }; // UNWRAPPED pan, centred CSS px, y down (wrap applied here)
	zoom: number;
	rotationDeg: number;
	lineWidth: number; // CSS px; 0 disables the stroke pass
	showFill: boolean;
	strokeRGB: [number, number, number]; // 0..1
	hueOffsetDeg?: number; // global fill-hue rotation (degrees); omitted ⇒ 0 (theory cards)
	/** Tile saturation 0–100, the sidebar's Fill slider. Omitted ⇒ the palette default, which is what
	 *  the theory cards and every other non-/play caller want. 0 is not a value to pass here: it is
	 *  a white fill, and "no fill" is the caller's job to skip. */
	fillSatPct?: number;
	/** Pointer position in centred CSS px, y down, or null when it is off the surface. Only read when
	 *  an orbit mesh is uploaded; the renderer converts it to world space itself, so a caller never has
	 *  to reproduce the shader's transform. */
	orbitHoverPx?: { x: number; y: number } | null;
	/**
	 * Told which orbit the pointer is over, or -1 for none, whenever that answer CHANGES. The
	 * renderer already computes it for the dot easing; without this it stays inside the frame loop,
	 * and a caller wanting to react to it would have to reimplement the hit test against the same
	 * mesh in the same world space, which is two copies of a thing that must not disagree.
	 */
	onOrbitHover?: (orbit: number) => void;
	/**
	 * World-space 2x2 linear deformation, column-major [a, b, c, d] — the sidebar's basis pad
	 * (lib/render/basisPad.ts). Omitted means the identity, which is what every preview card wants.
	 *
	 * A mat2 uniform that is never set reads as all zeros in GLSL, i.e. every vertex at the origin and a
	 * blank card, so this is uploaded on every pass whether or not anything is deforming.
	 */
	deform?: Mat2;
	/** Colour the tiles fade toward in orbit mode, 0..1. Defaults to white. */
	dimTargetRGB?: [number, number, number];
	/** Force the same fade with no orbit mesh loaded. The symmetry-elements overlay wants it: colour
	 *  has to belong to the axes and rotation centres drawn on top, which is why /play's p5 view
	 *  swaps in drawTilingPlain there. Dimming the shader fill is this view's equivalent. */
	dimFill?: boolean;
	/** /play's `p`: a disk on every centroid, edge halfway and vertex of the mesh. */
	showPoints?: boolean;
	/**
	 * Draw ONE copy of the mesh instead of a lattice of it — for a cell whose polygons are a finite
	 * patch, not a repeat (a seed; see lib/render/seedPatch.ts).
	 *
	 * It also turns the pan wrap off. The wrap folds the offset back by whole lattice vectors so a
	 * fixed instance grid always covers the viewport, which is invisible while the copies are
	 * indistinguishable and is a teleport as soon as there is only one.
	 */
	single?: boolean;
}

// Retained-mode instanced renderer over one CellMesh: upload the cell once, then every frame is two
// instanced draws with fresh uniforms. Mirrors euclidean-canvas.tsx's inline pipeline exactly.
export class FlatCellRenderer {
	private gl: WebGL2RenderingContext;
	private fillProg: WebGLProgram;
	private strokeProg: WebGLProgram;
	private posBuf: WebGLBuffer;
	private hueBuf: WebGLBuffer;
	private instBuf: WebGLBuffer;
	private centroidBuf: WebGLBuffer;
	private strokePosBuf: WebGLBuffer;
	private strokeNormBuf: WebGLBuffer;
	private strokeSideBuf: WebGLBuffer;
	private strokeCentroidBuf: WebGLBuffer;
	private fillU: Record<string, WebGLUniformLocation | null> = {};
	private fillA: Record<string, number> = {};
	private strokeU: Record<string, WebGLUniformLocation | null> = {};
	private strokeA: Record<string, number> = {};
	private mesh: CellMesh | null = null;
	private inst = { key: "", count: 0 };
	private disposed = false;
	// Vertex-orbit dots, drawn over the dimmed fill and sharing the fill's instance grid. Inert until
	// uploadOrbitMesh() supplies a mesh.
	private orbits: OrbitMarkPass;
	private orbitMesh: OrbitDotMesh | null = null;
	private orbitScales: number[] = [];
	/** Last orbit reported to `onOrbitHover`, so the callback fires on changes and not every frame. */
	private lastHoveredOrbit = -1;
	// Polygon points: the fourth program, from the same shaders and mesh fields /play's inline pipeline
	// uses (euclidean-canvas.tsx). Uploaded with the mesh, drawn only when the caller asks.
	private pointsProg: WebGLProgram;
	private pointsPosBuf: WebGLBuffer;
	private pointsCornerBuf: WebGLBuffer;
	private pointsColorBuf: WebGLBuffer;
	private pointsU: Record<string, WebGLUniformLocation | null> = {};
	private pointsA: Record<string, number> = {};
	// TEMPORARY (stroke-invisible investigation): what the last draw() actually issued, so the theory
	// card's ?gldebug overlay can report whether the stroke pass ran at all. Remove with that overlay.
	lastDraw: { fillVerts: number; strokeVerts: number; instances: number; strokePx: number } | null = null;

	// Throws on shader/link failure so callers can fall back (e.g. a static placeholder card).
	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		const fillProg = linkProgram(gl, FILL_VERT, FILL_FRAG);
		const strokeProg = linkProgram(gl, STROKE_VERT, STROKE_FRAG);
		const pointsProg = linkProgram(gl, POINTS_VERT, POINTS_FRAG);
		if (!fillProg || !strokeProg || !pointsProg) throw new Error("flat renderer: shader compile/link failed");
		this.fillProg = fillProg;
		this.strokeProg = strokeProg;
		this.orbits = new OrbitMarkPass(gl);
		this.pointsProg = pointsProg;

		// uWavePhase/uWaveP are set explicitly (to "wave off"), not left at their default-zero,
		// and aCentroid is bound even though the wave is off here: both shaders declare aCentroid as an
		// active attribute, and leaving an active attribute's array disabled is the one thing this
		// renderer did that euclidean-canvas.tsx's pipeline does not. Some drivers tolerate it; others
		// drop the draw, which showed up as strokeless (flat-filled) theory cards on Apple/ANGLE Metal
		// while /play — which binds aCentroid in both passes — rendered correctly on the same GPU.
		for (const name of [
			"uOffset",
			"uZoom",
			"uRot",
			"uV1",
			"uV2",
			"uDeform",
			"uHalf",
			"uHueOffset",
			"uTileSat",
			"uWavePhase",
			"uWaveP",
			"uFillDim",
			"uDimTarget",
		]) {
			this.fillU[name] = gl.getUniformLocation(fillProg, name);
		}
		for (const name of ["aPos", "aHue", "aInst", "aCentroid", "aOrbit"]) {
			this.fillA[name] = gl.getAttribLocation(fillProg, name);
		}
		for (const name of [
			"uOffset",
			"uZoom",
			"uRot",
			"uV1",
			"uV2",
			"uDeform",
			"uHalf",
			"uHalfStrokePx",
			"uStroke",
			"uWavePhase",
			"uWaveP",
			"uStrokeDim",
			"uDimTarget",
		]) {
			this.strokeU[name] = gl.getUniformLocation(strokeProg, name);
		}
		for (const name of ["aPos", "aNorm", "aSide", "aInst", "aCentroid"]) {
			this.strokeA[name] = gl.getAttribLocation(strokeProg, name);
		}
		for (const name of ["uOffset", "uZoom", "uRot", "uV1", "uV2", "uDeform", "uHalf", "uRadiusPx"]) {
			this.pointsU[name] = gl.getUniformLocation(pointsProg, name);
		}
		for (const name of ["aPos", "aCorner", "aColor", "aInst"]) {
			this.pointsA[name] = gl.getAttribLocation(pointsProg, name);
		}

		this.pointsPosBuf = gl.createBuffer();
		this.pointsCornerBuf = gl.createBuffer();
		this.pointsColorBuf = gl.createBuffer();
		this.posBuf = gl.createBuffer();
		this.hueBuf = gl.createBuffer();
		this.instBuf = gl.createBuffer();
		this.centroidBuf = gl.createBuffer();
		this.strokePosBuf = gl.createBuffer();
		this.strokeNormBuf = gl.createBuffer();
		this.strokeSideBuf = gl.createBuffer();
		this.strokeCentroidBuf = gl.createBuffer();
	}

	// TEMPORARY (stroke-invisible investigation): the linked attribute locations for both programs.
	// A -1 for any stroke attribute means the driver dropped it, which collapses every stroke quad to
	// zero width and renders the tiles as flat fills. Remove with the ?gldebug overlay.
	attribReport(): string {
		const f = ["aPos", "aHue", "aInst", "aCentroid"].map((n) => `${n}=${this.fillA[n]}`).join(" ");
		const s = ["aPos", "aNorm", "aSide", "aInst", "aCentroid"].map((n) => `${n}=${this.strokeA[n]}`).join(" ");
		return `fill  ${f}\nstroke ${s}`;
	}

	uploadMesh(mesh: CellMesh): void {
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.fillVerts, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.hueBuf);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.fillHue, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.centroidBuf);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.fillCentroid, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.strokeCentroidBuf);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokeCentroid, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.strokePosBuf);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokePos, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.strokeNormBuf);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokeNorm, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.strokeSideBuf);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokeSide, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.pointsPosBuf);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.pointPos, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.pointsCornerBuf);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.pointCorner, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.pointsColorBuf);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.pointColor, gl.STATIC_DRAW);
		this.mesh = mesh;
		this.inst = { key: "", count: 0 }; // force an instance rebuild for the new basis
	}

	/** Supply (or clear) the vertex-orbit dots. With a mesh uploaded, draw() dims the tiles and paints
	 *  the dots over them, exactly as /play does in orbit mode. */
	uploadOrbitMesh(mesh: OrbitDotMesh | null): void {
		this.orbitMesh = mesh;
		this.orbitScales = []; // a new mesh means a new orbit count; drop the eased state
		// `lastHoveredOrbit` is deliberately NOT reset here. It is the record of what the caller was
		// last told, and clearing the mesh has not told them anything yet — zeroing it makes the next
		// draw believe -1 was already reported, so a caller that lit something up on hover keeps it lit
		// after the overlay is switched off, with no dots left on screen to explain why. draw() sees the
		// mismatch and reports the change.
		this.orbits.upload(mesh);
	}

	// One frame. The caller owns canvas backing-size/viewport management (DPR differs per surface).
	draw(p: FlatDrawParams): void {
		const gl = this.gl;
		const mesh = this.mesh;
		if (this.disposed || !mesh || p.width <= 0 || p.height <= 0) return;

		const rot = (p.rotationDeg * Math.PI) / 180;
		const v1 = new Vector(mesh.v1[0], mesh.v1[1]);
		const v2 = new Vector(mesh.v2[0], mesh.v2[1]);

		// Instance grid: the (i,j) copies that actually meet the viewport, or the single copy (0,0) when
		// the mesh is a finite patch. computeFillGrid gives per-row column spans instead of a bounding
		// rectangle, so a sheared or deformed lattice costs what it covers. Rebuild only when the shape
		// changes; `key` is the cheap signature of that (row range + total), since spans have no (Ri, Rj).
		const grid = p.single
			? null
			: computeFillGrid(v1, v2, mesh.det, p.zoom, p.width, p.height, rot, mesh.extent, p.deform);
		const key = grid ? `${grid.iLo}:${grid.iHi}:${grid.count}` : "single";
		if (key !== this.inst.key) {
			const inst = grid ? fillGridInstances(grid) : new Float32Array([0, 0]);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
			gl.bufferData(gl.ARRAY_BUFFER, inst, gl.DYNAMIC_DRAW);
			this.inst = { key, count: inst.length / 2 };
		}

		// Wrapped pan keeps the offset bounded so the fixed instance grid always covers the viewport.
		// A single copy has nothing to wrap onto: folding its offset by a lattice vector would jump the
		// patch off-centre instead of leaving the picture unchanged.
		const draw = p.single
			? new Vector(p.offset.x, p.offset.y)
			: wrapOffset(new Vector(p.offset.x, p.offset.y), v1, v2, mesh.det, p.zoom, rot, p.deform).draw;

		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		// Orbit mode is simply "a dot mesh is loaded": the tiles fade back so the dots read as the
		// subject, matching euclidean-canvas.tsx's showVertexOrbits branch.
		const orbitMesh = this.orbitMesh;
		const orbitMode = orbitMesh != null && orbitMesh.vertexCount > 0;
		// The fill fades for the orbit dots OR because the caller asked (symmetry elements). The dot
		// pass below still keys on orbitMode alone, so dimFill never conjures dots.
		const dimmed = orbitMode || p.dimFill === true;
		const dim = p.dimTargetRGB ?? ([1, 1, 1] as [number, number, number]);
		const deform = (p.deform ?? IDENTITY_DEFORM) as unknown as Float32List;

		// No VAOs: both programs share the default VAO and the instance buffer, so EVERY attribute must
		// be fully rebound (bindBuffer + vertexAttribPointer + vertexAttribDivisor) before its own draw
		// every frame — the two programs' attribute locations aren't guaranteed disjoint.
		if (p.showFill) {
			gl.useProgram(this.fillProg);
			const A = this.fillA,
				U = this.fillU;
			gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
			gl.enableVertexAttribArray(A.aPos);
			gl.vertexAttribPointer(A.aPos, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aPos, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.hueBuf);
			gl.enableVertexAttribArray(A.aHue);
			gl.vertexAttribPointer(A.aHue, 1, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aHue, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.centroidBuf);
			gl.enableVertexAttribArray(A.aCentroid);
			gl.vertexAttribPointer(A.aCentroid, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aCentroid, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
			gl.enableVertexAttribArray(A.aInst);
			gl.vertexAttribPointer(A.aInst, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aInst, 1);
			constantAttrib(gl, A.aOrbit, -1);
			gl.uniform2f(U.uOffset, draw.x, draw.y);
			gl.uniform1f(U.uZoom, p.zoom);
			gl.uniform1f(U.uRot, rot);
			gl.uniform2f(U.uV1, mesh.v1[0], mesh.v1[1]);
			gl.uniform2f(U.uV2, mesh.v2[0], mesh.v2[1]);
			gl.uniformMatrix2fv(U.uDeform, false, deform);
			gl.uniform2f(U.uHalf, p.width / 2, p.height / 2);
			gl.uniform1f(U.uHueOffset, p.hueOffsetDeg ?? 0);
			gl.uniform1f(U.uTileSat, (p.fillSatPct ?? TILE_SAT_PCT) / 100);
			gl.uniform1i(U.uWavePhase, 0); // this renderer never runs the selection wave
			gl.uniform1f(U.uWaveP, 0);
			gl.uniform1f(U.uFillDim, dimmed ? 1 : 0);
			gl.uniform3f(U.uDimTarget, dim[0], dim[1], dim[2]);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.fillVertexCount, this.inst.count);
		}

		if (p.lineWidth > 0 && mesh.strokeVertexCount > 0) {
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.useProgram(this.strokeProg);
			const A = this.strokeA,
				U = this.strokeU;
			gl.bindBuffer(gl.ARRAY_BUFFER, this.strokePosBuf);
			gl.enableVertexAttribArray(A.aPos);
			gl.vertexAttribPointer(A.aPos, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aPos, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.strokeNormBuf);
			gl.enableVertexAttribArray(A.aNorm);
			gl.vertexAttribPointer(A.aNorm, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aNorm, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.strokeSideBuf);
			gl.enableVertexAttribArray(A.aSide);
			gl.vertexAttribPointer(A.aSide, 1, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aSide, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.strokeCentroidBuf);
			gl.enableVertexAttribArray(A.aCentroid);
			gl.vertexAttribPointer(A.aCentroid, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aCentroid, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
			gl.enableVertexAttribArray(A.aInst);
			gl.vertexAttribPointer(A.aInst, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aInst, 1);
			gl.uniform2f(U.uOffset, draw.x, draw.y);
			gl.uniform1f(U.uZoom, p.zoom);
			gl.uniform1f(U.uRot, rot);
			gl.uniform2f(U.uV1, mesh.v1[0], mesh.v1[1]);
			gl.uniform2f(U.uV2, mesh.v2[0], mesh.v2[1]);
			gl.uniformMatrix2fv(U.uDeform, false, deform);
			gl.uniform2f(U.uHalf, p.width / 2, p.height / 2);
			gl.uniform1f(U.uHalfStrokePx, p.lineWidth * 0.5);
			gl.uniform3f(U.uStroke, p.strokeRGB[0], p.strokeRGB[1], p.strokeRGB[2]);
			gl.uniform1i(U.uWavePhase, 0);
			gl.uniform1f(U.uWaveP, 0);
			// The outline fades with the fill for the orbit dots, but NOT for dimFill: the symmetry view
			// keeps its tile edges crisp under the axes (that is what /play's drawTilingPlain paints —
			// pale tiles, thin dark edges), and a faded edge would read as a second overlay.
			gl.uniform1f(U.uStrokeDim, orbitMode ? 1 : 0);
			gl.uniform3f(U.uDimTarget, dim[0], dim[1], dim[2]);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.strokeVertexCount, this.inst.count);
			this.lastDraw = {
				fillVerts: p.showFill ? mesh.fillVertexCount : 0,
				strokeVerts: mesh.strokeVertexCount,
				instances: this.inst.count,
				strokePx: p.lineWidth,
			};
		} else {
			this.lastDraw = {
				fillVerts: p.showFill ? mesh.fillVertexCount : 0,
				strokeVerts: 0,
				instances: this.inst.count,
				strokePx: p.lineWidth,
			};
		}

		// Polygon points (/play's `p`): a disk on every centroid, halfway and vertex, over the tiles and
		// under the orbit dots — the order euclidean-canvas.tsx draws them in. Same shaders, same mesh
		// fields, same radius, so the card and /play paint the same dots.
		if (p.showPoints && mesh.pointVertexCount > 0) {
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.useProgram(this.pointsProg);
			const A = this.pointsA,
				U = this.pointsU;
			gl.bindBuffer(gl.ARRAY_BUFFER, this.pointsPosBuf);
			gl.enableVertexAttribArray(A.aPos);
			gl.vertexAttribPointer(A.aPos, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aPos, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.pointsCornerBuf);
			gl.enableVertexAttribArray(A.aCorner);
			gl.vertexAttribPointer(A.aCorner, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aCorner, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.pointsColorBuf);
			gl.enableVertexAttribArray(A.aColor);
			gl.vertexAttribPointer(A.aColor, 3, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aColor, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
			gl.enableVertexAttribArray(A.aInst);
			gl.vertexAttribPointer(A.aInst, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aInst, 1);
			gl.uniform2f(U.uOffset, draw.x, draw.y);
			gl.uniform1f(U.uZoom, p.zoom);
			gl.uniform1f(U.uRot, rot);
			gl.uniform2f(U.uV1, mesh.v1[0], mesh.v1[1]);
			gl.uniform2f(U.uV2, mesh.v2[0], mesh.v2[1]);
			gl.uniformMatrix2fv(U.uDeform, false, deform);
			gl.uniform2f(U.uHalf, p.width / 2, p.height / 2);
			gl.uniform1f(U.uRadiusPx, POINT_DOT_RADIUS_PX);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.pointVertexCount, this.inst.count);
		}

		// Vertex-orbit dots, over the dimmed tiles. The hit-test and the easing are the shared ones in
		// lib/render/orbitHover.ts, so a card's hover behaves the same as /play's down to the frame.
		// Orbit mode off, or no mesh: nobody is over an orbit, and a caller told otherwise on the last
		// frame has to hear that it ended. Without this, pressing `o` again leaves whatever was
		// highlighted highlighted, with no dots on screen to explain why.
		if ((!orbitMode || !orbitMesh) && this.lastHoveredOrbit !== -1) {
			this.lastHoveredOrbit = -1;
			p.onOrbitHover?.(-1);
		}
		if (orbitMode && orbitMesh) {
			const world = p.orbitHoverPx
				? screenToWorld(p.orbitHoverPx.x, p.orbitHoverPx.y, draw, p.zoom, rot, p.deform)
				: null;
			const hovered = hoveredOrbitAt(orbitMesh.dots, world, mesh.v1, mesh.v2, mesh.det, p.zoom);
			// Only on a change: this runs every frame, and a caller that sets React state from it would
			// otherwise re-render sixty times a second for as long as the pointer sits still.
			if (hovered !== this.lastHoveredOrbit) {
				this.lastHoveredOrbit = hovered;
				p.onOrbitHover?.(hovered);
			}
			this.orbits.draw("vertex", {
				inst: this.instBuf,
				instCount: this.inst.count,
				offset: draw,
				zoom: p.zoom,
				rot,
				v1: mesh.v1,
				v2: mesh.v2,
				deform,
				width: p.width,
				height: p.height,
				k: orbitMesh.k,
				scales: stepOrbitScales(this.orbitScales, orbitMesh.k, hovered, ORBIT_MAX),
				radiusPx: ORBIT_DOT_RADIUS_PX,
				dim,
			});
		}
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		const gl = this.gl;
		gl.deleteProgram(this.fillProg);
		gl.deleteProgram(this.strokeProg);
		this.orbits.dispose();
		gl.deleteProgram(this.pointsProg);
		gl.deleteBuffer(this.pointsPosBuf);
		gl.deleteBuffer(this.pointsCornerBuf);
		gl.deleteBuffer(this.pointsColorBuf);
		gl.deleteBuffer(this.posBuf);
		gl.deleteBuffer(this.hueBuf);
		gl.deleteBuffer(this.instBuf);
		gl.deleteBuffer(this.centroidBuf);
		gl.deleteBuffer(this.strokePosBuf);
		gl.deleteBuffer(this.strokeNormBuf);
		gl.deleteBuffer(this.strokeSideBuf);
		gl.deleteBuffer(this.strokeCentroidBuf);
		this.mesh = null;
	}
}
