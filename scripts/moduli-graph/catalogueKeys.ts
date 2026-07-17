import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nKeyOfSymbolDirect } from '@/classes/algorithm/canonicalFormN';

type Vec = number[];
const conj = (v: Vec): Vec => [v[0] + v[2], v[1], -v[2], -v[1] - v[3]];

export interface CatalogueEntry {
	id: string;
	cell: { T1: Vec; T2: Vec; Seed: Vec[] };
	directKey: string;
	mirrorKey: string; // key of the reflected cell (== directKey iff achiral)
}
export interface CatalogueIndex {
	entries: CatalogueEntry[];
	byKey: Map<string, CatalogueEntry>; // directKey -> entry
}

const CELLS = resolve(process.cwd(), 'tools/ctrnact-oracle/run-k1-regular/ctrnact-cells-k1.json');

export function loadCatalogueKeys(): CatalogueIndex {
	const raw = JSON.parse(readFileSync(CELLS, 'utf8')) as { id: string; T1: Vec; T2: Vec; Seed: Vec[] }[];
	const entries: CatalogueEntry[] = [];
	for (const r of raw) {
		const directKey = nKeyOfSymbolDirect([r.T1, r.T2, ...r.Seed]);
		if (directKey === null) continue; // out of domain — none expected at k=1
		const mirrorKey = nKeyOfSymbolDirect([conj(r.T1), conj(r.T2), ...r.Seed.map(conj)]) ?? directKey;
		entries.push({ id: r.id, cell: { T1: r.T1, T2: r.T2, Seed: r.Seed }, directKey, mirrorKey });
	}
	const byKey = new Map(entries.map((e) => [e.directKey, e] as const));
	return { entries, byKey };
}
