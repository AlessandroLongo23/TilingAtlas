"""Hollow-tiling engine, second cut. Exact Z[zeta_24].

What changed from the first cut, and why:

1. MULTIPLICITY kappa. A vertex carries kappa circuits of the vertex figure, not
   one. kappa=1 is the ordinary case. kappa=2 is the case Coxeter's "(p/2 q/2)|"
   marks: the face set is closed under orientation reversal, so every polygon
   appears both ways, every 1-cell of the map is doubled, and every geometric
   segment carries 2*kappa face-sides.

   This is forced, not chosen. GMS 1.16 (4.12.4/3.12/11) lives on the 3.4.6.4 edge
   graph, where every vertex lies on two squares and two dodecagons. At kappa=1 it
   would need one prograde and one retrograde square per vertex -- a 2-colouring of
   the squares. The three squares around each triangle pairwise share a vertex, so
   that conflict graph contains a triangle and is not bipartite: kappa=1 is
   PROVABLY impossible there. At kappa=2 the star is exactly c + rev(c) and the
   obstruction vanishes. kappa is searched over, never supplied.

2. NO ACCEPT-ON-CAP. The old grow_disk returned its patch when the completion
   counter ran out, so the verdict depended on the budget (1.22 came out clean at
   cap 8000 and degenerate at 9000). Budgets now only ever produce UNKNOWN. A
   config is ACCEPTED only on a torus certificate and REJECTED only on a
   contradiction; both are budget-independent.

3. EXACT DENSITY. Once a torus certificate exists the density is a ratio of exact
   areas over the fundamental domain, so the sampled density gate -- with its
   coverage margin, sample count and RNG seed -- is gone, and so is the minimum
   vertex separation gate (a torus tiling has finitely many vertices per period,
   hence is discrete by construction).

Every constant here comes from the geometry: 24 directions on the D=24 grid, the
corner angle 12(n-2d)/n reflex-lifted, closure at 24*delta, 2*kappa faces per
segment. There are no fitted thresholds.
"""
import cmath, math, sys
from math import gcd

RANK = 8                      # Z[zeta_24], zeta^8 = zeta^4 - 1
ZERO = (0,) * RANK

def zmul_zeta(v):
    c = v
    return (-c[7], c[0], c[1], c[2], c[3] + c[7], c[4], c[5], c[6])
def zadd(u, v): return tuple(a + b for a, b in zip(u, v))
def zsub(u, v): return tuple(a - b for a, b in zip(u, v))
def zscale(v, k): return tuple(a * k for a in v)

ZK = [(1,) + (0,) * (RANK - 1)]
for _ in range(23): ZK.append(zmul_zeta(ZK[-1]))
_E = [cmath.exp(1j * math.pi * k / 12) for k in range(RANK)]
def zfloat(v): return sum(c * e for c, e in zip(v, _E))
def zabs(v): return abs(zfloat(v))

# ---------------------------------------------------------------- tiles

def turn(n, d):
    assert (24 * d) % n == 0, "{%d/%d} is off the D=24 grid" % (n, d)
    return (24 * d) // n

def cangle(n, d):
    """Corner angle in 15-degree units, reflex-lifted for retrograde tiles."""
    a = (12 * (n - 2 * d)) // n
    return a + 24 if a <= 0 else a

def reverse_tile(n, d): return (n, n - d)

def signed_area(n, d):
    """Signed area of a unit-edge {n/d}; negative for retrograde traversals."""
    return n / 4.0 * (math.cos(math.pi * d / n) / math.sin(math.pi * d / n))

def face_corners(v, e, n, d):
    t = turn(n, d); out = []; p = v; dr = e % 24
    for _ in range(n):
        out.append((p, dr)); p = zadd(p, ZK[dr]); dr = (dr + t) % 24
    assert p == v, "face walk did not close"
    return out

def face_key(v, e, n, d):
    cs = face_corners(v, e, n, d)
    pos = [c[0] for c in cs]
    return (n, d, min(tuple(pos[i:] + pos[:i]) for i in range(n)))

