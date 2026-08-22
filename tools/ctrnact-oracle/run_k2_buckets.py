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

Usage: python3 run_k2_buckets.py --palette star-wide --buckets buckets.json --out run-k2-star-wide
"""
import argparse, json, os, shutil, subprocess, sys, time

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
import slice_tables as st


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--palette", required=True)
    ap.add_argument("--buckets", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--log", default=None)
    ap.add_argument("--limit", type=int, default=0, help="stop after N buckets (smoke test)")
    ap.add_argument("--k", type=int, default=2,
                    help="orbit count to search for. ⚑ The bucket argument is k-INDEPENDENT: a tiling "
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
    log("%s: %d vertex types in the full alphabet, %d buckets to run"
        % (args.palette, len(head[7]), len(buckets)))
    by_ms = {}
    for e in head[7]:
        by_ms.setdefault(st.multiset_of(e), []).append(e)

    t0, raw_tot, kept_tot, empty = time.time(), 0, 0, 0
    for i, b in enumerate(buckets):
        keep = {tuple(sorted((int(n), int(d)) for n, d in ms)) for ms in b["multisets"]}
        sub = [e for ms in keep for e in by_ms.get(ms, [])]
        if not sub:
            empty += 1
            continue
        bdir = os.path.join(work, "b%05d" % i)
        os.makedirs(os.path.join(bdir, "out"))
        tb = os.path.join(bdir, "tables.bin")
        st.write(tb, head[0], head[1], head[2], head[3], head[4], head[5], head[6], sub)
        env = dict(os.environ, EU_TABLES=tb)
        subprocess.run([solver], cwd=bdir, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        raw = len([f for f in os.listdir(os.path.join(bdir, "out")) if f.startswith("eusolver_")])
        if raw:
            subprocess.run([pruner], cwd=_HERE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           env=dict(os.environ, EU_OUT=os.path.join(bdir, "out"),
                                    EU_KMIN=str(args.k), EU_KMAX=str(args.k)))
            pdir = os.path.join(bdir, "out", "pruned")
            if os.path.isdir(pdir):
                pref = "eupruned_%02d" % args.k
                for f in sorted(os.listdir(pdir)):
                    if not f.startswith(pref):
                        continue
                    n = sum(1 for l in open(os.path.join(pdir, f)) if l.startswith("TES file:"))
                    if not n:
                        continue
                    kept_tot += n
                    shutil.copy(os.path.join(pdir, f),
                                os.path.join(merged, "%s_b%05d_%s" % (pref, i, f[len(pref) + 1:])))
        raw_tot += raw
        shutil.rmtree(bdir, ignore_errors=True)          # the raw blocks are large and already merged
        if (i + 1) % 100 == 0 or i + 1 == len(buckets):
            el = time.time() - t0
            eta = el / (i + 1) * (len(buckets) - i - 1)
            log("  bucket %d/%d  pruned k=%d blocks so far: %d   %.0fs elapsed, ETA %.0fs"
                % (i + 1, len(buckets), args.k, kept_tot, el, eta))
    log("DONE: %d buckets, %d with no vertex type in this alphabet, %d pruned k=%d blocks in %s"
        % (len(buckets), empty, kept_tot, args.k, merged))
    log("next: python3 run_develop_sharded.py --palette %s --maxdens 3 --kmin %d --kmax %d "
        "--developer develop_spherical.py --workers 10 --pruned %s --out %s/cells.json"
        % (args.palette, args.k, args.k, merged, out))


if __name__ == "__main__":
    main()
