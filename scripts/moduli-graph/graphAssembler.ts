import type { CatalogueIndex } from './catalogueKeys';
import { extractNodes } from './nodeExtractor';
import { resolveNode } from './nodeResolver';
import type { ParametricCellData } from '@/lib/utils/paramCell';

export interface FamilyRecord { id: string; paramCell?: ParametricCellData }
export interface GraphNode { key: string; label: string; chirality: string; resolved: boolean; }
export interface GraphEdge { family: string; from: string; to: string; alphaRange: [number, number]; flexdim: number; }
export interface ModuliGraph { nodes: GraphNode[]; edges: GraphEdge[]; h1: number; unresolved: number; }

export function assembleGraph(families: FamilyRecord[], idx: CatalogueIndex): ModuliGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  for (const fam of families) {
    if (fam.paramCell?.params?.length !== 1) continue; // slice: single-parameter families only
    const states = extractNodes(fam.paramCell).sort((a, b) => a.alpha - b.alpha);
    const resolved = states.map((s) => resolveNode(s, idx));
    resolved.forEach((r) => nodes.set(r.key, { key: r.key, label: r.label, chirality: r.chirality, resolved: r.resolved }));
    for (let i = 0; i < states.length - 1; i++) {
      edges.push({ family: fam.id, from: resolved[i].key, to: resolved[i + 1].key, alphaRange: [states[i].alpha, states[i + 1].alpha], flexdim: 1 });
    }
  }
  const V = nodes.size, E = edges.length;
  const C = components([...nodes.keys()], edges);
  return { nodes: [...nodes.values()], edges, h1: E - V + C, unresolved: [...nodes.values()].filter((n) => !n.resolved).length };
}

function components(keys: string[], edges: GraphEdge[]): number {
  const parent = new Map(keys.map((k) => [k, k] as const));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  for (const e of edges) parent.set(find(e.from), find(e.to));
  return new Set(keys.map(find)).size;
}
