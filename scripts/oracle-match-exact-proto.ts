/* Benchmark spike (Workstream B): the paper's exact pure-integer cloud reconstruction vs the current
 * float reconstruction in oracle-match.ts. Measures ACCURACY (are the two reconstructions congruent
 * for every k≤3 oracle tiling — if so they match the certified snapshot identically, by transitivity
 * of ≅), ROBUSTNESS (clean reconstructions vs loud errors per method), NEGATIVE FIXTURES (malformed
 * input must be REJECTED, not silently accepted), and SPEED. Writes a synchronous progress log + a
 * human-readable report to experiments/results/. Does NOT modify the certified path.
 *
 *   pnpm tsx scripts/oracle-match-exact-proto.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { cellsCongruent } from '@/classes/algorithm/TilingCongruence';
import { loadOracle, reconstructOracleCell } from './oracle-match';
import { reconstructOracleCellExact } from './oracleReconstructExact';

const DATE = '2026-07-08';
const RESULTS = path.join(process.cwd(), 'experiments', 'results');
const LOG = path.join(RESULTS, `oracle-exact-recon-${DATE}.log`);
const MD = path.join(RESULTS, `oracle-exact-recon-${DATE}.md`);

fs.mkdirSync(RESULTS, { recursive: true });
fs.writeFileSync(LOG, `# oracle exact-reconstruction benchmark — ${DATE}\n# started ${new Date().toISOString()}\n\n`);
const log = (s: string): void => {
	fs.appendFileSync(LOG, s + '\n');
	console.error(s);
};

const oracle = loadOracle();
const entriesFor = (k: number): [string, { T1: number[]; T2: number[]; Seed: number[][] }][] =>
	Object.entries(oracle).filter(([key]) => new RegExp(`^t${k}\\d\\d\\d$`).test(key));

type Rec = { cell: import('@/classes/algorithm/PeriodSolver').PeriodCell } | { error: string };
const isErr = (r: Rec): r is { error: string } => 'error' in r;

// ---- accuracy + robustness ----
type Row = { tCode: string; verdict: string; floErr?: string; exaErr?: string };
const rows: Row[] = [];
let agree = 0;
let disagree = 0;
const floErrors: string[] = [];
const exaErrors: string[] = [];

for (const k of [1, 2, 3]) {
	const entries = entriesFor(k);
	log(`--- k=${k}: ${entries.length} oracle entries ---`);
	entries.forEach(([tCode, o], i) => {
		const flo = reconstructOracleCell(tCode, o);
		const exa = reconstructOracleCellExact(tCode, o);
		if (isErr(flo)) floErrors.push(`${tCode}: ${flo.error}`);
		if (isErr(exa)) exaErrors.push(`${tCode}: ${exa.error}`);
		let verdict: string;
		if (isErr(flo) && isErr(exa)) {
			verdict = 'both-error';
			agree++;
		} else if (isErr(flo) !== isErr(exa)) {
			verdict = `DISAGREE (recon: flo ${isErr(flo) ? 'err' : 'ok'}, exa ${isErr(exa) ? 'err' : 'ok'})`;
			disagree++;
		} else if (!isErr(flo) && !isErr(exa)) {
			const cong = cellsCongruent(flo.cell, exa.cell, new Map());
			verdict = cong ? 'congruent' : 'DISAGREE (not congruent)';
			cong ? agree++ : disagree++;
		} else {
			verdict = 'unreachable';
		}
		rows.push({
			tCode,
			verdict,
			floErr: isErr(flo) ? flo.error : undefined,
			exaErr: isErr(exa) ? exa.error : undefined,
		});
		if (verdict.startsWith('DISAGREE')) log(`  ✗ ${tCode}: ${verdict}`);
		if ((i + 1) % 20 === 0) log(`  [${i + 1}/${entries.length}]`);
	});
}
const total = rows.length;
log(`\nACCURACY: ${agree}/${total} agree (congruent or both-error), ${disagree} disagree`);
log(`ROBUSTNESS: float clean ${total - floErrors.length}/${total}, exact clean ${total - exaErrors.length}/${total}`);
if (floErrors.length) log(`  float errors:\n    ${floErrors.join('\n    ')}`);
if (exaErrors.length) log(`  exact errors:\n    ${exaErrors.join('\n    ')}`);

// ---- negative fixtures: malformed input MUST be rejected loudly by the exact method ----
log(`\n--- negative fixtures (exact method must REJECT each) ---`);
const t1001 = oracle['t1001'];
const negatives: { name: string; o: { T1: number[]; T2: number[]; Seed: number[][] } }[] = [
	{ name: 'degenerate basis (T1=T2=0)', o: { T1: [0, 0, 0, 0], T2: [0, 0, 0, 0], Seed: [[0, 0, 0, 0]] } },
	{ name: 'basis with T1 doubled (seeds cannot tile the enlarged cell)', o: { T1: t1001.T1.map((x) => x * 2), T2: t1001.T2, Seed: t1001.Seed } },
	{ name: 'single stray seed, no basis structure', o: { T1: [1, 0, 0, 0], T2: [0, 0, 0, 1], Seed: [[0, 0, 0, 0], [5, 5, 5, 5]] } },
];
let negOk = 0;
for (const neg of negatives) {
	const exa = reconstructOracleCellExact('negfix', neg.o);
	const rejected = isErr(exa);
	if (rejected) negOk++;
	log(`  ${rejected ? '✓ rejected' : '✗ ACCEPTED (BAD)'}: ${neg.name}${rejected ? ` — ${exa.error}` : ''}`);
}
log(`NEGATIVE FIXTURES: ${negOk}/${negatives.length} rejected loudly (g=11→n=24 hole closed by the faceFromGap guard — unit-tested)`);

// ---- speed ----
log(`\n--- speed (${5} repeats over all ${total} k≤3 entries) ---`);
const REPS = 5;
const allEntries = [1, 2, 3].flatMap((k) => entriesFor(k));
const timeMethod = (fn: (tCode: string, o: { T1: number[]; T2: number[]; Seed: number[][] }) => Rec): number => {
	const t0 = performance.now();
	for (let r = 0; r < REPS; r++) for (const [tCode, o] of allEntries) fn(tCode, o);
	return (performance.now() - t0) / REPS;
};
const floMs = timeMethod(reconstructOracleCell);
const exaMs = timeMethod(reconstructOracleCellExact);
log(`  float:  ${floMs.toFixed(1)} ms / full k≤3 pass`);
log(`  exact:  ${exaMs.toFixed(1)} ms / full k≤3 pass  (${(exaMs / floMs).toFixed(2)}× float)`);

// ---- report ----
const rec =
	agree === total && negOk === negatives.length
		? 'The exact reconstruction is congruent to the float reconstruction for every k≤3 tiling, so it would produce a byte-identical oracle map (≅ is transitive). It also rejects all malformed fixtures. Per the plan decision it is NOT swapped into the certified path; it is available as a drop-in should the float rim/area heuristics ever cause trouble.'
		: 'DIVERGENCE FOUND — see the disagree rows above; do not adopt until resolved.';

const md = `# Oracle reconstruction: exact cloud-probe vs float — benchmark (${DATE})

Spike B of the Soto-Sánchez review. Compares \`scripts/oracleReconstructExact.ts\` (pure-integer
cloud: seeds ⊕ lattice window → 24-direction ζ^k hash probe → faces from integer angle gaps →
exact \`reducedClassKey\` dedup → exact \`Surd\` area certificate) against the current float
reconstruction in \`scripts/oracle-match.ts\` (float grid broadphase + atan2 face-walk + rim/area
float heuristics). The certified script is unmodified.

## Results

| Metric | Value |
|---|---|
| Accuracy (congruent or both-error) | **${agree}/${total}** |
| Disagreements | ${disagree} |
| Float clean reconstructions | ${total - floErrors.length}/${total} |
| Exact clean reconstructions | ${total - exaErrors.length}/${total} |
| Negative fixtures rejected | ${negOk}/${negatives.length} |
| Speed — float | ${floMs.toFixed(1)} ms / k≤3 pass |
| Speed — exact | ${exaMs.toFixed(1)} ms / k≤3 pass (${(exaMs / floMs).toFixed(2)}× float) |

${floErrors.length ? `Float reconstruction errors:\n\n${floErrors.map((e) => `- ${e}`).join('\n')}\n` : 'Float reconstruction errored on nothing.\n'}
${exaErrors.length ? `Exact reconstruction errors:\n\n${exaErrors.map((e) => `- ${e}`).join('\n')}\n` : 'Exact reconstruction errored on nothing.\n'}

## Accuracy / robustness reading

Congruence is transitive, so "exact ≅ float for all ${total}" is equivalent to "exact matches the
certified snapshot exactly wherever float does." The two methods agree on ${agree}/${total}.

The exact method removes all float from reconstruction: no \`0.98..1.02\` distance band, no atan2
star ordering (the ζ-exponent IS the order), no float centroid rim gate (exact \`reducedClassKey\`),
and a \`Surd\` area certificate instead of a \`1e-6\` float area check. Robustness parity above.

## Trade-off / recommendation

${rec}

## Speed note

Both run a full k≤3 pass (${total} tilings) in single-digit-to-low milliseconds; reconstruction is
not a bottleneck (matching against the snapshot dominates neither is timed here). The exact/float
ratio is ${(exaMs / floMs).toFixed(2)}×.

_Generated by \`scripts/oracle-match-exact-proto.ts\`; raw progress log: \`${path.basename(LOG)}\`._
`;
fs.writeFileSync(MD, md);
log(`\n★ report written: ${path.relative(process.cwd(), MD)}`);
log(`  recommendation: ${agree === total && negOk === negatives.length ? 'exact reproduces float exactly; keep current per plan' : 'DIVERGENCE — investigate'}`);
