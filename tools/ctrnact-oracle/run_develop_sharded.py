#!/usr/bin/env python3
"""Develop a pruned tree in parallel and merge the cells.

develop_spherical.py is one process over one directory, which is the right shape for a few thousand
blocks and the wrong one for a few hundred thousand: the bucketed k=2 run on star-wide emits 422,206,
and a block is completely independent of every other block, so this hands each worker a directory of
symlinks and merges the JSON at the end. Measured single-thread rate on that run: ~23 blocks/s.

Usage: python3 run_develop_sharded.py --palette star-wide --pruned <dir> --out <cells.json> \
           --workers 8 --kmin 2 --kmax 2 --log <logfile>
"""
import argparse, glob, json, os, subprocess, sys, time

_HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--palette", required=True)
    ap.add_argument("--pruned", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--kmin", type=int, default=2)
    ap.add_argument("--kmax", type=int, default=2)
    ap.add_argument("--maxdens", type=int, default=3)
    ap.add_argument("--log", default=None)
    ap.add_argument("--developer", default="develop_spherical.py",
                    help="develop_spherical.py (on S2) or develop_euclid.py (dihedral angles in R3)")
    args = ap.parse_args()
    logf = open(args.log, "w") if args.log else None

    def log(m):
        line = "[%s] %s" % (time.strftime("%H:%M:%S"), m)
        print(line, flush=True)
        if logf:
            logf.write(line + "\n"); logf.flush()

    files = sorted(glob.glob(os.path.join(args.pruned, "eupruned_*.txt")),
                   key=lambda p: -os.path.getsize(p))          # biggest first: better load balance
    if not files:
        sys.exit("no pruned files under " + args.pruned)
    blocks = sum(1 for f in files for l in open(f) if l.startswith("TES file:"))
    # Scratch keyed to the OUTPUT FILE, not its directory. Two runs sharing a directory used to share
    # this one, and the second run silently emptied the first's shard dirs and truncated its progress
    # files: the workers already hold their blocks in memory so the run survives, but the per-worker
    # cells JSON collides and whichever finishes last wins. (2026-08-20, caught while it was happening.)
    work = os.path.abspath(args.out) + ".shards"
    os.makedirs(work, exist_ok=True)
    shards = []
    for w in range(args.workers):
        d = os.path.join(work, "w%d" % w)
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d):
            os.unlink(os.path.join(d, f))
        shards.append(d)
    for i, f in enumerate(files):
        os.symlink(os.path.abspath(f), os.path.join(shards[i % args.workers], os.path.basename(f)))
    log("%d files / %d blocks over %d workers" % (len(files), blocks, args.workers))

    procs = []
    t0 = time.time()
    for w, d in enumerate(shards):
        cells = os.path.join(work, "cells-w%d.json" % w)
        rep = os.path.join(work, "report-w%d.txt" % w)
        env = dict(os.environ, EU_PALETTE=args.palette, EU_MAXDENS=str(args.maxdens))
        p = subprocess.Popen([sys.executable, os.path.join(_HERE, args.developer),
                              "--kmin", str(args.kmin), "--kmax", str(args.kmax),
                              "--pruned", d, "--out", cells, "--report", rep],
                             env=env, stdout=subprocess.DEVNULL,
                             stderr=open(os.path.join(work, "progress-w%d.txt" % w), "w"))
        procs.append((w, p, cells))
    for w, p, cells in procs:
        p.wait()
        log("  worker %d finished (%.0fs)" % (w, time.time() - t0))
    recs = []
    for w, p, cells in procs:
        if os.path.exists(cells):
            recs.extend(json.load(open(cells)))
    json.dump(recs, open(args.out, "w"))
    log("merged %d realized records -> %s (%.0fs total)" % (len(recs), args.out, time.time() - t0))


if __name__ == "__main__":
    main()
