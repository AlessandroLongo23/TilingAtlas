#!/usr/bin/env python3
"""Turn developed spherical HALF-TILE cells into the atlas's spherical shelf records.

The record shape is `SphPolyPattern` (lib/tilings/sph-poly.ts), reused deliberately and not copied:
these are spherical TILINGS with explicit per-record geometry, which is exactly what that type holds,
and populating it routes /play, the thumbnails and the cards through the three.js sphere every other
spherical shelf already draws on — no new renderer, no new component. What differs is only the board
metadata, which lives in lib/tilings/sph-half.ts.

Colour by FACE ORBIT, not by polygon size. `sphPolyScene`'s default key is the polygon size, which is
right for the 3.4.n.4 boards and useless here: every face is a triangle, so the whole solid collapses
into one neutral fill. These records carry `fillGroup` instead — the face's orbit under the tiling's own
isometries, which says which tiles the solid carries onto each other. It stays one colour exactly when
the tiling really is tile-transitive (the |G| = 24 cube), and separates seven classes when it is barely
symmetric at all (the k = 6 one). The halving also shows in the edges, which that renderer all inks.

Everything the developer certified is re-certified here, because the shelf is what ships: closure to
Euler 2, the tile count the area bound forces, every face congruent to the tile, and — the one check
the developer does not do — a point sample confirming each face covers its own patch of the sphere
once. The sign test for a spherical triangle is invariant under p -> -p, so a naive version counts
every face together with its antipode and reports "2" everywhere; the faces are oriented first.

  python3 emit_sph_half_shelf.py --repo ../..
"""
import argparse
import itertools
import json
import math
import os
import random

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))

# board id -> (cells file, human label, what was cut and how, the tile's angles in degrees)
BOARDS = {
    "oct-half": ("run-sphoct/cells.json",
                 "Octahedron halved",
                 "the octahedron's face, cut by an altitude", [45, 90, 90]),
    "cube-half": ("run-sph-cube-half-k6/sph-cube-half-cells.json",
                  "Cube halved",
                  "the cube's face, cut by a diagonal", [60, 120, 60]),
    "ico-half": ("run-sph-ico-half-k6/sph-ico-half-cells.json",
                 "Icosahedron halved",
                 "the icosahedron's face, cut by an altitude", [36, 90, 72]),
    "dodec-half": ("run-sph-dodec-half-k13/sph-dodec-half-cells.json",
                   "Dodecahedron halved",
                   "the dodecahedron's pentagon, cut by a mirror", [60, 120, 120, 90]),
}


def key(v):
    return tuple(np.round(v, 6))


def symmetry(V, F):
    """Every isometry of R^3 carrying this tiling to itself. Fix face 0 and try sending it to each face
    in each of its 6 vertex orderings; three independent image points determine the map, and the rest
    is checking it preserves the vertex set and the face set."""
    # THREE image points determine the map, so take three from face 0 and try every ordered triple of
    # every face as their image. Three, not len(face): the dodecahedron's half is a quadrilateral and
    # the four-column version is not a square matrix to invert.
    A = np.array([V[i] for i in F[0][:3]]).T
    if abs(np.linalg.det(A)) < 1e-9:
        raise SystemExit("face 0's first three vertices are coplanar with the centre; cannot solve")
    Ai = np.linalg.inv(A)
    vs = {key(v) for v in V}
    fs = {frozenset(key(V[i]) for i in f) for f in F}
    out = []
    for f in F:
        for p in itertools.permutations(f, 3):
            M = np.array([V[i] for i in p]).T @ Ai
            if np.max(np.abs(M @ M.T - np.eye(3))) > 1e-6:
                continue
            if {key(M @ v) for v in V} != vs:
                continue
            if {frozenset(key(M @ V[i]) for i in fc) for fc in F} != fs:
                continue
            out.append(M)
    return out


def orbits(V, G):
    idx = {key(v): i for i, v in enumerate(V)}
    lab, left = [-1] * len(V), set(range(len(V)))
    n = 0
    while left:
        s = min(left)
        orb = {idx[key(M @ V[s])] for M in G}
        for i in orb:
            lab[i] = n
        n += 1
        left -= orb
    return lab, n


def corner(prev, here, nxt):
    tp = prev - float(np.dot(prev, here)) * here
    tn = nxt - float(np.dot(nxt, here)) * here
    return math.degrees(math.acos(max(-1.0, min(1.0,
        float(np.dot(tp / np.linalg.norm(tp), tn / np.linalg.norm(tn)))))))


def vertex_figure(V, F, i):
    """The angle word at vertex i, as the sorted multiset of the corners meeting there."""
    angs = []
    for f in F:
        if i not in f:
            continue
        m = len(f)
        j = f.index(i)
        angs.append(corner(V[f[(j - 1) % m]], V[f[j]], V[f[(j + 1) % m]]))
    return ".".join(str(int(round(a))) for a in sorted(angs, reverse=True))


def oriented(ring):
    """A convex spherical polygon, wound so every edge normal points the same way. Written for any n,
    not just triangles: the dodecahedron's half is a QUADRILATERAL, and the three-vertex version simply
    could not take it."""
    ring = list(ring)
    c = sum(ring)
    c = c / np.linalg.norm(c)
    return ring if float(np.dot(np.cross(ring[0], ring[1]), c)) > 0 else ring[::-1]


