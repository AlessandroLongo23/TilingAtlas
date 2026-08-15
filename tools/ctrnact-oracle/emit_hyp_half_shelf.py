#!/usr/bin/env python3
"""Turn developed hyperbolic HALF-TILE quotients into atlas shelf records.

The record shape is `HypPolyPattern` (lib/tilings/hyp-poly.ts), reused for the same reason the spherical
half-tiles reuse SphPolyPattern: it is the type for a hyperbolic TILING that ships its quotient and lets
the client re-develop under the live view, which is exactly what these are. Populating it routes the
cards, the thumbnails and /play through the disk renderer already in place — no new component.

Its `edge` field is a single scalar, because every board it was written for has ONE forced edge length.
A half-tile has two or three. That is not a lie in the record: `hyperbolicDevelopClient` prefers
`darts.elen` for every geometric decision and falls back to `edge` only for the develop-radius margin,
where it wants the LONGEST class — so `edge` carries exactly that, and the full set is in `edges`.

  python3 emit_hyp_half_shelf.py --repo ../..
"""
import argparse
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# board id -> (cells file, board label, what was cut, the tile's angles in degrees, D)
BOARDS = {
    "45-half": ("run-hyp-45-half/cells.json", "{4,5} halved",
                "the {4,5} square, cut by a diagonal", [36, 72, 36], 10),
    "37-half": ("run-hyp-37-half-k8/cells.json", "{3,7} halved",
                "the {3,7} triangle, cut by an altitude", [180 / 7, 90, 360 / 7], 28),
    "38-half": ("run-hyp-38-half/cells.json", "{3,8} halved",
                "the {3,8} triangle, cut by an altitude", [22.5, 90, 45], 16),
    "54-half": ("run-hyp-54-half/cells.json", "{5,4} halved",
                "the {5,4} pentagon, cut by a mirror", [45, 90, 90, 90], 8),
    "64-half": ("run-hyp-64-half/cells.json", "{6,4} halved",
                "the {6,4} hexagon, cut by its long diagonal", [45, 90, 90, 45], 8),
    # k <= 3 ONLY, and the file name says so. The k=4 slice exists — the search enumerated it, 1.92 M raw
    # blocks and 3.4 GB — but the pruner finished at 564,906 distinct tilings, thirty-five times the whole
    # of k <= 3, so it is not on the shelf. The board's `dropped` field records that, and it is a different
    # claim from a k with nothing in it.
    "46-half": ("run-hyp-46-half/cells-k3.json", "{4,6} halved",
                "the {4,6} square, cut by a diagonal", [30, 60, 30], 12),
}


def cycles(perm):
    """Orbits of a permutation, as lists."""
    seen, out = set(), []
    for s in range(len(perm)):
        if s in seen:
            continue
        c, cur = [], s
        while cur not in seen:
            seen.add(cur)
            c.append(cur)
            cur = perm[cur]
        out.append(c)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=os.path.join(HERE, "..", ".."))
    args = ap.parse_args()
    pub = os.path.join(os.path.abspath(args.repo), "public")
    out_dir = os.path.join(pub, "hyperbolic-half")
    os.makedirs(out_dir, exist_ok=True)

    manifest, total = {}, 0
    for base, (cells, label, cut, angles, D) in BOARDS.items():
        recs = json.load(open(os.path.join(HERE, cells)))
        by_k = {}
        for e in recs:
            d = e["darts"]
            rneig, glue, alpha, elen = d["rneig"], d["glue"], d["alpha"], d["elen"]
            n = len(rneig)
            # Vertex orbits are the rneig cycles — but the quotient is FOLDED, so one cycle need not be a
            # whole star: it is the star divided by the site symmetry, and the walk goes round it m times
            # before the direction returns. So the test is not "sums to 2pi" (which rejected every {4,5}
            # record, at 72 degrees x 5) but "sums to 2pi/m for a whole number of turns m", and the full
            # vertex word is the cycle repeated m times.
            vcyc = cycles(rneig)
            words = []
            for c in vcyc:
                tot = sum(alpha[h] for h in c)
                if tot <= 0:
                    raise SystemExit(f"{e['id']}: a vertex orbit has non-positive total angle")
                m = 2 * math.pi / tot
                if abs(m - round(m)) > 1e-9 or round(m) < 1:
                    raise SystemExit(f"{e['id']}: a vertex orbit sums to {tot:.9f}, which does not divide "
                                     f"a full turn ({m:.6f} times round)")
                words.append(".".join(f"{math.degrees(alpha[h]):.6g}" for h in c) * 1
                             if round(m) == 1 else
                             ".".join([".".join(f"{math.degrees(alpha[h]):.6g}" for h in c)] * round(m)))
            # Faces are the orbits of h -> glue[rneig[h]]. Folded too, so a cycle is the TILE divided by
            # its own symmetry: the cycle length must DIVIDE the tile's side count, not equal it. (Said
            # "the triangle" and "3" while every board happened to be a triangle; {5,4} and {6,4} are not.)
            fperm = [glue[rneig[h]] for h in range(n)]
            fcyc = cycles(fperm)
            sides = len(angles)
            for c in fcyc:
                if sides % len(c) != 0:
                    raise SystemExit(f"{e['id']}: a quotient face cycle has {len(c)} darts, which does not "
                                     f"divide the tile's {sides} sides")
            # An edge and its partner must agree on length, or the two tiles do not meet along it.
            for h in range(n):
                if abs(elen[h] - elen[glue[h]]) > 1e-12:
                    raise SystemExit(f"{e['id']}: dart {h} and its partner disagree on edge length")
            rec = {
                "id": f"hh{base}-{e['k']}-{str(len(by_k.get(e['k'], [])) + 1).zfill(5)}",
                "name": label,
                "k": e["k"],
                "base": base,
                "config": " + ".join(sorted(set(words))),
                "family": label,
                "edge": max(e["edges"]),
                "edges": e["edges"],
                "tiles": len(fcyc),
                "darts": d,
                "residual": e["residual"],
                "stats": {
                    "faceOrbits": len(fcyc),
                    # One entry, because the palette has one tile and the shelf fills a face by its size —
                    # so this board draws in a single colour. The VALUE is the tile's real side count:
                    # hardcoding 3 described the {5,4} quadrilateral as a triangle.
                    "sizes": [sides],
                    "sizeCensus": [len(fcyc)],
                    "vertexOrbits": len(vcyc),
                },
            }
            by_k.setdefault(e["k"], []).append(rec)
        manifest[base] = {"label": label, "cut": cut,
                          "anglesDeg": [round(a, 6) for a in angles], "D": D,
                          "sides": recs[0]["edges"] if recs else [],
                          "ks": sorted(by_k), "counts": {k: len(v) for k, v in sorted(by_k.items())}}
        for k, rows in sorted(by_k.items()):
            path = os.path.join(out_dir, f"hyphalf-{base}-k{k}.json")
            json.dump(rows, open(path, "w"))
            mb = os.path.getsize(path) / 1e6
            print(f"  {base} k={k}: {len(rows)} tilings -> public/hyperbolic-half/{os.path.basename(path)} ({mb:.1f} MB)")
            total += len(rows)
    json.dump(manifest, open(os.path.join(out_dir, "manifest.json"), "w"), indent=2)
    print(f"\n{total} tilings; every vertex orbit closes a full turn, every quotient face has the tile's "
          f"side count, every edge agrees with its partner")
    for base, m in manifest.items():
        print(f"  {base:8s} {m['label']:14s} sides {[round(x, 9) for x in m['sides']]}  counts {m['counts']}")


if __name__ == "__main__":
    main()
