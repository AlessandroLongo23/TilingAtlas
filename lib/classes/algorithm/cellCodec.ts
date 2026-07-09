/**
 * Exact cell (de)serialization — fs-free so it is safe to import from BROWSER code (the Play viewer's
 * symmetry overlay deserializes a fetched cell_codec on the client). Split out of scripts/scoutCodec.ts,
 * which keeps the fs-using crash-resume reader and re-exports these for its many script/test importers.
 *
 * A cell tile is a `RegularPolygon` built by the unit-ζ-step boundary walk, so {n, exact anchor, first
 * edge-direction index} reconstructs it EXACTLY via `RegularPolygon.fromAnchorAndDirExact` — identical
 * `exactVertices`/`exactCentroid`, hence identical `canonicalKey` and congruence class. The basis is two
 * `Cyclotomic` encodings. No floats cross the wire; merge stays exact.
 */
import { Cyclotomic, type CyclotomicRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';

export type EncCyc = { n: string[]; d: string };
export type SerializedCell = {
	polys: { n: number; a: EncCyc; d: number }[];
	basis: [EncCyc, EncCyc];
};

export function serializeCell(cell: PeriodCell): SerializedCell {
	const polys = cell.cellPolygons.map((p) => {
		// This codec is regular-polygon-only: it stores {n, anchor, dir} and deserializeCell rebuilds via
		// RegularPolygon.fromAnchorAndDirExact. A star tile (its reflex dents / extra boundary vertices)
		// would be silently regularized into an n-gon, so refuse it loudly rather than lose geometry.
		if ((p as { isStar?: boolean }).isStar === true)
			throw new Error('cellCodec: star polygons are not representable by the regular-only {n,anchor,dir} codec');
		if (!p.exactVertices || !p.edgeDirs) throw new Error('cellCodec: cell polygon lacks exact data');
		return { n: p.n, a: p.exactVertices[0].encode(), d: p.edgeDirs[0] };
	});
	return { polys, basis: [cell.basisExact[0].encode(), cell.basisExact[1].encode()] };
}

export function deserializeCell(ring: CyclotomicRing, sc: SerializedCell): PeriodCell {
	const cellPolygons = sc.polys.map((pe) =>
		RegularPolygon.fromAnchorAndDirExact(pe.n, Cyclotomic.decode(ring, pe.a), pe.d)
	);
	return {
		cellPolygons,
		basisExact: [Cyclotomic.decode(ring, sc.basis[0]), Cyclotomic.decode(ring, sc.basis[1])],
	};
}
