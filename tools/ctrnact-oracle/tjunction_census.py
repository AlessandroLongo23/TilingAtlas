#!/usr/bin/env python3
"""tjunction_census.py — how many of a developed catalogue's tilings are genuinely NOT edge-to-edge.

The question a `-split` palette cannot answer by itself. In a split palette EVERY tile carries its flat
180-degree corners all the time, so "has a flat corner" is true of every record and says nothing. What
decides whether an edge is actually DIVIDED is what sits opposite it:

    two tiles meeting FLUSH put their flat corners at the same point, and that point holds exactly two
    corners, 180 + 180 — a false vertex, and the tiling is edge-to-edge after all;

    a DIVIDED edge puts a flat corner against two or more real ones, so the point holds a 180 AND more
    than two corners.

So a T-junction is a vertex holding a flat and more than two corners. This is the same test
`scripts/build-euhalf-shelf.mjs` applies in the plane (where it had to key on the lattice residue), and
the same one `tiling_key.smooth` uses to decide which vertices are gauge; keeping the three in step is
the point of writing it down once. Testing for a flat corner alone marked every Euclidean record
non-edge-to-edge, including the ones that plainly were not.

Curved boards need no residue key: the developed cell already names its vertices, so the corners at a
vertex are just the face slots that point at it.

Usage:  tjunction_census.py <cells.json> [--json out.json]
"""
import argparse
import json
import math
import sys


def _sph_angle(A, B, C):
    """Interior angle at B between the great-circle arcs B->A and B->C, in degrees."""
    dot = lambda u, v: sum(a * b for a, b in zip(u, v))

    def tang(P):
        d = dot(P, B)
        t = [P[i] - d * B[i] for i in range(3)]
        n = math.sqrt(dot(t, t))
        return None if n < 1e-12 else [x / n for x in t]

    tA, tC = tang(A), tang(C)
    if tA is None or tC is None:
        return None
    return math.degrees(math.acos(max(-1.0, min(1.0, dot(tA, tC)))))


def census(rec, tol=1e-6):
    """(tjunctions, flat_corners, false_vertices) for one developed spherical cell."""
    V, F = rec["vertices"], rec["faces"]
    at = {}
    for face in F:
        n = len(face)
        for i in range(n):
            a = _sph_angle(V[face[(i - 1) % n]], V[face[i]], V[face[(i + 1) % n]])
            r = at.setdefault(face[i], {"corners": 0, "flat": 0})
            r["corners"] += 1
            if a is not None and abs(a - 180.0) < 1e-3:
                r["flat"] += 1
    tj = sum(1 for r in at.values() if r["flat"] and r["corners"] > 2)
    false_v = sum(1 for r in at.values() if r["flat"] and r["corners"] == 2)
    return tj, sum(r["flat"] for r in at.values()), false_v


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("cells")
    ap.add_argument("--json")
    a = ap.parse_args()
    recs = json.load(open(a.cells))
    per, out = {}, []
    for r in recs:
        tj, flat, fv = census(r)
        out.append({"id": r["id"], "k": r["k"], "tjunctions": tj, "flatCorners": flat,
                    "falseVertices": fv, "V": r["stats"]["V"], "E": r["stats"]["E"], "F": r["stats"]["F"]})
        d = per.setdefault(r["k"], {"n": 0, "nonE2E": 0})
        d["n"] += 1
        d["nonE2E"] += 1 if tj else 0
    print(f"{len(recs)} developed tilings from {a.cells}")
    print(f"{'k':>4} {'tilings':>9} {'NOT edge-to-edge':>18}")
    tot = ne = 0
    for k in sorted(per):
        d = per[k]
        tot += d["n"]; ne += d["nonE2E"]
        print(f"{k:>4} {d['n']:>9} {d['nonE2E']:>18}")
    print(f"{'all':>4} {tot:>9} {ne:>18}")
    if a.json:
        json.dump(out, open(a.json, "w"), indent=1)
        print(f"wrote {a.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
