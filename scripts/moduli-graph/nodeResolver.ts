import { tilingSignature } from './tilingSignature';
import type { CatalogueIndex } from './catalogueKeys';
import type { NodeState, ResolvedNode } from './types';

export function resolveNode(state: NodeState, idx: CatalogueIndex): ResolvedNode {
  const sig = tilingSignature(state.tiling);
  const matches = idx.bySignature.get(sig) ?? [];
  if (matches.length === 1) {
    const e = matches[0];
    const chirality = e.directKey === e.mirrorKey ? 'achiral' : 'R'; // handedness refinement deferred
    return { key: e.directKey, label: e.id, chirality, resolved: true };
  }
  return {
    key: `unresolved:${sig}`,
    label: matches.length > 1 ? `ambiguous(${sig})` : `unresolved(${sig})`,
    chirality: 'achiral',
    resolved: false,
  };
}
