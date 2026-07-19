// Emit interactive-figure data for the k=2 two-parameter-family complex: nodes (with a representative
// developed tiling for hover), edges, faces (with surface classification + generator membership), and
// connected components. Consumed by the standalone HTML figure. Offline; float geometry only.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extractTwoCell } from './twoCellExtractor';
import { nodeCanonicalKey } from './nodeCanonicalKey';
import { verifyComplex } from './verifyComplex';
import type { FloatTiling, NodeState } from './types';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const recs = (Array.isArray(atlas) ? atlas : atlas.records) as any[];
const cluster = recs.filter((r) => r.k === 2 && r.source === 'isotoxal' && r.paramCell?.params?.length === 2);

const round = (x: number) => Math.round(x * 1e4) / 1e4;
const packTiling = (t: FloatTiling) => ({
  polys: t.polys.map((p) => ({ n: p.n, verts: p.verts.map(([x, y]) => [round(x), round(y)]) })),
  basis: [t.basis[0].map(round), t.basis[1].map(round)],
});

// Nodes: one representative tiling per canonical key. Edges + faces keyed by canonical node keys.
const nodes = new Map<string, { key: string; kind: string; label: string; tiling: ReturnType<typeof packTiling> }>();
const record = (s: NodeState) => {
  const ck = nodeCanonicalKey(s.tiling);
  if (!nodes.has(ck.key)) {
    nodes.set(ck.key, {
      key: ck.key,
      kind: s.tiling.polys.length === 0 ? 'degenerate' : 'tiling',
      label: ck.key === 'degenerate:⊥' ? '⊥' : ck.blind.slice(0, 1) === '{' ? '' : ck.blind,
      tiling: packTiling(s.tiling),
    });
  }
  return ck.key;
};

const DEG = 'degenerate:⊥';
const edgeSet = new Set<string>();
const edges: { from: string; to: string; family: string }[] = [];
const faces: { family: string; boundary: string[]; surface: string; genuine: boolean }[] = [];

// Surface classification per family from the verified report (generators are pillow PAIRS → map each
// family in a generator to that generator's surface; families not in any generator get 'face').
const report = verifyComplex(cluster as never[]);
const famSurface = new Map<string, string>();
for (const g of report.h2) for (const fam of g.faces) famSurface.set(fam.replace('ctrnact-isotoxal-family-', ''), g.surface);

// The figure shows the GENUINE subcomplex: ⊥ (the shared zero-area collapse point) is a compactification
// point, not a tiling, and the certified homology drops it. So skip ⊥ nodes and any edge/face touching ⊥.
for (const rec of cluster) {
  const short = rec.id.replace('ctrnact-isotoxal-family-', '');
  const face = extractTwoCell(rec.paramCell);
  const boundaryKeys: string[] = [];
  let touchesDeg = false;
  for (const be of face.boundary) {
    const a = record(be.from), b = record(be.to);
    if (a === DEG || b === DEG) { touchesDeg = true; continue; }
    boundaryKeys.push(a);
    const ek = a < b ? `${a}|${b}|${rec.id}` : `${b}|${a}|${rec.id}`;
    if (!edgeSet.has(ek)) { edgeSet.add(ek); edges.push({ from: a, to: b, family: short }); }
  }
  if (touchesDeg) continue; // ⊥-incident face — not in the genuine subcomplex
  const surface = famSurface.get(short) ?? 'face';
  faces.push({ family: short, boundary: boundaryKeys, surface, genuine: surface === 'sphere' });
}
nodes.delete(DEG);

// Connected components over the node/edge graph (union-find).
const parent = new Map<string, string>();
[...nodes.keys()].forEach((k) => parent.set(k, k));
const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
for (const e of edges) parent.set(find(e.from), find(e.to));
const comp = new Map<string, number>();
let nc = 0;
for (const k of nodes.keys()) { const r = find(k); if (!comp.has(r)) comp.set(r, nc++); }

const out = {
  nodes: [...nodes.values()].map((n) => ({ ...n, comp: comp.get(find(n.key))! })),
  edges,
  faces,
  betti: report.betti,
  components: nc,
  h2: report.h2.map((g) => ({ surface: g.surface, chi: g.chi, families: g.faces.map((f) => f.replace('ctrnact-isotoxal-family-', '')) })),
  h1: report.h1.length,
};
mkdirSync('experiments/results', { recursive: true });
writeFileSync('experiments/results/k2-figure-data.json', JSON.stringify(out));
console.log(`nodes=${out.nodes.length} edges=${out.edges.length} faces=${out.faces.length} components=${nc} betti=[${out.betti.join(',')}]`);
console.log(`bytes=${JSON.stringify(out).length}`);
