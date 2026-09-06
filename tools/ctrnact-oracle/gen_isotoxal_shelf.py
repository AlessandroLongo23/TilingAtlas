#!/usr/bin/env python3
"""Bake the ISOTOXAL-STAR-FACED polyhedra into lib/render/isotoxalSolids.ts.

THE OTHER STAR POLYGON. Every star face the atlas held before today is a {n/d} of Schlafli: n sides
that CROSS, one corner angle, the pentagram drawn in one stroke. These use the other definition, the
one the Euclidean shelves have tiled with all along (docs/TILE_TAXONOMY.md 2.1): the isotoxal outline,
a simple 2n-gon that alternates a sharp POINT with a reflex DENT. Same drawing on the page, different
polygon — and, it turns out, different solids.

⚑ AL SAW IT FIRST AND SAID SO (2026-08-30), looking at ss-20-60-32-d2, the small ditrigonal
icosidodecahedron U30: "if we replace the pentagram with a star with ten edges, and the big triangles
with the small red ones, that should be a k=2 polyhedron with stars". It is. Its 12 pentagrams become
12 isotoxal 10-gons whose dents sit exactly on U30's self-crossing points, its 20 triangles become the
60 corner triangles those crossings cut off, and all 150 edges come out one length — 0.441056, the
vertex-to-adjacent-dent distance AL named. That solid is `5*.3.3 + 5*.3.5*.3.5*.3` below, and the
search found it independently of the hand construction (congruent, verified).

WHY IT TOOK FOUR BUGS TO SEE ONE. Every star-bearing block of every earlier isotoxal run died in the
developer with "no dihedral solution" before a single equation was formed. The causes, all fixed:
  1. parse_configs named an isotoxal star by its POINT count n, the alphabet by its boundary edge
     count 2n, so unfold's tuple comparison could never match.
  2. solve_dihedrals seeded from acos, so every theta came back <= 180 with the mirror as one bit
     flipping all of them together. AL's solid folds at (142.62, 142.62, 221.81) — a MIXED reading,
     unreachable that way. It seeds from solve_corner now.
  3. _face_str printed the 2n, so a pentagram's outline read as a regular decagon. It prints "5*".
  4. min_len dropped to 2 for any star palette, admitting 2-corner vertices — on reasoning that is
     entirely about the PLANE. AL again: on a curved surface two faces at a vertex have two edges, so
     the link is a spherical DIGON, both faces lie in one plane and their angles sum to a full turn,
     which every curved closure excludes. 99.6% of that search was vertices that cannot exist.

SEARCH: palette `isotox-mixed` — regular {3,4,5,6,8,10} plus the outlines of {5/2}, {8/3}, {10/3}
(5*12, 8*15, 10*24 on the D=120 grid) — closure `mixed`, maxValence 6, k = 2, star-bearing shards.
3,044,610 pruned blocks, 6 realized. ⚑ NOT A CENSUS: the regular-only shards are unrun, and the
developer declares two caps (EU_NE_CAP and the degeneracy probe) whose blocks are UNRESOLVED, not
empty. A deeper run can only add.

Usage: python3 gen_isotoxal_shelf.py [--emit] [--cells A.json ...]
"""
import argparse, collections, json, os, re
import numpy as np
import gen_nonconvex_shelf as ncx

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "lib", "render", "isotoxalSolids.ts")
DEFAULT_CELLS = [os.path.join(HERE, "im-k2b", "cells-star.json")]

HEADER = """// POLYHEDRA WITH ISOTOXAL STAR FACES — the star polygon that does NOT cross itself.
//
// GENERATED FILE. Rebuild with tools/ctrnact-oracle/gen_isotoxal_shelf.py --emit; do not hand-edit.
//
// Every star face elsewhere in this atlas is a {n/d} of Schlafli: n sides that cross, one corner
// angle, the pentagram drawn in one stroke. These use the other definition, the one the Euclidean
// shelves have tiled with all along — the isotoxal OUTLINE, a simple 2n-gon alternating a sharp point
// with a reflex dent. Same drawing, different polygon, different solids.
//
// ⚑ CONCAVE FACES, WHICH NOTHING ELSE ON THE SPHERICAL SHELVES HAS. A {n/d} face is decomposed by
// starFaceRings before it is filled; these need the other treatment, a fan from the face CENTROID,
// because an isotoxal star is star-shaped about its centre but not convex, and a v0 fan paints over
// every dent. See flatSolidTriangles in lib/render/sphericalGeometry.ts.
//
// AL's WORKED EXAMPLE (2026-08-30) is iso-80-150-72: take U30, the small ditrigonal icosidodecahedron,
// replace its 12 pentagrams by their outlines and its 20 triangles by the 60 corner pieces its own
// self-crossings cut off. All 150 edges come out one length. He described it before the search could
// find it, and the search's answer is congruent to the hand construction.
//
// %(census)s
//
// Ids are the signature, "iso-<V>-<E>-<F>", lettered where several share one, FROZEN across rebuilds.
"""


