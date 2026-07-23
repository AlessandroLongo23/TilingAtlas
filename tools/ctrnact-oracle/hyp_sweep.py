#!/usr/bin/env python3
"""3D parameter sweep of the hyperbolic enumeration: axes k (max uniformity), p (largest polygon,
palette = {3..p}), v (max vertex valence).

For every cell (k, p, v) the full pipeline runs — gen_alphabet → eu_solver → eu_pruner — and the
pruned blocks are counted by TRUE tiling identity: decode → shared edge length (solve_edge_common;
blocks whose orbits close at different ℓ are non-tilings) → minimal Delaney–Dress symbol
(dsymbol_from_darts.analyse, validated against A068599 at l=0). No geometric develop — counting needs
the symbol, not the picture — so a cell costs solver + prune + milliseconds.

Saved per cell (AL directive 2026-07-23: count, list of results, time):
  <out>/cell-k{k}-p{p}-v{v}.json   counts (raw/pruned/valid/distinct, by true k), tiling list
                                   (figures, edge ℓ, true k, key hash, minimal size), phase timings
  <out>/index.jsonl                one summary row per cell, append-only — the display layer reads this
  <out>/sweep-<date>.log           human-readable progress, written synchronously

Cells run smallest-first (k ascending, then p+v ascending) with a per-cell wall cap; a cell that
exceeds it is recorded as status "timeout" with whatever the solver had emitted, and the sweep moves
on. Re-running skips cells whose JSON already exists (--force re-runs).

Usage:
  python3 hyp_sweep.py                              # defaults: k 1..3, p 3..8, v 3..8, 900 s/cell
  python3 hyp_sweep.py --k 2 --p 8 --v 7 8 --cell-timeout 7200 --force   # revisit big cells
"""
import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import time
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import develop_spherical as ds                    # decode scaffolding (read_blocks, decode_block)
from develop_hyperbolic import solve_edge_common  # shared ℓ or None
from dsymbol_from_darts import analyse


def lcm(a, b):
    return a * b // math.gcd(a, b)


def palette_name(p, v):
    return f"hyp-s-p{p}v{v}"


def write_palette(p, v):
    """Palette {3..p}, valence cap v, D = lcm(2n) so every interior angle is an exact multiple of π/D."""
    D = 1
    for n in range(3, p + 1):
        D = lcm(D, 2 * n)
    spec = {
        "name": palette_name(p, v),
        "D": D,
        "closure": "negative-defect",
        "maxValence": v,
        "comment": f"sweep cell palette: regular {{3..{p}}}, valence <= {v} (hyp_sweep.py)",
        "tiles": [{"kind": "regular", "n": n, "name": str(n), "famchar": str(n)} for n in range(3, p + 1)],
    }
    path = os.path.join(HERE, "alphabets", "palettes", spec["name"] + ".json")
    json.dump(spec, open(path, "w"), indent=2)
    return spec["name"]


