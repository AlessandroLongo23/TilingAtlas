#!/usr/bin/env python3
"""Filter a developed cells file to the genuinely-new RIGID out-of-ring tilings of one ring class.

Input: the JSON produced by export_ring_cells.py (all star-bearing counting-k blocks, developed).
Keeps a record iff (a) its ring class matches --class by the angle-based D_min = D/gcd(corner units),
and (b) the Step-1 pinning test says PINNED (freedom 0) -- i.e. not a free-alpha family whose
generic member already lives in-ring (D=24). Re-ids sequentially with --id-prefix and writes --out.

  --class 9fold : 9 | D_min (and not 45|D_min)
  --class 5fold : 5 | D_min (and not 45|D_min)   [pure 5-fold, no 9-fold direction]
  --class mixer : 45 | D_min                     [needs both 5-fold and 9-fold]
"""
import argparse, json, re
from math import gcd
from functools import reduce
from pin_test import classify

TOK = re.compile(r"^(\d+)\*([pd])(\d+)$"); REG = re.compile(r"^(\d+)$")


def units(vt, D):
    out = []
    for g in re.findall(r"\(([^)]*)\)", vt):
        for t in g.split(","):
            t = t.strip()
            if not t:
                continue
            m = TOK.match(t)
            if m:
                out.append(int(m.group(3))); continue
            r = REG.match(t)
            num = (int(r.group(1)) - 2) * 180 * D; den = int(r.group(1)) * 360
            assert num % den == 0, f"{r.group(1)}-gon non-integer units at D={D}"
            out.append(num // den)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", required=True)
    ap.add_argument("--D", type=int, required=True)
    ap.add_argument("--klass", required=True, choices=["9fold", "5fold", "mixer"])
    ap.add_argument("--id-prefix", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    data = json.load(open(args.cells))
    keep = []
    for r in data["records"]:
        vt = r["vertype"]
        g = reduce(gcd, units(vt, args.D))
        dmin = args.D // g
        _, freedom = classify(vt)
        if freedom != 0:
            continue
        is_mix = (dmin % 45 == 0)
        ok = {"9fold": (dmin % 9 == 0 and not is_mix),
              "5fold": (dmin % 5 == 0 and not is_mix),
              "mixer": is_mix}[args.klass]
        if ok:
            keep.append(r)
    for i, r in enumerate(keep, 1):
        r["id"] = f"{args.id_prefix}-{i:02d}"
    data["records"] = keep
    json.dump(data, open(args.out, "w"), indent=1)
    print(f"{args.klass} D={args.D}: kept {len(keep)} rigid -> {args.out}")
    for r in keep:
        print(f"    {r['id']}: {r['vertype']}")


if __name__ == "__main__":
    main()
