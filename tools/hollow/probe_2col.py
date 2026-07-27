"""1.16 on the 3.4.6.4 graph reduces to a 2-colouring.

Every vertex of 3.4.6.4 lies on exactly two dodecagons and two squares. 1.16 needs
one prograde and one retrograde of each at every vertex, and a face has a single
orientation, so the dodecagons must be 2-coloured such that the two through any
vertex differ -- i.e. the graph (nodes = dodecagons, edges = shared vertices) must
be bipartite. Same for the squares. If either has an odd cycle, 1.16 as modelled
cannot exist on this graph; if both are bipartite, the DFS has a bug.
"""
import sys, os
from collections import deque
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grow2 import grow_disk
from hollow import ZERO, ZK, zadd, zabs, turn
from quotient import parse

ok, G, _ = grow_disk(parse("3.4.6.4"), max_completions=900, time_cap=120.0, target_r=7.0)
V = set(G.vfac); E = set(ek for ek in G.edges if len(tuple(ek)) == 2)
print("3.4.6.4: %d verts %d edges" % (len(V), len(E)))

def walk(v, e, n, d):
    t = turn(n, d); p = v; dr = e % 24; pts = []
    for _ in range(n):
        q = zadd(p, ZK[dr])
        if q not in V or frozenset((p, q)) not in E: return None
        pts.append(p); p = q; dr = (dr + t) % 24
    return pts if p == v else None

def collect(n, d, rmax):
    """canonical faces {n/d} whose vertices all sit within rmax"""
    out = {}
    for v in V:
        if zabs(v) > rmax: continue
        for e in range(24):
            pts = walk(v, e, n, d)
            if pts is None or any(zabs(p) > rmax for p in pts): continue
            key = min(tuple(pts[i:] + pts[:i]) for i in range(n))
            out[key] = pts
    return out

for (n, d, label) in ((12, 1, "dodecagon"), (4, 1, "square")):
    faces = collect(n, d, 4.5)
    inc = {}
    for key, pts in faces.items():
        for p in pts: inc.setdefault(p, []).append(key)
    interior = {p: fs for p, fs in inc.items() if len(fs) == 2 and zabs(p) <= 2.5}
    print("\n%s: %d faces; %d interior vertices lie on exactly 2" % (label, len(faces), len(interior)))
    adj = {}
    for p, (a, b) in interior.items():
        adj.setdefault(a, set()).add(b); adj.setdefault(b, set()).add(a)
    colour = {}; odd = None
    for s in adj:
        if s in colour: continue
        colour[s] = 0; q = deque([s])
        while q:
            u = q.popleft()
            for w in adj[u]:
                if w not in colour: colour[w] = 1 - colour[u]; q.append(w)
                elif colour[w] == colour[u]: odd = (u, w)
    print("  conflict graph: %d nodes, bipartite = %s%s"
          % (len(adj), odd is None, "" if odd is None else "   ODD CYCLE found"))
