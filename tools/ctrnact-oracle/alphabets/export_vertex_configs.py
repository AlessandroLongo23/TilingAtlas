#!/usr/bin/env python3
"""Export the VERTEX-CONFIGURATION alphabet of a palette, as renderable geometry, for the web app's
/configs page. Each config is one locally-valid vertex figure (a cyclic word of corner classes whose
interior angles sum to 360 exactly — enum_configs, the SAME set the solver consumes). Here we PLACE the
actual tiles around the vertex so the page can draw them fanned around a point: overlaps (tiles whose
bodies collide away from the vertex) become visible, which is the whole point of the page.

These are the ALPHABET, not tilings: angle-closure + the proven point-adjacency lemma make each figure
locally valid, but global realizability is decided later by the solver. The count is large because it is
a candidate vocabulary, not a list of tilings.

  python3 export_vertex_configs.py                    # emit JSON for all four tractable palettes
  python3 export_vertex_configs.py --sanity regular   # render a PNG of the first configs to eyeball geometry
"""
import argparse
import json
import math
import os

import gen_alphabet as ga
from shapely.geometry import Polygon as ShPoly

# A config is OVERLAP-FREE iff no two of its placed tiles share positive area. Convex tiles (regular +
# convex isotoxal) are always contained in their own corner wedge, so overlaps only ever come from a star
# whose body balloons past its narrow point-wedge into a neighbour. Adjacent tiles share an edge (zero-area
# intersection) and non-adjacent tiles touch only at the vertex (a point) — both fine; a genuine body
# collision has area > 0. Float geometry, display-grade (the solver does the exact realizability check).
_AREA_EPS = 1e-6


def config_has_overlap(polys):
    shs = []
    for p in polys:
        poly = ShPoly(p["verts"])
        if not poly.is_valid:
            poly = poly.buffer(0)
        shs.append(poly)
    for i in range(len(shs)):
        for j in range(i + 1, len(shs)):
            if shs[i].intersection(shs[j]).area > _AREA_EPS:
                return True
    return False

HERE = os.path.dirname(__file__)
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "..", "public", "vertex-configs"))

# palette file -> the ones shown on /configs. Every palette is PRUNED to overlap-free configs only: an
# overlapping figure can't be realized, so it's dropped entirely (not shipped, not counted, not mentioned).
# The full 278k union thus ships as its ~31.7k realizable configs.
PALETTES = ["regular-z24", "star24", "regular-isotoxal-z24", "isotoxal-star60-z24", "isotoxal-star-z24"]

KIND_OF = {"regular": "regular", "composite": "convex-isotoxal", "star": "star"}


