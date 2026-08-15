import type { WallpaperGroup } from "@/classes/symmetry/types";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

/**
 * Chirality of a tiling, and the flip that shows its other hand.
 *
 * The atlas counts a chiral tiling and its mirror image as ONE entry. That is not our choice: it is
 * the convention A068599 is stated in, and the reason the eleven Archimedean tilings are eleven. The
 * snub trihexagonal tiling 3.3.3.3.6 is chiral — of the eleven it is the only one with no reflection
 * in its symmetry group (p6, [6,3]⁺) — and it is counted once. Sommerville noted the same in 1905:
 * (3⁴.6) "is enantiomorphic, which means that it has two mirror images that cannot be mapped into each
 * other by translations and rotations alone", and it is still one of the eleven. Our own dedup says so
 * explicitly (TilingCongruence: "under the project's chirality-MERGE convention … that isometry may be
 * a reflection"), and `make check-regular` reproducing 11/20/61/151/332/673 only works because of it.
 *
 * Merging is right for counting and lossy for looking: the two hands of a chiral tiling are genuinely
 * not superimposable, and a catalogue that shows only one is hiding something real. So the entry stays
 * single and the other hand becomes a VIEW of it — `reflectRenderCell` below.
 *
 * A tiling is chiral iff its symmetry group contains no orientation-REVERSING isometry. Of the 17
 * wallpaper groups exactly five qualify: p1, p2, p3, p4, p6. Note pg and pgg do NOT — a glide
 * reflection reverses orientation just as a mirror does, so those tilings are achiral despite having
 * no ordinary mirror line.
 */
export const CHIRAL_WALLPAPER_GROUPS: readonly WallpaperGroup[] = ["p1", "p2", "p3", "p4", "p6"];

const CHIRAL = new Set<string>(CHIRAL_WALLPAPER_GROUPS);

/**
 * Is this tiling chiral? `undefined` when unknown — the exact wallpaper classification only runs on
 * the regular family (WallpaperSymmetry needs exact convex tiles), so star, composite and period-p
 * entries have no group and this cannot answer for them. Unknown is reported as unknown, never
 * defaulted to "achiral", because a false "no flip available" hides one of the two hands.
 */
export function isChiralTiling(t: Pick<ReferenceTiling, "wallpaperGroup">): boolean | undefined {
	if (t.wallpaperGroup == null) return undefined;
	return CHIRAL.has(t.wallpaperGroup);
}

export type ChiralityFacet = "chiral" | "achiral";

/** Facet value for the library filter, or null when the tiling carries no group. */
export function chiralityOf(t: Pick<ReferenceTiling, "wallpaperGroup">): ChiralityFacet | null {
	const c = isChiralTiling(t);
	return c == null ? null : c ? "chiral" : "achiral";
}

type Cell = ReferenceTiling["renderCell"];
type Pt = number[] | { x: number; y: number };
type Poly = { v?: Pt[]; vertices?: Pt[] } & Record<string, unknown>;

const flipPt = (p: Pt): Pt =>
	Array.isArray(p) ? [p[0], -p[1]] : { x: p.x, y: -p.y };

/**
 * The mirror image of a render cell: reflect in the x-axis (y → −y).
 *
 * Any reflection would do — they differ from this one by a rotation, and the viewer can already
 * rotate — so the choice of axis is cosmetic. Pure and total: it touches only float render geometry,
 * never a count, an id, or an exact coordinate, so flipping is a view and can never change what the
 * catalogue claims.
 *
 * Tolerant of every shape the atlas actually ships, the same way `parseBaseCell` is: polygons under
 * `p` or `cellPolygons`, points as `[x, y]` pairs or `{x, y}`, basis under `b` or `basis`. Whichever
 * key an entry uses is the key it keeps, so a flipped cell stays parseable by the same code path.
 */
export function reflectRenderCell(cell: Cell): Cell {
	const out: Cell = { ...cell };
	for (const key of ["p", "cellPolygons"] as const) {
		const polys = cell[key] as Poly[] | undefined;
		if (!polys) continue;
		out[key] = polys.map((poly) => {
			const next: Poly = { ...poly };
			if (poly.v) next.v = poly.v.map(flipPt);
			if (poly.vertices) next.vertices = poly.vertices.map(flipPt);
			return next;
		});
	}
	for (const key of ["b", "basis"] as const) {
		const basis = cell[key];
		if (!basis) continue;
		out[key] = basis.map(([x, y]) => [x, -y]);
	}
	return out;
}
