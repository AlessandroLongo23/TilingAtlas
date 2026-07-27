"""Dump the exact vertex whose partial star acquires two corners on one direction."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hollow import Patch, ZERO, cangle, alignments, zabs, zfloat
from quotient import parse, GMS

def nm(nd): return str(nd[0]) if nd[1] == 1 else "%d/%d" % nd

def run(tag):
    cfg = parse(GMS[tag]); m = len(cfg)
    print("=== %s  %s" % (tag, GMS[tag]))
    P = Patch(); e = 0
    for (n, d) in cfg:
        assert P.add_face(ZERO, e, n, d); e = (e + cangle(n, d)) % 24
    print("    seed star dirs:", sorted(dr for (a, dr, nd, k) in P.vfac[ZERO]))

    def options(v):
        raw = P.vfac[v]
        dirs = [dr for (a, dr, nd, k) in raw]
        if len(set(dirs)) != len(dirs): return "DUP", raw
        known = sorted(set((a, dr, nd) for (a, dr, nd, k) in raw))
        return alignments(cfg, known), raw

    def nearest_open():
        best = None
        for v, cs in P.vfac.items():
            if len(cs) == m: continue
            r = zabs(v)
            if r > 6.0 or (best is not None and r >= best[1]): continue
            best = (v, r)
        return best

    for step in range(30):
        nx = nearest_open()
        if nx is None: print("    complete"); return
        v = nx[0]; o, raw = options(v)
        if o == "DUP":
            z = zfloat(v)
            print("    step %d: DUP at v=(%.3f,%.3f) r=%.3f with %d corners:" % (step, z.real, z.imag, nx[1], len(raw)))
            for (a, dr, nd, k) in sorted(raw, key=lambda t: (t[1], t[0])):
                print("        angle=%2d dir=%2d tile=%-6s from face %s" % (a, dr, nm(nd), (k[0], k[1])))
            return
        if not o: print("    step %d: no alignment at r=%.3f" % (step, nx[1])); return
        for (a, dr, (n, d)) in o[0]:
            P.add_face(v, dr, n, d)

for t in ("1.16", "1.19", "x2"):
    run(t); print()
