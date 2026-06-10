/*
 * TH-4 — exact star d_max table (constants INPUT to TA's restated Remark 3 / cor:starbox(i);
 * TH-4 is NOT discharged by this table). Spec: docs/superpowers/specs/2026-06-10-th4-th13-star-tables-design.md.
 * Run: pnpm tsx scripts/star-dmax-th4.ts
 * Writes experiments/results/th4-star-dmax-<commit>-<date>.log synchronously; exit 1 on any check failure.
 */
import { execSync } from 'node:child_process';
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { computeDmaxTable, degree7FalsifierPresent, STRATA, type DmaxRow } from '@/classes/algorithm/StarTables';
import type { R2Stratum } from '@/classes/algorithm/StarDmaxRoute2';

const commit = execSync('git rev-parse --short HEAD').toString().trim();
const date = new Date().toISOString().slice(0, 10);
const file = `experiments/results/th4-star-dmax-${commit}-${date}.log`;
mkdirSync('experiments/results', { recursive: true });
writeFileSync(file, '');
const out = (line = '') => { console.log(line); appendFileSync(file, line + '\n'); };

out(`=== TH-4 — exact star d_max table (commit ${commit}, ${date}) ===`);
out();
out('PREMISES (stated, not inherited from the enumerator — see spec §"Stated premises"):');
out('  P1 (≤1 dent/vertex): dents are reflex, β = 24 − 24/n − α > 12 units; two reflex corners sum > 24u = 2π. ∎');
out('  P2 (no two adjacent points): isotoxal star edges run point→dent; two adjacent points at v put a dent');
out("     of EACH star at the shared edge's far endpoint — two reflex corners > 2π by P1's arithmetic. ∎");
out('     (Both k-independent. Myers prune (iii) — ≥1 point, uniformity-only, TH-5 — is used NOWHERE here.)');
out('  P3 (scope, inherited NOT derived): n ∈ {3,4,6,8,12}, 0 < α < 12(n−2)/n, π/12 units (32 variants).');
out('     ⚑ If the star scope widens (n=24, off-ring α), every constant below must be recomputed.');
out('  P4 (degree = t over TRUE vertices): t ≥ 3 per def:tiling-vertex; t=2 dent-fills are non-vertices.');
out('  Strata: Fig-4 = 0 dents | Fig-3(=1) = exactly 1 (the TH-3 Γ⋆ stratum) | Fig-3(≤1) = identity');
out('     max(Fig-4, Fig-3(=1)) — reported for the work order, adds no information beyond the identity check.');
out();
out('Route 2 (PUBLISHED) = independent multiset engine (StarDmaxRoute2: P3 formulas, zero StarVC imports).');
out('Route 1 (CHECK) = enumerateStarVCs (prunes (i)/(ii) verbatim; prune (iii) hard-coded at StarVC.ts:134');
out('  is bypassed via computed point-free fold-backs: pure-regular ≤ 6; dent-no-point β ≥ 13 ⇒ t ≤ 3).');
out('Per-cell agreement + the Fig-3(≤1) identity are HARD GATES (exit 1 on failure).');
out();

const t0 = Date.now();
const cellStr = (row: DmaxRow, s: R2Stratum) =>
	`${row.cells[s].route2.dmax}${row.cells[s].agree ? '' : ` ✗R1=${row.cells[s].route1}`}`;
const { rows, allChecksPass } = computeDmaxTable((row, i, total) => {
	const el = (Date.now() - t0) / 1000;
	const eta = (el / (i + 1)) * (total - i - 1);
	out(`  [${String(i + 1).padStart(2)}/${total}] ${row.label.padEnd(19)} fig4=${cellStr(row, 'fig4')}  fig3(=1)=${cellStr(row, 'fig3eq1')}  fig3(≤1)=${cellStr(row, 'fig3le1')}${row.identityOk ? '' : '  ✗ IDENTITY'}  [${el.toFixed(1)}s, ETA ${eta.toFixed(0)}s]`);
});

out();
out('ENVELOPE WITNESSES (Route 2):');
for (const label of ['envelope-dentreg-19', 'envelope-all-32']) {
	const row = rows.find((r) => r.label === label)!;
	for (const s of STRATA) out(`  ${label} ${s}: d=${row.cells[s].route2.dmax}  [${row.cells[s].route2.witness.join(', ')}]`);
}

const get = (label: string) => rows.find((r) => r.label === label)!;
const checks: [string, boolean][] = [
	['regular-only fig4 == 6 (recovers the regular bound)', get('regular-only').cells.fig4.route2.dmax === 6],
	['regular-only fig3(=1) == 0 (no dents in alphabet ⇒ empty stratum)', get('regular-only').cells.fig3eq1.route2.dmax === 0],
	['envelope-all-32 fig4 == 9', get('envelope-all-32').cells.fig4.route2.dmax === 9],
	['envelope-dentreg-19 fig4 == 9', get('envelope-dentreg-19').cells.fig4.route2.dmax === 9],
	['every F(n,1) fig4 == 9', [3, 4, 6, 8, 12].every((n) => get(`F(${n},1)`).cells.fig4.route2.dmax === 9)],
	['every F(n,2) fig4 == 8', [3, 4, 6, 8, 12].every((n) => get(`F(${n},2)`).cells.fig4.route2.dmax === 8)],
	['envelope-all-32 fig3(=1) == 6', get('envelope-all-32').cells.fig3eq1.route2.dmax === 6],
	['degree-7 falsifier present in the enumeration (sanity anchor)', degree7FalsifierPresent()],
	['per-cell route agreement + Fig-3(≤1) identity on ALL rows', allChecksPass],
];
let pass = true;
out();
out('PINNED EXPECTATIONS (hand-derived in the spec):');
for (const [name, ok] of checks) { out(`  ${ok ? '✓' : '✗'} ${name}`); pass = pass && ok; }

const dmaxEnv = get('envelope-all-32').cells.fig3le1.route2.dmax; // covers both strata (fig3(=1) ≤ this)
out();
out("CONSEQUENCE FOR TA (constants input — TH-4 is discharged by TA's re-proved transfer, not here):");
out(`  d_max(in-ring envelope, all strata) = ${dmaxEnv}`);
out(`  ⇒ δ ≤ 2k·d_max = ${2 * dmaxEnv}k   (restated Remark 3; vs crude guess ≈11 ⇒ 22k; regular-derived 12k is FALSE for stars)`);
out(`  ⇒ F ≤ (d_max/2 − 1)·12k = ${(dmaxEnv / 2 - 1) * 12}k   (cor:starbox(i) with the exact constant)`);
out();
out(`${pass ? 'ALL CHECKS PASSED' : '✗ CHECK FAILURES — table NOT publishable'}  (${((Date.now() - t0) / 1000).toFixed(1)}s total)`);
process.exit(pass ? 0 : 1);
