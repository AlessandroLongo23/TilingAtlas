#!/usr/bin/env python3
"""Develop Marek Čtrnáct's decoded k=1 SPHERICAL (positive-defect) quotient half-edge structures
into actual polyhedra on S², to prove the engine works end to end on the sphere.

This is the spherical sibling of develop.py. It reuses pruner.decode() for the (geometry-free)
quotient half-edge arrays, then replaces develop.py's Euclidean placement (ℤ[ζ₁₂] translations +
translation lattice) with an SO(3) geodesic flood-fill:

  * A developed dart is an instance (quotient dart h, frame R ∈ SO(3)); vertex pos = R·ẑ.
  * rneig around a vertex advances the frame by the spherical interior angle: R·Rz(α).
  * glue across an edge advances by the fixed edge rotation M(ρ) (an involution, M²=I).
  * ρ (edge arc-length) is solved from the k=1 vertex-closure Σ_i angle_{p_i}(ρ) = 2π, which is
    exactly the positive-defect (spherical) condition; the star then closes since Rz(2π)=I.

Enumerating the instance orbit under {rneig, glue} builds the finite polyhedron (finite because
the frame group is the solid's rotation group). Realizability = the flood-fill closes (bounded,
Euler χ=2) and every developed face is a regular polygon. A block that fails is reported
non-realizable, never silently dropped.

Output: spherical-cells-k1.json = [{id, vertexConfig, vertices:[[x,y,z]], faces:[[i]], realized,
residual}], plus a report. Validation artifact only — the atlas render layer is untouched.

Usage:  python3 develop_spherical.py --pruned <dir> --out <cells.json> --report <report.txt>
        python3 develop_spherical.py --selftest
"""
import os, sys, glob, json, argparse, math
import numpy as np

TOL = 1e-6

# ----------------------------------------------------------------------------- pruner import
# Reuse pruner.decode() exactly as develop.py does (folds a conway block into the quotient
# half-edge arrays). The dedup/compare path is never called.
_HERE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("EU_KMIN", "1")
os.environ.setdefault("EU_KMAX", "0")
os.environ.setdefault("EU_QUIET", "1")
os.environ.setdefault("EU_OUT", os.path.join(_HERE, "_import_scratch"))
import importlib.util
_spec = importlib.util.spec_from_file_location("pr", os.path.join(_HERE, "pruner.py"))
pr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pr)

def install_palette(palette):
    """Swap pruner.py's hardcoded REGULAR vertexdef tables for the generated <palette> ones
    (tables/<palette>/tables.py). pr.decode()'s makeglue/buildvertextypes are palette-agnostic;
    only the six per-vertexdef arrays it reads need to match the palette."""
    tpath = os.path.join(_HERE, "tables", palette, "tables.py")
    ts = importlib.util.spec_from_file_location("_tab_" + palette, tpath)
    tm = importlib.util.module_from_spec(ts)
    ts.loader.exec_module(tm)
    pr.symbollist = list(tm.SYMBOLS)
    pr.labellistin = [list(x) for x in tm.LABELS]
    pr.lneiglistin = [list(x) for x in tm.LNEIG]
    pr.rneiglistin = [list(x) for x in tm.RNEIG]
    pr.mirrolistin = [list(x) for x in tm.MIRRO]
    pr.lvertlistin = [[int(tm.CLASS_DISP[c]) for c in row] for row in tm.CLS]
    return tm

install_palette("spherical")

# ----------------------------------------------------------------------------- spherical geometry
def regular_spherical_polygon(p, rho):
    """p unit vectors of a regular spherical p-gon with edge arc-length rho, centred on ẑ.
    Circumradius r from sin(rho/2) = sin(r)·sin(pi/p). Returns None if rho too large for p."""
    s = math.sin(rho / 2.0) / math.sin(math.pi / p)
    if s > 1.0:
        return None
    r = math.asin(s)
    return np.array([[math.sin(r) * math.cos(2 * math.pi * k / p),
                      math.sin(r) * math.sin(2 * math.pi * k / p),
                      math.cos(r)] for k in range(p)])

def interior_angle(p, rho):
    """Interior angle (radians) of a regular spherical p-gon with edge arc-length rho."""
    v = regular_spherical_polygon(p, rho)
    if v is None:
        return math.pi  # degenerate upper bound
    v0, v1, vm = v[0], v[1], v[p - 1]
    def tangent(a, b):
        t = b - np.dot(b, a) * a
        return t / np.linalg.norm(t)
    t1 = tangent(v0, v1)
    t2 = tangent(v0, vm)
    return math.acos(max(-1.0, min(1.0, np.dot(t1, t2))))

