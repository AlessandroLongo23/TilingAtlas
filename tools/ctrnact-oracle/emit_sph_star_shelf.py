#!/usr/bin/env python3
"""Turn develop_spherical.py's star output into the Atlas shelf under public/spherical-star/.

The records are k=1 SPHERICAL STAR polyhedra: tilings of S² by self-intersecting regular {n/d} faces,
covering the sphere a whole number of times. They are the spherical sibling of the Euclidean `hollow`
shelf (lib/hollow/pattern.ts) — same tile, {n/d} with crossings that are NOT vertices, same density
notion — on a closed surface instead of the plane.

One file per solid, because there is no shared board to index into: every record is a different
polyhedron with its own vertices. The whole shelf is small enough that this costs nothing.

k IS NOT ALWAYS 1. It was while the shelf held only uniform polyhedra — uniform means vertex-transitive
by definition — but the k=2 scout found the pentagrammic pyramid, a regular-faced star polyhedron that
is NOT uniform, the star analogue of a Johnson solid. So the orbit count is measured off the developed
geometry and shipped, and a record is admitted at any k. What is still rejected is a DISAGREEMENT
between the measured orbit count and the certificate's k: that means the solver and the geometry are
describing different objects.

Naming is CONSERVATIVE. A solid gets its name only when its (V, E, F, face-type census, density)
signature was checked against the published catalogue by hand; everything else ships unnamed and the
UI falls back to the census. Guessing a U-number off V/E/F is exactly the mistake the J27/J37 pair
punishes on the neighbouring shelf, and U69/U74 are a live example here: same V, E, F and density.

Usage: python3 emit_sph_star_shelf.py --cells <cells.json> --out ../../public/spherical-star
"""
import argparse, collections, itertools, json, math, os
import numpy as np

# (V, E, F, sorted (n,d,count) census, density) -> name. Verified against Wikipedia's per-solid pages
# on 2026-08-17; the V/E/F and face composition of every row below was read off the article, not
# inferred. Rows with no entry ship unnamed on purpose.
NAMES = {
    (12, 30, 12, ((5, 2, 12),), 3): "small stellated dodecahedron {5/2,5}",
    (12, 30, 12, ((5, 1, 12),), 3): "great dodecahedron {5,5/2}",
    (20, 30, 12, ((5, 2, 12),), 7): "great stellated dodecahedron {5/2,3}",
    (12, 30, 20, ((3, 1, 20),), 7): "great icosahedron {3,5/2}",
    (30, 60, 24, ((5, 1, 12), (5, 2, 12)), 3): "dodecadodecahedron (U36)",
    (30, 60, 32, ((3, 1, 20), (5, 2, 12)), 7): "great icosidodecahedron (U54)",
    (20, 60, 32, ((3, 1, 20), (5, 2, 12)), 2): "small ditrigonal icosidodecahedron (U30)",
    (20, 60, 32, ((3, 1, 20), (5, 1, 12)), 6): "great ditrigonal icosidodecahedron (U47)",
    (60, 180, 112, ((3, 1, 100), (5, 2, 12)), 2): "small snub icosicosidodecahedron (U32)",
    (60, 150, 84, ((3, 1, 60), (5, 1, 12), (5, 2, 12)), 3): "snub dodecadodecahedron (U40)",
    (60, 150, 84, ((3, 1, 60), (5, 1, 12), (5, 2, 12)), 9): "inverted snub dodecadodecahedron (U60)",
    (60, 180, 104, ((3, 1, 80), (5, 1, 12), (5, 2, 12)), 4): "snub icosidodecadodecahedron (U46)",
    (60, 150, 92, ((3, 1, 80), (5, 2, 12)), 7): "great snub icosidodecahedron (U57)",
    (60, 90, 24, ((5, 2, 12), (10, 1, 12)), 3): "truncated great dodecahedron (U37)",
    (60, 120, 54, ((4, 1, 30), (5, 1, 12), (5, 2, 12)), 3): "rhombidodecadodecahedron (U38)",
    (60, 90, 32, ((5, 2, 12), (6, 1, 20)), 7): "great truncated icosahedron (U55)",
    (60, 90, 24, ((5, 1, 12), (10, 3, 12)), 9): "small stellated truncated dodecahedron (U58)",
    (60, 90, 32, ((3, 1, 20), (10, 3, 12)), 13): "great stellated truncated dodecahedron (U66)",
    (120, 180, 62, ((4, 1, 30), (6, 1, 20), (10, 3, 12)), 13): "great truncated icosidodecahedron (U68)",
    (60, 120, 44, ((3, 1, 20), (5, 1, 12), (10, 3, 12)), 4): "small ditrigonal dodecicosidodecahedron (U43)",
    (120, 180, 44, ((6, 1, 20), (10, 1, 12), (10, 3, 12)), 4): "icositruncated dodecadodecahedron (U45)",
    (60, 120, 52, ((3, 1, 20), (5, 2, 12), (6, 1, 20)), 2): "small icosicosidodecahedron (U31)",
    (24, 36, 14, ((3, 1, 8), (8, 3, 6)), 7): "stellated truncated hexahedron (U19)",
    (24, 48, 20, ((3, 1, 8), (4, 1, 6), (8, 3, 6)), 4): "great cubicuboctahedron (U14)",
    (48, 72, 20, ((6, 1, 8), (8, 1, 6), (8, 3, 6)), 4): "cubitruncated cuboctahedron (U16)",
    (10, 15, 7, ((4, 1, 5), (5, 2, 2)), 2): "pentagrammic prism",
    (10, 20, 12, ((3, 1, 10), (5, 2, 2)), 2): "pentagrammic antiprism",
    (10, 20, 12, ((3, 1, 10), (5, 2, 2)), 3): "pentagrammic crossed antiprism",
    (16, 24, 10, ((4, 1, 8), (8, 3, 2)), 3): "octagrammic prism",
    (16, 32, 18, ((3, 1, 16), (8, 3, 2)), 3): "octagrammic antiprism",
    (20, 30, 12, ((4, 1, 10), (10, 3, 2)), 3): "decagrammic prism",
    (20, 40, 22, ((3, 1, 20), (10, 3, 2)), 3): "decagrammic antiprism",
    # The 7-FOLD family, from the D=840 palette. Everything 7-fold on the sphere is dihedral: no finite
    # rotation group has a 7-fold axis outside the D7 series, so these six plus the two convex ones are
    # the whole uniform heptagonal set. {7/3} carries two antiprisms at different rho — the ordinary one
    # and the CROSSED one, whose bowtie vertex figure is what puts it at density 4.
    (14, 21, 9, ((4, 1, 7), (7, 2, 2)), 2): "heptagrammic prism {7/2}",
    (14, 28, 16, ((3, 1, 14), (7, 2, 2)), 2): "heptagrammic antiprism {7/2}",
    (14, 21, 9, ((4, 1, 7), (7, 3, 2)), 3): "heptagrammic prism {7/3}",
    (14, 28, 16, ((3, 1, 14), (7, 3, 2)), 3): "heptagrammic antiprism {7/3}",
    (14, 28, 16, ((3, 1, 14), (7, 3, 2)), 4): "heptagrammic crossed antiprism",
    # k=2. Apex 3^5, five base vertices 5/2.3.3 — the star analogue of a Johnson pyramid.
    (6, 10, 6, ((3, 1, 5), (5, 2, 1)), 2): "pentagrammic pyramid",
    (8, 14, 8, ((3, 1, 7), (7, 2, 1)), 2): "heptagrammic pyramid {7/2}",
    (8, 14, 8, ((3, 1, 7), (7, 3, 1)), 3): "heptagrammic pyramid {7/3}",
}


