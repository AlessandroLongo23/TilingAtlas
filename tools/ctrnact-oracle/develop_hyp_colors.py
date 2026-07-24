#!/usr/bin/env python3
"""Develop Marek Čtrnáct's HYPERBOLIC colored-tiling certificates ({3,7} and {7,3} 3-colorings) into
the atlas's Poincaré-disk records.

THE OBJECT. A periodic n-coloring of a regular hyperbolic {p,q} tiling: every face is a real tile
carrying one of n colors, k counts COLORED vertex classes (vertices equivalent only under symmetries
that preserve the coloring — Marek's "Number of vertices"). This is the colors class (develop_colors.py),
moved to H²: exactly as develop_colors is develop_freedraw with one alphabet over ({A4,B4} instead of
{A2,A4}), this is develop_hyp_edges with the digon dropped and every letter a colored copy of the base
face. There are NO drawn/undrawn edges — every {p,q} edge is a tile boundary — so, unlike the edge
systems, there is no merging across undrawn edges: each base face is its own tile, colored by its letter.

WHY THIS FILE IS SHORT. The three halves already exist and are imported, not copied:
  * front end — develop_freedraw's parser / VTable / Block (grid-independent Conway machinery).
  * hyperbolic back end — develop_hyp_edges's angle-driven vtable bridge, SU(1,1) develop_patch and
    quotient_faces (the digon cases are simply never hit here).
  * color convention — develop_colors's letter→index map (A=0, B=1, C=2, …).

The only new piece is the alphabet: for {p,q} the letters are colored p-gons {A{p}, B{p}, …}, each with
the SAME interior angle interior_angle(p, ℓ), where ℓ is FORCED by the base tiling's vertex closure
q·interior_angle(p, ℓ) = 2π. The color is a label, invisible to the geometry.

WHAT SHIPS. Darts (re-developed under the live view by lib/render/hyperbolicDevelopClient.ts::developColors),
with a `faceColor` array — the color index per quotient dart, constant along each quotient face. The
render path fills each developed face with faceColor through the atlas palette and strokes every edge.

Usage:
    develop_hyp_colors.py <corpus-dir> --base 73 --out public/hyperbolic-colors/c73
    develop_hyp_colors.py <corpus-dir> --base 37 --surjective --out ... --report ...
    develop_hyp_colors.py --selftest
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

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

import develop_freedraw as fd
from develop_freedraw import DevelopError
from develop_hyperbolic import interior_angle, solve_edge_length
from develop_hyp_edges import (
    build_block,
    check_patch,
    develop_patch,
    quotient_faces,
    tile_size,
)

TWO_PI = 2 * math.pi
LETTERS = "ABCDEFGHIJ"
COLOR_OF = {ch: i for i, ch in enumerate(LETTERS)}

# The regular {p,q} base tilings Marek has color solvers for. p = face size, q = faces per vertex.
BASES = {
    "37": {"p": 3, "q": 7, "label": "{3,7}"},
    "73": {"p": 7, "q": 3, "label": "{7,3}"},
}


def alphabet(base, ncolors):
    """{letter: interior angle at the forced ℓ} for the n colored copies of the base {p,q} face."""
    p, q = base["p"], base["q"]
    l = solve_edge_length([p] * q)
    if l is None:
        raise DevelopError(f"{{{p},{q}}} is not hyperbolic (Euclidean angle sum ≤ 2π)")
    ang = interior_angle(p, l)
    units = {f"{c}{p}": ang for c in LETTERS[:ncolors]}
    return l, units


# ------------------------------------------------------------------ record emission
def emit_darts(block, face_of, faces):
    """The shipped quotient structure, parallel to develop_hyp_edges.emit_darts but carrying a per-dart
    COLOR instead of a merged-tile orbit (no merging: every face is its own tile). lvert is indexed so
    that the client's alpha(h) = interiorAngle(lvert[rneig[h]]) reproduces block.step[h]."""
    n = len(block.rneig)
    lvert = [0] * n
    for h in range(n):
        lvert[block.rneig[h]] = tile_size(block.tile[h])
    for h in range(n):
        if abs(interior_angle(lvert[block.rneig[h]], 1.0) - interior_angle(tile_size(block.tile[h]), 1.0)) > 1e-12:
            raise DevelopError("lvert indexing does not reproduce the per-dart angle")
    face_color = [-1] * n
    for h in range(n):
        face_color[h] = COLOR_OF[faces[face_of[h]]["letter"][0]]
    return {
        "rneig": [int(x) for x in block.rneig],
        "glue": [int(x) for x in block.glue],
        "lvert": lvert,
        "orbit": [int(x) for x in block.orbit_of],
        "faceColor": face_color,
        "seed": 0,
    }


