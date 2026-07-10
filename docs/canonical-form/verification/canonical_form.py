#!/usr/bin/env python3
"""Canonical form N for Soto-Sanchez symbols of periodic unit-edge tilings
with vertices in Z[w], w = zeta_12.  Pure integer arithmetic throughout.

Symbol: list of (2+n) rows, each a 4-tuple of ints over basis {1, w, w^2, w^3},
rows 0..1 = lattice basis t1, t2; rows 2.. = seed representatives.

Stages:
  A. lattice maximization  (Lambda -> Lambda_max of the vertex set V)
  B. stars (occupied edge directions per seed class)
  C. orientation: G_min = argmin over D12 of the sorted star-word list
  D. anchors: seeds achieving the minimal transformed star word
  E. lex-min candidate matrix over G_min x anchors
"""
import random

# ---------- ring arithmetic:  w^4 = w^2 - 1 ----------
def add(u, v): return tuple(a + b for a, b in zip(u, v))
def sub(u, v): return tuple(a - b for a, b in zip(u, v))
def scale(u, c): return tuple(c * a for a in u)

def mulw(v):
    a0, a1, a2, a3 = v
    return (-a3, a0, a1 + a3, a2)

def conj(v):
    a0, a1, a2, a3 = v
    return (a0 + a2, a1, -a2, -a1 - a3)

W = []
_w = (1, 0, 0, 0)
for _ in range(12):
    W.append(_w); _w = mulw(_w)
assert mulw(W[11]) == W[0]
assert W[6] == (-1, 0, 0, 0)
for k in range(12):
    assert conj(W[k]) == W[(-k) % 12]

# ---------- group D12: ('r', j): z -> w^j z ; ('f', j): z -> w^j conj(z) ----------
G24 = [('r', j) for j in range(12)] + [('f', j) for j in range(12)]

def apply_g(g, v):
    kind, j = g
    if kind == 'f':
        v = conj(v)
    for _ in range(j):
        v = mulw(v)
    return v

def sigma(g, k):
    kind, j = g
    return (j + k) % 12 if kind == 'r' else (j - k) % 12

# convention self-check: g(v + w^k) = g(v) + w^{sigma(g,k)}
_rng0 = random.Random(1)
for _ in range(200):
    v = tuple(_rng0.randint(-5, 5) for _ in range(4))
    g = _rng0.choice(G24); k = _rng0.randint(0, 11)
    assert apply_g(g, add(v, W[k])) == add(apply_g(g, v), W[sigma(g, k)])

# ---------- HNF (row-style upper echelon) of an integer row lattice in Z^4 ----------
def hnf(rows):
    mat = [list(r) for r in rows]
    basis = []
    for col in range(4):
        while True:
            nz = [r for r in mat if r[col] != 0]
            if len(nz) <= 1:
                break
            nz.sort(key=lambda r: abs(r[col]))
            p = nz[0]
            for r in nz[1:]:
                q = r[col] // p[col]
                for i in range(4):
                    r[i] -= q * p[i]
        piv = next((r for r in mat if r[col] != 0), None)
        if piv is None:
            continue
        mat.remove(piv)
        if piv[col] < 0:
            piv = [-x for x in piv]
        for b in basis:                     # reduce entries above the pivot
            q = b[col] // piv[col]
            for i in range(4):
                b[i] -= q * piv[i]
        basis.append(piv)
    assert all(all(x == 0 for x in r) for r in mat)
    return [tuple(b) for b in basis]

def rep(v, basis):
    """Unique coset representative of v mod the row lattice of `basis` (HNF)."""
    v = list(v)
    for b in basis:
        c = next(i for i in range(4) if b[i] != 0)
        q = v[c] // b[c]
        if q:
            for i in range(4):
                v[i] -= q * b[i]
    return tuple(v)

# ---------- Stage A: maximal translation lattice of V ----------
def maximize(H, S):
    S = sorted(set(rep(s, H) for s in S))
    Sset = set(S)
    s0 = S[0]
    ts = []
    for s in S:
        t = sub(s, s0)
        if all(rep(add(x, t), H) in Sset for x in S):
            ts.append(rep(t, H))
    H2 = hnf(list(H) + ts)
    assert len(H2) == 2, "translation candidates raised the rank - invalid symbol"
    S2 = sorted(set(rep(s, H2) for s in S))
    assert len(S) % len(S2) == 0
    return H2, S2

# ---------- Stage B: stars ----------
def stars(H, S):
    Sset = set(S)
    return {s: frozenset(k for k in range(12)
                         if rep(add(s, W[k]), H) in Sset) for s in S}