def is_star_face(V, ring):
    """An isotoxal star face alternates two radii about its centre; a regular polygon has one."""
    P = np.asarray([V[i] for i in ring], float)
    r = np.linalg.norm(P - P.mean(axis=0), axis=1)
    return bool(r.max() - r.min() > 1e-6)


def solid_key(V, faces):
    """Congruence key that knows about FACES, because ncx.congruence_key does not.

    ⚑ IT MERGED TWO DIFFERENT SOLIDS (2026-08-31). ncx.congruence_key is the sorted multiset of
    pairwise VERTEX distances and nothing else, and two distinct polyhedra can share a vertex set: the
    {12/5} palette returns `12*.4.4 + 12*.4.4` (48-72-26) and `12*.3.4.4.3 + 12*.3.12*.3.12*.3`
    (48-84-38) on the SAME 48 points, differing only in which faces are drawn. The vertex key made
    them one row and the shelf lost the second. develop_euclid's own congruence_key already carries the
    face census, which is why the developer kept both and only the shelf dropped one.

    The face part is the sorted multiset over faces of each face's corners' distances from the
    centroid, normalised by the largest radius exactly as congruence_key normalises. Rotation- and
    reflection-invariant like the vertex part, and scale-invariant, so it survives centre_and_scale
    and the frozen-id lookup keeps matching shipped solids."""
    P = np.asarray(V, float)
    r = np.linalg.norm(P - P.mean(axis=0), axis=1)
    far = r.max() or 1.0
    q = 1e-3
    sig = tuple(sorted(tuple(sorted(int(round(r[i] / far / q)) for i in f)) for f in faces))
    return (ncx.congruence_key(V), sig)


