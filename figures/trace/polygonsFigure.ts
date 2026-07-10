// figures/trace/polygonsFigure.ts
/** F2 — a row of the input regular polygons, each centered in a cell, labeled with n and interior
 *  angle. Uses the byNGon tile fills so the colors match every other figure. */
import type { FigureIR, FigureElement, V2 } from '../ir/types';
import { regularPolygonAtCorner, bboxOfPts, fitInto } from './geometry';

const CELL = 12;
const PAD = 1.5;

export function polygonsFigure(ns: number[]): FigureIR {
  const elements: FigureElement[] = [];
  ns.forEach((n, i) => {
    const box = { minX: i * CELL, minY: 0, maxX: (i + 1) * CELL, maxY: CELL };
    const raw = regularPolygonAtCorner(n, 0);
    const t = fitInto(bboxOfPts(raw), { ...box, maxY: box.maxY - 3 }, PAD);
    const verts: V2[] = raw.map(t);
    elements.push({ kind: 'poly', verts, styleRef: `tile:n:${n}` });
    const interiorDeg = Math.round((180 * (n - 2)) / n);
    elements.push({ kind: 'text', at: { x: (box.minX + box.maxX) / 2, y: 2 }, tex: `$\\{${n}\\}$`, styleRef: 'label' });
    elements.push({ kind: 'text', at: { x: (box.minX + box.maxX) / 2, y: 0.5 }, tex: `${interiorDeg}^\\circ`, styleRef: 'label' });
  });
  return { bbox: { minX: 0, minY: 0, maxX: ns.length * CELL, maxY: CELL }, elements };
}
