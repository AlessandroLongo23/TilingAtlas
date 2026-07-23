#!/usr/bin/env python3
"""Develop Marek Čtrnáct's decoded k-uniform HYPERBOLIC (negative-defect) quotient half-edge structures
into an explicit Poincaré-disk patch. The hyperbolic sibling of develop_spherical.py.

Same combinatorial front end (pruner.decode folds a conway block into the quotient {rneig, glue, lvert}
arrays); only the geometry back end changes:

  * A developed dart is an instance (quotient dart h, frame G ∈ SU(1,1)); vertex pos = G·0 = b/ā.
  * rneig around a vertex advances the frame by the hyperbolic interior angle: G·Rot(α),
    α(p,ℓ) = 2·asin(cos(π/n)/cosh(ℓ/2)) — the same formula lib/render/hyperbolicDevelop.ts uses.
  * glue across an edge advances by the edge involution Medge(ℓ) = T(ℓ)·Rot(π), M² = I on the disk.
  * ℓ is the FORCED edge length: the ℓ with Σ α(pᵢ,ℓ) = 2π (negative-defect closure). For k>1 all orbits
    must share one ℓ, else the block cannot realize at a single edge length.

Unlike the sphere the hyperbolic plane never closes, so the flood-fill is bounded by a disk radius and
yields a finite PATCH (not a closed surface). Realizability here means the developing map immerses
without contradiction on that patch: every developed vertex closes (Σα=2π, by ℓ), every face is a regular
polygon of edge ℓ, and no two distinct quotient darts collide at one frame (an overlap/fold). Output is a
patch JSON {id, vertexConfig, k, edgeLength, vertices:[[x,y]…], faces:[[…]]} for the TS renderer.

Usage:  python3 develop_hyperbolic.py --pruned <dir> --out <patch.json> --report <report.txt> [--boundR 0.9]
"""
import os, sys, glob, json, argparse, math, cmath
import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

# Reuse the spherical developer's decode scaffolding (pruner.decode wiring, block IO), then point the
# palette tables at the hyperbolic alphabet. install_palette mutates pruner's globals, so re-calling it
# after import overrides the spherical default the module set at import time.
import develop_spherical as ds
ds.install_palette("hyperbolic")  # default; main() re-installs per --palette so custom alphabets decode

TOL = 1e-4       # position dedup grid
ANGTOL = 1e-3    # heading dedup grid
TWO_PI = 2 * math.pi


# ----------------------------------------------------------------------------- hyperbolic geometry
def interior_angle(p, l):
    """Interior angle of a regular p-gon of edge length l in H² (p=inf → apeirogon: cos(π/∞)=1)."""
    r = math.cos(math.pi / p) / math.cosh(l / 2)
    return 2 * math.asin(min(1.0, max(-1.0, r)))


def euclid_sum(cfg):
    return sum(math.pi if n == 0 else math.pi * (n - 2) / n for n in cfg)  # n==0 sentinel = apeirogon


def solve_edge_length(cfg, tol=1e-13):
    """The ℓ>0 with Σ α(nᵢ,ℓ)=2π, or None when the config is not hyperbolic (Euclidean sum ≤ 2π)."""
    if euclid_sum(cfg) <= TWO_PI + 1e-12:
        return None
    f = lambda l: sum(interior_angle(n, l) for n in cfg) - TWO_PI
    lo, hi = 0.0, 1.0
    while f(hi) > 0:
        hi *= 2
        if hi > 1e7:
            return None
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if f(mid) > 0:
            lo = mid
        else:
            hi = mid
        if hi - lo < tol:
            break
    return 0.5 * (lo + hi)


def solve_edge_common(configs, tol=1e-6):
    """One shared ℓ for all orbit configs (k>1), or None if they close at different lengths."""
    ls = [solve_edge_length(c) for c in configs]
    if any(l is None for l in ls):
        return None
    if max(ls) - min(ls) > tol:
        return None
    return sum(ls) / len(ls)


