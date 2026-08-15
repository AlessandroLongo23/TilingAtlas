#!/usr/bin/env python3
"""Order-insensitive digest of a pruned catalog directory — the right way to compare two runs.

`shasum` over the concatenated eupruned_*.txt is NOT a valid catalog comparison, and the claim in
run-oracle-parallel.sh's header that a sharded run is "byte-identical" to a sequential one is false.
Measured on star24full k=1 (2026-08-06): sequential, 10 shards and 200 shards all produce the same 44
blocks, but the sequential run orders the two blocks of eupruned_01_36.txt the other way round, so the
raw shas differ (d2da5fc0… vs 62fedb90…). The solver writes blocks in DFS order over first vertex
types; sharding groups them by shard first. Same set, different order.

That mattered less than it looks only because every fixpoint gate so far compared runs at the SAME
shard count. Compare across shard counts — which the pool runner makes routine — and a byte
comparison reports a difference that is not one.

The digest here hashes the SET of (family file, block text) pairs, sorted. Two catalogs agree iff
they contain the same blocks in the same files, whatever order they were written in.

⚑ THAT INVARIANCE HOLDS ACROSS SHARD COUNTS, NOT ACROSS SHARD DEPTHS (measured 2026-08-12).
`EU_SHARD_D2 > 1` cuts inside a root's branches, which changes the order the pruner MEETS isomorphic
assemblies in, and it keeps whichever it meets first. On regular-doubled k=5, D2=1 and D2=16 both give
4971 blocks with an identical vertex-type-line multiset, but 789 of them differ in the final gluing
word — the same tiling written from a different representative — so this digest reports DIFFER for two
catalogs that describe the same set of tilings. It is not wrong; it is answering a narrower question
than "are these the same catalogue".

To compare across depths, use the pruner as its own isomorphism oracle: concatenate both runs' raw
`eusolver_*.txt` into one directory and re-prune it. If the union's per-k counts equal each run's own,
neither holds a class the other lacks. Cheap, and it tests the thing you actually care about.

Usage:
    catalog_digest.py <pruned-dir> [<pruned-dir> ...]     # print a digest per directory
    catalog_digest.py --diff A/pruned B/pruned            # exit 1 and show the difference
"""
import argparse
import glob
import hashlib
import os
import sys


def catalog(d):
    """{(family file, block text)} for one pruned directory."""
    out = set()
    files = sorted(glob.glob(os.path.join(d, "eupruned_*.txt")))
    if not files:
        raise SystemExit(f"no eupruned_*.txt under {d}")
    for f in files:
        base = os.path.basename(f)
        for b in open(f).read().split("---"):
            b = b.strip()
            if b:
                out.add((base, b))
    return out


def digest(blocks):
    joined = "\n".join(f"{f}\0{b}" for f, b in sorted(blocks))
    return hashlib.sha256(joined.encode()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dirs", nargs="+")
    ap.add_argument("--diff", action="store_true", help="compare exactly two directories")
    args = ap.parse_args()

    if args.diff:
        if len(args.dirs) != 2:
            ap.error("--diff takes exactly two directories")
        a, b = (catalog(d) for d in args.dirs)
        if a == b:
            print(f"IDENTICAL — {len(a)} blocks, digest {digest(a)[:16]}")
            return
        only_a, only_b = a - b, b - a
        print(f"DIFFER — {len(a)} vs {len(b)} blocks; {len(only_a)} only in first, {len(only_b)} only in second")
        for label, s in (("only in " + args.dirs[0], only_a), ("only in " + args.dirs[1], only_b)):
            for f, blk in sorted(s)[:10]:
                print(f"  [{label}] {f}: {blk.splitlines()[0]}")
        sys.exit(1)

    for d in args.dirs:
        c = catalog(d)
        print(f"{digest(c)[:16]}  {len(c):6d} blocks  {d}")


if __name__ == "__main__":
    main()
