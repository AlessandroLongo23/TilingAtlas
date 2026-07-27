"""Hollow-tiling corona search on the D=24 grid, exact Z[zeta_24].

Face {n/d}: closed walk of n unit steps, constant turn t = 24d/n (15-deg units).
Corner angle at a vertex: a = 12(n-2d)/n lifted into (0,24)  [reflex for d>n/2].
A face occupying the CCW sector [e, e+a] at vertex v is the walk from v with
outgoing direction e and turn +t; its two edges at v are dirs e and e+a.
Vertex star: each edge carries exactly 2 faces => the m directions round a vertex
are distinct and the corners form one cycle of total angle 24*delta.
"""
import cmath, math
from math import gcd

RANK = 8                      # Z[zeta_24], zeta^8 = zeta^4 - 1
ZERO = (0,)*RANK
def zmul_zeta(v):
    c = v
    return (-c[7], c[0], c[1], c[2], c[3]+c[7], c[4], c[5], c[6])
def zadd(u, v): return tuple(a+b for a, b in zip(u, v))
def zsub(u, v): return tuple(a-b for a, b in zip(u, v))
ZK = [(1,)+(0,)*(RANK-1)]
for _ in range(23): ZK.append(zmul_zeta(ZK[-1]))
_E = [cmath.exp(1j*math.pi*k/12) for k in range(RANK)]
def zfloat(v): return sum(c*e for c, e in zip(v, _E))
def zabs(v): return abs(zfloat(v))

def turn(n, d):
    assert (24*d) % n == 0, f"{n}/{d} off the D=24 grid"
    return (24*d)//n
def cangle(n, d):
    a = (12*(n-2*d))//n
    return a+24 if a <= 0 else a

def face_corners(v, e, n, d):
    """Corners of the face occupying CCW sector [e,e+a] at v. Returns list of
    (position, outgoing_dir); position[0] == v."""
    t = turn(n, d); out = []; p = v; dr = e % 24
    for _ in range(n):
        out.append((p, dr)); p = zadd(p, ZK[dr]); dr = (dr+t) % 24
    assert p == v, "face walk did not close"
    return out

def face_key(v, e, n, d):
    cs = face_corners(v, e, n, d)
    pos = [c[0] for c in cs]
    rots = [tuple(pos[i:]+pos[:i]) for i in range(n)]
    return (n, d, min(rots))

class Patch:
    """Face/edge/vertex incidence with a mutation trail so backtracking is an undo
    rather than a deep copy (patches reach thousands of faces; cloning dominated)."""
    __slots__ = ("faces", "vfac", "edges", "trail")
    def __init__(self):
        self.faces = {}; self.vfac = {}; self.edges = {}; self.trail = []
    def mark(self): return len(self.trail)
    def rollback(self, mk):
        t = self.trail
        while len(t) > mk:
            op = t.pop()
            if op[0] == 0: del self.faces[op[1]]
            elif op[0] == 1:
                e = self.edges[op[1]]; e.discard(op[2])
                if not e: del self.edges[op[1]]
            else:
                lst = self.vfac[op[1]]; lst.pop()
                if not lst: del self.vfac[op[1]]   # else backtracked branches leave
                                                   # phantom zero-corner vertices
    def add_face(self, v, e, n, d):
        key = face_key(v, e, n, d)
        if key in self.faces: return True
        cs = face_corners(v, e, n, d); a = cangle(n, d)
        for i, (p, dr) in enumerate(cs):
            q = cs[(i+1) % n][0]; ek = frozenset((p, q))
            s = self.edges.get(ek)
            if s is None: s = set(); self.edges[ek] = s
            if key not in s:
                if len(s) >= 2: return False
                s.add(key); self.trail.append((1, ek, key))
        self.faces[key] = (n, d, cs); self.trail.append((0, key))
        for (p, dr) in cs:
            self.vfac.setdefault(p, []).append((a, dr, (n, d), key))
            self.trail.append((2, p))
        return True

