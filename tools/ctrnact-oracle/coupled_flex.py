#!/usr/bin/env python3
"""coupled_flex.py — multi-parameter (COUPLED) symbolic development, shared.

`family_flex.develop_formal` flexes ONE direction: its Laurent monomials are keyed by a scalar exponent,
so it can only follow a single δ. A family whose flex space is P-dimensional and whose axes do not
separate into independent species needs the exponent to be a P-TUPLE — one component per parameter.

This module holds that generalization. It was written twice, byte-identically, inside
export_combined_families.py and export_isotoxal_families.py, and used a third time by
scripts/scan-coupled-families.py; extracted here 2026-08-08 so the period-p families could reuse it
instead of forking it a fourth time. The Laurent primitives in family_flex (lp_add/lp_sub/lp_mono/lp_key,
period_lattice, flatten_basis, dedupe_mod_lattice, face_canonical) are agnostic to the monomial-key TYPE,
so they work unchanged with tuple keys — that is the whole reason this is a small module and not a rewrite.

qeff[c] is a P-tuple: corner class c's δ-coefficient per parameter. What varies between callers is only
how qeff is built:
  star tiles      +1 on the point corner, −1 on the dent          (one column per species)
  cx isotoxal     +1 on corner @0, −1 on corner @1                (one column per species)
  period-p tiles  a sum-zero basis of dimension p−1 per tile      (p−1 columns for ONE tile)
The last is why the period-3 shelf needs this: its flex space is 2-dimensional on a SINGLE tile, so it is
coupled by construction and cannot be expressed as separable per-species sliders.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cmath
import itertools
import math
import family_flex as ff
from family_flex import (ZK, ZERO8, lp_add, lp_sub, lp_key, lp_norm, zadd, zsub,
                         FormalPin, period_lattice, flatten_basis)


# float embedding of the exact ring, ζ₂₄^k — shared so zvec_float has one definition, not three
ZF = [cmath.exp(1j * math.pi * (k % 24) / 12) for k in range(24)]


def zvec_float(v):
    return sum(c * ZF[k] for k, c in enumerate(v) if c)


def _madd(m, q, sign):
    return tuple(mi + sign * qi for mi, qi in zip(m, q))


def develop_multi(tab, rneig, cls, glue, qeff, P, sign=1, guard=400000):
    from collections import deque
    D = tab.D
    units = tab.CLASS_UNITS
    Z = (0,) * P

    def star(h0, t0, m0):
        seq, cur, t, m = [], h0, t0, m0
        for _ in range(8 * D):
            seq.append((cur, t, m))
            r = rneig[cur]
            t = (t + sign * units[cls[r]]) % D
            m = _madd(m, qeff[cls[r]], sign)
            cur = r
            if cur == h0 and t == t0 and m == m0:
                return seq
            if cur == h0 and t == t0 and m != m0:
                raise ff.FormalPin("vertex walk depends on δ ⇒ closure only at δ=0")
        return None

    placed, periods = {}, []

    def reg(key, pos):
        if key in placed:
            if ff.lp_key(placed[key]) != ff.lp_key(pos):
                periods.append(ff.lp_sub(pos, placed[key]))
            return False
        placed[key] = pos
        return True

    start = (0, 0, Z)
    reg(start, ff.LP0)
    q = deque([(start, ff.LP0)])
    expanded = set()
    g = 0
    while q:
        g += 1
        if g > guard:
            raise RuntimeError("BFS did not terminate")
        (h0, t0, m0), pos = q.popleft()
        pk = ff.lp_key(pos)
        if pk in expanded:
            continue
        expanded.add(pk)
        seq = star(h0, t0, m0)
        if seq is None:
            raise RuntimeError("vertex star did not close")
        for h, t, m in seq:
            reg((h, t, m), pos)
            gg, gt, gm = glue[h], (t + D // 2) % D, m
            npos = ff.lp_add(pos, ff.lp_mono(t, m))
            if reg((gg, gt, gm), npos):
                q.append(((gg, gt, gm), npos))
    return placed, periods


def _face_walk_multi(tab, rneig, cls, glue, qeff, start_key, placed, sign=1):
    D = tab.D
    units = tab.CLASS_UNITS
    h, t, m = start_key
    pos = placed[start_key]
    verts, corner_cls = [], []
    cur_h, cur_t, cur_m, cur_pos = h, t, m, pos
    for _ in range(128):
        verts.append(cur_pos)
        g = glue[cur_h]
        npos = ff.lp_add(cur_pos, ff.lp_mono(cur_t, cur_m))
        nh = rneig[g]
        corner = cls[nh]
        corner_cls.append(corner)
        nt = ((cur_t + D // 2) + sign * units[corner]) % D
        nm = _madd(cur_m, qeff[corner], sign)
        cur_h, cur_t, cur_m, cur_pos = nh, nt, nm, npos
        if cur_h == h and cur_t == t and cur_m == m:
            return verts, corner_cls, ff.lp_key(cur_pos) == ff.lp_key(pos)
    return None, None, False


def trace_faces_multi(tab, rneig, cls, glue, qeff, placed, sign=1):
    faces = {}
    for key in placed:
        verts, ccls, closed = _face_walk_multi(tab, rneig, cls, glue, qeff, key, placed, sign)
        if verts is None:
            continue
        if not closed:
            raise RuntimeError("face walk failed to close FORMALLY")
        tiles = {tab.CLASS_TILE[c] for c in ccls}
        if len(tiles) != 1:
            continue
        fkey = frozenset(ff.lp_key(v) for v in verts)
        if fkey not in faces:
            faces[fkey] = (verts, tiles.pop())
    return list(faces.values())


def lp_terms_multi(p):
    """Laurent element with P-tuple keys → [[mVec, re, im], ...] (mVec a list of length P)."""
    return [[list(m), (z := zvec_float(p[m])).real, z.imag] for m in sorted(p)]


# ── family identity: the canonical form of the labelled dart map ─────────────────────────────────────
# Written for the isotoxal shelf and copied byte-identically into the mixed one; extracted here 2026-08-09
# when the period-p shelf needed it as well. It is the ONLY key that separates two tilings sharing a
# vertex-type multiset but glued differently — a `(3')` half-edge against a `[3']` one. A key built from
# vertex words alone cannot see that difference, and the period exporter shipped one tiling of each such
# pair until this replaced it.

def canonical_map(n, rels, lab):
    """Complete canonical form of a LABELLED oriented dart map (min over deterministic traversals from each
    start dart). Two maps share it iff isomorphic as labelled maps. O(n²) for these ≤~30-dart maps."""
    best = None
    for start in range(n):
        order = {start: 0}
        queue = [start]
        qi = 0
        while qi < len(queue):  # deterministic BFS: explore relations in fixed order
            d = queue[qi]
            qi += 1
            for R in rels:
                nb = R[d]
                if nb not in order:
                    order[nb] = len(order)
                    queue.append(nb)
        if len(order) != n:
            continue
        inv = [0] * n
        for d, i in order.items():
            inv[i] = d
        canon = tuple((lab[inv[i]],) + tuple(order[R[inv[i]]] for R in rels) for i in range(n))
        if best is None or canon < best:
            best = canon
    return best


def map_key_over_perms(rels, label_of, P):
    """canonical_map minimized over the P! relabellings of the parameter axes.

    Which null-space direction is called δ₁ and which δ₂ is an artifact of how int_nullspace ordered its
    basis, so a family reached from two different seeds can name the same two axes in opposite orders.
    Minimizing over permutations makes the key blind to that, which is what lets the two grid members of
    one 2-parameter family share a key instead of splitting into two shelf entries.

    `label_of(dart, perm)` returns the dart's label under the permutation; each caller supplies its own,
    since what an angle-abstracted label must carry differs per shelf (isotoxal: α-normalized units;
    period-p: the δ-coefficient vector).
    """
    n = len(rels[0])
    best = None
    for perm in itertools.permutations(range(P)):
        k = canonical_map(n, rels, [label_of(d, perm) for d in range(n)])
        if best is None or k < best:
            best = k
    return best
