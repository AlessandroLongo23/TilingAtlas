// scripts/figure-select.ts — run: pnpm tsx scripts/figure-select.ts figures/traces/_probe
// Summarizes the figure-trace JSONL a probe run produced, so we can pick a legible k=2 example.
import * as fs from 'node:fs';
import * as path from 'node:path';

const dir = process.argv[2] ?? 'figures/traces/_probe';
const read = (stage: string): Record<string, unknown>[] => {
  const f = path.join(dir, `${stage}.jsonl`);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
};
const tally = (rows: Record<string, unknown>[], key: string): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const r of rows) { const v = String(r[key]); m[v] = (m[v] ?? 0) + 1; }
  return m;
};

const vc = read('vc'), seed = read('seed'), pool = read('pool'), lattice = read('lattice'), torus = read('torus');

console.log(`trace dir: ${dir}`);
console.log(`file line counts: vc=${vc.length} seed=${seed.length} pool=${pool.length} lattice=${lattice.length} torus=${torus.length}`);

console.log('\n=== VC search (global, k-independent) ===');
console.log('nodes', vc.length, 'verdicts', tally(vc, 'verdict'));

console.log('\n=== Seed BFS (by seedSet) ===');
if (seed.length === 0) console.log('(seed trace empty — SeedBuilder hook deferred)');
const bySeed: Record<string, Record<string, unknown>[]> = {};
for (const r of seed) { const k = String(r.seedSet); (bySeed[k] ??= []).push(r); }
for (const [k, rows] of Object.entries(bySeed)) console.log(k, '→ nodes', rows.length, tally(rows, 'verdict'));

console.log('\n=== Pool / lattice ===');
for (const p of pool) console.log('pool: vectors', (p.vectors as unknown[]).length, 'steps', p.steps, 'lmax', p.lmax, 'N', p.N);
for (const l of lattice) console.log('lattice: candidates', (l.candidates as unknown[]).length, 'p0Skip', l.p0Skipped, 'cSkip', l.cSkipped, 'vcSig', l.vcSig);

console.log('\n=== Torus fill (by fillId) ===');
const byFill: Record<string, Record<string, unknown>[]> = {};
for (const r of torus) { const f = String(r.fillId); (byFill[f] ??= []).push(r); }
// each fill's k comes from its root event
const rows: { fillId: string; k: unknown; nodes: number; emitted: boolean; latKey: unknown; v: Record<string, number> }[] = [];
for (const [f, rs] of Object.entries(byFill)) {
  const root = rs.find((r) => r.verdict === 'root');
  rows.push({ fillId: f, k: root?.k ?? '?', nodes: rs.length, emitted: rs.some((r) => r.verdict === 'emit'), latKey: root?.latKey ?? rs[0]?.latKey, v: tally(rs, 'verdict') });
}
// legible k=2 candidates first: emitted, moderate node count
rows.sort((a, b) => Number(a.k) - Number(b.k) || a.nodes - b.nodes);
for (const r of rows) console.log(`fill ${r.fillId} k=${r.k} nodes=${r.nodes} emitted=${r.emitted} latKey=${r.latKey}`, r.v);

console.log('\n=== k=2 fills that emitted, by node count (figure candidates) ===');
for (const r of rows.filter((r) => Number(r.k) === 2 && r.emitted).sort((a, b) => a.nodes - b.nodes))
  console.log(`  fill ${r.fillId}: ${r.nodes} nodes, latKey=${r.latKey}`);