def word(ks):
    return sum(1 << (11 - k) for k in ks)

# ---------- Stages C-E ----------
def canonical(M, do_maximize=True, stats=None):
    rows = [tuple(r) for r in M]
    H = hnf(rows[:2]); assert len(H) == 2
    S = sorted(set(rep(s, H) for s in rows[2:]))
    if do_maximize:
        H, S = maximize(H, S)
    st = stars(H, S)

    lists = {g: sorted(word(frozenset(sigma(g, k) for k in st[s])) for s in S)
             for g in G24}
    bestL = min(lists.values())
    Gmin = [g for g in G24 if lists[g] == bestL]
    minw = bestL[0]

    best, cands = None, set()
    n_anchor = 0
    for g in Gmin:
        Hg = hnf([apply_g(g, H[0]), apply_g(g, H[1])])
        anchors = [s for s in S
                   if word(frozenset(sigma(g, k) for k in st[s])) == minw]
        # all g in G_min share L_g, hence the same anchor count; max() guards
        # the stat against that reasoning ever being violated silently
        n_anchor = max(n_anchor, len(anchors))
        for o in anchors:
            srows = sorted(rep(apply_g(g, sub(s, o)), Hg) for s in S)
            cand = tuple(Hg) + tuple(srows)
            cands.add(cand)
            if best is None or cand < best:
                best = cand
    if stats is not None:
        stats.update(n=len(S), Gmin=len(Gmin), anchors=n_anchor,
                     distinct=len(cands),
                     starsizes=sorted(len(v) for v in st.values()))
    return best

# ---------- fuzz: random re-encodings of the same tiling ----------
def rand_unimod(rng):
    a, b, c, d = 1, 0, 0, 1
    for _ in range(rng.randint(3, 8)):
        k = rng.randint(-3, 3)
        if rng.random() < 0.5:
            a, b = a + k * c, b + k * d
        else:
            c, d = c + k * a, d + k * b
        if rng.random() < 0.3:
            a, b, c, d = c, d, a, b
    assert abs(a * d - b * c) == 1
    return a, b, c, d

def scramble(M, rng):
    t1, t2 = tuple(M[0]), tuple(M[1])
    seeds = [tuple(s) for s in M[2:]]
    a, b, c, d = rand_unimod(rng)                       # source 1
    t1, t2 = add(scale(t1, a), scale(t2, b)), add(scale(t1, c), scale(t2, d))
    g = rng.choice(G24)                                 # source 4 (orientation)
    t1, t2 = apply_g(g, t1), apply_g(g, t2)
    seeds = [apply_g(g, s) for s in seeds]
    o = rng.choice(seeds)                               # source 4 (origin)
    seeds = [sub(s, o) for s in seeds]
    out = []
    for s in seeds:                                     # source 2
        lam = add(scale(t1, rng.randint(-2, 2)), scale(t2, rng.randint(-2, 2)))
        out.append(add(s, lam) if rng.random() < 0.8 else s)
    rng.shuffle(out)                                    # source 3
    return [t1, t2] + out

def refine(M, mm):
    """Re-encode with the index-|det mm| sublattice mm*(t1,t2) and lifted seeds."""
    t1, t2 = tuple(M[0]), tuple(M[1])
    seeds = [tuple(s) for s in M[2:]]
    (a, b), (c, d) = mm
    T1, T2 = add(scale(t1, a), scale(t2, b)), add(scale(t1, c), scale(t2, d))
    m = abs(a * d - b * c); assert m > 1
    H2 = hnf([T1, T2])
    reps = set()
    for i in range(m):
        for j in range(m):
            reps.add(rep(add(scale(t1, i), scale(t2, j)), H2))
    assert len(reps) == m
    return [T1, T2] + [add(s, r) for s in seeds for r in reps]

# ---------- instances ----------
A1 = [[1,0,0,0],[0,0,0,1],[0,0,0,0]]                    # square, axis-aligned
A2 = [[1,0,0,0],[1,0,0,1],[0,0,0,0]]                    # square, sheared basis
A3 = [[0,1,0,0],[-1,0,1,0],[0,0,0,0]]                   # square, rotated 30deg
B1 = [[0,1,0,1],[0,-1,0,2],[0,0,0,0],[0,0,0,1]]         # honeycomb, origin at class A
B2 = [[0,1,0,1],[0,-1,0,2],[0,0,0,-1],[0,0,0,0]]        # honeycomb, origin at class B
TRI = [[1,0,0,0],[0,0,1,0],[0,0,0,0]]                   # triangular tiling
KAG = [[2,0,0,0],[0,0,2,0],[0,0,0,0],[-1,0,1,0],[0,0,1,0]]  # trihexagonal 3.6.3.6

