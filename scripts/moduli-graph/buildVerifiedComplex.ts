import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { verifyComplex } from './verifyComplex';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const recs = (Array.isArray(atlas) ? atlas : atlas.records) as { k?: number; source?: string; paramCell?: { params?: unknown[] } }[];
const cluster = recs.filter((r) => r.k === 2 && r.source === 'isotoxal' && r.paramCell?.params?.length === 2);

const r = verifyComplex(cluster as never[]);
mkdirSync('experiments/results', { recursive: true });
writeFileSync('experiments/results/moduli-complex-k2-verified.json', JSON.stringify(r, null, 2));

const tally: Record<string, number> = {};
for (const g of r.h2) tally[g.surface] = (tally[g.surface] ?? 0) + 1;

console.log(`genuine χ=${r.chi} betti=[${r.betti.join(',')}]`);
console.log(`node margin=${r.nodeMargin} (ε≈1e-4) | edge margin=${r.edgeMargin} differing samples | near-collisions=${r.nearCollisions.length}`);
if (r.nearCollisions.length) console.log(`  ${r.nearCollisions.join('; ')}`);
console.log(`H2 generators (${r.h2.length}) — surface tally ${JSON.stringify(tally)}:`);
for (const g of r.h2) console.log(`  ${g.surface} (χ'=${g.chi}) from ${g.faces.join(', ')}`);
console.log(`H1 generators: ${r.h1.length}`);
console.log(
  '\nNOTE: certification is by measured separation margins (node/edge) + a dart-rotation manifold check,\n' +
  'not an exact-arithmetic proof. A "pinched-sphere" H2 generator is a valid ℚ 2-cycle whose surface is a\n' +
  'sphere with vertices identified (non-manifold) — NOT a torus; only clean spheres/tori/genus are\n' +
  'manifolds. See docs/superpowers/specs/2026-07-18-k2-verification-design.md.',
);
