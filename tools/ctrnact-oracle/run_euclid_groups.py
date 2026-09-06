#!/usr/bin/env python3
"""Develop a large pruned tree in RESUMABLE groups, then merge by congruence.

run_develop_sharded.py holds every record in the parent and writes once, at the end. That is right
for a run measured in minutes and wrong for star-wide k=2: 355,207 blocks at ~2 core-seconds is a
day of wall clock on a contended laptop, and a crash at hour 25 loses all of it.

So: split the pruned FILES into groups, run the sharded developer once per group into its own JSON,
and skip any group whose JSON already exists. A crash costs one group. The groups are symlink
directories, so nothing is copied.

⚑ THE MERGE IS NOT A CONCATENATION. develop_euclid defines what a duplicate is (congruence_key: the
multiset of pairwise vertex distances, which identifies mirror images) and two groups can realize the
same solid, so the union goes through that key exactly as the single-process path does. Same reason
run_develop_sharded dedups once over the merged set instead of per worker.

Usage: python3 run_euclid_groups.py --palette star-wide --pruned <dir> --k 2 --groups 24 \
           --out star-wide-k2-euclid.json --workers 9
"""
import argparse, glob, json, os, subprocess, sys, time

_HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--palette", required=True)
    ap.add_argument("--pruned", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--k", type=int, default=2)
    ap.add_argument("--groups", type=int, default=24)
    ap.add_argument("--workers", type=int, default=9)
    ap.add_argument("--chunk", type=int, default=200)
    ap.add_argument("--maxdens", type=int, default=3)
    ap.add_argument("--log", default=None)
    args = ap.parse_args()

    work = os.path.splitext(args.out)[0] + "-parts"
    os.makedirs(work, exist_ok=True)
    logf = open(args.log, "a") if args.log else None

    def log(m):
        line = "[%s] %s" % (time.strftime("%H:%M:%S"), m)
        print(line, flush=True)
        if logf:
            logf.write(line + "\n"); logf.flush()

    files = sorted(glob.glob(os.path.join(os.path.abspath(args.pruned),
                                          "eupruned_%02d_*.txt" % args.k)))
    if not files:
        sys.exit("no eupruned_%02d_* under %s" % (args.k, args.pruned))
    # ROUND-ROBIN, not contiguous slices. Files come out of run_k2_buckets in bucket order and bucket
    # cost spans four orders of magnitude, so contiguous groups would put every expensive bucket in
    # one group and leave the ETA meaningless until the end.
    groups = [files[i::args.groups] for i in range(args.groups)]
    nb = sum(1 for f in files for l in open(f) if l.startswith("TES file:"))
    log("%d files, %d blocks, %d groups, %d workers" % (len(files), nb, len(groups), args.workers))

    t0 = time.time()
    for gi, g in enumerate(groups):
        out = os.path.join(work, "g%03d.json" % gi)
        if os.path.exists(out):
            log("group %d/%d: already done, skipping" % (gi + 1, len(groups)))
            continue
        gdir = os.path.join(work, "g%03d" % gi)
        os.makedirs(gdir, exist_ok=True)
        for f in g:
            link = os.path.join(gdir, os.path.basename(f))
            if not os.path.exists(link):
                os.symlink(f, link)
        tmp = out + ".tmp"
        cmd = [sys.executable, os.path.join(_HERE, "run_develop_sharded.py"),
               "--palette", args.palette, "--maxdens", str(args.maxdens),
               "--kmin", str(args.k), "--kmax", str(args.k),
               "--developer", "develop_euclid.py", "--workers", str(args.workers),
               "--chunk", str(args.chunk), "--pruned", gdir, "--out", tmp,
               # the inner run's own progress, so a group that takes an hour is not a black box
               "--log", os.path.join(work, "g%03d.log" % gi)]
        r = subprocess.run(cmd, cwd=_HERE, capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(tmp):
            log("group %d/%d FAILED rc=%d: %s" % (gi + 1, len(groups), r.returncode,
                                                  (r.stderr or "")[-400:]))
            continue
        os.replace(tmp, out)                      # only a COMPLETE group is ever seen as done
        n = len(json.load(open(out)))
        el = time.time() - t0
        done = gi + 1
        log("group %d/%d: %d records  %.0fs elapsed, ETA %.0fs"
            % (done, len(groups), n, el, el / done * (len(groups) - done)))

    sys.path.insert(0, _HERE)
    os.environ["EU_PALETTE"] = args.palette
    os.environ["EU_MAXDENS"] = str(args.maxdens)
    import develop_euclid as de
    recs, seen, uniq = [], set(), []
    for f in sorted(glob.glob(os.path.join(work, "g*.json"))):
        recs.extend(json.load(open(f)))
    for r in recs:
        k = de.congruence_key(r)
        if k in seen:
            continue
        seen.add(k)
        uniq.append(r)
    json.dump(uniq, open(args.out, "w"))
    log("MERGED %d records from %d groups -> %d congruence classes -> %s (%.0fs)"
        % (len(recs), len(glob.glob(os.path.join(work, "g*.json"))), len(uniq), args.out,
           time.time() - t0))


if __name__ == "__main__":
    main()
