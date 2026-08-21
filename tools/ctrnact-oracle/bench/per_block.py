#!/usr/bin/env python3
"""Time every block in a shard individually. The cost is concentrated somewhere; find out where."""
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("EU_PALETTE", "spherical")
import develop_euclid as D
import develop_spherical as ds

blocks = ds.gather_blocks(sys.argv[1], 4, 4)
rows = []
for b in blocks:
    t = time.time()
    recs, err = D.develop_block(b, 0)
    rows.append((time.time() - t, len(recs or []), (err or {}).get("reason", "")[:40], (err or {}).get("id", "?")))
rows.sort(reverse=True)
tot = sum(r[0] for r in rows)
print("blocks %d   total %.1fs" % (len(rows), tot))
cum = 0
for i, (dt, n, why, bid) in enumerate(rows[:12]):
    cum += dt
    print("  %6.1fs (%4.1f%%, cum %4.1f%%)  realized=%d  %-40s %s" % (dt, 100*dt/tot, 100*cum/tot, n, why, bid))
q = [r[0] for r in rows]
print("  median %.3fs   p90 %.2fs   under 0.1s: %d of %d" % (q[len(q)//2], q[len(q)//10], sum(1 for x in q if x < 0.1), len(q)))
