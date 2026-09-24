// The editor's vocabulary. One file so the pure modules (patch, doc, classify, validate, snap,
// symmetry) share a contract without importing each other, and so the React layer imports types from
// here instead of reaching into an implementation.
//
// EVERYTHING IS FLOAT, and that is a decision, not an oversight. `Cyclotomic` offers no field
// inversion by design (lib/classes/Cyclotomic.ts) and lib/utils/exactOverlap.ts never constructs an
// intersection point, so there is no exact line-line intersection to lean on. Moving a vertex destroys
// exactness anyway. What stays exact is the DERIVATION of construction points — they are vertices,
// half-sums and vertex means, all inside the ring — so a fresh cut lands on a representable point even
// though it is stored as a float here.

import type { Curve4, FreedrawPatch } from "@/lib/freedraw/pattern";
import type { HalfEdgeSite, Lift, Ring } from "@/lib/freedraw/topology";

export type { Curve4, Lift, Ring, HalfEdgeSite };

/** A world point. */
export type Pt = readonly [number, number];

/** A 2x2 lattice basis, rows T1 and T2, in world coordinates. */
export type Basis = readonly [Pt, Pt];

/**
 * What an edit repeats under (AL, 2026-09-21).
 *
 * `lattice` folds every edit onto the translation lattice alone and always works. `wallpaper` also
 * carries it through the point group, so the result keeps the tiling's symmetry — but it needs
 * `SymmetryData`, which is null for star tilings and for curved tiles, and there the mode disables
 * itself with a reason instead of editing the wrong element.
 */
export type PeriodMode = "lattice" | "wallpaper";

export type StudioTool = "select" | "merge" | "cut" | "move" | "edge" | "paint";

/**
 * Which tiles one paint click repaints (AL, 2026-09-21).
 *
 * These are the three classes lib/freedraw/render.ts FILL_MODES already names and glosses — Shape,
 * Pose, Orbit — under AL's labels. `PAINT_SCOPES` keeps the labels and the glosses in one place so the
 * editor and the freedraw fill chips cannot drift on what the words mean.
 *
 *   shape       congruent up to rotation and reflection: every triangle alike.
 *   orientation congruent up to translation only: a 1x3 and a 3x1 now differ.
 *   tile        one period orbit: two tiles share a colour only when a period carries one to the other.
 */
export type PaintScope = "shape" | "orientation" | "tile";

export const PAINT_SCOPES: { value: PaintScope; label: string; help: string }[] = [
	{
		value: "shape",
		label: "Shape",
		help: "One colour per shape. A 1×3 and a 3×1 share it — rotations and mirrors count as the same tile.",
	},
	{
		value: "orientation",
		label: "Orientation",
		help: "Shape and orientation. A 1×3 and a 3×1 now differ, but every 3×1 in the figure stays one colour.",
	},
	{
		value: "tile",
		label: "Tile",
		help: "One colour per orbit. Two tiles share it only when a period carries one onto the other.",
	},
];

/** Which construction-point family a cut endpoint names. The three `showPolygonPoints` draws and
 *  `Tiling.drawConstructionPoints` labels c / h / v. */
export type PointKind = "vertex" | "midpoint" | "centroid";

/**
 * A construction point, named by CONTENT so a cut means the same thing in any frame.
 *
 * Two things a ref must survive, and the second is what the first version got wrong.
 *
 * It cannot store a float position: the moment a vertex moves, a stored position is stale and the chord
 * detaches from the geometry it was drawn against. So an endpoint names where it COMES FROM.
 *
 * And it cannot name a face or an edge by INDEX. `cutFaces` numbers faces in the order its dart walk
 * meets them, which is not the order `tilingToPatch`'s fold produced, so `{face, edgeIdx}` built
 * against the rebuilt patch resolved against a different edge inside `build` — the chord attached
 * somewhere unrelated, wrecking the face structure and reading as a merge. A midpoint therefore names
 * its EDGE by the canonical quotient key `doc.dropped` already uses, and a centroid names its face by
 * the canonical ring key, both invariant under renumbering. `off` is the lift of the copy clicked.
 */
export type PointRef =
	| { kind: "vertex"; vi: number; off: Lift }
	| { kind: "midpoint"; edge: string; off: Lift }
	| { kind: "centroid"; ring: string; off: Lift };

/** A construction point resolved against the current geometry, ready to hit-test or draw. */
export interface ConstructionPoint {
	ref: PointRef;
	kind: PointKind;
	at: Pt;
	/** The label `Tiling.drawConstructionPoints` would give it: `v3`, `h1`, `c2`. */
	label: string;
}

/**
 * An edge's decoration. Either one of the six profiles lib/bubble/edges.ts already derives — whose
 * bump/bite rule `bite(t) = -bump(1 - t)` is what makes the two tiles still interlock — or a free
 * shape, two cubic control points in the edge's own chord frame.
 *
 * Chord frame and not world coordinates, so the decoration keeps its shape when the edge moves under
 * a vertex drag. `lib/freedraw/edgePatchCore.ts` stores bows the same way and for the same reason.
 */