_PLACE_CACHE = {}
def placements(cfg):
    """All (rotation, orientation, start-dir) vertex stars for cfg, plus an index
    corner -> set of placement ids. Built once per config; the per-vertex query is
    then an intersection of index sets instead of a rebuild."""
    got = _PLACE_CACHE.get(cfg)
    if got is not None: return got
    outs = []
    for seq in ({cfg, tuple(reversed(cfg))}):
        m = len(seq); angs = [cangle(n, d) for (n, d) in seq]
        for r in range(m):
            rs = seq[r:]+seq[:r]; ra = angs[r:]+angs[:r]
            for e0 in range(24):
                corners = []; e = e0
                for j in range(m):
                    corners.append((ra[j], e, rs[j])); e = (e+ra[j]) % 24
                outs.append(corners)
    seen, uniq = set(), []
    for c in outs:
        k = tuple(sorted(c))
        if k not in seen: seen.add(k); uniq.append(c)
    idx = {}
    for i, c in enumerate(uniq):
        for corner in c: idx.setdefault(corner, set()).add(i)
    got = (uniq, idx); _PLACE_CACHE[cfg] = got
    return got

def alignments(cfg, known):
    uniq, idx = placements(cfg)
    if not known: return list(uniq)
    s = idx.get(known[0])
    if not s: return []
    s = set(s)
    for k in known[1:]:
        s &= idx.get(k, ())
        if not s: return []
    return [uniq[i] for i in s]

def _bfs_depths(P):
    from collections import deque
    adj = {}
    for ek in P.edges:
        if not P.edges[ek]: continue
        t = tuple(ek)
        if len(t) != 2: continue
        a, b = t
        adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
    dep = {ZERO: 0}; q = deque([ZERO])
    while q:
        v = q.popleft()
        for u in adj.get(v, ()):
            if u not in dep: dep[u] = dep[v]+1; q.append(u)
    return dep

def grow(cfg, coronas=3, branch_cap=400000, time_cap=25.0):
    """Grow a uniform tiling with vertex config cfg.

    Termination is by CORONA DEPTH (graph distance from the seed), not Euclidean
    radius: Z[zeta_24] is dense in C, so a disk contains no a-priori bounded number
    of lattice points and a radius cutoff is not a finiteness argument.
    Depths are recomputed once per wave, not per propagation round.
    """
    import time as _t, sys
    m = len(cfg)
    P = Patch(); e = 0
    for (n, d) in cfg:
        if not P.add_face(ZERO, e, n, d): return False, None, "seed edge overflow"
        e = (e + cangle(n, d)) % 24
    budget = [branch_cap]; t0 = _t.time(); timed = [False]

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
    def out_of_time():
        return budget[0] <= 0 or _t.time()-t0 > time_cap

    def solve():
        mk = P.mark()
        while True:
            if out_of_time(): timed[0] = True; P.rollback(mk); return False
            dep = _bfs_depths(P)
            targets = [v for v, dv in dep.items()
                       if dv < coronas and v in P.vfac and len(P.vfac[v]) != m]
            if not targets: return True
            # propagate forced completions over this wave
            progressed = True
            while progressed:
                if out_of_time(): timed[0] = True; P.rollback(mk); return False
                progressed = False
                for v in targets:
                    if len(P.vfac[v]) == m: continue
                    o = options(v)
                    if o is None or len(o) == 0: P.rollback(mk); return False
                    if len(o) == 1:
                        if not apply(v, o[0]): P.rollback(mk); return False
                        progressed = True
            # anything left in this wave is a genuine branch point
            best = None
            for v in targets:
                if len(P.vfac[v]) == m: continue
                o = options(v)
                if o is None or len(o) == 0: P.rollback(mk); return False
                if best is None or len(o) < len(best[1]): best = (v, o)
            if best is None: continue          # wave done, recompute depths
            v, opts = best
            for o in opts:
                budget[0] -= 1
                if out_of_time(): timed[0] = True; P.rollback(mk); return False
                mk2 = P.mark()
                if apply(v, o) and solve(): return True
                P.rollback(mk2)
            P.rollback(mk); return False

    lim = sys.getrecursionlimit(); sys.setrecursionlimit(200000)
    try: ok = solve()
    finally: sys.setrecursionlimit(lim)
    if not ok: return False, None, ("timeout" if timed[0] else "no completion")
    return True, P, "ok"
