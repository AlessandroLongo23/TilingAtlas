#!/usr/bin/env python3
"""Would a forbidden-ADJACENT-PAIR prune inside the DFS replace the post-hoc overlap filter?

Measured on isotox-v8-base (2026-07-25): the DFS explores 3,416,148 words to emit 277,785 configs, of
which EU_PRUNE_OVERLAP then discards 246,164 — and 217,442 of those (88%) already overlap at prefix
length 2, i.e. two cyclically-adjacent corner classes whose placed tiles collide. That is a property of
the PAIR, not of the word: precompute it once into a 53×53 table and the DFS can refuse the pair instead
of building every completion of it and throwing them away at the leaf.

Soundness. `build_config` places tiles at the running angle sum, so a prefix's placement IS the prefix of
the full placement: if tiles i and i+1 overlap, they still overlap in every extension, and overlap is
invariant under the rotation/reflection that `cyclic_reps` quotients by — so no overlap-free config can be
lost. The existing point-adjacency lemma in `enum_configs` is the same shape (and, per its own docstring,
the same geometry) so this generalizes a prune already there rather than adding a new kind.

This probe does not modify gen_alphabet. It builds the table, re-runs the DFS with it, and asserts the
emitted overlap-free set is IDENTICAL to the baseline's — the only result worth having.

Usage:  python3 analysis/prefix_prune_probe.py --palette isotox-v8-base --valence 8
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import gen_alphabet as ga  # noqa: E402
from export_vertex_configs import build_config  # noqa: E402


def forbidden_pairs(classes, D):
    """{(cid_a, cid_b)} whose placed tiles already overlap as a 2-corner fan."""
    bad = set()
    for a in range(len(classes)):
        for b in range(len(classes)):
            if classes[a].units + classes[b].units > D:
                continue  # cannot occur in a word at all
            if build_config(classes, D, [a, b])["overlap"]:
                bad.add((a, b))
    return bad


def dfs_counting(D, classes, min_len, max_len, bad):
    """enum_configs' euclidean branch with the pair table replacing the point-adjacency special case."""
    out = []
    unit = {c.cid: c.units for c in classes}
    cids = sorted(unit, key=lambda k: (-unit[k], k))
    stats = {"nodes": 0}

    def rec(word, total):
        if len(word) >= min_len and total == D:
            if (word[-1], word[0]) not in bad:      # the cyclic wrap pair
                out.append(list(word))
            return
        if len(word) >= max_len:
            return
        if total >= D:
            return
        for cid in cids:
            if word and (word[-1], cid) in bad:
                continue
            nxt = total + unit[cid]
            if nxt <= D:
                stats["nodes"] += 1
                word.append(cid)
                rec(word, nxt)
                word.pop()

    rec([], 0)
    return out, stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--palette", required=True)
    ap.add_argument("--valence", type=int, required=True)
    args = ap.parse_args()

    path = os.path.join(os.path.dirname(HERE), "palettes", f"{args.palette}.json")
    spec, D, tiles, classes = ga.load_palette(path)
    has_reflex = any(t.kind == "composite" and any(a > D // 2 for a in t.angles) for t in tiles)
    min_len = 2 if (any(t.kind in ("star", "doubled", "scaled", "polyomino") for t in tiles) or has_reflex) else 3
    print(f"palette={args.palette} D={D} classes={len(classes)} min_len={min_len} maxValence={args.valence}")

    t0 = time.time()
    bad = forbidden_pairs(classes, D)
    t_table = time.time() - t0
    print(f"  forbidden adjacent pairs: {len(bad):,} of {len(classes)**2:,}  (built in {t_table:.1f}s, once per palette)")

    # --- baseline: current pipeline (DFS -> cyclic dedup -> overlap filter) ---
    raw = {}
    orig = ga.cyclic_reps

    def spy(words):
        raw["n"] = len(words)
        return orig(words)

    ga.cyclic_reps = spy
    t0 = time.time()
    base_configs = ga.enum_configs(D, classes, min_len, args.valence)
    t_enum = time.time() - t0
    t0 = time.time()
    base_kept = [c for c in base_configs if not build_config(classes, D, c)["overlap"]]
    t_ovl = time.time() - t0
    ga.cyclic_reps = orig
    print(f"  BASELINE  raw words {raw['n']:>10,}  configs {len(base_configs):>9,}  overlap-free {len(base_kept):>8,}"
          f"   enum {t_enum:.1f}s + overlap {t_ovl:.1f}s = {t_enum + t_ovl:.1f}s")

    # --- pruned: pair table inside the DFS, then dedup, then the residual overlap filter ---
    t0 = time.time()
    words, stats = dfs_counting(D, classes, min_len, args.valence, bad)
    t_dfs = time.time() - t0
    t0 = time.time()
    pruned_configs = ga.cyclic_reps(words)
    t_dedup = time.time() - t0
    t0 = time.time()
    pruned_kept = [c for c in pruned_configs if not build_config(classes, D, c)["overlap"]]
    t_res = time.time() - t0
    total = t_dfs + t_dedup + t_res
    print(f"  PRUNED    raw words {len(words):>10,}  configs {len(pruned_configs):>9,}  overlap-free {len(pruned_kept):>8,}"
          f"   dfs {t_dfs:.1f}s + dedup {t_dedup:.1f}s + residual {t_res:.1f}s = {total:.1f}s")

    key = lambda cs: {tuple(c) for c in cs}  # noqa: E731
    same = key(base_kept) == key(pruned_kept)
    print(f"  IDENTICAL overlap-free set: {'YES' if same else 'NO — UNSOUND, do not ship'}")
    if not same:
        only_base = key(base_kept) - key(pruned_kept)
        only_pruned = key(pruned_kept) - key(base_kept)
        print(f"    lost by pruning: {len(only_base)}   gained: {len(only_pruned)}")
        for c in list(only_base)[:5]:
            print(f"    ⚑ lost {[classes[x].disp for x in c]}")
    print(f"  speedup on this stage: {(t_enum + t_ovl) / max(1e-9, total):.2f}x"
          f"   (raw words {raw['n'] / max(1, len(words)):.1f}x fewer)")
    return 0 if same else 1


if __name__ == "__main__":
    sys.exit(main())
