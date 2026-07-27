"""Print the whole (tiny) DFS tree for a config, with the reason each branch dies."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hollow import Patch, ZERO, cangle, alignments, zabs, zfloat, face_key
from quotient import parse, GMS

def nm(nd): return str(nd[0]) if nd[1] == 1 else "%d/%d" % nd
def pt(v):
    z = zfloat(v); return "(%.2f,%.2f)" % (z.real, z.imag)

def run(tag, maxnodes=200):
    cfg = parse(GMS[tag]); m = len(cfg)
    print("=== %s  %s  m=%d" % (tag, GMS[tag], m))
    P = Patch(); e = 0
    for (n, d) in cfg:
        assert P.add_face(ZERO, e, n, d); e = (e + cangle(n, d)) % 24
    nodes = [0]

    def options(v):
        raw = P.vfac[v]
        dirs = [dr for (a, dr, nd, k) in raw]
        if len(set(dirs)) != len(dirs): return None, "dup-dirs %s" % sorted(dirs)
        known = sorted(set((a, dr, nd) for (a, dr, nd, k) in raw))
        o = alignments(cfg, known)
        return o, ("no-alignment for %s" % [(a, dr, nm(nd)) for a, dr, nd in known] if not o else "")

    def apply(v, corners):
        for (a, dr, (n, d)) in corners:
            if not P.add_face(v, dr, n, d): return "edge-overflow on {%s} dir %d" % (nm((n, d)), dr)
        if len(P.vfac[v]) != m:
            return "corner-count %d != %d (faces merged)" % (len(P.vfac[v]), m)
        return None

    def nearest_open():
        best = None
        for v, cs in P.vfac.items():
            if len(cs) == m: continue
            r = zabs(v)
            if r > 6.0 or (best is not None and r >= best[1]): continue
            best = (v, r)
        return best

    def solve(depth):
        nodes[0] += 1
        if nodes[0] > maxnodes: print("  " * depth + "NODE CAP"); return False
        mk = P.mark()
        nx = nearest_open()
        if nx is None: print("  " * depth + "COMPLETE"); return True
        v = nx[0]
        o, why = options(v)
        if not o:
            print("  " * depth + "x %s r=%.3f  %s" % (pt(v), nx[1], why)); P.rollback(mk); return False
        print("  " * depth + "? %s r=%.3f  %d options" % (pt(v), nx[1], len(o)))
        for i, c in enumerate(o):
            mk2 = P.mark()
            bad = apply(v, c)
            if bad: print("  " * depth + "  opt%d: %s" % (i, bad))
            elif solve(depth + 1): return True
            P.rollback(mk2)
        P.rollback(mk); return False

    sys.setrecursionlimit(100000)
    solve(0)
    print("  nodes=%d\n" % nodes[0])

for t in (sys.argv[1:] or ["1.16", "x2"]):
    run(t)