def reverse_corner(a, dr, nd):
    """The same polygon traversed the other way: the corner on the far side."""
    n, d = nd
    return (24 - a, (dr + a) % 24, reverse_tile(n, d))

# ---------------------------------------------------------------- patch

class Patch:
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
                s = self.edges[op[1]]; s.discard(op[2])
                if not s: del self.edges[op[1]]
            else:
                lst = self.vfac[op[1]]; lst.pop()
                if not lst: del self.vfac[op[1]]
    def add_face(self, v, e, n, d, edge_cap):
        key = face_key(v, e, n, d)
        if key in self.faces: return True
        cs = face_corners(v, e, n, d); a = cangle(n, d)
        for i, (p, dr) in enumerate(cs):
            q = cs[(i + 1) % n][0]; ek = frozenset((p, q))
            s = self.edges.get(ek)
            if s is None: s = set(); self.edges[ek] = s
            if key not in s:
                if len(s) >= edge_cap: return False
                s.add(key); self.trail.append((1, ek, key))
        self.faces[key] = (n, d, cs); self.trail.append((0, key))
        for (p, dr) in cs:
            self.vfac.setdefault(p, []).append((a, dr, (n, d), key))
            self.trail.append((2, p))
        return True

# ---------------------------------------------------------------- stars

_PLACE = {}
def placements(cfg, kappa):
    """Every vertex star of cfg at multiplicity kappa, as a frozenset of corners,
    plus an index corner -> placement ids.

    Rotations of cfg AND of its reversal. Reflecting the plane reverses the cyclic
    order but leaves each tile alone: a face occupies its interior sector whichever
    way you walk it, so {n/d} stays {n/d} and the corner angle is preserved. That
    is why a.b.c and c.b.a name one vertex type. (The operation that does send
    {n/d} to {n/(n-d)} is swapping which side of the boundary the face occupies --
    reverse_corner below -- and that changes the total from 24*delta to
    24*(m-delta). The two are easy to confuse and they are not the same map.)

    kappa=2 unions each circuit with its own reverse: the same polygons traversed
    both ways, which is what makes every 1-cell of the map doubled.
    """
    got = _PLACE.get((cfg, kappa))
    if got is not None: return got
    m = len(cfg)
    outs = []
    for seq in {cfg, tuple(reversed(cfg))}:
        angs = [cangle(n, d) for (n, d) in seq]
        for r in range(m):
            rs = seq[r:] + seq[:r]; ra = angs[r:] + angs[:r]
            for e0 in range(24):
                cs = []; e = e0
                for j in range(m):
                    cs.append((ra[j], e, rs[j])); e = (e + ra[j]) % 24
                if kappa == 2:
                    cs = cs + [reverse_corner(*c) for c in cs]
                outs.append(frozenset(cs))
    uniq = []
    seen = set()
    for c in outs:
        if len(c) != kappa * m: continue     # a circuit that self-collides
        if c in seen: continue
        seen.add(c); uniq.append(c)
    idx = {}
    for i, c in enumerate(uniq):
        for corner in c: idx.setdefault(corner, set()).add(i)
    got = (uniq, idx); _PLACE[(cfg, kappa)] = got
    return got

def alignments(cfg, kappa, known):
    uniq, idx = placements(cfg, kappa)
    if not known: return list(range(len(uniq))), uniq
    s = idx.get(known[0])
    if not s: return [], uniq
    s = set(s)
    for k in known[1:]:
        s &= idx.get(k, ())
        if not s: return [], uniq
    return sorted(s), uniq

# ---------------------------------------------------------------- growth

_OK = {}
def _order_key(v):
    """Total order on vertices: nearest first, ties broken exactly on coefficients.
    Z[zeta_24] is dense in C, so |v| alone is not a well-order in practice; the
    coefficient tuple makes the traversal reproducible run to run."""
    k = _OK.get(v)
    if k is None: k = (zabs(v), v); _OK[v] = k
    return k