def solve_rho(config):
    """Edge arc-length rho solving Σ_i interior_angle(p_i, rho) = 2π (positive-defect closure).
    Monotone increasing in rho; root exists iff Σ flat angles < 2π (the spherical condition)."""
    def f(rho):
        return sum(interior_angle(p, rho) for p in config) - 2 * math.pi
    lo, hi = 1e-7, 2 * math.pi / max(config) - 1e-7
    if f(lo) >= 0 or f(hi) <= 0:
        return None
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if f(mid) > 0:
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)

# ----------------------------------------------------------------------------- SO(3) frames
def Rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])

def Medge(rho):
    """Edge-crossing rotation: dart (vertex A, heading→B) → glued dart (vertex B, heading→A).
    M² = I (involution)."""
    c, s = math.cos(rho), math.sin(rho)
    return np.array([[-c, 0.0, s], [0.0, -1.0, 0.0], [s, 0.0, c]])

ZHAT = np.array([0.0, 0.0, 1.0])
XHAT = np.array([1.0, 0.0, 0.0])

# ----------------------------------------------------------------------------- developer
class DevelopError(Exception):
    pass

def _key_pos(v):
    return (round(v[0] / TOL), round(v[1] / TOL), round(v[2] / TOL))

def _key_inst(h, R):
    pos = R @ ZHAT
    hx = R @ XHAT
    return (h, round(pos[0] / TOL), round(pos[1] / TOL), round(pos[2] / TOL),
            round(hx[0] / TOL), round(hx[1] / TOL), round(hx[2] / TOL))

def develop_sphere(rneig, glue, lvert, rho, sign=1, guard=200000):
    """Flood-fill the instance orbit under {rneig, glue}. Returns (V, E, F) with V a list of
    unit positions, E a set of undirected vertex-id pairs, F a list of vertex-id rings."""
    M = Medge(rho)
    ang = {}  # cache interior angle per polygon size

    def alpha(hdart):
        p = lvert[rneig[hdart]]
        if p not in ang:
            ang[p] = sign * interior_angle(p, rho)
        return ang[p]

    # instance dedup + vertex dedup
    inst_id = {}          # key_inst -> compact instance index
    inst_data = []        # (h, R)
    vert_id = {}          # key_pos -> vertex id
    verts = []            # unit positions

    def vid_of(R):
        pos = R @ ZHAT
        pos = pos / np.linalg.norm(pos)
        k = _key_pos(pos)
        if k not in vert_id:
            vert_id[k] = len(verts)
            verts.append(pos)
        return vert_id[k]

    def get_inst(h, R):
        k = _key_inst(h, R)
        if k in inst_id:
            return inst_id[k], False
        idx = len(inst_data)
        inst_id[k] = idx
        inst_data.append((h, R, vid_of(R)))
        return idx, True

    seed, _ = get_inst(0, np.eye(3))
    stack = [seed]
    pops = 0
    while stack:
        pops += 1
        if pops > guard:
            raise DevelopError("flood-fill did not close within %d instances" % guard)
        idx = stack.pop()
        h, R, _ = inst_data[idx]
        # rneig neighbour (same vertex, next dart around)
        ridx, isnew = get_inst(rneig[h], R @ Rz(alpha(h)))
        if isnew:
            stack.append(ridx)
        # glue neighbour (across the edge)
        gidx, isnew = get_inst(glue[h], R @ M)
        if isnew:
            stack.append(gidx)

    # vertices
    V = [v for v in verts]
    # edges: glue-orbit {inst, glue(inst)} -> undirected vertex pair
    E = set()
    for (h, R, vA) in inst_data:
        Rg = R @ M
        vB = vid_of(Rg)
        if vA != vB:
            E.add((min(vA, vB), max(vA, vB)))
    # faces: orbits of F(h,R) = (glue[rneig[h]], R·Rz(alpha)·M)
    F = []
    seen_face = set()
    for start in range(len(inst_data)):
        if start in seen_face:
            continue
        ring = []
        idx = start
        for _ in range(guard):
            seen_face.add(idx)
            h, R, vA = inst_data[idx]
            ring.append(vA)
            Rn = R @ Rz(alpha(h)) @ M
            nidx, isnew = get_inst(glue[rneig[h]], Rn)
            if isnew:
                # face left the enumerated instance set -> non-closure
                raise DevelopError("face trace escaped the closed instance set")
            idx = nidx
            if idx == start:
                break
        else:
            raise DevelopError("face did not close")
        F.append(ring)
    return V, E, F

