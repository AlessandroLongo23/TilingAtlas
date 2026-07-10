#!/usr/bin/env python3
"""Compare a star-palette pruned catalog against the Myers oracle JSONs, per tiling.

Engine vertex symbols look like "(3,3,8*p1,4*d14,8*p1)A"; oracle orbit strings look
like "3.3.8*p@1.4*d@14.8*p@1" (tokens in pi/12 units). Comparison is on the cyclic
corner-token sequence up to rotation and reversal (the engine merges mirror images,
and Myers counts a reversed order as the same species).

Classification of each engine solution's counting orbits (k=1: exactly one):
  pure-regular  -> matched against oracle["knownRegular"]
  star-bearing  -> matched against tiling records (Fig 4 + pinned Fig 3), then against
                   family templates instantiated at every palette alpha
  otherwise     -> UNMATCHED (a logged finding; Myers is a hand enumeration)

Usage:
  python3 star_oracle_check.py --pruned run-star-k1/pruned/eupruned_01.txt \
      --oracle ../../experiments/star-oracle/myers-2004-k1.json --k 1
"""
import argparse
import json
import re
import sys
from collections import defaultdict


def parse_engine_symbol(sym):
    """'(3,3,8*p1,4*d14,8*p1)A' -> ['3','3','8*p@1','4*d@14','8*p@1'] (oracle tokens)."""
    m = re.match(r"\(([^)]*)\)", sym)
    toks = []
    for t in m.group(1).split(","):
        sm = re.match(r"(\d+)\*([pd])(\d+)$", t)
        toks.append(f"{sm.group(1)}*{sm.group(2)}@{sm.group(3)}" if sm else t)
    return toks


def cyc_variants(seq):
    n = len(seq)
    out = set()
    for s in (list(seq), list(reversed(seq))):
        for r in range(n):
            out.add(tuple(s[r:] + s[:r]))
    return out


def cyc_equal(a, b):
    return len(a) == len(b) and tuple(b) in cyc_variants(a)


def read_pruned_blocks(path):
    """Yield (vertypeline, conwayline) per solution block."""
    lines = [l.rstrip("\n") for l in open(path)]
    i = 0
    while i < len(lines):
        if lines[i].startswith("("):
            yield lines[i], lines[i + 4] if i + 4 < len(lines) else ""
            i += 5
        else:
            i += 1


def is_star_token(t):
    return "*" in t


def family_instances(rec):
    """Instantiate a k=1 family template at each palette alphaU: [(alphaU, tokens)]."""
    pat = rec["template"]["orbitPattern"].split(".")
    n = rec["template"]["n"]
    dent_base = 24 - 24 // n
    out = []
    for a in rec.get("paletteAlphaU", []):
        toks = []
        for t in pat:
            t = t.replace("p@A", f"p@{a}").replace("d@D", f"d@{dent_base - a}")
            toks.append(t)
        out.append((a, toks))
    return out


# star species available in the palette, as (n, alphaU); kept in sync with star24.json
PALETTE_SPECIES = {(3, 1), (3, 2), (4, 2), (4, 3), (4, 4), (6, 2), (6, 4), (6, 5), (6, 6),
                   (8, 1), (8, 3), (8, 6), (12, 2), (12, 4), (12, 6)}


