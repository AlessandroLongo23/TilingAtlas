#!/usr/bin/env python3
"""Develop Marek Čtrnáct's SPHERICAL colored-tiling certificates (3-colorings of the five Platonic
solids) into the atlas's three.js sphere records.

THE OBJECT. A periodic n-coloring of a Platonic solid {p,q}: every face is a real tile carrying one of
n colors, k counts COLORED vertex classes (vertices equivalent only under symmetries preserving the
coloring). This is the spherical twin of develop_hyp_colors.py: the colors class on the sphere, exactly
as develop_hyp_colors is that class in H². Same front end (develop_freedraw's Conway parser / VTable /
Block) and the same angle-driven vertex-table bridge (rotation order = 2π / Σ interior angles), but the
back end is develop_spherical's SO(3) flood-fill instead of SU(1,1): the finite deck group develops the
whole polyhedron.

WHAT SHIPS (self-contained, unlike the hyperbolic disk records which ship darts and re-develop): the
finished polyhedron — unit vertex positions, face rings, the color index per face, and the full edge
list for the grid overlay. buildSphColors (lib/render/sphColors.ts) draws it directly. Every face is a
tile boundary, so all edges are drawn.

The geometry helpers (regular_spherical_polygon / interior_angle / solve_rho / Rz / Medge) mirror
develop_spherical.py — copied, not imported, so this module does not drag pruner.py and its
palette install (both unused here; we develop the freedraw Block, not a pruned Čtrnáct quotient).

Usage:
    develop_sph_colors.py <cube-folder> --solid cube --out public/spherical-colors/cube
    develop_sph_colors.py <platonic-root> --all --out public/spherical-colors --surjective --report ...
    develop_sph_colors.py --selftest
"""
import argparse
import glob
import json
import math
import os
import re
import sys
import time
from collections import Counter, defaultdict

import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

import develop_freedraw as fd
from develop_freedraw import DevelopError
from develop_hyp_colors import COLOR_OF, LETTERS
from develop_hyp_edges import build_block, tile_size

TWO_PI = 2 * math.pi
TOL = 1e-6

# The five Platonic solids Marek has color solvers for. p = face size, q = faces per vertex.
SOLIDS = {
    "tetrahedron": {"p": 3, "q": 3, "label": "{3,3}"},
    "cube": {"p": 4, "q": 3, "label": "{4,3}"},
    "octahedron": {"p": 3, "q": 4, "label": "{3,4}"},
    "dodecahedron": {"p": 5, "q": 3, "label": "{5,3}"},
    "icosahedron": {"p": 3, "q": 5, "label": "{3,5}"},
}


# ---------------------------------------------------------------- spherical geometry (mirror of develop_spherical.py)
def regular_spherical_polygon(p, rho):
    s = math.sin(rho / 2.0) / math.sin(math.pi / p)
    if s > 1.0:
        return None
    r = math.asin(s)
    return np.array([[math.sin(r) * math.cos(2 * math.pi * k / p),
                      math.sin(r) * math.sin(2 * math.pi * k / p),
                      math.cos(r)] for k in range(p)])


def sph_interior_angle(p, rho):
    v = regular_spherical_polygon(p, rho)
    if v is None:
        return math.pi
    v0, v1, vm = v[0], v[1], v[p - 1]

    def tangent(a, b):
        t = b - np.dot(b, a) * a
        return t / np.linalg.norm(t)

    t1 = tangent(v0, v1)
    t2 = tangent(v0, vm)
    return math.acos(max(-1.0, min(1.0, np.dot(t1, t2))))


_RHO_CACHE = {}


def solve_rho(config):
    key = tuple(sorted(config))
    if key in _RHO_CACHE:
        return _RHO_CACHE[key]

    def f(rho):
        return sum(sph_interior_angle(p, rho) for p in config) - 2 * math.pi

    lo, hi = 1e-7, 2 * math.pi / max(config) - 1e-7
    if f(lo) >= 0 or f(hi) <= 0:
        _RHO_CACHE[key] = None
        return None
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if f(mid) > 0:
            hi = mid
        else:
            lo = mid
    _RHO_CACHE[key] = 0.5 * (lo + hi)
    return _RHO_CACHE[key]


def Rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def Medge(rho):
    c, s = math.cos(rho), math.sin(rho)
    return np.array([[-c, 0.0, s], [0.0, -1.0, 0.0], [s, 0.0, c]])


ZHAT = np.array([0.0, 0.0, 1.0])
XHAT = np.array([1.0, 0.0, 0.0])


def _key_pos(v):
    return (round(v[0] / TOL), round(v[1] / TOL), round(v[2] / TOL))