# ----------------------------------------------------------------------------- SU(1,1) frames (2×2 ℂ)
def rot(theta):
    return np.array([[cmath.exp(1j * theta / 2), 0], [0, cmath.exp(-1j * theta / 2)]], dtype=complex)


def medge(l):
    """Edge involution: dart (vertex A, heading→B) → glued dart (vertex B, heading→A). T(ℓ)·Rot(π),
    M² = −I ≡ identity on the disk."""
    c, s = math.cosh(l / 2), math.sinh(l / 2)
    T = np.array([[c, s], [s, c]], dtype=complex)
    return T @ rot(math.pi)


_ID2 = np.eye(2, dtype=complex)


def _pos(G):
    return G[0, 1] / G[1, 1]  # Möbius image of 0: b/ā


def _heading(G):
    return 2 * cmath.phase(G[0, 0])  # local rotation of the frame at 0 = arg(1/ā²) = 2·arg(a)


class DevelopError(Exception):
    pass


def develop_patch(rneig, glue, lvert, l, boundR=0.9, guard=200000):
    """Flood-fill the instance orbit under {rneig, glue} within the disk of radius boundR. Builds EXPLICIT
    neighbour-index arrays (rn[i], gl[i]) on the developed instances during the fill, so face tracing walks
    indices instead of re-keying floating-point frames (which drifts at the dedup-grid boundary and drops
    faces). Returns (verts, edges, faces): verts=[(x,y)…], edges=set of undirected vid pairs, faces=list of
    vid rings that close INSIDE the patch."""
    Med = medge(l)
    angc = {}

    def alpha(h):
        p = lvert[rneig[h]]
        if p not in angc:
            angc[p] = interior_angle(p, l)
        return angc[p]

    inst_id = {}
    H, Gs, VID, RN, GL = [], [], [], [], []
    vert_id = {}
    verts = []

    def vid_of(G):
        z = _pos(G)
        k = (round(z.real / TOL), round(z.imag / TOL))
        if k not in vert_id:
            vert_id[k] = len(verts)
            verts.append((z.real, z.imag))
        return vert_id[k]

    def add_inst(h, G):
        z = _pos(G)
        th = _heading(G)  # key the heading by (cos, sin), not the raw angle: 2·arg(a) wraps at ±2π and a
        # seam between 0 and 2π would split one dart into two and double every face.
        k = (h, round(z.real / TOL), round(z.imag / TOL),
             round(math.cos(th) / ANGTOL), round(math.sin(th) / ANGTOL))
        if k in inst_id:
            return inst_id[k], False
        idx = len(H)
        inst_id[k] = idx
        H.append(h); Gs.append(G); VID.append(vid_of(G)); RN.append(-1); GL.append(-1)
        return idx, True

    seed, _ = add_inst(0, _ID2.copy())
    stack = [seed]
    pops = 0
    while stack:
        pops += 1
        if pops > guard:
            raise DevelopError("patch exceeded guard %d (raise or lower boundR)" % guard)
        idx = stack.pop()
        h, G = H[idx], Gs[idx]
        if abs(_pos(G)) > boundR:
            continue  # record but do not expand past the patch bound
        ridx, isnew = add_inst(rneig[h], G @ rot(alpha(h)))
        RN[idx] = ridx
        if isnew:
            stack.append(ridx)
        gidx, isnew = add_inst(glue[h], G @ Med)
        GL[idx] = gidx
        if isnew:
            stack.append(gidx)

    # edges: each instance's glue neighbour is the other end of its edge
    E = set()
    for i in range(len(H)):
        g = GL[i]
        if g >= 0 and VID[i] != VID[g]:
            E.add((min(VID[i], VID[g]), max(VID[i], VID[g])))

    # faces: the next dart around a face is gl[rn[i]] (turn to the next dart at the vertex, cross its edge).
    F = []
    seen_ring = set()
    for start in range(len(H)):
        ring = []
        idx = start
        ok = False
        for _ in range(64):
            ring.append(VID[idx])
            r = RN[idx]
            nxt = GL[r] if r >= 0 else -1
            if nxt < 0:
                break  # face escapes the patch (incomplete boundary face)
            idx = nxt
            if idx == start:
                ok = True
                break
        if not ok or len(ring) < 3:
            continue
        canon = min(tuple(ring[i:] + ring[:i]) for i in range(len(ring)))
        if canon in seen_ring:
            continue
        seen_ring.add(canon)
        F.append(ring)
    return verts, E, F


