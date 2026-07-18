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

const a = r.accounting;
console.log('SCOPE: homology of the 2-PARAMETER-family subcomplex (those families as 2-cells + their');
console.log('       induced boundary 1-skeleton) — NOT the full k=2 moduli space; the 74 one-parameter');
console.log('       k=2 families are not added here as independent 1-cells.');
console.log(`faces: ${a.families} two-parameter families → ${a.genuineFaces} genuine faces` +
  ` | self-folding (zero-∂2): ${a.selfFoldingFaces.join(', ') || 'none'}` +
  ` | non-product: ${a.nonProductFaces.join(', ') || 'none'}`);
console.log(`genuine χ=${r.chi} betti=[${r.betti.join(',')}]`);
console.log(`node margin=${r.nodeMargin} (ε≈1e-4) | edge margin=${r.edgeMargin} differing samples | near-collisions=${r.nearCollisions.length}`);
if (r.nearCollisions.length) console.log(`  ${r.nearCollisions.join('; ')}`);
console.log(`H2 generators (${r.h2.length}) — surface tally ${JSON.stringify(tally)}:`);
for (const g of r.h2) console.log(`  ${g.surface} (χ'=${g.chi}) from ${g.faces.join(', ')}`);
console.log(`H1 generators: ${r.h1.length} (exact rank; a bare count — H1 has no pinched-torus failure mode, so no per-loop surface check)`);
console.log(
  '\nNOTE: certification is by measured separation margins (node/edge) + a dart-rotation manifold check,\n' +
  'not an exact-arithmetic proof. betti[2]=6 is NOT "6 closed surfaces": only 2 are genuine spheres; the\n' +
  '4 pinched-spheres are valid ℚ 2-cycles whose surface is a sphere with vertices identified (non-manifold),\n' +
  'NOT tori. Node margin covers same-vertex-count node pairs (guards false-split near the ε floor); pairs of\n' +
  'differing tile-count are separated trivially. See docs/superpowers/specs/2026-07-18-k2-verification-design.md.',
);