def instantiate_k2_family(rec, a):
    """Evaluate a k=2 family record's symbolic-a orbit patterns at integer a.
    Returns list-of-orbit-token-lists, or None if any species falls outside the palette."""
    orbits = []
    for orb in rec["orbits"]:
        toks = []
        for t in orb.split("."):
            m = re.match(r"(\d+)\*([pd])@(.+)$", t)
            if not m:
                toks.append(t)
                continue
            n, pd = int(m.group(1)), m.group(2)
            u = eval(m.group(3), {}, {"a": a})
            alpha = u if pd == "p" else 24 - 24 // n - u
            if not (0 < alpha < 24 // 2) or (n, alpha) not in PALETTE_SPECIES:
                return None
            toks.append(f"{n}*{pd}@{u}")
        orbits.append(toks)
    return orbits


def orbits_match(engine_orbits, oracle_orbits):
    """Multiset match of orbit lists (k<=2), each cyclic up to reversal."""
    if len(engine_orbits) != len(oracle_orbits):
        return False
    if len(engine_orbits) == 1:
        return cyc_equal(engine_orbits[0], oracle_orbits[0])
    a, b = engine_orbits
    x, y = oracle_orbits
    return (cyc_equal(a, x) and cyc_equal(b, y)) or (cyc_equal(a, y) and cyc_equal(b, x))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pruned", required=True)
    ap.add_argument("--oracle", required=True)
    ap.add_argument("--k", type=int, default=1)
    args = ap.parse_args()

    oracle = json.load(open(args.oracle))
    records = oracle["records"]
    known_regular = [r.split(".") for r in oracle.get("knownRegular", [])]

    # collect engine solutions: counting orbits only (dent-fill symbols are 2-corner)
    sols = []
    for vertype, conway in read_pruned_blocks(args.pruned):
        syms = vertype.split(", ")
        orbits = []
        for s in syms:
            toks = parse_engine_symbol(s)
            if len(toks) >= 3:          # counting vertex (dent-fills have 2 corners)
                orbits.append(toks)
        if len(orbits) == args.k:
            sols.append((orbits, vertype, conway))
    print(f"engine solutions with counting-k={args.k}: {len(sols)}")

    matched = defaultdict(list)   # oracle key -> engine solutions
    extras = []
    regular_sols = []
    for orbits, vertype, conway in sols:
        starry = any(is_star_token(t) for o in orbits for t in o)
        hit = None
        if not starry:
            if args.k == 1:
                for kr in known_regular:
                    if cyc_equal(orbits[0], kr):
                        hit = "regular:" + ".".join(kr)
                        break
            else:
                regular_sols.append(vertype)
                continue
        else:
            for rec in records:
                if rec["kind"] == "tiling" and rec.get("inRing"):
                    if orbits_match(orbits, [o.split(".") for o in rec["orbits"]]):
                        hit = "fig" + rec["fig"]
                        break
            if hit is None:
                for rec in records:
                    if rec["kind"] != "family":
                        continue
                    if args.k == 1 and "template" in rec:
                        for a, ftoks in family_instances(rec):
                            if cyc_equal(orbits[0], ftoks):
                                hit = f"fig{rec['fig']}[alphaU={a}]"
                                break
                    elif args.k == 2:
                        for a in range(1, 12):
                            inst = instantiate_k2_family(rec, a)
                            if inst and orbits_match(orbits, inst):
                                hit = f"fig{rec['fig']}[a={a}]"
                                break
                    if hit:
                        break
        if hit:
            matched[hit].append(vertype)
        else:
            extras.append((vertype, conway))

    print("\n== oracle coverage ==")
    fails = 0
    for rec in records:
        if rec["kind"] == "tiling" and rec.get("inRing"):
            key = "fig" + rec["fig"]
            n = len(matched.get(key, []))
            status = "FOUND" if n else "MISSING <-- HARD FAIL"
            if not n:
                fails += 1
            print(f"  {key:8s} {rec['myersCaption']:50s} {status}" + (f" x{n}" if n > 1 else ""))
    for rec in records:
        if rec["kind"] == "family":
            if args.k == 1 and "template" in rec:
                for a, ftoks in family_instances(rec):
                    key = f"fig{rec['fig']}[alphaU={a}]"
                    n = len(matched.get(key, []))
                    print(f"  {key:16s} member {'.'.join(ftoks):42s} {'FOUND' if n else 'missing (family member)'}")
            elif args.k == 2:
                for a in range(1, 12):
                    inst = instantiate_k2_family(rec, a)
                    if inst:
                        key = f"fig{rec['fig']}[a={a}]"
                        n = len(matched.get(key, []))
                        print(f"  {key:16s} member {'; '.join('.'.join(o) for o in inst):58s} "
                              f"{'FOUND' if n else 'missing (family member)'}")
    if args.k == 1:
        nreg = sum(1 for k in matched if k.startswith("regular:"))
        print(f"\n  pure-regular uniform tilings found: {nreg}/{len(known_regular)}")
        for kr in known_regular:
            key = "regular:" + ".".join(kr)
            if key not in matched:
                print(f"    MISSING regular {'.'.join(kr)} <-- HARD FAIL")
                fails += 1
    else:
        print(f"\n  pure-regular k=2 tilings found: {len(regular_sols)} (expected 20, "
              f"octagon-bearing expected 0 per the settled octagon lemma)")
        n_oct = sum(1 for v in regular_sols if re.search(r"[,(]8[,)]", v))
        if len(regular_sols) != 20:
            print(f"    COUNT MISMATCH <-- HARD FAIL"); fails += 1
        if n_oct:
            print(f"    {n_oct} octagon-bearing pure-regular k=2 solutions <-- would REFUTE the octagon lemma; inspect!")
            fails += 1

    print(f"\n== extras (engine output matching nothing; each is a logged finding) ==")
    for vertype, conway in extras:
        print(f"  EXTRA {vertype}   [{conway}]")
    print(f"\nsummary: {len(sols)} solutions, {len(extras)} extras, {fails} hard fails")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
