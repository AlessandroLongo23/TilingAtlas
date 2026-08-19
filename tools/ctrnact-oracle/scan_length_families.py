#!/usr/bin/env python3
"""scan_length_families.py — which developed tilings carry a LENGTH parameter?

The engine develops every solved block with UNIT edges, because that is the only length its alphabet
names. `length_family.freedom` asks the question the alphabet cannot: hold the angles and let the
lengths move. A tiling with params = 0 is rigid up to scale; params >= 1 is a family, and the developed
cell is one member of it.

This is the step that turns the non-edge-to-edge shelves into PARAMETRIC ones, and it needs no new
search: the maps are already enumerated, in parallel, by run-oracle-parallel.sh.
"""
import json, sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import length_family as LF

src, maxk, logp = sys.argv[1], int(sys.argv[2]), sys.argv[3]
recs = [r for r in json.load(open(src)) if r["k"] <= maxk]
log = open(logp, "a", buffering=1)
def w(s):
    log.write(s + "\n"); print(s)

w(f"\n## {os.path.basename(src)} — {len(recs)} cells with k <= {maxk}\n")
w("```")
t0 = time.time(); hist = {}; fam = []; bad = 0
for i, r in enumerate(recs):
    polys = [{"n": len(f), "v": [complex(x, y) for x, y in f]} for f in r["faces"]]
    basis = [complex(*r["T1"]), complex(*r["T2"])]
    try:
        dim, info = LF.freedom(polys, basis)
    except Exception:
        bad += 1; continue
    if dim is None:
        bad += 1; continue
    p = info["params"]
    hist[p] = hist.get(p, 0) + 1
    if p >= 1:
        fam.append({"id": r["id"], "k": r["k"], "params": p, **{x: info[x] for x in ("V", "E", "F")}})
    if (i + 1) % 250 == 0:
        el = time.time() - t0
        w(f"  {i+1}/{len(recs)}  {el:.0f}s  eta {el/(i+1)*(len(recs)-i-1):.0f}s  families so far {len(fam)}")
w(f"  done {len(recs)} in {time.time()-t0:.0f}s, {bad} unreadable")
w("```\n")
w("| params | cells |\n|--------|-------|")
for p in sorted(hist): w(f"| {p} | {hist[p]} |")
w(f"\n**{len(fam)} of {len(recs)} carry at least one length parameter.**\n")
json.dump(fam, open(os.path.splitext(logp)[0] + "-families.json", "w"), indent=1)