def develop_cert(cert, base, l, units, boundR=0.86):
    """One certificate -> one record, or (None, reason, ncombo)."""
    blocks, ncombo, reasons = build_block(cert, units)
    if not blocks:
        return None, "glue: " + "; ".join(sorted(set(reasons))[:2]), ncombo
    good = []
    for block in blocks:
        try:
            verts, E, F = develop_patch(block, l, boundR=boundR)
            ok, res = check_patch(verts, E, F, l)
            if not ok:
                reasons.append("patch not regular: %r" % res)
                continue
            face_of, faces = quotient_faces(block)
            # every quotient face must be a real base face (no digons in the color alphabet)
            if any(f["size"] < 3 for f in faces):
                reasons.append("degenerate face (digon) in a color certificate")
                continue
            darts = emit_darts(block, face_of, faces)
            good.append((block, res, faces, darts))
        except DevelopError as e:
            reasons.append(str(e))
    if not good:
        return None, "develop: " + "; ".join(sorted(set(reasons))[:2]), ncombo
    block, res, faces, darts = good[0]
    census = Counter(COLOR_OF[f["letter"][0]] for f in faces)
    used = sorted(census)
    n_edges = len(block.rneig) // 2
    rec = {
        "k": cert.get("k"),
        "base": base["id"],
        "config": base["label"],
        "colors": len(units),
        "edge": l,
        "certified": True,   # regular {p,q} deck group — the Dirichlet reducer certifies; TS falls back if not
        "tiles": res["faces"],
        "darts": darts,
        "stats": {
            "faceOrbits": len(faces),
            "colorsUsed": len(used),
            "colorCensus": [census.get(c, 0) for c in range(len(units))],
            "edgeOrbits": n_edges,
        },
        "residual": {"edgeErr": res["edgeErr"], "faceEdgeErr": res["faceEdgeErr"]},
    }
    return rec, None, ncombo


# ------------------------------------------------------------------ driver
CERT_NAME = re.compile(r"^(?P<fam>.+)solver_(?P<k>\d+)_(?P<tok>[A-Z0-9]+)(?P<chir>_o)?_(?P<n>\d+)\.txt$")


