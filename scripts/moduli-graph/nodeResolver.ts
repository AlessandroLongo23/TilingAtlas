import { tilingSignature, vertexConfigs, configAngleSum } from './tilingSignature';
import type { CatalogueIndex } from './catalogueKeys';
import type { NodeState, ResolvedNode } from './types';

// A single shared node for every degenerate (non-tiling) limit — the one-point compactification of
// the degenerate locus. All families that flatten into a non-tiling connect here, and it is distinct
// from every real tiling node (including the excluded octagon, which is a genuine tiling).
const DEGENERATE: ResolvedNode = {
  key: 'degenerate:⊥', label: '⊥ non-tiling', chirality: 'achiral', resolved: false, kind: 'degenerate',
};

/**
 * Identify a node state. A state is a genuine tiling iff every vertex configuration closes to 360°
 * (combinatorial validity) and every tile is regular (geometric regularity). A genuine tiling that
 * matches a catalogue entry is `uniform`; a genuine tiling with no catalogue match (e.g. the
 * deliberately-excluded octagon 4.8.8) is `uncatalogued` and keeps its own node; anything else is a
 * flattened/degenerate limit and collapses into the shared ⊥ node.
 */
export function resolveNode(state: NodeState, idx: CatalogueIndex): ResolvedNode {
  const cfgs = vertexConfigs(state.tiling);
  const valid = cfgs.length > 0 && cfgs.every((c) => Math.abs(configAngleSum(c) - 360) < 1);
  if (!state.regular || !valid) return DEGENERATE;

  const sig = tilingSignature(state.tiling);
  const matches = idx.bySignature.get(sig) ?? [];
  if (matches.length === 1) {
    const e = matches[0];
    const chirality = e.directKey === e.mirrorKey ? 'achiral' : 'R'; // handedness refinement deferred
    return { key: e.directKey, label: e.id, chirality, resolved: true, kind: 'uniform' };
  }
  // a genuine tiling the catalogue does not contain (excluded octagon) or an ambiguous signature
  return { key: `uncat:${sig}`, label: sig, chirality: 'achiral', resolved: false, kind: 'uncatalogued' };
}
