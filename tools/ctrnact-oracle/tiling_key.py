#!/usr/bin/env python3
"""tiling_key.py — a canonical combinatorial key for a tiling, computed from a DEVELOPED cell.

Why this exists (2026-08-09). Cross-tier deduplication needs to ask "is this family already on the shelf?"
and the obvious method does not work. Sampling both sides' parameters and looking for a congruent pair has
essentially no recall on continuous families: two representations of one family are the same tiling at
CORRESPONDING parameters, and nothing makes a sample grid on one side land on the corresponding point of
the other — measured, 0 of 27 shelf families found themselves that way.

Both existing exporters already key families on `coupled_flex.canonical_map`, the canonical form of the
labelled dart map, which is exactly the right invariant. It is unusable across palettes, though, because
its labels are alphabet symbols: `e3-6-135.135.90@0` on the concrete side against `e3-6@0` on the quotient
side, for the same corner. So this rebuilds the same invariant from GEOMETRY, where the only label is a
tile's vertex count, and that is comparable everywhere.

What makes it parameter-free. Inside a family the angles move but the combinatorics do not, so the map is
constant along the curve and two representations of one family produce one key. Two things have to be
right for that:

  * the quotient must be by the tiling's OWN translation lattice, not by whatever basis the cell was cut
    with, or a supercell keys differently from the cell it doubles. Periods are found the way
    `canonicalTilingKey.primitivePeriodArea` finds them — differences between same-label tile centroids,
    each tested for mapping the labelled tile set to itself — then reduced to a basis over ℤ.
  * the label must be the vertex count and nothing finer. Tile AREA and shape vary along the curve, so
    keying on them would split a family into one key per sampled parameter, which is the failure this
    replaces.

⚑ At a NON-GENERIC parameter the key is not the family's key. Where a family passes through extra
symmetry its primitive cell shrinks — a period-3 hexagon family at a₀ = a₁ = a₂ is the regular hexagonal
tiling, 1 tile per cell instead of 3 — and the map it produces is that of the degenerate member, correctly.
Compute at a generic parameter (`vertex_orbits.sample_alphas`) when the family's key is what you want.

Gate: `python3 tiling_key.py --gate 6` keys Galebach's catalogue. Those are 1,248 pairwise DISTINCT
tilings, so the key must produce 1,248 distinct values; anything fewer is a collision.
"""
import argparse
import json
import math
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vertex_orbits as vo

TOL = 1e-6
SCALE = 720720        # = lcm(1..16); every period denominator here divides a tile count, so this is exact
EDGE_Q = 6            # decimals on an edge midpoint when pairing darts


def _frac(z, b0, b1):
    det = b0.real * b1.imag - b1.real * b0.imag
    a = (z.real * b1.imag - b1.real * z.imag) / det
    b = (b0.real * z.imag - z.real * b0.imag) / det
    return a, b


def _fi(x):
    """Fractional part on the integer micro-grid."""
    return int(round(((x % 1.0) + 1.0) % 1.0 * SCALE)) % SCALE


def _tlabel(v):
    """Translation-sensitive tile identity: centroid-relative corner offsets in cyclic order.

    ⚑ `vertex_orbits.tile_label` is the WRONG label here and using it was a real bug. It is built to be
    rotation- and reflection-blind, which is exactly right for orbit counting and exactly wrong for
    finding TRANSLATIONS: two hexagons related by a half-turn carry the same label and their centroids
    shift correctly, so the period test accepted a rotation as a period, halved the primitive cell, and
    produced a map whose α was not an involution. Offsets are canonicalised over the starting index only —
    a vertex list may begin anywhere in the cycle — never over a rotation of the plane.
    """
    c = sum(v) / len(v)
    offs = [z - c for z in v]
    n = len(offs)
    best = None
    for s in range(n):
        cand = tuple((round(offs[(s + i) % n].real, 6), round(offs[(s + i) % n].imag, 6)) for i in range(n))
        if best is None or cand < best:
            best = cand
    return best


