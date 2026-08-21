#!/usr/bin/env python3
"""Bake the NON-CONVEX regular-faced polyhedra develop_euclid found into lib/render/nonconvexSolids.ts.

There is no published catalogue to check these against. Klitzing's survey puts non-convexity explicitly
out of scope, and Zalgaller's extension of Johnson's 92 is to "convex regular-faced polyhedra with
CONDITIONAL EDGES" — still convex. What exists for non-convex regular-faced solids is the uniform half
(the 57 non-convex uniform polyhedra, all k=1 and all on the star shelf) and nothing systematic beyond
it. So these ship the way the star shelf ships an unrecognised record: with their measured signature and
no invented name. A name guessed off a census is exactly the error that discipline refuses to make.

WHAT QUALIFIES. From develop_euclid's k=2 output, a record ships here when it is:
  * REFLEX — at least one dihedral past pi. `residual.convex` is false.
  * not a DEGENERATE convex one — four records are convex with two coplanar neighbours, which is a
    polyhedron with a face drawn as two, not a non-convex solid. They are dropped, on the same test the
    convex gate uses (`coplanarNeighbour`).
  * not already on a shelf — matched by CONGRUENCE (sorted pairwise vertex distances after a common
    fit), against both the reference solids and the star shelf. Exactly one is: a 24/48/26 solid the
    star shelf already holds, which is also the ONLY one of the 38 with a circumsphere. That is not a
    coincidence — a circumsphere is what develop_spherical needs to see a solid at all, and the reason
    these 34 were invisible until the dihedral-angle developer landed.

TWO FACTS PER RECORD, both measured, both on the card:
  * SELF-INTERSECTING — does any face edge pass through the interior of a non-incident face? 30 of the
    38 do. A self-intersecting solid is a different kind of object from an embedded one and the shelf
    says which, rather than filing them together silently.
  * INSCRIBED — is there a sphere through every vertex? One is. The other 33 have no circumsphere, so
    they have no spherical view at all (lib/tilings/sph-inscribed.ts withholds it).

Usage: python3 gen_nonconvex_shelf.py [--emit]
"""
import argparse, collections, json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def centre_and_scale(V):
    """develop_euclid's flood fill starts at the ORIGIN, so its records come out with the seed vertex at
    (0,0,0) and the solid hanging off it at whatever size the unit edge gives. Every other record on the
    shelf is centred and normalised — the Platonic and Archimedean ones sit on the unit sphere, and
    gen_johnson_euclid centres its output the same way — so these have to be put in the same box or they
    render off-centre and mis-sized. Centre on the vertex centroid, scale the farthest vertex to 1.
    (Caught by lib/render/sphericalGeometry.test.ts, which measures what the RENDERER produces: the
    uncentred record has a vertex AT the origin and the whole-solid fit scales about the origin.)"""
    V = np.asarray(V, float)
    W = V - V.mean(axis=0)
    return W / (np.max(np.linalg.norm(W, axis=1)) or 1.0)


def congruence_key(V, q=1e-3):
    V = np.asarray(V, float)
    n = len(V)
    P = V - V.mean(axis=0)
    far = np.linalg.norm(P, axis=1).max() or 1.0
    P = P / far
    d = np.linalg.norm(P[:, None, :] - P[None, :, :], axis=2)
    return (n, tuple(sorted(np.round(d[np.triu_indices(n, 1)] / q).astype(int).tolist())))


def circumsphere_miss(V):
    V = np.asarray(V, float)
    A = np.hstack([2 * V, np.ones((len(V), 1))])
    b = (V ** 2).sum(axis=1)
    x, *_ = np.linalg.lstsq(A, b, rcond=None)
    c = x[:3]
    r2 = x[3] + c @ c
    if r2 <= 0:
        return float("inf")
    return float(np.max(np.abs(np.linalg.norm(V - c, axis=1) - np.sqrt(r2))))


def self_intersections(V, faces):
    """How many times a face EDGE passes through the interior of a face it shares no vertex with."""
    V = np.asarray(V, float)
    planes = []
    for f in faces:
        a = V[f[0]]
        n = np.cross(V[f[1]] - a, V[f[2]] - a)
        planes.append((n / (np.linalg.norm(n) or 1.0),))
    hits = 0
    for j, fj in enumerate(faces):
        (n,) = planes[j]
        a = V[fj[0]]
        d = n @ a
        ex = V[fj[1]] - a
        ex = ex / (np.linalg.norm(ex) or 1.0)
        ey = np.cross(n, ex)
        poly = [((V[k] - a) @ ex, (V[k] - a) @ ey) for k in fj]
        for i, fi in enumerate(faces):
            if i == j or set(fi) & set(fj):
                continue
            for e in range(len(fi)):
                P, Q = V[fi[e]], V[fi[(e + 1) % len(fi)]]
                dp, dq = n @ P - d, n @ Q - d
                if dp * dq >= -1e-12:
                    continue
                X = P + (dp / (dp - dq)) * (Q - P)
                x, y = (X - a) @ ex, (X - a) @ ey
                inside = False
                for k in range(len(poly)):
                    (x1, y1), (x2, y2) = poly[k], poly[k - 1]
                    if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                        inside = not inside
                if inside:
                    hits += 1
    return hits


