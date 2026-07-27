"""Construct 1.16 on the 3.4.6.4 edge graph and test my invariants against it.

Wikipedia's table (Grunbaum et al. 1981 column) shows 1.14 (3.4.6.4), 1.15
(3/2.12.6.12) and 1.16 (4.12.4/3.12/11) sharing ONE edge diagram. 3.4.6.4 is one of
the convex 11 that the search already reproduces, so its vertex/edge set is available
as ground truth. If 1.16's four faces exist as closed unit walks on that graph, the
local model is right and the failure is in the search; if they do not, the model is
wrong.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grow2 import grow_disk
from hollow import ZERO, ZK, zadd, zabs, zfloat, cangle, face_corners, turn
from quotient import parse

ok, P, why = grow_disk(parse("3.4.6.4"), max_completions=400, time_cap=60.0, target_r=5.0)
print("3.4.6.4 patch: ok=%s why=%s faces=%d verts=%d" % (ok, why, len(P.faces), len(P.vfac)))

V = set(P.vfac)
E = set()
for ek, fs in P.edges.items():
    t = tuple(ek)
    if len(t) == 2: E.add(ek)
print("edges: %d" % len(E))

# rays at the origin, from the edge set
rays = []
for dr in range(24):
    if frozenset((ZERO, ZK[dr])) in E: rays.append(dr)
print("rays at origin: %s   gaps: %s" % (rays,
      [(rays[(i + 1) % len(rays)] - rays[i]) % 24 for i in range(len(rays))]))

# does a closed unit {n/d} walk starting at ZERO in direction e lie inside the graph?
def walk_in_graph(v, e, n, d):
    t = turn(n, d); p = v; dr = e % 24; pts = []
    for _ in range(n):
        q = zadd(p, ZK[dr])
        if q not in V or frozenset((p, q)) not in E: return None
        pts.append(p); p = q; dr = (dr + t) % 24
    return pts if p == v else None

print()
print("1.16 = 4.12.4/3.12/11 -- which of its faces exist on this graph?")
for (n, d) in parse("4.12.4/3.12/11"):
    hits = [e for e in range(24) if walk_in_graph(ZERO, e, n, d)]
    print("  {%d/%d} corner=%3d deg  walks from origin at dirs %s" % (n, d, cangle(n, d) * 15, hits))

print()
print("all closed unit walks at the origin, by tile, over the whole D=24 alphabet:")
for n in (3, 4, 6, 8, 12):
    for d in range(1, n):
        from math import gcd
        if gcd(n, d) != 1 or (24 * d) % n: continue
        hits = [e for e in range(24) if walk_in_graph(ZERO, e, n, d)]
        if hits: print("  {%d/%d} angle=%2d dirs=%s" % (n, d, cangle(n, d), hits))
