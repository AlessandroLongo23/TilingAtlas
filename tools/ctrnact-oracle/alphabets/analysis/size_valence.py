#!/usr/bin/env python3
"""How much does the vertex-config space grow with maxValence? — sizing run for the rhombus palettes.

The 2026-07-25 rhombus probe ran at maxValence=8, which is an INCOMPLETE regime: twelve 30/150 rhombi
meeting at their 30° corners is a real vertex (12 × 30° = 360°) that a valence-8 cap cannot express. Before
committing to the full maxValence=12 run we need the size of what we are asking for, per stage:

  enum_configs (raw DFS + cyclic dedup)  →  EU_PRUNE_OVERLAP survivors  →  folds/entries

Writes a human-readable progress log as it goes (one line per (palette, maxValence) cell, newest last), so
the run can be watched and killed if a cell blows up.

Usage:
  python3 analysis/size_valence.py --palettes isotox-v8-base isotox-v8-rh --valences 8 9 10 11 12 \
      --log ../../experiments/results/valence-sizing-2026-07-25.log
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import gen_alphabet as ga  # noqa: E402
from export_vertex_configs import build_config  # noqa: E402

LOG = None


def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    if LOG:
        LOG.write(line + "\n")
        LOG.flush()


def main():
    global LOG
    ap = argparse.ArgumentParser()
    ap.add_argument("--palettes", nargs="+", required=True)
    ap.add_argument("--valences", nargs="+", type=int, required=True)
    ap.add_argument("--log", required=True)
    ap.add_argument("--overlap", action="store_true", default=True)
    ap.add_argument("--budget", type=float, default=3600.0, help="give up on a cell after this many seconds")
    args = ap.parse_args()

    LOG = open(args.log, "a")
    log(f"=== valence sizing: palettes={args.palettes} valences={args.valences} overlap={args.overlap} ===")
    results = {}
    for pname in args.palettes:
        path = os.path.join(os.path.dirname(HERE), "palettes", f"{pname}.json")
        spec, D, tiles, classes = ga.load_palette(path)
        has_reflex = any(t.kind == "composite" and any(a > D // 2 for a in t.angles) for t in tiles)
        min_len = 2 if (any(t.kind in ("star", "doubled", "scaled", "polyomino") for t in tiles) or has_reflex) else 3
        log(f"{pname}: D={D} tiles={len(tiles)} classes={len(classes)} min_len={min_len} "
            f"min_corner_units={min(c.units for c in classes)}")
        for v in args.valences:
            t0 = time.time()
            configs = ga.enum_configs(D, classes, min_len, v, spec.get("closure", "euclidean"))
            t_enum = time.time() - t0
            t1 = time.time()
            kept = [c for c in configs if not build_config(classes, D, c)["overlap"]] if args.overlap else configs
            t_ovl = time.time() - t1
            byval = {}
            for c in kept:
                byval[len(c)] = byval.get(len(c), 0) + 1
            results[(pname, v)] = (len(configs), len(kept), t_enum, t_ovl)
            log(f"  {pname} maxValence={v:<3} configs={len(configs):>9,}  overlap-free={len(kept):>8,} "
                f"({100 * len(kept) / max(1, len(configs)):.1f}%)  enum={t_enum:.1f}s overlap={t_ovl:.1f}s "
                f"total={t_enum + t_ovl:.1f}s")
            log(f"      kept by valence: {dict(sorted(byval.items()))}")
            if t_enum + t_ovl > args.budget:
                log(f"  ⚑ {pname} maxValence={v} exceeded the {args.budget:.0f}s budget — stopping this palette")
                break
    log("=== done ===")
    log(json.dumps({f"{p}@{v}": {"configs": c, "kept": k, "t_enum": round(te, 2), "t_overlap": round(to, 2)}
                    for (p, v), (c, k, te, to) in results.items()}, indent=1))


if __name__ == "__main__":
    main()