def _egcd(a, b):
    if b == 0:
        return (abs(a), 1 if a >= 0 else -1, 0)
    g, x, y = _egcd(b, a % b)
    return (g, y, x - (a // b) * y)


def _hnf2(gens):
    """Row-Hermite basis ((h11, h12), (0, h22)) of the 2-D integer lattice spanned by `gens`.

    Callers always pass (SCALE, 0) and (0, SCALE) among the generators, so both diagonal entries come out
    non-zero and the reduction below never hits its degenerate case.
    """
    a1 = b1 = 0
    rest = []
    for a, b in gens:
        if a == 0:
            rest.append(b)
            continue
        if a1 == 0:
            a1, b1 = a, b
            continue
        g, x, y = _egcd(a1, a)
        rest.append((a1 // g) * b - (a // g) * b1)
        a1, b1 = g, x * b1 + y * b
    h22 = 0
    for z in rest:
        h22 = math.gcd(h22, abs(z))
    if a1 == 0 or h22 == 0:
        raise ValueError("degenerate lattice generators")
    return (a1, b1 % h22), (0, h22)


def primitive_lattice(tiles, b0, b1):
    """Micro-grid basis of the tiling's OWN translation lattice, expressed inside the given one.

    Candidate periods are differences between same-label tile centroids — a translation symmetry carries a
    tile to a tile of identical label, so every period is such a difference — and a candidate is accepted
    only if shifting the whole labelled set by it reproduces the set exactly. The accepted set is a
    subgroup of (ℤ/SCALE)² containing the given lattice, so its preimage in ℤ² is a full-rank sublattice
    and `_hnf2` returns a basis.
    """
    pts = []
    for lab, c in tiles:
        fa, fb = _frac(c, b0, b1)
        pts.append((lab, _fi(fa), _fi(fb)))
    base = set(pts)
    bylab = defaultdict(list)
    for lab, a, b in pts:
        bylab[lab].append((a, b))
    cands = set()
    for lst in bylab.values():
        a0, b0i = lst[0]
        for a, b in lst:
            cands.add(((a - a0) % SCALE, (b - b0i) % SCALE))
    periods = []
    for ta, tb in cands:
        if (ta, tb) == (0, 0):
            continue
        if {(lab, (a + ta) % SCALE, (b + tb) % SCALE) for lab, a, b in pts} == base:
            periods.append((ta, tb))
    return _hnf2([(SCALE, 0), (0, SCALE)] + periods)


def _cls(a, b, L1, L2):
    """Coset of (a, b) modulo the primitive lattice, as a hashable pair."""
    h11, h12 = L1
    h22 = L2[1]
    n = a // h11
    return (a - n * h11, (b - n * h12) % h22)


def refine(polys, basis):
    """Promote every T-junction to a vertex, turning a NON-edge-to-edge cell into an edge-to-edge map.

    `build_map` pairs darts by edge MIDPOINT, so a side that a neighbour meets part-way along has no
    partner and the map is rejected — correctly, because the cell as GIVEN is not edge-to-edge. But the
    tiling is still a map: a T-junction is a vertex that this tile's outline simply does not name. Naming
    it costs nothing (the outline is unchanged, only the vertex list grows) and every consumer downstream
    — build_map, orbit_count, corner_angles, length_family — then works unaltered on the whole
    non-edge-to-edge shelf instead of refusing it.

    Idempotent: a cell that is already edge-to-edge comes back unchanged.
    """
    Sm = vo.S()
    ps = [p for p in polys if abs(Sm.signed_area(p["v"])) > Sm.ZERO_AREA]
    if not ps:
        return list(polys)
    trans = vo._translates(basis, ps, vo.max_circum(ps) * 2 + 2.0)
    pts = [z + t for t in trans for p in ps for z in p["v"]]
    out = []
    for p in ps:
        vs = p["v"]
        nv = []
        for j in range(len(vs)):
            a, b = vs[j], vs[(j + 1) % len(vs)]
            d = b - a
            L = abs(d)
            nv.append(a)
            if L <= TOL:
                continue
            hits = []
            for z in pts:
                w = (z - a) * d.conjugate() / (L * L)
                if w.real <= TOL / L or w.real >= 1 - TOL / L:
                    continue
                if abs(w.imag) * L > TOL:
                    continue
                hits.append((w.real, a + w.real * d))
            for s, z in sorted(hits, key=lambda h: h[0]):
                if abs(nv[-1] - z) > TOL:
                    nv.append(z)
        out.append({"n": p.get("n", len(vs)), "v": nv})
    return out


def smooth(polys, basis):
    """Delete the FALSE vertices — points that are a corner of no tile — merging the edges they split.

    The inverse of the half of `refine` that is bookkeeping, not geometry, and the fix for a real
    over-count. `refine` promotes every point where a side is met part-way to a vertex, which is right for
    a T-junction (one tile has a corner there, its neighbour runs straight through) and wrong for a point
    where EVERY incident tile runs straight through. Such a point is a corner of nothing: the tiling does
    not know it is there, and the two edges it separates can trade length freely without a tile moving.

    Leaving those in is what made `length_family` report a rectangle grid as a 3-parameter family, with
    two sliders that only ever moved the invisible mark along the side. Once they are gone the closure
    system has one variable per REAL edge and `dim ker(A)` is the tiling's own freedom.

    Idempotent, and a no-op on any cell whose vertices are all genuine corners — which is every
    edge-to-edge cell, so the rest of the oracle is untouched.
    """
    Sm = vo.S()
    ps = [p for p in polys if abs(Sm.signed_area(p["v"])) > Sm.ZERO_AREA]
    if not ps:
        return list(polys)
    b0, b1 = basis

    def key(z):
        a, b = _frac(z, b0, b1)
        return (_fi(a), _fi(b))

    def is_flat(v, j):
        n = len(v)
        d0 = v[j] - v[(j - 1) % n]
        d1 = v[(j + 1) % n] - v[j]
        if abs(d0) <= TOL or abs(d1) <= TOL:
            return False
        u0, u1 = d0 / abs(d0), d1 / abs(d1)
        return abs(u1 - u0) <= 1e-9

    # A key is LIVE as soon as one incident corner turns. Collected over one period only: every tile
    # incident to a point is a lattice translate of some tile here, and a translate keys the same.
    live = {}
    for p in ps:
        v = p["v"]
        for j in range(len(v)):
            k = key(v[j])
            live[k] = live.get(k, False) or not is_flat(v, j)

    out, changed = [], False
    for p in ps:
        v = p["v"]
        nv = [z for j, z in enumerate(v) if live.get(key(z), True)]
        if len(nv) < 3:
            return list(polys)          # not a polygon any more: leave the cell alone, say nothing
        if len(nv) != len(v):
            changed = True
        out.append({"n": len(nv), "v": nv})
    return out if changed else [{"n": p.get("n", len(p["v"])), "v": list(p["v"])} for p in ps]


def build_map(polys, basis):
    """(labels, sigma, alpha, reps, ps) — the tiling's dart map on its PRIMITIVE quotient.

    sigma steps to the next corner of the same tile, alpha crosses the edge to the neighbouring tile's
    dart on the same edge. Together they are the map; everything else here is derived from them.
    """
    Sm = vo.S()
    ps = [p for p in polys if abs(Sm.signed_area(p["v"])) > Sm.ZERO_AREA]
    b0, b1 = basis
    tiles = [(_tlabel(p["v"]), sum(p["v"]) / len(p["v"])) for p in ps]
    L1, L2 = primitive_lattice(tiles, b0, b1)

    # one representative per lattice class of tile
    reps, rep_of = [], {}
    for i, (lab, c) in enumerate(tiles):
        fa, fb = _frac(c, b0, b1)
        key = (lab, _cls(_fi(fa), _fi(fb), L1, L2))
        if key not in rep_of:
            rep_of[key] = len(reps)
            reps.append(i)
    R = len(reps)

    # edge index over a patch: midpoint -> [(cell tile index, translate, corner index)]
    trans = vo._translates(basis, ps, vo.max_circum(ps) * 2 + 2.0)
    emap = defaultdict(list)
    for t in trans:
        for i, p in enumerate(ps):
            vs = [z + t for z in p["v"]]
            for j in range(len(vs)):
                m = (vs[j] + vs[(j + 1) % len(vs)]) / 2
                emap[(round(m.real, EDGE_Q), round(m.imag, EDGE_Q))].append((i, t, j))

    # darts of the primitive quotient
    darts, dindex = [], {}
    for r, ti in enumerate(reps):
        for j in range(len(ps[ti]["v"])):
            dindex[(r, j)] = len(darts)
            darts.append((r, j))
    sigma, alpha, labels = [], [], []
    for (r, j) in darts:
        ti = reps[r]
        n = len(ps[ti]["v"])
        labels.append(n)
        sigma.append(dindex[(r, (j + 1) % n)])
        vs = ps[ti]["v"]
        m = (vs[j] + vs[(j + 1) % n]) / 2
        pair = emap.get((round(m.real, EDGE_Q), round(m.imag, EDGE_Q)), [])
        other = [(i2, t2, j2) for (i2, t2, j2) in pair if not (i2 == ti and abs(t2) < TOL)]
        if not other:
            return None                              # not edge-to-edge here; caller decides what that means
        i2, t2, j2 = other[0]
        c2 = sum(z + t2 for z in ps[i2]["v"]) / len(ps[i2]["v"])
        fa, fb = _frac(c2, b0, b1)
        r2 = rep_of[(_tlabel(ps[i2]["v"]), _cls(_fi(fa), _fi(fb), L1, L2))]
        # ⚑ The corner index does NOT carry over to the representative. Reduction identifies two tiles
        # that are lattice TRANSLATES, and a translate's vertex list can start anywhere in the cycle, so
        # reusing j2 pairs darts at random. It produced an `alpha` that was not even an involution — a
        # malformed map that still hashed injectively, which is why the Galebach gate did not catch it.
        # Match on the centroid-relative corner offset instead, which a translation preserves exactly.
        off = ps[i2]["v"][j2] + t2 - c2
        rv = ps[reps[r2]]["v"]
        rc = sum(rv) / len(rv)
        j2r = min(range(len(rv)), key=lambda kk: abs(rv[kk] - rc - off))
        if abs(rv[j2r] - rc - off) > 1e-6:
            return None
        alpha.append(dindex[(r2, j2r)])
    # α pairs the two darts of one edge, so it MUST be a fixed-point-free involution. Anything else is a
    # broken map, and a broken map that still hashes is the worst kind of wrong.
    if any(alpha[alpha[d]] != d or alpha[d] == d for d in range(len(darts))):
        return None
    return labels, sigma, alpha, reps, ps, darts


def canonical(labels, sigma, alpha):
    """(key, labelings) — the canonical encoding, and EVERY dart numbering that achieves it.

    The extra labelings are the map's automorphisms, and they are needed downstream: two entries over one
    map are only comparable coordinate-by-coordinate once their darts are aligned, and a map with symmetry
    offers several equally canonical alignments. Both orientations are searched, so mirror images key the
    same — the project's chirality convention.
    """
    D = len(labels)
    sig_inv = [0] * D
    for d in range(D):
        sig_inv[sigma[d]] = d
    best, labelings = None, []
    for perm in (sigma, sig_inv):
        for root in range(D):
            idx = {root: 0}
            order = [root]
            qi = 0
            while qi < len(order):
                d = order[qi]
                qi += 1
                for nxt in (perm[d], alpha[d]):
                    if nxt not in idx:
                        idx[nxt] = len(order)
                        order.append(nxt)
            if len(order) != D:
                continue
            enc = ";".join(f"{labels[d]},{idx[perm[d]]},{idx[alpha[d]]}" for d in order)
            if best is None or enc < best:
                best, labelings = enc, [order]
            elif enc == best:
                labelings.append(order)
    return best, labelings


def corner_angles(polys_map):
    """The interior angle at every dart, in the dart order `build_map` produced."""
    labels, sigma, alpha, reps, ps, darts = polys_map
    Sm = vo.S()
    return [Sm.angle_at(ps[reps[r]]["v"], j) for (r, j) in darts]


def tiling_key(polys, basis):
    """Canonical labelled dart map of the tiling, as a string. Mirror images key the same."""
    m = build_map(polys, basis)
    if m is None:
        return None
    labels, sigma, alpha, reps, ps, darts = m
    best, _ = canonical(labels, sigma, alpha)
    return f"R{len(reps)}#{best}"


def _face_equilateral(v, tol=1e-6):
    """Does this face have all its geometric SIDES equal? A side is a maximal run of edges through flat
    corners, so a square whose top is met part-way along is still a square, not a rigid hexagon."""
    n = len(v)
    d = [(v[(j + 1) % n] - v[j]) / abs(v[(j + 1) % n] - v[j]) for j in range(n)]
    lens = []
    for j in range(n):
        if j == 0 or abs(d[j] - d[j - 1]) > 1e-9:
            lens.append(0.0)
        lens[-1] += abs(v[(j + 1) % n] - v[j])
    if len(lens) > 1 and abs(d[0] - d[-1]) <= 1e-9:
        t = lens.pop()
        lens[0] += t
    return all(abs(x - lens[0]) < tol * max(1.0, lens[0]) for x in lens)


def family_key(polys, basis, q=6):
    """The LENGTH FAMILY a tiling belongs to, as a string — the key the parametric shelf deduplicates on.

    `tiling_key` is the map alone, and the map alone is not the family. It labels darts by tile size, so
    the equiangular hexagon grid and the offset rows of squares carry the SAME key: one hexagonal face,
    two vertices, three edges in both, because a square met part-way along its top and bottom is a
    six-cornered face of the map. Deduplicating on it merged two tilings that share nothing but their
    combinatorics.

    Three things pin the family down, and it needs all three:

        the MAP        which edge meets which, canonically labelled;
        the ANGLES     fixed across a length family by definition, and what separates 90-90-180 from
                       120-120-120 on the map above;
        the EQUALITIES which tiles the family holds equilateral. Rows of unit squares and rows of
                       1-by-h rectangles have the same map and the same angles and are not the same
                       family: one has two shift parameters, the other four. The difference is a
                       constraint, not a shape, so it cannot be read off any single member's lengths —
                       only off whether the sides come out equal at a GENERIC one.

    ⚑ Call this at a generic member. At a symmetric one distinct edges coincide, a primitive cell can
    look like a supercell, and unrelated tiles come out equilateral by accident.
    """
    m = build_map(polys, basis)
    if m is None:
        return None
    labels, sigma, alpha, reps, ps, darts = m
    best, labelings = canonical(labels, sigma, alpha)
    ang = corner_angles(m)
    eq = {r: _face_equilateral(ps[reps[r]]["v"]) for r in {d[0] for d in darts}}
    words = []
    for order in labelings:
        words.append(",".join(f"{ang[d]:.{q}f}" for d in order)
                     + "|" + "".join("1" if eq[darts[d][0]] else "0" for d in order))
    return f"R{len(reps)}#{best}#{min(words)}"


def family_subspace(rec, samples=8):
    """(key, labelings, vectors) — a family as an AFFINE SUBSPACE of its map's corner-angle space.

    The map alone does not identify a shelf family, and the shelf proves it: `period-family-k2-001` and
    `-021` are both hexagons three-to-a-vertex, so both carry the honeycomb map, and they are plainly
    different entries — one tiles with two period-3 hexagons, the other with a regular hexagon and a
    period-3 one. The map fixes the AMBIENT space (its tile and vertex closure rows); a palette then cuts
    a subspace out of it by declaring which corners belong to one tile species. So family identity is
    subspace identity, and "this candidate adds nothing" is subspace CONTAINMENT — both exact questions in
    linear algebra once the darts are aligned, and neither answerable by sampling parameters and hoping
    two grids meet.
    """
    fam = vo.as_family(rec)
    pts, pc = None, None
    if fam:
        pc = {"params": fam["params"], "cellPolygons": fam["cellPolygons"], "basis": fam["basis"]}
        pts = vo.sample_alphas(fam, samples)
    else:
        pts = [None]
    key, labs, vecs = None, None, []
    for a in pts:
        if a is None:
            polys, basis = vo.float_cell(rec["renderCell"])
        else:
            polys, basis = vo.S().cell_at(pc, a)
            ok, _ = vo.S().health(polys, basis)
            if not ok:
                continue
        m = build_map(polys, basis)
        if m is None:
            continue
        enc, ls = canonical(m[0], m[1], m[2])
        kk = f"R{len(m[3])}#{enc}"
        if key is None:
            key, labs = kk, ls
        elif kk != key:
            continue                      # a degenerate member of the family; not the generic map
        ang = corner_angles(m)
        vecs.append([ang[d] for d in labs[0]])
    return key, labs, vecs


def _hull(vecs):
    """(origin, orthonormal basis of the direction space) of the affine hull."""
    o = vecs[0]
    basis = []
    for v in vecs[1:]:
        r = [x - y for x, y in zip(v, o)]
        for u in basis:
            d = sum(a * b for a, b in zip(r, u))
            r = [a - d * b for a, b in zip(r, u)]
        n = math.sqrt(sum(x * x for x in r))
        if n > 1e-7:
            basis.append([x / n for x in r])
    return o, basis


def contains(outer, inner, tol=1e-5):
    """Is the affine hull of `inner` inside the affine hull of `outer`? Both in the same coordinates."""
    o, basis = _hull(outer)
    for v in inner:
        r = [x - y for x, y in zip(v, o)]
        for u in basis:
            d = sum(a * b for a, b in zip(r, u))
            r = [a - d * b for a, b in zip(r, u)]
        if math.sqrt(sum(x * x for x in r)) > tol:
            return False
    return True


def relate(A, B):
    """How family A sits inside family B: 'same' | 'inside' | 'contains' | 'disjoint' | 'other-map'.

    A and B are (key, labelings, vectors) triples. Alignment runs over every canonical labelling of B,
    which is the map's automorphism group — with symmetry there is more than one equally canonical way to
    number the darts, and only one of them need line the two subspaces up.
    """
    ka, la, va = A
    kb, lb, vb = B
    if not (ka and kb) or ka != kb or not va or not vb:
        return "other-map"
    base = {d: i for i, d in enumerate(lb[0])}
    for order in lb:
        perm = [base[d] for d in order]                       # re-express B in this labelling
        vb2 = [[v[p] for p in perm] for v in vb]
        a_in_b = contains(vb2, va)
        b_in_a = contains(va, vb2)
        if a_in_b and b_in_a:
            return "same"
        if a_in_b:
            return "inside"
        if b_in_a:
            return "contains"
    return "disjoint"


def family_keys(rec, samples=5):
    """Every key the record produces across generic parameters. A family gives ONE; more than one means
    the sampling hit a degenerate member, which is worth seeing rather than silently taking the first."""
    fam = vo.as_family(rec)
    if not fam:
        k = tiling_key(*vo.float_cell(rec["renderCell"]))
        return [k] if k else []
    pc = {"params": fam["params"], "cellPolygons": fam["cellPolygons"], "basis": fam["basis"]}
    out = []
    for a in vo.sample_alphas(fam, samples):
        polys, basis = vo.S().cell_at(pc, a)
        ok, _ = vo.S().health(polys, basis)
        if not ok:
            continue
        k = tiling_key(polys, basis)
        if k and k not in out:
            out.append(k)
    return out


def key_of_family(rec, samples=5):
    """A family's key, taken at a generic parameter (the most common one across the samples)."""
    ks = family_keys(rec, samples)
    return ks[0] if ks else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gate", type=int, default=0, metavar="MAXK",
                    help="key Galebach's k≤MAXK catalogue; they are pairwise distinct tilings, so the "
                         "key count must equal the tiling count")
    ap.add_argument("cells", nargs="*")
    args = ap.parse_args()
    if args.gate:
        root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
        entries = [x for x in json.load(open(os.path.join(root, "public", "reference-atlas.json")))
                   if x.get("source") == "galebach" and x["k"] <= args.gate]
        keys = defaultdict(list)
        bad = 0
        for x in entries:
            k = tiling_key(*vo.float_cell(x["renderCell"]))
            if k is None:
                bad += 1
                continue
            keys[k].append(x["id"])
        coll = {k: v for k, v in keys.items() if len(v) > 1}
        print(f"galebach key gate: {len(entries)} distinct tilings → {len(keys)} distinct keys, "
              f"{bad} unkeyable")
        for k, v in list(coll.items())[:10]:
            print(f"  ⚑ collision: {v}")
        ok = not coll and not bad and len(keys) == len(entries)
        print(f"galebach key gate: {'PASS' if ok else 'FAIL'}")
        sys.exit(0 if ok else 1)
    for path in args.cells:
        d = json.load(open(path))
        recs = d["records"] if isinstance(d, dict) and "records" in d else d
        for r in recs:
            print(f"{r['id']}\t{key_of_family(r)}")


if __name__ == "__main__":
    main()
