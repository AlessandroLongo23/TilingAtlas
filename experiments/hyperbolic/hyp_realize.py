#!/usr/bin/env python3
"""
Validation script for hyperbolic realizability of regular-polygon vertex
configurations. Findings and citations: docs/hyperbolic-port-notes-2026-07-12.md
(exploratory "would Ctrnact port to hyperbolic?" investigation, 2026-07-12).

Optional high-precision check needs mpmath (`pip install mpmath`); the float64
path in this file is self-contained.

Model: hyperbolic plane, curvature -1. A regular p-gon with edge length l has
interior angle  a(p,l) = 2*asin( cos(pi/p) / cosh(l/2) ).
  l->0  => a -> (p-2)/p * pi   (Euclidean interior angle)   [sanity anchor]
  l->oo => a -> 0
A vertex configuration (multiset of polygon side-counts) is REALIZABLE iff there
is an edge length l>0 with sum of interior angles = 2*pi. Because the sum is
strictly decreasing in l from the Euclidean sum to 0, a root exists iff the
Euclidean angle sum is strictly > 2*pi (i.e. > 360 deg).

Cross-check anchor: for the regular {p,q} tiling (q copies of a p-gon), the root
must satisfy  cosh(l/2) = cos(pi/p) / sin(pi/q),  which is real (>1) iff
(p-2)(q-2) > 4. We validate the numeric solver against this closed form.
"""
import math
from itertools import combinations_with_replacement
from collections import Counter

TWO_PI = 2 * math.pi

def euclid_angle(p):
    return math.pi * (p - 2) / p

def interior_angle(p, l):
    x = math.cos(math.pi / p) / math.cosh(l / 2)
    # x < 1 for all l>0, p>=3, so asin is always defined here
    return 2 * math.asin(min(1.0, x))

def euclid_sum(cfg):
    return sum(euclid_angle(p) for p in cfg)

def angle_sum(cfg, l):
    return sum(interior_angle(p, l) for p in cfg)

def realizing_edge(cfg):
    """l>0 with angle_sum=2pi, or None if Euclidean sum <= 2pi (not hyperbolic)."""
    if euclid_sum(cfg) <= TWO_PI + 1e-12:
        return None
    f = lambda l: angle_sum(cfg, l) - TWO_PI
    lo, hi = 1e-12, 1.0
    while f(hi) > 0:
        hi *= 2
        if hi > 1e7:
            return None
    for _ in range(300):
        mid = 0.5 * (lo + hi)
        if f(mid) > 0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)

def pq_closed_form_edge(p, q):
    """Closed-form edge length of the regular {p,q} tiling, or None if it doesn't exist.
    (p-2)(q-2)=4 is the Euclidean boundary; treat val within 1e-12 of 1 as non-hyperbolic."""
    val = math.cos(math.pi / p) / math.sin(math.pi / q)
    if val <= 1.0 + 1e-12:
        return None
    return 2 * math.acosh(val)

# --------------------------------------------------------------------------
print("=" * 70)
print("PART A. Sanity: Euclidean limit l->0 recovers Euclidean interior angles")
print("=" * 70)
for p in (3, 4, 5, 6, 8, 12):
    a0 = interior_angle(p, 1e-7)
    print(f"  p={p:2d}: a(l->0)={math.degrees(a0):8.4f} deg   Euclidean={math.degrees(euclid_angle(p)):8.4f} deg")

print()
print("=" * 70)
print("PART B. k=1 validation: numeric solver vs {p,q} closed form")
print("  (also checks existence condition (p-2)(q-2) > 4)")
print("=" * 70)
print(f"  {'{p,q}':>8}  {'(p-2)(q-2)':>10}  {'l_numeric':>12}  {'l_closed':>12}  {'|diff|':>10}  ok")
cases = [(3,7),(3,8),(3,9),(4,5),(4,6),(5,4),(5,5),(6,4),(7,3),(8,3),(12,3),
         (3,6),(4,4),(6,3),  # Euclidean boundary: should be non-hyperbolic
         (3,5),(4,3),(5,3)]  # spherical: should NOT realize
for p, q in cases:
    cfg = [p] * q
    ln = realizing_edge(cfg)
    lc = pq_closed_form_edge(p, q)
    prod = (p - 2) * (q - 2)
    if lc is None and ln is None:
        note = "non-hyperbolic (as expected)" if prod <= 4 else "??"
        print(f"  {str((p,q)):>8}  {prod:>10}  {'--':>12}  {'--':>12}  {'--':>10}  {note}")
    elif lc is not None and ln is not None:
        d = abs(ln - lc)
        ok = "YES" if d < 1e-9 else "MISMATCH"
        print(f"  {str((p,q)):>8}  {prod:>10}  {ln:>12.9f}  {lc:>12.9f}  {d:>10.2e}  {ok}")
    else:
        print(f"  {str((p,q)):>8}  {prod:>10}  numeric={ln}  closed={lc}   INCONSISTENT")

print()
print("=" * 70)
print("PART C. k=2, easy regime: two DIFFERENT vertex types sharing one polygon")
print("  multiset -> identical angle set -> identical realizing edge length,")
print("  so metric realizability is AUTOMATIC. Only the combinatorics is left.")
print("=" * 70)

def necklaces(multiset):
    """Distinct cyclic arrangements (necklaces) of a multiset, up to rotation+reflection."""
    from itertools import permutations
    seen = set()
    out = []
    for perm in set(permutations(multiset)):
        n = len(perm)
        rots = [tuple(perm[i:] + perm[:i]) for i in range(n)]
        rev = perm[::-1]
        rots += [tuple(rev[i:] + rev[:i]) for i in range(n)]
        canon = min(rots)
        if canon not in seen:
            seen.add(canon)
            out.append(canon)
    return out