# ----------------------------------------------------------------------------- verification
def check_patch(verts, E, F, l, tol=1e-3):
    """(ok, res). Every developed edge has length ℓ; every closed face is a regular polygon of edge ℓ;
    the patch is inside the disk. Not a closed-surface check (Euler) — this is a bounded patch."""
    res = {}
    V = [complex(x, y) for (x, y) in verts]

    def hdist(u, v):
        num = abs(u - v) ** 2
        den = (1 - abs(u) ** 2) * (1 - abs(v) ** 2)
        return math.acosh(1 + 2 * num / den) if den > 1e-15 else 0.0

    elens = [hdist(V[a], V[b]) for (a, b) in E]
    if not elens:
        return False, {"error": "no edges"}
    res["edgeMax"] = max(elens)
    res["edgeMin"] = min(elens)
    res["edgeErr"] = max(abs(e - l) for e in elens)
    worst_face = 0.0
    for ring in F:
        fe = [hdist(V[ring[i]], V[ring[(i + 1) % len(ring)]]) for i in range(len(ring))]
        worst_face = max(worst_face, max(abs(e - l) for e in fe))
    res["faceEdgeErr"] = worst_face
    res["inDisk"] = max(abs(z) for z in V) < 1.0
    ok = res["edgeErr"] < tol and worst_face < tol and res["inDisk"]
    return ok, res


# ----------------------------------------------------------------------------- block develop + driver
def develop_block(b, boundR=0.9):
    dec = ds.decode_block(b)
    configs = dec["configs"]
    cfg_str = " + ".join(".".join(map(str, c)) for c in configs)
    l = solve_edge_common(configs)
    if l is None:
        reason = ("not hyperbolic (Euclidean angle sum ≤ 2π)" if any(solve_edge_length(c) is None for c in configs)
                  else "no common edge length (orbit configs close at different ℓ)")
        return None, {"id": dec["id"], "config": cfg_str, "reason": reason}
    try:
        verts, E, F = develop_patch(dec["rneig"], dec["glue"], dec["lvert"], l, boundR=boundR)
    except DevelopError as e:
        return None, {"id": dec["id"], "config": cfg_str, "reason": str(e)}
    ok, res = check_patch(verts, E, F, l)
    if not ok:
        return None, {"id": dec["id"], "config": cfg_str, "reason": "patch not regular: %r" % res}
    rec = {
        "id": dec["id"], "vertexConfig": cfg_str, "k": len(configs), "edgeLength": l,
        "vertices": [[float(x), float(y)] for (x, y) in verts],
        "faces": [list(map(int, ring)) for ring in F],
        "tiles": len(F), "residual": res,
        # Quotient half-edge structure (the darts) so the TS client can RE-DEVELOP the tiling to any
        # radius, re-centred on the view, without reconstructing the symmetry group. These are the exact
        # combinatorial input to develop_patch above; seed 0 is the dart the flood-fill starts from.
        "darts": {
            "rneig": list(map(int, dec["rneig"])),
            "glue": list(map(int, dec["glue"])),
            "lvert": list(map(int, dec["lvert"])),
            "seed": 0,
        },
    }
    return rec, None


