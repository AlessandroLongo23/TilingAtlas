#!/usr/bin/env python3
"""Benchmark and regression gate for tilesearch.

Runs every case below with the given binary, records wall time and peak memory, and fingerprints the
output: per certificate file, its record count and a hash of its sorted vertex-type lines (thread order
changes the gluing lines and representatives, never these). With --ref, each case must match the
reference run's fingerprints exactly, or the run is reported as FAILED.

usage: bench.py <tilesearch> <workdir> [--ref <workdir of a reference run>] [--log <file.md>] [--label <text>]
                [--only <case>...]
"""
import argparse
import hashlib
import os
import re
import shutil
import subprocess
import time

HERE = os.path.dirname(os.path.abspath(__file__))
CASES = [  # name, board, kmin, kmax
    ("squares_edges", "squares_edges", 1, 6),
    ("hybrid_2_9830", "hybrid_2_9830", 1, 2),
    ("123_1_4657", "123_1_4657", 1, 3),
    ("123_1_4657_init13", "123_1_4657_init13", 1, 3),
    ("1247_1_0612", "1247_1_0612", 1, 3),
]


def fingerprint(outdir):
    lines = []
    for f in sorted(os.listdir(outdir)):
        if "solver_" not in f:
            continue
        recs = open(os.path.join(outdir, f)).read().split("Number of vertices: ")[1:]
        types = sorted(r.split("\n")[2] for r in recs)
        lines.append("%s %d %s" % (f, len(recs), hashlib.sha256("\n".join(types).encode()).hexdigest()[:16]))
    return lines


def run(exe, work, name, board, kmin, kmax):
    d = os.path.join(work, name)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    t = time.time()
    p = subprocess.run(["/usr/bin/time", "-l", exe, os.path.join(HERE, "boards", board + ".board"), "--k", str(kmin), str(kmax)],
                       cwd=d, capture_output=True, text=True)
    wall = time.time() - t
    if p.returncode:
        raise SystemExit("%s failed:\n%s" % (name, p.stderr[-2000:]))
    rss = int(re.search(r"(\d+)\s+maximum resident set size", p.stderr).group(1))
    out = os.path.join(d, [x for x in os.listdir(d) if x.startswith("solver_")][0])
    fp = fingerprint(out)
    open(os.path.join(d, "fingerprint.txt"), "w").write("\n".join(fp) + "\n")
    census = open(os.path.join(out, "census.txt")).read()
    total = sum(int(m) for m in re.findall(r"-- (\d+)", census))
    return wall, rss, total, fp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("exe")
    ap.add_argument("work")
    ap.add_argument("--ref")
    ap.add_argument("--log")
    ap.add_argument("--label", default="")
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    rows, failed = [], False
    for name, board, kmin, kmax in CASES:
        if a.only and name not in a.only:
            continue
        wall, rss, total, fp = run(os.path.abspath(a.exe), a.work, name, board, kmin, kmax)
        verdict = ""
        if a.ref:
            ref = open(os.path.join(a.ref, name, "fingerprint.txt")).read().split("\n")[:-1]
            verdict = "identical" if fp == ref else "DIFFERENT"
            failed |= fp != ref
        row = "| %s | %s k=%d..%d | %d | %.1f | %.0f | %d | %s |" % (
            a.label, name, kmin, kmax, total, wall, rss / 2**20, len(fp), verdict)
        print(row, flush=True)
        rows.append(row)
    if a.log:
        new = not os.path.exists(a.log)
        with open(a.log, "a") as f:
            if new:
                f.write("| build | case | tilings | wall (s) | peak RSS (MB) | files | vs reference |\n"
                        "|---|---|---|---|---|---|---|\n")
            f.write("\n".join(rows) + "\n")
    if failed:
        raise SystemExit("FAILED: output differs from the reference")


if __name__ == "__main__":
    main()
