import type { ParametricCellData } from '@/lib/utils/paramCell';
import { extractTwoCell, type BoundaryEdge } from './twoCellExtractor';
import { nodeCanonicalKey, canonicalCoords } from './nodeCanonicalKey';
import { edgeFingerprint } from './edgeFingerprint';
import { homology, type CellComplex, type FaceEdge } from './chainComplex';
import type { ModuliComplex, NodeState } from './types';

interface FamilyRecord { id: string; paramCell?: ParametricCellData }

const DEG = 'degenerate:⊥';

/**
 * Assemble two-parameter families into a CW 2-complex and read its homology. Nodes are identified up to
 * direct similarity (`nodeCanonicalKey`); a 1-cell is identified by its endpoint pair plus the canonical
 * key of its MIDPOINT tiling, so the four distinct sides of a face stay distinct while a side shared by
 * two faces glues (letting faces close into a surface → H₂). Homology is reported for the genuine-tiling
 * subcomplex (⊥ and its incident cells removed — the headline) and, separately, with ⊥ (`full`).
 */
export interface BuiltComplex {
  complex: ModuliComplex & { nodeCoords: { key: string; coords: number[] }[]; edgeMargin: number; nearCollisions: string[] };
  cx: CellComplex;
  faceFamily: string[];
}

export function buildCellComplex(families: FamilyRecord[]): BuiltComplex {
  const nodeIndex = new Map<string, number>();
  const nodeMeta: ModuliComplex['nodes'] = [];
  const nodeCoords: { key: string; coords: number[] }[] = [];
  const nodeId = (s: NodeState): number => {
    const ck = nodeCanonicalKey(s.tiling);
    let i = nodeIndex.get(ck.key);
    if (i === undefined) {
      i = nodeMeta.length;
      nodeIndex.set(ck.key, i);
      nodeMeta.push({
        key: ck.key,
        label: ck.key === DEG ? '⊥' : ck.blind,
        kind: s.tiling.polys.length === 0 ? 'degenerate' : 'uncatalogued',
        handed: ck.handed,
      });
      nodeCoords.push({ key: ck.key, coords: canonicalCoords(s.tiling) });
    }
    return i;
  };

  const edgeIndex = new Map<string, number>();
  const edges: [number, number][] = [];
  const edgeMeta: ModuliComplex['edges'] = [];
  const edgeId = (be: BoundaryEdge, family: string): { idx: number; sign: 1 | -1 } => {
    const ai = nodeId(be.from), bi = nodeId(be.to);
    const fromKey = nodeMeta[ai].key, toKey = nodeMeta[bi].key;
    const pair = fromKey < toKey ? `${fromKey}::${toKey}` : `${toKey}::${fromKey}`;
    const key = `${pair}||${edgeFingerprint(be.samples, fromKey, toKey)}`; // endpoints + multi-sample identity
    let idx = edgeIndex.get(key);
    if (idx === undefined) {
      idx = edges.length;
      edgeIndex.set(key, idx);
      edges.push([ai, bi]);
      edgeMeta.push({ family, from: fromKey, to: toKey });
      return { idx, sign: 1 };
    }
    return { idx, sign: edges[idx][0] === ai ? 1 : -1 }; // orientation vs the stored edge
  };

  const faces: FaceEdge[][] = [];
  const faceMeta: ModuliComplex['faces'] = [];
  const faceFamily: string[] = [];
  for (const fam of families) {
    if (fam.paramCell?.params?.length !== 2) continue;
    const face = extractTwoCell(fam.paramCell);
    const fEdges = face.boundary.map((be) => {
      const { idx, sign } = edgeId(be, fam.id);
      return { edge: idx, sign };
    });
    faces.push(fEdges);
    faceFamily.push(fam.id);
    faceMeta.push({
      family: fam.id,
      boundary: face.boundary.map((be) => nodeMeta[nodeId(be.from)].key),
      productOK: face.productOK,
    });
  }

  const genuineInduced = inducedGenuine(nodeMeta, edges, faces);
  const full = homology({ nodes: nodeMeta.map((n) => n.key), edges, faces });
  const genuine = homology(genuineInduced.cx);
  // A face whose signed boundary edges cancel to nothing (∂₂ column ≡ 0) folds onto itself or closes a
  // surface alone; either way it is an UNVERIFIED b₂ generator. Surface which families do this.
  const degenerateFaces = faces
    .map((face, fi) => ({ fi, zero: hasZeroBoundary(face) }))
    .filter((x) => x.zero)
    .map((x) => faceMeta[x.fi].family);

  // Edge margin: among distinct edges sharing an endpoint pair, the fewest sample positions that differ.
  // A margin of 1 means a single sample distinguishes two edges — a near-collision worth flagging.
  const byPair = new Map<string, string[][]>(); // endpoint pair -> list of sample-key arrays
  for (const key of edgeIndex.keys()) {
    const [pair, fp] = key.split('||');
    const arr = byPair.get(pair) ?? [];
    arr.push(fp.split('>'));
    byPair.set(pair, arr);
  }
  let edgeMargin = Infinity;
  const nearCollisions: string[] = [];
  for (const [pair, arrs] of byPair) {
    for (let i = 0; i < arrs.length; i++) for (let j = i + 1; j < arrs.length; j++) {
      let diff = 0;
      for (let k = 0; k < arrs[i].length; k++) if (arrs[i][k] !== arrs[j][k]) diff++;
      edgeMargin = Math.min(edgeMargin, diff);
      if (diff === 1) nearCollisions.push(`edges at ${pair} differ in a single sample`);
    }
  }

  // Generators are extracted from the GENUINE subcomplex (⊥ and its incident cells removed), so their
  // counts match the headline genuine betti; faceFamily is realigned to the surviving faces via faceOrigin.
  const cx = genuineInduced.cx;
  const genuineFaceFamily = genuineInduced.faceOrigin.map((oi) => faceFamily[oi]);
  return {
    complex: {
      nodes: nodeMeta, edges: edgeMeta, faces: faceMeta,
      chi: genuine.chi, betti: genuine.betti,
      full: { chi: full.chi, betti: full.betti },
      degenerateFaces,
      nodeCoords, edgeMargin, nearCollisions,
    },
    cx,
    faceFamily: genuineFaceFamily,
  };
}

