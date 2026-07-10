// figures/trace/treeLayout.ts
/** Tidy layout for the small trace trees (<= ~30 nodes): depth = ancestry distance, x = a simple
 *  post-order tidy pass (leaves sequential, parents centered over their children). Deterministic. */
export type TreeInput = { id: number; parentId: number };
export type Pos = { x: number; depth: number };

export function layoutTree(nodes: TreeInput[]): Map<number, Pos> {
  const children = new Map<number, number[]>();
  const byId = new Map<number, TreeInput>();
  for (const n of nodes) { byId.set(n.id, n); if (!children.has(n.id)) children.set(n.id, []); }
  const roots: number[] = [];
  for (const n of nodes) {
    if (n.parentId === -1 || !byId.has(n.parentId)) roots.push(n.id);
    else (children.get(n.parentId) ?? children.set(n.parentId, []).get(n.parentId)!).push(n.id);
  }
  const pos = new Map<number, Pos>();
  let nextLeafX = 0;
  const assign = (id: number, depth: number): number => {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) { const x = nextLeafX++; pos.set(id, { x, depth }); return x; }
    const xs = kids.map((k) => assign(k, depth + 1));
    const x = (Math.min(...xs) + Math.max(...xs)) / 2;
    pos.set(id, { x, depth });
    return x;
  };
  for (const [, ks] of children) ks.sort((a, b) => a - b);
  roots.sort((a, b) => a - b).forEach((r) => assign(r, 0));
  return pos;
}
