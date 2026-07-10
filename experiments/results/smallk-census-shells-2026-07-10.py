#!/usr/bin/env python3
"""Small-k (k<=3) rigid-branch weight bound: orbit census + exact norm shells + BFS weights.

This is the artifact behind docs/SMALLK_W_BOUND.md section 3. Exact integer arithmetic
throughout (sqrt3 carried as coordinate pairs). Produces smallk-census-shells-2026-07-10.csv.

Lemma map (see the doc): L1 census (m_i | |P|, Euler, tile integrality), L2 shell finiteness,
L3 pure-species rigidity (five corona-forced species), L4 co-occurrence connectivity,
L5 rigid basis form and the (X,Y) shell coordinates.
"""
from itertools import combinations_with_replacement
from collections import defaultdict
import math, csv, os

ANG = {3: 2, 4: 3, 6: 4, 12: 5}                    # interior angle / 30 deg
SHARE = {3: (0, 1), 4: (3, 0), 6: (0, 3), 12: (6, 3)}  # corner share * 12 as p + q*sqrt3
species = sorted(set(c for r in range(3, 7)
                     for c in combinations_with_replacement((3, 4, 6, 12), r)
                     if sum(ANG[t] for t in c) == 12))
assert len(species) == 10
# L3: pure-species tilings of these five are the unique uniform tilings (k=1)
RIGID = {(3, 3, 3, 3, 3, 3), (4, 4, 4, 4), (6, 6, 6), (3, 12, 12), (4, 6, 12)}

def sp_data(sp):
    return (sum(SHARE[t][0] for t in sp), sum(SHARE[t][1] for t in sp), len(sp),
            {t: sp.count(t) for t in (3, 4, 6, 12)})
SP = [sp_data(sp) for sp in species]

def cooc_connected(sset):
    tiles = set().union(*(set(species[s]) for s in sset))
    if len(tiles) <= 1:
        return True
    adj = defaultdict(set)
    for s in sset:
        ts = sorted(set(species[s]))
        for i in range(len(ts)):
            for j in range(i + 1, len(ts)):
                adj[ts[i]].add(ts[j]); adj[ts[j]].add(ts[i])
    start = next(iter(tiles)); seen = {start}; st = [start]
    while st:
        for m in adj[st.pop()]:
            if m not in seen:
                seen.add(m); st.append(m)
    return seen == tiles

def census(hol_divisors, kmax):
    out = defaultdict(list)
    for Pord in hol_divisors:
        ms = [d for d in range(1, Pord + 1) if Pord % d == 0]
        pool = [(m, s) for m in ms for s in range(len(species))]
        for r in range(1, kmax + 1):
            for combo in combinations_with_replacement(pool, r):
                sset = {s for _, s in combo}
                if len(sset) == 1 and species[next(iter(sset))] in RIGID:
                    continue           # L3: only the uniform tiling exists; entered by hand
                if not cooc_connected(sset):
                    continue           # L4
                PA = QA = n = e2 = 0
                cp = {3: 0, 4: 0, 6: 0, 12: 0}
                for m, s in combo:
                    p, q, deg, cnt = SP[s]
                    PA += m * p; QA += m * q; n += m; e2 += m * deg
                    for t in cp:
                        cp[t] += m * cnt[t]
                if e2 % 2: continue
                if any(cp[t] % t for t in cp): continue
                if n - e2 // 2 + sum(cp[t] // t for t in cp) != 0: continue
                out[(PA, QA)].append((Pord, tuple((m, species[s]) for m, s in combo)))
    return out

# true shells of the five rigid uniform tilings (L3, hand-derived in the doc):
RIGID_SHELLS_HEX = {(1, 0), (3, 0), (7, 4), (12, 6)}
RIGID_SHELLS_SQ = {(1, 0)}

def shells(cen, kind, extra):
    sh = {}
    for (PA, QA), provs in cen.items():
        if kind == 'hex':
            if QA % 6 or PA % 18: continue
            key = (QA // 6, PA // 18)
        else:
            if PA % 12 or QA % 12: continue
            key = (PA // 12, QA // 12)
        if key == (0, 0): continue
        sh.setdefault(key, []).extend(provs[:4])  # keep several provenances (referee NIT)
    for e in extra:
        sh.setdefault(e, [('rigid uniform', ())])
    return sh

res = {k: (shells(census([1, 2, 3, 4, 6, 12], k), 'hex', RIGID_SHELLS_HEX),
           shells(census([1, 2, 4, 8], k), 'sq', RIGID_SHELLS_SQ)) for k in (1, 2, 3)}
all_shells = set()
for k in res:
    all_shells |= set(res[k][0]) | set(res[k][1])

def norm(v):
    a, b, c, d = v
    return (a*a + b*b + c*c + d*d + a*c + b*d, a*b + b*c + c*d)

maxX = max(x for x, _ in all_shells)
B = int(math.isqrt(2 * maxX)) + 1                  # L2 coefficient bound
elems = defaultdict(list)
for a in range(-B, B + 1):
    for b in range(-B, B + 1):
        for c in range(-B, B + 1):
            for d in range(-B, B + 1):
                nm = norm((a, b, c, d))
                if nm in all_shells:
                    assert max(abs(t) for t in (a, b, c, d)) < B
                    elems[nm].append((a, b, c, d))

def mulz(v):
    a, b, c, d = v
    return (-d, a, b + d, c)                       # zeta12^4 = zeta12^2 - 1
units = []
v = (1, 0, 0, 0)
for _ in range(12):
    units.append(v); v = mulz(v)
assert v == (1, 0, 0, 0)
assert len(set(units)) == 12  # referee GAP-3: distinctness, not just closure

need = set()
for vs in elems.values():
    need.update(vs)
wt = {}; frontier = {(0, 0, 0, 0)}; seen = {(0, 0, 0, 0)}; depth = 0
while need - set(wt) and depth < 16:
    depth += 1
    nxt = set()
    for s in frontier:
        for u in units:
            t = (s[0]+u[0], s[1]+u[1], s[2]+u[2], s[3]+u[3])
            if t not in seen:
                nxt.add(t)
    seen |= nxt; frontier = nxt
    for t in nxt & need:
        wt[t] = depth
assert not (need - set(wt)), "unresolved shells - raise depth cap"

def swt(s):
    return max(wt[v] for v in elems[s])

rows = []
for k in (1, 2, 3):
    for kind, sh in zip(('hex', 'square'), res[k]):
        # shells with NO ring element of that exact norm are unrealizable (no lattice
        # vector can have it) and are soundly dropped here.
        live = [(s, swt(s)) for s in sh if s in elems]
        mx = max(w for _, w in live)
        print(f"k<={k} {kind}: MAX WT = {mx} ({len(live)} shells)")
        for s, w in live:
            rows.append({'k': k, 'lattice': kind, 'X': s[0], 'Y': s[1], 'maxwt': w,
                         'prov': str(sh[s][0])})
out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   'smallk-census-shells-2026-07-10.csv')
with open(out, 'w', newline='') as f:
    wr = csv.DictWriter(f, fieldnames=['k', 'lattice', 'X', 'Y', 'maxwt', 'prov'])
    wr.writeheader()
    for r in rows:
        wr.writerow(r)
print("saved", out)
