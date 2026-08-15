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
  * `complete` — whether the ENUMERATION finished: the census reaches its ceiling, which is the MAX
    the census declares, or k = V when it declares none, V being the ceiling because k counts vertex
    orbits of a solid with V vertices. False means the search stopped where the drop stops and the
    board may hold more. It is NOT the same as `missing` being empty: `edges_4443` has every k its
    census lists and is still unfinished. See read_census for Marek's two MAX markers.

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
    "448": "edges_448", "4410": "edges_4410", "4411": "edges_4411",
    "663": "edges_663", "664": "edges_664", "665": "edges_665",
    "3334": "edges_3334", "3335": "edges_3335", "3336": "edges_3336", "3337": "edges_3337",
    "3339": "edges_3339", "33310": "edges_33310",
    "33334": "edges_33334", "33335": "edges_33335",
    "4435": "edges_4435", "j72": "edges_4435", "j73": "edges_4435", "468": "edges_468",
    "4443": "edges_4443", "j37": "edges_4443",
    "cuboctahedron": "cuboctahedron_edges", "j27": "cuboctahedron_edges",
}


def read_census(corpus):
    """{k: count}, the ceiling the census declares, and whether the run reached its end.

    Marek writes TWO different MAX markers and they mean opposite things. A trailing bare `MAX` line
    (edges_443, edges_663) says the enumeration finished. A header `MAX=<n>` (edges_445, edges_665)
    only declares the ceiling, which is the solid's vertex count — `edges_665` carries `MAX=60` and
    stops at k=16, so reading any MAX as "finished" would have shipped a 60-vertex board that ran to
    a quarter of its range as a complete catalogue. Returns None for the counts when there is no
    census at all."""
    path = os.path.join(CORPORA, f"{corpus}_census.txt")
    if not os.path.exists(path):
        return None, None
    text = open(path).read()
    finished = bool(re.search(r"^MAX\s*$", text, re.M))
    declared = re.search(r"MAX=(\d+)", text)
    counts = {}
    for m in re.finditer(r"^k=(\d+)\s*--\s*(\d+)\s*$", text, re.M):
        counts[int(m.group(1))] = int(m.group(2))
    ceiling = 0 if finished else int(declared.group(1)) if declared else None
    return counts, ceiling


# A certificate file name, both families: `ai1_13solver_20_S3S4S13Sq_31.txt`, `ai2_9solver_03_A3A9_7.txt`.
POLY_CERT = re.compile(r"^.+solver_(\d+)_[A-Za-z0-9]+?(?:_o)?_\d+\.txt$")


def poly_corpus(board):
    """({k: certificates the drop CARRIES}, {k: count the census claims} or None) for one hyp-poly board.

    Read off the corpus directory, not the report, so `missing` is computed the same way for both
    families and for boards whose report predates the check. No solution_list.txt at all returns None
    for the census — which must print as no `missing` field, since absent means UNKNOWN."""
    n = board.lstrip("t")
    cdir = os.path.join(CORPORA, f"solver_ai2_{n}" if board.startswith("t") else f"ai1_{n}")
    if not os.path.isdir(cdir):
        return None, None
    have = defaultdict(int)
    for name in sorted(os.listdir(cdir)):
        m = POLY_CERT.match(name)
        if m:
            with open(os.path.join(cdir, name)) as fh:
                have[int(m.group(1))] += fh.read().count("Number of vertices:")
    path = os.path.join(cdir, "solution_list.txt")
    if not os.path.exists(path):
        return have, None
    text = open(path).read()
    census = {int(m.group(1)): int(m.group(2))
              for m in re.finditer(r"^k=(\d+)\s*--\s*(\d+)\s*$", text, re.M)}
    return have, census


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
        census, ceiling = read_census(corpus) if corpus else (None, None)

        # `missing` is a CORPUS fact, so it is computed against every board that corpus produced.
        sibling_ks = set()
        for other, ok in shards.items():
            if CORPUS_OF.get(other) == corpus:
                sibling_ks |= set(ok)
        if census:
            missing = sorted(k for k, n in census.items() if n and k not in sibling_ks)
            # `ceiling` is 0 when the census says the run finished, the declared MAX when it
            # declares one, and None when it says neither — in which case the solid's own
            # vertex count is the ceiling, since k counts vertex orbits.
            complete = max(census) >= (verts if ceiling is None else ceiling)
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


