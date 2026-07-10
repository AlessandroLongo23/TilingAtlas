#!/usr/bin/env python3
"""
EXTENDED weight-tightness figure — k=1..8.

Drop-in extension of thesis/figures/charts/weight-tightness.py. Same exact
Z[zeta_24] arithmetic, same wt() (iterative-deepening, metric prune) and
s_star() (minors-gcd generation test), VERBATIM from the thesis script, so the
k=7,8 numbers are computed by the identical method as k<=6. The only additions:

  - load_ctrnact(): the Ctrnact reproduction (figures/data/ctrnact.json), k in
    {7,8}, T1/T2 in the same zeta_12 [a,b,c,d] basis as galebach (embedded via
    zeta_12 = zeta_24^2). Uncertified reference, exactly like galebach k=4..6.
  - the k<=6 rows are SEEDED from the thesis's own weight-tightness.csv (copied
    to experiments/results/thesis-figs/weight-tightness-k1-8.csv) so those points
    are byte-identical to the thesis figure; only k=7,8 are computed here.
  - figure(): two panels answering AL's two bounds directly —
      LEFT  (w bound):     s*(Lambda) vs k, with 2k+2 (the REFUTED conjecture),
                           2k+4 (the honest measured bound), and 24k-1 (proven).
      RIGHT (w/v ratio):   max(wt(u)/|u|, wt(v)/|v|) vs k, against sqrt(2).

Run:  python3 scripts/weight-tightness-ext.py            (compute k=7,8 + plot)
      python3 scripts/weight-tightness-ext.py --plot     (plot only, from CSV)
Logs synchronously to experiments/results/thesis-figs/weight-tightness-ext.log.
"""
import json, math, os, sys, time, csv
from math import gcd

_D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(_D, ".."))          # TilingAtlas root
OUT = os.path.join(ROOT, "experiments", "results", "thesis-figs")
CSV = os.path.join(OUT, "weight-tightness-k1-8.csv")     # seeded with thesis k<=6
PDF = os.path.join(OUT, "weight-tightness-ext.pdf")
PNG = os.path.join(OUT, "weight-tightness-ext.png")
LOG = os.path.join(OUT, "weight-tightness-ext.log")

def log(m=""):
    with open(LOG, "a") as f:
        f.write(m + "\n")
    print(m, flush=True)

# ---------- exact Z[zeta_24] (verbatim from thesis) ----------
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
        if b > 200: raise RuntimeError(f"wt runaway for {v}")
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
            return u, v2 if elen(v2) <= elen(v) else v

def s_star(u, v):
    u, v = gauss_reduce(u, v)
    wu, wv = wt(u), wt(v)
    s_hi = max(wu, wv)
    eu, ev = emb(u), emb(v)
    det = (eu.conjugate() * ev).imag
    cand = []
    amax = int(math.ceil(s_hi * abs(ev) / abs(det))) + 1
    bmax = int(math.ceil(s_hi * abs(eu) / abs(det))) + 1
    for a in range(-amax, amax + 1):
        for b in range(-bmax, bmax + 1):
            if (a, b) != (0, 0):
                w = zadd(zscale(u, a), zscale(v, b))
                if elen(w) <= s_hi + EPS:
                    cand.append((elen(w), a, b, w))
    cand.sort()
    for s in range(1, s_hi + 1):
        coords = [(a, b) for (L, a, b, w) in cand if L <= s + EPS and wt(w) <= s]
        g = 0
        for i in range(len(coords)):
            for j in range(i + 1, len(coords)):
                g = gcd(g, abs(coords[i][0] * coords[j][1] - coords[i][1] * coords[j][0]))
                if g == 1: break
            if g == 1: break
        if g == 1:
            return s, wu, wv, elen(u), elen(v)
    return s_hi, wu, wv, elen(u), elen(v)

# ---------- ctrnact loader (k=7,8) ----------
def load_ctrnact():
    d = json.load(open(os.path.join(ROOT, "figures", "data", "ctrnact.json")))
    out = []
    for t in d["tilings"]:
        if t["k"] not in (7, 8): continue
        t1, t2 = t.get("T1"), t.get("T2")
        if not t1 or not t2: continue
        T1 = (t1[0], 0, t1[1], 0, t1[2], 0, t1[3], 0)   # zeta_12 -> zeta_24^2
        T2 = (t2[0], 0, t2[1], 0, t2[2], 0, t2[3], 0)
        if abs((emb(T1).conjugate() * emb(T2)).imag) < 1e-9: continue
        out.append(dict(id=t["id"], k=t["k"], T1=T1, T2=T2, src="ctrnact"))
    return out

def compute():
    done = set()
    with open(CSV) as f:
        for r in csv.DictReader(f):
            done.add((r["src"], r["id"]))
    items = [t for t in load_ctrnact() if (t["src"], str(t["id"])) not in done]
    log(f"[compute] {len(items)} ctrnact k=7,8 rows to do (already have {len(done)})")
    t0 = time.time()
    for idx, t in enumerate(items):
        s, wu, wv, lu, lv = s_star(t["T1"], t["T2"])
        with open(CSV, "a") as f:
            f.write(f"{t['src']},{t['id']},{t['k']},{s},{wu},{wv},{lu:.6f},{lv:.6f}\n")
        if (idx + 1) % 50 == 0 or idx + 1 == len(items):
            el = time.time() - t0
            eta = el / (idx + 1) * (len(items) - idx - 1)
            log(f"[compute] {idx+1}/{len(items)}  {el:.0f}s elapsed  ETA {eta:.0f}s")
    log(f"[compute] done: {len(items)} rows in {time.time()-t0:.1f}s")