export type EdgeDecoration =
	| { kind: "straight" }
	| { kind: "profile"; style: string; level?: number; outward: boolean }
	| { kind: "free"; chord: Curve4 };

/**
 * The whole edit, as data. Small, flat and serializable, which is what lets history be snapshots
 * instead of a command pattern: there is nothing here whose inverse needs computing.
 *
 * Every key is a QUOTIENT key — a half-edge key from `lib/freedraw/topology.ts`, a vertex index, a
 * class key from `classify.ts` — so one entry is automatically every copy of that element across the
 * plane. That is the whole mechanism by which "every edit affects the whole tiling".
 */
export interface StudioDoc {
	/** Undirected quotient edge keys merged away. A merged tile is the faces they no longer separate. */
	dropped: string[];
	/** Cuts. Each is a path of snapped construction points; a path splits a face when both ends sit on
	 *  its boundary, which is why the tool chains clicks instead of taking one chord. */
	cuts: PointRef[][];
	/**
	 * Vertex -> world displacement, over TWO key spaces.
	 *
	 * A decimal string is a base vertex index. A JSON string is the `PointRef` of a vertex that a cut
	 * created, which has no base index to be keyed by: a midpoint or a centroid exists only because a cut
	 * asked for it. Both are draggable, so both need somewhere to record it.
	 */
	moved: Record<string, Pt>;
	/** Class key (per the doc's own scope) -> palette slot. */
	paint: Record<string, number>;
	/** Undirected quotient edge key -> decoration. */
	edges: Record<string, EdgeDecoration>;
}

export const EMPTY_DOC: StudioDoc = {
	dropped: [],
	cuts: [],
	moved: {},
	paint: {},
	edges: {},
};

export const isEmptyDoc = (d: StudioDoc): boolean =>
	d.dropped.length === 0 &&
	d.cuts.length === 0 &&
	Object.keys(d.moved).length === 0 &&
	Object.keys(d.paint).length === 0 &&
	Object.keys(d.edges).length === 0;

/**
 * The editable tiling: a `FreedrawPatch` (so every existing renderer takes it unchanged) plus the
 * topology the tools need and the renderer ignores.
 */
export interface StudioPatch extends FreedrawPatch {
	/** Directed half-edge -> the faces carrying it. The edge identity the app never had. */
	half: Map<string, HalfEdgeSite[]>;
	/** Incident `(face, cornerIdx)` per vertex, so grabbing a vertex finds every ring to revalidate. */
	incident: { face: number; cornerIdx: number }[][];
	/** Undirected key per entry of `edges`, parallel to it. */
	edgeKeys: string[];
	/** Face rings as `mergeFaces` wants them — the same arrays as `polys`, typed for topology calls. */
	rings: Ring[];
	basis: Basis;
	/** Shortest edge in the cell. Sets every tolerance downstream; never assume a unit scale. */
	medianEdge: number;
	/**
	 * How the CATALOGUE would colour each face, carried through per face.
	 *
	 * Without it the editor repaints the tiling on the way in, and that is a bug, not a style
	 * choice: `drawPolygons` has three ramps (an explicit `hue`, the star ramp for a `star` ring, the
	 * by-side-count ramp for everything else), and a face arriving with neither flag falls through to the
	 * third. A star tiling then came out green where the catalogue draws it pink.
	 *
	 * Keyed by the face's canonical ring, not its index, because a rebuild renumbers faces. A face a cut
	 * has changed finds no entry and takes the side-count ramp, which is right: it is a new shape.
	 */
	srcAttrs?: ReadonlyMap<string, { star?: boolean; hue?: number; n?: number }>;
}

/** Why a gesture was refused. AL chose block-the-gesture, so this is what the inspector says instead
 *  of a red outline the user has to interpret. */
export interface Rejection {
	code: "infinite-tile" | "folds-tile" | "chord-crosses" | "dead-end" | "no-symmetry" | "degenerate";
	message: string;
}

/** Same `?: undefined` shape as `PatchFailure`, and for the same reason: `strict: false` does not
 *  narrow a boolean discriminant, so a guard alone will not make `code` and `message` readable. */
export type Verdict =
	| { ok: true; code?: undefined; message?: undefined }
	| ({ ok: false } & Rejection);

export const REJECT = (code: Rejection["code"], message: string): Verdict => ({
	ok: false,
	code,
	message,
});

export const OK: Verdict = { ok: true };

/**
 * A verdict as something the inspector can show, or null when it passed.
 *
 * It exists because `strict: false` does not narrow a boolean discriminant, so `if (!v.ok)` leaves the
 * compiler still holding the whole union and a refusal cannot be handed straight to anything typed
 * `Rejection`. One helper, instead of a cast at each of the call sites.
 */
export const asRejection = (v: Verdict): Rejection | null =>
	v.ok ? null : { code: v.code as Rejection["code"], message: v.message as string };
