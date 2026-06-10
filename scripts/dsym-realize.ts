/* M2 acceptance driver — realize every M1 survivor and certify it (Lemma R end-to-end).
 * Run: pnpm tsx scripts/dsym-realize.ts <k> <tiles> [budgetM]
 *   e.g. pnpm tsx scripts/dsym-realize.ts 1 3,4,6,8,12
 *        pnpm tsx scripts/dsym-realize.ts 2 3,4,6,8,12 500
 *
 * Pipeline per symbol: angle gate (step 1) → realizeSymbol (steps 2–6: exact development,
 * holonomy → Schreier → exact HNF Λ, Λ-quotient cell at δ·|G₀|) → PeriodSolver.certifyExternalCell
 * (lem:corona — accept-side soundness independent of B2.2) → KUniformityChecker vertex-orbit
 * cross-check (free differential oracle: must equal the symbol's {1,2}-component count).
 *
 * Then dedupeByCongruence over the realized cells: by lem:ddrealize (B2.3+B2.6+B2.7) distinct
 * minimal symbols realize non-congruent tilings, so |deduped| MUST equal |symbols| — any merge
 * is reported LOUD. If a torus-scout crash artifact /tmp/scout-k<k>.ndjson exists, the script
 * additionally congruence-matches the two catalogues per-tiling (M3 cross-check).
 *
 * Logs synchronously (progress + ETA) to experiments/results/ per the experiments rule.
 */
