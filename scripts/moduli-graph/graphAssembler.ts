import type { CatalogueIndex } from './catalogueKeys';
import { extractNodes } from './nodeExtractor';
import { resolveNode } from './nodeResolver';
import type { ParametricCellData } from '@/lib/utils/paramCell';
import type { NodeKind } from './types';

export interface FamilyRecord { id: string; paramCell?: ParametricCellData }
export interface GraphNode { key: string; label: string; chirality: string; resolved: boolean; kind: NodeKind; }
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
    resolved.forEach((r) => nodes.set(r.key, { key: r.key, label: r.label, chirality: r.chirality, resolved: r.resolved, kind: r.kind }));
    for (let i = 0; i < states.length - 1; i++) {
      edges.push({ family: fam.id, from: resolved[i].key, to: resolved[i + 1].key, alphaRange: [states[i].alpha, states[i + 1].alpha], flexdim: 1 });
    }
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
