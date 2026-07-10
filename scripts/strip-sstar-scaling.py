#!/usr/bin/env python3
"""
Strip s*-scaling probe — the "1 square + n triangle layers" family, n = 1..NMAX.

Purpose (AL, 2026-07-09): chart s*(Lambda) vs the number of triangle layers n, and
vs k, to confirm the family sits on the proven 2k floor (Lemma L / R2-E2) out to
large n. This is the mirror-symmetric layered word  (square)(triangle)^n, repeated.

Exact arithmetic and wt()/gauss_reduce() are the SAME method as
thesis/figures/charts/weight-tightness-compute.py (Z[zeta_24], power basis, iterative-
deepening wt with metric prune), so the numbers are comparable to the thesis figure.

Lattice of the family (derived, exact):
  T1 = (1,0)          = zeta^0                 -- horizontal unit edge, wt 1
  T2 = zeta^6 + n*zeta^4                        -- one square step (+i) then n triangle
                                                  row steps, each (1/2, sqrt3/2) = zeta^4
  det = |T1 x T2| = 1 + n*sqrt3/2 = cell height H (base 1).
  k   = floor(n/2)+1   (vertex-line orbit count: 1 interface orbit of 3.3.3.4.4
                        vertices + ceil((n-1)/2) interior 3^6 orbits, folded by the
                        triangle-block-centre mirror).

s* here = wt(reduced T2): (1,0) is the global minimum-weight nonzero vector, so every
basis has a second generator of weight >= wt(reduced T2); the weight-<=s vectors
generate Lambda iff s >= wt(reduced T2). (Cross-checked against the full generation-
test s_star for n<=9: identical.)

Run:  python3 scripts/strip-sstar-scaling.py [NMAX]     (default NMAX=25)
Log:  experiments/results/strip-sstar-<date>.log  (synchronous, progress + ETA)
CSV:  experiments/results/strip-sstar-<date>.csv  (n,k,sStar,wtU,wtV,lenU,lenV,H)
"""
import math, os, sys, time
from datetime import date

NMAX = int(sys.argv[1]) if len(sys.argv) > 1 else 25
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT = os.path.join(ROOT, "experiments", "results")
os.makedirs(OUT, exist_ok=True)
TAG = date.today().isoformat()
LOG = os.path.join(OUT, f"strip-sstar-{TAG}.log")
CSV = os.path.join(OUT, f"strip-sstar-{TAG}.csv")

def log(m=""):
    line = f"[{time.strftime('%H:%M:%S')}] {m}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")

# ---------- exact Z[zeta_24] (verbatim method from the thesis script) ----------
def zmul_by_zeta(v):
    w = [0] + list(v[:7])
    if v[7]:
        w[0] -= v[7]; w[4] += v[7]
    return tuple(w)

DIRS = []
_d = (1, 0, 0, 0, 0, 0, 0, 0)
for _ in range(24):
    DIRS.append(_d); _d = zmul_by_zeta(_d)
assert DIRS[12] == (-1, 0, 0, 0, 0, 0, 0, 0)

def zadd(a, b): return tuple(x + y for x, y in zip(a, b))
def zsub(a, b): return tuple(x - y for x, y in zip(a, b))
def zscale(a, s): return tuple(s * x for x in a)
ZERO = (0,) * 8
EMB = [complex(math.cos(2 * math.pi * i / 24), math.sin(2 * math.pi * i / 24)) for i in range(8)]
def emb(v): return sum(c * e for c, e in zip(v, EMB))
def elen(v): return abs(emb(v))

WT_CACHE = {}
EPS = 1e-7
def _dfs(v, budget, last):
    if v == ZERO: return True
    if budget == 0: return False
    if elen(v) > budget + EPS: return False
    for i in range(last, -1, -1):
        if _dfs(zsub(v, DIRS[i]), budget - 1, i):
            return True
    return False
def wt(v):
    if v == ZERO: return 0
    if v in WT_CACHE: return WT_CACHE[v]
    b = max(1, int(math.ceil(elen(v) - EPS)))
    while not _dfs(v, b, 23):
        b += 1
        if b > 400: raise RuntimeError(f"wt runaway for {v}")
    WT_CACHE[v] = b
    return b

def gauss_reduce(u, v):
    u, v = (u, v) if elen(u) <= elen(v) else (v, u)
    while True:
        eu, ev = emb(u), emb(v)
        mu = round((ev * eu.conjugate()).real / (abs(eu) ** 2))
        v2 = zsub(v, zscale(u, mu))
        if elen(v2) < elen(u) - 1e-12:
            u, v = v2, u
        else:
            return u, (v2 if elen(v2) <= elen(v) else v)

def main():
    open(LOG, "a").write(f"\n=== strip s*-scaling run {time.strftime('%Y-%m-%d %H:%M:%S')}  NMAX={NMAX} ===\n")
    with open(CSV, "w") as f:
        f.write("n,k,sStar,wtU,wtV,lenU,lenV,H\n")
    log(f"family = (square)(triangle)^n, mirror-symmetric layered word; n=1..{NMAX}")
    t0 = time.time()
    for n in range(1, NMAX + 1):
        T1 = DIRS[0]
        T2 = zadd(DIRS[6], zscale(DIRS[4], n))       # i + n*zeta^4
        u, v = gauss_reduce(T1, T2)
        tn = time.time()
        wu, wv = wt(u), wt(v)
        s = max(wu, wv)
        k = n // 2 + 1
        H = 1 + n * math.sqrt(3) / 2
        with open(CSV, "a") as f:
            f.write(f"{n},{k},{s},{wu},{wv},{elen(u):.6f},{elen(v):.6f},{H:.6f}\n")
        el = time.time() - t0
        # crude ETA: wt cost roughly doubles every ~1.5 n near the tail
        log(f"n={n:>2}  k={k:>2}  s*={s:>2}  wt=({wu},{wv})  H={H:6.3f}  s*-2k={s-2*k:+d}  "
            f"[{n}/{NMAX}  this {time.time()-tn:5.1f}s  tot {el:5.0f}s]")
    log(f"done in {time.time()-t0:.1f}s -> {CSV}")

if __name__ == "__main__":
    # sanity anchors (same as the thesis script)
    assert wt((1, 0, 0, 0, 0, 0, 0, 0)) == 1
    assert wt(zadd(DIRS[0], DIRS[2])) == 2
    assert wt((2, 0, 0, 0, -1, 0, 0, 0)) == 2       # sqrt3 vertical, wt 2
    main()
