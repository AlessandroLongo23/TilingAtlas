// Scene input for a SPHERICAL Schwarz edge system (tools/ctrnact-oracle/develop_schwarz.py →
// public/schwarz-sph/s<board>-k<k>.json). The board is the sphere cut by the mirrors of a (p,q,r)
// reflection group — 12 triangles for (2,2,3), 16 for (2,2,4), 24 for (2,3,3), 48 for (2,3,4), 120 for
// (2,3,5) — a pattern draws some of its edges, and the tiles are the runs of triangles the drawn edges
// cut out. Exactly the object icoFreedraw.ts already draws on a Platonic solid.
//
// So this file is an ADAPTER, not a second renderer. The one difference from the Platonic freedraw is
// that a Schwarz record is SELF-CONTAINED: there is no canonical solid to index into (the (2,2,n)
// boards have no Platonic name at all, and the tetrakis/disdyakis duals are not in the solid tables),
// so the record ships its own unit vertices and buildIcoFreedraw is handed those instead. Everything
// downstream — tile colours, curved-vs-flat faces, drawn-edge tubes, the faint grid — is unchanged, so
// a Schwarz sphere and a Platonic freedraw sphere read as one look.

import type { IcoPattern, V3 } from "@/lib/render/icoFreedraw";
import type { SphSchwarzPattern } from "@/lib/freedraw/schwarz";

export interface SphSchwarzScene {
	/** What buildIcoFreedraw consumes: tiles as rings of vertex indices, plus the drawn edges. */
	pattern: IcoPattern;
	/** The board's own vertices — this is what replaces the canonical solid's vertex array. */
	vertices: V3[];
	/** All of the board's edges, for the faint underlying-grid overlay. */
	allEdges: [number, number][];
}

/** Group the board's triangles by the pattern's merged tile, and read its drawn bits off the board's
 *  edge list. The board geometry is the shard's shared object — nothing here copies it. */
export function sphSchwarzScene(p: SphSchwarzPattern): SphSchwarzScene {
	const tiles: number[][][] = Array.from({ length: p.stats.tiles }, () => []);
	p.geom.faces.forEach((ring, fi) => {
		const t = p.faceTile[fi];
		// A record whose faceTile ran past `tiles` would silently drop triangles; grow instead, so a
		// mismatch shows up as a visible extra tile, not a hole in the sphere.
		while (tiles.length <= t) tiles.push([]);
		tiles[t].push(ring);
	});
	const drawn: [number, number][] = [];
	p.geom.edges.forEach((e, ei) => {
		if (p.drawn[ei] === "1") drawn.push(e);
	});
	return {
		pattern: {
			id: p.id,
			k: p.k,
			achiral: !p.chiral,
			drawn,
			tiles,
			nDrawn: drawn.length,
			nTiles: tiles.length,
			vorbit: p.vorbit,
		},
		vertices: p.geom.vertices,
		allEdges: p.geom.edges,
	};
}