# ----------------------------------------------------------------------------- verification
def check_realized(V, E, F, tol=1e-4):
    """(ok, residual). Euler χ=2, all edges equal length, all faces regular (equal edges + coplanar)."""
    res = {}
    euler = len(V) - len(E) + len(F)
    res["euler"] = euler
    Vn = [np.asarray(v) for v in V]
    elens = [np.linalg.norm(Vn[a] - Vn[b]) for (a, b) in E]
    if not elens:
        return False, {"error": "no edges"}
    emean = sum(elens) / len(elens)
    res["edgeCV"] = (max(abs(e - emean) for e in elens) / emean) if emean else 1.0
    # face regularity: each face's edges equal + coplanar
    worst_plane = 0.0
    worst_face_cv = 0.0
    for ring in F:
        pts = np.array([Vn[i] for i in ring])
        c = pts.mean(axis=0)
        # best-fit plane normal via SVD
        _, _, vh = np.linalg.svd(pts - c)
        n = vh[2]
        worst_plane = max(worst_plane, float(np.max(np.abs((pts - c) @ n))))
        fe = [np.linalg.norm(pts[i] - pts[(i + 1) % len(pts)]) for i in range(len(pts))]
        fm = sum(fe) / len(fe)
        if fm:
            worst_face_cv = max(worst_face_cv, max(abs(e - fm) for e in fe) / fm)
    res["planarity"] = worst_plane
    res["faceEdgeCV"] = worst_face_cv
    ok = (euler == 2 and res["edgeCV"] < tol and worst_plane < tol and worst_face_cv < tol)
    return ok, res

# ----------------------------------------------------------------------------- block IO (as develop.py)
def read_blocks(path):
    blocks, buf = [], []
    for raw in open(path):
        if raw.strip() == "":
            if buf:
                blocks.append(buf); buf = []
        else:
            buf.append(raw.rstrip("\n"))
    if buf:
        blocks.append(buf)
    return blocks

def tes_id(tes):
    parts = tes.split("/")
    nn_fam = parts[1]; filesig = parts[2]
    n = parts[3].rsplit(" ", 1)[1].replace(".tes", "")
    return "ctrnact-%s-%s-%s" % (nn_fam, filesig.replace(" ", "_"), n)

def parse_config(vertypeline):
    import re
    m = re.match(r"\(([0-9,]+)\)", vertypeline)
    return [int(x) for x in m.group(1).split(",")]

def decode_block(b):
    """Reuse pruner.decode() -> copies of the quotient arrays + the vertex config."""
    pr.decode(b[0] + "\n", b[1] + "\n", b[3] + "\n", b[4] + "\n")
    return {
        "rneig": list(pr.rneig), "glue": list(pr.glue), "lvert": list(pr.lvert),
        "config": parse_config(b[0]),
        "id": tes_id([l for l in b if l.startswith("TES file:")][0].split(":", 1)[1].strip()),
    }

def develop_block(b):
    dec = decode_block(b)
    config = dec["config"]
    rho = solve_rho(config)
    if rho is None:
        return None, {"id": dec["id"], "config": config, "reason": "no spherical vertex figure"}
    for sign in (1, -1):
        try:
            V, E, F = develop_sphere(dec["rneig"], dec["glue"], dec["lvert"], rho, sign=sign)
        except DevelopError as e:
            last = str(e)
            continue
        ok, res = check_realized(V, E, F)
        if ok:
            rec = {
                "id": dec["id"], "vertexConfig": ".".join(map(str, config)),
                "vertices": [[float(x) for x in v] for v in V],
                "faces": [list(map(int, ring)) for ring in F],
                "realized": True, "residual": res,
            }
            return rec, None
        last = "not regular: %r" % res
    return None, {"id": dec["id"], "config": config, "reason": last}

# ----------------------------------------------------------------------------- driver
def gather_blocks(pruned, kmin, kmax):
    out = []
    for k in range(kmin, kmax + 1):
        cand = set(glob.glob(os.path.join(pruned, "eupruned_%02d_*.txt" % k)))
        cand |= set(glob.glob(os.path.join(pruned, "eupruned_%d_*.txt" % k)))
        cand.add(os.path.join(pruned, "eupruned_%02d.txt" % k))
        cand.add(os.path.join(pruned, "eupruned_%d.txt" % k))
        for f in sorted(p for p in cand if os.path.exists(p)):
            for b in read_blocks(f):
                if any(l.startswith("TES file:") for l in b):
                    out.append(b)
    return out

