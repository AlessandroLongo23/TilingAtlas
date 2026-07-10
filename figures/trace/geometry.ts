// figures/trace/geometry.ts
/** Pure 2-D helpers for the trace figures. Model units (unit polygon edge = 1). */
import type { V2, Rect } from '../ir/types';

/** A regular n-gon with ONE corner at the origin, unit edges, whose interior angle opens
 *  counter-clockwise from ray `cornerAngle`. */
export function regularPolygonAtCorner(n: number, cornerAngle: number): V2[] {
  const interior = (Math.PI * (n - 2)) / n;
  const exterior = Math.PI - interior;
  const verts: V2[] = [{ x: 0, y: 0 }];
  let x = 0, y = 0, heading = cornerAngle;
  for (let i = 0; i < n - 1; i++) {
    x += Math.cos(heading);
    y += Math.sin(heading);
    verts.push({ x, y });
    heading += exterior;
  }
  return verts;
}

export function bboxOfPts(pts: V2[]): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** A transform mapping `src` bbox into `box` (with `margin` model units of padding), preserving
 *  aspect ratio and centering. */
export function fitInto(src: Rect, box: Rect, margin: number): (p: V2) => V2 {
  const sw = Math.max(1e-9, src.maxX - src.minX);
  const sh = Math.max(1e-9, src.maxY - src.minY);
  const bw = (box.maxX - box.minX) - 2 * margin;
  const bh = (box.maxY - box.minY) - 2 * margin;
  const s = Math.min(bw / sw, bh / sh);
  const scx = (src.minX + src.maxX) / 2, scy = (src.minY + src.maxY) / 2;
  const bcx = (box.minX + box.maxX) / 2, bcy = (box.minY + box.maxY) / 2;
  return (p: V2): V2 => ({ x: bcx + (p.x - scx) * s, y: bcy + (p.y - scy) * s });
}
