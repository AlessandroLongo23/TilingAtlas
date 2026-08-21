#!/usr/bin/env python3
"""Partition a palette's vertex configs by the edge arc rho at which they close.

The k>1 filter, hoisted out of the search. Every orbit of a spherical tiling shares its edges, so one
rho must close all of them (develop_spherical.solve_rho_common), and that condition depends only on
each orbit's ANGLE MULTISET — not on the gluing, not on k. So it can be decided before any search:
give each multiset its rho spectrum (every root, at every vertex density and every retrograde subset),
then group multisets that share a value. A k=2 tiling has both orbits in one group, so running the
solver once per group and taking the union is exhaustive, and cross-group pairs are never enumerated.

Measured on star-wide: 4,871 multisets, 7.77M pairs, of which 445 share a rho (0.0057%). 6,588 of the
6,684 groups hold a single multiset, and the largest holds 22.

The spectrum comes from develop_spherical.solve_rho_all itself, so the grouping and the developer can
never disagree about what closes where. Tolerance matches solve_rho_common's (1e-6 rad).

Usage: EU_MAXDENS=3 python3 rho_buckets.py --palette star-wide --out buckets.json
"""
import argparse, collections, itertools, json, math, os, sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.join(_HERE, "alphabets"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--palette", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--tol", type=float, default=1e-6)
    ap.add_argument("--maxdens", type=int, default=int(os.environ.get("EU_MAXDENS", "3")))
    args = ap.parse_args()
    os.environ["EU_PALETTE"] = args.palette
    import gen_alphabet as ga
    import develop_spherical as ds

    pal = os.path.join(_HERE, "alphabets", "palettes", args.palette + ".json")
    spec, D, tiles, classes = ga.load_palette(pal)
    configs = ga.enum_configs(D, classes, 3, spec.get("maxValence", 24),
                              spec.get("closure", "euclidean"), None, spec.get("maxDensity", 1))
    nd = {c.cid: (c.tile.n, getattr(c.tile, "d", 1) or 1) for c in classes}
    words = collections.defaultdict(int)
    for w in configs:
        words[tuple(sorted(nd[c] for c in w))] += 1
    print("[buckets] %s: %d config words over %d angle multisets" % (args.palette, len(configs), len(words)))

    # rho spectrum per multiset, from the production solver
    recs = []                                    # (rho, multiset)
    realizable = set()
    for ms in words:
        types = sorted(set(ms))
        for r in range(len(types) + 1):
            for R in itertools.combinations(types, r):
                for dens in range(1, args.maxdens + 1):
                    for rho in ds.solve_rho_all(list(ms), dens, frozenset(R)):
                        recs.append((rho, ms))
                        realizable.add(ms)
    print("[buckets] %d multisets close somewhere; %d (rho, multiset) records" % (len(realizable), len(recs)))

    # single-link grouping on rho at the developer's own tolerance
    recs.sort()
    groups, cur = [], []
    for rho, ms in recs:
        if cur and rho - cur[-1][0] > args.tol:
            groups.append(cur); cur = []
        cur.append((rho, ms))
    if cur:
        groups.append(cur)
    out, seen = [], set()
    for g in groups:
        mss = sorted({ms for _, ms in g})
        key = tuple(mss)
        if key in seen:                          # same alphabet as an earlier group: one run is enough
            continue
        seen.add(key)
        out.append({"rho": g[0][0], "multisets": [[list(t) for t in ms] for ms in mss],
                    "words": sum(words[ms] for ms in mss)})
    out.sort(key=lambda b: -b["words"])
    sizes = collections.Counter(len(b["multisets"]) for b in out)
    print("[buckets] %d distinct groups; sizes %s; largest %d multisets / %d config words"
          % (len(out), dict(sorted(sizes.items())), len(out[0]["multisets"]), out[0]["words"]))
    json.dump({"palette": args.palette, "tol": args.tol, "maxdens": args.maxdens, "buckets": out},
              open(args.out, "w"))
    print("[buckets] wrote %s" % args.out)


if __name__ == "__main__":
    main()