import fs from 'node:fs';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import {
  generateCandidateSymbols,
  angleGate,
  realizeSymbol,
  allowedVCNames,
  kUniformity,
} from '@/classes/algorithm/delaney';
import { PeriodSolver, type PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { dedupeByCongruence, cellsCongruent } from '@/classes/algorithm/TilingCongruence';
import { canonicalVCName } from '@/classes/algorithm/StarVC';
import { readResumeNdjson, deserializeCell } from './scoutCodec';

const k = parseInt(process.argv[2] ?? '1', 10);
const tiles = (process.argv[3] ?? '3,4,6,8,12').split(',').map(Number);
const budgetM = process.argv[4] ? parseInt(process.argv[4], 10) : 500;

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

const logPath = `experiments/results/m2-realizer-k${k}-${new Date().toISOString().slice(0, 10)}.log`;
const logLines: string[] = [];
function log(s: string): void {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`;
  console.log(line);
  logLines.push(line);
  fs.writeFileSync(logPath, logLines.join('\n') + '\n');
}

log(`M2 realizer acceptance — k=${k} P={${tiles.join(',')}} δ≤${12 * k} budget=${budgetM}M nodes`);

// --- M1: generate the minimal flat symbols (the survivors) -------------------
const t0 = Date.now();
const gen = generateCandidateSymbols(k, tiles, 12 * k, { maxNodes: budgetM * 1_000_000 });
log(
  `M1: candidateSymbols=${gen.candidateSymbols} (${gen.completed ? 'COMPLETE' : '⚑ WALLED — lower bound only'}) ` +
    `nodes=${gen.nodesUsed} ${(Date.now() - t0) / 1000}s`,
);
if (!gen.completed) log('⚑ generation walled: the realization below covers ONLY the generated survivors');

// --- M2: realize + certify each survivor -------------------------------------
const allowed = allowedVCNames(tiles, ring.N, canonicalVCName);
log(`allowed VC alphabet over P: ${allowed.size} names`);
const solver = new PeriodSolver(k);
const checker = new KUniformityChecker();

const cells: PeriodCell[] = [];
let idx = 0;
let rejected = 0;
const tStage = Date.now();
for (const sym of gen.symbols) {
  idx++;
  const gate = angleGate(sym);
  if (gate.flat === false) {
    // cannot happen: the generator filters by perComponentFlat — a hit means gate≠B2.5 (bug)
    throw new Error(`angle gate rejected a generated symbol (component ${gate.component.join(',')})`);
  }
  const r = realizeSymbol(sym, ring);
  const certified = solver.certifyExternalCell(r.cell, allowed, tiles);
  if (!certified) {
    rejected++;
    log(`⚑ symbol ${idx}/${gen.symbols.length}: corona certificate REJECTED (δ=${sym.n}, |G₀|=${r.pointGroupOrder}) — lem:ddrealize violated?`);
    continue;
  }
  const kReal = checker.countVertexOrbits(r.cell.cellPolygons, r.cell.basisExact[0], r.cell.basisExact[1]);
  if (kReal !== kUniformity(sym)) {
    throw new Error(`symbol ${idx}: realized vertex orbits ${kReal} ≠ symbol components ${kUniformity(sym)}`);
  }
  cells.push(r.cell);
  const dt = (Date.now() - tStage) / 1000;
  log(
    `symbol ${idx}/${gen.symbols.length}: REALIZED+CERTIFIED δ=${sym.n} |G₀|=${r.pointGroupOrder} ` +
      `cellTiles=${r.cell.cellPolygons.length} k✓  [${dt.toFixed(1)}s, ETA ${((dt / idx) * (gen.symbols.length - idx)).toFixed(0)}s]`,
  );
}

// --- counting: distinct minimal symbols must stay distinct under congruence ---
const deduped = dedupeByCongruence(cells);
log(`RESULT: realized+certified=${cells.length} rejected=${rejected} congruence-classes=${deduped.length}`);
if (deduped.length !== cells.length) {
  log(`⚑⚑ CONGRUENCE MERGE: ${cells.length} symbols → ${deduped.length} tilings — contradicts B2.3+B2.6 (investigate!)`);
}

// --- optional M3 cross-check vs a torus-scout artifact ------------------------
// Prefer the exact-tiles artifact; else any uncapped artifact for this k (a smaller torus
// alphabet is fine for the per-tiling comparison — e.g. k=2 {3,4,6,12} vs D-D {3,4,6,8,12},
// where the octagon-bearing extras provably don't exist; a mismatch would surface LOUD below).
let scoutFile = `.scout-cache/k${k}_${tiles.join('.')}_cap0.ndjson`;
if (!fs.existsSync(scoutFile)) {
  const alt = fs.existsSync('.scout-cache')
    ? fs.readdirSync('.scout-cache').find((f) => f.startsWith(`k${k}_`) && f.endsWith('_cap0.ndjson'))
    : undefined;
  if (alt) {
    scoutFile = `.scout-cache/${alt}`;
    log(`(exact-tiles artifact missing — falling back to ${scoutFile})`);
  }
}
if (fs.existsSync(scoutFile)) {
  const { cells: scells } = readResumeNdjson(scoutFile);
  const torus = dedupeByCongruence(scells.map((sc) => deserializeCell(ring, sc)));
  log(`torus artifact: ${scells.length} raw cells → ${torus.length} congruence classes`);
  let matched = 0;
  const memo = new Map<string, string>();
  const unmatchedDD: number[] = [];
  for (let i = 0; i < deduped.length; i++) {
    const hit = torus.some((tc) => cellsCongruent(deduped[i], tc, memo));
    if (hit) matched++;
    else unmatchedDD.push(i);
  }
  const unmatchedTorus = torus.filter((tc) => !deduped.some((dc) => cellsCongruent(dc, tc, memo))).length;
  log(`M3 cross-check: D-D∩torus=${matched}/${deduped.length}; D-D-only=${unmatchedDD.length}; torus-only=${unmatchedTorus}`);
  log(
    matched === deduped.length && unmatchedTorus === 0 && deduped.length === torus.length
      ? '★ PER-TILING MATCH — the two independent catalogues coincide'
      : '⚑ catalogues DIFFER — list above; do not certify',
  );
} else {
  log(`(no ${scoutFile} — torus cross-check skipped; run scout-parallel ${k} first for the M3 leg)`);
}
log('done.');