def run(pruned, out_path, report_path, kmin=1, kmax=1, boundR=0.9, limit=None):
    blocks = ds.gather_blocks(pruned, kmin, kmax)
    if limit:
        blocks = blocks[:limit]
    records, failed = [], []
    import time as _t
    _t0 = _t.time()
    for i, b in enumerate(blocks):
        if i and i % 2000 == 0:
            el = _t.time() - _t0
            print("  develop %d/%d  %.0fs elapsed, ~%.0fs left, %d developed"
                  % (i, len(blocks), el, el / i * (len(blocks) - i), len(records)),
                  file=sys.stderr, flush=True)
        rec, err = develop_block(b, boundR=boundR)
        (records if rec else failed).append(rec or err)
    records.sort(key=lambda r: (r["k"], -r["tiles"], r["id"]))
    if out_path:
        json.dump(records, open(out_path, "w"))
    lines = ["hyperbolic develop report (k=%d..%d, boundR=%.2f)" % (kmin, kmax, boundR),
             "blocks in    : %d" % len(blocks),
             "developed    : %d" % len(records),
             "not developed: %d" % len(failed)]
    from collections import Counter
    rc = Counter(e["reason"].split(" (")[0].split(":")[0] for e in failed)
    for reason, n in rc.most_common():
        lines.append("   %4d  %s" % (n, reason))
    report = "\n".join(lines) + "\n"
    if report_path:
        open(report_path, "w").write(report)
    print(report)
    return records, failed


# ----------------------------------------------------------------------------- selftest
def _selftest():
    # geometry: {8,3} = three octagons; interior angle closes to 2π at the solved edge
    l = solve_edge_length([8, 8, 8])
    assert l is not None, "{8,3} edge solve failed"
    assert abs(sum(interior_angle(8, l) for _ in range(3)) - TWO_PI) < 1e-9
    # closed-form cross-check: cosh(ℓ/2) = cos(π/8)/sin(π/3)
    lcf = 2 * math.acosh(math.cos(math.pi / 8) / math.sin(math.pi / 3))
    assert abs(l - lcf) < 1e-9, "edge %f != closed form %f" % (l, lcf)
    # Euclidean / spherical configs return None
    assert solve_edge_length([4, 4, 4, 4]) is None, "square tiling is Euclidean"
    assert solve_edge_length([3, 3, 3]) is None, "3.3.3 is spherical"
    # edge involution on the disk (M² ≡ identity: M²·0 == 0)
    M = medge(l)
    assert abs(_pos(M @ M)) < 1e-9, "Medge not an involution on the disk"
    print("[selftest] geometry OK (ℓ_{8,3}=%.6f)" % l)
    # develop {8,3} from a real pruned block if available
    fixtures = os.environ.get("HYP_FIXTURES", "/tmp/hyp-k1/out/pruned")
    if os.path.isdir(fixtures):
        for b in ds.gather_blocks(fixtures, 1, 1):
            if b[0].startswith("(8,8,8)"):
                rec, err = develop_block(b, boundR=0.75)
                assert rec, "develop {8,3} failed: %s" % err
                assert all(len(ring) == 8 for ring in rec["faces"]), "not all octagons"
                assert abs(rec["edgeLength"] - l) < 1e-9
                print("[selftest] developed {8,3}: %d octagons, %d verts, edge=%.6f, resid=%r"
                      % (rec["tiles"], len(rec["vertices"]), rec["edgeLength"], rec["residual"]))
                break
        else:
            print("[selftest] (no (8,8,8) block in fixtures)")
    else:
        print("[selftest] (no fixtures at %s; run PALETTE=hyperbolic ./run-oracle.sh 1 /tmp/hyp-k1)" % fixtures)
    print("[selftest] PASS")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pruned", default="/tmp/hyp-k1/out/pruned")
    ap.add_argument("--out", default=None)
    ap.add_argument("--report", default=None)
    ap.add_argument("--kmin", type=int, default=1)
    ap.add_argument("--kmax", type=int, default=1)
    ap.add_argument("--boundR", type=float, default=0.9)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--palette", default="hyperbolic", help="which tables/<palette> alphabet to decode against")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
        return
    ds.install_palette(args.palette)  # decode against this palette's generated alphabet, not the default
    run(args.pruned, args.out, args.report, args.kmin, args.kmax, args.boundR, args.limit)


if __name__ == "__main__":
    main()
