import type { FloatTiling } from './types';
import { effectiveVerts } from './geometry';
import { flattenKey } from './flattenKey';

// Node identity up to DIRECT similarity (rotation, translation, uniform scale — NOT reflection), with
// chirality tracked. The shape fingerprint is `flattenKey` (a proven similarity-invariant, reflection-
// BLIND key that already folds in the tile multiset, the Gauss-reduced lattice, and the centroid
// spectrum). flattenKey alone over-merges a chiral tiling with its mirror; we add a handedness bit
// derived from a reflection-SENSITIVE canonical form (`directKey`) compared against the mirror. An
// intrinsic exact ℤ[ζ₂₄] key is out of scope (shipped atlas is float-only); this geometric key is
// defensible by separation margin — distinct unit-regular tilings differ by O(1) ≫ the quantisation.

const EPS = 1e-6;
const Q = 1e4; // quantise aligned coords to 1e-4; distinct tilings differ by far more than this

function effTiles(t: FloatTiling): [number, number][][] {
  return t.polys.map((p) => effectiveVerts(p.verts)).filter((v) => v.length >= 3);
}

function mirror(t: FloatTiling): FloatTiling {
  return {
    polys: t.polys.map((p) => ({ n: p.n, star: p.star, verts: p.verts.map(([x, y]) => [x, -y] as [number, number]) })),
    basis: [[t.basis[0][0], -t.basis[0][1]], [t.basis[1][0], -t.basis[1][1]]],
  };
}

/**
 * Canonical form of a tiling's effective-vertex point set under DIRECT similarity: centre at the
 * centroid, scale by the shortest edge, then take the lexicographically smallest serialisation over
 * every anchor alignment (each non-central point rotated onto +x). Reflection is deliberately NOT
 * quotiented, so a chiral tiling and its mirror get different keys, while an achiral tiling (congruent
 * to its mirror by a rotation) and its mirror get the same key. Used only to derive the handedness bit;
 * shape distinctness comes from `flattenKey`.
 */
function directKey(t: FloatTiling): string {
  const tiles = effTiles(t);
  const pts: [number, number][] = [];
  for (const v of tiles) for (const p of v) pts.push([p[0], p[1]]);
  if (pts.length === 0) return 'degenerate:⊥';
  let s = Infinity;
  for (const v of tiles) for (let i = 0; i < v.length; i++) {
    const q = v[(i + 1) % v.length];
    s = Math.min(s, Math.hypot(v[i][0] - q[0], v[i][1] - q[1]));
  }
  if (!Number.isFinite(s) || s <= 0) s = 1;
  const gx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const gy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const centered = pts.map(([x, y]): [number, number] => [(x - gx) / s, (y - gy) / s]);
  let best: string | null = null;
  for (const a of centered) {
    const r = Math.hypot(a[0], a[1]);
    if (r < EPS) continue; // a point at the centroid gives no orientation reference
    const th = Math.atan2(a[1], a[0]);
    const c = Math.cos(-th), sn = Math.sin(-th);
    const ser = centered
      .map(([x, y]) => `${Math.round((x * c - y * sn) * Q)},${Math.round((x * sn + y * c) * Q)}`)
      .sort()
      .join(';');
    if (best === null || ser < best) best = ser;
  }
  return best ?? 'degenerate:⊥';
}

export interface CanonicalKey { key: string; handed: boolean; blind: string; }

/**
 * Direct-similarity node key. `blind` is the reflection-invariant shape fingerprint (flattenKey); `key`
 * is `blind` plus a handedness bit so a chiral tiling and its mirror get distinct keys while an achiral
 * one keeps a single key. `handed` is true iff the tiling is chiral (no direct isometry onto its mirror).
 * An empty tiling (zero-area collapse) is the shared ⊥.
 */
export function nodeCanonicalKey(t: FloatTiling): CanonicalKey {
  if (effTiles(t).length === 0) return { key: 'degenerate:⊥', handed: false, blind: 'degenerate:⊥' };
  const blind = flattenKey(t);
  const dk = directKey(t), dkm = directKey(mirror(t));
  const handed = dk !== dkm;
  // Achiral ⇒ 'a' (mirror shares it). Chiral ⇒ the two hands get '0'/'1' by the canonical order of their
  // direct keys, so a tiling and its mirror land on opposite bits but the SAME `blind`.
  const hand = handed ? (dk < dkm ? '0' : '1') : 'a';
  return { key: `${blind}|${hand}`, handed, blind };
}
