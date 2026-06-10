/*
 * Delaney–Dress Stage-1 WALL PROBE (the M1 gate deliverable). No realization (M2 gated).
 *
 *   pnpm tsx scripts/dsym-probe.ts [maxK] [ns] [budgetMnodes] [sizeCap]
 *   e.g.  pnpm tsx scripts/dsym-probe.ts 4 3,4,6           # matched to orbifold baseline
 *         pnpm tsx scripts/dsym-probe.ts 4 3,4,6,8,12      # full certification family (⊇11)
 *
 * Reports, per k: ΣcandidateSymbols (the analog of orbifold's ΣcandidateLattices 183→3103→186190),
 * whether the SOUND generator COMPLETED the proven B1 envelope δ≤12k (TA review #5 — a wall is the
 * verdict, never silently truncated), the D-set count, nodes, time, and a deterministic digest.
 * The base D-set enumeration is the published canonical-augmentation order (no invented prune).
 */
import { generateCandidateSymbols } from '@/classes/algorithm/delaney';

const maxK = parseInt(process.argv[2] ?? '4', 10);
const ns = process.argv[3] ? process.argv[3].split(',').map(Number) : [3, 4, 6, 8, 12];
const budgetM = process.argv[4] ? parseInt(process.argv[4], 10) : 300; // million DFS nodes / k
const sizeCap = process.argv[5] ? parseInt(process.argv[5], 10) : undefined; // optional cap below 12k

console.log(
  `Delaney–Dress Stage-1 probe — P={${ns.join(',')}}  budget=${budgetM}M nodes/k` +
    (sizeCap ? `  sizeCap=${sizeCap}` : ''),
);
console.log('orbifold baseline (ΣcandidateLattices, {3,4,6}): k=1 183, k=2 3103, k=3 186190');
console.log('—');

for (let k = 1; k <= maxK; k++) {
  const bound = sizeCap ? Math.min(12 * k, sizeCap) : 12 * k;
  const t0 = Date.now();
  const r = generateCandidateSymbols(k, ns, bound, { maxNodes: budgetM * 1_000_000 });
  const ms = Date.now() - t0;

  // deterministic composition digest over the sorted canonical keys (probe-pipeline.ts:64-67 pattern)
  const ids = r.symbols.map((s) => s.canonicalKey()).sort();
  let h = 5381n;
  for (const c of ids.join('|')) h = ((h * 33n) ^ BigInt(c.codePointAt(0)!)) & 0xffffffffffffffffn;

  const provable = bound === 12 * k;
  const status = r.completed
    ? provable
      ? 'COMPLETE (provably exhaustive ≤ δ=12k)'
      : `COMPLETE ≤ δ=${bound} (capped < 12k ⇒ LOWER BOUND, not provably complete)`
    : `⚑ WALLED @ ${budgetM}M nodes, δ≤${bound} ⇒ LOWER BOUND, NOT provably complete`;

  console.log(
    `k=${k}  δ≤${bound}  candidateSymbols=${r.candidateSymbols}  ${status}\n` +
      `        dsets=${r.dsetsGenerated} nodes=${r.nodesUsed} ${(ms / 1000).toFixed(1)}s digest=${h.toString(16)}`,
  );
}
