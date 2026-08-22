#!/usr/bin/env python3
"""Run the k-orbit search one rho bucket at a time, and merge the pruned blocks into one directory.

Was k=2 only; --k picks the orbit count now. Nothing about the decomposition is specific to two orbits.

The exhaustive k=2 search over a star palette, decomposed. rho_buckets.py has already grouped the
vertex configs by the edge arc they close at; a k=2 tiling has BOTH orbits in one group, so searching
each group separately and taking the union loses nothing, while never enumerating the cross-group
pairs that are 99.99% of the alphabet's product and all geometrically dead.

Per bucket: slice the alphabet (slice_tables), run eu_solver_rt on the slice, prune with the palette's
own eu_pruner, copy the surviving k=2 blocks into the merged tree under a bucket-unique name. The full
tables.bin is parsed ONCE here, not once per bucket, which is the difference between minutes and hours.

Afterwards, develop the merged tree — through the WORK QUEUE, not one process. The star-wide k=2 run
merges 422,206 blocks and develop was doing them one at a time on one core; blocks are independent and
their costs are wildly uneven, so this is the one place in the pipeline where parallelism is free:

    python3 run_develop_sharded.py --palette <pal> --maxdens 3 --kmin 2 --kmax 2 \
        --developer develop_spherical.py --workers 10 \
        --pruned <out>/pruned --out <out>/cells.json

The output is identical to the single-process path: the duplicate collapse and the ordering both live
in develop_spherical.finalise_records, which both callers use.

Buckets are independent, so --workers runs several at once; the merged catalogue does not
depend on the worker count.

Usage: python3 run_k2_buckets.py --palette star-wide --buckets buckets.json --out run-k2-star-wide \\
           --k 3 --workers 10
"""
import argparse, json, multiprocessing as mp, os, shutil, subprocess, sys, time

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
import slice_tables as st


def _run_bucket_fused(i, bdir, solver, pruner, k, merged, nocycles, t0):
    """Solve and prune ONE bucket through a PIPE: the raw blocks never reach the disk.

    Why it exists: k=4 star-wide is a projected 1.2e10 raw blocks at 348 B each, 4.1 TB of scratch,
    on a machine with 0.57 TB free. The fuse writes none of it. Measured on b03228 at k=4, shard
    0/128 (1,991,043 blocks, 0.80 GB, 1,847,795 kept): 27.80 s and 0.80 GB written the file way,
    17.72 s and nothing written this way, same kept count to the block.

    ⚑ It is only faster since eu_pruner's stream path was fixed (2026-08-22): before that it read
    std::cin one character at a time through libc++'s __stdinbuf and ran the pre-canonical-form
    dedup, and the same A/B was 86.21 s, 3.1x SLOWER than the file path.

    The pruner in EU_STREAM mode writes one file per k (`eupruned_04.txt`), not one per family, so
    the merged name has no family part. Nothing downstream cares: develop's block_files globs
    `eupruned_<NN>_*.txt` and sorts.
    """
    outdir = os.path.join(bdir, "out")
    env = dict(os.environ, EU_TABLES=os.path.join(bdir, "tables.bin"), EU_STREAM="1")
    if nocycles:
        env["EU_NOCYCLES"] = "1"
    p1 = subprocess.Popen([solver], cwd=bdir, env=env, stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL)
    p2 = subprocess.Popen([pruner], cwd=bdir, stdin=p1.stdout, stdout=subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL,
                          env=dict(os.environ, EU_STREAM="1", EU_KONLY=str(k), EU_OUT=outdir,
                                   EU_SKIP_MINIMALITY="1"))
    p1.stdout.close()            # the parent must drop its handle or the pruner never sees EOF
    p2.wait(); p1.wait()
    kept = 0
    pdir = os.path.join(outdir, "pruned")
    pref = "eupruned_%02d" % k
    if os.path.isdir(pdir):
        for f in sorted(os.listdir(pdir)):
            if not f.startswith(pref):
                continue
            n = sum(1 for l in open(os.path.join(pdir, f)) if l.startswith("TES file:"))
            if not n:
                continue
            kept += n
            tail = f[len(pref) + 1:]                     # "" for the stream path's eupruned_NN.txt
            name = "%s_b%05d.txt" % (pref, i) if tail in ("", "txt") \
                else "%s_b%05d_%s" % (pref, i, tail)
            shutil.copy(os.path.join(pdir, f), os.path.join(merged, name))
    shutil.rmtree(bdir, ignore_errors=True)
    return i, kept, kept, time.time() - t0            # raw is not counted: it was never written


