"""Probe: why do 1.16 / 1.19 / x2 die at the seed?

Places the seed star only, and reports which edge slot overflows.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hollow import Patch, ZERO, cangle, face_corners, face_key, zadd, ZK
from quotient import parse, GMS

def seed(cfg, verbose=True):
    P = Patch(); e = 0
    for i, (n, d) in enumerate(cfg):
        key = face_key(ZERO, e, n, d)
        cs = face_corners(ZERO, e, n, d)
        segs = [frozenset((cs[j][0], cs[(j+1) % n][0])) for j in range(n)]
        dup = len(set(segs)) != len(segs)
        ok = P.add_face(ZERO, e, n, d)
        if verbose:
            print("  face %d: {%d/%d} at dir %2d  angle=%2d  self-dup-segments=%s  add=%s"
                  % (i, n, d, e, cangle(n, d), dup, ok))
            if dup:
                from collections import Counter
                c = Counter(segs)
                print("      repeated segments: %d of %d" % (sum(1 for v in c.values() if v > 1), n))
        if not ok:
            # find the offending edge
            for j in range(n):
                ek = frozenset((cs[j][0], cs[(j+1) % n][0]))
                s = P.edges.get(ek)
                if s is not None and len(s) >= 2 and key not in s:
                    print("      OVERFLOW on segment %d: already carries %s" % (j, [(a, b) for a, b, _ in s]))
                    break
            return None
        e = (e + cangle(n, d)) % 24
    return P

for tag in ("1.16", "1.19", "x2", "1.13", "1.22", "1.6"):
    cfg = parse(GMS[tag])
    print("%s  %s" % (tag, GMS[tag]))
    P = seed(cfg)
    print("   -> %s\n" % ("seed ok, %d faces %d edges" % (len(P.faces), len(P.edges)) if P else "SEED FAILED"))
