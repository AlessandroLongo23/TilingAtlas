#!/usr/bin/env python3
"""Test Fable's canonical form N on the real TilingAtlas oracle catalogue.

Bridges the repo cell format (Z[zeta24], rank-8 numerators, faces as {anchor,dir,n})
to N's expected input (Z[zeta12], rank-4, seed vertices), then checks:

  1. end-to-end anchors: square / triangular / honeycomb map to Fable's hand-derived N
  2. no false merge: the K distinct catalogue tilings get K distinct N (per k, vs 11/20/61)
  3. partition agreement with the repo's own canonicalKey
  4. no false split: N is invariant under scrambles + sublattice re-encodings of real cells
  5. timing: N vs the 24n brute-force baseline on the same inputs
"""
import json, sys, os, time, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
import canonical_form as cf   # noqa  (runs its own self-tests on import)

CAT = os.path.join(REPO, "figures", "data", "catalogue-k1-3.json")

# ---------- Z[zeta24] rank-8 arithmetic, min poly z^8 = z^4 - 1 ----------
def mul24(c):
    c7 = c[7]
    return (-c7, c[0], c[1], c[2], c[3] + c7, c[4], c[5], c[6])

U24 = []
_z = (1, 0, 0, 0, 0, 0, 0, 0)
for _ in range(24):
    U24.append(_z); _z = mul24(_z)
assert U24[12] == (-1, 0, 0, 0, 0, 0, 0, 0), U24[12]
assert mul24(U24[23]) == U24[0]

def add8(a, b): return tuple(x + y for x, y in zip(a, b))

def proj12(v8):
    """Z[zeta24] -> Z[zeta12]=Z[omega] (omega=zeta24^2): even positions; odd must vanish."""
    if v8[1] or v8[3] or v8[5] or v8[7]:
        return None
    return (v8[0], v8[2], v8[4], v8[6])

def enc8(enc):
    if enc["d"] != "1":
        raise ValueError("non-unit denominator " + enc["d"])
    return tuple(int(x) for x in enc["n"])

def trace_poly(a8, d, n):
    turn = 24 // n
    p, dir_, out = a8, d % 24, []
    for _ in range(n):
        out.append(p)
        p = add8(p, U24[dir_])
        dir_ = (dir_ + turn) % 24
    return out

def cell_to_symbol(cell):
    """Return an N-symbol in Z[omega], or None if the tiling needs true zeta24 (octagon)."""
    t1 = proj12(enc8(cell["basis"][0]))
    t2 = proj12(enc8(cell["basis"][1]))
    if t1 is None or t2 is None:
        return None
    verts8 = []
    for pl in cell["polys"]:
        if pl["n"] == 8:
            return None
        verts8 += trace_poly(enc8(pl["a"]), int(pl["d"]), int(pl["n"]))
    verts = []
    for v8 in verts8:
        v = proj12(v8)
        if v is None:
            return None
        verts.append(v)
    H = cf.hnf([t1, t2])
    if len(H) != 2:
        return None
    o = verts[0]
    seeds = sorted(set(cf.rep(cf.sub(v, o), H) for v in verts))
    return [t1, t2] + seeds

def Nform(sym):
    return tuple(map(tuple, cf.canonical(sym)))

# 24n brute-force baseline (same as attack_math.baseline) for a fair timing comparison
def baseline(sym):
    rows = [tuple(r) for r in sym]
    H = cf.hnf(rows[:2])
    S = sorted(set(cf.rep(s, H) for s in rows[2:]))
    H, S = cf.maximize(H, S)          # same Stage A, else it is not even a fair comparison
    best = None
    for g in cf.G24:
        Hg = cf.hnf([cf.apply_g(g, H[0]), cf.apply_g(g, H[1])])
        for o in S:
            C = tuple(Hg) + tuple(sorted(cf.rep(cf.apply_g(g, cf.sub(s, o)), Hg) for s in S))
            if best is None or C < best:
                best = C
    return best

def all_n(cell, n):
    return all(int(p["n"]) == n for p in cell["polys"])

# ---------------------------------------------------------------- run
print("\n================ N on the real TilingAtlas catalogue ================\n")
data = json.load(open(CAT))
targets = {int(k): v for k, v in data["counts"].items()}
tilings = data["tilings"]
print(f"catalogue: {len(tilings)} certified tilings, targets {targets}")