def sh(cmd, timeout, cwd=None, env=None):
    """(ok, seconds, detail). Kills the whole thing on timeout."""
    t0 = time.time()
    try:
        r = subprocess.run(cmd, cwd=cwd, env=env, timeout=timeout,
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        return r.returncode == 0, time.time() - t0, (r.stderr or b"")[-400:].decode(errors="replace")
    except subprocess.TimeoutExpired:
        return None, time.time() - t0, "timeout"


def count_cell(name, pruned_dir, kmax):
    """Distinct tilings among the pruned blocks, by minimal D-symbol at the forced shared ℓ."""
    ds.install_palette(name)
    blocks = ds.gather_blocks(pruned_dir, 1, kmax)
    classes = {}
    stats = defaultdict(int)
    for b in blocks:
        stats["pruned"] += 1
        try:
            dec = ds.decode_block(b)
        except Exception:
            stats["decode_error"] += 1
            continue
        l = solve_edge_common(dec["configs"])
        if l is None:
            stats["no_common_edge"] += 1
            continue
        a = analyse(dec["rneig"], dec["glue"], dec["lvert"], l)
        if not a["valid"]:
            stats["invalid_symbol"] += 1
            continue
        key = repr(a["key"])
        if key not in classes:
            classes[key] = {
                "k": a["k"],
                "figures": " + ".join(".".join(map(str, o)) for o in a["orbits"]),
                "edge": round(l, 6),
                "n": a["n"],
                "key": hashlib.sha1(key.encode()).hexdigest()[:16],
            }
    return classes, stats


def run_cell(k, p, v, args, log):
    name = write_palette(p, v)
    scratch = os.path.join(HERE, f"scratch-sweep-{name}-k{k}")
    shutil.rmtree(scratch, ignore_errors=True)
    os.makedirs(os.path.join(scratch, "out"))
    cell = {"k": k, "p": p, "v": v, "palette": name, "status": "ok", "t": {}}
    budget = args.cell_timeout

    ok, cell["t"]["build"], err = sh(["make", "-C", HERE, f"MAXNUM={k}", f"PALETTE={name}"], budget)
    if not ok:
        cell["status"] = "build_error" if ok is False else "timeout"
        cell["error"] = err
        return cell, None

    remain = max(budget - cell["t"]["build"], 10)
    ok, cell["t"]["solve"], err = sh([os.path.join(HERE, f"eu_solver.{name}")], remain, cwd=scratch)
    raw = 0
    outdir = os.path.join(scratch, "out")
    for f in os.listdir(outdir):
        if f.startswith("eusolver"):
            raw += open(os.path.join(outdir, f), errors="replace").read().count("Number of vertex types:")
    cell["raw_blocks"] = raw
    if ok is None:
        cell["status"] = "timeout"          # raw count kept: it says how far the solver got
        return cell, None
    if ok is False:
        cell["status"] = "solve_error"
        cell["error"] = err
        return cell, None

    env = dict(os.environ, EU_OUT=outdir, EU_KMIN="1", EU_KMAX=str(k))
    remain = max(budget - cell["t"]["build"] - cell["t"]["solve"], 10)
    ok, cell["t"]["prune"], err = sh([os.path.join(HERE, f"eu_pruner.{name}")], remain, env=env)
    if not ok:
        cell["status"] = "prune_error" if ok is False else "timeout"
        cell["error"] = err
        return cell, None

    t0 = time.time()
    classes, stats = count_cell(name, os.path.join(outdir, "pruned"), k)
    cell["t"]["count"] = time.time() - t0
    cell.update(stats)
    byk = defaultdict(int)
    for c in classes.values():
        byk[c["k"]] += 1
    cell["distinct"] = len(classes)
    cell["by_k"] = {str(kk): n for kk, n in sorted(byk.items())}
    cell["t"]["total"] = sum(cell["t"].values())
    return cell, sorted(classes.values(), key=lambda c: (c["k"], c["edge"], c["figures"]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--k", type=int, nargs="+", default=[1, 2, 3])
    ap.add_argument("--p", type=int, nargs="+", default=list(range(3, 9)))
    ap.add_argument("--v", type=int, nargs="+", default=list(range(3, 9)))
    ap.add_argument("--cell-timeout", type=float, default=900.0)
    ap.add_argument("--out", default=os.path.join(HERE, "..", "..", "experiments", "results", "hyp-sweep"))
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    logpath = os.path.join(out, f"sweep-{time.strftime('%Y-%m-%d')}.log")
    log = open(logpath, "a")

    def say(msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(line, flush=True)
        log.write(line + "\n")
        log.flush()

    # smallest first: k ascending, then p+v ascending — the cheap face of the cube fills before the
    # expensive corner, and an interrupt still leaves complete small-parameter tables.
    cells = [(k, p, v) for k in sorted(args.k) for p in sorted(args.p) for v in sorted(args.v)]
    cells.sort(key=lambda c: (c[0], c[1] + c[2], c[1]))
    say(f"sweep start: {len(cells)} cells (k in {sorted(args.k)}, p in {sorted(args.p)}, "
        f"v in {sorted(args.v)}), {args.cell_timeout:.0f}s cap per cell -> {out}")

    t0 = time.time()
    for i, (k, p, v) in enumerate(cells):
        cellpath = os.path.join(out, f"cell-k{k}-p{p}-v{v}.json")
        if os.path.exists(cellpath) and not args.force:
            say(f"[{i + 1}/{len(cells)}] k={k} p={p} v={v}: exists, skipping")
            continue
        cell, tilings = run_cell(k, p, v, args, log)
        cell["tilings"] = tilings or []
        json.dump(cell, open(cellpath, "w"), indent=1)
        with open(os.path.join(out, "index.jsonl"), "a") as ix:
            row = {kk: vv for kk, vv in cell.items() if kk != "tilings"}
            ix.write(json.dumps(row) + "\n")
        scratch = os.path.join(HERE, f"scratch-sweep-{cell['palette']}-k{k}")
        shutil.rmtree(scratch, ignore_errors=True)
        if cell["status"] == "ok":
            say(f"[{i + 1}/{len(cells)}] k={k} p={p} v={v}: {cell['distinct']} tilings "
                f"(by k: {cell['by_k']}) from {cell.get('pruned', 0)} pruned / {cell.get('raw_blocks', 0)} raw"
                f"  [build {cell['t']['build']:.0f}s solve {cell['t']['solve']:.1f}s "
                f"prune {cell['t']['prune']:.1f}s count {cell['t']['count']:.1f}s]"
                f"  ({(time.time() - t0) / 60:.1f} min total)")
        else:
            say(f"[{i + 1}/{len(cells)}] k={k} p={p} v={v}: {cell['status'].upper()}"
                f" after {sum(cell['t'].values()):.0f}s"
                f"{' (raw so far: %d)' % cell['raw_blocks'] if 'raw_blocks' in cell else ''}")
    say(f"sweep done in {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
