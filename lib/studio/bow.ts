// Bowing an edge, which is how a tiling of polygons becomes a tiling of shapes.
//
// WHY THIS IS SAFE, and it is the whole reason the tool is worth having. A bow is stored once, against
// the QUOTIENT edge, in that edge's own chord frame. Both tiles sharing the edge therefore draw the
// identical world curve, one traversing it forwards and one backwards, so the tiling stays gap-free and
// overlap-free no matter what the curve does. Nothing has to be checked and nothing can drift: this is
// the Escher mechanism, and the invariant is that there is only ONE curve per edge to begin with.
//
// It is worth being precise about what does NOT apply here. lib/bubble/edges.ts forbids profiles that
// are antisymmetric about the midpoint, because on an edge PATTERN the bump and the bite carry a bit
// ("is this edge drawn") and an antisymmetric profile makes the two indistinguishable. That is a
// question about an edge pattern's information content, not about geometry. Here there is no bit to
// lose, so an S-curve is allowed and does the thing you would expect.
//
// The chord frame is (along, left) scaled by the chord's own length, so a bow keeps its shape when the
// edge moves under a vertex drag or a view deform, and a bow set at one zoom means the same thing at
// another. lib/freedraw/edgePatchCore.ts stores its bows the same way and says so.

import type { Curve4, EdgeDecoration, Pt } from "./types";

/** Segments a flattened arc is drawn with. Sixteen is past the point where a tile edge at any zoom the
 *  editor allows reads as straight-line segments, and every one costs two floats in a ring. */
const ARC_SEGMENTS = 16;

/**
 * Named bows, as chord-frame cubic control points `[t1, s1, t2, s2]`.
 *
 * `t` runs along the chord and `s` sits on its left, both in units of the chord's length, which is why
 * every entry here is scale-free. The two control points at a third and two thirds is the standard
 * choice: it makes `s` read directly as roughly the depth of the bulge.
 */
export const BOW_PRESETS: { id: string; label: string; help: string; chord: Curve4 }[] = [
	{
		id: "straight",
		label: "Straight",
		help: "The polygon edge, undecorated.",
		chord: [1 / 3, 0, 2 / 3, 0],
	},
	{
		id: "shallow",
		label: "Shallow",
		help: "A slight bulge. The tile keeps its polygon's read at a glance.",
		chord: [1 / 3, 0.12, 2 / 3, 0.12],
	},
	{
		id: "round",
		label: "Round",
		help: "A deep bulge on one side and the matching hollow on the other.",
		chord: [1 / 3, 0.3, 2 / 3, 0.3],
	},
	{
		id: "wave",
		label: "Wave",
		help: "An S: out then in. The two tiles interlock without either being convex.",
		chord: [1 / 3, 0.28, 2 / 3, -0.28],
	},
	{
		id: "tab",
		label: "Tab",
		help: "A narrow neck and a wide head, the jigsaw joint.",
		chord: [0.18, 0.46, 0.82, 0.46],
	},
];

export const bowPreset = (id: string): Curve4 | null =>
	BOW_PRESETS.find((p) => p.id === id)?.chord ?? null;

/** The chord of a decoration, or null when the edge is straight and the draw can skip it. */
export function chordOf(dec: EdgeDecoration | undefined): Curve4 | null {
	if (!dec) return null;
	if (dec.kind === "straight") return null;
	if (dec.kind === "free") return isFlat(dec.chord) ? null : dec.chord;
	const c = bowPreset(dec.style);
	return c && !isFlat(c) ? c : null;
}

/** A chord whose control points sit on the chord itself draws a straight line, so it is not a curve. */
const isFlat = (c: Curve4) => Math.abs(c[1]) < 1e-9 && Math.abs(c[3]) < 1e-9;

/** The same arc described from the other end, for a ring traversing its edge backwards. Mirrors
 *  `flipChord` in lib/freedraw/edgePatchCore.ts, which solves the identical problem. */
export const flipChord = (c: Curve4): Curve4 => [1 - c[2], -c[3], 1 - c[0], -c[1]];

/**
 * A bow flattened to world points from `a` to `b`, EXCLUDING both endpoints.
 *
 * Excluding them because the caller is walking a ring and already has the corners: it appends a corner,
 * then the interior of the arc leaving it, then the next corner. That keeps the corner indices the
 * caller needs for `RawPolygon.corners`, which is what stops a flattened edge from being mistaken for a
 * many-sided polygon (see the comment on that field).
 */
export function arcInterior(a: Pt, b: Pt, chord: Curve4, segments = ARC_SEGMENTS): Pt[] {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	// Chord frame to world: `along` is the chord, `left` is it turned a quarter turn.
	const p1: Pt = [a[0] + chord[0] * dx - chord[1] * dy, a[1] + chord[0] * dy + chord[1] * dx];
	const p2: Pt = [a[0] + chord[2] * dx - chord[3] * dy, a[1] + chord[2] * dy + chord[3] * dx];
	const out: Pt[] = [];
	for (let i = 1; i < segments; i++) {
		const t = i / segments;
		const u = 1 - t;
		const w0 = u * u * u;
		const w1 = 3 * u * u * t;
		const w2 = 3 * u * t * t;
		const w3 = t * t * t;
		out.push([
			w0 * a[0] + w1 * p1[0] + w2 * p2[0] + w3 * b[0],
			w0 * a[1] + w1 * p1[1] + w2 * p2[1] + w3 * b[1],
		]);
	}
	return out;
}

/**
 * The chord-frame depth a pointer at `p` asks for on the edge `a`-`b`.
 *
 * The signed perpendicular distance in units of the chord's length, so dragging the same number of
 * pixels off a short edge and a long one gives each the bow that looks the same relative to its own
 * edge. Clamped, because past about half the chord a cubic loops back through itself and the tile stops
 * being a shape anyone asked for.
 */
export function depthAt(a: Pt, b: Pt, p: Pt): number {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const len2 = dx * dx + dy * dy;
	if (len2 < 1e-18) return 0;
	const len = Math.sqrt(len2);
	const s = ((p[0] - a[0]) * -dy + (p[1] - a[1]) * dx) / (len * len);
	return Math.max(-0.5, Math.min(0.5, s));
}

/** A symmetric bow of the given signed depth: the free shape a drag produces. */
export const bowOfDepth = (s: number): Curve4 => [1 / 3, s * 1.35, 2 / 3, s * 1.35];
