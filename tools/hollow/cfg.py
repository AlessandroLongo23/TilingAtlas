"""Vertex-configuration enumerator for hollow tilings on the D=24 grid.

Corner angle of face {n/d} at a vertex, in 15-degree units:
    a(n,d) = 12(n-2d)/n  lifted into (0,24)   [reflex lift for retrograde d>n/2]
Closure: sum a_i = 24*delta.
Extra structural condition: going round the vertex the edge DIRECTIONS are the
partial sums mod 24, and every edge carries exactly 2 faces, so each direction is
visited exactly once => the partial sums must be DISTINCT mod 24.
"""
from math import gcd

def corner_types(ns):
    out = []
    for n in ns:
        for d in range(1, n):
            if gcd(n, d) != 1: continue
            num = 12 * (n - 2 * d)
            if num % n: continue
            a = num // n
            if a <= 0: a += 24
            if not (0 < a < 24): continue
            out.append((n, d, a))
    return out

def enum_configs(types, delta, maxm, minm=3):
    """Closed walks on Z/24 from 0, steps = corner angles, all visited residues
    distinct, total = 24*delta. Returns cyclic sequences up to rotation+reflection."""
    total = 24 * delta
    res, seq, seen = [], [], {0}
    def rec(cur, acc):
        if acc == total:
            if cur % 24 == 0 and len(seq) >= minm: res.append(tuple(seq))
            return
        if acc > total or len(seq) >= maxm: return
        for (n, d, a) in types:
            nxt = (cur + a) % 24
            closing = (acc + a == total)
            if closing:
                if nxt != 0: continue
            elif nxt in seen: continue
            seq.append((n, d)); 
            if not closing: seen.add(nxt)
            rec(nxt, acc + a)
            if not closing: seen.discard(nxt)
            seq.pop()
    rec(0, 0)
    # dedupe up to rotation + reflection
    reps = set()
    for w in res:
        m = len(w)
        cands = []
        for r in range(m):
            rot = w[r:] + w[:r]
            cands.append(rot); cands.append(tuple(reversed(rot)))
        reps.add(min(cands))
    return sorted(reps, key=lambda w: (len(w), w))

if __name__ == "__main__":
    import sys
    NS = [3,4,6,8,12]
    T = corner_types(NS)
    print(f"corner types ({len(T)}):", [(f"{n}/{d}", a) for n,d,a in T])
    for delta in (1,2,3):
        for maxm in (6,8,12):
            c = enum_configs(T, delta, maxm)
            conv = [w for w in c if all(d == 1 for _, d in w)]
            print(f"  delta={delta} maxm={maxm:2d}: {len(c):6d} species   ({len(conv)} all-convex)")