byk = {}
octagon = []
fail = []
anchors = {}
for t in tilings:
    k, ck, cell = t["k"], t["canonicalKey"], t["cellCodec"]
    try:
        sym = cell_to_symbol(cell)
    except Exception as e:
        fail.append((k, repr(e))); continue
    if sym is None:
        octagon.append((k, ck)); continue
    try:
        nf = Nform(sym)
    except Exception as e:
        fail.append((k, ck[:40], repr(e))); continue
    byk.setdefault(k, []).append((ck, nf, sym))
    if k == 1 and all_n(cell, 4): anchors["square"] = nf
    if k == 1 and all_n(cell, 3): anchors["triangular"] = nf
    if k == 1 and all_n(cell, 6): anchors["honeycomb"] = nf

# 1. anchors vs Fable's independently hand-derived forms
print("\n-- 1. end-to-end anchors (repo cell -> N vs Fable's hand-derived matrix) --")
EXPECT = {
    "square":     ((0, 1, 0, -1), (0, 0, 1, 0), (0, 0, 0, 0)),
    "triangular": ((0, 1, 0, 0), (0, 0, 0, 1), (0, 0, 0, 0)),
    "honeycomb":  ((0, 1, 0, 1), (0, 0, 0, 3), (0, 0, 0, 0), (0, 0, 0, 1)),
}
anchors_ok = True
for name, exp in EXPECT.items():
    got = anchors.get(name)
    ok = got == exp
    anchors_ok &= ok
    print(f"   {name:11s}: {'OK' if ok else 'MISMATCH'}  N={got}")

# 2 + 3. per-k distinctness (no false merge) and partition vs canonicalKey
print("\n-- 2/3. distinct N per k (no false merge) + agreement with repo canonicalKey --")
merge_ok = True
for k in sorted(byk):
    entries = byk[k]
    nfs = [nf for _, nf, _ in entries]
    cks = [ck for ck, _, _ in entries]
    distinct_N = len(set(nfs))
    distinct_ck = len(set(cks))
    fed = len(entries)
    # partition agreement: canonicalKey <-> N must be a bijection on this set
    ck2n = {}; bij = True
    for ck, nf, _ in entries:
        if ck in ck2n and ck2n[ck] != nf: bij = False
        ck2n[ck] = nf
    if len(set(ck2n.values())) != len(ck2n): bij = False
    ok = distinct_N == fed
    merge_ok &= ok and bij
    oct_here = sum(1 for kk, _ in octagon if kk == k)
    print(f"   k={k}: target {targets[k]:3d} | fed {fed:3d} (+{oct_here} octagon skipped) "
          f"| distinct N {distinct_N:3d} | {'no merges' if ok else 'FALSE MERGE'} "
          f"| partition {'== canonicalKey' if bij else 'DIFFERS'}")

# 4. no false split: scramble + sublattice re-encodings of real cells
print("\n-- 4. invariance under re-encoding of real cells (no false split) --")
rng = random.Random(2026)
split_bad = 0
checked = 0
for k in sorted(byk):
    for ck, nf, sym in byk[k]:
        for _ in range(15):
            if Nform(cf.scramble(sym, rng)) != nf: split_bad += 1
            checked += 1
        for mm in [[[1, 0], [0, 2]], [[2, 1], [0, 3]], [[1, 1], [-1, 1]]]:
            if Nform(cf.refine(sym, mm)) != nf: split_bad += 1
            checked += 1
print(f"   {checked} re-encodings across all {sum(len(v) for v in byk.values())} tilings: "
      f"{'ALL invariant' if split_bad == 0 else str(split_bad) + ' FAILURES'}")

# 5. timing N vs baseline
print("\n-- 5. timing: N vs 24n brute-force baseline (same Stage A) --")
syms = [sym for k in byk for _, _, sym in byk[k]]
# agreement first
mism = sum(1 for s in syms if Nform(s) != tuple(map(tuple, baseline(s))))
t0 = time.perf_counter()
for s in syms: Nform(s)
tN = time.perf_counter() - t0
t0 = time.perf_counter()
for s in syms: baseline(s)
tB = time.perf_counter() - t0
print(f"   {len(syms)} tilings | N {tN*1e3:7.1f} ms ({tN/len(syms)*1e6:5.0f} us/tiling) "
      f"| baseline {tB*1e3:7.1f} ms ({tB/len(syms)*1e6:5.0f} us/tiling) "
      f"| speedup x{tB/tN:.2f}")
print(f"   N and baseline induce the same partition: {'YES' if mism == 0 else 'NO ('+str(mism)+' differ)'}")

print("\n================ verdict ================")
print(f"anchors correct ......... {anchors_ok}")
print(f"no false merges ......... {merge_ok}")
print(f"no false splits ......... {split_bad == 0}")
print(f"octagon tilings skipped . {len(octagon)}  (expected: 1, the k=1 4.8.8)")
print(f"reconstruction failures . {len(fail)}  {fail if fail else ''}")
