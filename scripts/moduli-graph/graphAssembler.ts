import type { CatalogueIndex } from './catalogueKeys';
import { extractNodes } from './nodeExtractor';
import { resolveNode } from './nodeResolver';
import type { ParametricCellData } from '@/lib/utils/paramCell';
import type { NodeKind, NodeRole } from './types';

export interface FamilyRecord { id: string; paramCell?: ParametricCellData }
export interface GraphNode {
  key: string; label: string; chirality: string; resolved: boolean; kind: NodeKind;
  // structural annotations, filled once every edge is known (see NodeRole): incidence `degree` (a
  // self-loop counts twice), `role` derived from it, and `flexdim` = the local moduli dimension, taken
  // as the maximum flexdim over incident families (all 1 in the single-parameter slice).
  role: NodeRole; degree: number; flexdim: number;
}
export interface GraphEdge { family: string; from: string; to: string; alphaRange: [number, number]; flexdim: number; }
export interface ModuliGraph {
  nodes: GraphNode[]; edges: GraphEdge[];
  h1: number;              // first homology including the degenerate ⊥ node
  h1NoDegenerate: number;  // first homology with ⊥ and its edges removed
  unresolved: number;
}

function h1Of(keys: string[], edges: GraphEdge[]): number {
  return edges.length - keys.length + components(keys, edges);
}

export function assembleGraph(families: FamilyRecord[], idx: CatalogueIndex): ModuliGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  for (const fam of families) {
    if (fam.paramCell?.params?.length !== 1) continue; // slice: single-parameter families only
    const states = extractNodes(fam.paramCell).sort((a, b) => a.alpha - b.alpha);
    const resolved = states.map((s) => resolveNode(s, idx));
    resolved.forEach((r) => nodes.set(r.key, {
      key: r.key, label: r.label, chirality: r.chirality, resolved: r.resolved, kind: r.kind,
      role: 'landmark', degree: 0, flexdim: 0, // patched below once incidence is known
    }));
    for (let i = 0; i < states.length - 1; i++) {
      edges.push({ family: fam.id, from: resolved[i].key, to: resolved[i + 1].key, alphaRange: [states[i].alpha, states[i + 1].alpha], flexdim: 1 });
    }
  }
  // Incidence-derived structure: a self-loop (from === to) contributes 2 to its node's degree; a node is
  // a branch point (crossroad) at degree ≥ 3, else a landmark, unless it is the degenerate ⊥ boundary.
  for (const e of edges) {
    for (const k of [e.from, e.to]) {
      const n = nodes.get(k)!;
      n.degree += 1;
      n.flexdim = Math.max(n.flexdim, e.flexdim);
    }
  }
  for (const n of nodes.values()) {
    n.role = n.kind === 'degenerate' ? 'boundary' : n.degree >= 3 ? 'branch' : 'landmark';
  }
  const allKeys = [...nodes.keys()];
  const degKeys = new Set([...nodes.values()].filter((n) => n.kind === 'degenerate').map((n) => n.key));
  const keysNoDeg = allKeys.filter((k) => !degKeys.has(k));
  const edgesNoDeg = edges.filter((e) => !degKeys.has(e.from) && !degKeys.has(e.to));
  return {
    nodes: [...nodes.values()],
    edges,
    h1: h1Of(allKeys, edges),
    h1NoDegenerate: h1Of(keysNoDeg, edgesNoDeg),
    unresolved: [...nodes.values()].filter((n) => !n.resolved).length,
  };
}

function components(keys: string[], edges: GraphEdge[]): number {
  const parent = new Map(keys.map((k) => [k, k] as const));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  for (const e of edges) parent.set(find(e.from), find(e.to));
  return new Set(keys.map(find)).size;
}