def run(source, base_id, out_prefix, ncolors=3, ks=None, surjective=False, report_path=None, limit=None, boundR=0.86):
    base = {**BASES[base_id], "id": base_id}
    l, units = alphabet(base, ncolors)
    paths = sorted(glob.glob(os.path.join(source, "*.txt"))) if os.path.isdir(source) else [source]
    by_k = defaultdict(list)
    failures = Counter()
    fail_examples = {}
    multi = 0
    n_certs = 0
    dropped_nonsurj = 0
    t0 = time.time()
    for path in paths:
        m = CERT_NAME.match(os.path.basename(path))
        if not m:
            continue
        k = int(m.group("k"))
        if ks and k not in ks:
            continue
        chiral = bool(m.group("chir"))
        for cert in fd.parse_file(path):
            if limit and n_certs >= limit:
                break
            n_certs += 1
            if cert.get("k") != k:
                failures["certificate k disagrees with the file name"] += 1
                continue
            rec, err, ncombo = develop_cert(cert, base, l, units, boundR=boundR)
            if rec is None:
                failures[err.split(":")[0]] += 1
                fail_examples.setdefault(err.split(":")[0], err)
                continue
            if surjective and rec["stats"]["colorsUsed"] != ncolors:
                dropped_nonsurj += 1
                continue
            if ncombo > 1:
                multi += 1
            rec["chiral"] = chiral
            by_k[k].append(rec)
        if limit and n_certs >= limit:
            break
    elapsed = time.time() - t0

    written = []
    for k in sorted(by_k):
        recs = by_k[k]
        for i, r in enumerate(recs, start=1):
            r["id"] = f"hc{base_id}-{k}-{i:05d}"
            r["name"] = r["id"]
        if out_prefix:
            os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)
            path = f"{out_prefix}-k{k}.json"
            with open(path, "w") as fh:
                json.dump(recs, fh, separators=(",", ":"))
            written.append((path, len(recs), os.path.getsize(path)))

    lines = [f"hyperbolic colored-tiling develop — base {base['label']} ({base_id}), {ncolors} colors, source {source}",
             f"forced edge length l = {l:.12f}",
             f"certificates in : {n_certs}",
             f"developed       : {sum(len(v) for v in by_k.values())}",
             f"failed          : {sum(failures.values())}",
             f"dropped (non-surjective): {dropped_nonsurj}" if surjective else "surjective filter: off",
             f"multi-variant   : {multi}",
             f"wall            : {elapsed:.1f}s ({1000 * elapsed / max(1, n_certs):.1f} ms/cert)",
             ""]
    for reason, n in failures.most_common():
        lines.append(f"   {n:6d}  {reason}   e.g. {fail_examples.get(reason, '')[:100]}")
    lines.append("")
    lines.append(f"{'k':>4} {'colorings':>10} {'colors used (census)':>28}")
    for k in sorted(by_k):
        recs = by_k[k]
        cu = Counter(r["stats"]["colorsUsed"] for r in recs)
        lines.append(f"{k:>4} {len(recs):>10}   {dict(sorted(cu.items()))}")
    for path, n, sz in written:
        lines.append(f"wrote {path}: {n} records, {sz / 1e6:.2f} MB")
    report = "\n".join(lines) + "\n"
    if report_path:
        os.makedirs(os.path.dirname(report_path) or ".", exist_ok=True)
        open(report_path, "w").write(report)
    print(report)
    return by_k, failures


# ------------------------------------------------------------------ selftest
def _selftest():
    for bid in ("37", "73"):
        base = {**BASES[bid], "id": bid}
        l, units = alphabet(base, 3)
        p, q = base["p"], base["q"]
        ang = interior_angle(p, l)
        assert abs(q * ang - TWO_PI) < 1e-10, f"{base['label']} does not close at the solved l"
        assert len(units) == 3 and all(k.endswith(str(p)) for k in units), units
        print(f"[selftest] {base['label']}: l={l:.9f}, {p}-gon angle {math.degrees(ang):.4f}deg, "
              f"alphabet {sorted(units)}")
    print("[selftest] PASS")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?")
    ap.add_argument("--base", default="73", choices=sorted(BASES))
    ap.add_argument("--colors", type=int, default=3)
    ap.add_argument("--out")
    ap.add_argument("--report")
    ap.add_argument("--ks", help="comma-separated k values to decode (default: all present)")
    ap.add_argument("--surjective", action="store_true",
                    help="keep only colorings using EVERY color (drop the re-embedded smaller catalogues)")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--boundR", type=float, default=0.86)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
        return
    if not args.source:
        ap.error("source is required unless --selftest")
    ks = set(int(x) for x in args.ks.split(",")) if args.ks else None
    run(args.source, args.base, args.out, args.colors, ks, args.surjective, args.report, args.limit, args.boundR)


if __name__ == "__main__":
    main()
