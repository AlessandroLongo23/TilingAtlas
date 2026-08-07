#!/usr/bin/env python3
"""Export out-of-ring (D != 24) star tilings as float render cells for the Atlas.

Uses render_ring.Ring (exact ZZ[zeta_D]) so D=18 (9-fold) and D=20 (5-fold) tilings develop
exactly, then emits the app's float renderCell shape with a per-cell area check. --contains keeps
only blocks whose vertype names one of the given n (regular OR star: 9 matches both "9" and "9*p1") (e.g. "9,18,5,10,20" = the tiles
that make a tiling genuinely out-of-ring, i.e. NOT already an alpha-sample of an in-ring family).

DO NOT replace this with "keep blocks whose angles are off the zeta24 grid" — tried 2026-08-07 and it is
WRONG. alpha is a FREE parameter for flexing families, so a family exists at EVERY alpha in its range and
the ring only decides which alphas you happen to sample; an off-grid snapshot of e.g. (6*,6*,3) is an
alpha-sample of an in-ring family that already ships on the star24full shelf. That test pulled in 34
duplicate snapshots of 13 shapes. What makes a tiling out-of-ring is a tile whose symmetry order n does
not divide 24 (9/18 at D=18; 5/10/20 at D=20) — n is combinatorial, alpha is not.

Usage:
  python3 export_ring_cells.py --pruned run-star18-k1b6/out/pruned \
      --tables tables/star18 --k 1 --contains 9,18 --id-prefix ctrnact-star-9fold \
      --out ../../experiments/star-oracle/ctrnact-star-9fold-k1.cells.json
"""
import argparse
import cmath
import glob
import json
import math
import os
import re
import sys

from render_ring import Ring, develop, trace_faces
from render_cells import decode, read_blocks, load_tables


def reduce_faces_mod_lattice(ring, faces, T1, T2):
    f1, f2 = ring.zfloat(T1), ring.zfloat(T2)
    det = f1.real * f2.imag - f1.imag * f2.real
    out, seen = [], set()
    for verts, tile in faces:
        anchor = min(verts)
        p = ring.zfloat(anchor)
        a = (p.real * f2.imag - p.imag * f2.real) / det
        b = (f1.real * p.imag - f1.imag * p.real) / det
        m, n = math.floor(a + 1e-9), math.floor(b + 1e-9)
        shift = ring.zadd(ring.zscale(T1, -m), ring.zscale(T2, -n))
        red = tuple(sorted(ring.zadd(v, shift) for v in verts))
        if red in seen:
            continue
        seen.add(red)
        out.append(([ring.zadd(v, shift) for v in verts], tile))
    return out, abs(det)


def poly_area(pts):
    s = 0.0
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        s += a.real * b.imag - a.imag * b.real
    return abs(s) / 2



