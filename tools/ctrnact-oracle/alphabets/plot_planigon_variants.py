#!/usr/bin/env python3
"""Draw why atomising the planigon palette turns 15 tiles into 1,853.

    python3 alphabets/plot_planigon_variants.py --out ../../experiments/results/planigon-variants.pdf

The number is not 1,853 SHAPES. Every variant is one of the same fifteen planigons, drawn identically.
What differs is where the DIVISION MARKS sit along its edges — the points at which a neighbour is
allowed to start, which the solver has to know about in advance because it glues half-edge type against
half-edge type. An edge that can be cut in several places is several tiles as far as the search is
concerned, and a tile's variants are the product over its edges.

P12.12.3 is the extreme: its L7 edge has 45 ordered atomic compositions and its two L8 edges have 6
each, so 45 x 6 x 6 = 1,620 variants of one triangle.

Pages: the argument, the twelve lengths and how they cut, all 45 cuts of the worst edge, all 140
variants of P12.6.4 drawn full size, all 1,620 of P12.12.3 as a contact sheet, and the tally.
"""
import argparse
import json
import math
import os
import sys
from itertools import product

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Polygon as MplPolygon

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# p + q*sqrt2 + r*sqrt3, scaled by 6 to clear denominators, exactly as make_planigons.py writes them.
LEN = {
    "L1": (0, 0, 6), "L2": (6, 6, 0), "L3": (6, 3, 0), "L4": (6, 0, 6),
    "L5": (3, 0, 3), "L6": (9, 0, 3), "L7": (12, 0, 6), "L8": (6, 0, 4),
    "L9": (6, 0, 0), "L10": (0, 0, 4), "L11": (3, 0, 1), "L12": (0, 0, 2),
}
PRETTY = {
    "L1": "6√3", "L2": "6+6√2", "L3": "6+3√2", "L4": "6+6√3", "L5": "3+3√3",
    "L6": "9+3√3", "L7": "12+6√3", "L8": "6+4√3", "L9": "6", "L10": "4√3",
    "L11": "3+√3", "L12": "2√3",
}
val = lambda t: t[0] + t[1] * 2 ** 0.5 + t[2] * 3 ** 0.5
# One colour per ATOM, so a striped edge reads at a glance and two variants of one tile differ visibly.
ATOM_COLOR = {"L2": "#8b5cf6", "L3": "#0ea5e9", "L9": "#f59e0b", "L11": "#10b981", "L12": "#ef4444"}


def atoms():
    from itertools import combinations_with_replacement as cwr
    composite = set()
    for tgt in LEN:
        shorter = [n for n in LEN if val(LEN[n]) < val(LEN[tgt]) - 1e-9]
        for r in range(2, 7):
            for c in cwr(shorter, r):
                if tuple(sum(LEN[x][i] for x in c) for i in range(3)) == LEN[tgt]:
                    composite.add(tgt)
    return [n for n in LEN if n not in composite]


def compositions(target, atom_names):
    """Every ORDERED way to write `target` as a run of atoms."""
    out = []

    def go(rem, acc):
        if rem == (0, 0, 0):
            out.append(tuple(acc))
            return
        if rem[0] < 0 or rem[1] < 0 or rem[2] < 0:
            return
        for a in atom_names:
            go(tuple(rem[i] - LEN[a][i] for i in range(3)), acc + [a])

    go(LEN[target], [])
    return out


def outline(tile, D=24):
    """Walk the tile: |edges[i]| along the current heading, then turn by the exterior angle at the
    NEXT vertex. angles[i] sits at vertex i and edges[i] leaves it, which is the convention the
    palettes use (tri45all-split's T2 splits [6,3,3]/(H,D,H) into [6,3,12,3]/(H,S,S,H))."""
    pts, p, head = [], (0.0, 0.0), 0.0
    for i, e in enumerate(tile["edges"]):
        pts.append(p)
        L = val(LEN[e])
        p = (p[0] + L * math.cos(head), p[1] + L * math.sin(head))
        interior = tile["angles"][(i + 1) % len(tile["angles"])] * 360.0 / D
        head += math.pi - math.radians(interior)
    err = math.hypot(p[0] - pts[0][0], p[1] - pts[0][1])
    assert err < 1e-6, f"{tile['name']} does not close: {err}"
    return pts


