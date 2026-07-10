#!/usr/bin/env python3
"""
Max reduced-basis WEIGHT vs k, split two ways: by 2D Bravais lattice shape (5 lines) and by wallpaper
group (up to 17 lines). Reveals which lattice/symmetry families drive the weight growth (spoiler: the
striped rectangular family). Reads:
  - experiments/results/ctrnact-symclass-k1-10.csv   (id,k,lattice,group,orbifold)
  - experiments/results/ctrnact-weights-2026-07-08.csv (k<=8 exact) + ctrnact-weights-k9.csv,-k10.csv
Weight per tiling = max(wt_u, wt_v). Writes two PNGs to experiments/results/thesis-figs/.
  python3 scripts/ctrnact-family-trends.py
"""
import csv, os, math
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import cm

_D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(_D, ".."))
RES = os.path.join(ROOT, "experiments", "results")
OUT = os.path.join(RES, "thesis-figs")
os.makedirs(OUT, exist_ok=True)

# Extended catalogues (grow as higher k are classified); k range is auto-detected from the data.
SYMCSV = "ctrnact-symclass-k1-16.csv"
WTCSV = "ctrnact-weights-exact-k1-16.csv"

# ---- load classification: id -> (lattice, group) ----
cls = {}
with open(os.path.join(RES, SYMCSV)) as f:
    for r in csv.DictReader(f):
        cls[r["id"]] = (r["lattice"], r["group"], int(r["k"]))

# ---- load weights: id -> exact reduced-basis weight (F-formula, validated vs known maxima) ----
wt = {}
with open(os.path.join(RES, WTCSV)) as f:
    for r in csv.DictReader(f):
        wt[r["id"]] = int(r["weight"])

# ---- join + aggregate max weight per (k, lattice) and per (k, group) ----
KMAX = max(k for _, _, k in cls.values())
ks = list(range(1, KMAX + 1))
lat_max = {}   # (k, lattice) -> max weight
grp_max = {}   # (k, group) -> max weight
lat_seen, grp_seen = set(), set()
missing = 0
for tid, (lat, grp, k) in cls.items():
    w = wt.get(tid)
    if w is None:
        missing += 1; continue
    lat_max[(k, lat)] = max(lat_max.get((k, lat), 0), w)
    grp_max[(k, grp)] = max(grp_max.get((k, grp), 0), w)
    lat_seen.add(lat); grp_seen.add(grp)
print(f"joined; {missing} tilings missing a weight")

plt.rcParams.update({"font.family": "serif", "mathtext.fontset": "cm", "font.size": 9, "axes.linewidth": 0.6})

# Proven weight ceiling W ≤ 2k + 2⌊(k−1)/3⌋ (docs/WEIGHT_CEILING_PROOF.md, Thm A/B — the width-2 pgg
# maximum). Replaces the old empirical 2k+c parallel guides: this single line is a theorem, not a fit.
# It is the GLOBAL max and exactly ATTAINED for k≥4 (enumeration: max = ceiling at every k=4..16, never
# exceeded); at k≤3 small high-symmetry (rigid-lattice) cells sit above it before tube economy takes over,
# so the line is drawn only where it is the envelope (KCEIL..KMAX).
KCEIL = 4
def ceiling(k):
    return 2 * k + 2 * ((k - 1) // 3)

def reflines(ax):
    kk = [k for k in ks if k >= KCEIL]
    # drawn ON TOP (high zorder) with white halo: it coincides with the empirical envelope for k≥4, so the
    # black dashes tracing exactly over the top data line ARE the result (proven bound = observed maximum).
    ax.plot(kk, [ceiling(k) for k in kk], color="white", lw=3.2, alpha=0.9, zorder=5, solid_capstyle="round")
    ax.plot(kk, [ceiling(k) for k in kk], "--", color="#111", lw=1.6, alpha=1.0, zorder=6, dashes=(3, 2))
    kx = kk[-1]
    ax.text(kx, ceiling(kx) + 0.5, r"proven ceiling  $W\leq 2k+2\lfloor(k-1)/3\rfloor$  (attained $k\geq4$)",
            fontsize=6.5, color="#111", va="bottom", ha="right", zorder=7)

# ===== Chart 1: by lattice shape (5 lines) =====
LAT_ORDER = ["square", "rectangular", "rhombic", "hexagonal", "oblique"]
LAT_COL = {"square": "#1f77b4", "rectangular": "#d62728", "rhombic": "#ff7f0e", "hexagonal": "#2ca02c", "oblique": "#9467bd"}
fig, ax = plt.subplots(figsize=(6.2, 3.6), constrained_layout=True)
reflines(ax)
for lat in LAT_ORDER:
    if lat not in lat_seen: continue
    xs = [k for k in ks if (k, lat) in lat_max]
    ys = [lat_max[(k, lat)] for k in xs]
    ax.plot(xs, ys, "o-", color=LAT_COL[lat], ms=4, lw=1.5, label=lat)
ax.set_xlabel("$k$"); ax.set_ylabel("max reduced-basis weight  $\\max(\\mathrm{wt}(u),\\mathrm{wt}(v))$")
ax.set_xticks(ks); ax.set_title("Weight growth by Bravais lattice shape", fontsize=10)
ax.legend(title="lattice", fontsize=8, title_fontsize=8, loc="upper left")
ax.set_xlim(0.8, KMAX + 0.9)
fig.savefig(os.path.join(OUT, "ctrnact-weight-by-lattice.png"), dpi=170)
print("→ ctrnact-weight-by-lattice.png")

# ===== Chart 2: by wallpaper group (up to 17 lines) =====
grps = sorted(grp_seen)
cmap = cm.get_cmap("tab20", max(len(grps), 1))
fig, ax = plt.subplots(figsize=(7.4, 4.2), constrained_layout=True)
reflines(ax)
for i, g in enumerate(grps):
    xs = [k for k in ks if (k, g) in grp_max]
    ys = [grp_max[(k, g)] for k in xs]
    # highlight the group(s) that reach the proven ceiling with a thicker line
    top = max(ys) if ys else 0
    lw = 2.2 if top >= ceiling(max(xs)) else 1.0
    ax.plot(xs, ys, "o-", color=cmap(i), ms=3.5, lw=lw, label=g, alpha=0.9)
ax.set_xlabel("$k$"); ax.set_ylabel("max reduced-basis weight")
ax.set_xticks(ks); ax.set_title("Weight growth by wallpaper group", fontsize=10)
ax.legend(title="group", fontsize=7, title_fontsize=8, ncol=2, loc="upper left")
ax.set_xlim(0.8, KMAX + 0.9)
fig.savefig(os.path.join(OUT, "ctrnact-weight-by-group.png"), dpi=170)
print("→ ctrnact-weight-by-group.png")

# ---- text summary: which family holds the max at each k ----
print("\nper-k overall max weight and the lattice/group holding it:")
for k in ks:
    lm = {lat: lat_max[(k, lat)] for lat in lat_seen if (k, lat) in lat_max}
    gm = {g: grp_max[(k, g)] for g in grp_seen if (k, g) in grp_max}
    if not lm: continue
    bl = max(lm, key=lm.get); bg = max(gm, key=gm.get)
    print(f"  k={k:2d}: maxwt={lm[bl]:2d}  lattice={bl:12s} group={bg}")
