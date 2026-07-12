#!/usr/bin/env python3
"""
k=3 metric-compatibility table. Same formulas as hyp_realize.py (kept standalone
so importing does not re-run that file's demo). See docs/hyperbolic-port-notes-2026-07-12.md.

A k-uniform tiling has ONE global edge length, so a k=3 candidate is any set of 3
vertex types (orbits) that all realize at a single shared edge length l. The pools
are exactly the shared-length clusters found for k=2; k=3 just needs the pool to
offer >=3 distinct vertex types. NECESSARY (metric) only -- combinatorial closure
(does a connected edge-to-edge tiling exist) is the Ctrnact-search question and is
NOT decided here.
"""
import math
from itertools import combinations_with_replacement, permutations
from collections import Counter

TWO_PI = 2 * math.pi
def euclid_angle(p): return math.pi * (p - 2) / p
def interior_angle(p, l): return 2 * math.asin(min(1.0, math.cos(math.pi / p) / math.cosh(l / 2)))
def euclid_sum(c): return sum(euclid_angle(p) for p in c)
def angle_sum(c, l): return sum(interior_angle(p, l) for p in c)

def realizing_edge(c):
    if euclid_sum(c) <= TWO_PI + 1e-12: return None
    f = lambda l: angle_sum(c, l) - TWO_PI
    lo, hi = 1e-12, 1.0
    while f(hi) > 0:
        hi *= 2
        if hi > 1e7: return None
    for _ in range(300):
        m = 0.5 * (lo + hi)
        if f(m) > 0: lo = m
        else: hi = m
    return 0.5 * (lo + hi)

def pq_edge(p, q):
    v = math.cos(math.pi / p) / math.sin(math.pi / q)
    return 2 * math.acosh(v) if v > 1 + 1e-12 else None

def necklaces(ms):
    seen, out = set(), []
    for perm in set(permutations(ms)):
        n = len(perm)
        rots = [tuple(perm[i:] + perm[:i]) for i in range(n)]
        rev = perm[::-1]
        rots += [tuple(rev[i:] + rev[:i]) for i in range(n)]
        c = min(rots)
        if c not in seen:
            seen.add(c); out.append(c)
    return out

def cfg_str(ms):  # compact p^a.q^b form
    return ".".join(f"{p}^{n}" if n > 1 else f"{p}" for p, n in sorted(Counter(ms).items()))

POLYS = [3, 4, 5, 6, 7, 8, 12]
VAL_CAP = 8

# bucket hyperbolic multisets by realizing edge length
buckets = {}
for m in range(3, VAL_CAP + 1):
    for combo in combinations_with_replacement(POLYS, m):
        if euclid_sum(combo) > TWO_PI + 1e-9:
            l = realizing_edge(combo)
            if l is not None:
                buckets.setdefault(round(l, 9), []).append(combo)

# regular {p,q} anchors present in a bucket = single-symbol multisets p^q
def regular_members(mults):
    out = []
    for ms in mults:
        s = set(ms)
        if len(s) == 1:
            p = ms[0]; q = len(ms)
            out.append(f"{{{p},{q}}}")
    return out

# structured co-realization = >=2 DISTINCT polygon-multisets at one edge length.
# k=3 with three different compositions needs a pool of >=3 distinct multisets.
rows = []
for l, mults in buckets.items():
    if len(mults) >= 2:
        rows.append((l, regular_members(mults), len(mults), mults))
rows.sort(key=lambda r: -r[2])   # richest pools first

print("=" * 96)
print("Structured co-realization pools (polys {3,4,5,6,7,8,12}, valence<=8).")
print("Each row: distinct polygon-compositions that ALL close at one edge length.")
print(">=3 compositions => can host a k=3 tiling with three different vertex compositions.")
print("=" * 96)
print(f"  {'edge length l':>14}  {'regular {p,q}':<14}{'#comps':>7}  k3?  compositions")
for l, reg, nm, mults in rows:
    k3 = "YES" if nm >= 3 else "no"
    comps = ", ".join(cfg_str(ms) for ms in sorted(mults, key=lambda m: (len(set(m)), m)))
    if len(comps) > 58:
        comps = comps[:55] + "..."
    print(f"  {l:>14.7f}  {(', '.join(reg) if reg else '-'):<14}{nm:>7}  {k3:<4} {comps}")
n_k3 = sum(1 for r in rows if r[2] >= 3)
print(f"\n  {len(rows)} lengths carry >=2 distinct compositions; {n_k3} carry >=3 (k=3-capable).")

print()
print("=" * 96)
print("Concrete k=3 metric-compatible triples (3 DISTINCT vertex types at one edge length)")
print("=" * 96)
def show_triple(title, l, types):
    print(f"\n  {title}   edge length l = {l:.9f}")
    for t in types:
        r = math.degrees(angle_sum(t, l) - TWO_PI)
        print(f"     {cfg_str(t):<16} = {str(t):<26} closes to 2pi (resid {r:+.1e} deg)")

# (i) three different MULTISETS at l_{3,8}
l38 = pq_edge(3, 8)
show_triple("(i) three multisets @ l_{3,8}", l38, [(3,)*8, (8,)*4, (3, 3, 8, 8, 8)])
# (ii) three different MULTISETS at l_{4,7}  (triangle+square+heptagon family)
l47 = pq_edge(4, 7)
show_triple("(ii) three multisets @ l_{4,7}", l47, [(4,)*7, (3, 4, 4, 4, 4, 4, 7), (3, 3, 3, 4, 7, 7, 7)])
# (iii) ONE multiset, three necklaces (same angles, different cyclic order) @ l_{5,4}
l54 = pq_edge(5, 4)
ms = (3, 3, 3, 3, 4, 4)
nk = necklaces(ms)
print(f"\n  (iii) one multiset, three necklaces @ l_{{5,4}}   edge length l = {l54:.9f}")
print(f"     multiset {cfg_str(ms)} = {ms}, realizes at l={realizing_edge(ms):.9f}")
for t in nk:
    r = math.degrees(angle_sum(t, l54) - TWO_PI)
    print(f"     necklace {str(t):<24} closes to 2pi (resid {r:+.1e} deg)")

print()
print("  NOTE: every row above is a NECESSARY metric condition only. A connected edge-to-edge")
print("  k=3 tiling exists iff these types also glue combinatorially -- the Ctrnact-search")
print("  question, not decided here. No k>=2 hyperbolic oracle exists to check counts against.")