def _key_inst(h, R):
    pos = R @ ZHAT
    hx = R @ XHAT
    return (h, round(pos[0] / TOL), round(pos[1] / TOL), round(pos[2] / TOL),
            round(hx[0] / TOL), round(hx[1] / TOL), round(hx[2] / TOL))


# ---------------------------------------------------------------- angle-driven vertex tables (the bridge)
def vtable_variants_sph(figure, tag, units):
    """develop_hyp_edges.vtable_variants_hyp, restated for spherical angles: rotation order = 2π / Σ α,
    α per corner from the spherical alphabet. Identical logic — the geometry only changes the angle
    values fed in — so the Block/glue front end is untouched."""
    for c in figure:
        if c not in units:
            raise DevelopError(f"tile {c} not in the alphabet")
    s = sum(units[c] for c in figure)
    if s <= 1e-9:
        raise DevelopError(f"figure {figure} has zero angle sum")
    rotf = TWO_PI / s
    rotn = round(rotf)
    if rotn < 1 or abs(rotf - rotn) > 1e-5:
        raise DevelopError(f"figure {figure} angle sum does not divide 2π (rot={rotf:.6f})")
    t = len(figure)
    m = re.fullmatch(r"(F|C\d+|A[a-z0-9]*|D\d+[a-z]?)(x\d+)?", tag or "F")
    if not m:
        raise DevelopError(f"unrecognised site tag {tag!r}")
    head = m.group(1)
    if head == "F" or head.startswith("C"):
        if head.startswith("C") and int(head[1:]) != rotn:
            raise DevelopError(f"tag {tag} order != rotation order {rotn}")
        return [fd.VTable(figure, units, chiral=True)]
    if head.startswith("D") and int(re.match(r"D(\d+)", head).group(1)) != 2 * rotn:
        raise DevelopError(f"tag {tag} order != 2 × rotation order {rotn}")
    axes = [a for a in range(t) if all(figure[s2] == figure[(a - s2 - 1) % t] for s2 in range(t))]
    if not axes:
        raise DevelopError(f"tag {tag} claims a mirror but figure {figure} admits none")
    return [fd.VTable(figure, units, chiral=False, axis=a) for a in axes]


def build_block_sph(cert, units):
    variant_lists = [vtable_variants_sph(t["figure"], t["tag"], units) for t in cert["types"]]
    combos = [[]]
    for vl in variant_lists:
        combos = [c + [v] for c in combos for v in vl]
    out, reasons = [], []
    for tables in combos:
        try:
            out.append(fd.Block(cert, tables, "sph"))
        except DevelopError as e:
            reasons.append(str(e))
    return out, len(combos), reasons


def alphabet(solid, ncolors):
    p, q = solid["p"], solid["q"]
    rho = solve_rho([p] * q)
    if rho is None:
        raise DevelopError(f"{solid['label']} has no spherical vertex figure")
    ang = sph_interior_angle(p, rho)
    units = {f"{c}{p}": ang for c in LETTERS[:ncolors]}
    return rho, units


# ---------------------------------------------------------------- colored SO(3) develop
def develop_sphere_colored(block, rho, sign=1, guard=4000):
    """Flood-fill the instance orbit under {rneig, glue} in SO(3) (the mirror of
    develop_spherical.develop_sphere), also recording the color of each developed face. Returns
    (V, E, F, Fcolor)."""
    M = Medge(rho)
    n = len(block.rneig)
    lvert = [0] * n
    for h in range(n):
        lvert[block.rneig[h]] = tile_size(block.tile[h])
    ang = {}

    def alpha(h):
        p = lvert[block.rneig[h]]
        if p not in ang:
            ang[p] = sign * sph_interior_angle(p, rho)
        return ang[p]

    inst_id = {}
    inst = []  # (h, R, vid)
    vert_id = {}
    verts = []

    def vid_of(R):
        pos = R @ ZHAT
        pos = pos / np.linalg.norm(pos)
        key = _key_pos(pos)
        if key not in vert_id:
            vert_id[key] = len(verts)
            verts.append(pos)
        return vert_id[key]

    def get_inst(h, R):
        key = _key_inst(h, R)
        if key in inst_id:
            return inst_id[key], False
        idx = len(inst)
        inst_id[key] = idx
        inst.append((h, R, vid_of(R)))
        return idx, True

    seed, _ = get_inst(0, np.eye(3))
    stack = [seed]
    pops = 0
    while stack:
        pops += 1
        if pops > guard:
            raise DevelopError("flood-fill did not close within %d instances" % guard)
        idx = stack.pop()
        h, R, _ = inst[idx]
        ridx, isnew = get_inst(block.rneig[h], R @ Rz(alpha(h)))
        if isnew:
            stack.append(ridx)
        gidx, isnew = get_inst(block.glue[h], R @ M)
        if isnew:
            stack.append(gidx)

    V = [v for v in verts]
    E = set()
    for (h, R, vA) in inst:
        vB = vid_of(R @ M)
        if vA != vB:
            E.add((min(vA, vB), max(vA, vB)))

    F, Fcolor, seen = [], [], set()
    for start in range(len(inst)):
        if start in seen:
            continue
        ring, idx = [], start
        h0 = inst[start][0]
        ok = False
        for _ in range(guard):
            seen.add(idx)
            h, R, vA = inst[idx]
            ring.append(vA)
            nidx, isnew = get_inst(block.glue[block.rneig[h]], R @ Rz(alpha(h)) @ M)
            if isnew:
                raise DevelopError("face trace escaped the closed instance set")
            idx = nidx
            if idx == start:
                ok = True
                break
        if not ok:
            raise DevelopError("face did not close")
        F.append(ring)
        Fcolor.append(COLOR_OF[block.tile[h0][0]])
    return V, E, F, Fcolor


