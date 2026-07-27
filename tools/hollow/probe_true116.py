"""Grow 1.16 restricted to the 3.4.6.4 edge graph, then compare every star it
produces with what alignments() would have offered. Whatever the restricted growth
uses and alignments() does not is the bug.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grow2 import grow_disk
from hollow import (Patch, ZERO, ZK, zadd, zabs, zfloat, cangle, turn,
                    face_corners, face_key, alignments, placements)
from quotient import parse

CFG = parse("4.12.4/3.12/11")
M = len(CFG)

ok, G, _ = grow_disk(parse("3.4.6.4"), max_completions=600, time_cap=90.0, target_r=6.0)
V = set(G.vfac)
E = set(ek for ek in G.edges if len(tuple(ek)) == 2)

def walk_in_graph(v, e, n, d):
    t = turn(n, d); p = v; dr = e % 24
    for _ in range(n):
        q = zadd(p, ZK[dr])
        if q not in V or frozenset((p, q)) not in E: return False
        p = q; dr = (dr + t) % 24
    return p == v

def nm(nd): return str(nd[0]) if nd[1] == 1 else "%d/%d" % nd
def pt(v):
    z = zfloat(v); return "(%6.2f,%6.2f)" % (z.real, z.imag)

# every star of CFG that is realizable on the graph at v
def graph_stars(v):
    uniq, _ = placements(CFG)
    out = []
    for c in uniq:
        if all(walk_in_graph(v, dr, n, d) for (a, dr, (n, d)) in c): out.append(c)
    return out

P = Patch()
seed = graph_stars(ZERO)
print("stars of 1.16 realizable on the graph at the origin: %d" % len(seed))
for c in seed:
    print("   " + "  ".join("%s@%d(%d)" % (nm(nd), dr, a) for (a, dr, nd) in sorted(c, key=lambda t: t[1])))
if not seed: sys.exit("no star at the origin -- 1.16 is NOT on this graph")

for (a, dr, (n, d)) in seed[0]:
    assert P.add_face(ZERO, dr, n, d), "seed face rejected by the 2-face edge cap"
print("\nseed placed: %d faces, %d edges" % (len(P.faces), len(P.edges)))

# restricted growth: only stars realizable on the graph
import heapq
frontier = sorted((zabs(v), i) for i, v in enumerate(P.vfac))
order = list(P.vfac)
steps = 0
while steps < 40:
    nxt = None
    for v in P.vfac:
        if len(P.vfac[v]) == M: continue
        r = zabs(v)
        if r > 3.0 or (nxt is not None and r >= nxt[1]): continue
        nxt = (v, r)
    if nxt is None: print("\ncomplete inside r<=3.0"); break
    v = nxt[0]
    raw = P.vfac[v]
    known = sorted(set((a, dr, nd) for (a, dr, nd, k) in raw))
    dirs = [dr for (a, dr, nd, k) in raw]
    gs = graph_stars(v)
    fit = [c for c in gs if all(k in [(a, dr, nd) for (a, dr, nd) in c] for k in known)]
    al = alignments(CFG, known)
    dup = len(set(dirs)) != len(dirs)
    print("\nstep %d  v=%s r=%.3f  known=%d%s" % (steps, pt(v), nxt[1], len(known), "  DUP-DIRS" if dup else ""))
    for (a, dr, nd) in known: print("      have %s@%d (%d)" % (nm(nd), dr, a))
    print("      graph-realizable stars fitting them: %d   alignments(): %d" % (len(fit), len(al)))
    if not fit:
        print("      >>> the graph offers NO star here: growth left the true tiling earlier")
        break
    if len(al) == 0:
        print("      >>> BUG: alignments() rejects a star the graph realizes")
        for (a, dr, nd) in sorted(fit[0], key=lambda t: t[1]):
            print("          true: %s@%d (%d)" % (nm(nd), dr, a))
        break
    for (a, dr, (n, d)) in fit[0]:
        if not P.add_face(v, dr, n, d):
            print("      >>> BUG: add_face rejected %s@%d (edge cap)" % (nm((n, d)), dr)); sys.exit()
    if len(P.vfac[v]) != M:
        print("      >>> BUG: vertex ended with %d corners, star has %d" % (len(P.vfac[v]), M))
        for (a, dr, nd, k) in sorted(P.vfac[v], key=lambda t: t[1]):
            print("          %s@%d (%d)" % (nm(nd), dr, a))
        break
    steps += 1
print("\nfaces=%d verts=%d" % (len(P.faces), len(P.vfac)))
