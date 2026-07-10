#!/usr/bin/env python3
"""cells JSON (array of {id,k,T1,T2,Seed}) -> flat stream for eu_classify:
   <id> <k> T1[4] T2[4] <nseed> seed[nseed*4]
Usage: python3 cells_to_flat.py <cells.json>   (writes flat to stdout)"""
import sys, json
d = json.load(open(sys.argv[1]))
ts = d if isinstance(d, list) else d.get("tilings", [])
out = []
for t in ts:
    if not (t.get("T1") and t.get("T2") and t.get("Seed")): continue
    seed = t["Seed"]
    row = [t["id"], str(t["k"])] + [str(x) for x in t["T1"]] + [str(x) for x in t["T2"]] + [str(len(seed))]
    for v in seed: row += [str(x) for x in v]
    out.append(" ".join(row))
sys.stdout.write("\n".join(out) + "\n")
