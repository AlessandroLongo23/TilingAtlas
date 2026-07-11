#!/usr/bin/env python3
"""Bucket a pruned Cirtnact catalog (D-ring palette) by the rigorous angle-based ring class.

Uses the SAME block reader (render_cells.read_blocks) and counting-k rule (number of >=3-corner
groups) as export_ring_cells.py, so the totals reconcile with the pruner's per-k counts.

Angle model: every corner carries an angle in units of (360/D) deg:
  - regular N-gon corner: interior angle (N-2)*180/N -> units = (N-2)*(D/2)/N (integer for the tiles);
  - star corner N*pU / N*dU:  units = U.
For a tiling, D_min = 360 / gcd(all corner angles deg) = D / gcd(all corner units). Classes:
  - in-ring: every angle a multiple of 15 deg (representable in D=24);
  - genuine 9-fold: 9 | D_min;  genuine 5-fold: 5 | D_min;  mixer: 45 | D_min.
"star-bearing" = the vertype string contains '*'.
"""
import argparse
import re
from math import gcd
from functools import reduce

from render_cells import read_blocks, load_tables

TOK = re.compile(r"^(\d+)\*([pd])(\d+)$")
REG = re.compile(r"^(\d+)$")


def reg_units(n, D):
    num = (n - 2) * 180 * D
    den = n * 360
    assert num % den == 0, f"non-integer units for {n}-gon at D={D}"
    return num // den


def corner_units(vertype, D):
    units = []
    for g in re.findall(r"\(([^)]*)\)", vertype):
        for t in g.split(","):
            t = t.strip()
            if not t:
                continue
            sm = TOK.match(t)
            if sm:
                units.append(int(sm.group(3)))
                continue
            rm = REG.match(t)
            if rm:
                units.append(reg_units(int(rm.group(1)), D))
                continue
            raise ValueError(f"unparsed corner token {t!r} in {vertype!r}")
    return units


def kcount(vertype):
    return sum(1 for g in re.findall(r"\(([^)]*)\)", vertype) if len(g.split(",")) >= 3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pruned", required=True, help="pruned file OR dir")
    ap.add_argument("--tables", required=True)
    ap.add_argument("--k", type=int, required=True)
    args = ap.parse_args()
    import os, glob
    tab = load_tables(args.tables)
    D = tab.D

    files = ([args.pruned] if os.path.isfile(args.pruned)
             else sorted(glob.glob(os.path.join(args.pruned, "eupruned_*.txt"))))
    seen = set()
    for fp in files:
        for vt, cw in read_blocks(fp):
            seen.add(vt)

    total = ingrid = ninefold = fivefold = mixer = star_ninefold = 0
    star_blocks = []
    for vt in sorted(seen):
        if kcount(vt) != args.k:
            continue
        total += 1
        units = corner_units(vt, D)
        g = reduce(gcd, units)
        dmin = D // g
        starbearing = "*" in vt
        all_15 = all((u * (360 // D)) % 15 == 0 for u in units)
        if all_15:
            ingrid += 1
        elif dmin % 45 == 0:
            mixer += 1
        elif dmin % 9 == 0:
            ninefold += 1
            star_ninefold += 1 if starbearing else 0
            if starbearing:
                star_blocks.append(vt)
        elif dmin % 5 == 0:
            fivefold += 1
        else:
            ninefold += 1
    print(f"D={D} k={args.k}: total counting-k={args.k} blocks = {total}")
    print(f"  in-ring (15-deg grid, already in D=24): {ingrid}")
    print(f"  genuine 9-fold (9|D_min):               {ninefold}   (star-bearing: {star_ninefold})")
    print(f"  genuine 5-fold (5|D_min):               {fivefold}")
    print(f"  mixer (45|D_min):                        {mixer}")
    for vt in star_blocks:
        print(f"    9F* {vt}")


if __name__ == "__main__":
    main()
