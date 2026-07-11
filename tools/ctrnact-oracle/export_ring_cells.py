#!/usr/bin/env python3
"""Export out-of-ring (D != 24) star tilings as float render cells for the Atlas.

Uses render_ring.Ring (exact ZZ[zeta_D]) so D=18 (9-fold) and D=20 (5-fold) tilings develop
exactly, then emits the app's float renderCell shape with a per-cell area check. --contains keeps
only blocks whose vertype names one of the given regular polygons (e.g. "9,18,5,10,20" = the tiles
that make a tiling genuinely out-of-ring, i.e. NOT already an alpha-sample of an in-ring family).

Usage:
  python3 export_ring_cells.py --pruned run-star18-k1b6/out/pruned \
      --tables tables/star18 --k 1 --contains 9,18 --id-prefix ctrnact-star-9fold \
      --out ../../experiments/star-oracle/ctrnact-star-9fold-k1.cells.json
"""
import argparse
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pruned", required=True, help="pruned file OR dir of eupruned_*.txt")
    ap.add_argument("--tables", required=True)
    ap.add_argument("--k", type=int, required=True)
    ap.add_argument("--contains", default="", help="comma list of regular n; keep block iff it names one")
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
                regs = set(re.findall(r'[(,](\d+)[,)]', vt))
                if not (regs & need):
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