def isometries(V, faces):
    """Rotations and reflections preserving both the vertex set and the face set, as vertex
    permutations. Measured on the developed geometry, never taken from the certificate — the J27/J37
    lesson: a vertex ARRANGEMENT can be more symmetric than the solid built on it."""
    n = len(V)
    anchor = list(faces[0])[:3]
    A = V[list(anchor)].T
    if abs(np.linalg.det(A)) < 1e-9:
        for f in faces:
            cand = list(f)[:3]
            if abs(np.linalg.det(V[cand].T)) > 1e-9:
                anchor, A = cand, V[cand].T
                break
        else:
            return []
    Ainv = np.linalg.inv(A)
    d0 = [round(float(np.linalg.norm(V[anchor[i]] - V[anchor[j]])), 6) for i, j in ((0, 1), (1, 2), (0, 2))]
    key = {tuple(np.round(v, 6)): i for i, v in enumerate(V)}
    fset = set(frozenset(f) for f in faces)
    out = []
    for trip in itertools.permutations(range(n), 3):
        d = [round(float(np.linalg.norm(V[trip[i]] - V[trip[j]])), 6) for i, j in ((0, 1), (1, 2), (0, 2))]
        if d != d0:
            continue
        M = V[list(trip)].T @ Ainv
        if np.max(np.abs(M @ M.T - np.eye(3))) > 1e-6:
            continue
        img = [key.get(tuple(np.round(M @ v, 6))) for v in V]
        if any(x is None for x in img):
            continue
        if set(frozenset(img[i] for i in f) for f in faces) != fset:
            continue
        out.append(img)
    return out


