import type { CellComplex } from './chainComplex';

export interface Surface {
  closed: boolean;                 // every edge used by the face-set is covered an even # of times (cancels)
  orientable: boolean;
  chi: number;                     // χ' = V' − E' + F' of the sub-complex
  name: string;                    // 'sphere' | 'torus' | 'genus-g' | 'RP2' | 'Klein' | 'degenerate' | 'open'
}

/** Classify the surface formed by a set of faces (a 2-cycle) within `cx`. Closed iff each incident edge's
 *  signed multiplicity over the face-set is zero (∂2 of the combination vanishes on every edge) and each
 *  edge is used an even number of times. χ' from the sub-complex of used nodes/edges/faces. */
export function classifySurface(cx: CellComplex, faceIdx: number[]): Surface {
  const usedFaces = faceIdx.map((i) => cx.faces[i]);
  const edgeNet = new Map<number, number>();   // edge -> signed multiplicity (orientation test)
  const edgeUses = new Map<number, number>();  // edge -> count regardless of sign (incidence)
  for (const face of usedFaces) for (const { edge, sign } of face) {
    edgeNet.set(edge, (edgeNet.get(edge) ?? 0) + sign);
    edgeUses.set(edge, (edgeUses.get(edge) ?? 0) + 1);
  }
  const closed = [...edgeNet.values()].every((v) => v === 0) && [...edgeUses.values()].every((c) => c % 2 === 0);
  const orientable = [...edgeNet.values()].every((v) => v === 0); // signed cancellation ⇒ orientable

  const Ep = new Set<number>(edgeUses.keys());
  const Vp = new Set<number>();
  for (const e of Ep) { const [a, b] = cx.edges[e]; Vp.add(a); Vp.add(b); }
  const chi = Vp.size - Ep.size + usedFaces.length;

  let name = 'open';
  if (closed) {
    if (orientable) {
      // Closed orientable manifolds have EVEN χ' ≤ 2. An odd or >2 χ' is a non-manifold pinch (the
      // self-fold signature: a single face whose boundary collapses) — flag it, don't invent a genus.
      name = chi > 2 || chi % 2 !== 0 ? 'degenerate' : chi === 2 ? 'sphere' : chi === 0 ? 'torus' : `genus-${(2 - chi) / 2}`;
    } else {
      name = chi === 1 ? 'RP2' : chi === 0 ? 'Klein' : chi < 1 ? `non-orientable-genus-${1 - chi}` : 'degenerate';
    }
  }
  return { closed, orientable, chi, name };
}
