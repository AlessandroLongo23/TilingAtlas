#!/usr/bin/env python3
"""Print the TS board tables for the two shelves that carry one row per board, DERIVED from what
actually shipped rather than transcribed by hand.

  * SPH_EDGES_BOARDS  (lib/freedraw/sph-edges.ts)  <- public/spherical-edges/x<board>-k<k>.json
  * HYP_POLY_BOARDS   (lib/tilings/hyp-poly.ts)    <- public/hyperbolic-poly/hp<n>-k<k>.json

Every number comes from a file on disk: the counts from the shards, `dropped` from the develop
report's BUDGET line, `complete` / `missing` from Marek's own census. Re-run it after any develop and
paste the two blocks; a row that disagrees with the shards is then a diff, not an argument.

TWO DIFFERENT "the run stopped here" CLAIMS, kept apart on purpose:

  * `missing` — k values Marek's CENSUS counts and this drop carries no certificates for. The board
    has them; our copy does not. `edges_3337` is the live case: its census records 334,772 tilings at
    k=14 and the zip ships none of them.
  * `complete` — whether the ENUMERATION finished: the census carries Marek's MAX marker, or it
    reaches k = V, which is the ceiling because k counts vertex orbits of a solid with V vertices.
    False means the search stopped where the drop stops and the board may hold more. It is NOT the
    same as `missing` being empty: `edges_4443` has every k its census lists and is still unfinished.

Usage:  emit_board_tables.py [--eager-bytes 1000000]
"""
import argparse
import json
import os
import re
import sys
from collections import defaultdict

_HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
PUB = os.path.join(ROOT, "public")
CORPORA = os.path.join(ROOT, "materials", "corpora")
REPORTS = os.path.join(ROOT, "experiments", "results")

# Which corpus each shipped board came out of — a twin ships as its own board but shares the corpus's
# census, since the solver enumerated both in one run.
CORPUS_OF = {
    "443": "edges_443", "445": "edges_445", "446": "edges_446", "447": "edges_447",
    "448": "edges_448", "663": "edges_663", "664": "edges_664",
    "3334": "edges_3334", "3335": "edges_3335", "3336": "edges_3336", "3337": "edges_3337",
    "33334": "edges_33334",
    "4443": "edges_4443", "j37": "edges_4443",
    "cuboctahedron": "cuboctahedron_edges", "j27": "cuboctahedron_edges",
}


def read_census(corpus):
    """{k: count} plus whether the file carries Marek's MAX marker. None when he shipped no census."""
    path = os.path.join(CORPORA, f"{corpus}_census.txt")
    if not os.path.exists(path):
        return None, False
    text = open(path).read()
    has_max = bool(re.search(r"MAX", text))
    counts = {}
    for m in re.finditer(r"^k=(\d+)\s*--\s*(\d+)\s*$", text, re.M):
        counts[int(m.group(1))] = int(m.group(2))
    return counts, has_max


def load_shards(subdir, pattern):
    """({board: {k: (records, bytes, verts)}}, {board: (config, solid)}) from the shipped shards. The
    label and the solid name come out of the shard the developer wrote, never out of this file."""
    out = defaultdict(dict)
    names = {}
    d = os.path.join(PUB, subdir)
    if not os.path.isdir(d):
        return out, names
    for name in sorted(os.listdir(d)):
        m = pattern.match(name)
        if not m:
            continue
        path = os.path.join(d, name)
        with open(path) as fh:
            shard = json.load(fh)
        # Two shard shapes: the spherical-edge shards wrap their records in a board object (the board
        # ships once per shard), the hyperbolic-poly shards are a bare record list.
        recs = shard if isinstance(shard, list) else shard["patterns"]
        meta = {} if isinstance(shard, list) else shard
        out[m.group(1)][int(m.group(2))] = (
            len(recs), os.path.getsize(path), len(meta.get("vertices", [])))
        names[m.group(1)] = (meta.get("config", "?"), meta.get("solid", "?"))
    return out, names


def split_eager(ks, sizes, eager_bytes, floor_n=0):
    """Small slices load with the geometry; the dense tail waits until its k comes into view."""
    eager = [k for k in ks if sizes[k] < eager_bytes]
    if floor_n:
        eager = ks[:floor_n]
    return eager, [k for k in ks if k not in eager]


