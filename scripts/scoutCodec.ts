/**
 * Exact cell (de)serialization for the parallel scout — crosses process boundaries as JSON-safe
 * exact coefficients (parallelization guard #4). A cell tile is a `RegularPolygon` built by the
 * unit-ζ-step boundary walk, so {n, exact anchor, first edge-direction index} reconstructs it
 * EXACTLY via `RegularPolygon.fromAnchorAndDirExact` — identical `exactVertices`/`exactCentroid`,
 * hence identical `canonicalKey` and congruence class (verified in tests/scout-codec.test.ts).
 * The basis is two `Cyclotomic` encodings. No floats cross the wire; merge stays exact.
 */
import fs from 'node:fs';
import { Cyclotomic, type CyclotomicRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';

type EncCyc = { n: string[]; d: string };
export type SerializedCell = {
	polys: { n: number; a: EncCyc; d: number }[];
	basis: [EncCyc, EncCyc];
};

export function serializeCell(cell: PeriodCell): SerializedCell {
	const polys = cell.cellPolygons.map((p) => {
		if (!p.exactVertices || !p.edgeDirs) throw new Error('scoutCodec: cell polygon lacks exact data');
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

/**
 * Crash-resume: read a coordinator NDJSON file (one `{idx, cells}` line per finished seed) into the set
 * of completed seed indices + the flattened serialized cells. Missing file ⇒ empty (fresh run). A
 * TRUNCATED final line (the coordinator killed mid-write) is skipped, not fatal — the valid prefix is
 * kept, so resuming after an unclean shutdown loses at most the seed that was being written.
 */
export function readResumeNdjson(file: string): { done: Set<number>; cells: SerializedCell[] } {
	const done = new Set<number>();
	const cells: SerializedCell[] = [];
	let raw: string;
	try { raw = fs.readFileSync(file, 'utf8'); } catch { return { done, cells }; }
	for (const line of raw.split('\n')) {
		const s = line.trim();
		if (!s) continue;
		let rec: { idx?: number; cells?: SerializedCell[] };
		try { rec = JSON.parse(s); } catch { continue; } // truncated/partial tail ⇒ skip
		if (typeof rec.idx !== 'number') continue;
		done.add(rec.idx);
		if (Array.isArray(rec.cells)) for (const c of rec.cells) cells.push(c);
	}
	return { done, cells };
}
