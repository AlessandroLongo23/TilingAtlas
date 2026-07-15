// Radial wave transition between tilings on the play canvas.
//
// A selection change plays two phases in sequence: the outgoing tiling collapses (every tile scales down
// to its own centroid), then the incoming tiling grows back out of its centroids. Both are driven by a
// wavefront that leaves the canvas centre and reaches the far corner at the end of the phase, so a tile
// starts moving later the further its centroid sits from the centre.
//
// Only the SCALE of each tile is animated — never its position or its vertices' relationship to the
// lattice. The grid, the wrap and the cull all keep working against the untouched geometry; a tile at
// scale s is just drawn as centroid + s·(v − centroid).

export const TILING_TRANSITION_OUT_MS = 700;
export const TILING_TRANSITION_IN_MS = 700;

// Share of a phase the wavefront spends travelling centre → far corner. The remaining (1 − WAVE_TRAVEL)
// is what any single tile gets to scale through. Higher ⇒ a tighter, more legible wave but a snappier
// per-tile pop; 0 ⇒ every tile animates in unison and there is no wave at all.
const WAVE_TRAVEL = 0.8;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

// Eased at both ends, so a tile emerges from (and returns to) its centroid rather than snapping.
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Scale factor for one tile, in [0,1] — 0 = collapsed onto its centroid, 1 = full size.
 * `u` is the tile's normalized distance from the canvas centre (0 at the centre, 1 at the corner),
 * `p` the phase's own progress in [0,1].
 */
export function waveTileScale(phase: "in" | "out", u: number, p: number): number {
	const local = clamp01((p - clamp01(u) * WAVE_TRAVEL) / (1 - WAVE_TRAVEL));
	const eased = easeInOutCubic(local);
	return phase === "in" ? eased : 1 - eased;
}

/** Under this a tile is a dot of stroke rather than a shape — skip it instead of drawing it. */
export const WAVE_MIN_SCALE = 0.02;

export function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}
