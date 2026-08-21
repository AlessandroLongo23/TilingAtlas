// Scene input for a SPHERICAL 3.4.n.4 tiling (tools/ctrnact-oracle/develop_ai1_sph.py →
// public/spherical-poly/sp<n>-k<k>.json). Like lib/render/sphSchwarz.ts this is an ADAPTER, not a
// second renderer: it hands buildIcoFreedraw the same {pattern, vertices, allEdges} the Platonic
// freedraw, the Schwarz spheres and the uniform-polyhedron edge systems all go through, so every
// spherical shelf reads as one look.
//
// The two things it does differently from a decoration, and both follow from this being a TILING:
//
//   * a "tile" is a POLYGON SIZE, not a merged region. Grouping the faces by size is what makes one
//     colour mean one polygon across the shelf, matching how the hyperbolic half of this family fills
//     its disk (developColors keyed on the same size index).
//   * EVERY edge is drawn. There is no undrawn scaffold in a tiling — every edge is a real tile
//     boundary — so the whole edge list goes in bold, the same choice the colored-tiling shelves make.

import type { IcoPattern } from "@/lib/render/icoFreedraw";
import type { SphSchwarzScene } from "@/lib/render/sphSchwarz";
import type { SphPolyPattern } from "@/lib/tilings/sph-poly";
import { polygonHue } from "@/lib/utils/renderTiling";

// The star shelf's fill, and for the same reason (lib/render/sphStar.ts `faceHsb`): saturation and
// value belong to the medium — this three.js canvas — and the hue carries the polygon.
const TILE_SAT = 0.5;
const TILE_VAL = 0.98;
// Golden angle, the spacing `tileColor` uses on its index ramp. Reused here for the SECOND axis on a
// half-tile board, where every face is the same polygon and the groups are symmetry orbits.
const GOLDEN = 137.508;

/** Group the solid's faces by polygon size and mark every edge a boundary. The record's arrays are
 *  handed through, never copied. */
export function sphPolyScene(p: SphPolyPattern): SphSchwarzScene {
	// The colour key: the record's own fill groups when it carries them (the half-tile boards group by
	// symmetry orbit, since every face there is a triangle and size would collapse them all into one),
	// otherwise the polygon size, which is what the 3.4.n.4 family wants.
	//
	// The two differ in how many groups exist, and it matters. On the size path the group count is the
	// board's ALPHABET, `stats.sizes.length` — a size the board declares but this record happens not to
	// use still gets its (empty) group, so one colour means one polygon across the whole board and not
	// just within a record. A fill group is per-record by construction, so there its count is the labels
	// actually present.
	const sizeIndex = new Map(p.stats.sizes.map((s, i) => [s, i]));
	const key = p.fillGroup ?? p.faceSize.map((n) => sizeIndex.get(n) ?? -1);
	const nGroups = p.fillGroup ? Math.max(0, ...p.fillGroup) + 1 : p.stats.sizes.length;
	const tiles: number[][][] = Array.from({ length: nGroups }, () => []);
	p.faces.forEach((ring, fi) => {
		// A face whose key falls outside the alphabet would silently vanish; give it its own group so a
		// decode mismatch shows up as an extra colour, not as a hole in the solid.
		const t = key[fi] >= 0 ? key[fi] : tiles.length;
		while (tiles.length <= t) tiles.push([]);
		tiles[t].push(ring);
	});
	const pattern: IcoPattern = {
		id: p.id,
		k: p.k,
		achiral: !p.chiral,
		drawn: p.edges,
		tiles,
		nDrawn: p.edges.length,
		nTiles: tiles.length,
		vorbit: p.symOrbit,
	};
	return { pattern, vertices: p.vertices, allEdges: p.edges, tileHsb: tileHsb(p, nGroups) };
}

/**
 * One HSB per fill group, so this shelf never falls through to `tileColor`'s index ramp.
 *
 * ⚑ AL, 2026-08-21: "some polyhedra are still rendered as grey". `tileColor` answers a one-tile pattern
 * with a neutral blue-grey, and that neutral is for a BLANK FREEDRAW BOARD — a solid with nothing drawn
 * on it, where a real colour would claim a decoration that is not there. A tiling is never blank: one
 * group means one polygon, and one polygon has a colour. Four half-tile records have a single face
 * orbit (shoct-half-2-00001, shcube-half-2-00002, shcube-half-2-00004, shdodec-half-3-00001) and all
 * four came out as that grey. It is the same complaint AL raised about the star shelf in 2026-08-19
 * ("sometimes it's all gray"), reaching the two shelves that fix did not touch.
 *
 * Hue is the POLYGON, `polygonHue`, exactly as `faceHsb` does it — so a square is the same yellow on a
 * 3.4.n.4 solid, on a star polyhedron and on a Euclidean tiling, instead of "whatever group index it
 * landed in". On a size-keyed record that is the whole rule. On a half-tile record every face is the
 * same polygon and the groups are symmetry ORBITS, so the polygon's hue is the starting point and the
 * orbits spread from it by golden angle — which leaves the triangle boards (hue 0) exactly where they
 * already were, and moves the two dodecahedron boards onto their quadrilateral's hue.
 */
function tileHsb(p: SphPolyPattern, nGroups: number): [number, number, number][] {
	if (!p.fillGroup) return p.stats.sizes.map((n) => [polygonHue(n), TILE_SAT, TILE_VAL]);
	const base = polygonHue(p.stats.sizes[0] ?? p.faceSize[0] ?? 3);
	return Array.from({ length: nGroups }, (_, i) => [base + i * GOLDEN, TILE_SAT, TILE_VAL]);
}
