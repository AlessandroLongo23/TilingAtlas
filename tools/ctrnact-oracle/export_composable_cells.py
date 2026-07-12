#!/usr/bin/env python3
"""Develop + export pruned COMPOSITE-palette solutions as float render cells.

Reuses the fixed render_cells machinery (exact ZZ[zeta_24] development, D-parameterized
so D=12 composite tables develop correctly), traces faces, reduces them modulo the period
lattice to one representative per orbit inside the fundamental cell, and emits the app's
TranslationalCellData shape per solution:
  { id, k, family, renderCell:{ cellPolygons:[{n, vertices:[[x,y],...], star:false}],
    basis:[[x,y],[x,y]] }, usesComposite, tiles:[...] }

Composite tiles (TILE_NAME starts with 'cx') are full-boundary polygons: n = L (NOT L//p),
star = false. The stale export_atlas_cells heuristic (n = L//p, star = p==2) mislabels the
period-2 composites (cx4-2.4.2.4, cx6-3.5.3.5.3.5, cx8-4.5.4.5.4.5.4.5) as 2-pointed stars;
this script reads TILE_NAME to classify instead.

Two geometry sanity checks guard every developed cell (a failure means the develop is wrong,
not that the tiling is exotic):
  1. sum of cell-polygon areas == |det(basis)|  (fundamental-cell area consistency)
  2. every cell-polygon edge has unit length    (edge-to-edge unit tiles)

Usage:
  python3 export_composable_cells.py --run run-composite-decomp-k1 \
      --tables tables/composite-decomp --palette composite-decomp --k 1 \
      --out ../../experiments/composable-oracle/ctrnact-composite-decomp-k1.cells.json
"""
import argparse
import glob
import json
import math
import os
import sys

from render_cells import (load_tables, decode, develop, trace_faces, zfloat,
                          zadd, zsub, zscale)
from export_atlas_cells import reduce_faces_mod_lattice, poly_area

AREA_TOL = 1e-6   # relative tolerance for cell-area == |det|
EDGE_TOL = 1e-6   # absolute tolerance for unit edge length


def is_composite_tile(tab, tile):
    """A tile is composite iff its TILE_NAME starts with 'cx' (generator: cx<sides>-<word>)."""
    return tab.TILE_NAME[tile].startswith("cx")


def class_of_tile(tab, tile):
    return next(c for c in range(len(tab.CLASS_TILE)) if tab.CLASS_TILE[c] == tile)


def read_blocks(path):
    """Yield (vertype, conway) for each pruned solution block (Count-type delimited)."""
    lines = [l.rstrip("\n") for l in open(path)]
    i = 0
    while i < len(lines):
        if (lines[i].startswith("(") and i + 4 < len(lines)
                and lines[i + 2].startswith("Count type")):
            yield lines[i], lines[i + 4]
            i += 5
        else:
            i += 1


def unit_edge_failures(pts):
    """Return list of (edge index, length) for edges whose length differs from 1 by > EDGE_TOL."""
    bad = []
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        L = math.hypot(b.real - a.real, b.imag - a.imag)
        if abs(L - 1.0) > EDGE_TOL:
            bad.append((i, L))
    return bad


