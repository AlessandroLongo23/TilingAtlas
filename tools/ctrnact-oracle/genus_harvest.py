#!/usr/bin/env python3
"""Harvest every NON-SPHERICAL realization out of run_euclid_groups' per-group JSONs, as they land.

The `toroid` palette's mixed closure admits both signs of angular defect, so what comes out is not one
topology but a spectrum: total defect is 2*pi*chi and nothing pins chi to 2 any more. Most records are
still ordinary spheres and those belong to no shelf here; everything else does.

FIVE THINGS MEASURED, none assumed:
  * chi = V - E + F, and ORIENTABILITY, because genus is read off the pair and not off chi alone. An
    orientable surface has chi = 2 - 2g; a non-orientable one has chi = 2 - k and a different word for
    its genus, so a non-orientable record is REFUSED here rather than mislabelled. None has appeared.
  * MANIFOLD. Every edge in exactly two faces and every vertex link a single cycle. Without both, chi
    is an alternating sum and not the Euler characteristic of a surface.
  * EMBEDDED, by the shelf's own winding test. ⚑ That test exempts face pairs SHARING A VERTEX and so
    UNDERCOUNTS — it is why lib/tilings/ncx-crossing.ts exists. Anything it calls self-intersecting is,
    but "embedded" from it is a candidate and not a verdict; scripts/gen-ncx-crossing.ts's unexempted
    test is the authority and it removed two of nine higher-genus candidates on 2026-08-25.
  * NOT DEGENERATE, on the gate the non-convex shelf got on 2026-08-24: no two vertices of the map on
    one point, no two faces sharing an edge and a plane.
  * DISTINCT, by congruence_key, so mirror images and two groups finding the same solid collapse.
"""
import collections, glob, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_nonconvex_shelf import congruence_key, self_intersections, degeneracy, census

PARTS = "toroid-k2/toroid-k2-euclid-parts/g*.json"


def surface(vs, faces):
    """(E, chi, is manifold, is orientable) for a face-ring list."""
    und, dirc = collections.Counter(), collections.Counter()
    for f in faces:
        for i in range(len(f)):
            a, b = f[i], f[(i + 1) % len(f)]
            und[(min(a, b), max(a, b))] += 1
            dirc[(a, b)] += 1
    nxt = collections.defaultdict(dict)
    for f in faces:
        for i in range(len(f)):
            nxt[f[i]][f[i - 1]] = f[(i + 1) % len(f)]
    bad = 0
    for m in nxt.values():
        start = next(iter(m))
        cur, n = start, 0
        while True:
            cur = m.get(cur)
            n += 1
            if cur is None or cur == start or n > len(m) + 1:
                break
        if cur != start or n != len(m):
            bad += 1
    E = len(und)
    manifold = all(c == 2 for c in und.values()) and bad == 0
    orientable = all(c == 1 for c in dirc.values())
    return E, len(vs) - E + len(faces), manifold, orientable


def main():
    parts = sorted(glob.glob(sys.argv[1] if len(sys.argv) > 1 else PARTS))
    tally, seen, refused = collections.Counter(), {}, []
    for p in parts:
        try:
            recs = json.load(open(p))
        except Exception:
            continue                          # a group still being written
        for r in recs:
            vs, faces = r["vertices"], r["faces"]
            E, chi, manifold, orientable = surface(vs, faces)
            tally["chi=%d" % chi] += 1
            if chi == 2:
                continue                      # the spherical shelves already hold these
            if not manifold:
                refused.append("non-manifold, chi=%d, V=%d" % (chi, len(vs)))
                continue
            if not orientable:
                refused.append("NON-ORIENTABLE, chi=%d, V=%d — genus is not (2-chi)/2 here" % (chi, len(vs)))
                continue
            why = degeneracy(vs, faces)
            if why:
                tally["degenerate, dropped"] += 1
                continue
            k = congruence_key(vs)
            if k in seen:
                continue
            g = (2 - chi) // 2
            seen[k] = {"rec": r, "V": len(vs), "E": E, "F": len(faces), "chi": chi, "genus": g,
                       "xings": self_intersections(vs, faces),
                       "census": census(faces, r.get("faceTypes")),
                       "config": r.get("vertexConfig", "")}
            tally["genus %d" % g] += 1
    print("groups read: %d" % len(parts))
    print("every realization by chi: %s"
          % dict(sorted((k, v) for k, v in tally.items() if k.startswith("chi="))))
    rows = sorted(seen.values(), key=lambda x: (x["genus"], x["V"], x["E"], x["F"], x["census"]))
    byg = collections.Counter(x["genus"] for x in rows)
    emb = collections.Counter(x["genus"] for x in rows if not x["xings"])
    print("\ndistinct non-spherical solids: %d   (degenerate dropped: %d)"
          % (len(rows), tally["degenerate, dropped"]))
    for g in sorted(byg):
        print("  genus %-3d %4d   of which the shelf test calls embedded: %d" % (g, byg[g], emb[g]))
    for line in refused:
        print("  ⚑ REFUSED: %s" % line)
    json.dump(rows, open("genus-rows.json", "w"), indent=1)
    print("\nwrote genus-rows.json (%d solids)" % len(rows))


if __name__ == "__main__":
    main()
