import type { CellComplex } from './chainComplex';
import { nullSpace, matRank } from './exactLinAlg';

export interface H2Gen { faces: number[]; coeffs: number[]; } // signed face combination in ker ∂2
export interface H1Gen { edges: number[]; coeffs: number[]; } // signed edge loop, representative of ker∂1/im∂2
export interface Generators { h2: H2Gen[]; h1: H1Gen[]; }

/** ∂1 as V×E, ∂2 as E×F (same convention as chainComplex.homology). */
function boundaryMatrices(cx: CellComplex): { d1: number[][]; d2: number[][] } {
  const V = cx.nodes.length, E = cx.edges.length, F = cx.faces.length;
  const d1 = Array.from({ length: V }, () => new Array(E).fill(0));
  cx.edges.forEach(([from, to], e) => { d1[from][e] -= 1; d1[to][e] += 1; });
  const d2 = Array.from({ length: E }, () => new Array(F).fill(0));
  cx.faces.forEach((face, f) => { for (const { edge, sign } of face) d2[edge][f] += sign; });
  return { d1, d2 };
}

const support = (v: number[]): number[] => v.map((x, i) => [x, i]).filter(([x]) => x !== 0).map(([, i]) => i);

export function homologyGenerators(cx: CellComplex): Generators {
  const V = cx.nodes.length, E = cx.edges.length, F = cx.faces.length;
  const { d1, d2 } = boundaryMatrices(cx);

  // Self-guard: the H1 = ker∂1/im∂2 construction is only valid when im∂2 ⊆ ker∂1, i.e. ∂1∘∂2 = 0. The
  // assembler already routes complexes through homology() (which validates this), but this is a public
  // export, so re-check here rather than return silently-wrong generators on a mis-stitched boundary.
  for (let f = 0; f < F; f++) {
    for (let vtx = 0; vtx < V; vtx++) {
      let acc = 0;
      for (let e = 0; e < E; e++) acc += d1[vtx][e] * d2[e][f];
      if (acc !== 0) throw new Error(`∂1∂2 ≠ 0 at face ${f}, node ${vtx} — boundary is not a cycle`);
    }
  }

  // H2 = ker ∂2 (no ∂3). Each null vector is a face-combination that is a 2-cycle.
  const h2vecs = F === 0 ? [] : nullSpace(d2, F);
  const h2 = h2vecs.map((v) => ({ faces: support(v), coeffs: v }));

  // H1 = ker ∂1 / im ∂2. Take ker∂1 basis (edge-space), then keep those independent modulo the columns
  // of ∂2 (im ∂2). Independence test by rank increase.
  const kerD1 = E === 0 ? [] : nullSpace(d1, E);
  const imCols: number[][] = [];             // rows = edge-space vectors already in the span (im∂2 first)
  for (let f = 0; f < F; f++) imCols.push(cx.edges.map((_, e) => d2[e][f]));
  const spanRows = imCols.filter((c) => c.some((x) => x !== 0));
  const baseRank = spanRows.length ? matRank(spanRows) : 0;
  const h1: H1Gen[] = [];
  for (const v of kerD1) {
    const test = [...spanRows, ...h1.map((g) => g.coeffs), v];
    if (matRank(test) > baseRank + h1.length) h1.push({ edges: support(v), coeffs: v });
  }
  return { h2, h1 };
}