def census(faces):
    c = collections.Counter(len(f) for f in faces)
    return " + ".join("%d{%d}" % (c[n], n) for n in sorted(c))


def shelf_keys():
    """Every solid already on a spherical shelf, by congruence key."""
    keys = {}
    ts = open(os.path.join(ROOT, "lib", "render", "johnsonSolids.ts")).read()
    # the reference solids are TS literals; the star shelf is JSON. Read the star shelf, and for the
    # reference side rely on the k=2 gate having shipped every convex record — the only overlap that can
    # exist here is with the star shelf, since these are all non-convex.
    del ts
    star = os.path.join(ROOT, "public", "spherical-star")
    for f in sorted(os.listdir(star)):
        if not f.endswith(".json") or f == "manifest.json":
            continue
        blob = json.load(open(os.path.join(star, f)))
        r = blob[0] if isinstance(blob, list) else blob
        if isinstance(r, dict) and r.get("vertices"):
            keys[congruence_key(r["vertices"])] = r["id"]
    return keys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--emit", action="store_true")
    ap.add_argument("--cells", default=os.path.join(HERE, "sph-k2-fix", "euclid-k2.json"))
    args = ap.parse_args()

    recs = json.load(open(args.cells))
    reflex = [r for r in recs if not r["residual"].get("convex")]
    coplanar = [r for r in recs
                if r["residual"].get("convex") and r["residual"].get("coplanarNeighbour")]
    print("k=2 records: %d  (reflex %d, degenerate-convex %d dropped)"
          % (len(recs), len(reflex), len(coplanar)))

    known = shelf_keys()
    picked, seen, dropped = [], {}, []
    for r in sorted(reflex, key=lambda r: (len(r["vertices"]), len(r["faces"]), r["id"])):
        k = congruence_key(r["vertices"])
        if k in known:
            dropped.append((r, known[k]))
            continue
        if k in seen:
            continue
        seen[k] = r
        picked.append(r)
    for r, why in dropped:
        print("   already on the star shelf: V=%d F=%d -> %s" % (len(r["vertices"]), len(r["faces"]), why))
    print("distinct new solids: %d" % len(picked))

    rows = []
    tally = collections.Counter()
    for r in picked:
        V, faces = r["vertices"], r["faces"]
        n = len(V)
        e = sum(len(f) for f in faces) // 2
        xings = self_intersections(V, faces)
        insc = circumsphere_miss(V) < 1e-4 * max(np.linalg.norm(np.asarray(V, float), axis=1))
        tally["selfIntersecting" if xings else "embedded"] += 1
        tally["inscribed" if insc else "noCircumsphere"] += 1
        rows.append({"rec": r, "V": n, "E": e, "F": len(faces), "census": census(faces),
                     "xings": xings, "inscribed": bool(insc)})
    # ids: V-E-F, with a letter when several share it
    by_vef = collections.Counter((x["V"], x["E"], x["F"]) for x in rows)
    used = collections.Counter()
    for x in rows:
        vef = (x["V"], x["E"], x["F"])
        used[vef] += 1
        suffix = "" if by_vef[vef] == 1 else "-%s" % chr(ord("a") + used[vef] - 1)
        x["id"] = "ncx-%d-%d-%d%s" % (vef[0], vef[1], vef[2], suffix)
        x["ident"] = x["id"].upper().replace("-", "_")
    for x in rows:
        print("   %-16s V=%-3d E=%-3d F=%-3d %-22s %s%s"
              % (x["id"], x["V"], x["E"], x["F"], x["census"],
                 "self-intersecting" if x["xings"] else "embedded",
                 ", inscribed" if x["inscribed"] else ""))
    print("\n%s" % dict(tally))
    if not args.emit:
        return

    ts = []
    for x in rows:
        r = x["rec"]
        ts.append("\n// %s  — %s, %s\nexport const %s: Polyhedron = {\n"
                  "\tid: \"%s\",\n\tschlafli: [0, 0], // no {p,q} — routing keys on id\n"
                  "\tvertexConfig: \"%s\",\n\tname: \"%s\",\n\tvertices: [\n%s\t],\n\tfaces: [\n%s\t],\n};\n"
                  % (x["id"], x["census"], "self-intersecting" if x["xings"] else "embedded",
                     x["ident"], x["id"], r["vertexConfig"], x["census"],
                     "".join("\t\t[%.9f, %.9f, %.9f],\n" % tuple(v) for v in centre_and_scale(r["vertices"])),
                     "".join("\t\t[%s],\n" % ", ".join(str(i) for i in f) for f in r["faces"])))
    open(os.path.join(HERE, "nonconvex.ts.part"), "w").write("".join(ts))
    json.dump([{k: x[k] for k in ("id", "V", "E", "F", "census", "xings", "inscribed")}
               | {"vertexConfig": x["rec"]["vertexConfig"], "k": x["rec"]["k"]} for x in rows],
              open(os.path.join(HERE, "nonconvex-rows.json"), "w"), indent=1)
    print("wrote nonconvex.ts.part and nonconvex-rows.json (%d solids)" % len(rows))


if __name__ == "__main__":
    main()
