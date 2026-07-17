// Shared float-geometry helpers for the moduli-graph pipeline. Kept in one place so the node
// extractor, the signature, and the resolver all judge "regular" and "how many sides" the same way.

/** Signed-area magnitude of a polygon (original vertices — used to detect zero-area collapse). */
export function polyArea(verts: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    s += a[0] * b[1] - a[1] * b[0];
  }
  return Math.abs(s) / 2;
}

/**
 * Drop vertices whose interior angle is ~180° — a corner that has flattened into a straight edge.
 * A family can degenerate not only by a tile collapsing to zero area but by a tile flattening: a
 * dodecagon with alternating 120°/180° corners is geometrically a hexagon. Counting stored sides
 * would call it a dodecagon and mislabel the tiling; the effective corners are the real polygon.
 */
export function effectiveVerts(verts: [number, number][], angleTolDeg = 1): [number, number][] {
  const n = verts.length;
  if (n < 3) return verts;
  const straight = Math.PI - (angleTolDeg * Math.PI) / 180;
  const keep: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = verts[(i - 1 + n) % n], b = verts[i], c = verts[(i + 1) % n];
    const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]];
    const denom = Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]) || 1;
    const ang = Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / denom)));
    if (ang < straight) keep.push(b);
  }
  return keep.length >= 3 ? keep : verts;
}

/** How far a polygon is from regular, measured on its EFFECTIVE corners: worst edge-length spread
 *  plus worst interior-angle error (radians). Returns Infinity for a degenerate (<3 corner) shape. */
export function polyDefect(verts: [number, number][]): number {
  const ev = effectiveVerts(verts);
  const n = ev.length;
  if (n < 3) return Infinity;
  const e: number[] = [], ang: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = ev[(i - 1 + n) % n], b = ev[i], c = ev[(i + 1) % n];
    e.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
    const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]];
    const denom = Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]) || 1;
    ang.push(Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / denom))));
  }
  const meanE = e.reduce((s, x) => s + x, 0) / e.length;
  const regAng = (Math.PI * (n - 2)) / n;
  return Math.max(...e.map((x) => Math.abs(x - meanE))) + Math.max(...ang.map((x) => Math.abs(x - regAng)));
}

/** Whole-tiling regularity defect: the worst tile. Zero iff every (effective) tile is regular. */
export function tilingDefect(polys: { verts: [number, number][] }[]): number {
  let worst = 0;
  for (const p of polys) worst = Math.max(worst, polyDefect(p.verts));
  return worst;
}

export const REGULAR_TOL = 1e-3;