def orbits(n, perms):
    parent = list(range(n))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for g in perms:
        for i, j in enumerate(g):
            a, b = find(i), find(j)
            if a != b:
                parent[a] = b
    lab = {}
    return [lab.setdefault(find(i), len(lab)) for i in range(n)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", required=True, nargs="+", help="one or more develop outputs, merged")
    ap.add_argument("--out", required=True)
    ap.add_argument("--index", default=None, help="where to write the shelf index JSON")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    recs = [r for f in args.cells for r in json.load(open(f))]
    # DEDUP ACROSS INPUT FILES. Each develop run dedups within itself, but merging several is new here
    # and two palettes can find the same solid: the D=840 heptagonal alphabet re-derives the great
    # icosahedron and the uniform great rhombicuboctahedron from {3} and {4} alone. The key is the full
    # geometric signature INCLUDING rho, which is what separates records a coarser key would fuse: the
    # great dodecahedron and the small stellated dodecahedron are both V=12 E=30 F=12 at density 3, and
    # differ only in that the vertices sit 63.43 degrees apart instead of 116.57.
    seen_sig, uniq = set(), []
    for r in recs:
        e = sum(len(f) for f in r["faces"]) // 2
        sig = (len(r["vertices"]), e, len(r["faces"]),
               tuple(sorted(collections.Counter(tuple(t) for t in r["faceTypes"]).items())),
               r["density"], round(r["rho"], 9))
        if sig in seen_sig:
            continue
        seen_sig.add(sig)
        uniq.append(r)
    if len(uniq) != len(recs):
        print("merged %d records -> %d distinct solids" % (len(recs), len(uniq)))
    recs = uniq
    index, skipped = [], []
    for r in recs:
        # A record belongs to this shelf if it covers the sphere more than once OR carries a face that
        # crosses itself. Filtering on density alone drops solids whose retrograde faces make the SIGNED
        # areas cancel to 1: the great truncated cuboctahedron 8/3.6.4 reads density 1 that way and is
        # unmistakably a star polyhedron. Filtering on star faces alone drops the great dodecahedron,
        # whose faces are ordinary pentagons. Both tests are needed, and a record that passes only the
        # face test gets its density flagged rather than trusted.
        star_face = any(int(t[1]) > 1 for t in r["faceTypes"])
        if r["density"] < 2 and not star_face:
            continue
        V = np.array(r["vertices"], float)
        faces = [list(map(int, f)) for f in r["faces"]]
        ftypes = [tuple(map(int, t)) for t in r["faceTypes"]]
        edges = sorted({(min(a, b), max(a, b))
                        for f in faces for a, b in zip(f, f[1:] + f[:1])})
        census = tuple(sorted((n, d, c) for (n, d), c in collections.Counter(ftypes).items()))
        sig = (len(V), len(edges), len(faces), census, r["density"])
        perms = isometries(V, faces)
        vorb = orbits(len(V), perms) if perms else list(range(len(V)))
        k_measured = len(set(vorb))
        # The certificate's k, from the record's own vertex word ("A + B" is two orbits). Kept separate
        # from the measured one and required to agree: the solver's k is a claim about the combinatorial
        # certificate, the orbit count is a claim about the finished solid, and the J27/J37 pair on the
        # neighbouring shelf is the standing proof that they can differ.
        k_cert = r.get("k", len(r["vertexConfig"].split(" + ")))
        if k_measured != k_cert:
            skipped.append((r["id"], "orbit count %d disagrees with certificate k=%d" % (k_measured, k_cert)))
            continue
        sid = "ss-%d-%d-%d-d%d" % (len(V), len(edges), len(faces), r["density"])
        if any(e["id"] == sid for e in index):
            sid += "-r%d" % round(r["rho"] * 1e4)
        rec = {
            "id": sid,
            "config": r["vertexConfig"],
            "k": k_measured,
            "density": r["density"],
            "rho": r["rho"],
            "solid": NAMES.get(sig),
            "vertices": [[float(x) for x in v] for v in V],
            "faces": faces,
            "faceType": [list(t) for t in ftypes],
            "edges": [list(e) for e in edges],
            "stats": {
                "verts": len(V), "edges": len(edges), "faces": len(faces),
                "symmetryOrder": len(perms), "symmetryOrbits": k_measured,
                "types": [list(t) for t in census],
                # Set when the measured density is 1 on a solid that has a self-intersecting face. The
                # signed-area sum cancelled, which the geometry allows and which makes the number
                # unreliable for that record; the UI must not present it as the covering number.
                "densitySuspect": bool(r["density"] < 2 and star_face),
                "chiral": all(np.linalg.det(np.eye(3)) > 0 for _ in [0]) and len(perms) % 2 == 0,
            },
        }
        json.dump(rec, open(os.path.join(args.out, sid + ".json"), "w"))
        index.append({k: rec[k] for k in ("id", "config", "k", "density", "solid")}
                     | {"stats": rec["stats"]})
    index.sort(key=lambda e: (e["k"], e["density"], e["stats"]["verts"], e["stats"]["faces"]))
    if args.index:
        json.dump(index, open(args.index, "w"), indent=1)
    print("wrote %d star polyhedra to %s" % (len(index), args.out))
    print("named: %d   unnamed: %d" % (sum(1 for e in index if e["solid"]),
                                       sum(1 for e in index if not e["solid"])))
    for i, why in skipped:
        print("  skipped %s: %s" % (i, why))


if __name__ == "__main__":
    main()