def _run_bucket_piped(i, bdir, solver, pruner, k, nocycles, palette, maxdens, devdir, t0):
    """Solve, prune AND develop ONE bucket through a three-stage pipe. Nothing but certificates lands.

    solver --EU_STREAM--> pruner --EU_PRUNED_STDOUT--> develop_spherical --stdin

    WHY IT EXISTS. `--fuse` removes the RAW blocks (a projected 4.1 TB at k=4). This removes the other
    term: the pruned catalogue, 5.2e9 blocks at ~348 B, a projected 1.8 TB against 0.57 TB free. That
    catalogue is written once and read once, and eu_sphfill throws away 99.973% of it, so 1.8 TB of
    disk buys the pipeline nothing at all. Here the pruner's kept blocks go straight into the
    prefilter and the only thing that reaches disk is one small JSON of certificates per bucket.

    ⚑ What this does NOT do is make the run faster in any material way, and the honest reason is that
    the I/O was never the cost. At k=3 the pruned tree is 10 GB written across a 179 s search and read
    back across a 20-minute develop, a few tens of MB/s either way. The win is that k=4 FITS.

    ⚑ Same caveat as --fuse, for the same reason: the pruner keeps the FIRST block of each isomorphism
    class it sees and the pipe presents blocks in the solver's DFS order, so the surviving
    representatives can differ in text from a file run. The developed geometry does not.
    """
    devenv = dict(os.environ, EU_PALETTE=palette, EU_MAXDENS=str(maxdens))
    env = dict(os.environ, EU_TABLES=os.path.join(bdir, "tables.bin"), EU_STREAM="1")
    if nocycles:
        env["EU_NOCYCLES"] = "1"
    out_json = os.path.join(devdir, "b%05d.json" % i)
    p1 = subprocess.Popen([solver], cwd=bdir, env=env, stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL)
    p2 = subprocess.Popen([pruner], cwd=bdir, stdin=p1.stdout, stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL,
                          env=dict(os.environ, EU_STREAM="1", EU_KONLY=str(k),
                                   EU_PRUNED_STDOUT="1", EU_SKIP_MINIMALITY="1"))
    p1.stdout.close()            # the parent must drop its handle or the pruner never sees EOF
    p3 = subprocess.Popen([sys.executable, os.path.join(_HERE, "develop_spherical.py"),
                           "--stdin", "--out", out_json, "--report", os.devnull],
                          cwd=_HERE, env=devenv, stdin=p2.stdout,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    p2.stdout.close()            # …and again for the second seam
    p3.wait(); p2.wait(); p1.wait()
    n = 0
    if os.path.exists(out_json):
        try:
            n = len(json.load(open(out_json)))
        except Exception:
            n = 0
        if not n:
            os.remove(out_json)                          # do not leave 3,906 empty files behind
    shutil.rmtree(bdir, ignore_errors=True)
    return i, n, n, time.time() - t0


def _run_bucket(job):
    """Solve + prune ONE bucket. Runs in a worker; the slice is already on disk.

    Buckets are completely independent — separate alphabets, separate solver processes, separate
    pruner stores — so this is the same free parallelism run_develop_sharded.py already uses one
    stage later. The merged file NAMES do not depend on which worker ran which bucket, and
    develop_spherical.gather_blocks sorts them, so the merged catalogue is identical to a serial run.
    """
    i, bdir, solver, pruner, k, merged, nocycles, pshards, pmin, fuse, palette, maxdens, devdir = job
    t0 = time.time()
    tb = os.path.join(bdir, "tables.bin")
    if devdir:
        return _run_bucket_piped(i, bdir, solver, pruner, k, nocycles, palette, maxdens, devdir, t0)
    if fuse:
        return _run_bucket_fused(i, bdir, solver, pruner, k, merged, nocycles, t0)
    # EU_NOCYCLES: the raw blocks written here are read by exactly one thing, the pruner two lines
    # down, and it skips the face-cycle text. Dropping it takes a block from 710 bytes to 267 and
    # the solver from 3.46s to 2.13s on b00002, with the PRUNED output byte-identical (verified).
    env = dict(os.environ, EU_TABLES=tb)
    if nocycles:
        env["EU_NOCYCLES"] = "1"
    subprocess.run([solver], cwd=bdir, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    outdir = os.path.join(bdir, "out")
    raw = len([f for f in os.listdir(outdir) if f.startswith("eusolver_")])
    kept = 0
    if raw:
        # EU_SKIP_MINIMALITY: this function produced the blocks itself, two lines up, with eu_solver,
        # whose simplify_inner already applied the minimality test at every closure. Measured: the
        # pruner's copy rejected 0 of 3,836,914 blocks on b00118, and skipping it is 36.5s -> 30.6s
        # there. If the assumption ever breaks a non-minimal block survives and the catalogue GROWS,
        # which the goldens catch — a loud failure, not a lost tiling.
        penv = dict(os.environ, EU_OUT=outdir, EU_KMIN=str(k), EU_KMAX=str(k),
                    EU_SKIP_MINIMALITY="1")
        # SHARD THE PRUNER on the big buckets only. The whole k=3 run is 359 s and ONE bucket is
        # 224 s of it, almost all of it pruning — 3.85M blocks, 99% of them in a single family, so
        # there is nothing to split at the file level. eu_pruner shards on its own dedup key instead
        # (EU_SIGSHARD_N/W), which is exact. Small buckets stay single-process: sharding costs every
        # shard a full decode pass, so it only pays where there is a lot to divide.
        nbytes = sum(os.path.getsize(os.path.join(outdir, f)) for f in os.listdir(outdir)
                     if f.startswith("eusolver_"))
        if pshards > 1 and nbytes >= pmin * 1048576:
            procs = [subprocess.Popen([pruner], cwd=bdir, stdout=subprocess.DEVNULL,
                                      stderr=subprocess.DEVNULL,
                                      env=dict(penv, EU_SIGSHARD_N=str(pshards), EU_SIGSHARD_W=str(w)))
                     for w in range(pshards)]
            for q in procs:
                q.wait()
        else:
            subprocess.run([pruner], cwd=bdir, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, env=penv)
        pdir = os.path.join(outdir, "pruned")
        if os.path.isdir(pdir):
            pref = "eupruned_%02d" % k
            for f in sorted(os.listdir(pdir)):
                if not f.startswith(pref):
                    continue
                n = sum(1 for l in open(os.path.join(pdir, f)) if l.startswith("TES file:"))
                if not n:
                    continue
                kept += n
                shutil.copy(os.path.join(pdir, f),
                            os.path.join(merged, "%s_b%05d_%s" % (pref, i, f[len(pref) + 1:])))
    shutil.rmtree(bdir, ignore_errors=True)      # the raw blocks are large and already merged
    return i, raw, kept, time.time() - t0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--palette", required=True)
    ap.add_argument("--buckets", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--log", default=None)
    ap.add_argument("--limit", type=int, default=0, help="stop after N buckets (smoke test)")
    ap.add_argument("--prune-shards", type=int, default=1,
                    help="split the pruner of a LARGE bucket this many ways, on its own dedup key "
                         "(exact: two blocks are only ever compared when that key matches). The run's "
                         "critical path is a single bucket's pruner.")
    ap.add_argument("--prune-shard-min-mb", type=int, default=200,
                    help="only shard a bucket whose raw blocks exceed this. Each shard pays a full "
                         "decode pass, so below this it is a loss.")
    ap.add_argument("--cost-out", default=None,
                    help="write per-bucket solve+prune seconds here, for a later --cost-in.")
    ap.add_argument("--cost-in", default=None,
                    help="a --cost-out file from a previous run: dispatch buckets most-expensive "
                         "first. Bucket cost is not predictable from anything known at slice time, so "
                         "the pool otherwise deals them in bucket order and the expensive ones land in "
                         "the tail. Changes only the ORDER work is handed out; the merged catalogue is "
                         "identical (verified: same 40,487,641 blocks).")
    ap.add_argument("--require-star", action="store_true",
                    help="skip any bucket whose vertex types are ALL convex. A solid has a star face "
                         "iff one of its vertex figures carries a star tile, and the search copies "
                         "vertex figures verbatim (extend() appends a whole mainlist gadget and only "
                         "ever writes glue[]), so a bucket with no star-bearing vertex type cannot "
                         "emit a star-bearing block and cannot hold a solid the star shelf wants. "
                         "⚑ What this DOES drop is the all-convex solids, which are the "
                         "`spherical` palette's shelf, not this one — at k=3 they were the five "
                         "Johnson solids run-k3-spherical already lists. Measured on star-wide k=3: "
                         "587 of 3902 buckets go, 17.7%% of solve+prune and 15.6%% of the blocks, and "
                         "the 33,084,968 blocks from all-star buckets contain zero star-free blocks "
                         "while the 6,314,170 from star-free buckets are 100%% star-free.")
    ap.add_argument("--fuse", action="store_true",
                    help="pipe eu_solver straight into eu_pruner (EU_STREAM) so the raw blocks never "
                         "land on disk. Measured on b03228 at k=4: 27.80 s and 0.80 GB written "
                         "without it, 17.72 s and 0 GB with, same 1,847,795 kept blocks. REQUIRED at "
                         "k=4, where the raw tree is a projected 4.1 TB against 0.57 TB free. The "
                         "per-bucket `raw` column becomes equal to `kept` because nothing counts the "
                         "raw blocks any more, and --prune-shards does not apply (one pruner reads "
                         "the pipe). "
                         "\u2691 CATALOGUE-EQUIVALENT, NOT BYTE-IDENTICAL. The pruner keeps the FIRST "
                         "block of each isomorphism class it sees, and the fuse presents blocks in "
                         "the solver's DFS order where the file path presents them family by family, "
                         "so a class can be represented by a different member. Checked on 300 "
                         "star-wide buckets at k=2: both paths give 26,444 distinct blocks, 25 of "
                         "them differ in text, and feeding those 50 back through the pruner collapses "
                         "them to exactly 25 \u2014 the same 25 tilings. Do not point a text golden at "
                         "a fused run.")
    ap.add_argument("--develop", metavar="CELLS_JSON",
                    help="pipe solver -> pruner -> develop_spherical and write the merged certificates "
                         "here. The PRUNED catalogue is never written: at k=4 it is a projected 1.8 TB "
                         "against 0.57 TB free, and eu_sphfill rejects 99.973%% of it anyway. Implies "
                         "the --fuse pipe on the first seam, so the raw blocks are not written either "
                         "— the whole run touches disk only for the certificates. ⚑ This is a DISK "
                         "change, not a speed one: the I/O it removes was a few tens of MB/s. Requires "
                         "--maxdens to match the palette. Not compatible with --prune-shards.")
    ap.add_argument("--maxdens", type=int, default=3,
                    help="EU_MAXDENS handed to the developer in --develop mode")
    ap.add_argument("--keep-cycles", action="store_true",
                    help="write the face-cycle text into the raw blocks. Nothing reads it — the pruner "
                         "skips straight past it — so this is for eyeballing raw output only.")
    ap.add_argument("--workers", type=int, default=1,
                    help="buckets to solve+prune concurrently. 1 keeps the old serial behaviour; "
                         "the merged catalogue does not depend on this.")
    ap.add_argument("--k", type=int, default=2,
                    help="orbit count to search for. \u2691 The bucket argument is k-INDEPENDENT: a tiling "
                         "has ONE edge arc and every one of its vertex figures closes at it, so all k "
                         "orbits sit in the same rho bucket whatever k is. Searching each bucket alone "
                         "and taking the union therefore loses nothing at k=3 for the same reason it "
                         "lost nothing at k=2, where it was checked against the full search (390 "
                         "bucketed blocks against 3,636, reproducing the star-ico-d golden exactly).")
    args = ap.parse_args()

    tables = os.path.join(_HERE, "tables", args.palette, "tables.bin")
    solver = os.path.join(_HERE, "eu_solver_rt")
    pruner = os.path.join(_HERE, "eu_pruner." + args.palette)
    for p in (tables, solver, pruner):
        if not os.path.exists(p):
            sys.exit("missing %s (build it: make eu_solver_rt MAXNUM=%d; make PALETTE=%s MAXNUM=%d)"
                     % (p, args.k, args.palette, args.k))
    buckets = json.load(open(args.buckets))["buckets"]
    if args.limit:
        buckets = buckets[:args.limit]
    out = os.path.abspath(args.out)
    work, merged = os.path.join(out, "work"), os.path.join(out, "pruned")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(merged)
    os.makedirs(work)
    logf = open(args.log or os.path.join(out, "run.log"), "w")

    def log(msg):
        line = "[%s] %s" % (time.strftime("%H:%M:%S"), msg)
        print(line, flush=True)
        logf.write(line + "\n")
        logf.flush()

    head = st.load(tables)
    log("%s: %d vertex types in the full alphabet, %d buckets, %d worker(s)"
        % (args.palette, len(head[7]), len(buckets), args.workers))
    by_ms = {}
    for e in head[7]:
        by_ms.setdefault(st.multiset_of(e), []).append(e)

    stars = set()
    if args.require_star:
        spec = json.load(open(os.path.join(_HERE, "alphabets", "palettes", args.palette + ".json")))
        stars = {(int(t["n"]), int(t["d"])) for t in spec["tiles"] if t.get("kind") == "starpoly"}
        if not stars:
            sys.exit("--require-star: palette %s declares no starpoly tile" % args.palette)
        log("--require-star: %s" % ", ".join("{%d/%d}" % s for s in sorted(stars)))

    devdir = None
    if args.develop:
        devdir = os.path.join(work, "cells")
        os.makedirs(devdir, exist_ok=True)
        log("--develop: piping solver -> pruner -> develop_spherical; no pruned catalogue is written")

    # Slice in the PARENT: the full tables.bin is parsed once here, which is the difference between
    # minutes and hours, and re-parsing it per worker would give that back.
    jobs, empty, convex = [], 0, 0
    for i, b in enumerate(buckets):
        keep = {tuple(sorted((int(n), int(d)) for n, d in ms)) for ms in b["multisets"]}
        sub = [e for ms in keep for e in by_ms.get(ms, [])]
        if not sub:
            empty += 1
            continue
        if stars and not any(t in stars for e in sub for t in st.multiset_of(e)):
            convex += 1
            continue
        bdir = os.path.join(work, "b%05d" % i)
        os.makedirs(os.path.join(bdir, "out"))
        st.write(os.path.join(bdir, "tables.bin"),
                 head[0], head[1], head[2], head[3], head[4], head[5], head[6], sub)
        jobs.append((i, bdir, solver, pruner, args.k, merged, not args.keep_cycles,
                     args.prune_shards, args.prune_shard_min_mb, args.fuse,
                     args.palette, args.maxdens, devdir))
    if args.cost_in:
        cost = {int(a): float(b) for a, b in
                (l.split() for l in open(args.cost_in) if l.strip())}
        jobs.sort(key=lambda j: -cost.get(j[0], 0.0))
        log("dispatch order: most-expensive-first from %s" % os.path.basename(args.cost_in))
    log("sliced %d buckets (%d had no vertex type in this alphabet%s)"
        % (len(jobs), empty, ", %d skipped as all-convex" % convex if convex else ""))

    t0, raw_tot, kept_tot, done = time.time(), 0, 0, 0
    slowest = []
    if args.workers > 1:
        # chunksize=1: bucket costs span four orders of magnitude (b00000 emits 1,076,011 blocks
        # against a singleton bucket's zero), so any static deal leaves workers idle. Same argument
        # as run_develop_sharded.py.
        pool = mp.get_context("spawn").Pool(args.workers)
        it = pool.imap_unordered(_run_bucket, jobs, chunksize=1)
    else:
        pool, it = None, (_run_bucket(j) for j in jobs)
    costf = open(args.cost_out, "w") if args.cost_out else None
    for i, raw, kept, el in it:
        raw_tot += raw; kept_tot += kept; done += 1
        slowest.append((el, i))
        if costf:
            costf.write("%d %.3f\n" % (i, el)); costf.flush()
        if done % 100 == 0 or done == len(jobs):
            e = time.time() - t0
            log("  bucket %d/%d  pruned k=%d blocks so far: %d   %.0fs elapsed, ETA %.0fs"
                % (done, len(jobs), args.k, kept_tot, e, e / done * (len(jobs) - done)))
    if pool:
        pool.close(); pool.join()
    if costf:
        costf.close()
    slowest.sort(reverse=True)
    log("slowest buckets: " + ", ".join("b%05d %.1fs" % (i, t) for t, i in slowest[:8]))
    log("DONE: %d buckets, %d with no vertex type in this alphabet, %d all-convex, "
        "%d pruned k=%d blocks in %s (%.0fs)"
        % (len(buckets), empty, convex, kept_tot, args.k, merged, time.time() - t0))
    if devdir:
        # One cross-bucket pass. Each bucket's developer already collapsed its own geometric
        # duplicates; two buckets can still land the same solid, so the union goes through the same
        # finalise_records the sharded driver uses and the result is the same cells.json shape.
        import develop_spherical as ds
        allrecs = []
        for f in sorted(os.listdir(devdir)):
            if f.endswith(".json"):
                allrecs.extend(json.load(open(os.path.join(devdir, f))))
        merged_recs = ds.finalise_records(allrecs)
        json.dump(merged_recs, open(args.develop, "w"))
        log("DEVELOPED: %d certificates from %d buckets -> %s (%d collapsed as geometric duplicates)"
            % (len(merged_recs), len([f for f in os.listdir(devdir) if f.endswith(".json")]),
               args.develop, len(allrecs) - len(merged_recs)))
    else:
        log("next: python3 run_develop_sharded.py --palette %s --maxdens 3 --kmin %d --kmax %d "
            "--developer develop_spherical.py --workers 10 --pruned %s --out %s/cells.json"
            % (args.palette, args.k, args.k, merged, out))


if __name__ == "__main__":
    main()
