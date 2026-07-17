import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CyclotomicRing, type Cyclotomic } from '@/classes/Cyclotomic';
import { reconstructOracleCell } from '@/classes/algorithm/oracleCellReconstruct';
import { nKeyOfSymbolDirect } from '@/classes/algorithm/canonicalFormN';
import { tilingSignature } from './tilingSignature';
import type { FloatTiling } from './types';

type Vec = number[];
const conj = (v: Vec): Vec => [v[0] + v[2], v[1], -v[2], -v[1] - v[3]];

export interface CatalogueEntry {
	id: string;
	cell: { T1: Vec; T2: Vec; Seed: Vec[] };
	directKey: string;
	mirrorKey: string; // key of the reflected cell (== directKey iff achiral)
	signature: string | null; // vertex-config fingerprint (null if reconstruction failed)
}
export interface CatalogueIndex {
	entries: CatalogueEntry[];
	byKey: Map<string, CatalogueEntry>; // directKey -> entry
	bySignature: Map<string, CatalogueEntry[]>; // signature -> entries
}

const CELLS = resolve(process.cwd(), 'tools/ctrnact-oracle/run-k1-regular/ctrnact-cells-k1.json');

function cellToFloat(cell: {
	cellPolygons: { exactVertices?: Cyclotomic[] }[];
	basisExact: Cyclotomic[];
}): FloatTiling {
	const toXY = (c: Cyclotomic): [number, number] => {
		const v = c.toVector();
		return [v.x, v.y];
	};
	return {
		polys: cell.cellPolygons.map((p) => ({
			n: p.exactVertices!.length,
			verts: p.exactVertices!.map(toXY),
		})),
		basis: [toXY(cell.basisExact[0]), toXY(cell.basisExact[1])],
	};
}

export function loadCatalogueKeys(ring: CyclotomicRing = CyclotomicRing.create(24)): CatalogueIndex {
	const raw = JSON.parse(readFileSync(CELLS, 'utf8')) as { id: string; T1: Vec; T2: Vec; Seed: Vec[] }[];
	const entries: CatalogueEntry[] = [];
	for (const r of raw) {
		const directKey = nKeyOfSymbolDirect([r.T1, r.T2, ...r.Seed]);
		if (directKey === null) continue; // out of domain — none expected at k=1
		const mirrorKey = nKeyOfSymbolDirect([conj(r.T1), conj(r.T2), ...r.Seed.map(conj)]) ?? directKey;
		const rec = reconstructOracleCell(ring, r.id, { T1: r.T1, T2: r.T2, Seed: r.Seed });
		const signature = 'cell' in rec ? tilingSignature(cellToFloat(rec.cell)) : null;
		entries.push({ id: r.id, cell: { T1: r.T1, T2: r.T2, Seed: r.Seed }, directKey, mirrorKey, signature });
	}
	const byKey = new Map(entries.map((e) => [e.directKey, e] as const));
	const bySignature = new Map<string, CatalogueEntry[]>();
	for (const e of entries) {
		if (e.signature === null) continue;
		const list = bySignature.get(e.signature) ?? [];
		list.push(e);
		bySignature.set(e.signature, list);
	}
	return { entries, byKey, bySignature };
}
