"""Nearest-first growth with a step-count bound.

Corona-depth growth is finite but does not fill a Euclidean neighbourhood: in a star
tiling Z[zeta_24] is dense, so a vertex can be at graph distance 20 and Euclidean
distance 0.4. Both the periodicity and density gates need a fully-completed disk, so
growth must proceed nearest-first.

Termination is still NOT a radius test (that was the unsound version): it is a hard
cap on the NUMBER of vertex completions, which is a legitimate finiteness bound. The
achieved safe radius is then reported, not assumed.
"""
import heapq
from hollow import Patch, ZERO, cangle, zabs, alignments


def grow_disk(cfg, max_completions=1200, time_cap=45.0, target_r=6.0):
    """Complete vertices in increasing |v| until the cap, the target radius, or a
    contradiction. Returns (ok, patch, why)."""
    import time as _t, sys
    m = len(cfg)
    P = Patch(); e = 0
    for (n, d) in cfg:
        if not P.add_face(ZERO, e, n, d): return False, None, "seed edge overflow"
        e = (e + cangle(n, d)) % 24
    t0 = _t.time(); done = [0]; timed = [False]

    def options(v):
        raw = P.vfac[v]
        dirs = [dr for (a, dr, nd, k) in raw]
        if len(set(dirs)) != len(dirs): return None
        known = sorted(set((a, dr, nd) for (a, dr, nd, k) in raw))
        return alignments(cfg, known)

    def apply(v, corners):
        for (a, dr, (n, d)) in corners:
            if not P.add_face(v, dr, n, d): return False
        return len(P.vfac[v]) == m

    def nearest_open():
        best = None
        for v, cs in P.vfac.items():
            if len(cs) == m: continue
            r = zabs(v)
            if r > target_r: continue
            if best is None or r < best[1]: best = (v, r)
        return best

    def solve():
        mk = P.mark()
        while True:
            if _t.time()-t0 > time_cap: timed[0] = True; P.rollback(mk); return False
            if done[0] >= max_completions: return True         # cap reached, keep patch
            # forced completions first, nearest-first among the rest
            progressed = True
            while progressed:
                if _t.time()-t0 > time_cap: timed[0] = True; P.rollback(mk); return False
                progressed = False
                for v in list(P.vfac.keys()):
                    if len(P.vfac[v]) == m or zabs(v) > target_r: continue
                    o = options(v)
                    if o is None or len(o) == 0: P.rollback(mk); return False
                    if len(o) == 1:
                        if not apply(v, o[0]): P.rollback(mk); return False
                        done[0] += 1; progressed = True
                        if done[0] >= max_completions: return True
            nx = nearest_open()
            if nx is None: return True
            v = nx[0]
            o = options(v)
            if o is None or len(o) == 0: P.rollback(mk); return False
            for c in o:
                mk2 = P.mark()
                if apply(v, c):
                    done[0] += 1
                    if solve(): return True
                P.rollback(mk2)
            P.rollback(mk); return False

    lim = sys.getrecursionlimit(); sys.setrecursionlimit(200000)
    try: ok = solve()
    finally: sys.setrecursionlimit(lim)
    if not ok: return False, None, ("timeout" if timed[0] else "no completion")
    return True, P, "ok"