def run(pruned, out_path, report_path, kmin=1, kmax=1):
    blocks = gather_blocks(pruned, kmin, kmax)
    records, failed = [], []
    for b in blocks:
        rec, err = develop_block(b)
        if rec:
            records.append(rec)
        else:
            failed.append(err)
    # geometric-duplicate audit: group realized records by invariant signature
    sig = {}
    for r in records:
        V = len(r["vertices"]); F = len(r["faces"])
        Eset = set()
        for ring in r["faces"]:
            for i in range(len(ring)):
                a, c = ring[i], ring[(i + 1) % len(ring)]
                Eset.add((min(a, c), max(a, c)))
        fmulti = tuple(sorted(len(ring) for ring in r["faces"]))
        key = ("".join(sorted(r["vertexConfig"])), V, len(Eset), F, fmulti)
        sig.setdefault(key, []).append(r["id"])
    dups = {k: v for k, v in sig.items() if len(v) > 1}
    records.sort(key=lambda r: (len(r["vertices"]), r["id"]))
    if out_path:
        json.dump(records, open(out_path, "w"))
    lines = []
    lines.append("spherical develop report (k=%d..%d)" % (kmin, kmax))
    lines.append("blocks in      : %d" % len(blocks))
    lines.append("realized       : %d" % len(records))
    lines.append("non-realizable : %d" % len(failed))
    for e in failed:
        lines.append("   - %s  config=%s  reason=%s" % (e["id"], e.get("config"), e["reason"]))
    lines.append("duplicate groups (same invariants): %d" % len(dups))
    for k, ids in dups.items():
        lines.append("   - %s : %s" % (k, ids))
    report = "\n".join(lines) + "\n"
    if report_path:
        open(report_path, "w").write(report)
    print(report)
    return records, failed, dups

# ----------------------------------------------------------------------------- selftest
def _selftest():
    # geometry: cube vertex config [4,4,4] -> square spherical interior angle 120°
    rho = solve_rho([4, 4, 4])
    assert rho is not None, "cube rho failed"
    a = interior_angle(4, rho)
    assert abs(a - 2 * math.pi / 3) < 1e-6, "cube square angle %f != 120°" % math.degrees(a)
    assert abs(sum(interior_angle(p, rho) for p in [4, 4, 4]) - 2 * math.pi) < 1e-9
    # Euclidean config has no positive-defect root
    assert solve_rho([6, 6, 6]) is None, "6.6.6 should be Euclidean (no spherical figure)"
    assert solve_rho([4, 4, 4, 4]) is None, "4.4.4.4 should be Euclidean"
    # edge involution
    M = Medge(rho)
    assert np.allclose(M @ M, np.eye(3)), "M not involution"
    print("[selftest] geometry + rho solver OK (cube rho=%.6f)" % rho)
    # develop the three smallest solids from real pruned blocks if available
    fixtures = os.environ.get("SPH_FIXTURES", os.path.join(_HERE, "run-k1-spherical", "out", "pruned"))
    targets = {"(3,3,3)": (4, 6, 4), "(4,4,4)": (8, 12, 6), "(3,3,3,3)": (6, 12, 8)}
    if os.path.isdir(fixtures):
        got = {}
        for b in gather_blocks(fixtures, 1, 1):
            cfg = b[0]
            if cfg.split(")")[0] + ")" in targets:
                rec, err = develop_block(b)
                assert rec, "develop failed for %s: %s" % (cfg, err)
                V = len(rec["vertices"]); F = len(rec["faces"])
                Eset = set()
                for ring in rec["faces"]:
                    for i in range(len(ring)):
                        x, y = ring[i], ring[(i + 1) % len(ring)]
                        Eset.add((min(x, y), max(x, y)))
                got[cfg.split(")")[0] + ")"] = (V, len(Eset), F)
        for t, exp in targets.items():
            assert got.get(t) == exp, "%s: got %s want %s" % (t, got.get(t), exp)
            print("[selftest] %-10s -> V,E,F = %s  OK" % (t, got[t]))
    else:
        print("[selftest] (no pruned fixtures at %s; skipped develop checks)" % fixtures)
    print("[selftest] PASS")

# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pruned", default="run-k1-spherical/out/pruned")
    ap.add_argument("--out", default=None)
    ap.add_argument("--report", default=None)
    ap.add_argument("--kmin", type=int, default=1)
    ap.add_argument("--kmax", type=int, default=1)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
        return
    run(args.pruned, args.out, args.report, args.kmin, args.kmax)

if __name__ == "__main__":
    main()