def show(name, cand, stats):
    print(f"{name}:  n={stats['n']}  |G_min|={stats['Gmin']}  anchors={stats['anchors']}"
          f"  distinct-candidates={stats['distinct']}  star-sizes={stats['starsizes']}")
    for r in cand:
        print("   ", list(r))

if __name__ == "__main__":
    stats = {}
    NA = canonical(A1, stats=stats); show("square   N", NA, stats)
    assert canonical(A2) == NA, "square: basis-change variant differs"
    assert canonical(A3) == NA, "square: rotated variant differs"

    NB = canonical(B1, stats=stats); show("honeycomb N", NB, stats)
    assert canonical(B2) == NB, "honeycomb: origin variant differs"

    NT = canonical(TRI, stats=stats); show("triangular N", NT, stats)
    NK = canonical(KAG, stats=stats); show("trihexagonal N", NK, stats)

    assert len({NA, NB, NT, NK}) == 4, "distinct tilings must get distinct forms"

    # expected hand-derived values
    assert NA == ((0,1,0,-1),(0,0,1,0),(0,0,0,0)), NA
    assert NB == ((0,1,0,1),(0,0,0,3),(0,0,0,0),(0,0,0,1)), NB

    # degree sanity: honeycomb 3, square 4, triangular 6, kagome 4
    for M, deg in [(A1,4),(B1,3),(TRI,6),(KAG,4)]:
        H = hnf([tuple(M[0]), tuple(M[1])])
        S = sorted(set(rep(tuple(s), H) for s in M[2:]))
        for s, ks in stars(H, S).items():
            assert len(ks) == deg, (M, s, ks)

    # sublattice re-encodings (violate the fixed-n reading; stage A must absorb them)
    for base, name in [(A1,"square"),(B1,"honeycomb"),(KAG,"kagome")]:
        ref = canonical(base)
        for mm in [[[1,0],[0,2]], [[2,1],[0,3]], [[1,1],[-1,1]]]:
            assert canonical(refine(base, mm)) == ref, (name, mm)
    print("sublattice re-encodings: OK (indices 2, 6, 2)")

    # fuzz all four sources at once, plus sublattice + scramble composed
    rng = random.Random(42)
    for base, name in [(A1,"square"),(B1,"honeycomb"),(TRI,"triangular"),(KAG,"kagome")]:
        ref = canonical(base)
        for _ in range(300):
            assert canonical(scramble(base, rng)) == ref, name
        for _ in range(60):
            mm = rng.choice([[[1,0],[0,2]], [[2,1],[0,3]], [[1,1],[-1,1]], [[2,0],[1,2]]])
            assert canonical(scramble(refine(base, mm), rng)) == ref, (name, "refined")
    print("fuzz: 4 x 300 scrambles + 4 x 60 refined scrambles: OK")
    print("ALL TESTS PASSED")

def _extra():
    rng = random.Random(7)
    # canonicity fuzz on RANDOM symbols (not legal tilings): the group theory
    # must hold for any (Lambda, S) data, including empty stars and false ties.
    tried = 0
    hard = 0
    while tried < 400:
        rows = [tuple(rng.randint(-4, 4) for _ in range(4)) for _ in range(2)]
        try:
            H = hnf(list(rows))
        except AssertionError:
            continue
        if len(H) != 2:
            continue
        n = rng.randint(1, 6)
        seeds = [(0, 0, 0, 0)] + [tuple(rng.randint(-6, 6) for _ in range(4))
                                  for _ in range(n - 1)]
        M = list(rows) + seeds
        st = {}
        ref = canonical(M, stats=st)
        if st['Gmin'] * st['anchors'] > st['distinct']:
            hard += 1  # ties that needed the residual minimization
        for _ in range(5):
            assert canonical(scramble(M, rng)) == ref
        tried += 1
    print(f"random-symbol fuzz: 400 symbols x 5 scrambles OK "
          f"({hard} had residual ties beyond distinct candidates)")

    # timing anchor on larger n via sublattice refinement of the honeycomb
    import time
    for idx in [5, 10, 15]:
        Mbig = refine(B1, [[idx, 0], [0, idx]])         # n = 2*idx^2
        Mbig = scramble(Mbig, rng)
        t0 = time.perf_counter()
        st = {}
        out = canonical(Mbig, stats=st)
        dt = time.perf_counter() - t0
        assert out == canonical(B1)
        print(f"n_input={2*idx*idx:4d} -> n_max={st['n']}  "
              f"|G_min|={st['Gmin']} anchors={st['anchors']}  {dt*1000:7.1f} ms")

_extra()
