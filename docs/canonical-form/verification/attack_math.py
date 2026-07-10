#!/usr/bin/env python3
"""Adversarial attacks on canonical_form.py and its proofs."""
import random, sys, itertools
import canonical_form as cf

FAIL = []
def check(name, cond, detail=""):
    tag = "ok " if cond else "FAIL"
    print(f"[{tag}] {name} {detail}")
    if not cond:
        FAIL.append((name, detail))

# ---------------------------------------------------------------- helpers
def in_lat(v, H):
    v = list(v)
    for b in H:
        c = next(i for i in range(4) if b[i] != 0)
        if v[c] % b[c] != 0:
            return False
        q = v[c] // b[c]
        for i in range(4):
            v[i] -= q * b[i]
    return all(x == 0 for x in v)

def compose(g1, g2):          # apply g2 FIRST, then g1
    k1, j1 = g1; k2, j2 = g2
    if k1 == 'r' and k2 == 'r': return ('r', (j1 + j2) % 12)
    if k1 == 'r' and k2 == 'f': return ('f', (j1 + j2) % 12)
    if k1 == 'f' and k2 == 'r': return ('f', (j1 - j2) % 12)
    return ('r', (j1 - j2) % 12)

def ginv(g):
    k, j = g
    return ('r', (-j) % 12) if k == 'r' else g

def normalize(M):
    rows = [tuple(r) for r in M]
    H = cf.hnf(rows[:2]); assert len(H) == 2
    S = sorted(set(cf.rep(s, H) for s in rows[2:]))
    return cf.maximize(H, S)

def build_C(H, S, g, o):
    Hg = cf.hnf([cf.apply_g(g, H[0]), cf.apply_g(g, H[1])])
    return tuple(Hg) + tuple(sorted(cf.rep(cf.apply_g(g, cf.sub(s, o)), Hg) for s in S))

def cand_data(H, S):
    st = cf.stars(H, S)
    lists = {g: sorted(cf.word(frozenset(cf.sigma(g, k) for k in st[s])) for s in S)
             for g in cf.G24}
    bestL = min(lists.values())
    Gmin = [g for g in cf.G24 if lists[g] == bestL]
    minw = bestL[0]
    cands = {}
    for g in Gmin:
        anchors = [s for s in S
                   if cf.word(frozenset(cf.sigma(g, k) for k in st[s])) == minw]
        for o in anchors:
            cands[(g, o)] = build_C(H, S, g, o)
    return Gmin, minw, cands

# ================================================================ ITEM 1
print("== item 1: HNF uniqueness (incl. free columns) + rep well-definedness ==")
rng = random.Random(0)
bad = 0
trials = 0
while trials < 2000:
    rows = [tuple(rng.randint(-9, 9) for _ in range(4)) for _ in range(2)]
    H = cf.hnf([list(rows[0]), list(rows[1])])
    if len(H) != 2:
        continue
    trials += 1
    for _ in range(4):
        a, b, c, d = cf.rand_unimod(rng)
        r1 = cf.add(cf.scale(rows[0], a), cf.scale(rows[1], b))
        r2 = cf.add(cf.scale(rows[0], c), cf.scale(rows[1], d))
        if cf.hnf([r1, r2]) != H:
            bad += 1
    # rep: window + coset + basis-independence
    v = tuple(rng.randint(-50, 50) for _ in range(4))
    r = cf.rep(v, H)
    piv = [(next(i for i in range(4) if b[i] != 0), b) for b in H]
    okwin = all(0 <= r[c] < b[c] for c, b in piv)
    if not okwin or not in_lat(cf.sub(r, v), H):
        bad += 1
check("HNF unique under 8000 GL2(Z) basis changes; rep in window & correct coset",
      bad == 0, f"violations={bad}")

# pivot columns not at 0,1 (free columns before/between pivots)
H = cf.hnf([(0, 3, 5, -7), (0, 0, 2, 9)])
check("HNF with pivots at cols 1,2 and free col 3 handled",
      len(H) == 2 and H[0][0] == 0)

