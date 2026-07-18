import { canonicalCoords } from './nodeCanonicalKey';

/** Min L∞ distance between distinct nodes' canonicalCoords (only comparable when same length). Infinity if
 *  no two distinct nodes share a coord length (all trivially distinct). */
export function nodeMargin(nodes: { key: string; coords: number[] }[]): number {
  let m = Infinity;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (nodes[i].key === nodes[j].key) continue;
    const a = nodes[i].coords, b = nodes[j].coords;
    if (a.length === 0 || a.length !== b.length) continue;
    let d = 0; for (let k = 0; k < a.length; k++) d = Math.max(d, Math.abs(a[k] - b[k]));
    m = Math.min(m, d);
  }
  return m;
}
export { canonicalCoords };
