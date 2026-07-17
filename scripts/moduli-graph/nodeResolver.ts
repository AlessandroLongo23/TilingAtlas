import { tilingSignature, vertexConfigs, configAngleSum } from './tilingSignature';
import { flattenKey, flattenLabel } from './flattenKey';
import type { CatalogueIndex } from './catalogueKeys';
import type { NodeState, ResolvedNode } from './types';

// The ⊥ non-tiling node: reached ONLY by a zero-area collapse, where every tile shrinks to nothing and
// no tiling remains. This is the one true non-tiling limit; the flattening limits below are genuine
// tilings and do NOT come here.
const DEGENERATE: ResolvedNode = {
  key: 'degenerate:⊥', label: '⊥ non-tiling', chirality: 'achiral', resolved: false, kind: 'degenerate',
};

/**
 * Identify a node state. Three real outcomes plus the one non-tiling:
 *  - empty tiling (every tile collapsed to zero area) → ⊥ `degenerate`, a true non-tiling.
 *  - regular tiles with a valid edge-to-edge vertex figure → a genuine uniform tiling: `uniform` if it
 *    matches the catalogue, else `uncatalogued` (the excluded octagon 4.8.8).
 *  - regular tiles but NO valid vertex figure → a `flattened` limit: a genuine non-edge-to-edge tiling
 *    by regular polygons of two sizes (a tile flattened to 180° and became a larger polygon). Merged up
 *    to direct similarity by `flattenKey`, so the same limit from different families is one node.
 *  - anything else (non-regular, non-empty) cannot be identified → ⊥.
 */
export function resolveNode(state: NodeState, idx: CatalogueIndex): ResolvedNode {
  if (state.tiling.polys.length === 0) return DEGENERATE;

  const cfgs = vertexConfigs(state.tiling);
  const valid = cfgs.length > 0 && cfgs.every((c) => Math.abs(configAngleSum(c) - 360) < 1);

  if (state.regular && valid) {
    const sig = tilingSignature(state.tiling);
    const matches = idx.bySignature.get(sig) ?? [];
    if (matches.length === 1) {
      const e = matches[0];
      const chirality = e.directKey === e.mirrorKey ? 'achiral' : 'R'; // handedness refinement deferred
      return { key: e.directKey, label: e.id, chirality, resolved: true, kind: 'uniform' };
    }
    // a genuine edge-to-edge tiling the catalogue does not contain (excluded octagon) or ambiguous sig
    return { key: `uncat:${sig}`, label: sig, chirality: 'achiral', resolved: false, kind: 'uncatalogued' };
  }

  if (state.regular) {
    // regular tiles, no valid vertex figure ⇒ a non-edge-to-edge flattening limit: a real tiling
    return { key: `flat:${flattenKey(state.tiling)}`, label: flattenLabel(state.tiling), chirality: 'achiral', resolved: false, kind: 'flattened' };
  }

  return DEGENERATE;
}
