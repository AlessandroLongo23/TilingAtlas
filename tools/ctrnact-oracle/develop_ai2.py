#!/usr/bin/env python3
"""Develop Marek Čtrnáct's `ai2_<n>` certificates — the {3,n} FAMILY of hyperbolic tilings by regular
triangles and n-gons — into the atlas's Poincaré-disk records.

THE OBJECT, and the identity that makes the family. Fix n and let ℓ be the edge length of the REGULAR
tiling {3,n}, i.e. the ℓ solving n·α(3,ℓ) = 2π. At that one ℓ the n-gon's interior angle is exactly
twice the triangle's:

    α(3,ℓ) = 2π/n     and     α(n,ℓ) = 4π/n = 2·α(3,ℓ)

which is an identity, not a coincidence: α(p,ℓ) = 2·asin(cos(π/p)/cosh(ℓ/2)), so α(3) = 2π/n gives
0.5/cosh(ℓ/2) = sin(π/n), and then cos(π/n)/cosh(ℓ/2) = 2·sin(π/n)·cos(π/n) = sin(2π/n) — exactly the
sine the n-gon needs for the angle 4π/n. board_of asserts it instead of assuming it.

So the alphabet is {3, n}, and a vertex figure closes iff

    a + 2b = n          (a triangles, b n-gons)

which for n = 7 gives 3^7, 3^5.7, 3.3.7.3.7 and 3.7.7.7, and for n = 12 gives everything from 3^12 to
12^6 = {12,6}. Marek's certificates list one figure per SITE ORBIT under the vertex's own rotation, so
the listed multiset satisfies (a + 2b)·r = n with r the rotation order — the same compression his edge
solvers use, and develop_hyp_edges' build_block already recovers r as 2π / Σα(listed).

A certificate is therefore a k-uniform TILING BY REGULAR POLYGONS: every edge is a real tile boundary,
every face is its own tile, nothing merges and there are no digons. That is the same shape as ai1
(3.4.n.4), so this file is develop_ai1.py with a different board and a different alphabet, and it
ships onto the same shelf.

n ≤ 5 is spherical (n = 3 tetrahedron, 4 octahedron, 5 icosahedron) and n = 6 is Euclidean (the
triangle-hexagon tilings, which the Euclidean regular-palette catalogue already covers); this file
refuses both, because solve_edge_length only answers for negative defect. n ≥ 7 is hyperbolic and is
what Marek's ai2 drop covers: 7…15, contiguous.

BOARD IDS ARE PREFIXED `t`. The hyperbolic-poly shelf already keys boards by the bare n for the
3.4.n.4 family, so this family's boards are `t7`, `t8`, … ("t" for the triangle board {3,n}) and the
shards are hpt7-k1.json beside hp7-k1.json. Same shelf, no collision.

THE VOLUME IS CAPPED, AND THE CAP IS REPORTED. 601,437 hyperbolic certificates at ~1 KB of darts each.
`--budget` ships whole k slices in ascending k until the budget is spent and names every k it dropped,
so a shelf never presents a truncated k as an exhausted one.

Usage:
    develop_ai2.py <corpus-dir> --n 7 --out public/hyperbolic-poly/hpt7 --report ...
    develop_ai2.py --selftest
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
from develop_ai1 import emit_darts
from develop_hyperbolic import interior_angle, solve_edge_length
from develop_hyp_edges import build_block, check_patch, develop_patch, quotient_faces, tile_size

TWO_PI = 2 * math.pi

# The boards in Marek's drop, contiguous. n < 7 is not hyperbolic and is refused by board_of.
FAMILY_NS = [7, 8, 9, 10, 11, 12, 13, 14, 15]


def board_of(n):
    """(ℓ, {letter: angle}, alphabet sizes) for the {3,n} board. ℓ is the regular tiling's own edge
    length; the n-gon then has exactly twice the triangle's angle, which is what lets the alphabet
    {3, n} close a vertex in more than one way. Both facts are asserted, not assumed."""
    if n < 7:
        raise DevelopError(f"{{3,{n}}} is not hyperbolic (n = {n}); n >= 7 only")
    l = solve_edge_length([3] * n)
    if l is None:
        raise DevelopError(f"{{3,{n}}} is not hyperbolic")
    sizes = [3, n]
    units = {f"A{p}": interior_angle(p, l) for p in sizes}
    if abs(n * units["A3"] - TWO_PI) > 1e-9:
        raise DevelopError(f"{{3,{n}}} does not close at the solved l ({n * units['A3']})")
    if abs(units[f"A{n}"] - 2 * units["A3"]) > 1e-9:
        raise DevelopError(f"the {n}-gon is not two triangles' worth of angle at this l "
                           f"({math.degrees(units[f'A{n}'])} vs {math.degrees(2 * units['A3'])}) "
                           f"— the alphabet is wrong")
    return l, units, sizes


def full_figure(figure, units):
    """The vertex figure as a full cycle, "3.3.3.3.3.3.3", from the SITE-ORBIT rep the certificate
    lists. Marek lists one corner per orbit under the vertex's own rotation, so `(A3)D14a` is a rep of
    3^7, not a monogon; printing the rep as the configuration would put "3" on the card for the regular
    tiling {3,7}. The order is the same one build_block derives and checks against the site tag."""
    s = sum(units[c] for c in figure)
    r = round(TWO_PI / s) if s > 1e-9 else 1
    return ".".join(str(tile_size(c)) for c in list(figure) * max(1, r))


def develop_cert(cert, n, l, units, sizes, boundR=0.86):
    """One certificate -> one record, or (None, reason, ncombo). Identical in shape to develop_ai1's:
    the only board-dependent things are the alphabet and the id."""
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
            if any(f["size"] not in (3, n) for f in faces):
                reasons.append("face outside the alphabet {3, %d}" % n)
                continue
            darts = emit_darts(block, face_of, faces, sizes)
        except DevelopError as e:
            reasons.append(str(e))
            continue
        census = Counter(f["size"] for f in faces)
        figures = [full_figure(t["figure"], units) for t in cert["types"]]
        return {
            "k": cert.get("k"),
            "base": f"t{n}",
            "config": " + ".join(figures),
            "family": f"{{3,{n}}}",
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


def read_census(source):
    """{k: count} from the corpus's own solution_list.txt, or None when the drop shipped none. Marek's
    ai2 censuses carry no MAX line at all, so they never say the enumeration finished — they only give
    a per-k count to check the files against, and sometimes a count for a k the drop does not carry
    (n = 11 at k = 3, n = 14 at k = 2). That difference is the shelf's `missing`."""
    path = os.path.join(source, "solution_list.txt")
    if not os.path.isdir(source) or not os.path.exists(path):
        return None
    text = open(path).read()
    return {int(m.group(1)): int(m.group(2)) for m in re.finditer(r"^k=(\d+)\s*--\s*(\d+)\s*$", text, re.M)}


