#!/usr/bin/env python3
"""Adversarial review battery for canonical_form.N.

Attacks:
  1. Differential vs an independent oracle: the problem's Section-4 baseline
     (global lex-min over ALL 24 x n frames, same Stage A).  The two forms pick
     different representatives, so we compare the PARTITIONS they induce on a
     corpus, which must be identical.
  2. Idempotence: N(N(M)) == N(M) for every corpus symbol.
  3. A lower-symmetry legal tiling (elongated triangular 3^3.4^2, point group
     of order 4) with hand-derived stars as ground truth, plus fuzz.
  4. Forced exercise of the residual-tie path (distinct candidates > 1):
     crafted all-empty-star asymmetric constellations + random symbols,
     with scramble-stability asserted on exactly those.
  5. Mutation/collision sanity: single-seed mutants must separate from their
     parents (checked via the oracle partition, not assumed).
  6. A star-filtered Stage A (needed for the generic-complexity claim) checked
     for exact agreement with the unfiltered Stage A on the whole corpus.
"""
import random
from collections import Counter, defaultdict

import canonical_form as cf  # runs its module-level self-checks on import

# ---------- 1. independent oracle: the Section-4 baseline ----------
def baseline_canonical(M):
    rows = [tuple(r) for r in M]
    H = cf.hnf(rows[:2]); assert len(H) == 2
    S = sorted(set(cf.rep(s, H) for s in rows[2:]))
    H, S = cf.maximize(H, S)          # same Stage A; oracle for Section-3 equivalence
    best = None
    for g in cf.G24:
        Hg = cf.hnf([cf.apply_g(g, H[0]), cf.apply_g(g, H[1])])
        for o in S:
            srows = sorted(cf.rep(cf.apply_g(g, cf.sub(s, o)), Hg) for s in S)
            cand = tuple(Hg) + tuple(srows)
            if best is None or cand < best:
                best = cand
    return best

# ---------- 6. star-filtered Stage A (generic-complexity variant) ----------
def maximize_filtered(H, S):
    S = sorted(set(cf.rep(s, H) for s in S))
    Sset = set(S)
    st = cf.stars(H, S)
    cnt = Counter(st.values())
    s0 = min(S, key=lambda s: (cnt[st[s]], s))   # rarest star class anchors the search
    ts = []
    for s in S:
        if st[s] != st[s0]:
            continue                              # t = s - s0 cannot preserve V
        t = cf.sub(s, s0)
        if all(cf.rep(cf.add(x, t), H) in Sset for x in S):
            ts.append(cf.rep(t, H))
    H2 = cf.hnf(list(H) + ts)
    assert len(H2) == 2
    S2 = sorted(set(cf.rep(s, H2) for s in S))
    assert len(S) % len(S2) == 0
    return H2, S2

# ---------- corpus ----------
# elongated triangular tiling 3.3.3.4.4:  V = {0, w^3} + (Z*1 + Z*(w^2+w^3))
ELT = [[1,0,0,0],[0,0,1,1],[0,0,0,0],[0,0,0,1]]

def rand_symbol(rng):
    while True:
        rows = [tuple(rng.randint(-4, 4) for _ in range(4)) for _ in range(2)]
        if len(cf.hnf(list(rows))) == 2:
            break
    n = rng.randint(1, 6)
    seeds = [(0, 0, 0, 0)] + [tuple(rng.randint(-6, 6) for _ in range(4))
                              for _ in range(n - 1)]
    return [list(r) for r in rows] + [list(s) for s in seeds]

def build_corpus(rng):
    corpus = []
    legal = [cf.A1, cf.B1, cf.TRI, cf.KAG, ELT]
    for M in legal:
        corpus.append(M)
        for _ in range(5):
            corpus.append(cf.scramble(M, rng))
        corpus.append(cf.refine(M, [[1, 0], [0, 2]]))
        corpus.append(cf.scramble(cf.refine(M, [[2, 1], [0, 3]]), rng))
        for _ in range(2):                        # mutants: genuinely different V
            Mm = [list(r) for r in M]
            i = rng.randrange(2, len(Mm))
            Mm[i] = list(cf.add(tuple(Mm[i]), cf.W[rng.randrange(12)]))
            corpus.append(Mm)
    for _ in range(60):
        M = rand_symbol(rng)
        corpus.append(M)
        for _ in range(3):
            corpus.append(cf.scramble(M, rng))
    return corpus