def angle_word_units(tile, D):
    """Interior-angle word (D-units) around the tile boundary, index 0..L-1."""
    if tile.kind == "regular":
        return [D // 2 - D // tile.n] * tile.n
    if tile.kind == "star":
        aU = tile.alphaU
        dU = D - D // tile.n - aU
        return [aU if i % 2 == 0 else dU for i in range(2 * tile.n)]
    return list(tile.angles)  # composite


def place_tile(word_deg, pos, theta, edge=1.0):
    """Boundary vertices of a tile placed with its corner `pos` at the origin, its interior wedge opening
    CCW from `theta`. Walk pos -> pos+1 -> ... turning by (180 - interior) at each next vertex (CCW, interior
    on the left; reflex dents turn right, tracing the concave outline). Returns L (x,y) float pairs."""
    L = len(word_deg)
    verts = []
    x = y = 0.0
    d = theta  # heading of edge pos -> pos+1
    for k in range(L):
        verts.append((x, y))
        x += edge * math.cos(d)
        y += edge * math.sin(d)
        nxt = (pos + k + 1) % L
        d += math.pi - math.radians(word_deg[nxt])
    return verts


def build_config(classes, D, cids):
    """Place every tile of a config around the vertex; return {word, corners, polys}."""
    theta = 0.0
    polys = []
    corners_deg = []
    tokens = []
    unit_deg = 360.0 / D
    for cid in cids:
        cc = classes[cid]
        tile = cc.tile
        wu = angle_word_units(tile, D)
        wdeg = [u * unit_deg for u in wu]
        a_deg = cc.units * unit_deg
        verts = place_tile(wdeg, cc.pos, theta)
        polys.append({
            "kind": KIND_OF[tile.kind],
            "n": tile.n,
            # round for compact JSON; float geometry is display-only
            "verts": [[round(vx, 5), round(vy, 5)] for vx, vy in verts],
        })
        corners_deg.append(round(a_deg, 3))
        tokens.append(cc.disp)
        theta += math.radians(a_deg)
    overlap = config_has_overlap(polys)
    return {"word": "·".join(tokens), "corners": corners_deg, "overlap": overlap, "polys": polys}


def export_palette(name):
    path = os.path.join(HERE, "palettes", f"{name}.json")
    spec, D, tiles, classes = ga.load_palette(path)
    configs = ga.enum_configs(D, classes, min_len=2, max_len=spec.get("maxValence", 24))
    kept = []
    for c in configs:
        cfg = build_config(classes, D, c)
        if cfg.pop("overlap"):  # drop overlapping figures entirely — never shipped, counted, or mentioned
            continue
        kept.append(cfg)
    out = {
        "name": name,
        "displayName": spec.get("name", name),
        "D": D,
        "counts": {"tiles": len(tiles), "classes": len(classes), "configs": len(kept)},
        "comment": spec.get("comment", ""),
        "configs": kept,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    dst = os.path.join(OUT_DIR, f"{name}.json")
    with open(dst, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    kb = os.path.getsize(dst) / 1024
    print(f"  {name}: {len(configs)} enumerated -> {len(kept)} overlap-free shipped "
          f"[{len(tiles)} tiles, {len(classes)} classes] -> {kb:.0f} KB")


def stats_only(name):
    """Count overlap-free configs WITHOUT emitting geometry — for palettes too big to render (the 278k union)."""
    path = os.path.join(HERE, "palettes", f"{name}.json")
    spec, D, tiles, classes = ga.load_palette(path)
    configs = ga.enum_configs(D, classes, min_len=2, max_len=spec.get("maxValence", 24))
    overlaps = 0
    for i, c in enumerate(configs):
        if config_has_overlap(build_config(classes, D, c)["polys"]):
            overlaps += 1
        if (i + 1) % 20000 == 0:
            print(f"    …{i+1}/{len(configs)} ({overlaps} overlapping so far)")
    survivors = len(configs) - overlaps
    print(f"  {name}: {len(configs)} configs -> {survivors} overlap-free ({100*survivors/len(configs):.1f}%), {overlaps} overlapping")


def sanity_render(name, ncols=6, nrows=5):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Polygon as MplPoly

    path = os.path.join(HERE, "palettes", f"{name}.json")
    spec, D, tiles, classes = ga.load_palette(path)
    configs = ga.enum_configs(D, classes, min_len=2, max_len=spec.get("maxValence", 24))
    colors = {"regular": "#6aa9ff", "convex-isotoxal": "#b07cff", "star": "#ff6b9d"}
    fig, axes = plt.subplots(nrows, ncols, figsize=(ncols * 2, nrows * 2))
    for ax, cfg_cids in zip(axes.flat, configs):
        cfg = build_config(classes, D, cfg_cids)
        for poly in cfg["polys"]:
            ax.add_patch(MplPoly(poly["verts"], closed=True, facecolor=colors[poly["kind"]],
                                 edgecolor="#222", alpha=0.45, linewidth=0.8))
        ax.plot(0, 0, "k.", ms=3)
        ax.set_title(cfg["word"][:34], fontsize=5)
        ax.set_aspect("equal")
        ax.autoscale_view()
        ax.axis("off")
    for ax in axes.flat[len(configs):]:
        ax.axis("off")
    fig.suptitle(f"{name}: first {min(len(configs), nrows*ncols)} of {len(configs)} vertex configs", fontsize=9)
    fig.tight_layout()
    dst = os.path.normpath(os.path.join(HERE, "..", "..", "..", "experiments", "results", f"vertex-configs-sanity-{name}.png"))
    fig.savefig(dst, dpi=130)
    print(f"  sanity render -> {dst}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sanity", help="render a PNG of the first configs for this palette instead of emitting JSON")
    ap.add_argument("--stats", help="count overlap-free configs for one palette without emitting geometry")
    args = ap.parse_args()
    if args.sanity:
        sanity_render(args.sanity)
        return
    if args.stats:
        stats_only(args.stats)
        return
    print("=== export vertex-config alphabets (with overlap check) ===")
    for p in PALETTES:
        export_palette(p)


if __name__ == "__main__":
    main()
