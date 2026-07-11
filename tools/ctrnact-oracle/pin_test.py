#!/usr/bin/env python3
"""Step-1 pinning test (palette-independent) for star-palette solution blocks.

A block is a one-parameter FAMILY iff there is a nonzero flex vector delta in R^species with,
for every vertex word v and every star species s:  (#point_s(v) - #dent_s(v)) * delta_s summed
over s leaves the 2pi angle sum invariant, i.e. M @ delta = 0 has a nonzero solution, where
M[v, s] = #point_s(v) - #dent_s(v). rank(M) == #species  => null space {0} => PINNED (rigid,
a genuinely discrete tiling). rank(M) < #species => free family (the flex directions are the
integer null space). This is exactly family_flex.py Step 1, without the ZZ[zeta] development.
"""
import argparse, re, glob, os
from fractions import Fraction

STAR = re.compile(r"^(\d+)\*([pd])(\d+)$")


def species_and_matrix(vertype):
    verts = [g for g in re.findall(r"\(([^)]*)\)", vertype)]
    species = set()
    for g in verts:
        for t in g.split(","):
            m = STAR.match(t.strip())
            if m:
                species.add(int(m.group(1)))  # star tiles distinguished by n; alpha flexes per n
    species = sorted(species)
    rows = []
    for g in verts:
        row = {s: 0 for s in species}
        for t in g.split(","):
            m = STAR.match(t.strip())
            if m:
                n, pd = int(m.group(1)), m.group(2)
                row[n] += 1 if pd == "p" else -1
        rows.append([row[s] for s in species])
    return species, rows


def rank(mat):
    m = [[Fraction(x) for x in r] for r in mat]
    R = len(m)
    C = len(m[0]) if R else 0
    rk = 0
    for c in range(C):
        piv = next((r for r in range(rk, R) if m[r][c] != 0), None)
        if piv is None:
            continue
        m[rk], m[piv] = m[piv], m[rk]
        pv = m[rk][c]
        m[rk] = [x / pv for x in m[rk]]
        for r in range(R):
            if r != rk and m[r][c] != 0:
                f = m[r][c]
                m[r] = [a - f * b for a, b in zip(m[r], m[rk])]
        rk += 1
    return rk


def classify(vertype):
    species, mat = species_and_matrix(vertype)
    if not species:
        return "no-star", 0
    rk = rank(mat) if mat else 0
    freedom = len(species) - rk
    return ("PINNED (rigid)" if freedom == 0 else f"FREE family (dim {freedom})"), freedom


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("blocks", nargs="+", help="vertype strings to test")
    args = ap.parse_args()
    for vt in args.blocks:
        label, _ = classify(vt)
        print(f"{label:22s} :: {vt}")


if __name__ == "__main__":
    main()
