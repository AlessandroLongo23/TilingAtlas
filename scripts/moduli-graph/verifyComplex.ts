import type { ParametricCellData } from '@/lib/utils/paramCell';
import { buildCellComplex } from './complexAssembler';
import { homologyGenerators } from './homologyGenerators';
import { classifySurface } from './surfaceClassify';
import { nodeMargin } from './margins';
import type { VerificationReport } from './types';

interface FamilyRecord { id: string; paramCell?: ParametricCellData }

export function verifyComplex(families: FamilyRecord[]): VerificationReport {
  const { complex, cx, faceFamily } = buildCellComplex(families);
  const gens = homologyGenerators(cx);
  const nMargin = nodeMargin(complex.nodeCoords);

  const h2 = gens.h2.map((g) => {
    const s = classifySurface(cx, g.coeffs);   // signed coefficient vector, NOT the support
    const fams = [...new Set(g.faces.map((fi) => faceFamily[fi]))];
    return { faces: fams, surface: s.name, chi: s.chi };
  });
  const h1 = gens.h1.map((g) => ({
    edges: g.edges.length,
    nodeLoop: [...new Set(g.edges.flatMap((e) => [cx.nodes[cx.edges[e][0]], cx.nodes[cx.edges[e][1]]]))],
  }));

  return {
    nodeMargin: nMargin,
    edgeMargin: complex.edgeMargin,
    nearCollisions: complex.nearCollisions,
    h2, h1,
    chi: complex.chi, betti: complex.betti,
    accounting: {
      families: complex.faces.length,                                    // two-parameter families = 2-cells
      genuineFaces: cx.faces.length,                                     // faces surviving into the genuine subcomplex
      selfFoldingFaces: complex.degenerateFaces,                        // zero-∂2 faces (excluded if ⊥-incident)
      nonProductFaces: complex.faces.filter((f) => !f.productOK).map((f) => f.family),
    },
  };
}
