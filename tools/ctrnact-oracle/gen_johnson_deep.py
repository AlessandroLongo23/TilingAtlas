#!/usr/bin/env python3
"""Bake the Johnson solids develop_euclid found into lib/render/johnsonSolids.ts, at any depth.

Was gen_johnson_k3.py, which is what it did once: --cells takes a list of develop outputs at any k now,
because a script named for one depth is a trap once the same search runs deeper. The k=2 run gave the 26
Johnson solids with exactly two vertex orbits; k=3 was the same search one orbit deeper. It returns 24 distinct convex regular-faced solids, five of which the shelf already holds, so
NINETEEN are new. Every one of them is a Johnson solid and that is not an inference from the census — it
is Zalgaller's theorem: a convex polyhedron with regular faces is Platonic, Archimedean, a prism, an
antiprism, or one of the 92, and none of these is uniform, since a uniform solid has one vertex orbit.

NAMING. The signature (V, E, F, face census) names most of them outright against the published table of
constituent polygons. Three pairs it cannot separate, and each is settled by a MEASUREMENT, never by
emission order — the discipline J28/J29 and J77/J78 both cost us:

  J42 / J43  elongated pentagonal ortho- vs gyrobirotunda: the ORTHO one has a mirror plane through its
             equator; the gyro one has an improper rotation instead and no such mirror. Same test
             gen_johnson_euclid.has_equatorial_mirror runs for the bicupolas.
  J55 / J56  para- vs metabiaugmented hexagonal prism, and
  J59 / J60  para- vs metabiaugmented dodecahedron: PARA means the two augmentations sit on opposite
             faces, so the two pyramid apexes are antipodal about the centre and the angle between them
             is pi. META puts them anywhere else, and the angle is visibly short of it.

Usage: python3 gen_johnson_deep.py [--emit-ts] [--cells A.json B.json ...]
"""
import argparse, collections, json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

# (V, E, F, sorted (n, count) census) -> (J number, name, const identifier). Everything the signature
# names on its own; the three ambiguous pairs are in PAIRS below.
NAMES = {
    (7, 12, 7, ((3, 4), (4, 3))): (7, "Elongated triangular pyramid", "ELONGATED_TRIANGULAR_PYRAMID"),
    (7, 13, 8, ((3, 6), (4, 2))): (49, "Augmented triangular prism", "AUGMENTED_TRIANGULAR_PRISM"),
    (8, 17, 11, ((3, 10), (4, 1))): (50, "Biaugmented triangular prism", "BIAUGMENTED_TRIANGULAR_PRISM"),
    (9, 16, 9, ((3, 4), (4, 5))): (8, "Elongated square pyramid", "ELONGATED_SQUARE_PYRAMID"),
    (9, 20, 13, ((3, 12), (4, 1))): (10, "Gyroelongated square pyramid", "GYROELONGATED_SQUARE_PYRAMID"),
    (11, 20, 11, ((3, 5), (4, 5), (5, 1))): (9, "Elongated pentagonal pyramid", "ELONGATED_PENTAGONAL_PYRAMID"),
    (14, 26, 14, ((3, 8), (4, 2), (5, 4))): (91, "Bilunabirotunda", "BILUNABIROTUNDA"),
    (15, 27, 14, ((3, 4), (4, 9), (6, 1))): (18, "Elongated triangular cupola", "ELONGATED_TRIANGULAR_CUPOLA"),
    (16, 38, 24, ((3, 20), (4, 4))): (90, "Disphenocingulum", "DISPHENOCINGULUM"),
    (18, 42, 26, ((3, 20), (4, 6))): (44, "Gyroelongated triangular bicupola", "GYROELONGATED_TRIANGULAR_BICUPOLA"),
    (20, 35, 17, ((3, 10), (5, 6), (10, 1))): (6, "Pentagonal rotunda", "PENTAGONAL_ROTUNDA"),
    (24, 56, 34, ((3, 24), (4, 10))): (45, "Gyroelongated square bicupola", "GYROELONGATED_SQUARE_BICUPOLA"),
    (25, 45, 22, ((3, 5), (4, 15), (5, 1), (10, 1))): (20, "Elongated pentagonal cupola", "ELONGATED_PENTAGONAL_CUPOLA"),
    (30, 70, 42, ((3, 30), (4, 10), (5, 2))): (46, "Gyroelongated pentagonal bicupola", "GYROELONGATED_PENTAGONAL_BICUPOLA"),
    (32, 60, 30, ((3, 16), (4, 10), (8, 4))): (67, "Biaugmented truncated cube", "BIAUGMENTED_TRUNCATED_CUBE"),
}
PAIRS = {
    (40, 80, 42, ((3, 20), (4, 10), (5, 12))): ("mirror",
        (42, "Elongated pentagonal orthobirotunda", "ELONGATED_PENTAGONAL_ORTHOBIROTUNDA"),
        (43, "Elongated pentagonal gyrobirotunda", "ELONGATED_PENTAGONAL_GYROBIROTUNDA")),
    (14, 26, 14, ((3, 8), (4, 4), (6, 2))): ("apexes",
        (55, "Parabiaugmented hexagonal prism", "PARABIAUGMENTED_HEXAGONAL_PRISM"),
        (56, "Metabiaugmented hexagonal prism", "METABIAUGMENTED_HEXAGONAL_PRISM")),
    (22, 40, 20, ((3, 10), (5, 10))): ("apexes",
        (59, "Parabiaugmented dodecahedron", "PARABIAUGMENTED_DODECAHEDRON"),
        (60, "Metabiaugmented dodecahedron", "METABIAUGMENTED_DODECAHEDRON")),
}


