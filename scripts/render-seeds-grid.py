#!/usr/bin/env python3
"""Render the k=3 seed dump as a multi-page PDF grid at FIXED scale (same pt/unit for every
seed on every page). Usage: python3 scripts/render-seeds-grid.py [in.json] [out.pdf] [pages]"""
import json, math, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPoly
from matplotlib.collections import PatchCollection
from matplotlib.backends.backend_pdf import PdfPages

src = sys.argv[1] if len(sys.argv) > 1 else ".scout-cache/seeds-k3.json"
dst = sys.argv[2] if len(sys.argv) > 2 else "experiments/results/seeds-k3-grid-2026-07-10.pdf"
pages = int(sys.argv[3]) if len(sys.argv) > 3 else 3
seeds = json.load(open(src))
n = len(seeds)

FILL = {3: "#f2a6a6", 4: "#a6c8f0", 6: "#a9dcb6", 12: "#f0dc9e"}
UNIT = 0.28  # inches per world unit — the fixed-scale knob (2x the old poster)

# fixed scale: max half-extent about each seed's bbox centre, over ALL seeds
half = 0.0
for s in seeds:
    xs = [x for p in s["polys"] for x, _ in p["pts"]]
    ys = [y for p in s["polys"] for _, y in p["pts"]]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    s["c"] = (cx, cy)
    half = max(half, max(xs) - cx, cx - min(xs), max(ys) - cy, cy - min(ys))
cell = 2 * half * 1.06  # same world-units cell everywhere => fixed scale

per_page = math.ceil(n / pages)
cols = math.ceil(math.sqrt(per_page))
rows = math.ceil(per_page / cols)
labh = 0.30 / UNIT  # label strip per cell, world units
roww = cell
rowh = cell + labh
fw, fh = cols * roww * UNIT, rows * rowh * UNIT

with PdfPages(dst) as pdf:
    for pg in range(pages):
        chunk = seeds[pg * per_page:(pg + 1) * per_page]
        if not chunk:
            break
        fig = plt.figure(figsize=(fw, fh))
        ax = fig.add_axes([0, 0, 1, 1])
        ax.set_xlim(0, cols * roww)
        ax.set_ylim(0, rows * rowh)
        ax.set_aspect("equal")
        ax.axis("off")
        patches, colors = [], []
        for idx, s in enumerate(chunk):
            r, c = divmod(idx, cols)
            ox = c * roww + roww / 2 - s["c"][0]
            oy = (rows - 1 - r) * rowh + labh + cell / 2 - s["c"][1]
            for p in s["polys"]:
                patches.append(MplPoly([(x + ox, y + oy) for x, y in p["pts"]], closed=True))
                colors.append(FILL.get(p["n"], "#cccccc"))
            ax.text(c * roww + roww / 2, (rows - 1 - r) * rowh + labh * 0.35,
                    f'[{s["i"]}] {s["name"]}', ha="center", va="center",
                    fontsize=5.2, family="monospace")
        ax.add_collection(PatchCollection(patches, facecolor=colors, edgecolor="black", linewidth=0.35))
        pdf.savefig(fig)
        plt.close(fig)

print(f"wrote {dst}: {n} seeds over {pages} pages, {cols}x{rows} grid/page, "
      f"page {fw:.1f}x{fh:.1f} in, fixed scale {UNIT} in/unit")
