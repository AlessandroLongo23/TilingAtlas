// WebGL2 rendering for the automata view: the tiling drawn once, replicated by instancing, with each
// copy's cell states read from a texture in the VERTEX shader.
//
// WHY IT LOOKS DIFFERENT FROM lib/render/flatTilingGL.ts. The /play renderer replicates one identical
// cell, so it can wrap the pan by whole periods and draw a grid centred on the origin. Here every copy
// carries different contents, so the instance grid must be real lattice indices and the pan must not
// wrap. That single difference is why this is its own pipeline instead of a flag on that one; the camera
// math (offset + zoom·R·world, y-flipped) is transcribed from flatWorldToClip and must stay in step
// with it, so the two views pan and zoom identically.
//
// There is NO instance attribute buffer. The grid is a rectangle in lattice coordinates, so a copy's
// position and its row in the state texture are both derived from gl_InstanceID — nothing is uploaded
// per frame except the state texture itself, which is a single texSubImage of one byte per cell.

import type { PeriodicAdjacency } from "@/lib/automata/adjacency";
import { polygonFillHue, starApexAngleDeg, starHue } from "@/lib/utils/renderTiling";
import { triangulate } from "@/lib/render/triangulate";

export interface AutomataMesh {
	/** Triangle vertices of the fundamental cell, 2 floats each. */
	fillVerts: Float32Array;
	/** Per fill vertex, which slot (polygon index) of the cell it belongs to. */
	fillSlot: Float32Array;
	/** Per fill vertex, the tile's base hue — used for the dead-cell tint so the tiling stays legible. */
	fillHue: Float32Array;
	fillVertexCount: number;
	/** Edge quads, as in the flat renderer: position + world normal + side flag. */
	strokePos: Float32Array;
	strokeNorm: Float32Array;
	strokeSide: Float32Array;
	strokeVertexCount: number;
	v1: [number, number];
	v2: [number, number];
	det: number;
	/** Content bounding box in lattice coordinates — the pad the instance rectangle needs. */
	aMin: number;
	aMax: number;
	bMin: number;
	bMax: number;
	medianEdge: number;
}

/** Does the centroid see every edge? Then a fan from it is an exact triangulation. Mirrors buildCellMesh. */
function kernelHoldsCentroid(vs: readonly { x: number; y: number }[], cx: number, cy: number): boolean {
	let ring = 0;
	for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) ring += vs[j].x * vs[i].y - vs[i].x * vs[j].y;
	const want = Math.sign(ring);
	for (let k = 0; k < vs.length; k++) {
		const a = vs[k];
		const b = vs[(k + 1) % vs.length];
		const t = (a.x - cx) * (b.y - cy) - (b.x - cx) * (a.y - cy);
		if (Math.sign(t) !== want || Math.abs(t) < 1e-12) return false;
	}
	return true;
}

/**
 * The cell mesh, built from the adjacency the engine runs on and not from the atlas record.
 *
 * That is the one thing this must get right: on a Möbius or Klein board the adjacency has been refined
 * onto a sublattice, so its cell holds two of the tiling's own and its basis is (v₁, w). Building the
 * mesh from the record instead would draw a cell of a different size from the one the state texture is
 * indexed by, and every tile would show a neighbour's state. See lib/automata/board.ts.
 */
