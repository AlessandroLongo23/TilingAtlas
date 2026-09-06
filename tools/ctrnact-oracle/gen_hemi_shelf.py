#!/usr/bin/env python3
"""Bake the nine HEMIPOLYHEDRA into lib/render/hemiSolids.ts and hemi-atlas-rows.json.

WHERE THEY LAND, and they SPLIT: the six whose faces are all ordinary regular polygons fill the
non-convex shelf's k = 1 row ("Regular polygons"), which was empty because the class was missing rather
than because it belonged elsewhere; the three carrying a {5/2} or {10/3} face go to the STAR shelf's
k = 1 row, since face type is the split those two headings already make (AL, 2026-08-30). Only the
non-convex row is named "hemipolyhedra" — the star shelf's k = 1 holds 52 records that are not.

WHY THIS IS NOT A SEARCH, and it is the one script here that is not. Every other shelf in this
directory comes out of the Cirnact engine; this class does not, because the engine provably cannot
express it (see the header this emits). It is a closed, published, complete class of exactly nine, so
it is CONSTRUCTED from the three quasiregular vertex sets it lives on and then VERIFIED — face counts,
equal edges, every edge in exactly two faces, chi, orientability, one vertex orbit. Construction plus
verification is the honest form for a class someone else already enumerated; a search would only
rediscover it.

HOW. A hemipolyhedron's vertices are its parent quasiregular solid's, so all nine sit on the
octahedron's 6 points, the cuboctahedron's 12 or the icosidodecahedron's 30. Enumerate EVERY regular
{n/d} polygon in that point set (planes through >= 3 points, concyclic, equally spaced, chord = the
edge length), split them by distance from the origin, and each hemipolyhedron is one non-central face
class plus one class of "hemi" faces lying in planes THROUGH the centre. Nothing is tabulated but the
face census of each of the nine, which is what the verification then checks.

Usage: python3 gen_hemi_shelf.py [--emit]
"""
import argparse, collections, itertools, json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "lib", "render", "hemiSolids.ts")
PHI = (1 + 5 ** 0.5) / 2

# name, parent, edge chord, non-central face class, central ("hemi") face class. Counts are the claim
# the construction has to reproduce; nothing below is read off a table.
SPEC = [
    ("Tetrahemihexahedron",          "oct",   2 ** 0.5, (3, 1, 4),  (4, 1, 3)),
    ("Octahemioctahedron",           "cubo",  1.0,      (3, 1, 8),  (6, 1, 4)),
    ("Cubohemioctahedron",           "cubo",  1.0,      (4, 1, 6),  (6, 1, 4)),
    ("Small icosihemidodecahedron",  "icosi", 1 / PHI,  (3, 1, 20), (10, 1, 6)),
    ("Small dodecahemidodecahedron", "icosi", 1 / PHI,  (5, 1, 12), (10, 1, 6)),
    # ⚑ The pair is named the way round that reads wrong and is right: the SMALL dodecahemicosahedron
    # takes the PENTAGRAMS (12{5/2}) and the GREAT one the pentagons. Both sit at the same chord on the
    # same 30 points, so the geometry cannot tell them apart and only the literature can — checked
    # against the Wikipedia pages for each, 2026-08-30, after this table shipped them swapped.
    ("Small dodecahemicosahedron",   "icosi", 1.0,      (5, 2, 12), (6, 1, 10)),
    ("Great dodecahemicosahedron",   "icosi", 1.0,      (5, 1, 12), (6, 1, 10)),
    ("Great icosihemidodecahedron",  "icosi", PHI,      (3, 1, 20), (10, 3, 6)),
    ("Great dodecahemidodecahedron", "icosi", PHI,      (5, 2, 12), (10, 3, 6)),
]


def _rows(a):
    a = np.asarray(a, float)
    return a / np.linalg.norm(a, axis=1)[:, None]


def _cyc(v):
    x, y, z = v
    return [(x, y, z), (y, z, x), (z, x, y)]


def parents():
    """The three quasiregular vertex sets, on the unit sphere."""
    oct_ = _rows([(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)])
    cubo = _rows([p for s in (1, -1) for t in (1, -1) for p in _cyc((0, s, t))])
    raw = [p for s in (1, -1) for p in _cyc((0, 0, 2 * PHI * s))]
    raw += [p for a in (1, -1) for b in (1, -1) for c in (1, -1) for p in _cyc((a, b * PHI, c * PHI * PHI))]
    keep = []
    for v in np.array(raw, float):
        if not any(np.allclose(v, w, atol=1e-9) for w in keep):
            keep.append(v)
    return {"oct": oct_, "cubo": cubo, "icosi": _rows(keep)}