def run(source, n, out_prefix, ks=None, report_path=None, budget=None, boundR=0.86, progress=0):
    l, units, sizes = board_of(n)
    paths = sorted(glob.glob(os.path.join(source, "*.txt"))) if os.path.isdir(source) else [source]

    # Which k slices fit the budget. Decided from the CERTIFICATE COUNT before anything develops, and
    # taken as a CONTIGUOUS PREFIX — skipping an expensive k to take a cheaper one above it would leave
    # a hole that reads as "the board has nothing at that k", the one thing a partial corpus must never
    # claim.
    per_k = Counter()
    for path in paths:
        m = CERT_NAME.match(os.path.basename(path))
        if m:
            per_k[int(m.group("k"))] += open(path).read().count("Number of vertices:")
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
            r["id"] = f"hpt{n}-{k}-{i:05d}"
            r["name"] = r["id"]
        if out_prefix:
            os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)
            path = f"{out_prefix}-k{k}.json"
            with open(path, "w") as fh:
                json.dump(recs, fh, separators=(",", ":"))
            written.append((path, len(recs), os.path.getsize(path)))

    census = read_census(source)
    lines = [f"{{3,{n}}} family develop — tilings by regular triangles and {n}-gons at one edge length",
             f"source          : {source}",
             f"forced edge len : l = {l:.12f}",
             "angles          : " + ", ".join(
                 f"{p}-gon {math.degrees(units[f'A{p}']):.4f}deg" for p in sizes),
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

    # The census check, printed whether it agrees or not: a develop that silently ships fewer tilings
    # than Marek counted is the failure this catches.
    lines.append("")
    if census is None:
        lines.append("census          : none shipped with this corpus — the per-k counts above are "
                     "unchecked, and `missing` is UNKNOWN, not empty.")
    else:
        lines.append(f"{'k':>4} {'census':>9} {'corpus':>9} {'shipped':>9}  status")
        for k in sorted(set(census) | set(per_k)):
            c, p, s = census.get(k, 0), per_k.get(k, 0), len(by_k.get(k, []))
            if p == 0:
                status = "MISSING from the drop (census counts it, no certificates)"
            elif c and c != p:
                status = f"MISMATCH: corpus has {p}, census says {c}"
            elif s == 0:
                status = "dropped by the budget"
            elif s != p:
                status = f"DEVELOP LOSS: {p - s} certificates did not develop"
            else:
                status = "ok"
            lines.append(f"{k:>4} {c:>9} {p:>9} {s:>9}  {status}")
        gone = sorted(k for k, c in census.items() if c and not per_k.get(k))
        if gone:
            lines.append(f"MISSING (census counts, drop does not carry): k = {gone} "
                         f"({sum(census[k] for k in gone)} tilings)")

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
        assert sizes == [3, n], sizes
        assert l > 0
        # Every figure the rule admits must close at this l, to machine precision.
        for b in range(n // 2 + 1):
            a = n - 2 * b
            if a < 0:
                continue
            tot = a * units["A3"] + b * units[f"A{n}"]
            assert abs(tot - TWO_PI) < 1e-9, (n, a, b, tot)
    print(f"[selftest] {len(FAMILY_NS)} boards: the {{3,n}} edge length makes the n-gon exactly two "
          f"triangles, and every a + 2b = n vertex closes")
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
