/*
 * SEED-ANCHORED Delaney–Dress feasibility probe.
 *
 *   pnpm tsx scripts/dsym-seeded-probe.ts [steps]
 *   e.g.  pnpm tsx scripts/dsym-seeded-probe.ts 0,1     # baseline freeze + anchored k=1
 *         pnpm tsx scripts/dsym-seeded-probe.ts 2       # anchored k=2 (the headline)
 *         pnpm tsx scripts/dsym-seeded-probe.ts 3       # anchored k=3 @ δ≤36 (budgeted, LOUD walls)
 *
 * Anchoring idea: fix a candidate vertex-species multiset S (|S|=k, from the pipeline's
 * seed-set enumeration); run the sound D-symbol generator restricted to S (p01/p12 from
 * FACES(S)/DEGREES(S) + per-component unfolded-species filter + exact multiset post-filter).
 * Soundness: every k-uniform tiling with multiset S survives its own anchored run; the
 * union over all enumerated S covers every tiling the pipeline's seed layer covers.
 * Falsifier: anchored unions at k=1/k=2 must equal the unanchored 11/20 BY CANONICAL KEYS.
 *
 * Logs synchronously (progress + ETA, human-readable) to experiments/results/dsym-seeded-probe.log.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateCandidateSymbols, type GenResult } from '@/classes/algorithm/delaney';
import { enumerateSeedSpecies } from './dsym-seeded-species';

const NS = [3, 4, 6, 8, 12];
const RESULTS_DIR = path.resolve(process.cwd(), 'experiments/results');
const LOG = path.join(RESULTS_DIR, 'dsym-seeded-probe.log');
fs.mkdirSync(RESULTS_DIR, { recursive: true });

const log = (line: string) => {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  fs.appendFileSync(LOG, stamped + '\n');
};

/** Deterministic composition digest over sorted canonical keys (dsym-probe.ts formula). */
const digestOf = (keys: string[]): string => {
  const ids = [...keys].sort();
  let h = 5381n;
  for (const c of ids.join('|')) h = ((h * 33n) ^ BigInt(c.codePointAt(0)!)) & 0xffffffffffffffffn;
  return h.toString(16);
};

const keysOf = (r: GenResult): string[] => r.symbols.map((s) => s.canonicalKey()).sort();

const fmtEta = (ms: number): string => {
  if (!Number.isFinite(ms)) return '?';
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 6) / 10;
  return m < 90 ? `${m}min` : `${Math.round(m / 6) / 10}h`;
};

const baselinePath = (k: number) => path.join(RESULTS_DIR, `dsym-seeded-baseline-k${k}.json`);

interface Baseline {
  k: number;
  maxSize: number;
  candidateSymbols: number;
  dsets: number;
  nodes: number;
  digest: string;
  keys: string[];
}

