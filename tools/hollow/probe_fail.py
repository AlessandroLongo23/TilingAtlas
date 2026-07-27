"""Probe: classify every failure inside a bounded DFS.

Counts, over the whole (small) search tree: how often a placement is rejected by
edge overflow (a segment already carrying 2 faces) vs by corner-count mismatch vs
by a dead vertex. That separates "the tiling really does not exist" from "the edge
model cannot represent it".
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hollow
from hollow import Patch, ZERO, cangle, alignments, zabs, face_corners, face_key
from quotient import parse, GMS

STAT = {}

def bump(k): STAT[k] = STAT.get(k, 0) + 1

def add_face_traced(P, v, e, n, d):
    key = face_key(v, e, n, d)
    if key in P.faces: bump("already"); return True
    cs = face_corners(v, e, n, d)
    for i, (p, dr) in enumerate(cs):
        q = cs[(i+1) % n][0]; ek = frozenset((p, q))
        s = P.edges.get(ek)
        if s is not None and key not in s and len(s) >= 2:
            bump("edge_overflow")
            return False
    bump("placed")
    return P.add_face(v, e, n, d)


def run(tag, max_nodes=40000):
    STAT.clear()
    cfg = parse(GMS[tag]); m = len(cfg)
    P = Patch(); e = 0
    for (n, d) in cfg:
        assert P.add_face(ZERO, e, n, d)
        e = (e + cangle(n, d)) % 24
    nodes = [0]

    def options(v):
        raw = P.vfac[v]
        dirs = [dr for (a, dr, nd, k) in raw]
        if len(set(dirs)) != len(dirs): bump("dup_dirs"); return None
        known = sorted(set((a, dr, nd) for (a, dr, nd, k) in raw))
        o = alignments(cfg, known)
        if not o: bump("no_alignment")
        return o

    def apply(v, corners):
        for (a, dr, (n, d)) in corners:
            if not add_face_traced(P, v, dr, n, d): return False
        if len(P.vfac[v]) != m: bump("corner_count"); return False
        return True

    def nearest_open():
        best = None
        for v, cs in P.vfac.items():
            if len(cs) == m: continue
            r = zabs(v)
            if r > 6.0: continue
            if best is None or r < best[1]: best = (v, r)
        return best

    def solve(depth):
        nodes[0] += 1
        if nodes[0] > max_nodes: return False
        mk = P.mark()
        nx = nearest_open()
        if nx is None: bump("COMPLETE"); return True
        v = nx[0]
        o = options(v)
        if not o: P.rollback(mk); return False
        for c in o:
            mk2 = P.mark()
            if apply(v, c) and solve(depth+1): return True
            P.rollback(mk2)
        P.rollback(mk); return False

    sys.setrecursionlimit(100000)
    ok = solve(0)
    print("%-5s %-24s ok=%-5s nodes=%d  %s" % (tag, GMS[tag], ok, nodes[0],
          dict(sorted(STAT.items(), key=lambda kv: -kv[1]))))

for t in ("1.16", "1.19", "x2", "1.6"):
    run(t)
