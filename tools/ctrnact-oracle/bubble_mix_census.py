#!/usr/bin/env python3
"""Which FAMILIES does each solution of a mixed bubble board actually use?

An all-tile palette contains the single-family searches as special cases, so a mixed board's raw
count is not its shippable count: the triangle+hexagon run returned 1,696 tilings of which 923 were
pure triangle and 65 pure hexagon, already on their own boards (DEVELOPMENT_NOTES 2026-08-23). The
same filter is needed for every rhombic mixture, and it is also the cross-validation that matters —
a pure slice of a mixed palette must reproduce the dedicated board's count exactly.

No development needed: the solver names each output file by the SET of tile famchars its blocks use
(`eupruned_02_t00t12.txt`), so the census is a filename read. gen_bubble_palette.py numbers the merged
tiles t00, t01, … in source order, which is what makes the mapping from index to family a range.

    python3 bubble_mix_census.py --pruned <dir> --palette bubble-rth [--kmax 3]
"""
import argparse, collections, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def family_of(tile):
    """Which family a bubble tile belongs to, from its angle word.

    Corner count alone is not enough: the rhombus and the square both have four, and they are told
    apart by the rhombus alternating 60 and 120 where the square repeats 90. That is the same trap
    the shelf's FAMILY_LETTER fell into on 2026-08-24.
    """
    n = len(tile["angles"])
    if n == 3:
        return "T"
    if n == 6:
        return "H"
    return "R" if len(set(tile["angles"])) > 1 else "S"


def palette_families(name):
    """(famchar -> family, every family on the board) for a palette, by NAME."""
    spec = json.load(open(os.path.join(HERE, "alphabets", "palettes", name + ".json")))
    fam = {t["famchar"]: family_of(t) for t in spec["tiles"]}
    return fam, set(fam.values())


def families_in(filename, fam):
    """The families a pruned/solver output file's solutions use, read off its NAME.

    The solver names each file by the set of tile famchars its blocks use, so this costs nothing and
    needs no development. Merged palettes (gen_bubble_palette.py) number their tiles t00, t01, …;
    the hand-written ones use single letters. Both are matched, longest form first.
    """
    chars = re.findall(r"t\d\d", filename) or list(filename)
    return {fam[c] for c in chars if c in fam}


# The CLI lives under main(): develop_marked.py imports the three helpers above, and a
# module-level parse_args() runs on import — it swallowed the developer's own argv and made it
# fail with this file's usage message.
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pruned", required=True)
    ap.add_argument("--palette", required=True, help="palette NAME, e.g. bubble-rth")
    ap.add_argument("--kmax", type=int, default=99)
    a = ap.parse_args()
    FAM, ALL_SET = palette_families(a.palette)
    ALL = sorted(ALL_SET)

    per = collections.Counter()      # (k, family set) -> tilings
    for fn in sorted(os.listdir(a.pruned)):
        m = re.match(r"eupruned_(\d+)_(.+)\.txt$", fn)
        if not m: continue
        k = int(m.group(1))
        if k > a.kmax: continue
        fams = "".join(sorted(families_in(m.group(2), FAM)))
        if not fams:
            sys.exit(f"{fn}: no tile famchars recognised — is --palette the right one?")
        # One "TES file:" line per kept tiling — the pruner's per-solution marker. The SOLVER's
        # raw files use "Number of vertex types:" instead; counting that here silently returns zero.
        n = sum(1 for line in open(os.path.join(a.pruned, fn)) if line.startswith("TES file:"))
        per[(k, fams)] += n

    ks = sorted({k for k, _ in per})
    combos = sorted({f for _, f in per}, key=lambda f: (len(f), f))
    print(f"{a.palette}: families {'+'.join(ALL)}, pruned dir {a.pruned}")
    print(f"{'uses':<8}" + "".join(f"k={k:<7}" for k in ks) + "total")
    for f in combos:
        row = [per[(k, f)] for k in ks]
        print(f"{f:<8}" + "".join(f"{v:<9}" for v in row) + str(sum(row)))
    mixed = [f for f in combos if len(f) == len(ALL)]
    tot = sum(per[(k, f)] for k in ks for f in combos)
    mix = sum(per[(k, f)] for k in ks for f in mixed)
    print(f"\ntotal {tot}   genuinely mixing all {len(ALL)} families: {mix}   already on another board: {tot - mix}")


if __name__ == "__main__":
    main()