const sameKeys = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// ---------------------------------------------------------------------------
// Step 0 — UNANCHORED baseline freeze (fresh from this exact build)
// ---------------------------------------------------------------------------
function step0(): void {
  log('== STEP 0: unanchored baseline freeze (anchor OFF, this exact build) ==');
  log('   expected from NOTES §23.5: k=1 δ≤12 → 11 (276 dsets, ~18k nodes); k=2 δ≤24 → 20 (~404M nodes, ~12min)');
  for (const [k, bound, expect] of [
    [1, 12, 11],
    [2, 24, 20],
  ] as const) {
    log(`   step0 k=${k} δ≤${bound} starting (budget 450M nodes)${k === 2 ? ' — expect ~12 min, no intra-run progress (single sync DFS)' : ''}`);
    const t0 = Date.now();
    const r = generateCandidateSymbols(k, NS, bound, { maxNodes: 450_000_000 });
    const keys = keysOf(r);
    const b: Baseline = {
      k,
      maxSize: bound,
      candidateSymbols: r.candidateSymbols,
      dsets: r.dsetsGenerated,
      nodes: r.nodesUsed,
      digest: digestOf(keys),
      keys,
    };
    fs.writeFileSync(baselinePath(k), JSON.stringify(b, null, 1));
    const verdict = r.completed ? 'COMPLETE' : '⚑ WALLED @450M — BASELINE INVALID';
    const match = r.candidateSymbols === expect ? `matches §23.5 (${expect})` : `⚑ MISMATCH vs §23.5 expected ${expect}`;
    log(
      `   step0 k=${k} δ≤${bound}: candidateSymbols=${r.candidateSymbols} (${match}) dsets=${r.dsetsGenerated} ` +
        `nodes=${r.nodesUsed} ${verdict} digest=${b.digest} ${((Date.now() - t0) / 1000).toFixed(1)}s → ${baselinePath(k)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Anchored sweep over a list of species multisets
// ---------------------------------------------------------------------------
interface SweepOpts {
  k: number;
  bound: number;
  perRunNodes: number;
  globalNodes?: number;
  label: string;
}

interface SweepOutcome {
  union: Map<string, true>;
  totalNodes: number;
  perRunNodes: number[];
  walled: string[];
  completedRuns: number;
  skipped: string[];
  wallClockMs: number;
}

function sweep(multisets: number[][][], multisetKeys: string[], o: SweepOpts): SweepOutcome {
  const union = new Map<string, true>();
  const perRun: number[] = [];
  const walled: string[] = [];
  const skipped: string[] = [];
  let totalNodes = 0;
  let completedRuns = 0;
  const t0 = Date.now();
  for (let i = 0; i < multisets.length; i++) {
    const key = multisetKeys[i];
    if (o.globalNodes !== undefined && totalNodes >= o.globalNodes) {
      skipped.push(key);
      continue;
    }
    const tRun = Date.now();
    const r = generateCandidateSymbols(o.k, NS, o.bound, { maxNodes: o.perRunNodes, anchor: multisets[i] });
    const ms = Date.now() - tRun;
    totalNodes += r.nodesUsed;
    perRun.push(r.nodesUsed);
    for (const s of r.symbols) union.set(s.canonicalKey(), true);
    if (r.completed) completedRuns += 1;
    else walled.push(key);
    const done = i + 1;
    const eta = fmtEta(((Date.now() - t0) / done) * (multisets.length - done));
    log(
      `   ${o.label} [${done}/${multisets.length}] S={${key}}  nodes=${r.nodesUsed} dsets=${r.dsetsGenerated} ` +
        `survivors=${r.candidateSymbols} union=${union.size} ${(ms / 1000).toFixed(1)}s ` +
        `${r.completed ? 'complete' : `⚑ WALLED @${o.perRunNodes / 1e6}M`}  Σnodes=${(totalNodes / 1e6).toFixed(1)}M ETA=${eta}`,
    );
  }
  if (skipped.length) {
    log(`   ⚑ ${o.label}: GLOBAL BUDGET ${o.globalNodes! / 1e6}M EXHAUSTED — ${skipped.length} multisets NOT RUN: ${skipped.join(' ; ')}`);
  }
  return { union, totalNodes, perRunNodes: perRun, walled, completedRuns, skipped, wallClockMs: Date.now() - t0 };
}

function compareToBaseline(k: number, union: Map<string, true>, label: string): void {
  if (!fs.existsSync(baselinePath(k))) {
    log(`   ⚑ ${label}: no baseline file for k=${k} (run step 0 first) — union=${union.size}, digest=${digestOf([...union.keys()])}`);
    return;
  }
  const base = JSON.parse(fs.readFileSync(baselinePath(k), 'utf8')) as Baseline;
  const unionKeys = [...union.keys()].sort();
  const equal = sameKeys(unionKeys, base.keys);
  if (equal) {
    log(`   ${label}: UNION == UNANCHORED by canonical keys ✓ (${unionKeys.length} symbols, digest=${digestOf(unionKeys)} == baseline ${base.digest})`);
  } else {
    const missing = base.keys.filter((x) => !union.has(x));
    const extra = unionKeys.filter((x) => !base.keys.includes(x));
    log(
      `   ⚑ ${label}: UNION MISMATCH — union=${unionKeys.length} vs baseline=${base.keys.length}; ` +
        `missing=${missing.length} extra=${extra.length} — THE ANCHOR IS LOSING/INVENTING TILINGS`,
    );
    for (const x of missing.slice(0, 5)) log(`      missing key: ${x}`);
    for (const x of extra.slice(0, 5)) log(`      extra key:   ${x}`);
  }
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// ---------------------------------------------------------------------------
// Steps 1–3
// ---------------------------------------------------------------------------
function step1(): void {
  log('== STEP 1: anchored k=1 (δ≤12, per-species) ==');
  const sp = enumerateSeedSpecies(1, NS);
  log(`   pipeline VCs=${sp.vcCount} (rotation-canonical names) → ${sp.speciesCount} unoriented species; ${sp.multisets.length} anchored runs`);
  const out = sweep(sp.multisets, sp.multisetKeys, { k: 1, bound: 12, perRunNodes: 450_000_000, label: 'k1' });
  log(`   step1 Σnodes=${out.totalNodes} (baseline ~18k) per-species max=${Math.max(...out.perRunNodes)} walled=${out.walled.length} wall-clock=${fmtEta(out.wallClockMs)}`);
  compareToBaseline(1, out.union, 'step1');
}

function step2(): void {
  log('== STEP 2: anchored k=2 (δ≤24, per-multiset) — THE HEADLINE MEASUREMENT ==');
  const sp = enumerateSeedSpecies(2, NS);
  log(`   pipeline seed multisets=${sp.rawSeedSetCount} (multi-VC filtered; ⚑ {X,X} same-species multisets excluded by the pipeline's monogonal⇒uniform assumption) → ${sp.multisets.length} after unoriented projection-dedup`);
  const out = sweep(sp.multisets, sp.multisetKeys, { k: 2, bound: 24, perRunNodes: 450_000_000, label: 'k2' });
  log(
    `   step2 Σnodes=${(out.totalNodes / 1e6).toFixed(1)}M (unanchored baseline ~404M ⇒ ratio ${(out.totalNodes / 404_000_000).toFixed(2)}×) ` +
      `per-multiset max=${(Math.max(...out.perRunNodes) / 1e6).toFixed(1)}M median=${(median(out.perRunNodes) / 1e6).toFixed(2)}M ` +
      `walled=${out.walled.length} wall-clock=${fmtEta(out.wallClockMs)}`,
  );
  if (out.walled.length) log(`   ⚑ step2 walled multisets (LOWER BOUND, not complete): ${out.walled.join(' ; ')}`);
  compareToBaseline(2, out.union, 'step2');
}

function step3(): void {
  log('== STEP 3: anchored k=3 @ PROVEN δ≤36 (50M/multiset, 2000M global — walls are RESULTS, loud) ==');
  const sp = enumerateSeedSpecies(3, NS);
  log(`   pipeline seed multisets=${sp.rawSeedSetCount} (multi-VC filtered; ⚑ {X,X,(Y)} same-species-only multisets excluded upstream) → ${sp.multisets.length} after projection-dedup`);
  const out = sweep(sp.multisets, sp.multisetKeys, {
    k: 3,
    bound: 36,
    perRunNodes: 50_000_000,
    globalNodes: 2_000_000_000,
    label: 'k3',
  });
  const ran = out.perRunNodes.length;
  log(
    `   step3 ran=${ran}/${sp.multisets.length} multisets: completed=${out.completedRuns} ⚑walled=${out.walled.length} ⚑skipped(global budget)=${out.skipped.length} ` +
      `survivors-union=${out.union.size} Σnodes=${(out.totalNodes / 1e6).toFixed(0)}M wall-clock=${fmtEta(out.wallClockMs)}`,
  );
  if (out.walled.length) log(`   ⚑ step3 WALLED multisets: ${out.walled.join(' ; ')}`);
  log(`   step3 union vs known A068599(3)=61: ${out.union.size}${out.walled.length || out.skipped.length ? ' (LOWER BOUND — walls/skips above)' : ' (all multisets COMPLETE at δ≤36)'}`);
  fs.writeFileSync(
    path.join(RESULTS_DIR, 'dsym-seeded-k3-union.json'),
    JSON.stringify({ keys: [...out.union.keys()].sort(), walled: out.walled, skipped: out.skipped }, null, 1),
  );
}

// ---------------------------------------------------------------------------
const steps = (process.argv[2] ?? '0,1,2,3').split(',').map((s) => s.trim());
log(`=== dsym-seeded-probe start: steps {${steps.join(',')}} P={${NS.join(',')}} ===`);
const t0 = Date.now();
if (steps.includes('0')) step0();
if (steps.includes('1')) step1();
if (steps.includes('2')) step2();
if (steps.includes('3')) step3();
log(`=== dsym-seeded-probe done in ${fmtEta(Date.now() - t0)} ===`);