# ================================================================ ITEM 3
print("== item 3: sigma homomorphism + compose table ==")
bad = 0
rngv = random.Random(3)
for g1 in cf.G24:
    for g2 in cf.G24:
        g12 = compose(g1, g2)
        for _ in range(3):
            v = tuple(rngv.randint(-6, 6) for _ in range(4))
            if cf.apply_g(g12, v) != cf.apply_g(g1, cf.apply_g(g2, v)):
                bad += 1
        for k in range(12):
            if cf.sigma(g12, k) != cf.sigma(g1, cf.sigma(g2, k)):
                bad += 1
check("compose matches apply_g and sigma is a homomorphism (all 576 pairs)", bad == 0)

# star equivariance under every h, checked directly on set data
def star_direct(Sset, H, s):
    return frozenset(k for k in range(12) if cf.rep(cf.add(s, cf.W[k]), H) in Sset)

# ================================================================ test symbols
LAM7 = [(7, 0, 0, 0), (0, 0, 0, 7)]
Lshape = LAM7 + [(0, 0, 0, 0), (1, 0, 0, 0), (2, 0, 0, 0), (0, 0, 0, 1)]
falsetie = LAM7 + [(0, 0, 0, 0), (1, 0, 0, 0), (2, 0, 0, 0), (1, 0, 0, 1), (3, 0, 0, 2)]
cloud = [(9, 0, 0, 0), (0, 0, 0, 9),
         (0, 0, 0, 0), (2, 0, 0, 0), (5, 0, 0, 1), (1, 0, 0, 4)]
DEG = [(1, 0, 0, 0), (0, 2, 0, -1),        # t1 = 1, t2 = sqrt(3): R-dependent!
       (0, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0)]
B1 = cf.B1; KAG = cf.KAG; A1 = cf.A1

# sanity on adversarial constructions
H, S = normalize(falsetie)
st = cf.stars(H, S)
check("falsetie: maximize left lattice alone", H == cf.hnf(LAM7))
ms = sorted(st.values(), key=lambda a: sorted(a))
check("falsetie: star multiset invariant under ('f',6) (supergroup tie)",
      sorted(cf.word(a) for a in st.values()) ==
      sorted(cf.word(frozenset((6 - k) % 12 for k in a)) for a in st.values()))
Gmin, minw, cands = cand_data(H, S)
check("falsetie: |G_min| = 2 with a FALSE reflection tie, distinct candidates = |frames|",
      len(Gmin) == 2 and len(set(cands.values())) == len(cands),
      f"Gmin={Gmin} anchors/frames={len(cands)} distinct={len(set(cands.values()))}")

H, S = normalize(cloud)
st = cf.stars(H, S)
check("cloud: all stars empty (G_min = 24, residual does everything)",
      all(len(a) == 0 for a in st.values()))

# ================================================================ ITEMS 3+4
print("== items 3-4: frame lemma + candidate-set equality, exhaustive over h ==")
rngc = random.Random(11)
for name, M in [("honeycomb", B1), ("kagome", KAG), ("Lshape", Lshape),
                ("falsetie", falsetie), ("cloud", cloud), ("degenerate", DEG)]:
    H, S = normalize(M)
    Gmin, minw, cands = cand_data(H, S)
    best = min(cands.values())
    bad_frame = bad_set = bad_gmin = bad_max = 0
    for h in cf.G24:
        for c in [(0, 0, 0, 0),
                  tuple(rngc.randint(-8, 8) for _ in range(4)),
                  tuple(rngc.randint(-8, 8) for _ in range(4))]:
            Hp = cf.hnf([cf.apply_g(h, H[0]), cf.apply_g(h, H[1])])
            Sp = sorted(set(cf.rep(cf.add(cf.apply_g(h, s), c), Hp) for s in S))
            Hp2, Sp2 = cf.maximize(Hp, list(Sp))
            if (Hp2, Sp2) != (Hp, Sp):
                bad_max += 1
            Gmin2, minw2, cands2 = cand_data(Hp, Sp)
            if set(Gmin2) != {compose(g, ginv(h)) for g in Gmin}:
                bad_gmin += 1
            if set(cands2.values()) != set(cands.values()) or min(cands2.values()) != best:
                bad_set += 1
            # frame lemma for ALL 24 g' and ALL origins o' (not just minima)
            for g2 in cf.G24:
                for o2 in Sp:
                    o = cf.apply_g(ginv(h), cf.sub(o2, c))
                    if build_C(Hp, Sp, g2, o2) != build_C(H, S, compose(g2, h), o):
                        bad_frame += 1
    check(f"{name}: maximality transported (h.Lmax = Lmax(hV+c))", bad_max == 0)
    check(f"{name}: G_min(hV+c) = G_min(V).h^-1 for all 24 h x 3 c", bad_gmin == 0)
    check(f"{name}: restricted candidate SETS equal + equal minima", bad_set == 0)
    check(f"{name}: frame lemma C_(hV+c)(g',o') = C_V(g'h, h^-1(o'-c)), full 24x24xn sweep",
          bad_frame == 0, f"violations={bad_frame}")

