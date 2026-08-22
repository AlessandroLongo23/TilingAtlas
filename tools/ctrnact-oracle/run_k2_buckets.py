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


def _run_bucket(job):
    """Solve + prune ONE bucket. Runs in a worker; the slice is already on disk.

    Buckets are completely independent — separate alphabets, separate solver processes, separate
    pruner stores — so this is the same free parallelism run_develop_sharded.py already uses one
    stage later. The merged file NAMES do not depend on which worker ran which bucket, and
    develop_spherical.gather_blocks sorts them, so the merged catalogue is identical to a serial run.
    """
    i, bdir, solver, pruner, k, merged, nocycles = job
    t0 = time.time()
    tb = os.path.join(bdir, "tables.bin")
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
        subprocess.run([pruner], cwd=bdir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       env=dict(os.environ, EU_OUT=outdir, EU_KMIN=str(k), EU_KMAX=str(k)))
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

    # Slice in the PARENT: the full tables.bin is parsed once here, which is the difference between
    # minutes and hours, and re-parsing it per worker would give that back.
    jobs, empty = [], 0
    for i, b in enumerate(buckets):
        keep = {tuple(sorted((int(n), int(d)) for n, d in ms)) for ms in b["multisets"]}
        sub = [e for ms in keep for e in by_ms.get(ms, [])]
        if not sub:
            empty += 1
            continue
        bdir = os.path.join(work, "b%05d" % i)
        os.makedirs(os.path.join(bdir, "out"))
        st.write(os.path.join(bdir, "tables.bin"),
                 head[0], head[1], head[2], head[3], head[4], head[5], head[6], sub)
        jobs.append((i, bdir, solver, pruner, args.k, merged, not args.keep_cycles))
    log("sliced %d buckets (%d had no vertex type in this alphabet)" % (len(jobs), empty))

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
    for i, raw, kept, el in it:
        raw_tot += raw; kept_tot += kept; done += 1
        slowest.append((el, i))
        if done % 100 == 0 or done == len(jobs):
            e = time.time() - t0
            log("  bucket %d/%d  pruned k=%d blocks so far: %d   %.0fs elapsed, ETA %.0fs"
                % (done, len(jobs), args.k, kept_tot, e, e / done * (len(jobs) - done)))
    if pool:
        pool.close(); pool.join()
    slowest.sort(reverse=True)
    log("slowest buckets: " + ", ".join("b%05d %.1fs" % (i, t) for t, i in slowest[:8]))
    log("DONE: %d buckets, %d with no vertex type in this alphabet, %d pruned k=%d blocks in %s (%.0fs)"
        % (len(buckets), empty, kept_tot, args.k, merged, time.time() - t0))
    log("next: python3 run_develop_sharded.py --palette %s --maxdens 3 --kmin %d --kmax %d "
        "--developer develop_spherical.py --workers 10 --pruned %s --out %s/cells.json"
        % (args.palette, args.k, args.k, merged, out))


if __name__ == "__main__":
    main()
