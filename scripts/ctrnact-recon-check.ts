/*
 * Validation harness for the Čtrnáct → exact-cell developer (work/develop.py).
 *
 * Reads a JSON array of { id, k, T1, T2, Seed } (T1/T2 = [a,b,c,d] in the ζ₁₂ power basis, Seed =
 * list of vertex reps in the same encoding — the Galebach oracle format), and for each entry calls
 * reconstructOracleCellExact(id, { T1, T2, Seed }). That function's exact area certificate
 * (Σ face areas = |det Λ|, exact ℚ(ζ₂₄) arithmetic) is the OBJECTIVE gate: it certifies the emitted
 * geometry is a valid edge-to-edge regular-polygon tiling filling exactly one fundamental cell.
 *
 * A tiling that does not certify is REPORTED (id + reason), never hidden — completeness is the point.
 *
 *   pnpm tsx scripts/ctrnact-recon-check.ts <cells.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { reconstructOracleCellExact } from './oracleReconstructExact';

setActiveRing(CyclotomicRing.create(24));

type Entry = { id: string; k: number; T1: number[]; T2: number[]; Seed: number[][] };

function main(): void {
	const jsonPath = process.argv[2];
	if (!jsonPath) {
		console.error('usage: pnpm tsx scripts/ctrnact-recon-check.ts <cells.json>');
		process.exit(2);
	}
	const abs = path.resolve(jsonPath);
	const entries: Entry[] = JSON.parse(fs.readFileSync(abs, 'utf8'));
	console.error(`Loaded ${entries.length} tilings from ${abs}\n`);

	const t0 = Date.now();
	// per-k tally + failures
	const byK = new Map<number, { total: number; ok: number; fails: { id: string; error: string }[] }>();

	for (const e of entries) {
		const rec = byK.get(e.k) ?? { total: 0, ok: 0, fails: [] };
		rec.total++;
		let res: { cell: unknown } | { error: string };
		try {
			res = reconstructOracleCellExact(e.id, { T1: e.T1, T2: e.T2, Seed: e.Seed });
		} catch (err) {
			res = { error: `THREW: ${(err as Error).message}` };
		}
		if ('cell' in res) rec.ok++;
		else rec.fails.push({ id: e.id, error: res.error });
		byK.set(e.k, rec);
	}
	const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

	let grandTotal = 0;
	let grandOk = 0;
	const ks = [...byK.keys()].sort((a, b) => a - b);
	console.error('=== per-k certification ===');
	for (const k of ks) {
		const r = byK.get(k)!;
		grandTotal += r.total;
		grandOk += r.ok;
		const flag = r.ok === r.total ? '✓' : '✗';
		console.error(`  ${flag} k=${k}: ${r.ok}/${r.total} certified` + (r.ok < r.total ? `  (${r.total - r.ok} FAIL)` : ''));
	}
	console.error(`\n=== TOTAL: ${grandOk}/${grandTotal} certified in ${elapsed}s ===\n`);

	// list failures (loud, per task requirement) — first 15 per k
	for (const k of ks) {
		const r = byK.get(k)!;
		if (r.fails.length === 0) continue;
		console.error(`⚑ k=${k} failures (${r.fails.length}); first ${Math.min(15, r.fails.length)}:`);
		for (const f of r.fails.slice(0, 15)) console.error(`    ${f.id}: ${f.error}`);
	}

	process.exit(grandOk === grandTotal ? 0 : 1);
}

main();