# build_C depends only on coset of o
bad = 0
H, S = normalize(KAG)
for _ in range(200):
    g = rngc.choice(cf.G24)
    o = rngc.choice(S)
    lam = cf.add(cf.scale(H[0], rngc.randint(-3, 3)), cf.scale(H[1], rngc.randint(-3, 3)))
    if build_C(H, S, g, o) != build_C(H, S, g, cf.add(o, lam)):
        bad += 1
check("build_C depends only on the coset of the origin", bad == 0)

# ================================================================ ITEM 2
print("== item 2: Stage A ==")
# (a) no-op on already-maximal symbols, incl. their scrambles
bad = 0
rngs = random.Random(5)
for M in [A1, B1, cf.TRI, KAG, Lshape, falsetie, cloud]:
    if cf.canonical(M, do_maximize=True) != cf.canonical(M, do_maximize=False):
        bad += 1
    for _ in range(50):
        Ms = cf.scramble(M, rngs)
        if cf.canonical(Ms, True) != cf.canonical(Ms, False):
            bad += 1
check("Stage A is a no-op on max-lattice symbols (incl. 350 scrambles)", bad == 0)

# (b) completeness: refine at larger indices incl. 25 and 49, composed with scramble
bad = 0
for M in [A1, B1, KAG, falsetie]:
    ref = cf.canonical(M)
    for mm in [[[5, 0], [0, 5]], [[7, 0], [0, 7]], [[3, 1], [1, 4]], [[2, 3], [-3, 2]]]:
        R = cf.refine(M, mm)
        if cf.canonical(R) != ref:
            bad += 1
        for _ in range(5):
            if cf.canonical(cf.scramble(R, rngs)) != ref:
                bad += 1
check("Stage A recovers Lambda_max at indices 25/49/11/13 (+scrambles)", bad == 0)

# (c) rank-3 stacking impossible: garbage fuzz, maximize never raises
bad = 0
tried = 0
while tried < 3000:
    rows = [tuple(rngs.randint(-5, 5) for _ in range(4)) for _ in range(2)]
    H = cf.hnf(list(rows))
    if len(H) != 2:
        continue
    tried += 1
    S = sorted(set([(0, 0, 0, 0)] + [tuple(rngs.randint(-8, 8) for _ in range(4))
                                     for _ in range(rngs.randint(0, 6))]))
    S = sorted(set(cf.rep(s, H) for s in S))
    try:
        cf.maximize(H, S)
    except AssertionError:
        bad += 1
check("stacked HNF never reaches rank 3 (3000 garbage symbols)", bad == 0)

# ================================================================ adversarial canonicity
print("== supergroup/false-tie/degenerate canonicity under heavy scrambling ==")
for name, M, k in [("Lshape (chiral)", Lshape, 300),
                   ("falsetie (star field D-supergroup, tiling asymmetric)", falsetie, 300),
                   ("cloud (empty stars, trivial point group)", cloud, 300),
                   ("degenerate real lattice t1=1,t2=sqrt3", DEG, 200)]:
    ref = cf.canonical(M)
    bad = sum(cf.canonical(cf.scramble(M, rngs)) != ref for _ in range(k))
    st2 = {}
    cf.canonical(M, stats=st2)
    check(f"{name}: {k} scrambles -> identical N", bad == 0,
          f"|Gmin|={st2['Gmin']} anchors={st2['anchors']} distinct={st2['distinct']}")

