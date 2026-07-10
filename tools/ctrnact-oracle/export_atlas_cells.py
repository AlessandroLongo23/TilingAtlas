#!/usr/bin/env python3
"""Export pruned star-palette solutions as float render cells for the Atlas reference shelf.

For each solution: exact ZZ[zeta_24] development (render_cells.py machinery), face tracing,
reduction of faces modulo the period lattice to one representative per orbit inside the
fundamental cell, then float emission in the app's TranslationalCellData shape:
  { cellPolygons: [{n, vertices:[[x,y],...], star?}], basis: [[x,y],[x,y]] }
A float area check (sum of cell polygon areas vs |det basis|) guards face selection.

Usage:
  python3 export_atlas_cells.py --pruned run-star-k2b6/extras.txt --tables tables/star24 \
      --out ../../experiments/star-oracle/ctrnact-star-k2-extras.cells.json --k 2
"""
import argparse
import json
import math
import sys

from render_cells import (load_tables, decode, develop, trace_faces, zfloat,
                          zadd, zsub, zscale)


def reduce_faces_mod_lattice(faces, T1, T2):
    """One representative per face orbit under the lattice, translated into the base cell."""
    f1, f2 = zfloat(T1), zfloat(T2)
    det = f1.real * f2.imag - f1.imag * f2.real
    out, seen = [], set()
    for verts, tile in faces:
        anchor = min(verts)               # lex-min exact vertex: orbit-stable choice
        p = zfloat(anchor)
        a = (p.real * f2.imag - p.imag * f2.real) / det
        b = (f1.real * p.imag - f1.imag * p.real) / det
        m, n = math.floor(a + 1e-9), math.floor(b + 1e-9)
        shift = zadd(zscale(T1, -m), zscale(T2, -n))
        red = tuple(sorted(zadd(v, shift) for v in verts))
        if red in seen:
            continue
        seen.add(red)
        out.append(([zadd(v, shift) for v in verts], tile))
    return out, abs(det)


def poly_area(pts):
    s = 0.0
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        s += a.real * b.imag - a.imag * b.real
    return abs(s) / 2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pruned", required=True)
    ap.add_argument("--tables", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--k", type=int, required=True)
    ap.add_argument("--id-prefix", default="ctrnact-star")
    ap.add_argument("--only-star", action="store_true",
                    help="skip pure-regular solutions (no '*' in the vertype)")
    ap.add_argument("--candidates", default=None,
                    help="blocks file (extras format); matching vertypes get candidate:true")
    args = ap.parse_args()
    tab = load_tables(args.tables)
    candidate_vertypes = set()
    if args.candidates:
        clines = [l.rstrip("\n") for l in open(args.candidates)]
        j = 0
        while j < len(clines):
            if clines[j].startswith("(") and j + 2 < len(clines) and clines[j + 2].startswith("Count type"):
                candidate_vertypes.add(clines[j])
                j += 5
            else:
                j += 1

    records = []
    lines = [l.rstrip("\n") for l in open(args.pruned)]
    i = 0
    blocks = []
    while i < len(lines):
        if lines[i].startswith("(") and i + 2 < len(lines) and lines[i + 2].startswith("Count type"):
            if not args.only_star or "*" in lines[i]:
                blocks.append((lines[i], lines[i + 4]))
            i += 5
        else:
            i += 1

    for bi, (vertype, conway) in enumerate(blocks, 1):
        rneig, lneig, mirro, cls, glue = decode(tab, vertype, conway)
        placed, T1, T2 = develop(tab, rneig, cls, glue)
        faces = trace_faces(tab, rneig, cls, glue, placed)
        cell_faces, det = reduce_faces_mod_lattice(faces, T1, T2)
        area = sum(poly_area([zfloat(v) for v in verts]) for verts, _ in cell_faces)
        if abs(area - det) > 1e-6 * max(det, 1.0):
            print(f"AREA CHECK FAIL #{bi} {vertype}: cell faces {area:.6f} vs |det| {det:.6f}"
                  f" — face selection incomplete, record skipped", file=sys.stderr)
            continue
        polys = []
        for verts, tile in cell_faces:
            # n = tile's point count: word length / period (regular: L, star: L/2)
            cls0 = next(c for c in range(len(tab.CLASS_TILE)) if tab.CLASS_TILE[c] == tile)
            L, p = tab.CLASS_L[cls0], tab.CLASS_P[cls0]
            n = L // p
            pts = [zfloat(v) for v in verts]
            rec = {"n": n, "vertices": [[round(pt.real, 12), round(pt.imag, 12)] for pt in pts]}
            if p == 2:
                rec["star"] = True
            polys.append(rec)
        b1, b2 = zfloat(T1), zfloat(T2)
        # counting orbits only, for the family label
        orbits = [s for s in vertype.split(", ")
                  if len(s.split(",")) >= 3]
        rec_out = {
            "id": f"{args.id_prefix}-k{args.k}-{bi:02d}",
            "k": args.k,
            "vertype": vertype,
            "orbits": orbits,
        }
        if vertype in candidate_vertypes:
            rec_out["candidate"] = True
        records.append({
            **rec_out,
            "renderCell": {
                "cellPolygons": polys,
                "basis": [[round(b1.real, 12), round(b1.imag, 12)],
                          [round(b2.real, 12), round(b2.imag, 12)]],
            },
            "areaCheck": {"cellArea": round(area, 9), "detAbs": round(det, 9)},
        })
        print(f"  #{bi} {vertype}: {len(polys)} cell polygons, area {area:.4f} == |det| ok")

    with open(args.out, "w") as f:
        json.dump({
            "_meta": {
                "source": "Čtrnáct-engine star extension (feat/ctrnact-star), exact ZZ[zeta_24] development",
                "note": "Star-bearing k-uniform tilings from the in-ring star palette runs. Records with candidate:true "
                        "are NOT present in Myers' enumeration and are pending adversarial review; the rest reproduce "
                        "Myers 2004/2009 records. See experiments/results/star-ctrnact-setup-2026-07-10.log.",
            },
            "records": records,
        }, f, indent=1)
    print(f"wrote {len(records)} records -> {args.out}")
    sys.exit(0 if len(records) == len(blocks) else 1)


if __name__ == "__main__":
    main()
