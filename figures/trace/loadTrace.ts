// figures/trace/loadTrace.ts
/** Load the figure-trace JSONL a probe produced into typed arrays. Pure Node fs (figures/ is a
 *  CLI-only subsystem, so a direct node:fs import is fine here — unlike figureTrace.ts, nothing in
 *  figures/ is reachable from the browser bundle). */
import * as fs from 'node:fs';
import * as path from 'node:path';

export type Verts = [number, number][];
export type RepPoly = { n: number; isStar: boolean; verts: Verts };

export type VcNode = { id: number; parentId: number; path: string[]; angleSum: number; verdict: string };
export type TorusNode = {
  fillId: number; latKey: string; k?: number; id?: number; parentId?: number;
  reps?: RepPoly[]; placedN?: number; stateKey?: string; verdict: string;
};
export type PoolNode = { N: number; steps: number; lmax: number; dirs: number[]; monotone: boolean; vectors: Verts };
export type LatticeNode = {
  vcSig: string; polySizes: number[]; p0Skipped: number; cSkipped: number; orbitSkipped: number;
  candidates: { key: string; basis: [[number, number], [number, number]] }[];
};

export type TraceStage = 'vc' | 'seed' | 'pool' | 'lattice' | 'torus';

export function loadTrace<T>(dir: string, stage: TraceStage): T[] {
  const f = path.join(dir, `${stage}.jsonl`);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as T);
}