export function buildAutomataMesh(adj: PeriodicAdjacency | null): AutomataMesh | null {
	if (!adj) return null;
	const polys = adj.polys.filter((p) => !p.open);
	if (polys.length === 0) return null;
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const p of polys) {
		for (const v of p.vertices) {
			if (v.x < minX) minX = v.x;
			if (v.x > maxX) maxX = v.x;
			if (v.y < minY) minY = v.y;
			if (v.y > maxY) maxY = v.y;
		}
	}

	const fillVerts: number[] = [];
	const fillSlot: number[] = [];
	const fillHue: number[] = [];
	const strokePos: number[] = [];
	const strokeNorm: number[] = [];
	const strokeSide: number[] = [];

	for (let t = 0; t < polys.length; t++) {
		const p = polys[t];
		const vs = p.vertices;
		const hue = p.hue ?? (p.star ? starHue(p.n, starApexAngleDeg(vs)) : polygonFillHue(vs));
		let cx = 0;
		let cy = 0;
		for (const v of vs) {
			cx += v.x;
			cy += v.y;
		}
		cx /= vs.length;
		cy /= vs.length;

		const push = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => {
			fillVerts.push(a.x, a.y, b.x, b.y, c.x, c.y);
			fillSlot.push(t, t, t);
			fillHue.push(hue, hue, hue);
		};

		if (kernelHoldsCentroid(vs, cx, cy)) {
			const apex = { x: cx, y: cy };
			for (let i = 0; i < vs.length; i++) push(apex, vs[i], vs[(i + 1) % vs.length]);
		} else {
			const idx = triangulate(vs);
			for (let i = 0; i + 2 < idx.length; i += 3) push(vs[idx[i]], vs[idx[i + 1]], vs[idx[i + 2]]);
		}

		for (let i = 0; i < vs.length; i++) {
			const a = vs[i];
			const b = vs[(i + 1) % vs.length];
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const len = Math.hypot(dx, dy) || 1;
			const nx = -dy / len;
			const ny = dx / len;
			// Two triangles per edge; the vertex shader offsets by ±half the screen stroke width.
			const quad: [{ x: number; y: number }, number][] = [
				[a, 1], [a, -1], [b, 1],
				[b, 1], [a, -1], [b, -1],
			];
			for (const [pt, side] of quad) {
				strokePos.push(pt.x, pt.y);
				strokeNorm.push(nx, ny);
				strokeSide.push(side);
			}
		}
	}

	const v1: [number, number] = [adj.basis[0][0], adj.basis[0][1]];
	const v2: [number, number] = [adj.basis[1][0], adj.basis[1][1]];
	const det = v1[0] * v2[1] - v2[0] * v1[1];
	let aMin = 0;
	let aMax = 0;
	let bMin = 0;
	let bMax = 0;
	if (Math.abs(det) > 1e-9) {
		aMin = Infinity;
		aMax = -Infinity;
		bMin = Infinity;
		bMax = -Infinity;
		for (const x of [minX, maxX]) {
			for (const y of [minY, maxY]) {
				const a = (x * v2[1] - y * v2[0]) / det;
				const b = (-x * v1[1] + y * v1[0]) / det;
				aMin = Math.min(aMin, a);
				aMax = Math.max(aMax, a);
				bMin = Math.min(bMin, b);
				bMax = Math.max(bMax, b);
			}
		}
	}

	return {
		fillVerts: new Float32Array(fillVerts),
		fillSlot: new Float32Array(fillSlot),
		fillHue: new Float32Array(fillHue),
		fillVertexCount: fillVerts.length / 2,
		strokePos: new Float32Array(strokePos),
		strokeNorm: new Float32Array(strokeNorm),
		strokeSide: new Float32Array(strokeSide),
		strokeVertexCount: strokeSide.length,
		v1,
		v2,
		det,
		aMin,
		aMax,
		bMin,
		bMax,
		medianEdge: adj.medianEdge,
	};
}

// ── Shaders ────────────────────────────────────────────────────────────────────────────────────────
//
// The state texture is R8UI, uGridW*uN wide and uGridH tall: texel (ix*uN + slot, iy) is the state of
// slot `slot` in lattice cell (uOriginI + ix, uOriginJ + iy). Vertex texture fetch of an integer texture
// is core WebGL2, so the lookup happens once per vertex rather than per fragment.

const CAMERA_GLSL = `
vec2 toClip(vec2 world, vec2 uOffset, float uZoom, float uRot, vec2 uHalf) {
	float c = cos(uRot), s = sin(uRot);
	float sx = uOffset.x + uZoom * (c * world.x + s * world.y);
	float sy = uOffset.y + uZoom * (s * world.x - c * world.y);
	return vec2(sx / uHalf.x, -sy / uHalf.y);
}
`;

export const STATE_FILL_VERT = `#version 300 es
in vec2 aPos;
in float aSlot;
in float aHue;
uniform vec2 uOffset;
uniform float uZoom;
uniform float uRot;
uniform vec2 uHalf;
uniform vec2 uV1;
uniform vec2 uV2;
uniform int uGridW;
uniform int uOriginI;
uniform int uOriginJ;
uniform int uN;
uniform highp usampler2D uState;
out float vState;
out float vHue;
${CAMERA_GLSL}
void main() {
	int ix = gl_InstanceID % uGridW;
	int iy = gl_InstanceID / uGridW;
	vec2 world = aPos + float(uOriginI + ix) * uV1 + float(uOriginJ + iy) * uV2;
	gl_Position = vec4(toClip(world, uOffset, uZoom, uRot, uHalf), 0.0, 1.0);
	vState = float(texelFetch(uState, ivec2(ix * uN + int(aSlot), iy), 0).r);
	vHue = aHue;
}
`;

export const STATE_FILL_FRAG = `#version 300 es
precision highp float;
in float vState;
in float vHue;
uniform float uStates;      // total states; 2 = plain Life
uniform vec3 uLive;         // colour of state 1
uniform vec3 uDead;         // colour of state 0
uniform vec3 uDecayFar;     // colour the decay tail fades toward
uniform float uTint;        // 0 = flat dead colour; 1 = tint dead cells by the tiling's own hue
out vec4 frag;
vec3 hsb2rgb(float h, float s, float v) {
	vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
	return v * mix(vec3(1.0), k, s);
}
void main() {
	if (vState < 0.5) {
		// Dead. Optionally keep the tiling's own colouring underneath, heavily muted, so the geometry the
		// automaton runs on stays readable without competing with the live cells for attention — the
		// substrate should be legible, not loud.
		vec3 tile = hsb2rgb(vHue / 360.0, 0.40, 1.0);
		frag = vec4(mix(uDead, mix(uDead, tile, 0.18), uTint), 1.0);
	} else if (vState < 1.5) {
		frag = vec4(uLive, 1.0);
	} else {
		// Generations tail: state 2 is freshly dying, uStates-1 is nearly gone.
		float p = (vState - 1.0) / max(1.0, uStates - 2.0);
		frag = vec4(mix(uLive, uDecayFar, clamp(p, 0.0, 1.0)), 1.0);
	}
}
`;