def exact_tiles_ring(ring, tab, cell_faces, T1, T2):
    """Exact cell descriptor for an OUT-OF-RING tiling, same contract as export_atlas_cells.exact_tiles.

    Identical idea, generalised to ZZ[zeta_D]: emit the arguments to the exact TS constructors rather
    than vertex lists, and self-gate by replaying the walk the constructors will perform. A 9-fold or
    5-fold tile carries a symmetry order that does not divide 24, so it cannot be expressed at N=24 at
    all — hence `D` travels with the record and the TS side refuses to build it on any other ring.

    Every 24 and 12 in the N=24 version is D and D/2 here. D is even for every palette in the atlas,
    so the half-turn stays an integer number of angle units.
    """
    D = tab.D
    H = D // 2
    ZIDX = {ring.ZK[d]: d for d in range(D)}
    tiles = []
    for verts, tile in cell_faces:
        pts = [ring.zfloat(v) for v in verts]
        s2 = 0.0
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            s2 += a.real * b.imag - a.imag * b.real
        if s2 < 0:                                    # constructors walk CCW
            verts = list(reversed(verts)); pts = list(reversed(pts))
        cls0 = next(c for c in range(len(tab.CLASS_TILE)) if tab.CLASS_TILE[c] == tile)
        L, p = tab.CLASS_L[cls0], tab.CLASS_P[cls0]
        n = L // p
        star = (p == 2)
        alpha_u = int(tab.TILE_NAME[tile].split("*")[1]) if star else None
        start = 0
        if star:                                      # anchor must be a convex point (vertex 0)
            best = None
            for i in range(len(verts)):
                a, b, c = pts[i - 1], pts[i], pts[(i + 1) % len(pts)]
                turn = cmath.phase((c - b) / (b - a))
                if best is None or turn > best[0]:
                    best = (turn, i)
            start = best[1]
        v0 = verts[start]
        step = ring.zsub(verts[(start + 1) % len(verts)], v0)
        d = ZIDX.get(step)
        if d is None:
            return None
        t = {"n": n, "anchor": list(v0), "dir": d}
        if star:
            t["star"] = True
            t["alphaU"] = alpha_u
        # replay exactly what RegularPolygon.fromAnchorAndDirExact / ExactStarPolygon.isotoxal do
        out, pp, dd = [], tuple(v0), d
        if star:
            beta = D - D // n - alpha_u
            turns = (H - beta, H - alpha_u)
            for i in range(2 * n):
                out.append(pp); pp = ring.zadd(pp, ring.ZK[dd % D]); dd = (dd + turns[i % 2]) % D
        else:
            turn = D // n
            for _ in range(n):
                out.append(pp); pp = ring.zadd(pp, ring.ZK[dd % D]); dd = (dd + turn) % D
        if set(out) != set(verts):
            return None
        tiles.append(t)
    return {"D": D, "T1": list(T1), "T2": list(T2), "tiles": tiles}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pruned", required=True, help="pruned file OR dir of eupruned_*.txt")
    ap.add_argument("--tables", required=True)
    ap.add_argument("--k", type=int, required=True)
    ap.add_argument("--contains", default="", help="comma list of regular n; keep block iff it names one")
    ap.add_argument("--kcount", type=int, default=0,
                    help="keep only blocks with exactly this many COUNTING groups (>=3 corners); 0 = any")
    ap.add_argument("--id-prefix", default="ctrnact-star-ring")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    tab = load_tables(args.tables)
    ring = Ring(tab.D)
    need = set(args.contains.split(",")) if args.contains else None


    files = ([args.pruned] if os.path.isfile(args.pruned)
             else sorted(glob.glob(os.path.join(args.pruned, "eupruned_*.txt"))))
    blocks = []
    for fp in files:
        for vt, cw in read_blocks(fp):
            if "*" not in vt:
                continue
            if need is not None:
                # n-gons named in the vertype, REGULAR ('...,9,...') and STAR ('...,9*p1,...') alike.
                # Matching only the regular form was a bug: a 9-pointed star is itself an out-of-ring
                # tile, so blocks carrying 18*/9* but no bare 9/18 were silently dropped.
                regs = set(re.findall(r'[(,](\d+)[,)]', vt)) | set(re.findall(r'[(,](\d+)\*', vt))
                if not (regs & need):
                    continue
            if args.kcount:
                kc = sum(1 for g in re.findall(r'\(([^)]*)\)', vt) if len(g.split(",")) >= 3)
                if kc != args.kcount:
                    continue
            blocks.append((vt, cw))

    records = []
    for bi, (vertype, conway) in enumerate(sorted(set(blocks)), 1):
        try:
            rneig, lneig, mirro, cls, glue = decode(tab, vertype, conway)
            placed, T1, T2 = develop(ring, tab, rneig, cls, glue)
            faces = trace_faces(ring, tab, rneig, cls, glue, placed)
            cell_faces, det = reduce_faces_mod_lattice(ring, faces, T1, T2)
        except Exception as e:
            print(f"  ERR #{bi} {vertype}: {e}", file=sys.stderr)
            continue
        area = sum(poly_area([ring.zfloat(v) for v in verts]) for verts, _ in cell_faces)
        if abs(area - det) > 1e-6 * max(det, 1.0):
            print(f"  AREA FAIL #{bi} {vertype}: {area:.5f} vs |det| {det:.5f} — skipped", file=sys.stderr)
            continue
        polys = []
        for verts, tile in cell_faces:
            cls0 = next(c for c in range(len(tab.CLASS_TILE)) if tab.CLASS_TILE[c] == tile)
            L, p = tab.CLASS_L[cls0], tab.CLASS_P[cls0]
            rec = {"n": L // p, "vertices": [[round(ring.zfloat(v).real, 12), round(ring.zfloat(v).imag, 12)]
                                             for v in verts]}
            if p == 2:
                rec["star"] = True
            polys.append(rec)
        b1, b2 = ring.zfloat(T1), ring.zfloat(T2)
        orbits = [s for s in vertype.split(", ") if len(s.split(",")) >= 3]
        records.append({
            "id": f"{args.id_prefix}-k{args.k}-{bi:02d}",
            "k": args.k, "vertype": vertype, "orbits": orbits, "ring": tab.D,
            **({"exactCell": _ex} if (_ex := exact_tiles_ring(ring, tab, cell_faces, T1, T2)) else {}),
            "renderCell": {"cellPolygons": polys,
                           "basis": [[round(b1.real, 12), round(b1.imag, 12)],
                                     [round(b2.real, 12), round(b2.imag, 12)]]},
            "areaCheck": {"cellArea": round(area, 9), "detAbs": round(det, 9)},
        })
        print(f"  #{bi} {vertype}: {len(polys)} cell polys, area {area:.4f} == |det| ok")

    with open(args.out, "w") as f:
        json.dump({"_meta": {"source": f"Cirnact-engine out-of-ring star extension, exact ZZ[zeta_{tab.D}]",
                             "note": "Out-of-ring 1-uniform star tilings (D!=24). Reproduces Myers' out-of-ring "
                                     "k=1 entries. Develop is exact in the palette's own cyclotomic ring."},
                   "records": records}, f, indent=1)
    print(f"wrote {len(records)} records -> {args.out}")


if __name__ == "__main__":
    main()
