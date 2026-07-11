#!/usr/bin/env python3
"""Disposition pass for NEW k=2 blocks after a palette extension.

For every block in NEW but not in OLD (key = canonical vertex-type line), classify:
  myers-fixed          exact match of an in-ring fixed tiling record (Myers 2009)
  myers-family[a=N]    in-ring instance of one of Myers' 5 free-alpha k=2 family records
  new-family-A[a=N]    (3*d(16-a),3,3*p a,3) + (3*d(16-a),3*p a,3,3)      [E3/E4/N1 family]
  new-family-B[a=N]    (6*d(20-b),3*p a,4) + (6*p b,3*d(16-a),4), b=a+2   [6*+3*+square]
  new-family-C[a=N]    (6*p b,3*d(16-a),3) + (6*d(20-b),3*p a,3,3), b=a+4 [6*+3*+triangle]
  UNMATCHED            candidate new — flag loudly

Usage: star_k2_dispositions.py --old OLD.txt --new NEW.txt \
          --oracle myers-2009-k2.json --palette palettes/star24full.json
"""
import argparse
import collections
import json
import sys

import star_oracle_check as soc


def block_key_and_orbits(path):
    """[(canonical key line, [counted orbit token lists], full first line)]"""
    out = []
    for raw in open(path).read().split("---"):
        lines = [l for l in raw.strip().splitlines() if l.strip()]
        if not lines:
            continue
        key = lines[1] if len(lines) > 1 else lines[0]
        syms = lines[0].split(", ")
        orbits = []
        for s in syms:
            toks = soc.parse_engine_symbol(s)
            if len(toks) >= 3:
                orbits.append(toks)
        out.append((key, orbits, lines[0]))
    return out


def fam_A(a):
    d = 16 - a
    return [[f"3*d@{d}", "3", f"3*p@{a}", "3"], [f"3*d@{d}", f"3*p@{a}", "3", "3"]]


def fam_B(a):
    b = a + 2
    return [[f"6*d@{20-b}", f"3*p@{a}", "4"], [f"6*p@{b}", f"3*d@{16-a}", "4"]]


def fam_C(a):
    b = a + 4
    return [[f"6*p@{b}", f"3*d@{16-a}", "3"], [f"6*d@{20-b}", f"3*p@{a}", "3", "3"]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--old", required=True)
    ap.add_argument("--new", required=True)
    ap.add_argument("--oracle", required=True)
    ap.add_argument("--palette", required=True)
    args = ap.parse_args()

    soc.PALETTE_SPECIES = soc.load_palette_species(args.palette)
    oracle = json.load(open(args.oracle))
    records = oracle["records"]

    old_keys = collections.Counter(k for k, _, _ in block_key_and_orbits(args.old))
    new_blocks = block_key_and_orbits(args.new)
    seen = collections.Counter()
    tally = collections.Counter()
    unmatched = []
    print(f"old blocks: {sum(old_keys.values())}   new-run blocks: {len(new_blocks)}")
    for key, orbits, first in new_blocks:
        seen[key] += 1
        if seen[key] <= old_keys.get(key, 0):
            continue  # present in old catalog
        if len(orbits) != 2:
            print(f"  [k!=2 counted orbits: {len(orbits)}] {key}")
            continue
        hit = None
        for rec in records:
            if rec["kind"] == "tiling" and rec.get("inRing"):
                if soc.orbits_match(orbits, [o.split(".") for o in rec["orbits"]]):
                    hit = f"myers-fixed fig{rec['fig']}"
                    break
        if hit is None:
            for rec in records:
                if rec["kind"] != "family":
                    continue
                for a in range(1, 12):
                    inst = soc.instantiate_k2_family(rec, a)
                    if inst and soc.orbits_match(orbits, inst):
                        hit = f"myers-family fig{rec['fig']}[a={a}]"
                        break
                if hit:
                    break
        if hit is None:
            for name, fam in (("new-family-A", fam_A), ("new-family-B", fam_B),
                              ("new-family-C", fam_C)):
                for a in (1, 2, 3):
                    if soc.orbits_match(orbits, fam(a)):
                        hit = f"{name}[a={a}]"
                        break
                if hit:
                    break
        label = hit or "UNMATCHED <-- CANDIDATE NEW"
        tally[(hit or "UNMATCHED").split("[")[0].split(" ")[0]] += 1
        print(f"  NEW {key}\n      -> {label}")
        if hit is None:
            unmatched.append((key, first))
    print("\ntally:", dict(tally))
    if unmatched:
        print(f"\nUNMATCHED candidates ({len(unmatched)}):")
        for k, f in unmatched:
            print(f"  {k}")
    sys.exit(0)


if __name__ == "__main__":
    main()
