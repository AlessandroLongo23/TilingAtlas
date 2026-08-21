#!/usr/bin/env python3
"""The {n/d} PYRAMIDS, in closed form, as develop_spherical cells.

Why this is not a search. A pyramid over a regular {n/d}, with n equilateral triangles up to an apex on
the axis, closes on the sphere exactly when the lateral arc equals the base arc:

    cos(rho) = c / (1 - c),      c = cos(2*pi*d/n)

which is solvable iff n/d < 6. At that rho the triangle's interior angle is exactly 2*pi*d/n and the
{n/d}'s is exactly 2*pi - 4*pi*d/n, so the apex 3^n sums to exactly 2*pi*d (vertex density d) and the
base (n/d).3.3 to exactly 2*pi (one turn) whenever 2*pi*d/n > pi/2, i.e. **n/d < 4**. Between 4 and 6
the base sum is 8*pi*d/n, not a whole number of turns, and there is no pyramid. Total face area
n*(3*alpha - pi) + (n*beta - (n-2d)*pi) = 4*pi*d identically, so the covering density is d, exactly.

    {n/d} pyramid:  V = n+1,  E = 2n,  F = n+1 (n triangles + one {n/d}),  density d,  k = 2

So the family is infinite (121 members up to n = 40) and the combinatorial engine can never enumerate
it: the apex is 3^n, so finding the {n/d} pyramid needs maxValence >= n, which is why star-hept-pyr had
to go to valence 7 to reach {7/2} and {7/3}. This is the same situation as k=1, where the catalogue is
75 uniform solids plus two infinite prismatic families and the shelf ships a prefix of each.

Every record still goes through develop_spherical.check_realized, so the geometry is certified by the
same gate as every searched record: equal edges, regular planar faces, consistent map, area = 4*pi*D.

Usage: python3 gen_star_pyramids.py --nmax 20 --out pyramid-cells.json
"""
import argparse, json, math, os, sys

import numpy as np

os.environ.setdefault("EU_PALETTE", "star-ico-d")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import develop_spherical as ds


def pyramid(n, d):
    """(record, residual) for the {n/d} pyramid, or (None, reason)."""
    c = math.cos(2 * math.pi * d / n)
    x = c / (1 - c)
    if not -1.0 < x < 1.0:
        return None, "no closure: n/d = %.3f >= 6" % (n / d)
    rho = math.acos(x)
    if 2 * math.pi * d / n <= math.pi / 2 + 1e-12:
        return None, "base vertex is not a whole turn: n/d = %.3f >= 4" % (n / d)
    # Apex at the SOUTH pole, not the north. Orientation carries no mathematical content — every other
    # record on this shelf is in whatever frame its flood-fill happened to end in — but it decides the
    # default view, and with the apex toward the viewer a pyramid reads as a fan of triangles with its
    # {n/d} hidden behind. Pointing the axis away puts the star face front-on, which is how the three
    # pyramids already on the shelf happen to sit. This is a rotation by pi about x, not a reflection.
    apex = np.array([0.0, 0.0, -1.0])
    ring = [np.array([math.sin(rho) * math.cos(2 * math.pi * j / n),
                      -math.sin(rho) * math.sin(2 * math.pi * j / n),
                      -math.cos(rho)]) for j in range(n)]
    V = [apex] + ring                                   # vertex 0 is the apex, 1..n the base ring
    # The {n/d} face steps d vertices at a time, and its edges are exactly the base edges, so the
    # lateral triangles are (apex, j, j+d) and NOT (apex, j, j+1): j and j+1 are not joined.
    F = [[0, 1 + j, 1 + (j + d) % n] for j in range(n)] + [[1 + (j * d) % n for j in range(n)]]
    Ftype = [(3, 1)] * n + [(n, d)]
    E = set()
    for ringf in F:
        for i in range(len(ringf)):
            a, b = ringf[i], ringf[(i + 1) % len(ringf)]
            E.add((min(a, b), max(a, b)))
    ninst = sum(len(f) for f in F)                      # one dart per (face, corner)
    ok, res = ds.check_realized(V, E, F, Ftype, rho, ninst)
    if not ok:
        return None, "check_realized rejected: %s" % res
    cfg = "%d/%d.3.3 + %s" % (n, d, ".".join(["3"] * n))
    return {
        "id": "pyramid-%d_%d" % (n, d),
        "vertexConfig": cfg, "k": 2,
        "vertexDensity": [1, d], "rho": rho, "retrograde": [],
        "density": int(round(res["density"])),
        "vertices": [[float(t) for t in v] for v in V],
        "faces": [list(map(int, f)) for f in F],
        "faceTypes": [[int(a), int(b)] for (a, b) in Ftype],
        "realized": True, "residual": res,
    }, res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nmax", type=int, default=20)
    ap.add_argument("--out", required=True)
    ap.add_argument("--convex", action="store_true",
                    help="also emit d=1 (the tetrahedron, which is k=1 and lives on the convex shelf)")
    args = ap.parse_args()
    recs = []
    for n in range(3, args.nmax + 1):
        for d in range(1 if args.convex else 2, (n + 1) // 2):
            if math.gcd(n, d) != 1:
                continue
            rec, res = pyramid(n, d)
            if rec is None:
                continue
            recs.append(rec)
            print("{%d/%d}  rho=%9.5f deg  D=%d  V=%d E=%d F=%d  densityErr=%.2e planarity=%.2e"
                  % (n, d, math.degrees(rec["rho"]), rec["density"], len(rec["vertices"]),
                     len(rec["faces"]) + len(rec["vertices"]) - 2, len(rec["faces"]),
                     res["densityErr"], res["planarity"]))
    json.dump(recs, open(args.out, "w"))
    print("wrote %d pyramids to %s" % (len(recs), args.out))


if __name__ == "__main__":
    main()