def sph_edges(eager_bytes):
    shards, names = load_shards("spherical-edges", re.compile(r"^x(.+)-k(\d+)\.json$"))
    rows, notes = [], []
    for board in sorted(shards, key=lambda b: (len(b), b)):
        per_k = shards[board]
        ks = sorted(per_k)
        verts = per_k[ks[0]][2]
        corpus = CORPUS_OF.get(board)
        census, has_max = read_census(corpus) if corpus else (None, False)

        # `missing` is a CORPUS fact, so it is computed against every board that corpus produced.
        sibling_ks = set()
        for other, ok in shards.items():
            if CORPUS_OF.get(other) == corpus:
                sibling_ks |= set(ok)
        if census:
            missing = sorted(k for k, n in census.items() if n and k not in sibling_ks)
            complete = has_max or max(census) >= verts
        else:
            missing = []
            complete = max(ks) >= verts
            notes.append(f"  // {board}: no census shipped; `complete` rests on k={max(ks)} = V.")

        sizes = {k: per_k[k][1] for k in ks}
        eager, lazy = split_eager(ks, sizes, eager_bytes)
        counts = ", ".join(f"{k}: {per_k[k][0]}" for k in ks)
        big = "".join(f" // k={k} is {sizes[k]/1e6:.1f} MB -> lazy" for k in lazy)
        config, solid = names[board]
        rows.append(
            f'\t{{ id: "{board}", config: "{config}", solid: "{solid}", '
            f"eagerKs: {eager}, lazyKs: {lazy}, "
            f"complete: {'true' if complete else 'false'}, missing: {missing}, "
            f"counts: {{ {counts} }} }},{big}")
        eager_bytes_total = sum(sizes[k] for k in eager)
        notes.append(f"  // {board}: V={verts}, {sum(per_k[k][0] for k in ks)} patterns, "
                     f"eager {eager_bytes_total/1e6:.2f} MB, "
                     f"complete={complete}, missing={missing}")
    return rows, notes


def hyp_poly(eager_n):
    shards, _ = load_shards("hyperbolic-poly", re.compile(r"^hp(\d+)-k(\d+)\.json$"))
    rows, notes = [], []
    for board in sorted(shards, key=lambda b: int(b)):
        per_k = shards[board]
        ks = sorted(per_k)
        sizes = {k: per_k[k][1] for k in ks}
        eager, lazy = split_eager(ks, sizes, 0, floor_n=eager_n)
        dropped = []
        rp = os.path.join(REPORTS, f"ai1-{board}.md")
        if os.path.exists(rp):
            m = re.search(r"DROPPED k = \[([^\]]*)\]", open(rp).read())
            if m and m.group(1).strip():
                dropped = [int(x) for x in m.group(1).split(",")]
        else:
            notes.append(f"  // n={board}: no report at {rp}; `dropped` left empty — CHECK")
        counts = ", ".join(f"{k}: {per_k[k][0]}" for k in ks)
        rows.append(f"\t{{ n: {board}, eagerKs: {eager}, lazyKs: {lazy}, "
                    f"dropped: {dropped}, counts: {{ {counts} }} }},")
        notes.append(f"  // n={board}: {sum(per_k[k][0] for k in ks)} records, "
                     f"{sum(sizes.values())/1e6:.1f} MB, dropped {dropped}")
    return rows, notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--eager-bytes", type=int, default=1_000_000)
    ap.add_argument("--eager-n", type=int, default=5)
    args = ap.parse_args()

    rows, notes = sph_edges(args.eager_bytes)
    print("// ---- SPH_EDGES_BOARDS (lib/freedraw/sph-edges.ts)")
    print("\n".join(rows))
    print("\n".join(notes), file=sys.stderr)
    print()
    rows, notes = hyp_poly(args.eager_n)
    print("// ---- HYP_POLY_BOARDS (lib/tilings/hyp-poly.ts)")
    print("\n".join(rows))
    print("\n".join(notes), file=sys.stderr)


if __name__ == "__main__":
    main()
