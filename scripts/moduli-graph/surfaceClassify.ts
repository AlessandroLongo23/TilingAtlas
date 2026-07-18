import type { CellComplex } from './chainComplex';

export interface Surface {
  closed: boolean;   // the signed 2-chain has empty boundary (∂2·coeffs = 0 on every edge)
  chi: number;       // χ' = V' − E' + F' of the CW sub-complex (with its vertex identifications)
  pinches: number;   // # of CW vertices that split into >1 surface vertex (non-manifold pinch points)
  name: string;      // 'sphere' | 'torus' | 'genus-g' | 'pinched-sphere' | 'pinched' | 'degenerate' | 'open'
}

/**
 * Classify the surface a 2-cycle forms within `cx`. `coeffs` is the signed coefficient vector of the
 * 2-chain, indexed by face — an H₂ generator's `coeffs`. The SIGNS matter (∂2·coeffs must cancel).
 *
 * Classifying by χ' alone is WRONG: a "pillow" (two faces sharing their whole boundary) is a sphere, but
 * identifying k of its boundary vertices drops χ' to 2−k, so a 2-pinched sphere reads as χ'=0 = a fake
 * "torus" and a 4-pinched one as fake "genus-2". So we run a real manifold check via the dart rotation
 * system: build oriented half-edges, pair them across each edge (α), and walk α∘next to count the TRUE
 * surface vertices. A CW vertex whose darts split into >1 rotation cycle is a pinch (non-manifold). Only a
 * genuine manifold (surface-vertex count == CW-vertex count, every edge shared by exactly 2 opposite
 * darts) is classified by χ' into sphere/torus/genus; anything pinched is reported as such, not a torus.
 */
export function classifySurface(cx: CellComplex, coeffs: number[]): Surface {
  const usedFaces: number[] = [];
  coeffs.forEach((c, f) => { if (c !== 0) usedFaces.push(f); });

  const net = new Map<number, number>();
  const edgeSet = new Set<number>();
  for (const f of usedFaces) for (const { edge, sign } of cx.faces[f]) {
    net.set(edge, (net.get(edge) ?? 0) + coeffs[f] * sign);
    edgeSet.add(edge);
  }
  const closed = [...net.values()].every((v) => v === 0);
  const Vp = new Set<number>();
  for (const e of edgeSet) { const [a, b] = cx.edges[e]; Vp.add(a); Vp.add(b); }
  const chi = Vp.size - edgeSet.size + usedFaces.length;
  if (!closed) return { closed: false, chi, pinches: 0, name: 'open' };

  // A surface interpretation needs unit coefficients (a face used with multiplicity ≠ ±1 is not a
  // simple 2-cell in the cycle).
  if (usedFaces.some((f) => Math.abs(coeffs[f]) !== 1)) return { closed: true, chi, pinches: 0, name: 'degenerate' };

  // Oriented darts (half-edges). A face with coeff −1 contributes its boundary reversed (reverse order,
  // negate each sign) so its 2-cell orientation is flipped.
  const darts: { edge: number; dir: number }[] = [];
  const faceDartIds: number[][] = [];
  for (const f of usedFaces) {
    let bd = cx.faces[f].map((fe) => ({ edge: fe.edge, dir: fe.sign as number }));
    if (coeffs[f] < 0) bd = bd.slice().reverse().map((x) => ({ edge: x.edge, dir: -x.dir }));
    const ids: number[] = [];
    for (const x of bd) { ids.push(darts.length); darts.push(x); }
    faceDartIds.push(ids);
  }
  const nextDart = new Array<number>(darts.length);
  for (const ids of faceDartIds) ids.forEach((d, i) => { nextDart[d] = ids[(i + 1) % ids.length]; });

  // Edge involution α: a closed orientable surface has exactly two darts per edge, opposite direction.
  const byEdge = new Map<number, number[]>();
  darts.forEach((d, i) => { const l = byEdge.get(d.edge) ?? []; l.push(i); byEdge.set(d.edge, l); });
  const alpha = new Array<number>(darts.length).fill(-1);
  for (const [, l] of byEdge) {
    if (l.length !== 2 || darts[l[0]].dir === darts[l[1]].dir) {
      return { closed: true, chi, pinches: 0, name: 'degenerate' }; // branched or non-orientable along an edge
    }
    alpha[l[0]] = l[1]; alpha[l[1]] = l[0];
  }

  // Surface vertices = cycles of φ = α∘next. Each cycle is the rotation of darts around one surface vertex.
  const seen = new Array<boolean>(darts.length).fill(false);
  let vSurface = 0;
  for (let s = 0; s < darts.length; s++) {
    if (seen[s]) continue;
    vSurface++;
    let d = s;
    while (!seen[d]) { seen[d] = true; d = alpha[nextDart[d]]; }
  }
  const pinches = vSurface - Vp.size;

  if (pinches > 0) {
    const chiTrue = vSurface - edgeSet.size + usedFaces.length; // χ of the un-pinched manifold
    return { closed: true, chi, pinches, name: chiTrue === 2 ? 'pinched-sphere' : `pinched(χ=${chiTrue})` };
  }
  // Genuine closed orientable manifold: classify by χ' (= χ of the manifold). Even ≤ 2.
  const name = chi > 2 || chi % 2 !== 0 ? 'degenerate' : chi === 2 ? 'sphere' : chi === 0 ? 'torus' : `genus-${(2 - chi) / 2}`;
  return { closed: true, chi, pinches: 0, name };
}
