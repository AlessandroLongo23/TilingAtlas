#!/usr/bin/env python3
"""Build the PLANIGON palette: the duals of the Euclidean vertex configurations.

A vertex of an edge-to-edge tiling by regular polygons is a cyclic word (n_1 … n_m) whose interior
angles close a full turn. Its dual tile — the planigon — is the polygon on the CENTROIDS of those m
polygons, and both of its data fall straight out of the word:

  angle at vertex i   the centroid of a regular n-gon sees consecutive edges 2*pi/n apart, so the
                      planigon's interior angle there is 2*pi/n_i — D/n_i units of 2*pi/D.
  edge i to i+1       two regular polygons sharing a unit edge have their centroids on the
                      perpendicular bisector of it, one apothem away on each side, so the edge is
                      a(n_i) + a(n_{i+1}) with a(n) = 1 / (2 tan(pi/n)).

The angle sum checks out for free: sum 2*pi/n_i = 2*pi * (m-2)/2 = (m-2)*pi, which is the angle sum
of an m-gon, exactly when the vertex word closes.

WHICH WORDS. Only n in {3, 4, 6, 8, 12} is admitted, and that is not a simplification: the other six
angle-valid words (3.7.42, 3.8.24, 3.9.18, 3.10.15, 4.5.20, 5.5.10) cannot occur in ANY edge-to-edge
tiling by regular polygons — an odd polygon forces its two neighbours to alternate around it, which
those words cannot do — so their duals are not planigons. Fifteen words survive, and their duals are
the fifteen planigons.

LENGTHS. Every apothem is a(3) = sqrt3/6, a(4) = 1/2, a(6) = sqrt3/2, a(8) = (sqrt2+1)/2,
a(12) = (2+sqrt3)/2. Scaling the whole palette by 6 clears every denominator and leaves each edge in
Z[sqrt2, sqrt3] — inside Z[zeta24], which is the ring the developer steps in. The scale is global, so
it changes nothing but the unit.

  python3 alphabets/make_planigons.py --out alphabets/palettes/planigon.json
"""
import argparse
import itertools
import json
from fractions import Fraction

SIDES = [3, 4, 6, 8, 12]
D = 24
SCALE = 6                                   # clears the /6 in a(3) and the /2 in the rest


def interior(n):
    """Interior angle of a regular n-gon, in units of 2*pi/D."""
    u = Fraction(D, 2) - Fraction(D, n)
    assert u.denominator == 1, n
    return int(u)


def dual_angle(n):
    """The planigon's angle at the centroid of an n-gon: 2*pi/n, in units of 2*pi/D."""
    u = Fraction(D, n)
    assert u.denominator == 1, n
    return int(u)


# Apothem of a unit-edge regular n-gon, times SCALE, as (rational, coeff of sqrt2, coeff of sqrt3).
# a(n) = 1 / (2 tan(pi/n)):  a3 = sqrt3/6, a4 = 1/2, a6 = sqrt3/2, a8 = (sqrt2+1)/2, a12 = (2+sqrt3)/2
APOTHEM = {
    3:  (Fraction(0), Fraction(0), Fraction(SCALE, 6)),
    4:  (Fraction(SCALE, 2), Fraction(0), Fraction(0)),
    6:  (Fraction(0), Fraction(0), Fraction(SCALE, 2)),
    8:  (Fraction(SCALE, 2), Fraction(SCALE, 2), Fraction(0)),
    12: (Fraction(SCALE), Fraction(0), Fraction(SCALE, 2)),
}


def add(u, v):
    return tuple(a + b for a, b in zip(u, v))


def length_str(t):
    """A length as the developer's grammar: terms 'k', 'k sqrt2', 'k sqrt3' joined by '+'."""
    parts = []
    for coeff, tag in zip(t, ("", "sqrt2", "sqrt3")):
        if coeff == 0:
            continue
        assert coeff.denominator == 1, t
        k = int(coeff)
        parts.append(str(k) if not tag else (tag if k == 1 else f"{k}{tag}"))
    return "+".join(parts) if parts else "0"


def vertex_words():
    """Every cyclic word over SIDES whose interior angles close a full turn, up to rotation and
    reflection. Enumerated, not recited: the fifteen are the output, not the input."""
    seen, out = set(), []

    def rec(word, total):
        if total == D:
            key = canon(word)
            if key not in seen:
                seen.add(key)
                out.append(list(key))
            return
        if len(word) >= 6:
            return
        for n in SIDES:
            if total + interior(n) <= D:
                rec(word + [n], total + interior(n))

    def canon(w):
        m = len(w)
        rots = [tuple(w[(i + s) % m] for i in range(m)) for s in range(m)]
        r = list(reversed(w))
        rots += [tuple(r[(i + s) % m] for i in range(m)) for s in range(m)]
        return max(rots)

    rec([], 0)
    return sorted(out, key=lambda w: (len(w), w))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    words = vertex_words()
    tiles, lengths = [], {}
    for idx, w in enumerate(words):
        m = len(w)
        angles = [dual_angle(n) for n in w]
        assert sum(angles) == (m - 2) * (D // 2), (w, angles)
        edges = []
        for i in range(m):
            L = length_str(add(APOTHEM[w[i]], APOTHEM[w[(i + 1) % m]]))
            lengths[L] = lengths.get(L, 0) + 1
            edges.append(L)
        tiles.append({
            "kind": "composite",
            "name": "P" + ".".join(str(n) for n in w),
            "famchar": chr(ord("a") + idx),
            "angles": angles,
            "edgeLens": edges,
        })

    spec = {
        "name": "planigon",
        "D": D,
        # Every length here is SCALE times its true value, to clear the /6 of a triangle's apothem and
        # land in Z[sqrt2, sqrt3]. The developer divides it back out of the geometry it emits, so the
        # shelf ships planigons at the size they actually are: duals of a UNIT-edge regular tiling.
        "lengthScale": SCALE,
        "comment": (
            "THE FIFTEEN PLANIGONS: the duals of every vertex configuration an edge-to-edge tiling by "
            "regular polygons can have. Tile P<word> is the dual of vertex word <word> — its vertices "
            "are the centroids of that word's polygons, its angle at the centroid of an n-gon is "
            "2*pi/n, and its edge between the centroids of an n- and an n'-gon is the sum of their "
            "apothems. Edge lengths are therefore TWELVE different values in Z[sqrt2, sqrt3], all scaled "
            "by 6 to clear denominators, and only like lengths may glue — which is the whole reason "
            "this palette needs edge types. Generated by alphabets/make_planigons.py; the six "
            "angle-valid words using a 5-, 7-, 9-, 10-, 15-, 20-, 24- or 42-gon are excluded because "
            "no edge-to-edge tiling contains them, so they have no dual tile."
        ),
        "tiles": tiles,
    }
    json.dump(spec, open(args.out, "w"), indent=2)
    print(f"[planigons] {len(words)} vertex words -> {len(tiles)} planigons")
    for w, t in zip(words, tiles):
        print("   %-16s angles %-22s edges %s"
              % (".".join(str(n) for n in w), t["angles"], t["edgeLens"]))
    print(f"[planigons] {len(lengths)} distinct edge lengths (x{SCALE}):")
    for L, n in sorted(lengths.items(), key=lambda kv: -kv[1]):
        print("   %-14s used %d times" % (L, n))
    print(f"[planigons] wrote {args.out}")


if __name__ == "__main__":
    main()
