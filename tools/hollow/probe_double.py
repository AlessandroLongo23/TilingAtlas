"""Test the doubling model for 1.16.

The 2-colouring is obstructed (3 squares round each triangle of 3.4.6.4 pairwise
share a vertex -> odd cycle), so 1.16 cannot pick one orientation per polygon. The
alternative reading, and the one Coxeter's "(3/2 6/2)|" marks, is that every polygon
appears in BOTH orientations: the drawing is unchanged, each 1-cell of the map is
doubled, and each geometric segment carries 4 face-sides instead of 2.

Check it: take every square and every dodecagon of the 3.4.6.4 graph in both
orientations and measure, per vertex, the corner count and the face-sides per ray.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collections import Counter
from grow2 import grow_disk
from hollow import ZERO, ZK, zadd, zabs, turn, cangle
from quotient import parse

ok, G, _ = grow_disk(parse("3.4.6.4"), max_completions=900, time_cap=120.0, target_r=7.0)
V = set(G.vfac); E = set(ek for ek in G.edges if len(tuple(ek)) == 2)
print("3.4.6.4: %d verts %d edges" % (len(V), len(E)))

def walk(v, e, n, d):
    t = turn(n, d); p = v; dr = e % 24; out = []
    for _ in range(n):
        q = zadd(p, ZK[dr])
        if q not in V or frozenset((p, q)) not in E: return None
        out.append((p, dr)); p = q; dr = (dr + t) % 24
    return out if p == v else None

TILES = parse("4.12.4/3.12/11")
faces = {}
for v in V:
    if zabs(v) > 4.0: continue
    for (n, d) in TILES:
        for e in range(24):
            cs = walk(v, e, n, d)
            if cs is None or any(zabs(p) > 4.0 for (p, _) in cs): continue
            key = (n, d, min(tuple(cs[i:] + cs[:i]) for i in range(n)))
            faces[key] = cs
print("faces (all four tile types, every position): %d" % len(faces))
print("  by tile: %s" % dict(Counter((n, d) for (n, d, _) in faces)))

corners = {}; sides = {}
for (n, d, _), cs in faces.items():
    a = cangle(n, d)
    for (p, dr) in cs:
        corners.setdefault(p, []).append((a, dr, (n, d)))
        sides.setdefault((p, dr), 0)
        sides[(p, dr)] += 1
        sides.setdefault((p, (dr + a) % 24), 0)
        sides[(p, (dr + a) % 24)] += 1

core = [v for v in V if zabs(v) <= 1.6]
print("\ncore vertices (r<=1.6): %d" % len(core))
print("  corner counts:      %s" % dict(Counter(len(corners.get(v, [])) for v in core)))
ray = Counter()
for v in core:
    seen = set(dr for (a, dr, nd) in corners.get(v, []))
    seen |= set((dr + a) % 24 for (a, dr, nd) in corners.get(v, []))
    for dr in seen: ray[sides[(v, dr)]] += 1
print("  face-sides per ray: %s" % dict(ray))
print("  total angle/vertex: %s" % sorted(set(sum(a for (a, _, _) in corners.get(v, [])) for v in core)))
print("  rays per vertex:    %s" % sorted(set(len(set([dr for (a, dr, nd) in corners.get(v, [])] +
      [(dr + a) % 24 for (a, dr, nd) in corners.get(v, [])])) for v in core)))
