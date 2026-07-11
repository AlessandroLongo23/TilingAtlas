import { Cyclotomic } from '@/classes';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';

export type HalfEdge = { startKey: string; endKey: string; start: Cyclotomic; end: Cyclotomic; dir: number };

export class Polyform {
  constructor(public readonly tiles: RegularPolygon[]) {}

  /** All directed unit edges of all tiles (CCW), keyed by exact endpoints. */
  private allHalfEdges(): HalfEdge[] {
    const out: HalfEdge[] = [];
    for (const t of this.tiles) {
      const v = t.exactVertices!;
      const d = t.edgeDirs!;
      for (let i = 0; i < v.length; i++) {
        const a = v[i], b = v[(i + 1) % v.length];
        out.push({ startKey: a.key(), endKey: b.key(), start: a, end: b, dir: d[i] });
      }
    }
    return out;
  }

  /** Boundary = edges whose reverse (endKey,startKey) is absent (shared edges cancel). */
  boundaryHalfEdges(): HalfEdge[] {
    const present = new Set(this.allHalfEdges().map(e => `${e.startKey}|${e.endKey}`));
    return this.allHalfEdges().filter(e => !present.has(`${e.endKey}|${e.startKey}`));
  }
}