demo_multisets = [(3,3,3,3,4,4), (3,3,3,4,4), (3,3,3,3,3,4), (3,3,4,4,4)]
for ms in demo_multisets:
    ES = math.degrees(euclid_sum(ms))
    l = realizing_edge(ms)
    nk = necklaces(ms)
    hyp = "hyperbolic" if l is not None else "NOT hyperbolic (Euclid sum<=360)"
    print(f"  multiset {ms}: Euclid sum={ES:.1f} deg -> {hyp}")
    if l is not None:
        print(f"      realizing edge l={l:.9f}, closure residual={math.degrees(angle_sum(ms,l)-TWO_PI):+.2e} deg")
        print(f"      {len(nk)} distinct vertex type(s) at THIS SAME l: {nk}")
        if len(nk) >= 2:
            print(f"      => >=2 distinct types co-realize at one edge length (a valid k>=2 metric config)")
    print()

print("=" * 70)
print("PART D. k=2, DIFFERENT polygon multisets: how special is co-realization?")
print("  Scan a polygon set; bucket configs by realizing edge length (9 dp).")
print("  A bucket with >1 DISTINCT multiset = mixed configs that share an edge")
print("  length exactly => metrically compatible (necessary, not sufficient).")
print("=" * 70)
POLYS = [3, 4, 5, 6, 7, 8, 12]
VAL_CAP = 8  # max polygons per vertex
cfgs = []
for m in range(3, VAL_CAP + 1):
    for combo in combinations_with_replacement(POLYS, m):
        if euclid_sum(combo) > TWO_PI + 1e-9:
            l = realizing_edge(combo)
            if l is not None:
                cfgs.append((round(l, 9), combo))
buckets = {}
for l, combo in cfgs:
    buckets.setdefault(l, []).append(combo)
multi = {l: v for l, v in buckets.items() if len(v) >= 2}
n_distinct_len = len(buckets)
n_shared = sum(len(v) for v in multi.values())
print(f"  scanned {len(cfgs)} hyperbolic multisets (polys={POLYS}, valence<= {VAL_CAP})")
print(f"  distinct realizing edge lengths: {n_distinct_len}")
print(f"  configs sitting on a SHARED length (>=2 multisets): {n_shared}")
print(f"  => co-realization is NOT generic: it concentrates on {len(multi)} special lengths.")
print(f"  Biggest shared-length clusters (edge length : # distinct multisets):")
for l, v in sorted(multi.items(), key=lambda kv: -len(kv[1]))[:6]:
    print(f"    l={l:.7f} : {len(v)} multisets, e.g. {v[:4]}")

print()
print("=" * 70)
print("PART E. The mechanism (provable): at the {3,q} edge length the angles go")
print("  commensurate.  Claim: alpha(3, l_{3,q}) = 2pi/q  and  alpha(q, l_{3,q}) = 4pi/q.")
print("  Proof: cosh(l/2)=cos(pi/3)/sin(pi/q)=1/(2 sin(pi/q)); then")
print("    alpha(q)=2 asin(cos(pi/q)*2 sin(pi/q))=2 asin(sin(2pi/q))=4pi/q.")
print("  So triangle+q-gon vertices a*(2pi/q)+b*(4pi/q)=2pi  <=>  a+2b=q  all share l_{3,q}.")
print("=" * 70)
for q in (7, 8, 12):
    l = pq_closed_form_edge(3, q)
    a3 = interior_angle(3, l); aq = interior_angle(q, l)
    print(f"  q={q}: l_{{3,{q}}}={l:.7f}  alpha(3)={math.degrees(a3):.5f} (=2pi/q={360/q:.5f})  "
          f"alpha({q})={math.degrees(aq):.5f} (=4pi/q={720/q:.5f})")
    fam = [(a, b) for a in range(0, q + 1) for b in range(0, q // 2 + 1)
           if a + 2 * b == q and a + b >= 3]
    print(f"     co-realizing triangle^a . {q}-gon^b vertex types (a+2b={q}, >=3 tiles):")
    for a, b in fam:
        cfg = tuple([3] * a + [q] * b)
        resid = math.degrees(angle_sum(cfg, l) - TWO_PI)
        tag = "  <- {%d,%d} regular" % ((3, q) if b == 0 else (q, 2 * q // q if False else 0))
        label = f"{{3,{q}}}" if b == 0 else (f"{{{q},{2*b+a}}}?" if a == 0 else "mixed")
        print(f"       3^{a}.{q}^{b}  = {str(cfg):<20} closes to 2pi (resid {resid:+.1e} deg)  [{label}]")

print()
print("=" * 70)
print("PART F. A concrete k=2 metric-compatible example to hand back.")
print("=" * 70)
q = 8
l = pq_closed_form_edge(3, q)
A = tuple([3] * 8)          # 3^8  = {3,8}   (8 triangles)
B = tuple([8] * 4)          # 8^4  = {8,4}   (4 octagons)
C = tuple([3, 3, 8, 8, 8])  # 3^2.8^3        (mixed)
for cfg, name in [(A, "{3,8}"), (B, "{8,4}"), (C, "3.3.8.8.8 (mixed)")]:
    print(f"  {name:<18} multiset {str(cfg):<18} closes at l={l:.9f}  "
          f"(resid {math.degrees(angle_sum(cfg,l)-TWO_PI):+.1e} deg)")
print("  All three live at the SAME edge length, so any tiling mixing these vertex")
print("  types is metrically consistent. Whether a connected edge-to-edge k=2 tiling")
print("  actually assembles from them is the COMBINATORIAL question (ctrnact's search),")
print("  which this metric check cannot decide. Shared length is necessary, not sufficient.")