def develop_block(tab, vertype, conway, k, palette, id_prefix, idx):
    """Develop one block -> record dict. Raises on any develop / sanity failure (logged by caller)."""
    rneig, lneig, mirro, cls, glue = decode(tab, vertype, conway)
    placed, T1, T2 = develop(tab, rneig, cls, glue)
    faces = trace_faces(tab, rneig, cls, glue, placed)
    cell_faces, det = reduce_faces_mod_lattice(faces, T1, T2)

    area = sum(poly_area([zfloat(v) for v in verts]) for verts, _ in cell_faces)
    if abs(area - det) > AREA_TOL * max(det, 1.0):
        raise ValueError(f"AREA CHECK FAIL: cell faces {area:.6f} vs |det| {det:.6f}"
                         f" (face selection incomplete / develop wrong)")

    polys, tile_names, uses_composite = [], set(), False
    for verts, tile in cell_faces:
        cls0 = class_of_tile(tab, tile)
        L, p = tab.CLASS_L[cls0], tab.CLASS_P[cls0]
        composite = is_composite_tile(tab, tile)
        if composite:
            n, star = L, False        # full boundary; a composite is NEVER a star
            uses_composite = True
        else:
            n, star = L // p, (p == 2)  # regular: p=1 -> n=L, not a star
        pts = [zfloat(v) for v in verts]
        if len(pts) != n:
            raise ValueError(f"point-count mismatch tile {tab.TILE_NAME[tile]}: "
                             f"walked {len(pts)} corners but n={n}")
        bad = unit_edge_failures(pts)
        if bad:
            raise ValueError(f"UNIT-EDGE FAIL tile {tab.TILE_NAME[tile]}: "
                             f"{len(bad)} non-unit edge(s), e.g. edge {bad[0][0]} len {bad[0][1]:.6f}")
        rec = {"n": n,
               "vertices": [[round(q.real, 12), round(q.imag, 12)] for q in pts],
               "star": star,
               # EXACT ℤ[ζ₂₄] coordinates (length-8 integer coefficient vectors, den=1) — kept so the
               # TS side can rebuild Cyclotomic/Polygon and run the proof-grade exact congruence dedup
               # (dedupeByCongruence). `name` disambiguates the tile species for the congruence buckets.
               "name": tab.TILE_NAME[tile],
               "exact": [list(v) for v in verts]}
        polys.append(rec)
        tile_names.add(tab.TILE_NAME[tile])

    b1, b2 = zfloat(T1), zfloat(T2)
    return {
        "id": f"{id_prefix}-k{k}-{idx:02d}",
        "k": k,
        "family": vertype,
        "renderCell": {
            "cellPolygons": polys,
            "basis": [[round(b1.real, 12), round(b1.imag, 12)],
                      [round(b2.real, 12), round(b2.imag, 12)]],
            # Exact translation basis Λ=(T1,T2) as ℤ[ζ₂₄] integer coefficient vectors (see cellPolygons.exact).
            "exactBasis": [list(T1), list(T2)],
        },
        "usesComposite": uses_composite,
        "tiles": sorted(tile_names),
        "areaCheck": {"cellArea": round(area, 9), "detAbs": round(det, 9)},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, help="run dir holding out/pruned/eupruned_0<k>_*.txt")
    ap.add_argument("--tables", required=True, help="tables/<palette> dir")
    ap.add_argument("--k", type=int, required=True)
    ap.add_argument("--palette", required=True, help="palette name (id-prefix + meta)")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    tab = load_tables(args.tables)
    id_prefix = f"ctrnact-{args.palette}"
    pruned_glob = os.path.join(args.run, "out", "pruned", f"eupruned_{args.k:02d}_*.txt")
    files = sorted(glob.glob(pruned_glob))
    if not files:
        print(f"no pruned files match {pruned_glob}", file=sys.stderr)
        sys.exit(1)

    blocks = []
    for f in files:
        blocks.extend(read_blocks(f))

    records, fails = [], []
    n_composite = 0
    for bi, (vertype, conway) in enumerate(blocks, 1):
        try:
            rec = develop_block(tab, vertype, conway, args.k, args.palette, id_prefix, len(records) + 1)
        except Exception as e:
            fails.append((bi, vertype, str(e)))
            print(f"  ERR #{bi} {vertype}: {e}", file=sys.stderr)
            continue
        if rec["usesComposite"]:
            n_composite += 1
        records.append(rec)
        print(f"  #{len(records)} {vertype}: {len(rec['renderCell']['cellPolygons'])} cell polys, "
              f"area {rec['areaCheck']['cellArea']:.4f} == |det| ok"
              f"{'  [composite]' if rec['usesComposite'] else ''}")

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump({
            "_meta": {
                "source": f"Čtrnáct-engine composite palette '{args.palette}', exact ZZ[zeta_24] "
                          f"development (D=12, STEP=2 direction indexing)",
                "palette": args.palette,
                "k": args.k,
                "counts": {
                    "solutions": len(blocks),
                    "developed": len(records),
                    "usesComposite": n_composite,
                    "developFailures": len(fails),
                },
                "sanityChecks": "per record: sum(cell poly areas) == |det basis|; all cell-poly "
                                "edges unit length (both PASS for every emitted record)",
            },
            "records": records,
        }, f, indent=1)

    print(f"[{args.palette} k={args.k}]  solutions {len(blocks)}  developed {len(records)}  "
          f"usesComposite {n_composite}  failures {len(fails)}  -> {args.out}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
