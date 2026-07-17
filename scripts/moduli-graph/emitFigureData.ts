import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { CyclotomicRing } from '@/classes/Cyclotomic';
import { loadCatalogueKeys } from './catalogueKeys';
import { assembleGraph, type FamilyRecord } from './graphAssembler';
import type { ParametricCellData } from '@/lib/utils/paramCell';

// Emits the self-contained data the interactive figure needs to render a tiling on hover: each family's
// symbolic paramCell (Laurent terms in e^{iδ}, δ from α), each edge's α at both ends, and every node's
// display label + structural role + a reference (family, α) so a node hover renders its own tiling. The
// figure evaluates the terms live — a hover fraction along an edge maps to α and to a genuine tiling, no
// interpolation. Written to experiments/results/moduli-graph-figure-data.json for embedding.

const PRETTY: Record<string, string> = {
  'ctrnact-01_3-6a-1': '3⁶', 'ctrnact-01_34-5c-1': '3.3.3.4.4', 'ctrnact-01_34-5e-1': '3.3.4.3.4',
  'ctrnact-01_346-4l-1': '3.4.6.4', 'ctrnact-01_36-4f-1': '3.6.3.6', 'ctrnact-01_36-5b-1': '3.3.3.3.6',
  'ctrnact-01_3c-3a-1': '3.12.12', 'ctrnact-01_4-4n-1': '4⁴', 'ctrnact-01_46c-3c-1': '4.6.12', 'ctrnact-01_6-3d-1': '6³',
};

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const records = (Array.isArray(atlas) ? atlas : atlas.records) as (FamilyRecord & {
  k?: number; source?: string; family?: string;
})[];
const families = records.filter(
  (r) => r.k === 1 && r.source === 'isotoxal' && r.paramCell?.params?.length === 1,
);
const byId = new Map(records.map((r) => [r.id, r]));

const graph = assembleGraph(families, loadCatalogueKeys(CyclotomicRing.create(24)));

// paramCell geometry per family that actually appears on an edge, trimmed to what the evaluator reads.
const famIds = [...new Set(graph.edges.map((e) => e.family))];
const famData: Record<string, unknown> = {};
for (const id of famIds) {
  const pc = byId.get(id)!.paramCell as ParametricCellData;
  const p0 = pc.params[0];
  famData[id] = {
    symbol: (byId.get(id) as { family?: string }).family ?? id,
    alpha0: p0.alpha0Deg,
    range: p0.alphaRangeDegOpen,
    polys: pc.cellPolygons.map((poly) => ({ n: poly.n, star: !!poly.star, verts: poly.vertices })),
    basis: pc.basis,
  };
}

// A reference (family, α) so a node hover can render the node's own tiling from one incident edge. The
// degenerate ⊥ node has no single tiling, so it carries no reference.
const refOf = (key: string): { family: string; alpha: number } | null => {
  for (const e of graph.edges) {
    if (e.from === key) return { family: e.family, alpha: e.alphaRange[0] };
    if (e.to === key) return { family: e.family, alpha: e.alphaRange[1] };
  }
  return null;
};

const nodes = graph.nodes.map((n) => ({
  key: n.key,
  label: n.kind === 'degenerate' ? '⊥' : PRETTY[n.label] ?? n.label,
  kind: n.kind, role: n.role, degree: n.degree, flexdim: n.flexdim,
  ref: n.kind === 'degenerate' ? null : refOf(n.key),
}));
const edges = graph.edges.map((e) => ({
  family: e.family, from: e.from, to: e.to, aFrom: e.alphaRange[0], aTo: e.alphaRange[1],
}));

mkdirSync('experiments/results', { recursive: true });
const out = { nodes, edges, families: famData, h1: graph.h1, h1NoDegenerate: graph.h1NoDegenerate };
writeFileSync('experiments/results/moduli-graph-figure-data.json', JSON.stringify(out));
console.log(`figure data: ${nodes.length} nodes, ${edges.length} edges, ${famIds.length} families`);
