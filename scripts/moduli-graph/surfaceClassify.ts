import type { CellComplex } from './chainComplex';

export interface Surface {
  closed: boolean;   // the signed 2-chain has empty boundary (∂2·coeffs = 0 on every edge)
  chi: number;       // χ' = V' − E' + F' of the sub-complex of faces with a nonzero coefficient
  name: string;      // 'sphere' | 'torus' | 'genus-g' | 'degenerate' | 'open'
}

/**
 * Classify the closed surface a 2-cycle forms within `cx`. `coeffs` is the signed coefficient vector of
 * the 2-chain, indexed by face (0 for unused faces) — i.e. an H₂ generator's `coeffs`. The SIGNS matter:
 * a genuine orientable 2-cycle cancels its boundary only with the right ±1 per face, so classifying by the
 * face support alone (implicit +1) would falsely fail a mixed-sign torus. Closed iff ∂2·coeffs = 0.
 *
 * Only closed ORIENTABLE surfaces arise as ℚ 2-cycles (an integer 2-cycle is orientable; ℝP²/Klein have
 * b₂(ℚ)=0), so classification is by χ' alone: sphere (χ'=2), torus (χ'=0), genus-g (even χ'<0). An odd or
 * >2 χ' means the face-set is not a manifold — a self-fold pinch, the degenerate signature (k2-82/83).
 * `open` means the chain is not a cycle (nonzero boundary), which should not happen for a real generator.
 */
export function classifySurface(cx: CellComplex, coeffs: number[]): Surface {
  const used: number[] = [];
  coeffs.forEach((c, f) => { if (c !== 0) used.push(f); });
  const edgeNet = new Map<number, number>();
  const edgeSet = new Set<number>();
  for (const f of used) for (const { edge, sign } of cx.faces[f]) {
    edgeNet.set(edge, (edgeNet.get(edge) ?? 0) + coeffs[f] * sign);
    edgeSet.add(edge);
  }
  const closed = [...edgeNet.values()].every((v) => v === 0);

  const Vp = new Set<number>();
  for (const e of edgeSet) { const [a, b] = cx.edges[e]; Vp.add(a); Vp.add(b); }
  const chi = Vp.size - edgeSet.size + used.length;

  let name = 'open';
  if (closed) name = chi > 2 || chi % 2 !== 0 ? 'degenerate' : chi === 2 ? 'sphere' : chi === 0 ? 'torus' : `genus-${(2 - chi) / 2}`;
  return { closed, chi, name };
}
