#!/usr/bin/env python3
"""Gate: the convex deltahedra, straight out of the pipeline.

The convex polyhedra with equilateral triangle faces are exactly EIGHT — 4, 6, 8, 10, 12, 14, 16 and
20 faces, with nothing at 18 (Freudenthal & van der Waerden 1947). Three are Platonic and one-orbit;
the other five are Johnson solids and two-orbit: J12 triangular bipyramid, J13 pentagonal bipyramid,
J84 snub disphenoid, J51 triaugmented triangular prism, J17 gyroelongated square bipyramid.

They are the gate because the all-triangle alphabet is the one where corner class carries no
information, and three separate stages used to reason from corner class alone:

  * eu_solver's simplify() seeded its minimality refinement on it, so every multi-orbit all-triangle
    configuration looked like a fold of a smaller one and was thrown away at closure;
  * eu_pruner's simplify()/comparesolutions() did the same, so anything that got past the solver was
    deleted as a duplicate (gen_alphabet's A6 certificate had been warning about exactly this:
    "(3,3,3)S3 ~= (3,3,3,3)S4 — pruner dedup unreliable here");
  * develop_euclid's unfold() guessed which vertex word a dart cycle belonged to by matching face
    sequences, and here every word matches every other, so a valence-5 vertex was developed as a
    valence-4 one and J13's block closed as the octahedron.

Nothing else in the repo exercises an alphabet this degenerate, which is why all three survived.

Usage: python3 check_deltahedra.py <cells.json>
"""
import collections, json, sys

WANT = {  # faces -> (V, E, name)
    4:  (4,  6,  "tetrahedron"),
    6:  (5,  9,  "J12 triangular bipyramid"),
    8:  (6,  12, "octahedron"),
    10: (7,  15, "J13 pentagonal bipyramid"),
    12: (8,  18, "J84 snub disphenoid"),
    14: (9,  21, "J51 triaugmented triangular prism"),
    16: (10, 24, "J17 gyroelongated square bipyramid"),
    20: (12, 30, "icosahedron"),
}


def main():
    recs = json.load(open(sys.argv[1]))
    got = {}
    for r in recs:
        res = r["residual"]
        if not res.get("convex") or res.get("coplanarNeighbour"):
            continue
        if any(len(f) != 3 for f in r["faces"]):
            sys.exit("FAIL: a non-triangular face in an all-triangle palette (%s)" % r["id"])
        got.setdefault(len(r["faces"]), []).append(r)
    bad = 0
    for f in sorted(set(WANT) | set(got)):
        rs = got.get(f, [])
        if f not in WANT:
            print("  F=%-3d UNEXPECTED (%d record(s)) — not a convex deltahedron" % (f, len(rs)))
            bad += 1
            continue
        V, E, name = WANT[f]
        if not rs:
            print("  F=%-3d MISSING   %s" % (f, name))
            bad += 1
            continue
        shapes = {(len(r["vertices"]), sum(len(x) for x in r["faces"]) // 2) for r in rs}
        if shapes != {(V, E)}:
            print("  F=%-3d WRONG     %s: expected V=%d E=%d, got %s" % (f, name, V, E, sorted(shapes)))
            bad += 1
            continue
        print("  F=%-3d ok  V=%-3d E=%-3d k=%d  %s" % (f, V, E, min(r["k"] for r in rs), name))
    if bad:
        sys.exit("check-deltahedra: FAIL (%d of %d wrong)" % (bad, len(WANT)))
    print("check-deltahedra: PASS — all 8 convex deltahedra, and nothing at F=18")


if __name__ == "__main__":
    main()
