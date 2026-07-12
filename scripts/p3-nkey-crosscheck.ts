/**
 * P3 certificate (docs/ctrnact-completeness/skeleton.tex, Lemma P3): geometric
 * cross-check of the Čtrnáct pruner via the PROVEN canonical form N.
 *
 * Two directions, both per k:
 *   1. NO UNDER-MERGE: the pruned catalog's cells have pairwise distinct N-keys
 *      (two equal keys would mean the pruner kept two congruent tilings).
 *   2. NO OVER-MERGE (with --raw): the raw (pre-prune) cells' distinct-key SET equals
 *      the pruned key set (a pruned-away key would mean the pruner merged two
 *      non-congruent tilings and dropped one).
 *
 * Soundness of the arbiter: N-key equality decides congruence exactly for the
 * ζ₁₂ model (docs/canonical-form/, Corollary 5.5); Stage A recomputes the maximal
 * lattice, so keys agree across re-encodings over sublattices.
 *
 * Usage: pnpm tsx scripts/p3-nkey-crosscheck.ts --pruned <cells.json> [--raw <cells.json>]
 *   cells.json format: [{id, k, T1: int[4], T2: int[4], Seed: int[4][]}, ...]
 */
import { readFileSync } from 'node:fs';
import { nKeyOfSymbol } from '../lib/classes/algorithm/canonicalFormN';

type Cell = { id: string; k: number; T1: number[]; T2: number[]; Seed: number[][] };

function keysByK(path: string): Map<number, Map<string, string[]>> {
	const cells: Cell[] = JSON.parse(readFileSync(path, 'utf8'));
	const by = new Map<number, Map<string, string[]>>();
	for (const c of cells) {
		const key = nKeyOfSymbol([c.T1, c.T2, ...c.Seed] as never);
		if (key === null) throw new Error(`N-key null (out of domain?) for ${c.id}`);
		if (!by.has(c.k)) by.set(c.k, new Map());
		const m = by.get(c.k)!;
		if (!m.has(key)) m.set(key, []);
		m.get(key)!.push(c.id);
	}
	return by;
}

const args = process.argv.slice(2);
const prunedPath = args[args.indexOf('--pruned') + 1];
const rawIdx = args.indexOf('--raw');
const rawPath = rawIdx >= 0 ? args[rawIdx + 1] : null;

let fail = 0;
const pruned = keysByK(prunedPath);
for (const [k, m] of [...pruned.entries()].sort((a, b) => a[0] - b[0])) {
	let cells = 0;
	const dups: string[][] = [];
	for (const ids of m.values()) {
		cells += ids.length;
		if (ids.length > 1) dups.push(ids);
	}
	const ok = dups.length === 0;
	if (!ok) fail++;
	console.log(
		`k=${k}: pruned cells=${cells} distinct N-keys=${m.size} ` +
			(ok ? 'NO-UNDER-MERGE PASS' : `FAIL: congruent pairs kept: ${JSON.stringify(dups.slice(0, 3))}`),
	);
}

if (rawPath) {
	const raw = keysByK(rawPath);
	for (const [k, rm] of [...raw.entries()].sort((a, b) => a[0] - b[0])) {
		const pm = pruned.get(k);
		if (!pm) {
			console.log(`k=${k}: raw present but no pruned data — skipped`);
			continue;
		}
		let rawCells = 0;
		for (const ids of rm.values()) rawCells += ids.length;
		const lost = [...rm.keys()].filter((key) => !pm.has(key));
		const ghost = [...pm.keys()].filter((key) => !rm.has(key));
		const ok = lost.length === 0 && ghost.length === 0;
		if (!ok) fail++;
		console.log(
			`k=${k}: raw cells=${rawCells} distinct raw N-keys=${rm.size} vs pruned ${pm.size} ` +
				(ok
					? 'NO-OVER-MERGE PASS (raw and pruned key sets identical)'
					: `FAIL: keys lost by pruner=${lost.length} keys with no raw witness=${ghost.length}`),
		);
	}
}
console.log(fail === 0 ? 'P3: ALL PASS' : `P3: ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
