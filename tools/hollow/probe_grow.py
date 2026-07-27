"""Probe: first vertex at which growth dies, and why."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hollow import Patch, ZERO, cangle, alignments, placements, zabs
from quotient import parse, GMS

def nm(nd): return str(nd[0]) if nd[1] == 1 else "%d/%d" % nd

def probe(tag):
    cfg = parse(GMS[tag]); m = len(cfg)
    print("=== %s  %s   (m=%d)" % (tag, GMS[tag], m))
    uniq, idx = placements(cfg)
    print("    %d distinct vertex-star placements" % len(uniq))
    P = Patch(); e = 0
    for (n, d) in cfg:
        assert P.add_face(ZERO, e, n, d)
        e = (e + cangle(n, d)) % 24
    dead = []
    for v, raw in sorted(P.vfac.items(), key=lambda kv: zabs(kv[0])):
        if len(raw) == m: continue
        dirs = [dr for (a, dr, nd, k) in raw]
        known = sorted(set((a, dr, nd) for (a, dr, nd, k) in raw))
        if len(set(dirs)) != len(dirs):
            dead.append((v, "DUPLICATE DIRS %s" % dirs, known)); continue
        o = alignments(cfg, known)
        if not o:
            dead.append((v, "NO ALIGNMENT", known))
    print("    %d vertices, %d dead" % (len(P.vfac), len(dead)))
    for v, why, known in dead[:4]:
        print("      r=%.3f  %s" % (zabs(v), why))
        for (a, dr, nd) in known:
            print("         corner angle=%2d dir=%2d tile=%s" % (a, dr, nm(nd)))
    return dead

for t in ("1.16", "1.19", "x2"):
    probe(t); print()
