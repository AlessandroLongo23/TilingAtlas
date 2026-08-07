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
import cmath
import json
import math
import sys

from render_cells import (load_tables, decode, develop, trace_faces, zfloat,
                          zadd, zsub, zscale, ZK, ORDER)


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


def exact_tiles(tab, cell_faces, T1, T2):
    """Compact EXACT description of the cell, for the /play symmetry + orbit overlays.

    Those overlays refuse to run on floats by design: analyzeSymmetry and KUniformityChecker
    .vertexOrbits both take exact ZZ[zeta_24] input, and everything they report is derived from an
    exact decision. Star tilings had no exact payload — the regular-only cell codec cannot represent
    them — so both overlays came back null and the UI drew nothing.

    Reconstructing the exact cell in the browser from the float renderCell is NOT possible:
    ZZ[zeta_24] is dense in C, so nearest-point decoding of a vertex is ill-posed (a settled result;
    see CLAUDE.md). Walking unit edges is well-posed because each step is one of 24 known directions,
    but the cell's faces are reduced modulo the lattice and are not all connected, and the lattice
    vectors cannot be decoded from floats either. So the exact data has to be emitted here, where it
    still exists.

    What is emitted is the ARGUMENTS to the existing exact constructors rather than vertex lists:
    RegularPolygon.fromAnchorAndDirExact(n, anchor, dir) and ExactStarPolygon.isotoxal(n, alphaU,
    anchor, dir). That is ~11 integers per tile against 8 per vertex, so it is SMALLER than the float
    vertex list already shipped. Both sides use the same basis — Python RANK=8 over {zeta^0..zeta^7}
    with Phi_24, TS phi=8 with angles 2*pi*j/24 — so the integer vectors transfer directly.
    """
    ZIDX = {ZK[d]: d for d in range(ORDER)}          # unit step -> zeta exponent
    tiles = []
    for verts, tile in cell_faces:
        pts = [zfloat(v) for v in verts]
        # The constructors walk CCW (turns sum to +24). Face tracing can hand back either winding.
        if poly_area_signed(pts) < 0:
            verts = list(reversed(verts))
            pts = list(reversed(pts))
        cls0 = next(c for c in range(len(tab.CLASS_TILE)) if tab.CLASS_TILE[c] == tile)
        L, p = tab.CLASS_L[cls0], tab.CLASS_P[cls0]
        n = L // p
        star = (p == 2)
        alpha_u = None
        if star:
            nm = tab.TILE_NAME[tile]                  # "3*1" = 3 points, alpha = 1 unit of pi/12
            alpha_u = int(nm.split("*")[1])
        # Anchor must be vertex 0 of the constructor's own walk: for a star that is a convex POINT,
        # and points/dents alternate. Pick the sharpest corner, which is a point by construction.
        start = 0
        if star:
            best = None
            for i in range(len(verts)):
                a, b, c = pts[i - 1], pts[i], pts[(i + 1) % len(pts)]
                turn = cmath.phase((c - b) / (b - a))  # exterior turn; > 0 at a sharp point
                if best is None or turn > best[0]:
                    best = (turn, i)
            start = best[1]
        v0 = verts[start]
        step = zsub(verts[(start + 1) % len(verts)], v0)
        d = ZIDX.get(step)
        if d is None:                                  # not a unit step => cannot describe exactly
            return None
        t = {"n": n, "anchor": list(v0), "dir": d}
        if star:
            t["star"] = True
            t["alphaU"] = alpha_u
        # SELF-GATE: replay the walk the TS constructors will perform and require it to reproduce this
        # face exactly. A wrong anchor, winding or direction would otherwise ship a descriptor that
        # renders plausible-looking symmetry from the wrong geometry — silently wrong, which is worse
        # than absent. On any mismatch the whole record drops its exactCell and the overlay stays off.
        if set(_replay(t)) != set(verts):
            return None
        tiles.append(t)
    return {"T1": list(T1), "T2": list(T2), "tiles": tiles}


def _replay(t):
    """Mirror of RegularPolygon.fromAnchorAndDirExact / ExactStarPolygon.isotoxal, in exact ZZ[zeta_24].

    Kept deliberately literal so a change on either side shows up as an export failure rather than as
    a wrong overlay. Star: 2n edges, exterior turn after edge i is dentTurn for even i (edge 0 leaves
    the point at vertex 0 and arrives at a dent) and pointTurn for odd i.
    """
    n, p, d = t["n"], tuple(t["anchor"]), t["dir"]
    out = []
    if t.get("star"):
        alpha = t["alphaU"]
        beta = 24 - 24 // n - alpha
        turns = (12 - beta, 12 - alpha)
        for i in range(2 * n):
            out.append(p)
            p = zadd(p, ZK[d % ORDER])
            d = (d + turns[i % 2]) % ORDER
    else:
        turn = ORDER // n
        for _ in range(n):
            out.append(p)
            p = zadd(p, ZK[d % ORDER])
            d = (d + turn) % ORDER
    return out


def poly_area_signed(pts):
    s = 0.0
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        s += a.real * b.imag - a.imag * b.real
    return s / 2


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
        ex = exact_tiles(tab, cell_faces, T1, T2)
        if ex is not None:
            rec_out["exactCell"] = ex
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