def covers_once(V, F, n=1500, seed=5):
    rnd = random.Random(seed)
    tris = [oriented([V[i] for i in f]) for f in F]
    for _ in range(n):
        while True:
            p = np.array([rnd.gauss(0, 1) for _ in range(3)])
            m = np.linalg.norm(p)
            if m > 1e-6:
                break
        p = p / m
        c = sum(1 for t in tris
                if all(float(np.dot(np.cross(t[i], t[(i + 1) % len(t)]), p)) > 1e-12
                       for i in range(len(t))))
        if c != 1:
            return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=os.path.join(HERE, "..", ".."))
    args = ap.parse_args()
    pub = os.path.join(os.path.abspath(args.repo), "public")
    out_dir = os.path.join(pub, "spherical-half")
    os.makedirs(out_dir, exist_ok=True)

    ref, manifest = [], {}
    for base, (cells, label, cut, tile_angles) in BOARDS.items():
        recs = json.load(open(os.path.join(HERE, cells)))
        want_arcs = None
        by_k = {}
        for e in recs:
            V = [np.array(v) for v in e["vertices"]]
            F = [list(map(int, r)) for r in e["faces"]]
            G = symmetry(V, F)
            symlab, korb = orbits(V, G)
            euler = len(V) - e["stats"]["E"] + len(F)
            if euler != 2:
                raise SystemExit(f"{e['id']}: Euler {euler} != 2")
            if not covers_once(V, F):
                raise SystemExit(f"{e['id']}: a sampled point is not covered exactly once")
            # every face congruent to the tile
            want = sorted(tile_angles)
            for f in F:
                m = len(f)
                got = sorted(corner(V[f[(j - 1) % m]], V[f[j]], V[f[(j + 1) % m]]) for j in range(m))
                if m != len(want) or max(abs(x - y) for x, y in zip(got, want)) > 1e-4:
                    raise SystemExit(f"{e['id']}: a face is not the tile ({[round(x,3) for x in got]})")
            # FACE ORBITS under the tiling's own isometries — the fill key. Every face here is a
            # triangle, so grouping by polygon size would paint the whole solid one neutral colour; this
            # says instead which tiles the solid carries onto each other, and collapses to one colour
            # exactly when the tiling really is tile-transitive.
            fkey = [frozenset(key(V[i]) for i in f) for f in F]
            fidx = {k: i for i, k in enumerate(fkey)}
            fill, nleft, ng = [-1] * len(F), set(range(len(F))), 0
            while nleft:
                s0 = min(nleft)
                orb = {fidx[frozenset(key(M @ V[i]) for i in F[s0])] for M in G}
                for i in orb:
                    fill[i] = ng
                ng += 1
                nleft -= orb
            edges = sorted({(min(f[i], f[(i + 1) % len(f)]), max(f[i], f[(i + 1) % len(f)]))
                            for f in F for i in range(len(f))})
            # The distinct side arcs, CLUSTERED, not rounded into a set: two copies of one arc differ in
            # the ninth decimal, and rounding alone reported the icosahedron's 31.717474 and 31.717475
            # as two different lengths — three edge types read as four.
            raw = sorted(math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(V[a], V[b]))))))
                         for a, b in edges)
            arcs = []
            for x in raw:
                if not arcs or abs(x - arcs[-1]) > 1e-6:
                    arcs.append(x)
            arcs = [round(x, 6) for x in arcs]
            want_arcs = arcs
            figs = {}
            seen_orb = set()
            for i in range(len(V)):
                if symlab[i] in seen_orb:
                    continue
                seen_orb.add(symlab[i])
                figs[symlab[i]] = vertex_figure(V, F, i)
            census = {}
            for i in range(len(V)):
                w = vertex_figure(V, F, i)
                census[w] = census.get(w, 0) + 1
            rec = {
                "id": f"sh{base}-{e['k']}-{str(len(by_k.get(e['k'], [])) + 1).zfill(5)}",
                "k": korb,
                "certK": e["k"],
                "base": base,
                "family": label,
                "config": " + ".join(figs[o] for o in sorted(figs)),
                "edge": max(arcs) * math.pi / 180.0,
                "vertices": [[round(float(c), 9) for c in v] for v in V],
                "faces": F,
                "faceSize": [len(f) for f in F],
                "fillGroup": fill,
                "edges": [[a, b] for a, b in edges],
                "vorbit": symlab,
                "symOrbit": symlab,
                "stats": {
                    "verts": len(V), "edges": len(edges), "faces": len(F),
                    "symmetryOrder": len(G), "symmetryOrbits": korb,
                    "sizes": sorted({len(f) for f in F}),
                    "sizeCensus": [len(F)],
                    "figures": sorted(census.items(), key=lambda kv: -kv[1]),
                    "greatCircleFaces": 0,
                    "certOrbits": e["k"],
                },
            }
            by_k.setdefault(e["k"], []).append(rec)
        manifest[base] = {"label": label, "cut": cut, "arcsDeg": want_arcs,
                          "ks": sorted(by_k), "counts": {k: len(v) for k, v in sorted(by_k.items())}}
        for k, rows in sorted(by_k.items()):
            path = os.path.join(out_dir, f"sphalf-{base}-k{k}.json")
            json.dump(rows, open(path, "w"))
            print(f"  {base} k={k}: {len(rows)} tiling(s) -> public/spherical-half/{os.path.basename(path)}")
            for r in rows:
                ref.append({
                    "id": r["id"], "base": base, "k": r["k"], "certK": r["certK"],
                    "faces": r["stats"]["faces"], "symmetryOrder": r["stats"]["symmetryOrder"],
                    "config": r["config"],
                })
    json.dump(manifest, open(os.path.join(out_dir, "manifest.json"), "w"), indent=2)
    print(f"\nmanifest -> public/spherical-half/manifest.json")
    for base, m in manifest.items():
        print(f"  {base:10s} {m['label']:22s} arcs {m['arcsDeg']}  counts {m['counts']}")
    print(f"\n{len(ref)} tilings certified: Euler 2, faces congruent to the tile, every sampled point "
          f"covered exactly once")


if __name__ == "__main__":
    main()
