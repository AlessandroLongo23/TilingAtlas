#!/usr/bin/env python3
"""Pull the ALL-SADDLE k=2 blocks out of the unfiltered pruned set.

These are the blocks the genus-1 sign filter discarded on 2026-08-25. It discarded them correctly for
TORI — genus 1 forces total defect zero, which needs a convex vertex somewhere — and I then claimed
they were dead at every genus, on a convex-hull argument that is false. The great dodecahedron is
all-saddle, and developing the 2,839 all-saddle k=1 blocks produced five solids. So this population is
productive and unexamined. See the retraction in experiments/results/toroid-probe-2026-08-25.log.
"""
import collections, glob, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("EU_PALETTE", "toroid")
import develop_spherical as ds

ANG = {3: 60, 4: 90, 5: 108, 6: 120, 8: 135, 10: 144}
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
t = collections.Counter()
files = sorted(glob.glob(os.path.join(src, "eupruned_02_*.txt")))
for fi, p in enumerate(files):
    keep = []
    for b in ds.read_blocks(p):
        d = [360 - sum(ANG[ds._nd(q)[0]] for q in c) for c in ds.decode_block(b)["configs"]]
        allneg = all(x < 0 for x in d)
        t["all-saddle" if allneg else "other"] += 1
        if allneg:
            keep.append(b)
    if keep:
        with open(os.path.join(out, os.path.basename(p)), "w") as fh:
            for b in keep:
                fh.write("\n".join(b) + "\n\n")
    if fi % 40 == 0 or fi == len(files) - 1:
        print("  %3d/%d  %s" % (fi + 1, len(files), dict(t)), flush=True)
print("extracted %d all-saddle k=2 blocks" % t["all-saddle"])