def draw_tile(ax, pts, tile, choice, lw=2.2, dot=14, face="#f8fafc"):
    """The polygon, with each edge striped by its atomic composition and a dot at every division
    point. The OUTLINE is the same for every variant of a tile — only the stripes and dots move."""
    ax.add_patch(MplPolygon(pts, closed=True, facecolor=face, edgecolor="none", zorder=0))
    for i, seq in enumerate(choice):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        total = val(LEN[tile["edges"][i]])
        ux, uy = (b[0] - a[0]) / total, (b[1] - a[1]) / total
        run = 0.0
        for j, atom in enumerate(seq):
            L = val(LEN[atom])
            s = (a[0] + ux * run, a[1] + uy * run)
            t = (a[0] + ux * (run + L), a[1] + uy * (run + L))
            ax.plot([s[0], t[0]], [s[1], t[1]], color=ATOM_COLOR[atom], lw=lw,
                    solid_capstyle="butt", zorder=2)
            run += L
            if j < len(seq) - 1 and dot > 0:
                ax.plot([t[0]], [t[1]], marker="o", ms=dot ** 0.5, color="#111827", zorder=3)
    ax.set_aspect("equal")
    ax.axis("off")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--palette", default=os.path.join(HERE, "palettes", "planigon.json"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--full", default="P12.6.4", help="the planigon drawn full size, every variant")
    ap.add_argument("--sheet", default="P12.12.3", help="the planigon drawn as a contact sheet")
    args = ap.parse_args()

    from palette_spec import normalize_palette
    spec = normalize_palette(json.load(open(args.palette)))
    A = atoms()
    comps = {n: compositions(n, A) for n in LEN}
    tiles = {t["name"]: t for t in spec["tiles"]}
    nvar = {n: math.prod(len(comps[e]) for e in t["edges"]) for n, t in tiles.items()}
    total = sum(nvar.values())

    pdf = PdfPages(args.out)

    # ---------------------------------------------------------------- page 1: the argument
    fig = plt.figure(figsize=(11.7, 8.3))
    fig.suptitle("Fifteen planigons, 1,853 tiles", fontsize=23, y=0.955, fontweight="bold")
    fig.text(0.5, 0.898, "the same shapes, counted once per way of cutting their edges",
             ha="center", va="top", fontsize=12.5, color="#475569")
    body = (
        "A planigon's edge runs between the centroids of two regular polygons, so its length is the sum of two\n"
        "apothems, and seven of the twelve lengths that produces are themselves sums of others. Wherever that\n"
        "happens, one tile's edge can be met by TWO neighbours instead of one, and the atlas was not counting\n"
        "those tilings.\n\n"
        "Modelling it costs, because the search glues half-edge TYPE against half-edge type: it has to be told in\n"
        "advance where a neighbour may start. So every edge is cut into ATOMS, the five lengths that are not\n"
        "sums, with a division mark at each cut. An edge with several ways to be cut is several tiles as far as the\n"
        "search is concerned, and a tile's count is the product over its edges.\n\n"
        "Below: one planigon, P12.6.4, drawn three times. Same 30-60-90 triangle every time. What moves is where\n"
        "the marks fall, and that is the whole of the difference."
    )
    fig.text(0.075, 0.845, body, fontsize=11.6, va="top", linespacing=1.7, color="#1f2937")

    demo = tiles["P12.6.4"]
    pts = outline(demo)
    picks = [tuple(comps[e][0] for e in demo["edges"]),
             tuple(comps[e][min(1, len(comps[e]) - 1)] for e in demo["edges"]),
             tuple(comps[e][-1] for e in demo["edges"])]
    for i, ch in enumerate(picks):
        ax = fig.add_axes([0.065 + i * 0.305, 0.135, 0.28, 0.33])
        draw_tile(ax, pts, demo, ch, lw=3.6, dot=34)
        ax.set_title(" · ".join("|".join(s) for s in ch), fontsize=8.2, color="#334155", pad=8)
    fig.text(0.5, 0.075, "one shape, three of its 140 variants", ha="center", fontsize=11,
             style="italic", color="#64748b")
    pdf.savefig(fig); plt.close(fig)

    # ---------------------------------------------------------------- page 2: the twelve lengths
    fig = plt.figure(figsize=(11.7, 8.3))
    fig.suptitle("The twelve lengths, and how many ways each one cuts", fontsize=18, y=0.965,
                 fontweight="bold")
    fig.text(0.5, 0.918, "atoms are drawn as one solid bar: L2, L3, L9, L11, L12 are not sums of anything",
             ha="center", va="top", fontsize=11, color="#475569")
    order = sorted(LEN, key=lambda n: val(LEN[n]))
    # The bar for the longest length must stop short of the right-hand label, or L7 runs through
    # "45 ways" and the one row the page exists for is the one you cannot read.
    scale = 0.545 / max(val(LEN[n]) for n in LEN)
    for i, n in enumerate(order):
        y = 0.875 - i * 0.066
        is_atom = n in A
        fig.text(0.085, y, n, fontsize=11, fontweight="bold", va="center",
                 color="#111827" if is_atom else "#475569")
        fig.text(0.125, y, PRETTY[n], fontsize=10.5, va="center", color="#475569")
        fig.text(0.225, y, f"{val(LEN[n]):7.4f}", fontsize=9.5, va="center", color="#94a3b8",
                 family="monospace")
        ax = fig.add_axes([0.30, y - 0.017, val(LEN[n]) * scale, 0.034])
        ax.set_xlim(0, val(LEN[n])); ax.set_ylim(0, 1); ax.axis("off")
        run = 0.0
        for atom in comps[n][0]:
            L = val(LEN[atom])
            ax.add_patch(plt.Rectangle((run, 0.18), L, 0.64, facecolor=ATOM_COLOR[atom],
                                       edgecolor="white", lw=1.4))
            run += L
        c = len(comps[n])
        fig.text(0.925, y, "atom" if is_atom else (f"{c} ways" if c > 1 else "1 way"),
                 fontsize=10.5, va="center", ha="right",
                 color="#111827" if c > 7 else ("#94a3b8" if is_atom else "#475569"),
                 fontweight="bold" if c > 7 else "normal")
    fig.text(0.5, 0.055,
             "Seven lengths decompose, in 33 ways in all. L7 alone has 45 ordered atomic cuts: it is the longest\n"
             "edge on the palette, and it belongs to P12.12.3.",
             ha="center", fontsize=10.5, color="#334155", linespacing=1.6)
    pdf.savefig(fig); plt.close(fig)

    # ---------------------------------------------------------------- page 3: every cut of L7
    fig = plt.figure(figsize=(11.7, 8.3))
    fig.suptitle(f"All {len(comps['L7'])} ways to cut one edge: L7 = 12+6√3", fontsize=18, y=0.965,
                 fontweight="bold")
    fig.text(0.5, 0.918, "each row is one tile as far as the search is concerned", ha="center",
             va="top", fontsize=11, color="#475569")
    cs = sorted(comps["L7"], key=lambda s: (len(s), s))
    cols, rows = 3, math.ceil(len(cs) / 3)
    w = 0.245
    for i, seq in enumerate(cs):
        c, r = i // rows, i % rows
        y = 0.885 - r * (0.80 / rows)
        ax = fig.add_axes([0.075 + c * (w + 0.055), y - 0.011, w, 0.022])
        ax.set_xlim(0, val(LEN["L7"])); ax.set_ylim(0, 1); ax.axis("off")
        run = 0.0
        for atom in seq:
            L = val(LEN[atom])
            ax.add_patch(plt.Rectangle((run, 0.1), L, 0.8, facecolor=ATOM_COLOR[atom],
                                       edgecolor="white", lw=1.1))
            run += L
        fig.text(0.068 + c * (w + 0.055), y, f"{i + 1:2d}", fontsize=7.5, va="center", ha="right",
                 color="#94a3b8", family="monospace")
    pdf.savefig(fig); plt.close(fig)

    # ---------------------------------------------------------------- pages 4+: every variant, full size
    # A cell squarer than the tile wastes most of its area, and these tiles are FLAT — P12.12.3 is a
    # 30-30-120 triangle, more than three times as wide as it is tall, so a square cell shrinks it to a
    # smudge. Pick the column count that makes the cell match the tile's own aspect on this page.
    def grid_cols(pts_, n, box_w_in, box_h_in):
        w = max(p[0] for p in pts_) - min(p[0] for p in pts_)
        h = max(p[1] for p in pts_) - min(p[1] for p in pts_)
        return max(1, round(math.sqrt(box_w_in * n / (box_h_in * (w / h)))))

    PAGE_W, PAGE_H = 11.7, 8.3
    T = tiles[args.full]
    pts = outline(T)
    all_ch = list(product(*[comps[e] for e in T["edges"]]))
    cols = grid_cols(pts, 40, 0.91 * PAGE_W, 0.80 * PAGE_H)
    per = cols * max(1, round(40 / cols))
    pages = math.ceil(len(all_ch) / per)
    for pg in range(pages):
        chunk = all_ch[pg * per:(pg + 1) * per]
        fig = plt.figure(figsize=(PAGE_W, PAGE_H))
        fig.suptitle(f"{args.full}: all {len(all_ch)} variants" + (f"   {pg + 1} of {pages}" if pages > 1 else ""),
                     fontsize=19, y=0.962, fontweight="bold")
        fig.text(0.5, 0.912,
                 "edges " + " · ".join(f"{e} ({len(comps[e])} cuts)" for e in T["edges"])
                 + f"  =  {len(all_ch)} tiles, one shape", ha="center", va="top", fontsize=10.5,
                 color="#475569")
        rws = math.ceil(len(chunk) / cols)
        W, H = 0.91 / cols, 0.845 / rws
        for i, ch in enumerate(chunk):
            r, c = i // cols, i % cols
            ax = fig.add_axes([0.045 + c * W, 0.870 - (r + 1) * H, W * 0.90, H * 0.78])
            draw_tile(ax, pts, T, ch, lw=1.6, dot=8)
            ax.text(0.0, -0.08, str(pg * per + i + 1), transform=ax.transAxes, fontsize=5.5,
                    color="#cbd5e1", ha="left", va="top")
        pdf.savefig(fig); plt.close(fig)

    # ---------------------------------------------------------------- the contact sheet
    S = tiles[args.sheet]
    spts = outline(S)
    s_all = list(product(*[comps[e] for e in S["edges"]]))
    fig = plt.figure(figsize=(PAGE_W, PAGE_H))
    fig.suptitle(f"{args.sheet}: all {len(s_all):,} variants of one triangle", fontsize=19, y=0.966,
                 fontweight="bold")
    fig.text(0.5, 0.920, va="top",
             s="edges " + " · ".join(f"{e} ({len(comps[e])})" for e in S["edges"])
             + f"  =  {len(s_all):,}.  Every one is the same 30-30-120 triangle. This is not a palette; it is "
               "why the run does not finish.",
             ha="center", fontsize=9.8, color="#475569")
    cols = grid_cols(spts, len(s_all), 0.92 * PAGE_W, 0.85 * PAGE_H)
    rws = math.ceil(len(s_all) / cols)
    W, H = 0.92 / cols, 0.855 / rws
    # No division dots at this size: they would merge into the stripes and read as noise. The STRIPES
    # are what differs between variants, so they are what the sheet has to show.
    for i, ch in enumerate(s_all):
        r, c = i // cols, i % cols
        ax = fig.add_axes([0.04 + c * W, 0.888 - (r + 1) * H, W * 0.92, H * 0.88])
        draw_tile(ax, spts, S, ch, lw=0.8, dot=0.0, face="#f1f5f9")
    pdf.savefig(fig, dpi=400); plt.close(fig)

    # ---------------------------------------------------------------- the tally
    fig = plt.figure(figsize=(11.7, 8.3))
    fig.suptitle("The whole palette", fontsize=18, y=0.965, fontweight="bold")
    fig.text(0.5, 0.918, "one row per planigon: its edges, the cuts each edge allows, and the product",
             ha="center", va="top", fontsize=11, color="#475569")
    hdr = 0.868
    step = 0.0345
    for lbl, x, ha in [("planigon", 0.09, "left"), ("edges", 0.30, "left"),
                       ("cuts per edge", 0.60, "left"), ("variants", 0.915, "right")]:
        fig.text(x, hdr, lbl, fontsize=10, fontweight="bold", ha=ha, color="#111827")
    fig.add_artist(plt.Line2D([0.085, 0.92], [hdr - 0.015, hdr - 0.015], color="#cbd5e1", lw=1))
    for i, (n, t) in enumerate(sorted(tiles.items(), key=lambda kv: -nvar[kv[0]])):
        y = hdr - 0.042 - i * step
        big = nvar[n] > 8
        col = "#111827" if big else "#64748b"
        fig.text(0.09, y, n, fontsize=10, va="center", color=col,
                 fontweight="bold" if big else "normal")
        fig.text(0.30, y, " ".join(t["edges"]), fontsize=9.5, va="center", color="#475569",
                 family="monospace")
        fig.text(0.60, y, " × ".join(str(len(comps[e])) for e in t["edges"]), fontsize=9.5,
                 va="center", color="#475569", family="monospace")
        fig.text(0.915, y, f"{nvar[n]:,}", fontsize=10, va="center", ha="right", color=col,
                 fontweight="bold" if big else "normal", family="monospace")
    yb = hdr - 0.042 - 15 * step
    fig.add_artist(plt.Line2D([0.085, 0.92], [yb + 0.016, yb + 0.016], color="#cbd5e1", lw=1))
    fig.text(0.09, yb - 0.010, "total", fontsize=11, fontweight="bold", va="center")
    fig.text(0.915, yb - 0.010, f"{total:,}", fontsize=13.5, fontweight="bold", va="center",
             ha="right", family="monospace")
    fig.text(0.09, yb - 0.055,
             "Nine planigons cost nothing: their edges are atoms already, or have exactly one atomic cut. All four\n"
             "expensive ones touch a DODECAGON, whose apothem is the long one, so the P12.* tiles carry the long\n"
             "edges and a long edge has the most ways to be cut.\n\n"
             "The bounded run that was measured keeps the eleven cheap planigons, 15 variants in all, and drops the\n"
             "four P12.* tiles. On those eleven it finds 36 tilings at k=1 where matching every edge whole finds 6,\n"
             "and 195 at k=2 where whole edges find 27. Shipping it would mean a planigon shelf missing a fifth of\n"
             "its tiles, so it was not shipped.",
             fontsize=10.4, va="top", linespacing=1.62, color="#334155")
    pdf.savefig(fig); plt.close(fig)

    pdf.close()
    print(f"[plot] {total:,} variants over {len(tiles)} planigons -> {args.out}")
    for n, t in sorted(tiles.items(), key=lambda kv: -nvar[kv[0]])[:6]:
        print(f"[plot]   {n:12s} {' '.join(t['edges']):24s} "
              f"{' x '.join(str(len(comps[e])) for e in t['edges']):16s} = {nvar[n]:,}")


if __name__ == "__main__":
    main()
