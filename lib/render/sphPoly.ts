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
	return { pattern, vertices: p.vertices, allEdges: p.edges };
}