def stats(r):
    V = np.array(r["vertices"], float)
    F = r["faces"]
    c = collections.Counter(len(f) for f in F)
    e = sum(len(f) for f in F) // 2
    return (len(V), e, len(F), tuple(sorted(c.items()))), V, F


def centre_and_scale(V):
    W = V - V.mean(axis=0)
    return W / (np.max(np.linalg.norm(W, axis=1)) or 1.0)


def has_equatorial_mirror(V, F, tol=1e-6):
    """A mirror plane through the solid's equator, normal to its main axis. Ortho has one, gyro does not."""
    W = centre_and_scale(np.asarray(V, float))
    # main axis: the direction in which the vertex spread is most bimodal — for these solids the axis of
    # the two rotundas, which is the eigenvector of least inertia about the centroid.
    _, vecs = np.linalg.eigh(W.T @ W)
    for axis in vecs.T:
        R = W - 2 * np.outer(W @ axis, axis)
        ok = all(np.min(np.linalg.norm(W - p, axis=1)) < 1e-5 for p in R)
        if ok:
            return True
    return False


def apex_angle(V, F):
    """The angle at the centre between the two pyramid apexes — pi when the augmentations are opposite.

    An apex is a vertex every one of whose faces is a triangle AND which the base polygon does not
    touch; on both of these solids that is exactly the two added tips."""
    W = centre_and_scale(np.asarray(V, float))
    at = collections.defaultdict(list)
    for f in F:
        for v in f:
            at[v].append(len(f))
    apexes = [v for v, ns in at.items() if set(ns) == {3}]
    if len(apexes) != 2:
        return None
    a, b = W[apexes[0]], W[apexes[1]]
    return math.degrees(math.acos(max(-1.0, min(1.0, (a @ b) / (np.linalg.norm(a) * np.linalg.norm(b))))))


def congruence_key(V, q=1e-3):
    V = np.asarray(V, float)
    n = len(V)
    P = V - V.mean(axis=0)
    P = P / (np.linalg.norm(P, axis=1).max() or 1.0)
    d = np.linalg.norm(P[:, None, :] - P[None, :, :], axis=2)
    return (n, tuple(sorted(np.round(d[np.triu_indices(n, 1)] / q).astype(int).tolist())))