def check_realized(V, E, F, tol=1e-4):
    """Euler χ=2, all edges equal length, all faces regular (equal edges + coplanar)."""
    euler = len(V) - len(E) + len(F)
    Vn = [np.asarray(v) for v in V]
    elens = [np.linalg.norm(Vn[a] - Vn[b]) for (a, b) in E]
    if not elens:
        return False, {"error": "no edges"}
    emean = sum(elens) / len(elens)
    edgeCV = (max(abs(e - emean) for e in elens) / emean) if emean else 1.0
    worst_plane, worst_face_cv = 0.0, 0.0
    for ring in F:
        pts = np.array([Vn[i] for i in ring])
        c = pts.mean(axis=0)
        _, _, vh = np.linalg.svd(pts - c)
        worst_plane = max(worst_plane, float(np.max(np.abs((pts - c) @ vh[2]))))
        fe = [np.linalg.norm(pts[i] - pts[(i + 1) % len(pts)]) for i in range(len(pts))]
        fm = sum(fe) / len(fe)
        if fm:
            worst_face_cv = max(worst_face_cv, max(abs(e - fm) for e in fe) / fm)
    res = {"euler": euler, "edgeCV": edgeCV, "planarity": worst_plane, "faceEdgeCV": worst_face_cv,
           "verts": len(V), "edges": len(E), "faces": len(F)}
    ok = (euler == 2 and edgeCV < tol and worst_plane < tol and worst_face_cv < tol)
    return ok, res


# ---------------------------------------------------------------- one certificate -> one record
def develop_cert(cert, solid, rho, units):
    blocks, ncombo, reasons = build_block_sph(cert, units)
    if not blocks:
        return None, "glue: " + "; ".join(sorted(set(reasons))[:2]), ncombo
    for block in blocks:
        for sign in (1, -1):
            try:
                V, E, F, Fc = develop_sphere_colored(block, rho, sign=sign)
            except DevelopError as e:
                reasons.append(str(e))
                continue
            ok, res = check_realized(V, E, F)
            if not ok:
                reasons.append("not regular: %r" % res)
                continue
            census = Counter(Fc)
            rec = {
                "k": cert.get("k"),
                "solid": solid["id"],
                "config": solid["label"],
                "colors": len(units),
                "vertices": [[round(float(x), 8) for x in v] for v in V],
                "faces": [list(map(int, ring)) for ring in F],
                "faceColor": [int(c) for c in Fc],
                "edges": [[int(a), int(b)] for (a, b) in sorted(E)],
                "stats": {
                    "faceOrbits": len(F),
                    "colorsUsed": len(census),
                    "colorCensus": [census.get(c, 0) for c in range(len(units))],
                },
                "residual": {"edgeCV": res["edgeCV"], "planarity": res["planarity"]},
            }
            return rec, None, ncombo
    return None, "develop: " + "; ".join(sorted(set(reasons))[:2]), ncombo


# ---------------------------------------------------------------- driver
CERT_NAME = re.compile(r"^(?P<fam>.+)solver_(?P<k>\d+)_(?P<tok>[A-Z0-9]+)(?P<chir>_o)?_(?P<n>\d+)\.txt$")