def grow(cfg, kappa, node_cap=200000, radius=None):
    """DFS to a periodic certificate.

    Returns (verdict, patch, lattice) with verdict in {"tiling","none","unknown"}.
    "none" means every branch reached a contradiction -- a real rejection.
    "unknown" means the node budget ran out somewhere; never a rejection.
    """
    m = len(cfg); need = kappa * m; edge_cap = 2 * kappa
    uniq, _ = placements(cfg, kappa)
    if not uniq: return "none", None, None
    P = Patch()
    # seed: any placement will do up to a global rotation, but with a mirror
    # present the two chiralities are genuinely different starts, so try each
    # distinct star shape once.
    nodes = [0]; hit_cap = [False]

    def options(v):
        raw = P.vfac[v]
        known = sorted(set((a, dr, nd) for (a, dr, nd, k) in raw))
        if len(known) > need: return []
        ids, _u = alignments(cfg, kappa, known)
        return ids

    def apply(v, ci):
        for (a, dr, (n, d)) in sorted(uniq[ci]):
            if not P.add_face(v, dr, n, d, edge_cap): return False
        return len(P.vfac[v]) == need

    def frontier():
        best = None
        for v in P.vfac:
            if len(P.vfac[v]) == need: continue
            k = _order_key(v)
            if radius is not None and k[0] > radius: continue
            if best is None or k < best[0]: best = (k, v)
        return None if best is None else best[1]

    # certify costs O(patch) per candidate pair, so back off geometrically: a
    # missed certificate only means the search grows further and tries again.
    nxt = [4]

    def scan():
        """Nearest-first over incomplete vertices. Returns ("dead",) on a vertex
        with no legal star, ("forced", v, ci) on one with exactly one, else
        ("branch", v, options) on the nearest ambiguous vertex.

        Completing the forced vertices before branching is what makes this
        tractable -- it is a search ORDER, so it changes running time only, never
        which configurations are accepted or rejected."""
        open_vs = [v for v in P.vfac if len(P.vfac[v]) != need]
        if radius is not None:
            open_vs = [v for v in open_vs if _order_key(v)[0] <= radius]
        if not open_vs: return ("empty",)
        open_vs.sort(key=_order_key)
        best = None
        for v in open_vs:
            o = options(v)
            if not o: return ("dead",)
            if len(o) == 1: return ("forced", v, o[0])
            if best is None: best = (v, o)
        return ("branch",) + best

    def solve(depth):
        nodes[0] += 1
        if nodes[0] > node_cap: hit_cap[0] = True; return "unknown"
        mk = P.mark()
        while True:
            ndone = sum(1 for v in P.vfac if len(P.vfac[v]) == need)
            if ndone >= nxt[0]:
                nxt[0] = ndone + max(2, ndone // 2)
                cert = certify(P, need, edge_cap)
                if cert is not None: return cert
            st = scan()
            if st[0] == "dead": P.rollback(mk); return "none"
            if st[0] == "empty": P.rollback(mk); return "unknown"
            if st[0] == "branch": break
            nodes[0] += 1
            if nodes[0] > node_cap: hit_cap[0] = True; P.rollback(mk); return "unknown"
            if not apply(st[1], st[2]): P.rollback(mk); return "none"
        v, o = st[1], st[2]
        saw_unknown = False
        for ci in o:
            mk2 = P.mark()
            if apply(v, ci):
                r = solve(depth + 1)
                if isinstance(r, tuple): return r
                if r == "unknown": saw_unknown = True
            P.rollback(mk2)
        P.rollback(mk)
        return "unknown" if saw_unknown else "none"

    lim = sys.getrecursionlimit(); sys.setrecursionlimit(300000)
    try:
        saw_unknown = False
        for ci in seed_ids(cfg, kappa):
            mk = P.mark()
            if apply(ZERO, ci):
                r = solve(0)
                if isinstance(r, tuple): return "tiling", P, r
                if r == "unknown": saw_unknown = True
            P.rollback(mk)
    finally:
        sys.setrecursionlimit(lim)
    return ("unknown" if (saw_unknown or hit_cap[0]) else "none"), None, None

def _shape(c):
    """A star up to rotation of the whole plane. Rotating by zeta_24^s carries a
    tiling to a tiling, so seeding one representative per shape is WLOG."""
    return min(tuple(sorted((a, (dr + s) % 24, nd) for (a, dr, nd) in c))
               for s in range(24))

_SEEDS = {}
def seed_ids(cfg, kappa):
    got = _SEEDS.get((cfg, kappa))
    if got is None:
        uniq, _ = placements(cfg, kappa)
        seen = set(); got = []
        for i, c in enumerate(uniq):
            s = _shape(c)
            if s in seen: continue
            seen.add(s); got.append(i)
        _SEEDS[(cfg, kappa)] = got
    return got

# ---------------------------------------------------------------- certificate

def star(P, v):
    return frozenset((a, dr, nd) for (a, dr, nd, k) in P.vfac.get(v, ()))

def certify(P, need, edge_cap):
    """A torus certificate, or None.

    Two independent translations whose lattice L makes the quotient a COMPLETE
    tiling of the torus: every vertex class carries a full star, every face's
    corners are vertex classes, every edge class carries exactly edge_cap faces.
    A complete torus tiling lifts to a periodic plane tiling, so this is a proof
    that the patch extends, not evidence that it might.
    """
    done = [v for v in P.vfac if len(P.vfac[v]) == need]
    if len(done) < 3: return None
    s0 = star(P, ZERO)
    if len(s0) != need: return None
    cands = [v for v in done if v != ZERO and star(P, v) == s0]
    if len(cands) < 2: return None
    cands.sort(key=_order_key)
    cands = cands[:10]                     # the period lattice, if any, is short
    for i in range(len(cands)):
        for j in range(i + 1, len(cands)):
            t1, t2 = cands[i], cands[j]
            z1, z2 = zfloat(t1), zfloat(t2)
            if abs(z1.real * z2.imag - z1.imag * z2.real) < 1e-9: continue
            if _closes(P, need, edge_cap, t1, t2) is not None: return (t1, t2)
    return None

def in_lattice(x, t1, t2):
    """Is x an integer combination of t1 and t2? EXACT.

    The float embedding gives the coefficients; if x really is in the lattice they
    are integers, so rounding recovers them, and the subtraction then confirms it
    in Z[zeta_24]. A false positive is impossible because the check is exact, and
    a false negative would need the float coefficients to be a half-unit out.
    Deciding this with a floor into a fundamental domain does NOT work: vertices
    sit exactly on lattice lines, where floor is at the mercy of the last bit."""
    a, b, z = zfloat(t1), zfloat(t2), zfloat(x)
    det = a.real * b.imag - a.imag * b.real
    if abs(det) < 1e-12: return False
    u = round((z.real * b.imag - z.imag * b.real) / det)
    w = round((a.real * z.imag - a.imag * z.real) / det)
    return zsub(x, zadd(zscale(t1, u), zscale(t2, w))) == ZERO

class Classes:
    """Exact vertex classes modulo the lattice, assigned in first-seen order.

    The quotient of Z[zeta_24] by a rank-2 lattice is not finite, so there is no
    canonical fundamental domain to reduce into; classes are found by comparison.
    The float coordinates screen candidates and only near-integer ones pay for the
    exact check."""
    __slots__ = ("t1", "t2", "reps", "of", "zr", "det", "za", "zb", "limit")
    def __init__(self, t1, t2, limit=None):
        self.t1 = t1; self.t2 = t2; self.reps = []; self.of = {}; self.zr = []
        self.za = zfloat(t1); self.zb = zfloat(t2)
        self.det = self.za.real * self.zb.imag - self.za.imag * self.zb.real
        self.limit = limit
    def __call__(self, v):
        got = self.of.get(v)
        if got is not None: return got
        z = zfloat(v); a, b, det = self.za, self.zb, self.det
        for i, zr in enumerate(self.zr):
            dz = z - zr
            u = (dz.real * b.imag - dz.imag * b.real) / det
            w = (a.real * dz.imag - a.imag * dz.real) / det
            if abs(u - round(u)) > 1e-6 or abs(w - round(w)) > 1e-6: continue
            if zsub(zsub(zsub(v, self.reps[i]), zscale(self.t1, round(u))),
                    zscale(self.t2, round(w))) == ZERO:
                self.of[v] = i; return i
        self.reps.append(v); self.zr.append(z); self.of[v] = len(self.reps) - 1
        if self.limit is not None and len(self.reps) > self.limit: raise _TooMany()
        return len(self.reps) - 1

class _TooMany(Exception):
    """The candidate lattice folds the patch too little to certify anything. Only
    ever downgrades a verdict to unknown; it can never reject or wrongly accept."""

def _closes(P, need, edge_cap, t1, t2):
    """Does the patch, read modulo L = <t1,t2>, form a complete torus tiling?

    Complete means: every vertex class carries one full star, every edge class
    exactly 2*kappa faces, and every corner of every class is realised by a face
    we actually hold. A complete tiling of the torus lifts to a periodic tiling of
    the plane, so this is a proof the patch extends -- not evidence that it might.
    """
    done = [v for v in P.vfac if len(P.vfac[v]) == need]
    cls = Classes(t1, t2, limit=max(4, len(done) // 3))
    try:
        vclass = {}
        for v in done:
            r = cls(v); st = star(P, v)
            if vclass.setdefault(r, st) != st: return None
        if len(vclass) < 1: return None

        eclass = {}; vcorner = {}
        for key, (n, d, cs) in P.faces.items():
            if any(len(P.vfac.get(p, ())) != need for (p, dr) in cs): continue
            rk = _face_class(n, d, cs, cls)
            for i, (p, dr) in enumerate(cs):
                rp = cls(p)
                vcorner.setdefault(rp, set()).add((rk, dr))
                q = cs[(i + 1) % n][0]
                # an edge class is a class-plus-direction taken from whichever end
                # gives the smaller key; a bare pair of endpoint classes merges
                # edges that are distinct on the torus
                ek = min((rp, dr), (cls(q), (dr + 12) % 24))
                eclass.setdefault(ek, set()).add(rk)
    except _TooMany:
        return None
    if not eclass: return None
    if any(len(fs) != edge_cap for fs in eclass.values()): return None
    for r in vclass:
        if len(vcorner.get(r, ())) != need: return None
    return cls

def _face_class(n, d, cs, cls):
    """Identity of a face modulo the lattice: the class of its canonical corner,
    with that corner's direction.

    The canonical corner is the one with the smallest direction -- the n corners
    of an {n/d} have n distinct directions, and a translate has the same ones, so
    the choice survives translation. Picking the corner nearest the origin does
    NOT: the nearest corner moves to a different index under translation, which
    splits each class into as many keys as it has corners.

    Using the reduced vertex SET instead merges faces that are distinct on the
    torus but share a vertex set -- the two triangles of 3.6.3.6, for one."""
    i0 = min(range(len(cs)), key=lambda i: cs[i][1])
    p, dr = cs[i0]
    return (n, d, cls(p), dr)

def density(P, lattice, need):
    """Exact areal density: signed face area per fundamental domain, over the area
    of that domain. A uniform tiling's density is an integer.

    Only faces all of whose corners are completed vertices count -- a face hanging
    off the boundary is not yet known to belong to the tiling."""
    t1, t2 = lattice
    cls = Classes(t1, t2)
    faces = {}
    for key, (n, d, cs) in P.faces.items():
        if any(len(P.vfac.get(p, ())) != need for (p, dr) in cs): continue
        faces[_face_class(n, d, cs, cls)] = (n, d)
    tot = sum(signed_area(n, d) for (n, d) in faces.values())
    z1, z2 = zfloat(t1), zfloat(t2)
    area = abs(z1.real * z2.imag - z1.imag * z2.real)
    return tot / area, len(faces)