def hyp_poly(eager_n, eager_bytes):
    """Both families on the hyperbolic-poly shelf: `hp<n>` is ai1 (3.4.n.4) and `hpt<n>` is ai2 ({3,n}).
    They differ in three places and nowhere else — the id, the report the BUDGET line comes from, and
    the eager rule. ai1's slices are tiny at every k, so its five lowest load eagerly; ai2's k slices
    reach 12 MB, so its eager set is chosen by BYTES like the spherical-edge shelf's."""
    shards, _ = load_shards("hyperbolic-poly", re.compile(r"^hp(t?\d+)-k(\d+)\.json$"))
    rows, notes = [], []
    for board in sorted(shards, key=lambda b: (b.startswith("t"), int(b.lstrip("t")))):
        ai2 = board.startswith("t")
        n = int(board.lstrip("t"))
        per_k = shards[board]
        ks = sorted(per_k)
        sizes = {k: per_k[k][1] for k in ks}
        eager, lazy = (split_eager(ks, sizes, eager_bytes) if ai2
                       else split_eager(ks, sizes, 0, floor_n=eager_n))
        dropped = []
        rp = os.path.join(REPORTS, f"ai{2 if ai2 else 1}-{n}.md")
        if os.path.exists(rp):
            m = re.search(r"DROPPED k = \[([^\]]*)\]", open(rp).read())
            if m and m.group(1).strip():
                dropped = [int(x) for x in m.group(1).split(",")]
        else:
            notes.append(f"  // n={board}: no report at {rp}; `dropped` left empty — CHECK")

        # `missing` is a CORPUS fact: the census counts those k and the drop carries no certificates
        # for them. Computed against the corpus directory, never against what the budget shipped — a k
        # we chose not to develop is `dropped`, which is a different claim. No census leaves it None
        # and prints no field, since absent means UNKNOWN and never "none".
        have, census = poly_corpus(board)
        missing = None
        if census is not None:
            missing = sorted(k for k, c in census.items() if c and not have.get(k))
            for k, c in sorted(census.items()):
                if c and have.get(k) and have[k] != c:
                    notes.append(f"  // {board}: k={k} census {c} vs corpus {have[k]} — MISMATCH")
        elif have is None:
            notes.append(f"  // {board}: corpus directory not found; `missing` left absent")
        counts = ", ".join(f"{k}: {per_k[k][0]}" for k in ks)
        label = f"{{3,{n}}}" if ai2 else f"3.4.{n}.4"
        miss = "" if missing is None else f"missing: {missing}, "
        rows.append(f'\t{{ id: "{board}", n: {n}, label: "{label}", '
                    f'family: "{"ai2" if ai2 else "ai1"}", eagerKs: {eager}, lazyKs: {lazy}, '
                    f"dropped: {dropped}, {miss}counts: {{ {counts} }} }},")
        notes.append(f"  // {board}: {sum(per_k[k][0] for k in ks)} records, "
                     f"{sum(sizes.values())/1e6:.1f} MB, eager "
                     f"{sum(sizes[k] for k in eager)/1e6:.2f} MB, dropped {dropped}, missing {missing}")
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
    rows, notes = hyp_poly(args.eager_n, args.eager_bytes)
    print("// ---- HYP_POLY_BOARDS (lib/tilings/hyp-poly.ts)")
    print("\n".join(rows))
    print("\n".join(notes), file=sys.stderr)


if __name__ == "__main__":
    main()
