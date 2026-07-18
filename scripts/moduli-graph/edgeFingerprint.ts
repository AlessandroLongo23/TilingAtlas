import { nodeCanonicalKey } from './nodeCanonicalKey';
import type { FloatTiling } from './types';

/** Direction-normalised fingerprint of a 1-cell from K interior sample tilings taken in from→to order.
 *  Orient by the endpoint keys (smaller endpoint first) so an arc and its reverse traversal — the two
 *  faces sharing it — produce the same string. Each sample is a full canonical tiling key, so two
 *  genuinely different arcs agreeing at ALL K samples is astronomically unlikely (kills false-merge). */
export function edgeFingerprint(samples: FloatTiling[], fromKey: string, toKey: string): string {
  const keys = samples.map((t) => nodeCanonicalKey(t).key);
  const oriented = fromKey <= toKey ? keys : keys.slice().reverse();
  return oriented.join('>');
}