# mirror image explicitly (equivalence includes reflections; enantiomorphs must merge)
Lmirror = [cf.conj(r) for r in Lshape]
check("Lshape and its mirror image get the same N",
      cf.canonical(Lmirror) == cf.canonical(Lshape))

# ================================================================ ITEM 6
print("== item 6: does the SS-baseline really fail sublattice re-encoding? ==")
def baseline(M):
    rows = [tuple(r) for r in M]
    H = cf.hnf(rows[:2]); assert len(H) == 2
    S = sorted(set(cf.rep(s, H) for s in rows[2:]))
    best = None
    for g in cf.G24:
        Hg = cf.hnf([cf.apply_g(g, H[0]), cf.apply_g(g, H[1])])
        for o in S:
            C = tuple(Hg) + tuple(sorted(cf.rep(cf.apply_g(g, cf.sub(s, o)), Hg) for s in S))
            if best is None or C < best:
                best = C
    return best

R = cf.refine(A1, [[1, 0], [0, 2]])
b1, b2 = baseline(A1), baseline(R)
# same vertex set?
HA = cf.hnf([tuple(A1[0]), tuple(A1[1])]); SA = [cf.rep(tuple(A1[2]), HA)]
HR = cf.hnf([tuple(R[0]), tuple(R[1])]); SR = sorted(set(cf.rep(tuple(s), HR) for s in R[2:]))
same_V = all((cf.rep((i, 0, 0, j), HA) in set(SA)) == (cf.rep((i, 0, 0, j), HR) in set(SR))
             for i in range(-8, 9) for j in range(-8, 9))
check("A1 and refine(A1) define the SAME vertex set V", same_V)
check("baseline separates them (canonicity failure of Section-4 baseline)",
      b1 != b2, f"shapes {len(b1)}x4 vs {len(b2)}x4")
check("N (with Stage A) merges them", cf.canonical(A1) == cf.canonical(R))
check("N without Stage A also fails (Stage A is load-bearing)",
      cf.canonical(A1, do_maximize=False) != cf.canonical(R, do_maximize=False))

# ================================================================ ITEM 9
print("== item 9: degenerate inputs ==")
try:
    cf.canonical([(1, 0, 0, 0), (2, 0, 0, 0), (0, 0, 0, 0)])
    r1 = "no exception"
except AssertionError:
    r1 = "AssertionError (rejected)"
except Exception as e:
    r1 = type(e).__name__
print(f"   rank-1 lattice: {r1}")

try:
    cf.canonical([(1, 0, 0, 0), (0, 0, 0, 1)])
    r2 = "no exception"
except Exception as e:
    r2 = type(e).__name__
print(f"   zero seeds: {r2}")

M = [list(r) for r in B1] + [list(B1[2])]           # duplicate seed
check("duplicate seeds absorbed", cf.canonical(M) == cf.canonical(B1))

c = (3, 1, -2, 5)                                    # no zero seed at all
M = [B1[0], B1[1]] + [cf.add(tuple(s), c) for s in B1[2:]]
check("symbol without a zero seed still canonicalizes to same N",
      cf.canonical(M) == cf.canonical(B1))

# idempotence
bad = 0
for M in [A1, B1, cf.TRI, KAG, falsetie, cloud, Lshape]:
    Nm = cf.canonical(M)
    if cf.canonical([list(r) for r in Nm]) != Nm:
        bad += 1
check("N(N(M)) = N(M)", bad == 0)

# entry-bound observation for HNF rep (free columns unreduced)
Hbig = cf.hnf([(1, 0, 0, 0), (0, 0, 0, 5)])
r = cf.rep((0, 987, -654, 3), Hbig)
print(f"   note: rep leaves free columns unreduced: rep((0,987,-654,3)) = {r}")

# W entries all in {-1,0,1} (T2 path-bound premise)
check("all w^k coordinate entries in {-1,0,1} (T2 m-step bound premise)",
      all(all(abs(x) <= 1 for x in w) for w in cf.W))

print()
print("FAILURES:", FAIL if FAIL else "none")
