/*
 * TH-13 — dent-fill γ-feasibility table (scopes TA's lemma attempt; TH-13 is NOT discharged by
 * this table). Spec: docs/superpowers/specs/2026-06-10-th4-th13-star-tables-design.md.
 * Run: pnpm tsx scripts/star-dentfill-th13.ts
 * Writes experiments/results/th13-dentfill-table-<commit>-<date>.log synchronously; exit 1 on failure.
 */
import { execSync } from 'node:child_process';
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { computeDentFillTable } from '@/classes/algorithm/StarTables';

const commit = execSync('git rev-parse --short HEAD').toString().trim();
const date = new Date().toISOString().slice(0, 10);
const file = `experiments/results/th13-dentfill-table-${commit}-${date}.log`;
mkdirSync('experiments/results', { recursive: true });
writeFileSync(file, '');
const out = (line = '') => { console.log(line); appendFileSync(file, line + '\n'); };

out(`=== TH-13 — dent-fill γ-feasibility table (commit ${commit}, ${date}) ===`);
out();
out('Per in-ring variant (n,α): dent β = 24 − 24/n − α; dent-fill angle γ = 24 − β = 24/n + α.');
out('ALL columns computed from the P3 formulas, none asserted; cross-checked against the live filter.');
out('Verdicts: REGULAR-FILLABLE (kept by dentRegularFillableVariants today) | POINT-ONLY (dropped today;');
out('  star-point-fillable in the MIXED universe only) | UNFILLABLE (no single corner — provably Fig-4-absent,');
out("  sharper than the filter's current justification). Gear column = first rung of lem:dentchain:");
out("  each point filler m*@γ's own dent-fill angle γ′ = 24/m + γ and its fill class.");
out();

const t0 = Date.now();
const { rows, counts, crossChecksPass, crossCheckLog } = computeDentFillTable();
const vkey = (v: { n: number; alphaU: number }) => `${v.n}*@${v.alphaU}`;
out('variant      β   γ   reg-matches   same-fam-pt   cross-fam-pt-matches          dent   verdict');
for (const r of rows) {
	out(
		`${vkey(r).padEnd(11)} ${String(r.betaU).padStart(3)} ${String(r.gammaU).padStart(3)}   ` +
		`${(r.regularMatches.join(',') || '—').padEnd(13)} ${(r.sameFamilyPointMatch ? '⚠ YES' : 'no').padEnd(13)} ` +
		`${(r.crossFamilyPointMatches.map(vkey).join(' ') || '—').padEnd(29)} ` +
		`${(r.dentMatches.length ? '⚠' : '∅').padEnd(6)} ${r.verdict}`,
	);
	for (const g of r.gear) out(`             gear: ${vkey(g.filler)} fills → its own γ′=${g.gammaPrimeU} is ${g.cls}`);
}

out();
out(`VERDICT COUNTS: ${counts['REGULAR-FILLABLE']} REGULAR-FILLABLE / ${counts['POINT-ONLY']} POINT-ONLY / ${counts['UNFILLABLE']} UNFILLABLE`);
out();
out('CROSS-CHECKS:');
for (const line of crossCheckLog) out(`  ${line}`);
out();
out('RIDER (verified by the same-family column): in any tiling whose stars are ALL one variant (n,α),');
out('  no dent can be star-point-filled (γ = α + 24/n ≠ α) ⇒ the regular-filler hypothesis holds');
out('  UNCONDITIONALLY for single-variant in-ring tilings. The at-risk class is MIXED-variant only;');
out('  gear chains (lem:dentchain) require ≥ 2 distinct variants.');
out();
out("⚑ TH-13 is NOT discharged by this table — it scopes TA's lemma attempt (vacuous where no point");
out('  match exists; the local-exclusion attempt is needed exactly on the cross-family matches above).');
out(`${crossChecksPass ? 'ALL CROSS-CHECKS PASSED' : '✗ CROSS-CHECK FAILURES — table NOT publishable'}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(crossChecksPass ? 0 : 1);
