#!/usr/bin/env python3
"""Bake the gyrate/diminished RHOMBICOSIDODECAHEDRON family (J72-J83) out of the spherical 3.4.n.4 shelf.

The 3.4.n.4 boards (tools/ctrnact-oracle/develop_ai1_sph.py -> public/spherical-poly/) held twenty solids
and every one of them is a uniform or a Johnson solid, so the shelf was a second copy of the reference
one under a different heading (AL, 2026-08-21: "we shouldn't have duplicates and they have to be
redistributed"). Thirteen matched a reference record exactly, by congruence — the sorted multiset of
pairwise vertex distances after a common fit. The other seven are the rest of the J72-J83 family, which
the reference shelf held only five of.

NAMING IS DERIVED, NOT GUESSED. Every member of the family is one solid with two integers on it:

    g = gyrations    = (# vertices at 3.4.4.5) / 10
    d = diminishments = (# vertices at 4.5.10) / 10

which the calibration confirms on the five already shipped — the gyrate has 10 vertices at 3.4.4.5 and
the parabigyrate 20, the diminished has 10 at 4.5.10 and the parabidiminished 20. (g, d) names ten of
the twelve outright. The two para/meta pairs it cannot separate — (2,0) and (0,2) — are separated by
SYMMETRY ORDER, para being the D_5d one at 20 and meta the C_2v one at 4. That is the same test that
settled J28/J29, and for the same reason: emission order is not evidence.

Usage: python3 gen_johnson_rhombicosi.py [--emit-ts]
"""
import argparse, glob, json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

# (gyrations, diminishments) -> the family member, with the para/meta pairs keyed on symmetry order.
BY_GD = {
    (0, 0): {None: (None, "Rhombicosidodecahedron", None)},          # uniform; never emitted here
    (1, 0): {None: (72, "Gyrate rhombicosidodecahedron", "GYRATE_RHOMBICOSIDODECAHEDRON")},
    (2, 0): {20: (73, "Parabigyrate rhombicosidodecahedron", "PARABIGYRATE_RHOMBICOSIDODECAHEDRON"),
             4:  (74, "Metabigyrate rhombicosidodecahedron", "METABIGYRATE_RHOMBICOSIDODECAHEDRON")},
    (3, 0): {None: (75, "Trigyrate rhombicosidodecahedron", "TRIGYRATE_RHOMBICOSIDODECAHEDRON")},
    (0, 1): {None: (76, "Diminished rhombicosidodecahedron", "DIMINISHED_RHOMBICOSIDODECAHEDRON")},
    (1, 1): {10: (77, "Paragyrate diminished rhombicosidodecahedron", "PARAGYRATE_DIMINISHED_RHOMBICOSIDODECAHEDRON"),
             2:  (78, "Metagyrate diminished rhombicosidodecahedron", "METAGYRATE_DIMINISHED_RHOMBICOSIDODECAHEDRON")},
    (2, 1): {None: (79, "Bigyrate diminished rhombicosidodecahedron", "BIGYRATE_DIMINISHED_RHOMBICOSIDODECAHEDRON")},
    (0, 2): {20: (80, "Parabidiminished rhombicosidodecahedron", "PARABIDIMINISHED_RHOMBICOSIDODECAHEDRON"),
             4:  (81, "Metabidiminished rhombicosidodecahedron", "METABIDIMINISHED_RHOMBICOSIDODECAHEDRON")},
    (1, 2): {None: (82, "Gyrate bidiminished rhombicosidodecahedron", "GYRATE_BIDIMINISHED_RHOMBICOSIDODECAHEDRON")},
    (0, 3): {None: (83, "Tridiminished rhombicosidodecahedron", "TRIDIMINISHED_RHOMBICOSIDODECAHEDRON")},
}
# Already in lib/render/johnsonSolids.ts from the spherical developer.
SHIPPED = {72, 73, 76, 77, 80}