export const STATE_STROKE_VERT = `#version 300 es
in vec2 aPos;
in vec2 aNorm;
in float aSide;
uniform vec2 uOffset;
uniform float uZoom;
uniform float uRot;
uniform vec2 uHalf;
uniform vec2 uV1;
uniform vec2 uV2;
uniform int uGridW;
uniform int uOriginI;
uniform int uOriginJ;
uniform float uHalfStrokePx;
${CAMERA_GLSL}
void main() {
	int ix = gl_InstanceID % uGridW;
	int iy = gl_InstanceID / uGridW;
	vec2 world = aPos + float(uOriginI + ix) * uV1 + float(uOriginJ + iy) * uV2;
	vec2 clip = toClip(world, uOffset, uZoom, uRot, uHalf);
	// Widen in SCREEN space so the outline keeps a constant pixel width at any zoom, matching the
	// flat renderer's stroke.
	float c = cos(uRot), s = sin(uRot);
	vec2 n = vec2(c * aNorm.x + s * aNorm.y, s * aNorm.x - c * aNorm.y);
	vec2 push = n * aSide * uHalfStrokePx;
	gl_Position = vec4(clip + vec2(push.x / uHalf.x, -push.y / uHalf.y), 0.0, 1.0);
}
`;

export const STATE_STROKE_FRAG = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 frag;
void main() { frag = uColor; }
`;

export function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
	const sh = gl.createShader(type);
	if (!sh) return null;
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		console.error("automata shader compile failed:", gl.getShaderInfoLog(sh));
		gl.deleteShader(sh);
		return null;
	}
	return sh;
}

export function linkProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram | null {
	const v = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
	const f = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
	if (!v || !f) return null;
	const prog = gl.createProgram();
	if (!prog) return null;
	gl.attachShader(prog, v);
	gl.attachShader(prog, f);
	gl.linkProgram(prog);
	gl.deleteShader(v);
	gl.deleteShader(f);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
		console.error("automata program link failed:", gl.getProgramInfoLog(prog));
		return null;
	}
	return prog;
}

/**
 * The rectangle of lattice cells the viewport needs, in real (unwrapped) lattice indices.
 *
 * The camera is invertible and linear, so the viewport's four screen corners map to four lattice points
 * and the axis-aligned box around them, padded by the cell content's own lattice extent, contains every
 * copy that can put a pixel on screen.
 */
export function visibleLatticeRect(
	mesh: AutomataMesh,
	offset: { x: number; y: number },
	zoom: number,
	rot: number,
	width: number,
	height: number,
	maxCells: number,
): { i0: number; j0: number; w: number; h: number } {
	const fallback = { i0: -8, j0: -8, w: 17, h: 17 };
	if (Math.abs(mesh.det) < 1e-9 || zoom <= 0) return fallback;
	const c = Math.cos(rot);
	const s = Math.sin(rot);
	const hw = width / 2;
	const hh = height / 2;
	let aMin = Infinity;
	let aMax = -Infinity;
	let bMin = Infinity;
	let bMax = -Infinity;
	for (const px of [-hw, hw]) {
		for (const py of [-hh, hh]) {
			// Invert screen = offset + zoom·R'·world. R' = [[c,s],[s,-c]] is an involution, so R'⁻¹ = R'.
			const dx = (px - offset.x) / zoom;
			const dy = (py - offset.y) / zoom;
			const wx = c * dx + s * dy;
			const wy = s * dx - c * dy;
			const a = (wx * mesh.v2[1] - wy * mesh.v2[0]) / mesh.det;
			const b = (-wx * mesh.v1[1] + wy * mesh.v1[0]) / mesh.det;
			aMin = Math.min(aMin, a);
			aMax = Math.max(aMax, a);
			bMin = Math.min(bMin, b);
			bMax = Math.max(bMax, b);
		}
	}
	const i0 = Math.floor(aMin - mesh.aMax) - 1;
	const i1 = Math.ceil(aMax - mesh.aMin) + 1;
	const j0 = Math.floor(bMin - mesh.bMax) - 1;
	const j1 = Math.ceil(bMax - mesh.bMin) + 1;
	const w = Math.max(1, i1 - i0 + 1);
	const h = Math.max(1, j1 - j0 + 1);
	// Backstop: at the zoom floor a very small cell can ask for millions of copies, which is sub-pixel
	// mush that says nothing. Clamp around the centre rather than refusing to draw.
	if (w * h > maxCells) {
		const scale = Math.sqrt(maxCells / (w * h));
		const nw = Math.max(1, Math.floor(w * scale));
		const nh = Math.max(1, Math.floor(h * scale));
		return {
			i0: i0 + Math.floor((w - nw) / 2),
			j0: j0 + Math.floor((h - nh) / 2),
			w: nw,
			h: nh,
		};
	}
	return { i0, j0, w, h };
}
