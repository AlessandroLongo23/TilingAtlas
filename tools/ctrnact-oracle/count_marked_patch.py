#!/usr/bin/env python3
"""Dangling-edge filter for a marked palette whose base grid is NOT a lattice.

check_marked_grid.py compares two SETS of patterns, which needs a canonical form, which needs the
grid's vertices to be a lattice (or the dual of one). The square-triangle grid has neither: its
underlying tiling varies per solution, so there is nothing to index a bitmask into. What can still be
computed exactly is the per-k COUNT after freedraw's own definition is applied — no vertex of degree
1 — and that count is a real test, because on every grid where the set comparison IS available the
search's surviving solutions are in bijection with freedraw's (square, triangle and hex all come out
search - dangling == freedraw, no duplicates left over).

Degrees are read off the drawn segments reduced MODULO the period lattice, edges first. A developed
fundamental domain is a domain of the tiling's face keys, not a tidy parallelogram, so the same edge
can appear at two absolute positions; deduplicating the edges before counting is what stops a
degree-1 dangling edge from being counted as a phantom degree-2.

  python3 count_marked_patch.py --cells fdts-k3.json --expect 52,1098,13568
"""
import argparse
import json


TOL = 1e-4


def _is_lattice_vector(v, T1, T2):
    """Is v an integer combination of T1 and T2? The membership test, done on the coefficients.

    Reducing a point into a fundamental domain and then hashing its coordinates is the tempting
    version and it is wrong: two presentations of one vertex differ by ~1e-6 of accumulated rounding,
    which straddles a hash bucket often enough to split a vertex in two and invent a dangling edge.
    Comparing coefficients against the nearest integer has no buckets.
    """
    det = T1[0] * T2[1] - T1[1] * T2[0]
    a = (v[0] * T2[1] - v[1] * T2[0]) / det
    b = (T1[0] * v[1] - T1[1] * v[0]) / det
    return abs(a - round(a)) < TOL and abs(b - round(b)) < TOL


def _cluster(items, same):
    """Group items by an equivalence given as a predicate, returning one index per item. Linear scan
    against the representatives: a developed record carries a few dozen of these, not thousands."""
    reps, out = [], []
    for it in items:
        for i, r in enumerate(reps):
            if same(it, r):
                out.append(i)
                break
        else:
            reps.append(it)
            out.append(len(reps) - 1)
    return reps, out


def min_degree(rec):
    T1, T2 = rec["T1"], rec["T2"]

    def same_pt(p, q):
        return _is_lattice_vector((p[0] - q[0], p[1] - q[1]), T1, T2)

    segs = []
    for (p, q) in rec["drawn"]:
        # Orient each segment the same way, so that two presentations of one edge have both their
        # midpoints and their endpoint ROLES agree.
        if (round(q[0], 6), round(q[1], 6)) < (round(p[0], 6), round(p[1], 6)):
            p, q = q, p
        segs.append((p, q))

    def same_seg(s, t):
        return (abs((s[1][0] - s[0][0]) - (t[1][0] - t[0][0])) < TOL and
                abs((s[1][1] - s[0][1]) - (t[1][1] - t[0][1])) < TOL and
                same_pt(s[0], t[0]))

    _, seg_of = _cluster(segs, same_seg)
    kept = {}
    for i, s in zip(seg_of, segs):
        kept[i] = s
    pts = [e for s in kept.values() for e in s]
    reps, pt_of = _cluster(pts, same_pt)
    deg = [0] * len(reps)
    for i in pt_of:
        deg[i] += 1
    return min(deg) if deg else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", required=True)
    ap.add_argument("--kmax", type=int, default=3)
    ap.add_argument("--expect", help="comma-separated freedraw counts for k=1..kmax")
    args = ap.parse_args()

    want = [int(x) for x in args.expect.split(",")] if args.expect else None
    found, dangling = {}, {}
    for rec in json.load(open(args.cells)):
        k = rec["k"]
        if k > args.kmax:
            continue
        if min_degree(rec) == 1:
            dangling[k] = dangling.get(k, 0) + 1
        else:
            found[k] = found.get(k, 0) + 1

    print("k    search  dangling   kept   freedraw   delta")
    ok = True
    for k in range(1, args.kmax + 1):
        f, d = found.get(k, 0), dangling.get(k, 0)
        w = want[k - 1] if want and k <= len(want) else None
        ok = ok and (w is None or f == w)
        print("%-4d %6d  %8d %6d   %8s   %5s" % (k, f + d, d, f, "-" if w is None else w,
                                                 "-" if w is None else f - w))
    if want:
        print("VERDICT:", "COUNTS MATCH" if ok else "COUNTS DIFFER")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