def regular_polygons(V):
    """Every regular {n/d} polygon whose vertex set is a subset of V, with its chord and plane offset."""
    planes = {}
    for i, j, k in itertools.combinations(range(len(V)), 3):
        nrm = np.cross(V[j] - V[i], V[k] - V[i])
        L = np.linalg.norm(nrm)
        if L < 1e-9:
            continue
        nrm = nrm / L
        d = float(nrm @ V[i])
        if d < 0:
            nrm, d = -nrm, -d
        planes.setdefault(tuple(np.round(np.append(nrm, d), 6)), set()).update((i, j, k))
    out, seen = [], set()
    for key, idx in planes.items():
        idx = sorted(idx)
        nrm, d = np.array(key[:3]), key[3]
        pts = V[idx] - nrm * d
        if np.linalg.norm(pts, axis=1).std() > 1e-6:          # not concyclic
            continue
        u = pts[0] / np.linalg.norm(pts[0])
        w = np.cross(nrm, u)
        ang = np.array([math.atan2(p @ w, p @ u) for p in pts])
        ring = [idx[o] for o in np.argsort(ang)]
        a = np.sort(ang)
        if np.diff(np.concatenate([a, [a[0] + 2 * math.pi]])).std() > 1e-6:   # not equally spaced
            continue
        m = len(ring)
        for e in range(1, m // 2 + 1):
            if math.gcd(m, e) != 1:
                continue
            cyc = [ring[(e * t) % m] for t in range(m)]
            k2 = frozenset(frozenset(p) for p in zip(cyc, cyc[1:] + cyc[:1]))
            if k2 in seen:
                continue
            seen.add(k2)
            out.append(dict(n=m, d=e, cycle=cyc, chord=float(np.linalg.norm(V[cyc[1]] - V[cyc[0]])), off=d))
    return out


def config_at(faces, v):
    """The vertex figure at v as a cyclic face word, walked through the SHARED EDGES.

    Sorting the incident faces by centroid angle is wrong here and quietly so: a hemipolyhedron's
    vertex figure is a CROSSED quadrilateral, and centroid order returns its convex hull's word
    (3.6.6.3) instead of the real alternation (3.6.3.6).
    """
    inc = [f for f in faces if v in f["cycle"]]
    arm = {}                                   # neighbour of v -> the faces reaching v along that edge
    for f in inc:
        c = f["cycle"]
        i = c.index(v)
        for u in (c[i - 1], c[(i + 1) % len(c)]):
            arm.setdefault(u, []).append(f)
    word, cur = [], inc[0]
    prev = None
    while len(word) < len(inc):
        word.append(cur)
        nxt = None
        c = cur["cycle"]
        i = c.index(v)
        for u in (c[i - 1], c[(i + 1) % len(c)]):
            other = [g for g in arm[u] if g is not cur]
            if other and other[0] is not prev:
                nxt = other[0]
                break
        if nxt is None:
            break
        prev, cur = cur, nxt
    return ".".join("%d" % f["n"] if f["d"] == 1 else "%d/%d" % (f["n"], f["d"]) for f in word)


def orientable(faces):
    darts = collections.defaultdict(list)
    for i, f in enumerate(faces):
        c = f["cycle"]
        for a, b in zip(c, c[1:] + c[:1]):
            darts[(a, b)].append(i)
    orient, stack = {0: 1}, [0]
    while stack:
        i = stack.pop()
        c = faces[i]["cycle"]
        if orient[i] == -1:
            c = c[::-1]
        for a, b in zip(c, c[1:] + c[:1]):
            for j in darts[(a, b)] + darts[(b, a)]:
                if j == i:
                    continue
                want = -1 if j in darts[(a, b)] else 1
                if j in orient:
                    if orient[j] != want:
                        return False
                elif True:
                    orient[j] = want
                    stack.append(j)
    return True


def build():
    P = parents()
    POLY = {k: regular_polygons(v) for k, v in P.items()}
    rows = []
    for name, par, edge, (n1, d1, c1), (n2, d2, c2) in SPEC:
        V = P[par]
        pick = lambda n, d, cen: [f for f in POLY[par] if f["n"] == n and f["d"] == d
                                  and abs(f["chord"] - edge) < 1e-6 and (f["off"] < 1e-9) == cen]
        outer, hemi = pick(n1, d1, False), pick(n2, d2, True)
        if name == "Tetrahemihexahedron" and len(outer) == 2 * c1:
            # The octahedron carries all eight triangles at this chord; the solid takes the alternating
            # tetrahedral half, which is exactly the four whose outward normal has an even sign product.
            outer = [f for f in outer if np.prod(np.sign(np.cross(V[f["cycle"][1]] - V[f["cycle"][0]],
                                                                  V[f["cycle"][2]] - V[f["cycle"][0]]))) > 0]
        assert len(outer) == c1 and len(hemi) == c2, (name, len(outer), len(hemi))
        faces = outer + hemi
        ec = collections.Counter(frozenset(p) for f in faces for p in zip(f["cycle"], f["cycle"][1:] + f["cycle"][:1]))
        assert all(c == 2 for c in ec.values()), (name, "edge not in exactly two faces")
        used = sorted({i for f in faces for i in f["cycle"]})
        assert used == list(range(len(V))), (name, "unused parent vertex")
        lens = [np.linalg.norm(V[a] - V[b]) for a, b in (tuple(e) for e in ec)]
        assert max(lens) - min(lens) < 1e-9, (name, "edges not equal")
        cfgs = {config_at(faces, v) for v in used}
        # One vertex orbit: every vertex figure is the same cyclic word up to rotation and reflection.
        base = min(cfgs, key=len).split(".")
        rots = {".".join(base[i:] + base[:i]) for i in range(len(base))}
        rots |= {".".join(list(reversed(base))[i:] + list(reversed(base))[:i]) for i in range(len(base))}
        assert cfgs <= rots, (name, cfgs)
        chi = len(V) - len(ec) + len(faces)
        rows.append(dict(
            id="hemi-" + name.lower().replace(" ", "-"), name=name, V=len(V), E=len(ec), F=len(faces),
            chi=chi, orientable=orientable(faces), k=1,
            vertexConfig=sorted(cfgs)[0],
            census=", ".join("%d{%s}" % (c, "%d" % n if d == 1 else "%d/%d" % (n, d))
                             for (n, d), c in [((n1, d1), c1), ((n2, d2), c2)]),
            hemi="%d{%s}" % (c2, "%d" % n2 if d2 == 1 else "%d/%d" % (n2, d2)),
            vertices=[[round(float(x), 9) + 0.0 for x in v] for v in V],
            faces=[f["cycle"] for f in faces],
        ))
    return rows


HEADER = """// THE NINE HEMIPOLYHEDRA — uniform polyhedra whose "hemi" faces pass through the CENTRE of the solid.
//
// GENERATED FILE. Rebuild with tools/ctrnact-oracle/gen_hemi_shelf.py --emit; do not hand-edit.
//
// WHERE THEY LAND, and they SPLIT (AL, 2026-08-30). The six whose faces are all ordinary regular
// polygons fill the NON-CONVEX shelf's k = 1 row, which was empty because the class was missing and not
// because it belonged elsewhere — k = 1 with regular faces means vertex-transitive means uniform. The
// three carrying a {5/2} or {10/3} face go to the STAR shelf's k = 1 row instead, because face type is
// the split those two headings already make between them. HEMI_STAR_FACED below is that partition,
// measured off the face census. Only the non-convex row is named for the class; the star shelf's k = 1
// holds 52 records that are not hemipolyhedra, so it takes no noun.
//
// This is the only shelf in the atlas that is CONSTRUCTED rather than searched, and the reason is a
// measured fact about the engine and not a shortcut. Every closure mode the solver has keys on the SIGN
// of a vertex's angular defect — "positive-defect" for the sphere, "negative-defect" for the hyperbolic
// plane, "mixed" for the genus shelf — and all three exclude the FLAT vertex, where the face angles sum
// to exactly 360 degrees (alphabets/gen_alphabet.py, enum_configs). The octahemioctahedron's vertex is
// 3.6.3.6: 60 + 120 + 60 + 120 = 360, flat. It is the trihexagonal tiling's vertex closed up into a
// finite map instead of the infinite plane, and no mode the engine has can emit that word at any k.
// The other eight are refused one layer further on: genus_harvest.py rejects a non-orientable record
// rather than mislabel its genus, and eight of the nine are non-orientable. So the class was not missed,
// it was outside the search twice over. It is closed, published and complete at nine, so it is
// constructed from its parent vertex sets and VERIFIED instead — see the generator's docstring.
//
// WHAT IS MEASURED, per record, by the generator and again by tests/hemi-solids.test.ts:
//   * every face regular, every edge one length, every edge in exactly two faces;
//   * one vertex orbit (k = 1) — these are uniform polyhedra;
//   * V - E + F and ORIENTABILITY, which together are why they are here. Not one closes at 2. The
//     octahemioctahedron is the only orientable one (chi = 0, a torus); the other eight are
//     one-sided, the tetrahemihexahedron being a projective plane at chi = 1.
//
// NO SPHERE VIEW, and it is a theorem twice. Every vertex IS on a circumsphere — they are the parent
// quasiregular solid's vertices — so the usual measurement would offer the round view and be wrong: a
// hemi face's plane contains the centre, so its radial projection is a great circle and not a spherical
// polygon, and the map is not a map on a sphere in the first place. sph-inscribed.ts withholds it by id.
//
// These are the 9 of the 57 non-convex uniform polyhedra that are NOT on the star shelf. That shelf
// wants a density — how many times the solid covers its circumsphere — and a face through the centre
// makes that quantity undefined, which is exactly the gap recorded in the star run's open questions
// (experiments/results/star-spherical-k1-2026-08-17.md).

import type { Polyhedron } from "./platonicSolids";
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--emit", action="store_true")
    a = ap.parse_args()
    rows = build()
    print("%-32s %3s %3s %3s %5s %-11s %s" % ("name", "V", "E", "F", "chi", "surface", "census"))
    for r in rows:
        surf = "torus" if r["orientable"] else ("one-sided N%d" % (2 - r["chi"]))
        print("%-32s %3d %3d %3d %5d %-11s %s   [%s]" % (
            r["name"], r["V"], r["E"], r["F"], r["chi"], surf, r["census"], r["vertexConfig"]))
    if not a.emit:
        print("\n(dry run — pass --emit)")
        return
    ts = [HEADER]
    for r in rows:
        const = r["id"].upper().replace("-", "_")
        ts.append("\n// %s  — %s, %s, chi = %d, %s\nexport const %s: Polyhedron = {\n"
                  '\tid: "%s",\n\tschlafli: [0, 0], // no {p,q} — routing keys on id\n'
                  '\tvertexConfig: "%s",\n\tname: "%s",\n\tvertices: [\n%s\t],\n\tfaces: [\n%s\t],\n};\n'
                  % (r["id"], r["name"], r["census"], r["chi"],
                     "orientable (torus)" if r["orientable"] else "non-orientable",
                     const, r["id"], r["vertexConfig"], r["name"],
                     "".join("\t\t[%s],\n" % ", ".join("%.9f" % x for x in v) for v in r["vertices"]),
                     "".join("\t\t[%s],\n" % ", ".join(str(i) for i in f) for f in r["faces"])))
    ts.append("\nexport const HEMI_SOLIDS: Polyhedron[] = [\n%s];\n"
              % "".join("\t%s,\n" % r["id"].upper().replace("-", "_") for r in rows))
    # WHICH OF THE NINE CARRY A STAR FACE, measured off the face census and not listed by hand, because
    # it is what decides the shelf: a {5/2} or {10/3} face puts a record on the STAR shelf, and only the
    # all-convex-faced ones belong under a heading that says "Regular polygons" (AL, 2026-08-30).
    star = [r for r in rows if "/" in r["vertexConfig"]]
    ts.append("\n/**\n * The hemipolyhedra with a {n/d} face — %d of the nine.\n *\n"
              " * These file under the STAR shelf, not the non-convex one: that shelf's split against the\n"
              " * star shelf is the FACE TYPE, and a {5/2} is not a regular polygon in the sense that\n"
              " * heading means. Measured off the face census by the generator, never hand-listed.\n */\n"
              "export const HEMI_STAR_FACED: ReadonlySet<string> = new Set([\n%s]);\n"
              % (len(star), "".join('\t"%s",\n' % r["id"] for r in star)))
    open(OUT, "w").write("".join(ts))
    json.dump([{k: r[k] for k in ("id", "name", "V", "E", "F", "chi", "orientable", "k",
                                  "vertexConfig", "census", "hemi")} for r in rows],
              open(os.path.join(HERE, "hemi-atlas-rows.json"), "w"), indent=1)
    print("\nwrote %s and hemi-atlas-rows.json (%d solids)" % (os.path.relpath(OUT, ROOT), len(rows)))


if __name__ == "__main__":
    main()
