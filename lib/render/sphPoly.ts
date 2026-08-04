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
	const sizeIndex = new Map(p.stats.sizes.map((s, i) => [s, i]));
	const tiles: number[][][] = p.stats.sizes.map(() => []);
	p.faces.forEach((ring, fi) => {
		// A face whose size is not in the board alphabet would silently vanish; give it its own group
		// so a decode mismatch shows up as an extra colour, not as a hole in the solid.
		const t = sizeIndex.get(p.faceSize[fi]) ?? tiles.length;
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
