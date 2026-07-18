import { describe, it, expect } from 'vitest';
import { edgeFingerprint } from '../../scripts/moduli-graph/edgeFingerprint';
import type { FloatTiling } from '../../scripts/moduli-graph/types';

const sq = (s: number): FloatTiling => ({ polys: [{ n: 4, verts: [[0, 0], [s, 0], [s, s], [0, s]] }], basis: [[s, 0], [0, s]] });
const tri = (): FloatTiling => ({ polys: [{ n: 3, verts: [[0, 0], [1, 0], [0.5, Math.sqrt(3) / 2]] }], basis: [[1, 0], [0.5, Math.sqrt(3) / 2]] });

describe('edgeFingerprint', () => {
  it('is direction-normalised: same arc from either end gives the same fingerprint', () => {
    const samples = [sq(1), tri(), sq(2)];
    const fwd = edgeFingerprint(samples, 'A', 'B');
    const rev = edgeFingerprint(samples.slice().reverse(), 'B', 'A');
    expect(fwd).toBe(rev);
  });
  it('two arcs sharing endpoints and one congruent midpoint but differing elsewhere get different keys', () => {
    // The canonical key is scale-invariant (direct similarity ⇒ uniform scale), so sq(1)/sq(2)/sq(3) all
    // canonicalise identically — the differing sample must differ by SHAPE, not scale, to be a real
    // divergence. Both arcs share the tri() midpoint (the old single-midpoint key would false-merge them);
    // the multi-sample key catches the square-vs-triangle divergence at the first sample.
    const arcX = [sq(1), tri(), sq(3)];
    const arcY = [tri(), tri(), sq(3)];
    expect(edgeFingerprint(arcX, 'A', 'B')).not.toBe(edgeFingerprint(arcY, 'A', 'B'));
  });
  it('identical sample sequences with identical endpoints match (a real shared arc glues)', () => {
    const s = [sq(1), tri(), sq(2)];
    expect(edgeFingerprint(s, 'A', 'B')).toBe(edgeFingerprint([sq(1), tri(), sq(2)], 'A', 'B'));
  });
});
