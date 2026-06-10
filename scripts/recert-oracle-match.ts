/* k=3 re-certification acceptance: per-tiling oracle match of the POST-FIX scout artifact.
 *
 * Reads the fresh re-cert artifact (.scout-cache/k3_3.4.6.12_cap0.ndjson, digest
 * 99919f42a7b58e76 / 61), dedupes by exact congruence, reconstructs every oracle k=3
 * entry via the proven decode (scripts/oracle-match.ts exports), and matches BOTH ways
 * with cellsCongruent. This is the test the pre-fix catalogue failed (NOTES §28):
 * acceptance = 61/61 bijective, t3007 matched, no scout cell matching two oracle entries
 * and vice versa. Every failure mode prints loudly and exits 1.
 *
 * ⚑ Ring discipline: Cyclotomic.assertSameRing compares ring INSTANCES, and oracle-match.ts
 * owns its module-level ring — so the oracle cells are reconstructed FIRST and the scout
 * artifact is deserialized with THAT ring (creating a second CyclotomicRing.create(24)
 * here would crash every cross comparison).
 *
 *   pnpm tsx scripts/recert-oracle-match.ts
 */
import fs from 'node:fs';
import { setActiveRing } from '@/classes/Cyclotomic';
import { cellsCongruent, dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { readResumeNdjson, deserializeCell } from './scoutCodec';
import { loadOracle, reconstructOracleCell } from './oracle-match';

const ART = '.scout-cache/k3_3.4.6.12_cap0.ndjson';
const LOG = 'experiments/results/k3-recert-oracle-match-2026-06-10.log';
const lines: string[] = [];
function log(s: string): void {
	const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`;
	console.log(line);
	lines.push(line);
	fs.writeFileSync(LOG, lines.join('\n') + '\n');
}

log(`=== k=3 re-cert per-tiling oracle match — artifact ${ART} ===`);

// --- oracle side first (fixes the ring) ---
const oracle = loadOracle();
const k3codes = Object.keys(oracle)
	.filter((c) => /^t3\d{3}$/.test(c)) // t3001..t3061 — NOT the t3uXXX family (matcher's own filter)
	.sort();
log(`oracle k=3 entries: ${k3codes.length} (must be 61)`);
if (k3codes.length !== 61) {
	log('✗ FAIL: oracle key filter wrong');
	process.exit(1);
}
const recon = new Map<string, PeriodCell>();
let reconErrors = 0;
for (const code of k3codes) {
	const rec = reconstructOracleCell(code, oracle[code]);
	if ('error' in rec) {
		log(`✗ ${code}: reconstruction error: ${rec.error}`);
		reconErrors++;
		continue;
	}
	recon.set(code, rec.cell);
}
log(`reconstructed: ${recon.size}/61 (errors: ${reconErrors})`);
const ring = recon.values().next().value!.basisExact[0].ring;
setActiveRing(ring);

// --- scout side, in the SAME ring ---
const { cells: raw } = readResumeNdjson(ART);
log(`raw cells: ${raw.length}`);
const mine: PeriodCell[] = dedupeByCongruence(raw.map((sc) => deserializeCell(ring, sc)));
log(`congruence classes: ${mine.length} (must be 61)`);
if (mine.length !== 61) {
	log('✗ FAIL: class count ≠ 61');
	process.exit(1);
}

// --- bidirectional per-tiling match ---
const memo = new Map<string, string>();
const matchOf = new Map<string, number[]>(); // tCode -> indices of congruent scout cells
let done = 0;
for (const [code, cell] of recon) {
	const hits: number[] = [];
	for (let i = 0; i < mine.length; i++) {
		if (cellsCongruent(mine[i], cell, memo)) hits.push(i);
	}
	matchOf.set(code, hits);
	if (hits.length !== 1) log(`✗ ${code}: ${hits.length} congruent scout cells (need exactly 1)`);
	if (++done % 10 === 0) log(`  …${done}/61 oracle entries matched`);
}

const exact = [...matchOf.values()].filter((h) => h.length === 1);
const hitCounts = new Map<number, number>();
for (const h of exact) hitCounts.set(h[0], (hitCounts.get(h[0]) ?? 0) + 1);
const doubled = [...hitCounts.entries()].filter(([, n]) => n > 1);
const unmatchedMine = mine.map((_, i) => i).filter((i) => !hitCounts.has(i));

log(`oracle entries with exactly one scout match: ${exact.length}/61`);
log(`t3007 matched: ${matchOf.get('t3007')?.length === 1}`);
log(`scout cells matched by ≥2 oracle entries (duplicates): ${doubled.length}`);
log(`scout cells matched by NO oracle entry: ${unmatchedMine.length}`);

const pass =
	reconErrors === 0 && exact.length === 61 && doubled.length === 0 && unmatchedMine.length === 0;
log(pass ? '★ PASS — 61/61 per-tiling bijection, t3007 present, no duplicates' : '✗ FAIL — see above');
process.exit(pass ? 0 : 1);
