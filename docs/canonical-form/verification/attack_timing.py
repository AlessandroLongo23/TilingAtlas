#!/usr/bin/env python3
"""Complexity attacks: is Stage A always O(n^2)? Is 'generic O(n log n) total' honest?"""
import random, time
import canonical_form as cf

def normalize0(M):
    rows = [tuple(r) for r in M]
    H = cf.hnf(rows[:2])
    S = sorted(set(cf.rep(s, H) for s in rows[2:]))
    return H, S

def time_maximize(M, reps=3):
    H, S = normalize0(M)
    best = 1e9
    for _ in range(reps):
        t0 = time.perf_counter()
        cf.maximize(H, list(S))
        best = min(best, time.perf_counter() - t0)
    return best

def time_canonical(M, reps=1):
    best = 1e9
    st = {}
    for _ in range(reps):
        t0 = time.perf_counter()
        cf.canonical(M, stats=st)
        best = min(best, time.perf_counter() - t0)
    return best, st

print("== random cloud at fixed density 1/4 (max lattice, early-exit friendly) ==")
rng = random.Random(1)
prev = None
for m in [32, 45, 64, 90, 128]:
    n = m * m // 4
    pts = rng.sample([(i, 0, 0, j) for i in range(m) for j in range(m)], n)
    M = [(m, 0, 0, 0), (0, 0, 0, m)] + pts
    dt = time_maximize(M)
    ratio = f"  x{dt/prev:.2f} per ~2x n" if prev else ""
    print(f"  n={n:5d}  maximize: {dt*1000:8.1f} ms{ratio}")
    prev = dt

print()
print("== punched square grid: MAX-lattice input, Stage A forced quadratic ==")
# V = unit square grid minus a periodic hole at (1,0) per m x m cell.
# Lambda IS already maximal; unique-ish anchor; yet every candidate t survives
# ~n/2 membership checks on average before the single defect kills it.
prev = None
for m in [15, 21, 30, 42, 60]:
    S = [(i, 0, 0, j) for i in range(m) for j in range(m) if not (i == 1 and j == 0)]
    M = [(m, 0, 0, 0), (0, 0, 0, m)] + S
    n = len(S)
    dtA = time_maximize(M)
    dtT, st = time_canonical(M)
    ratio = f"  x{dtA/prev:.2f} per 2x n" if prev else ""
    print(f"  n={n:5d}  maximize: {dtA*1000:8.1f} ms   total: {dtT*1000:8.1f} ms   "
          f"|Gmin|={st['Gmin']} anchors={st['anchors']} distinct={st['distinct']}{ratio}")
    prev = dtA

print()
print("== stage E generic cost (Stage A skipped, do_maximize=False) on same family ==")
prev = None
for m in [15, 21, 30, 42, 60]:
    S = [(i, 0, 0, j) for i in range(m) for j in range(m) if not (i == 1 and j == 0)]
    M = [(m, 0, 0, 0), (0, 0, 0, m)] + S
    t0 = time.perf_counter()
    cf.canonical(M, do_maximize=False)
    dt = time.perf_counter() - t0
    ratio = f"  x{dt/prev:.2f} per 2x n" if prev else ""
    print(f"  n={len(S):5d}  canonical(no Stage A): {dt*1000:8.1f} ms{ratio}")
    prev = dt
