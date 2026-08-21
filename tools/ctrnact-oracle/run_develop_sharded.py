#!/usr/bin/env python3
"""Develop a pruned tree in parallel and merge the cells.

develop_spherical.py is one process over one directory, which is the right shape for a few thousand
blocks and the wrong one for a few hundred thousand: the bucketed k=2 run on star-wide emits 422,206,
and a block is completely independent of every other block, so this hands each worker a directory of
symlinks and merges the JSON at the end. Measured single-thread rate on that run: ~23 blocks/s.

Usage: python3 run_develop_sharded.py --palette star-wide --pruned <dir> --out <cells.json> \
           --workers 8 --kmin 2 --kmax 2 --log <logfile>
"""
import argparse, collections, glob, json, os, re, subprocess, sys, time

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

    files = glob.glob(os.path.join(args.pruned, "eupruned_*.txt"))
    if not files:
        sys.exit("no pruned files under " + args.pruned)
    per_file = {f: sum(1 for l in open(f) if l.startswith("TES file:")) for f in files}
    blocks = sum(per_file.values())
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
    # LPT (longest-processing-time-first): biggest file to the emptiest worker, by BLOCK COUNT.
    #
    # It was round-robin over files sorted by SIZE, and size is a poor proxy for work. The k=4 run had
    # five of its eight workers idle for the last twenty minutes while three ground on: one worker drew
    # 351 blocks and another 5. Measured on that same shard, 1798 blocks over 8 workers —
    #   size round-robin  [410 274 241 188 185 171 170 159]   max 410
    #   LPT on blocks     [302 277 277 219 195 182 173 173]   max 302
    # a 1.36x better makespan bound, and 302 is close to the floor: the largest single file holds 277
    # blocks and a file is never split, so no assignment can beat 277.
    #
    # Static assignment cannot be perfect anyway — block costs vary wildly, since one that fails on "no
    # dihedral solution" is near-free and one that realizes twice is not — but counting the right thing
    # beats counting file bytes.
    load = [0] * args.workers
    for f in sorted(files, key=lambda p: -per_file[p]):
        w = load.index(min(load))
        load[w] += per_file[f]
        os.symlink(os.path.abspath(f), os.path.join(shards[w], os.path.basename(f)))
    log("%d files / %d blocks over %d workers (per-worker blocks: %s)"
        % (len(files), blocks, args.workers, " ".join(str(n) for n in load)))

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

    # PROGRESS, because a run that says nothing for a quarter of an hour is indistinguishable from a
    # hung one. Each worker already writes "develop 189/351 realized=20 ... ETA 456s" to its own progress
    # file; nothing was reading them, so the log jumped straight from "1798 blocks over 8 workers" to
    # "done". The slowest worker sets the finish, so that is the ETA worth printing.
    def snapshot():
        done = total = realized = 0
        eta = 0
        for w in range(args.workers):
            try:
                tail = open(os.path.join(work, "progress-w%d.txt" % w)).read().replace("\r", "\n")
            except OSError:
                continue
            m = None
            for line in tail.strip().split("\n"):
                g = re.search(r"develop (\d+)/(\d+)\s+realized=(\d+).*?ETA (\d+)s", line)
                if g:
                    m = g
            if m:
                done += int(m.group(1)); total += int(m.group(2))
                realized += int(m.group(3)); eta = max(eta, int(m.group(4)))
        return done, total, realized, eta

    while any(p.poll() is None for _, p, _ in procs):
        time.sleep(30)
        d, t, r, eta = snapshot()
        if t:
            log("  %d/%d blocks  realized=%d  %.0fs elapsed, ETA %ds (slowest worker)"
                % (d, t, r, time.time() - t0, eta))

    for w, p, cells in procs:
        p.wait()
        log("  worker %d finished (%.0fs)" % (w, time.time() - t0))
    recs = []
    for w, p, cells in procs:
        if os.path.exists(cells):
            recs.extend(json.load(open(cells)))
    json.dump(recs, open(args.out, "w"))
    log("merged %d realized records -> %s (%.0fs total)" % (len(recs), args.out, time.time() - t0))

    # MERGE THE REPORTS. Each worker writes one and they were being left in the scratch directory, so a
    # sharded run produced no account of what did NOT realize — and that account is the whole basis for
    # saying a shelf is complete. A block rejected for "no dihedral solution" is a mathematical fact; one
    # that failed to converge is a gap. Without the merged report the two are indistinguishable, which is
    # how the k=3 shelf shipped a completeness claim it could not support.
    reasons, totals = collections.Counter(), collections.Counter()
    lines = []
    for w in range(args.workers):
        rp = os.path.join(work, "report-w%d.txt" % w)
        if not os.path.exists(rp):
            continue
        for line in open(rp):
            g = re.match(r"^(blocks in|realized|non-realizable)\s*:\s*(\d+)", line)
            if g:
                totals[g.group(1)] += int(g.group(2))
            elif "reason=" in line:
                reasons[line.split("reason=", 1)[1].strip()] += 1
                lines.append(line.rstrip())
    if totals:
        rp = os.path.splitext(args.out)[0] + "-report.txt"
        with open(rp, "w") as f:
            f.write("euclidean develop report (k=%d..%d, %d workers merged)\n"
                    % (args.kmin, args.kmax, args.workers))
            for k in ("blocks in", "realized", "non-realizable"):
                f.write("%-15s: %d\n" % (k, totals[k]))
            f.write("\nnon-realizable by reason\n")
            for why, n in reasons.most_common():
                f.write("%6d  %s\n" % (n, why[:120]))
            f.write("\n")
            f.write("\n".join(lines) + "\n")
        log("  report -> %s  (%s)" % (os.path.basename(rp),
                                      ", ".join("%s=%d" % (k, v) for k, v in totals.items())))
        for why, n in reasons.most_common(5):
            log("     %5d  %s" % (n, why[:90]))


if __name__ == "__main__":
    main()
