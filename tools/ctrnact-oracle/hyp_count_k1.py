#!/usr/bin/env python3
"""How many distinct hyperbolic tilings does a cells.json actually hold, by true k?

Identity and k are the minimal Delaney–Dress symbol of each block's quotient darts at its forced edge
length (dsymbol_from_darts.analyse) — a complete isomorphism invariant, no development, no radius, no
gate. Validated against the Euclidean ground truth: the regular palette's raw k=1/k=2 solver blocks
collapse to exactly 10/20 = A068599 (octagon-blind) under the same code path at l=0.

The ball-code version of this counter (see git history / NOTES §80) over-counted orbits and claimed
develop_patch proves injectivity by not raising — it does not (it dedups a dart against itself, not two
darts on one frame). Both mistakes are on record; this counter shares no code with them.

Usage: python3 hyp_count_k1.py cells.json [cells2.json ...]
"""
import json
import sys
from collections import defaultdict

from dsymbol_from_darts import analyse

cells = []
for path in sys.argv[1:]:
    cells += json.load(open(path))
classes = {}
invalid = defaultdict(int)
for r in cells:
    d = r.get("darts")
    if not d:
        invalid["no darts"] += 1
        continue
    a = analyse(d["rneig"], d["glue"], d["lvert"], r["edgeLength"])
    if not a["valid"]:
        invalid[a["reason"][:60]] += 1
        continue
    classes.setdefault(a["key"], (a["k"], a["orbits"]))
byk = defaultdict(int)
for k, _orbits in classes.values():
    byk[k] += 1
print(f"records: {len(cells)}  distinct tilings: {len(classes)}  "
      f"by k: {', '.join(f'k={k}: {n}' for k, n in sorted(byk.items()))}")
for reason, n in sorted(invalid.items()):
    print(f"  invalid {n}: {reason}")

# k=1 detail: which vertex figures carry more than one 1-uniform tiling (the §80 4.4.4.6 phenomenon).
multi = defaultdict(int)
for k, orbits in classes.values():
    if k == 1:
        multi[".".join(map(str, orbits[0]))] += 1
share = {c: n for c, n in multi.items() if n > 1}
print(f"k=1 figures carrying MORE THAN ONE 1-uniform tiling: {len(share)} of {len(multi)}")
for c, n in sorted(share.items(), key=lambda kv: -kv[1])[:15]:
    print(f"    {c:26} {n} tilings")