def vertex_census(V, faces):
    """The cyclic vertex configuration at every vertex, canonicalised up to rotation and reflection."""
    at = {}
    for f in faces:
        for v in f:
            at.setdefault(v, []).append(f)
    out = {}
    for v, fs in at.items():
        p = V[v]
        nl = math.dist(p, (0, 0, 0)) or 1.0
        e3 = [p[0] / nl, p[1] / nl, p[2] / nl]
        tmp = [1.0, 0.0, 0.0] if abs(e3[0]) < 0.9 else [0.0, 1.0, 0.0]
        e1 = [tmp[1] * e3[2] - tmp[2] * e3[1], tmp[2] * e3[0] - tmp[0] * e3[2], tmp[0] * e3[1] - tmp[1] * e3[0]]
        l1 = math.hypot(*e1) or 1.0
        e1 = [x / l1 for x in e1]
        e2 = [e3[1] * e1[2] - e3[2] * e1[1], e3[2] * e1[0] - e3[0] * e1[2], e3[0] * e1[1] - e3[1] * e1[0]]
        def ang(f):
            c = [sum(V[i][k] for i in f) / len(f) for k in range(3)]
            d = [c[k] - p[k] for k in range(3)]
            return math.atan2(sum(d[k] * e2[k] for k in range(3)), sum(d[k] * e1[k] for k in range(3)))
        word = [len(f) for f in sorted(fs, key=ang)]
        rots = []
        for w in (word, word[::-1]):
            for i in range(len(w)):
                rots.append(".".join(str(x) for x in w[i:] + w[:i]))
        key = sorted(rots)[0]
        out[key] = out.get(key, 0) + 1
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--emit-ts", action="store_true")
    args = ap.parse_args()
    rows = []
    for path in sorted(glob.glob(os.path.join(ROOT, "public", "spherical-poly", "*.json"))):
        if path.endswith("manifest.json"):
            continue
        blob = json.load(open(path))
        for r in (blob if isinstance(blob, list) else [blob]):
            if not isinstance(r, dict) or "faces" not in r:
                continue
            cen = vertex_census(r["vertices"], r["faces"])
            g = cen.get("3.4.4.5", 0) // 10
            d = cen.get("10.4.5", 0) // 10
            sym = (r.get("stats") or {}).get("symmetryOrder")
            # Only the 3.4.5.4 board is this family. The 3.4.3.4 and 3.4.4.4 boards are the
            # cuboctahedron's and the rhombicuboctahedron's, and every one of those records matched a
            # reference solid exactly — they are duplicates, not new members, and the shelf removal
            # handles them. Recognised by their vertex alphabet, not by their file name.
            if not set(cen) <= {"3.4.5.4", "3.4.4.5", "10.4.5"}:
                rows.append((None, None, None, r, "not a 3.4.5.4 solid: " + ", ".join(sorted(cen))))
                continue
            slot = BY_GD.get((g, d))
            if slot is None:
                rows.append((None, None, None, r, f"(g={g}, d={d}) is not a member of J72-J83"))
                continue
            pick = slot.get(sym, slot.get(None))
            if pick is None:
                rows.append((None, None, None, r, f"(g={g}, d={d}) symmetry {sym} matches no member"))
                continue
            j, name, ident = pick
            if j is None:
                rows.append((None, None, None, r, "the uniform rhombicosidodecahedron — already shipped"))
                continue
            rows.append((j, name, ident, r, None))
    rows.sort(key=lambda t: (t[0] is None, t[0] or 0))
    print("3.4.n.4 records read: %d" % len(rows))
    new = []
    for j, name, ident, r, why in rows:
        if why:
            print("   UNPLACED  %-16s %s" % (r["id"], why))
            continue
        mark = "  (already shipped)" if j in SHIPPED else "  NEW"
        print("   J%-3d %-46s V=%-3d F=%-3d sym=%-3s %s%s"
              % (j, name, len(r["vertices"]), len(r["faces"]), (r.get("stats") or {}).get("symmetryOrder"),
                 r["id"], mark))
        if j not in SHIPPED:
            new.append((j, name, ident, r))
    print("\nnew: %d" % len(new))
    if not args.emit_ts:
        return
    out = []
    for j, name, ident, r in new:
        cen = vertex_census(r["vertices"], r["faces"])
        cfg = " / ".join(k for k, _ in sorted(cen.items(), key=lambda kv: -kv[1]))
        out.append("\n// %s (J%d)  — from the spherical 3.4.n.4 shelf (develop_ai1_sph)\nexport const %s: Polyhedron = {\n"
                   "\tid: \"%s\",\n\tschlafli: [0, 0], // Johnson solid, no {p,q} — routing keys on id\n"
                   "\tvertexConfig: \"%s\",\n\tname: \"%s (J%d)\",\n\tvertices: [\n%s\t],\n\tfaces: [\n%s\t],\n};\n"
                   % (name, j, ident, ident.lower().replace("_", "-"), cfg, name, j,
                      "".join("\t\t[%.9f, %.9f, %.9f],\n" % tuple(v) for v in r["vertices"]),
                      "".join("\t\t[%s],\n" % ", ".join(str(i) for i in f) for f in r["faces"])))
    open(os.path.join(HERE, "johnson-rhombicosi.ts.part"), "w").write("".join(out))
    print("wrote johnson-rhombicosi.ts.part (%d solids)" % len(new))


if __name__ == "__main__":
    main()