if __name__ == "__main__":
    rng = random.Random(2026)

    # ---------- 3. ELT ground truth ----------
    H = cf.hnf([(1, 0, 0, 0), (0, 0, 1, 1)])
    S = sorted(set(cf.rep(tuple(s), H) for s in ELT[2:]))
    Hm, Sm = cf.maximize(H, S)
    assert len(Sm) == 2, "ELT lattice was not maximal as constructed"
    st = cf.stars(Hm, Sm)
    got = sorted(sorted(v) for v in st.values())
    assert got == [[0, 2, 4, 6, 9], [0, 3, 6, 8, 10]], got   # hand-derived geometry
    stats = {}
    NE = cf.canonical(ELT, stats=stats)
    print("ELT   N:", [list(r) for r in NE])
    print("ELT   stats:", stats)
    for _ in range(300):
        assert cf.canonical(cf.scramble(ELT, rng)) == NE
    for mm in [[[1, 0], [0, 2]], [[2, 1], [0, 3]]]:
        assert cf.canonical(cf.scramble(cf.refine(ELT, mm), rng)) == NE
    print("ELT: 300 scrambles + 2 refined scrambles stable")

    # ---------- 4. residual-tie path: crafted + random ----------
    # all seeds pairwise non-unit-adjacent -> every star empty -> G_min = D12,
    # anchors = all seeds; the constellation is asymmetric, so distinct > 1.
    CRAFT = [[4,0,0,0],[0,0,0,4],[0,0,0,0],[2,0,0,1],[1,0,0,3]]
    stats = {}
    NC = cf.canonical(CRAFT, stats=stats)
    print("CRAFT stats:", stats)
    assert stats['starsizes'] == [0, 0, 0], "craft failed: some star non-empty"
    assert stats['Gmin'] == 24 and stats['anchors'] == 3
    assert stats['distinct'] > 1, "residual minimization not exercised"
    for _ in range(200):
        assert cf.canonical(cf.scramble(CRAFT, rng)) == NC
    print(f"CRAFT: distinct={stats['distinct']} candidates, 200 scrambles stable")

    hard = 0
    for _ in range(300):
        M = rand_symbol(rng)
        stt = {}
        r = cf.canonical(M, stats=stt)
        if stt['distinct'] > 1:
            hard += 1
            for _ in range(5):
                assert cf.canonical(cf.scramble(M, rng)) == r
    print(f"random symbols: {hard}/300 exercised residual ties; all stable")
    assert hard > 0

    # ---------- 1+2+5+6. corpus: oracle partition, idempotence, filtered Stage A ----------
    corpus = build_corpus(rng)
    mine, base = [], []
    for M in corpus:
        a = cf.canonical(M)
        b = baseline_canonical(M)
        mine.append(a); base.append(b)
        # idempotence
        assert cf.canonical([list(r) for r in a]) == a, "N not idempotent"
        # filtered Stage A must agree exactly
        rows = [tuple(r) for r in M]
        H0 = cf.hnf(rows[:2])
        S0 = sorted(set(cf.rep(s, H0) for s in rows[2:]))
        assert cf.maximize(H0, S0) == maximize_filtered(H0, S0), "filtered Stage A differs"
    gm, gb = defaultdict(set), defaultdict(set)
    for i, (a, b) in enumerate(zip(mine, base)):
        gm[a].add(i); gb[b].add(i)
    Pm = sorted(sorted(v) for v in gm.values())
    Pb = sorted(sorted(v) for v in gb.values())
    assert Pm == Pb, "partition disagrees with the Section-4 oracle"
    print(f"corpus: {len(corpus)} symbols, {len(Pm)} equivalence classes; "
          f"partition identical to the 24n-frame oracle; idempotence and "
          f"filtered Stage A verified on all")
    print("REVIEW BATTERY PASSED")
