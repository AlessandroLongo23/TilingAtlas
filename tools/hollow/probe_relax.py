"""Which invariant blocks 1.16 / 1.19 / 1.21?

Three candidate relaxations, tested independently. The point is to find out which
assumption is false, from data, before deciding what the correct model is:

  S1  a vertex may carry two corners with the same outgoing direction
      (legal when delta>=2 if the two corners sit at different levels of the
      multiply-wound vertex figure)
  S2  a geometric segment may carry more than 2 face-sides
      (legal if two distinct 1-cells of the map coincide as point sets)
  S3  a vertex may carry more corners than the star has
      (would mean the vertex figure is not a single cycle -- the most drastic)

Each is applied ALONE and in combination, and the same harness is run on the 11
convex tilings so a relaxation that "works" by making everything succeed is caught.
"""
import sys, os, itertools
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hollow import (Patch, ZERO, cangle, alignments, zabs, face_corners, face_key)
from quotient import parse

GMS14 = {
 "1.2": "4.4.3/2.3/2.3/2", "1.4": "4.3/2.4.3/2.3/2", "1.6": "8.4/3.8/5",
 "1.7": "8/3.8.8/5.8/7",   "1.8": "4.8/5.8/5",       "1.12": "12.6/5.12/7",
 "1.13": "6.4/3.12/7",     "1.15": "3/2.12.6.12",    "1.16": "4.12.4/3.12/11",
 "1.17": "4.3/2.4.6/5",    "1.18": "12/5.3.12/5.6/5","1.19": "12/5.4.12/7.4/3",
 "1.21": "12/5.12.12/7.12/11", "1.22": "12/5.12/5.3/2",
}
CONVEX11 = ["3.3.3.3.3.3", "4.4.4.4", "6.6.6", "3.12.12", "4.8.8", "3.4.6.4",
            "3.6.3.6", "3.3.4.3.4", "3.3.3.4.4", "3.3.3.3.6", "4.6.12"]
NEG4 = ["3.3.4.12", "3.3.6.6", "3.4.3.12", "3.4.4.6"]   # close to 360, tile nothing


def add_face(P, v, e, n, d, edge_cap):
    key = face_key(v, e, n, d)
    if key in P.faces: return True
    cs = face_corners(v, e, n, d); a = cangle(n, d)
    for i, (p, dr) in enumerate(cs):
        q = cs[(i + 1) % n][0]; ek = frozenset((p, q))
        s = P.edges.get(ek)
        if s is None: s = set(); P.edges[ek] = s
        if key not in s:
            if len(s) >= edge_cap: return False
            s.add(key); P.trail.append((1, ek, key))
    P.faces[key] = (n, d, cs); P.trail.append((0, key))
    for (p, dr) in cs:
        P.vfac.setdefault(p, []).append((a, dr, (n, d), key))
        P.trail.append((2, p))
    return True


def grow(cfg, S1=False, S2=False, S3=False, nodes_cap=60000, radius=3.0):
    """Bounded DFS. Returns (status, faces, nodes). status in {complete, dead, cap}."""
    m = len(cfg); edge_cap = 4 if S2 else 2
    P = Patch(); e = 0
    for (n, d) in cfg:
        if not add_face(P, ZERO, e, n, d, edge_cap): return "dead-seed", 0, 0
        e = (e + cangle(n, d)) % 24
    nodes = [0]

    def options(v):
        raw = P.vfac[v]
        dirs = [dr for (a, dr, nd, k) in raw]
        if not S1 and len(set(dirs)) != len(dirs): return []
        known = sorted(set((a, dr, nd) for (a, dr, nd, k) in raw))
        if S3 and len(known) > m: return []          # cannot host any star
        return alignments(cfg, known)

    def apply(v, corners):
        for (a, dr, (n, d)) in corners:
            if not add_face(P, v, dr, n, d, edge_cap): return False
        return len(P.vfac[v]) >= m if S3 else len(P.vfac[v]) == m

    def full(v):
        return len(P.vfac[v]) >= m if S3 else len(P.vfac[v]) == m

    def nearest_open():
        best = None
        for v in P.vfac:
            if full(v): continue
            r = zabs(v)
            if r > radius or (best is not None and r >= best[1]): continue
            best = (v, r)
        return best

    def solve():
        nodes[0] += 1
        if nodes[0] > nodes_cap: return "cap"
        mk = P.mark()
        nx = nearest_open()
        if nx is None: return "complete"
        v = nx[0]; o = options(v)
        if not o: P.rollback(mk); return "dead"
        capped = False
        for c in o:
            mk2 = P.mark()
            if apply(v, c):
                r = solve()
                if r == "complete": return "complete"
                if r == "cap": capped = True
            P.rollback(mk2)
        P.rollback(mk)
        return "cap" if capped else "dead"

    sys.setrecursionlimit(200000)
    st = solve()
    return st, len(P.faces), nodes[0]


COMBOS = [(False, False, False), (True, False, False), (False, True, False),
          (False, False, True), (True, True, False), (True, False, True),
          (False, True, True), (True, True, True)]

def label(c): return "".join(n for n, b in zip("123", c) if b) or "none"

print("relaxation ->      " + "  ".join("%-9s" % ("S" + label(c)) for c in COMBOS))
def row(tag, cfg):
    out = []
    for c in COMBOS:
        st, nf, nd = grow(cfg, *c)
        out.append("%-9s" % st)
    print("%-22s %s" % (tag, "  ".join(out)))

for tag in ("1.16", "1.19", "1.21", "1.6", "1.7", "1.13", "1.22", "1.2", "1.4"):
    row("%s %s" % (tag, GMS14[tag]), parse(GMS14[tag]))
print()
for s in CONVEX11[:5] + NEG4:
    row("%s%s" % ("NEG " if s in NEG4 else "cvx ", s), parse(s))