/** Thin wrapper: the plain ModuliComplex (drops the verification extras nodeCoords/edgeMargin/
 *  nearCollisions so the serialised artifact is unchanged). */
export function assembleComplex(families: FamilyRecord[]): ModuliComplex {
  const { complex } = buildCellComplex(families);
  return {
    nodes: complex.nodes, edges: complex.edges, faces: complex.faces,
    chi: complex.chi, betti: complex.betti, full: complex.full,
    degenerateFaces: complex.degenerateFaces,
  };
}

/** True iff the face's signed boundary is the zero 1-chain (every edge cancels) — a degenerate/self-
 *  folding attaching map or a lone surface, ambiguous without per-generator verification. */
function hasZeroBoundary(face: FaceEdge[]): boolean {
  const net = new Map<number, number>();
  for (const { edge, sign } of face) net.set(edge, (net.get(edge) ?? 0) + sign);
  return [...net.values()].every((v) => v === 0);
}

/** The subcomplex induced on the genuine (non-⊥) nodes: drop ⊥, every edge incident to it, and every
 *  face any of whose boundary edges was dropped. Indices are remapped to the survivors. `faceOrigin[i]`
 *  is the original face index of the i-th surviving genuine face, so per-face metadata (e.g. family)
 *  can be realigned to `cx.faces`. */
function inducedGenuine(
  nodeMeta: ModuliComplex['nodes'],
  edges: [number, number][],
  faces: FaceEdge[][],
): { cx: CellComplex; faceOrigin: number[] } {
  const keepNode = nodeMeta.map((n) => n.key !== DEG);
  const nodeRemap = new Map<number, number>();
  const gNodes: string[] = [];
  nodeMeta.forEach((n, i) => { if (keepNode[i]) { nodeRemap.set(i, gNodes.length); gNodes.push(n.key); } });

  const keepEdge = edges.map(([a, b]) => keepNode[a] && keepNode[b]);
  const edgeRemap = new Map<number, number>();
  const gEdges: [number, number][] = [];
  edges.forEach(([a, b], e) => {
    if (keepEdge[e]) { edgeRemap.set(e, gEdges.length); gEdges.push([nodeRemap.get(a)!, nodeRemap.get(b)!]); }
  });

  const gFaces: FaceEdge[][] = [];
  const faceOrigin: number[] = [];
  faces.forEach((face, fi) => {
    if (face.every((fe) => keepEdge[fe.edge])) {
      gFaces.push(face.map((fe) => ({ edge: edgeRemap.get(fe.edge)!, sign: fe.sign })));
      faceOrigin.push(fi);
    }
  });
  return { cx: { nodes: gNodes, edges: gEdges, faces: gFaces }, faceOrigin };
}
