"""Full DFS for 1.16 restricted to the 3.4.6.4 edge graph, with backtracking.

Restricting to the graph collapses the search to a handful of nodes, so exhaustion
here is a real answer: either 1.16 lives on this graph (and the unrestricted search
has a pruning bug) or it does not (and the shared edge diagram is not shared).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grow2 import grow_disk
from hollow import (Patch, ZERO, ZK, zadd, zabs, zfloat, turn, placements)
from quotient import parse

CFG = parse(sys.argv[1] if len(sys.argv) > 1 else "4.12.4/3.12/11")
BASE = sys.argv[2] if len(sys.argv) > 2 else "3.4.6.4"
M = len(CFG)
RAD = float(sys.argv[3]) if len(sys.argv) > 3 else 2.5

ok, G, _ = grow_disk(parse(BASE), max_completions=600, time_cap=90.0, target_r=6.0)
V = set(G.vfac)
E = set(ek for ek in G.edges if len(tuple(ek)) == 2)
print("base %s: %d verts %d edges" % (BASE, len(V), len(E)))

def walk_in_graph(v, e, n, d):
    t = turn(n, d); p = v; dr = e % 24
    for _ in range(n):
        q = zadd(p, ZK[dr])
        if q not in V or frozenset((p, q)) not in E: return False
        p = q; dr = (dr + t) % 24
    return p == v

_gs = {}
def graph_stars(v):
    got = _gs.get(v)
    if got is None:
        uniq, _ = placements(CFG)
        got = [c for c in uniq if all(walk_in_graph(v, dr, n, d) for (a, dr, (n, d)) in c)]
        _gs[v] = got
    return got

P = Patch()
nodes = [0]

def fits(v):
    raw = P.vfac[v]
    known = set((a, dr, nd) for (a, dr, nd, k) in raw)
    return [c for c in graph_stars(v) if known <= set(c)]

def apply(v, c):
    for (a, dr, (n, d)) in c:
        if not P.add_face(v, dr, n, d): return False
    return len(P.vfac[v]) == M

def nearest_open():
    best = None
    for v in P.vfac:
        if len(P.vfac[v]) == M: continue
        r = zabs(v)
        if r > RAD or (best is not None and r >= best[1]): continue
        best = (v, r)
    return best

def solve():
    nodes[0] += 1
    if nodes[0] > 200000: return "cap"
    mk = P.mark()
    nx = nearest_open()
    if nx is None: return "complete"
    v = nx[0]; o = fits(v)
    if not o: P.rollback(mk); return "dead"
    for c in o:
        mk2 = P.mark()
        if apply(v, c) and solve() == "complete": return "complete"
        P.rollback(mk2)
    P.rollback(mk); return "dead"

sys.setrecursionlimit(200000)
seeds = graph_stars(ZERO)
print("seed stars on the graph: %d" % len(seeds))
res = "dead"
for i, s in enumerate(seeds):
    mk = P.mark()
    if apply(ZERO, s):
        res = solve()
        print("  seed %d -> %s  (nodes=%d faces=%d)" % (i, res, nodes[0], len(P.faces)))
        if res == "complete": break
    P.rollback(mk); nodes[0] = 0
print("RESULT for %s on %s within r<=%.1f: %s" % (sys.argv[1] if len(sys.argv) > 1 else "1.16", BASE, RAD, res))
