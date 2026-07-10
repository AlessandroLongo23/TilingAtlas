// figures/trace/curate.ts
/** Curate a large VC search tree to a legible, HONEST slice: the root-to-leaf paths of the
 *  highlighted VCs, plus the first-encountered node of each distinct non-extend verdict (one stub
 *  per prune/dup reason), plus their ancestors so the tree stays connected. Deterministic. */
import type { VcNode } from './loadTrace';

export type Curated = { kept: VcNode[]; droppedCount: number; highlightIds: Set<number> };

export function curateVcTree(nodes: VcNode[], highlightPaths: string[][]): Curated {
  const byId = new Map<number, VcNode>();
  for (const n of nodes) byId.set(n.id, n);
  const keep = new Set<number>();
  const addAncestors = (id: number) => {
    let cur: VcNode | undefined = byId.get(id);
    while (cur && !keep.has(cur.id)) { keep.add(cur.id); cur = cur.parentId === -1 ? undefined : byId.get(cur.parentId); }
  };
  const highlightIds = new Set<number>();
  const pathKey = (p: string[]) => p.join('.');
  const wanted = new Set(highlightPaths.map(pathKey));
  for (const n of nodes) if (n.verdict === 'emit' && wanted.has(pathKey(n.path))) { highlightIds.add(n.id); addAncestors(n.id); }
  const seenVerdict = new Set<string>();
  for (const n of [...nodes].sort((a, b) => a.id - b.id)) {
    if (n.verdict === 'extend') continue;
    if (seenVerdict.has(n.verdict)) continue;
    seenVerdict.add(n.verdict);
    addAncestors(n.id);
  }
  const kept = nodes.filter((n) => keep.has(n.id)).sort((a, b) => a.id - b.id);
  return { kept, droppedCount: nodes.length - kept.length, highlightIds };
}