def run_solid(source, solid_id, out_prefix, ncolors=3, surjective=False, limit=None):
    solid = {**SOLIDS[solid_id], "id": solid_id}
    rho, units = alphabet(solid, ncolors)
    paths = sorted(glob.glob(os.path.join(source, "*.txt"))) if os.path.isdir(source) else [source]
    by_k = defaultdict(list)
    failures = Counter()
    fail_examples = {}
    n_certs = 0
    dropped = 0
    for path in paths:
        m = CERT_NAME.match(os.path.basename(path))
        if not m:
            continue
        k = int(m.group("k"))
        chiral = bool(m.group("chir"))
        for cert in fd.parse_file(path):
            if limit and n_certs >= limit:
                break
            n_certs += 1
            rec, err, _ = develop_cert(cert, solid, rho, units)
            if rec is None:
                failures[err.split(":")[0]] += 1
                fail_examples.setdefault(err.split(":")[0], err)
                continue
            if surjective and rec["stats"]["colorsUsed"] != ncolors:
                dropped += 1
                continue
            rec["chiral"] = chiral
            by_k[k].append(rec)

    written = []
    for k in sorted(by_k):
        recs = by_k[k]
        for i, r in enumerate(recs, start=1):
            r["id"] = f"sc{solid_id[:3]}-{k}-{i:05d}"
            r["name"] = r["id"]
        if out_prefix:
            os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)
            path = f"{out_prefix}-k{k}.json"
            with open(path, "w") as fh:
                json.dump(recs, fh, separators=(",", ":"))
            written.append((path, len(recs), os.path.getsize(path)))
    return solid, rho, by_k, failures, fail_examples, n_certs, dropped, written


def run(source, out_dir, solid_ids, ncolors=3, surjective=False, report_path=None, limit=None):
    lines = []
    t0 = time.time()
    total = 0
    for sid in solid_ids:
        folder = source
        # in --all mode, source is the platonic root; find the solid's own subfolder
        if not glob.glob(os.path.join(source, "*.txt")):
            cand = glob.glob(os.path.join(source, f"solver_{sid}_*colors")) or [os.path.join(source, sid)]
            folder = cand[0]
        out_prefix = os.path.join(out_dir, sid) if out_dir else None
        solid, rho, by_k, failures, fex, n_certs, dropped, written = run_solid(
            folder, sid, out_prefix, ncolors, surjective, limit)
        n = sum(len(v) for v in by_k.values())
        total += n
        lines.append(f"── {solid['label']} ({sid}), rho={rho:.9f}: {n} colorings from {n_certs} certs"
                     + (f", dropped {dropped} non-surjective" if surjective else ""))
        for reason, c in failures.most_common():
            lines.append(f"     fail x{c}: {reason}   e.g. {fex.get(reason, '')[:90]}")
        for k in sorted(by_k):
            cu = Counter(r["stats"]["colorsUsed"] for r in by_k[k])
            lines.append(f"     k={k}: {len(by_k[k])} colorings  colors-used {dict(sorted(cu.items()))}")
        for path, cnt, sz in written:
            lines.append(f"     wrote {os.path.basename(path)}: {cnt} recs, {sz / 1e6:.2f} MB")
    lines.append(f"total {total} colorings across {len(solid_ids)} solids in {time.time() - t0:.1f}s")
    report = "\n".join(lines) + "\n"
    if report_path:
        os.makedirs(os.path.dirname(report_path) or ".", exist_ok=True)
        open(report_path, "w").write(report)
    print(report)


def _selftest():
    for sid in SOLIDS:
        solid = {**SOLIDS[sid], "id": sid}
        rho, units = alphabet(solid, 3)
        p, q = solid["p"], solid["q"]
        ang = sph_interior_angle(p, rho)
        assert abs(q * ang - TWO_PI) < 1e-8, f"{solid['label']} vertex does not close"
        print(f"[selftest] {sid:13s} {solid['label']}: rho={rho:.6f}, {p}-gon angle {math.degrees(ang):.3f}deg")
    # geometry sanity: cube square spherical angle is 120°
    assert abs(sph_interior_angle(4, solve_rho([4, 4, 4])) - TWO_PI / 3) < 1e-6
    print("[selftest] PASS")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?")
    ap.add_argument("--solid", choices=sorted(SOLIDS))
    ap.add_argument("--all", action="store_true", help="decode every solid; source is the platonic root")
    ap.add_argument("--colors", type=int, default=3)
    ap.add_argument("--out", help="output DIRECTORY; writes <solid>-k<k>.json")
    ap.add_argument("--report")
    ap.add_argument("--surjective", action="store_true")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
        return
    if not args.source:
        ap.error("source is required unless --selftest")
    solid_ids = sorted(SOLIDS) if args.all else [args.solid]
    if solid_ids == [None]:
        ap.error("--solid or --all is required")
    run(args.source, args.out, solid_ids, args.colors, args.surjective, args.report, args.limit)


if __name__ == "__main__":
    main()