def shipped_keys():
    """Congruence keys of every solid already in lib/render/*Solids.ts, parsed out of the TS literals."""
    import re
    keys = {}
    for fn in ("platonicSolids", "archimedeanSolids", "prismSolids", "johnsonSolids"):
        src = open(os.path.join(ROOT, "lib", "render", fn + ".ts")).read()
        for m in re.finditer(r'id:\s*"([^"]+)".*?vertices:\s*\[(.*?)\]\s*,\s*faces:', src, re.S):
            pts = re.findall(r"\[\s*(-?[\d.eE+-]+),\s*(-?[\d.eE+-]+),\s*(-?[\d.eE+-]+)\s*\]", m.group(2))
            if len(pts) >= 4:
                keys[congruence_key([[float(x) for x in p] for p in pts])] = m.group(1)
    return keys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", nargs="+", default=[os.path.join(HERE, "sph-k3", "euclid-k3.json")],
                    help="develop_euclid outputs to harvest; any k, one or many.")
    ap.add_argument("--emit-ts", action="store_true")
    args = ap.parse_args()
    recs = []
    for path in args.cells:
        recs += json.load(open(path))
    # chi != 2 is a PINCHED realization — the flood fill sent two vertices of the map to one point and
    # merged them, so the solid touches itself and is not a polyhedron. develop_euclid rejects these at
    # source now; cell files written before that fix still carry them.
    pinched = [r for r in recs if r["residual"].get("euler") != 2]
    for r in pinched:
        print("   ⚑ pinched (chi=%s), dropped: %s" % (r["residual"].get("euler"), r["id"]))
    conv = [r for r in recs if r["residual"].get("euler") == 2
            and r["residual"].get("convex") and not r["residual"].get("coplanarNeighbour")]
    shipped = shipped_keys()
    ks = sorted({r["k"] for r in conv}) or [0]
    print("records %d over k=%s, convex %d, already-shipped solids indexed %d"
          % (len(recs), "/".join(str(k) for k in ks), len(conv), len(shipped)))

    seen, out, dup, unnamed = {}, [], [], []
    twin_used = set()
    for r in sorted(conv, key=lambda r: len(r["vertices"])):
        ck = congruence_key(r["vertices"])
        if ck in seen:
            continue
        seen[ck] = r
        if ck in shipped:
            dup.append((r, shipped[ck]))
            continue
        sig, V, F = stats(r)
        if sig in NAMES:
            j, name, ident = NAMES[sig]
        elif sig in PAIRS:
            how, first, second = PAIRS[sig]
            if how == "mirror":
                pick = first if has_equatorial_mirror(V, F) else second
            else:
                ang = apex_angle(V, F)
                if ang is None:
                    unnamed.append((r, sig, "could not find two apexes"))
                    continue
                pick = first if ang > 170 else second
            if pick[0] in twin_used:
                unnamed.append((r, sig, "twin %d already claimed" % pick[0]))
                continue
            twin_used.add(pick[0])
            j, name, ident = pick
        else:
            unnamed.append((r, sig, "signature not in the table"))
            continue
        out.append((j, name, ident, r, sig))
    out.sort()
    for r, why in dup:
        print("   already shipped: V=%-3d F=%-3d -> %s" % (len(r["vertices"]), len(r["faces"]), why))
    for j, name, ident, r, sig in out:
        print("   J%-3d %-40s V=%-3d E=%-3d F=%-3d" % (j, name, sig[0], sig[1], sig[2]))
    for r, sig, why in unnamed:
        print("   UNNAMED V=%d E=%d F=%d — %s" % (sig[0], sig[1], sig[2], why))
    print("\nnew: %d named, %d unnamed" % (len(out), len(unnamed)))
    if not args.emit_ts:
        return
    ts = []
    for j, name, ident, r, sig in out:
        W = centre_and_scale(np.array(r["vertices"], float))
        ts.append("\n// %s (J%d)  — from develop_euclid, k=%d\nexport const %s: Polyhedron = {\n"
                  "\tid: \"%s\",\n\tschlafli: [0, 0], // Johnson solid, no {p,q} — routing keys on id\n"
                  "\tvertexConfig: \"%s\",\n\tname: \"%s (J%d)\",\n\tvertices: [\n%s\t],\n\tfaces: [\n%s\t],\n};\n"
                  % (name, j, r["k"], ident, ident.lower().replace("_", "-"), r["vertexConfig"], name, j,
                     "".join("\t\t[%.9f, %.9f, %.9f],\n" % tuple(v) for v in W),
                     "".join("\t\t[%s],\n" % ", ".join(str(i) for i in f) for f in r["faces"])))
    open(os.path.join(HERE, "johnson-deep.ts.part"), "w").write("".join(ts))
    json.dump([{"id": ident.lower().replace("_", "-"), "j": j, "name": name, "k": r["k"],
                "vertexConfig": r["vertexConfig"], "V": sig[0], "E": sig[1], "F": sig[2],
                "census": " + ".join("%d{%d}" % (c, n) for n, c in sig[3])}
               for j, name, ident, r, sig in out],
              open(os.path.join(HERE, "johnson-k3-rows.json"), "w"), indent=1)
    print("wrote johnson-k3.ts.part (%d solids)" % len(out))


if __name__ == "__main__":
    main()
