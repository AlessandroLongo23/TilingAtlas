import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { assembleComplex } from './complexAssembler';

// The k=2 two-parameter isotoxal families as 2-cells. assembleComplex reports homology on the
// genuine-tiling subcomplex (⊥ removed — the headline) and the full complex (with ⊥). It throws if any
// stitched face boundary is not a closed cycle (∂1∂2 ≠ 0), so a clean run is itself the validity
// certificate — there is no separate self-check flag.
const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const recs = (Array.isArray(atlas) ? atlas : atlas.records) as {
  family?: string; k?: number; source?: string; paramCell?: { params?: unknown[] };
}[];
const cluster = recs.filter(
  (r) => r.k === 2 && r.source === 'isotoxal' && r.paramCell?.params?.length === 2,
);

const c = assembleComplex(cluster as never[]);
mkdirSync('experiments/results', { recursive: true });
writeFileSync('experiments/results/moduli-complex-k2.json', JSON.stringify(c, null, 2));

const byFamily = new Map<string, number>();
for (const r of cluster) byFamily.set(r.family ?? '?', (byFamily.get(r.family ?? '?') ?? 0) + 1);
const nonProduct = c.faces.filter((f) => !f.productOK).map((f) => f.family);

const degCounts = new Map<string, number>();
for (const f of c.degenerateFaces) degCounts.set(f, (degCounts.get(f) ?? 0) + 1);
console.log(
  `two-parameter families=${cluster.length} [${[...byFamily].map(([f, n]) => `${f}×${n}`).join(' ')}]\n` +
  `cells: V=${c.nodes.length} E=${c.edges.length} F=${c.faces.length}\n` +
  `genuine (⊥ removed): χ=${c.chi} betti=[${c.betti.join(',')}]\n` +
  `full (with ⊥):       χ=${c.full.chi} betti=[${c.full.betti.join(',')}]` +
  (nonProduct.length ? `\nnon-product faces: ${nonProduct.join(', ')}` : '') +
  (degCounts.size ? `\nzero-∂₂ (self-folding, UNVERIFIED b₂) faces: ${[...degCounts].map(([f, n]) => `${f}×${n}`).join(' ')}` : ''),
);
console.log(
  '\nNOTE: b2 > 0 means faces glue into closed surfaces OR fold onto themselves. The zero-∂₂ faces above\n' +
  'are ambiguous (self-fold vs lone torus) and inflate `full` b2 (2 of the 13 are such artifacts); each\n' +
  'b2 generator and each residual b1 loop from boundary node-coincidence needs per-generator geometric\n' +
  'verification before it is a thesis-defensible invariant — see the spec\'s open-questions. The validated\n' +
  'result so far is the single-face disk (one 3.3.3.3.4α face → b=[1,0,0]).',
);
