// The feel of the vertex-orbit hover, in one place: how big a dot is, how close the pointer has to be
// to count as over one, and how fast the hovered orbit grows. /play (components/euclidean-canvas.tsx)
// and the embeddable cards (lib/render/flatTilingGL.ts) both call these, so the two cannot drift into
// behaving differently. The numbers come from Tiling.drawVertexOrbits, the original p5 implementation.

import { applyMat2, invertMat2, isIdentityDeform, type Mat2 } from "@/lib/render/flatView";

/** Dot radius in CSS px. The shader's uRadiusPx and the hit-test radius are the same number by
 *  construction: hovering should start exactly when the pointer touches the disk, not before. */
export const ORBIT_DOT_RADIUS_PX = 4;

/** The hovered orbit's dots ease toward this multiple of the base radius; the rest ease back to 1. */
export const ORBIT_HOVER_GROW = 2;

/** Per-frame lerp rate toward the target scale. */
export const ORBIT_HOVER_DAMP = 0.2;

/** Close enough to the target to snap, so a dot settles instead of creeping. */
const SNAP = 0.01;

/**
 * The colour orbit mode fades the tiles toward, read from a CSS "rgb(...)" / "rgba(...)" string and
 * returned as 0..1 channels. Falls back to white, not black, on a parse miss or a transparent
 * background: with no colour to fade toward, dark tiles would read as a rendering fault.
 */
export function parseDimTarget(css: string): [number, number, number] {
	const m = css.match(/[\d.]+/g);
	if (!m || m.length < 3) return [1, 1, 1];
	if (m.length >= 4 && Number(m[3]) === 0) return [1, 1, 1];
	return [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255];
}

export interface OrbitDot {
	x: number;
	y: number;
	orbit: number;
}

/**
 * Screen position (centred CSS px, y down) back to world coordinates, inverting the transform every
 * flat shader applies:  s = offset + zoom·R·flip·D·w. That 2x2 is a reflection, so it is its own
 * inverse; the view deformation D is undone separately, and only here — the hit test compares against
 * un-deformed dot positions, so a hover under a sheared view has to come back through D⁻¹ or it lands
 * on the wrong orbit. A singular D has no inverse; the un-deformed point is returned, so the hover
 * misses instead of returning NaN.
 */
export function screenToWorld(
	px: number,
	py: number,
	offset: { x: number; y: number },
	zoom: number,
	rotRad: number,
	deform?: Mat2,
): { x: number; y: number } {
	const c = Math.cos(rotRad);
	const s = Math.sin(rotRad);
	const ax = (px - offset.x) / zoom;
	const ay = (py - offset.y) / zoom;
	const w = { x: c * ax + s * ay, y: s * ax - c * ay };
	if (isIdentityDeform(deform)) return w;
	const inv = invertMat2(deform as Mat2);
	return inv ? applyMat2(inv, w.x, w.y) : w;
}

/**
 * Which orbit is under `world`, or -1. The dots given are one fundamental cell's worth, so each is
 * reduced to its nearest lattice image of the cursor before measuring: orbit membership is
 * translation-invariant, so one cell answers for the whole plane.
 *
 * The test uses the BASE radius, never the grown one, or a dot would flicker at the boundary as
 * growing brought it under the pointer and shrinking took it back out.
 */
export function hoveredOrbitAt(
	dots: readonly OrbitDot[],
	world: { x: number; y: number } | null,
	v1: readonly [number, number],
	v2: readonly [number, number],
	det: number,
	zoom: number,
): number {
	if (!world || Math.abs(det) < 1e-9 || zoom <= 0) return -1;
	const rWorld = ORBIT_DOT_RADIUS_PX / zoom;
	let best = rWorld * rWorld;
	let hovered = -1;
	for (const d of dots) {
		// Nearest lattice image: solve Δ = i·v1 + j·v2 over the reals, then round to integers.
		const dx = world.x - d.x;
		const dy = world.y - d.y;
		const i = Math.round((dx * v2[1] - dy * v2[0]) / det);
		const j = Math.round((dy * v1[0] - dx * v1[1]) / det);
		const rx = dx - (i * v1[0] + j * v2[0]);
		const ry = dy - (i * v1[1] + j * v2[1]);
		const dist2 = rx * rx + ry * ry;
		if (dist2 < best) {
			best = dist2;
			hovered = d.orbit;
		}
	}
	return hovered;
}

/**
 * Advance the per-orbit radius scales one frame and pack them for the shader's uOrbitScale array.
 * `scales` is the caller's retained state and is mutated in place.
 */
export function stepOrbitScales(scales: number[], k: number, hoveredOrbit: number, max: number): Float32Array {
	if (scales.length !== k) {
		scales.length = k;
		scales.fill(1);
	}
	const packed = new Float32Array(max).fill(1);
	for (let o = 0; o < k; o++) {
		const target = o === hoveredOrbit ? ORBIT_HOVER_GROW : 1;
		const delta = target - scales[o];
		scales[o] = Math.abs(delta) < SNAP ? target : scales[o] + delta * ORBIT_HOVER_DAMP;
		if (o < max) packed[o] = scales[o];
	}
	return packed;
}
