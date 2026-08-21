#!/usr/bin/env python3
"""Does the joint multistart ever pay? Log (unknowns, roots found) for every solve_joint call."""
import os, sys, collections, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("EU_PALETTE", "spherical")
import develop_euclid as D, develop_spherical as ds
tally = collections.Counter(); found = collections.Counter()
orig = D.solve_joint
def spy(verts, known, rest, **kw):
    out = orig(verts, known, rest, **kw)
    tally[len(rest)] += 1
    if out: found[len(rest)] += len(out)
    return out
D.solve_joint = spy
for b in ds.gather_blocks(sys.argv[1], int(sys.argv[2]), int(sys.argv[2])):
    D.develop_block(b, 0)
print("unknowns | joint calls | roots found")
for k in sorted(tally):
    print("   %2d     |    %5d    |   %d" % (k, tally[k], found.get(k, 0)))