# ---------- figure ----------
def figure():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import random
    rows = list(csv.DictReader(open(CSV)))
    # source per k: certified (k<=3), oracle (4..6), ctrnact (7,8)
    use = [r for r in rows if (r["src"] == "certified") == (int(r["k"]) <= 3)]
    ks = list(range(1, 9))
    plt.rcParams.update({"font.family": "serif", "mathtext.fontset": "cm",
                         "font.size": 8.5, "axes.linewidth": 0.6})
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.2, 2.7), constrained_layout=True)
    CB, CO, CC, RED = "#1f4e79", "#9aa5ad", "#b5651d", "#c0392b"
    random.seed(1)
    for ax in (ax1, ax2):
        ax.set_xlabel("$k$"); ax.set_xticks(ks); ax.tick_params(length=2.5)

    # ---- LEFT: w bound ----
    ax1.set_yscale("log")
    for r in use:
        k, s = int(r["k"]), int(r["sStar"])
        ct = r["src"] == "ctrnact"; cert = r["src"] == "certified"
        col = CC if ct else (CB if cert else CO)
        ax1.plot(k + random.uniform(-0.17, 0.17), s, "o", ms=2.5 if ct else 2.2,
                 mfc=col if (cert or ct) else "none", mec=col, mew=0.5,
                 alpha=0.8 if ct else 0.65, zorder=3)
    mx = {k: max(int(r["sStar"]) for r in use if int(r["k"]) == k) for k in ks}
    ax1.plot(ks, [24 * k - 1 for k in ks], "k--", lw=0.9, alpha=0.7, zorder=2)
    ax1.plot(ks, [2 * k + 4 for k in ks], "-", color=CB, lw=1.1, zorder=2)
    ax1.plot(ks, [2 * k + 2 for k in ks], ":", color=RED, lw=1.2, zorder=2)
    ax1.plot(ks, [mx[k] for k in ks], "o", color=CC, ms=3.2, mfc="none", mew=1.0, zorder=4)
    ax1.text(8.05, 24 * 8 - 1, r"$24k-1$ (proven)", ha="right", va="bottom", fontsize=7.2)
    ax1.text(8.05, 2 * 8 + 4.8, r"$2k+4$ (holds)", ha="right", va="bottom", fontsize=7.2, color=CB)
    ax1.text(8.05, 2 * 8 + 2 - 1.0, r"$2k+2$ (refuted)", ha="right", va="top", fontsize=7.2, color=RED)
    ax1.set_ylabel(r"$s^{*}(\Lambda)$"); ax1.set_ylim(3, 260)
    ax1.set_title("generator weight required", fontsize=8.5)

    # ---- RIGHT: w/v ratio ----
    for r in use:
        k = int(r["k"])
        ratio = max(int(r["wtU"]) / float(r["lenU"]), int(r["wtV"]) / float(r["lenV"]))
        ct = r["src"] == "ctrnact"; cert = r["src"] == "certified"
        col = CC if ct else (CB if cert else CO)
        ax2.plot(k + random.uniform(-0.17, 0.17), ratio, "o", ms=2.5 if ct else 2.2,
                 mfc=col if (cert or ct) else "none", mec=col, mew=0.5,
                 alpha=0.8 if ct else 0.65, zorder=3)
    mr = {k: max(max(int(r["wtU"]) / float(r["lenU"]), int(r["wtV"]) / float(r["lenV"]))
                 for r in use if int(r["k"]) == k) for k in ks}
    ax2.plot(ks, [mr[k] for k in ks], "o", color=CC, ms=3.2, mfc="none", mew=1.0, zorder=4)
    ax2.axhline(math.sqrt(2), color="k", ls="--", lw=0.9, alpha=0.7)
    ax2.axhline(2 / math.sqrt(3), color=CO, ls=":", lw=0.9)
    ax2.text(8.05, math.sqrt(2) + 0.006, r"$\sqrt{2}$ (sound threshold)", ha="right", va="bottom", fontsize=7.2)
    ax2.text(1.0, 2 / math.sqrt(3) - 0.02, r"$2/\sqrt{3}$", ha="left", va="top", fontsize=7.2, color=CO)
    ax2.set_ylabel(r"$\max(\mathrm{wt}(u)/|u|,\ \mathrm{wt}(v)/|v|)$", fontsize=7.6)
    ax2.set_ylim(0.98, 1.46)
    ax2.set_title("reduced-basis efficiency (w/v)", fontsize=8.5)

    fig.savefig(PDF); fig.savefig(PNG, dpi=170)
    log(f"[figure] max s* per k: {mx}")
    log(f"[figure] max ratio per k: " + ", ".join(f'{k}:{mr[k]:.4f}' for k in ks))
    log(f"[figure] 2k+2 violated at k in " + str([k for k in ks if mx[k] > 2*k+2]))
    log(f"[figure] -> {PDF}  and  {PNG}")

if __name__ == "__main__":
    open(LOG, "a").write(f"\n=== run {time.strftime('%Y-%m-%d %H:%M:%S')} ===\n")
    if "--plot" not in sys.argv:
        compute()
    figure()
