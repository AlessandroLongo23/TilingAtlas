#!/usr/bin/env python3
"""Audit every palette for CHIRAL tiles whose mirror twin is missing from the alphabet.

Why this matters. The engine cannot place a tile reflected: a tile is an alphabet symbol carrying a
cyclic interior-angle word, and a mirrored placement traverses that word BACKWARDS, which is a
different word. (The "chirality-doubled dart set" in gen_alphabet is about the two sides of a vertex
figure, not about flipping a tile.) So if a palette carries a chiral tile but not its mirror twin,
every tiling that needs the other handedness is unreachable — silently, with no error and no gap in
any count anyone would think to check.

Measured 2026-08-08 on the tetromino palette, which DOES carry both twins (S/Z and J/L): dropping the
twins took k=1 from 27 distinct tilings to 16. Four of the 39 k=1 records use BOTH handednesses of the
same polygon at once and cannot be represented at all without both symbols.

A tile is ACHIRAL iff its cyclic angle word equals some rotation of its own reversal:
  regular  [a]*n            reversal is the same word                      -> achiral
  star     [point,dent]*n   reversal [dent,point]*n = rotation by 1        -> achiral
  scaled   [θ,180,…,180]*n  reversal is a rotation                         -> achiral
  period-3 [a,b,c]*n        reversal [c,b,a]*n is a rotation only if two
                            of a,b,c are equal        -> CHIRAL when all three differ
So the regular and star families are achiral for structural reasons, and nobody had to think about
this. The composite, period-p and polyomino families are where it bites.

Usage:  python3 audit_chirality.py [palette ...]     (default: every palette in palettes/)
Exit 1 if any palette is missing a mirror twin.
"""
import glob
import json
import os
import sys

from gen_alphabet import load_palette


def full_word(tile):
    """The tile's complete cyclic interior-angle word, in D-units."""
    return [tile.classes[i % tile.p].units for i in range(tile.L)]


def rotations(w):
    return [tuple(w[i:] + w[:i]) for i in range(len(w))]


def canon(w):
    """Rotation-canonical form (lex-max over rotations) — identifies the same tile placed differently."""
    return max(rotations(list(w)))


def is_achiral(w):
    return canon(w) == canon(list(reversed(list(w))))


def audit(path):
    name = os.path.splitext(os.path.basename(path))[0]
    try:
        spec, D, tiles, classes = load_palette(path)
    except Exception as e:                                   # noqa: BLE001 - report, don't abort the sweep
        return name, None, f"could not load: {e}"
    present = {}
    for t in tiles:
        present.setdefault(canon(full_word(t)), []).append(t.name)
    chiral, missing = [], []
    for t in tiles:
        w = full_word(t)
        if is_achiral(w):
            continue
        chiral.append(t.name)
        twin = canon(list(reversed(w)))
        if twin not in present:
            missing.append(t.name)
    return name, (len(tiles), chiral, missing), None


def main():
    args = sys.argv[1:]
    paths = ([os.path.join("palettes", a if a.endswith(".json") else a + ".json") for a in args]
             if args else sorted(glob.glob("palettes/*.json")))
    bad = []
    print(f"{'palette':28s} {'tiles':>5} {'chiral':>6} {'missing twin':>12}   detail")
    for p in paths:
        name, res, err = audit(p)
        if err:
            print(f"{name:28s} {'-':>5} {'-':>6} {'-':>12}   {err}")
            continue
        ntiles, chiral, missing = res
        flag = "  ⚑ INCOMPLETE" if missing else ""
        detail = ("missing: " + ", ".join(missing)) if missing else ("chiral, twins present: " + ", ".join(chiral) if chiral else "")
        print(f"{name:28s} {ntiles:>5} {len(chiral):>6} {len(missing):>12}   {detail}{flag}")
        if missing:
            bad.append((name, missing))
    print()
    if bad:
        print("INCOMPLETE PALETTES — every tiling needing the other handedness is unreachable:")
        for name, missing in bad:
            print(f"  {name}: {len(missing)} chiral tile(s) with no mirror twin — {', '.join(missing)}")
        sys.exit(1)
    print("every chiral tile has its mirror twin in its palette")


if __name__ == "__main__":
    main()
