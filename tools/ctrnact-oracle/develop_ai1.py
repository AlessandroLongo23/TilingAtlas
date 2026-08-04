#!/usr/bin/env python3
"""Develop Marek Čtrnáct's `ai1_<n>` certificates — the 3.4.n.4 FAMILY of hyperbolic tilings by regular
polygons — into the atlas's Poincaré-disk records.

THE OBJECT, and why it is not an edge system. Fix n and let ℓ be the edge length at which the vertex
figure 3.4.n.4 closes, Σ α(pᵢ, ℓ) = 2π. At that one ℓ, three vertex figures close and no others:

    3.4.n.4        3.4.4.n        4.n.2n

(the first two are the same multiset in two cyclic orders; the third is the identity α(3,ℓ) + α(4,ℓ)
= α(2n, ℓ), which holds to 1e-14 for every n this file ships). So the alphabet is {3, 4, n, 2n} and a
certificate is a k-uniform TILING BY REGULAR POLYGONS, with every edge a real tile boundary and every
face its own tile — there are no digons and nothing merges. That makes this the colored-tiling shape
(develop_hyp_colors.py) with the color replaced by the polygon size, not the edge-system shape.

n = 3, 4, 5 are spherical (cuboctahedron, rhombicuboctahedron, rhombicosidodecahedron) and n = 6 is
Euclidean (the rhombitrihexagonal tiling and 4.6.12); this file refuses them, because `solve_edge_length`
only answers for negative defect. n ≥ 7 is hyperbolic and is what Marek's drop covers: 7…12, 14, 15, 16
(there is no ai1_13 in the drop).

WHAT SHIPS. Darts, re-developed under the live view by lib/render/hyperbolicDevelopClient.ts —
`developColors`, whose contract is exactly this one: fill each developed face by its `faceColor` index
and stroke EVERY edge. Here `faceColor` is the index of the face's size in the board's sorted alphabet
(3 → 0, 4 → 1, n → 2, 2n → 3), so one colour means one polygon size across the whole shelf.

THE VOLUME IS CAPPED, AND THE CAP IS REPORTED. The drop is 232,000 hyperbolic certificates, ~1.5 KB of
darts each; shipping all of them would add ~350 MB to a 734 MB public/. `--budget` ships whole k slices
in ascending k until the budget is spent and names every k it dropped, so a shelf never presents a
truncated k as an exhausted one.

Usage:
    develop_ai1.py <corpus-dir> --n 7 --out public/hyperbolic-poly/hp7 --report ...
    develop_ai1.py --selftest
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
from develop_hyp_edges import build_block, check_patch, develop_patch, quotient_faces, tile_size

TWO_PI = 2 * math.pi

# The boards in Marek's drop. n is the family parameter; everything else is derived.
FAMILY_NS = [7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 23]


def board_of(n):
    """(ℓ, {letter: angle}, alphabet sizes) for the 3.4.n.4 board. The alphabet is {3,4,n,2n} at the ℓ
    that closes 3.4.n.4, and the two other closing figures are ASSERTED at that ℓ, not assumed — if the
    identity α(3)+α(4) = α(2n) ever failed, the 2n-gon would not belong in the alphabet at all."""
    if n < 7:
        raise DevelopError(f"3.4.{n}.4 is not hyperbolic (n = {n}); n >= 7 only")
    l = solve_edge_length([3, 4, n, 4])
    if l is None:
        raise DevelopError(f"3.4.{n}.4 is not hyperbolic")
    sizes = sorted({3, 4, n, 2 * n})
    units = {f"S{p}": interior_angle(p, l) for p in sizes}
    close = units["S3"] + 2 * units["S4"] + units[f"S{n}"]
    if abs(close - TWO_PI) > 1e-9:
        raise DevelopError(f"3.4.{n}.4 does not close at the solved l ({close})")
    omni = units["S4"] + units[f"S{n}"] + units[f"S{2 * n}"]
    if abs(omni - TWO_PI) > 1e-9:
        raise DevelopError(f"4.{n}.{2 * n} does not close at the same l ({omni}) — alphabet is wrong")
    return l, units, sizes


def emit_darts(block, face_of, faces, sizes):
    """The shipped quotient structure: develop_hyp_colors.emit_darts with the color index replaced by
    the polygon-size index. lvert is indexed so the client's alpha(h) = interiorAngle(lvert[rneig[h]])
    reproduces block.step[h] — getting that shift backwards silently rotates every developed tiling, so
    it is asserted here, not commented."""
    n = len(block.rneig)
    lvert = [0] * n
    for h in range(n):
        lvert[block.rneig[h]] = tile_size(block.tile[h])
    for h in range(n):
        if abs(interior_angle(lvert[block.rneig[h]], 1.0)
               - interior_angle(tile_size(block.tile[h]), 1.0)) > 1e-12:
            raise DevelopError("lvert indexing does not reproduce the per-dart angle")
    idx_of = {p: i for i, p in enumerate(sizes)}
    face_color = [idx_of[faces[face_of[h]]["size"]] for h in range(n)]
    return {
        "rneig": [int(x) for x in block.rneig],
        "glue": [int(x) for x in block.glue],
        "lvert": lvert,
        "orbit": [int(x) for x in block.orbit_of],
        "faceColor": face_color,
        "seed": 0,
    }


def develop_cert(cert, n, l, units, sizes, boundR=0.86):
    """One certificate -> one record, or (None, reason, ncombo)."""
    blocks, ncombo, reasons = build_block(cert, units)
    if not blocks:
        return None, "glue: " + "; ".join(sorted(set(reasons))[:2]), ncombo
    for block in blocks:
        try:
            verts, E, F = develop_patch(block, l, boundR=boundR)
            ok, res = check_patch(verts, E, F, l)
            if not ok:
                reasons.append("patch not regular: %r" % res)
                continue
            face_of, faces = quotient_faces(block)
            if any(f["size"] < 3 for f in faces):
                reasons.append("degenerate face (digon) — this is not an edge system")
                continue
            darts = emit_darts(block, face_of, faces, sizes)
        except DevelopError as e:
            reasons.append(str(e))
            continue
        census = Counter(f["size"] for f in faces)
        figures = [".".join(str(tile_size(c)) for c in t["figure"]) for t in cert["types"]]
        return {
            "k": cert.get("k"),
            "base": f"{n}",
            "config": " + ".join(figures),
            "family": f"3.4.{n}.4",
            "edge": l,
            "tiles": res["faces"],
            "darts": darts,
            "stats": {
                "faceOrbits": len(faces),
                "sizes": sizes,
                "sizeCensus": [census.get(p, 0) for p in sizes],
                "vertexOrbits": len(cert["types"]),
            },
            "residual": {"edgeErr": res["edgeErr"], "faceEdgeErr": res["faceEdgeErr"]},
        }, None, ncombo
    return None, "develop: " + "; ".join(sorted(set(reasons))[:2]), ncombo


# ------------------------------------------------------------------ driver
CERT_NAME = re.compile(r"^(?P<fam>.+)solver_(?P<k>\d+)_(?P<tok>[A-Za-z0-9]+?)(?P<chir>_o)?_(?P<n>\d+)\.txt$")


def run(source, n, out_prefix, ks=None, report_path=None, budget=None, boundR=0.86, progress=0):
    l, units, sizes = board_of(n)
    paths = sorted(glob.glob(os.path.join(source, "*.txt"))) if os.path.isdir(source) else [source]

    # Which k slices fit the budget. Decided from the CERTIFICATE COUNT before anything develops, so a
    # long run is never started only to be thrown away, and the dropped tail is named in the report.
    per_k = Counter()
    for path in paths:
        m = CERT_NAME.match(os.path.basename(path))
        if m:
            per_k[int(m.group("k"))] += open(path).read().count("Number of vertices:")
    # A CONTIGUOUS PREFIX, and the first k that does not fit ends it. Skipping an expensive k and taking
    # a cheaper one above it would leave a hole in the middle of the shipped range, which reads as "the
    # board has nothing at that k" — the one thing a partial corpus must never claim.
    order = [k for k in sorted(per_k) if not ks or k in ks]
    wanted, spent, dropped = [], 0, []
    for i, k in enumerate(order):
        if budget and spent + per_k[k] > budget:
            dropped = order[i:]
            break
        wanted.append(k)
        spent += per_k[k]
    wanted = set(wanted)

    by_k = defaultdict(list)
    failures, fail_examples = Counter(), {}
    multi = n_certs = 0
    t0 = time.time()
    for path in paths:
        m = CERT_NAME.match(os.path.basename(path))
        if not m:
            continue
        k = int(m.group("k"))
        if k not in wanted:
            continue
        chiral = bool(m.group("chir"))
        for cert in fd.parse_file(path):
            n_certs += 1
            if progress and n_certs % progress == 0:
                el = time.time() - t0
                print(f"  [{el:6.0f}s] {n_certs}/{spent} developed, {sum(failures.values())} failed, "
                      f"ETA {el * (spent - n_certs) / max(1, n_certs):.0f}s", flush=True)
            if cert.get("k") != k:
                failures["certificate k disagrees with the file name"] += 1
                continue
            rec, err, ncombo = develop_cert(cert, n, l, units, sizes, boundR=boundR)
            if rec is None:
                key = err.split(":")[0]
                failures[key] += 1
                fail_examples.setdefault(key, err)
                continue
            if ncombo > 1:
                multi += 1
            rec["chiral"] = chiral
            by_k[k].append(rec)
    elapsed = time.time() - t0

    written = []
    for k in sorted(by_k):
        recs = by_k[k]
        for i, r in enumerate(recs, start=1):
            r["id"] = f"hp{n}-{k}-{i:05d}"
            r["name"] = r["id"]
        if out_prefix:
            os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)
            path = f"{out_prefix}-k{k}.json"
            with open(path, "w") as fh:
                json.dump(recs, fh, separators=(",", ":"))
            written.append((path, len(recs), os.path.getsize(path)))

    lines = [f"3.4.{n}.4 family develop — tilings by regular {sizes} at one edge length",
             f"source          : {source}",
             f"forced edge len : l = {l:.12f}",
             "angles          : " + ", ".join(f"{p}-gon {math.degrees(units[f'S{p}']):.4f}deg" for p in sizes),
             f"certificates in : {n_certs}",
             f"developed       : {sum(len(v) for v in by_k.values())}",
             f"failed          : {sum(failures.values())}",
             f"multi-variant   : {multi}",
             f"wall            : {elapsed:.1f}s ({1000 * elapsed / max(1, n_certs):.1f} ms/certificate)",
             ""]
    for reason, cnt in failures.most_common():
        lines.append(f"   {cnt:6d}  {reason}   e.g. {fail_examples.get(reason, '')[:110]}")
    lines.append("")
    lines.append(f"{'k':>4} {'tilings':>9} {'face orbits: min':>17} {'max':>6}")
    for k in sorted(by_k):
        fo = [r["stats"]["faceOrbits"] for r in by_k[k]]
        lines.append(f"{k:>4} {len(by_k[k]):>9} {min(fo):>17} {max(fo):>6}")
    if dropped:
        lost = sum(per_k[k] for k in dropped)
        lines.append("")
        lines.append(f"BUDGET: shipped k <= {max(sorted(by_k)) if by_k else 0}; DROPPED k = {dropped} "
                     f"({lost} certificates). Those k are enumerated in the corpus and NOT shipped — "
                     f"the shelf must not present this board as exhausted.")
    for path, cnt, sz in written:
        lines.append(f"wrote {path}: {cnt} records, {sz / 1e6:.2f} MB")
    report = "\n".join(lines) + "\n"
    if report_path:
        os.makedirs(os.path.dirname(report_path) or ".", exist_ok=True)
        open(report_path, "w").write(report)
    print(report)
    return by_k, failures, dropped


# ------------------------------------------------------------------ selftest
def _selftest():
    for n in FAMILY_NS:
        l, units, sizes = board_of(n)
        assert sizes == sorted({3, 4, n, 2 * n}), sizes
        assert l > 0
    print(f"[selftest] {len(FAMILY_NS)} boards: 3.4.n.4, 3.4.4.n and 4.n.2n all close at one l")
    for n in (3, 4, 5, 6):
        try:
            board_of(n)
            raise AssertionError(f"accepted n={n}, which is not hyperbolic")
        except DevelopError:
            pass
    print("[selftest] the spherical (n=3,4,5) and Euclidean (n=6) boards are refused")
    print("[selftest] PASS")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?")
    ap.add_argument("--n", type=int, default=7)
    ap.add_argument("--out")
    ap.add_argument("--report")
    ap.add_argument("--ks")
    ap.add_argument("--budget", type=int, help="max certificates to ship, whole k slices, ascending k")
    ap.add_argument("--boundR", type=float, default=0.86)
    ap.add_argument("--progress", type=int, default=0)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
        return
    if not args.source:
        ap.error("source is required unless --selftest")
    ks = set(int(x) for x in args.ks.split(",")) if args.ks else None
    run(args.source, args.n, args.out, ks, args.report, args.budget, args.boundR, args.progress)


if __name__ == "__main__":
    main()