def census(V, faces):
    """"12{5*}, 60{3}" — the star faces named by their POINT count with a mark, as _face_str does.

    ncx.census counts a face by its (n, d) type, which cannot tell a pentagram's outline from a regular
    decagon: both are ten sides winding once. The geometry can, and does."""
    c = collections.Counter(("%d*" % (len(f) // 2)) if is_star_face(V, f) else str(len(f)) for f in faces)
    return ", ".join("%d{%s}" % (c[k], k) for k in sorted(c, key=lambda s: (s.endswith("*"), int(s.rstrip("*")))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--emit", action="store_true")
    ap.add_argument("--cells", nargs="*", default=DEFAULT_CELLS)
    args = ap.parse_args()

    rows = []
    seen = set()
    dropped = []
    for path in args.cells:
        for r in json.load(open(path)):
            V, faces = r["vertices"], r["faces"]
            if not any(is_star_face(V, f) for f in faces):
                continue                       # this shelf is the star-faced ones; the rest are elsewhere
            # ⚑ THE SAME DEGENERACY TEST THE OTHER SHELVES RUN, and this one was missing it (AL, seeing
            # sph-iso-48-84-38 in /play: "they're coplanar, it's basically a prism"). A star face and
            # the triangles filling its dents can come out in ONE PLANE, and then their union is the
            # real face and the shared edges are not edges: the {12/5} run's `12*.3.4.4.3 + ...`
            # (48-84-38) and `12*.3.12*.3 + ...` (48-96-50) are each a 24-gonal prism with a
            # subdivided top, 48 coplanar edge-neighbour pairs apiece. They are not new solids and the
            # V-E-F in their id counts something that is not in the picture.
            why = ncx.degeneracy(V, faces)
            if why:
                dropped.append((r.get("vertexConfig", "?"), len(V), len(faces), why))
                continue
            key = solid_key(V, faces)
            if key in seen:
                continue
            seen.add(key)
            E = len({tuple(sorted((f[i], f[(i + 1) % len(f)]))) for f in faces for i in range(len(f))})
            rows.append({"rec": r, "key": key, "V": len(V), "E": E, "F": len(faces),
                         "chi": len(V) - E + len(faces), "census": census(V, faces),
                         "xings": ncx.self_intersections(V, faces)})
    rows.sort(key=lambda x: (x["V"], x["E"], x["F"]))

    # ⚑ allocate_ids IS WRITTEN FOR THE "ncx-" NAMESPACE and slices that prefix off by LENGTH, so the
    # ids are normalised into it for the allocation and back out after — the same dance gen_genus_shelf
    # does, and for the same reason it had to learn it.
    frozen = {}
    if os.path.exists(OUT):
        src = open(OUT).read()
        for m in re.finditer(r'id:\s*"(iso-[\w-]+)".*?vertices:\s*\[(.*?)\n\t\],\n\tfaces:\s*\[(.*?)\n\t\]',
                             src, re.S):
            Vs = [[float(v) for v in row] for row in
                  re.findall(r"\[\s*(-?[\d.eE+-]+),\s*(-?[\d.eE+-]+),\s*(-?[\d.eE+-]+)\s*\]", m.group(2))]
            Fs = [[int(v) for v in row.split(",")] for row in re.findall(r"\[([\d,\s]+)\]", m.group(3))]
            if Vs and Fs:
                frozen[solid_key(Vs, Fs)] = "ncx-" + m.group(1)[len("iso-"):]
    ncx.allocate_ids(rows, frozen)
    for x in rows:
        x["id"] = "iso-" + x["id"][len("ncx-"):]
        x["ident"] = x["id"].upper().replace("-", "_")
    dupes = [i for i, n in collections.Counter(x["id"] for x in rows).items() if n > 1]
    if dupes:
        raise SystemExit("id collision, refusing to emit: %s" % ", ".join(sorted(dupes)))

    if dropped:
        print("dropped %d degenerate realization(s) — a coplanar or coincident map is not a polyhedron:"
              % len(dropped))
        for cfg, nv, nf, why in dropped:
            print("   %-34s V=%-4d F=%-4d %s" % (cfg, nv, nf, why))
    print("isotoxal-star-faced solids: %d" % len(rows))
    for x in rows:
        print("   %-18s %-30s chi=%-4d %s" % (x["id"], x["census"], x["chi"],
                                              "self-intersecting" if x["xings"] else "embedded"))
    if not args.emit:
        print("(dry run — pass --emit)")
        return

    cen = ("CENSUS: %d solids, %d embedded; chi = " % (len(rows), sum(1 for x in rows if not x["xings"]))
           + ", ".join("%d at %d" % (n, c) for c, n in sorted(collections.Counter(x["chi"] for x in rows).items())) + ".")
    ts = [HEADER % {"census": cen}, '\nimport type { Polyhedron } from "./platonicSolids";\n']
    for x in rows:
        r = x["rec"]
        ts.append("\n// %s — %s, chi %d, %s\nexport const %s: Polyhedron = {\n"
                  "\tid: \"%s\",\n\tschlafli: [0, 0], // no {p,q} — routing keys on id\n"
                  "\tvertexConfig: \"%s\",\n\tname: \"%s\",\n\tvertices: [\n%s\t],\n\tfaces: [\n%s\t],\n};\n"
                  % (x["id"], x["census"], x["chi"],
                     "self-intersecting" if x["xings"] else "embedded", x["ident"], x["id"],
                     r.get("vertexConfig", ""), x["census"],
                     "".join("\t\t[%.9f, %.9f, %.9f],\n" % tuple(v) for v in ncx.centre_and_scale(r["vertices"])),
                     "".join("\t\t[%s],\n" % ", ".join(str(i) for i in f) for f in r["faces"])))
    ts.append("\nexport const ISOTOXAL_SOLIDS: Polyhedron[] = [\n%s];\n"
              % "".join("\t%s,\n" % x["ident"] for x in rows))
    open(OUT, "w").write("".join(ts))
    json.dump([{k: x[k] for k in ("id", "V", "E", "F", "chi", "census", "xings")}
               | {"vertexConfig": x["rec"].get("vertexConfig", ""), "k": x["rec"].get("k", 2)}
               for x in rows], open(os.path.join(HERE, "isotoxal-atlas-rows.json"), "w"), indent=1)
    print("wrote %s and isotoxal-atlas-rows.json (%d solids)" % (os.path.relpath(OUT, ROOT), len(rows)))


if __name__ == "__main__":
    main()
