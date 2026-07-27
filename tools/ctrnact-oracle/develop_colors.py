#!/usr/bin/env python3
"""Develop colored-tiling solutions: PT certificates for n-colorings of a grid -> cell colors.

Sibling of develop_freedraw.py, one alphabet over: where freedraw's alphabet was {A2 digon, A4
square} on the square grid (the digon marking a drawn edge), the colors alphabet is {A4, B4} --
two squares, both 90 degrees, distinguished only by color. Every certificate mechanism is
identical (site-symmetry-folded vertex tables, the Conway structure line, the star-walk BFS), so
the parser, tables, glue and develop are IMPORTED from develop_freedraw, not copied. What changes
is the emitter: there is no drawn/blank edge bit; instead every FACE of the grid carries a color,
read off the vertex figure (the corner crossed while star-walking sector [d, d+90) at a vertex is
the tile filling that quadrant, so each unit cell is claimed up to four times -- all claims must
agree, a strong internal consistency check).

THE OBJECT. A periodic coloring of the 4^4 square tiling (or 3^6, or the tri+square patch). k counts
COLORED vertex classes: vertices are equivalent only under symmetries preserving the coloring, and the
vertex figure records the color word around the vertex ((A4, B4)D4a is the checkerboard vertex).
Nothing is a proper coloring: all-A is a valid (k=1) solution.

COLOR COUNT. The letter IS the color (A=0, B=1, C=2, ...), so --colors just selects which alphabet to
load and how many color permutations the swap convention explores. An n-color corpus CONTAINS every
m-coloring for m < n (a 3-color file set holds each 2-coloring three times, once per pair of letters),
which is why --surjective exists: it keeps only the solutions using every color, the ones an n-color
run actually adds over the (n-1)-color catalogue.

FILE NAMING (settled empirically here, verified per block):
    squares_2_colorssolver_<k>_<token>_<n>.txt      n = number of EDGE orbits (structure items)
    squares_2_colorssolver_<k>_<token>_o_<n>.txt    the _o_ split: see the convention experiment
The convention experiment canonicalizes every developed solution under the four candidate
quotients (rotations only / + mirror / + color relabel / + both) and reports which one makes
Marek's block counts a bijection -- the same empirical method that settled freedraw chirality.

Usage:
    develop_colors.py <dir> --out ../../public/colors/squares-2.json --log <path>
    develop_colors.py <dir> --colors 3 --surjective --out ../../public/colors/squares-3.json
"""
import argparse
import itertools
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import develop_freedraw as fd

# Three grids x n colors, one alphabet rule: letters A*/B*/C* are the same polygon in n colors. The
# square and triangle grids develop on their fixed lattice; the combined grid has none, so it develops
# in exact Z[zeta12] and emits explicit patches — the same split develop_freedraw.py makes for the
# edge systems. Registered for every color count so `colors<n><suffix>` is always a live grid key.
LETTERS = "ABCDEFGHIJ"
COLOR_OF = {ch: i for i, ch in enumerate(LETTERS)}
MAX_COLORS = 4

for _n in range(2, MAX_COLORS + 1):
    _cols = LETTERS[:_n]
    fd.GRIDS[f"colors{_n}sq"] = {"units": {f"{c}4": 3 for c in _cols}, "step": fd.SQ_STEP,
                                 "axes": [(1, 0), (0, 1)], "axis_names": ["h", "v"]}
    fd.GRIDS[f"colors{_n}tri"] = {"units": {f"{c}3": 2 for c in _cols}, "step": fd.TR_STEP,
                                  "axes": [(1, 0), (0, 1), (1, -1)], "axis_names": ["h", "v", "w"]}
    fd.GRIDS[f"colors{_n}ts"] = {"units": {**{f"{c}3": 2 for c in _cols}, **{f"{c}4": 3 for c in _cols}},
                                 "step": None, "axes": None, "axis_names": None}
    # The hexagonal grid takes the patch path too, for the reason in develop_freedraw.GRIDS: the {6,3}
    # vertex set is a honeycomb, not a lattice, so there is no cell coset to index colors into.
    fd.GRIDS[f"colors{_n}hex"] = {"units": {f"{c}6": 4 for c in _cols},
                                  "step": None, "axes": None, "axis_names": None}

# The unit cell in quadrant [d, d+90) at a vertex, as the offset of the cell's SW corner.
CELL_D = {0: (0, 0), 3: (-1, 0), 6: (-1, -1), 9: (0, -1)}


# ---------------------------------------------------------------- parsing with file metadata
FNAME = re.compile(r".*solver_(\d+)_([A-Z0-9]+)_(o_)?(\d+)\.txt")


def parse_dir(src):
    """All blocks with their file metadata: (cert, meta) with meta = {kf, token, o, nf, file}."""
    out = []
    for name in sorted(os.listdir(src)):
        m = FNAME.fullmatch(name)
        if not m:
            continue
        kf, token, o, nf = int(m.group(1)), m.group(2), bool(m.group(3)), int(m.group(4))
        text = open(os.path.join(src, name), encoding="utf-8", errors="replace").read()
        for chunk in text.split("---"):
            if not chunk.strip():
                continue
            cert = fd.parse_block(chunk)
            # tile-orbit lines follow the structure line; each contains "/" corner refs
            cert["ntiles"] = sum(1 for l in chunk.splitlines() if "/" in l)
            out.append((cert, {"kf": kf, "token": token, "o": o, "nf": nf, "file": name}))
    return out


# ---------------------------------------------------------------- emit: cells instead of edges
def _orbit_map(block, lat, expanded):
    a, b, d = lat
    orbit = [-1] * (a * d)
    for pos, (h0, _) in expanded.items():
        c = fd.reduce_coset(a, b, d, pos[0], pos[1])
        o = block.orbit_of[h0]
        if orbit[c] not in (-1, o):
            raise fd.DevelopError("vertex coset maps to two orbits")
        orbit[c] = o
    if -1 in orbit:
        raise fd.DevelopError("emitted domain has unseen vertices")
    return orbit


def emit_colors(block, lat, placed, expanded):
    a, b, d = lat
    n = a * d
    cells = [-1] * n
    for (h, dd), pos in placed.items():
        col = COLOR_OF[block.tile[h][0]]
        off = CELL_D[dd]
        c = fd.reduce_coset(a, b, d, pos[0] + off[0], pos[1] + off[1])
        if cells[c] not in (-1, col):
            raise fd.DevelopError("one cell claimed by two colors")
        cells[c] = col
    if -1 in cells:
        raise fd.DevelopError("emitted domain has uncolored cells")
    return {"a": a, "b": b, "d": d, "cells": cells, "orbit": _orbit_map(block, lat, expanded)}


def tri_cell(pos, dd):
    """The triangle face in sector [dd, dd+60) at a lattice vertex, as (anchor x, anchor y, type)
    with type 0 = up (corners p, p+e_d, p+e_{d+2}, centroid sum ≡ (1,1) mod 3) and 1 = down (≡ (2,2)).
    The TRIPLED-CENTROID encoding: exact, and D6 acts linearly on it (the same trick lib/freedraw
    uses for shape/pose classification)."""
    e1 = fd.TR_STEP[dd]
    e2 = fd.TR_STEP[(dd + 2) % 12]
    sx = 3 * pos[0] + e1[0] + e2[0]
    sy = 3 * pos[1] + e1[1] + e2[1]
    t = sx % 3
    if t not in (1, 2) or sy % 3 != t:
        raise fd.DevelopError("triangle centroid off the two centroid classes")
    return (sx - t) // 3, (sy - t) // 3, 0 if t == 1 else 1


def emit_colors_tri(block, lat, placed, expanded):
    """Triangle grid: TWO cells per lattice coset (up then down), index 2*coset + type — the same
    layout lib/freedraw's triangle analysis uses for cellFace."""
    a, b, d = lat
    cells = [-1] * (2 * a * d)
    for (h, dd), pos in placed.items():
        col = COLOR_OF[block.tile[h][0]]
        ax, ay, t = tri_cell(pos, dd)
        c = 2 * fd.reduce_coset(a, b, d, ax, ay) + t
        if cells[c] not in (-1, col):
            raise fd.DevelopError("one cell claimed by two colors")
        cells[c] = col
    if -1 in cells:
        raise fd.DevelopError("emitted domain has uncolored cells")
    return {"a": a, "b": b, "d": d, "cells": cells, "orbit": _orbit_map(block, lat, expanded)}


def emit_colors_patch(block, T1, T2, placed):
    """Combined grid: the PatchComplex quotient (shared with freedraw's ts mode — its internal
    face-walk closure and torus Euler checks run unchanged, with zero digons), emitted as explicit
    per-period geometry with a color per polygon instead of drawn-edge flags."""
    cx = fd.PatchComplex(block, T1, T2, placed).build()
    rnd = lambda z: [round(z.real, 5), round(z.imag, 5)]
    b = block
    edges = []
    seen = set()
    for K in sorted(cx.key_vertex):
        h, dd = K
        Kr = (b.glue[h], (dd + 6) % 12)
        und = tuple(sorted([K, Kr]))
        if und in seen:
            continue
        seen.add(und)
        vi, vj = cx.key_vertex[K], cx.key_vertex[Kr]
        oi, oj, dl = cx.key_off[K], cx.key_off[Kr], cx.delta[K]
        edges.append([vi, vj, oj[0] + dl[0] - oi[0], oj[1] + dl[1] - oi[1]])
    polys, poly_color = [], []
    for rec in cx.faces:
        ring, base = [], None
        for K, oK in zip(rec["keys"], rec["offs"]):
            oi = cx.key_off[K]
            tot = (oi[0] + oK[0], oi[1] + oK[1])
            if base is None:
                base = tot
            ring.append([cx.key_vertex[K], tot[0] - base[0], tot[1] - base[1]])
        polys.append(ring)
        poly_color.append(COLOR_OF[rec["tile"][0]])
    return {"T1": rnd(fd.zfloat(T1)), "T2": rnd(fd.zfloat(T2)),
            "verts": [rnd(fd.zfloat(p)) for p in cx.vpos], "vorbit": cx.vorbit,
            "edges": edges, "polys": polys, "polyColor": poly_color}


# ---------------------------------------------------------------- canonical over cell colorings
# Cells transform by their centers, encoded so the point group acts LINEARLY and exactly: squares by
# doubled centers (2x+1, 2y+1) — every D4 matrix maps odd-odd to odd-odd — and triangles by tripled
# centroids (3x+m, 3y+m), m = 1 up / 2 down, the two classes D6 permutes (a 60° turn flips up/down).
ROT4 = fd.close_group([(0, -1, 1, 0)])
D4 = fd.CANON_PG["square"]
ROT6 = fd.close_group([(0, -1, 1, 1)])
D6 = fd.CANON_PG["triangle"]


def relabels(ncolors, swap):
    """The color maps a canonical form minimises over: the identity alone, or all of S_n when the
    convention folds relabelings together (2 colors: identity + the swap, as before)."""
    return list(itertools.permutations(range(ncolors))) if swap else [tuple(range(ncolors))]


def canon_colors(a, b, d, cells, group, perms):
    best = None
    variants = [[p[c] for c in cells] for p in perms]
    for gm in group:
        lat2 = fd.hnf2(fd.mat_apply(gm, (a, 0)), fd.mat_apply(gm, (b, d)))
        a2, b2, d2 = lat2
        n2 = a2 * d2
        gi = next(x for x in group if fd.mat_mul(x, gm) == (1, 0, 0, 1))
        idx = []
        for c2 in range(n2):
            cx, cy = c2 % a2, c2 // a2
            px, py = fd.mat_apply(gi, (2 * cx + 1, 2 * cy + 1))
            idx.append(fd.reduce_coset(a, b, d, (px - 1) // 2, (py - 1) // 2))
        for cl in variants:
            base = [cl[i] for i in idx]
            for tc in range(n2):
                tx, ty = tc % a2, tc // a2
                cand = tuple(base[fd.reduce_coset(a2, b2, d2, (c2 % a2) - tx, (c2 // a2) - ty)]
                             for c2 in range(n2))
                key = ((a2, b2, d2), cand)
                if best is None or key < best:
                    best = key
    return best


def canon_colors_tri(a, b, d, cells, group, perms):
    """Same minimisation on the triangle grid: cells indexed 2*coset + type, transformed through the
    tripled centroids. The mod-3 typing is asserted on every transform — a matrix outside the two
    centroid classes would silently scramble up/down, so it fails loudly instead."""
    best = None
    variants = [[p[c] for c in cells] for p in perms]
    for gm in group:
        lat2 = fd.hnf2(fd.mat_apply(gm, (a, 0)), fd.mat_apply(gm, (b, d)))
        a2, b2, d2 = lat2
        n2 = a2 * d2
        gi = next(x for x in group if fd.mat_mul(x, gm) == (1, 0, 0, 1))
        idx = []
        for cs in range(n2):
            cx, cy = cs % a2, cs // a2
            for t in (0, 1):
                m = 1 if t == 0 else 2
                sx, sy = fd.mat_apply(gi, (3 * cx + m, 3 * cy + m))
                st = sx % 3
                if st not in (1, 2) or sy % 3 != st:
                    raise fd.DevelopError("triangle centroid transform left the centroid classes")
                idx.append(2 * fd.reduce_coset(a, b, d, (sx - st) // 3, (sy - st) // 3)
                           + (0 if st == 1 else 1))
        for cl in variants:
            base = [cl[i] for i in idx]
            for tc in range(n2):
                tx, ty = tc % a2, tc // a2
                cand = tuple(
                    base[2 * fd.reduce_coset(a2, b2, d2, (cs % a2) - tx, (cs // a2) - ty) + t]
                    for cs in range(n2) for t in (0, 1))
                key = ((a2, b2, d2), cand)
                if best is None or key < best:
                    best = key
    return best


# Per-grid wiring for the driver: the fd.GRIDS key suffix, the emitter, the canonical function
# (None = patch mode, no cell lattice to canonicalize over), the rotation/full point groups, and the
# record id prefix. Both the grid key and the prefix take the color count: `colors3sq` / `col3-…`,
# with 2 colors keeping the bare prefix the shipped catalogue already uses.
GRID_CFG = {
    "square": {"suffix": "sq", "canon": canon_colors, "rot": ROT4, "full": D4, "prefix": "col"},
    "triangle": {"suffix": "tri", "canon": canon_colors_tri, "rot": ROT6, "full": D6, "prefix": "colt"},
    "ts": {"suffix": "ts", "canon": None, "rot": None, "full": None, "prefix": "colts"},
    "hex": {"suffix": "hex", "canon": None, "rot": None, "full": None, "prefix": "colh"},
}


def grid_key(grid, ncolors):
    return f"colors{ncolors}{GRID_CFG[grid]['suffix']}"


def id_prefix(grid, ncolors):
    return GRID_CFG[grid]["prefix"] + ("" if ncolors == 2 else str(ncolors))


def colors_used(pat):
    """The distinct colors a developed pattern actually uses — cell grids and patches alike."""
    return set(pat["polyColor"] if "polyColor" in pat else pat["cells"])


# ---------------------------------------------------------------- driver
def develop_cert(cert, grid, gkey):
    """Every VTable variant combo that develops cleanly, as emitted patterns."""
    variant_lists = [fd.vtable_variants(t["figure"], t["tag"], gkey) for t in cert["types"]]
    combos = [[]]
    for vl in variant_lists:
        combos = [c + [v] for c in combos for v in vl]
    out, reasons = [], []
    for tables in combos:
        try:
            block = fd.Block(cert, tables, gkey)
            if fd.is_patch_grid(gkey):
                T1, T2, placed = fd.develop_patch(block)
                out.append(emit_colors_patch(block, T1, T2, placed))
            else:
                lat, placed, expanded = fd.develop(block)
                out.append((emit_colors if grid == "square" else emit_colors_tri)(
                    block, lat, placed, expanded))
        except fd.DevelopError as e:
            reasons.append(str(e))
    return out, reasons


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--grid", default="square", choices=sorted(GRID_CFG))
    ap.add_argument("--colors", type=int, default=2, choices=range(2, MAX_COLORS + 1))
    ap.add_argument("--surjective", action="store_true",
                    help="write only the solutions using EVERY color (the rest are the "
                         "(n-1)-color catalogue re-embedded)")
    ap.add_argument("--out")
    ap.add_argument("--log")
    args = ap.parse_args()
    logf = open(args.log, "a") if args.log else None
    cfg = GRID_CFG[args.grid]
    canon = cfg["canon"]
    nc = args.colors
    gkey = grid_key(args.grid, nc)
    ident = relabels(nc, False)

    def log(msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(line, flush=True)
        if logf:
            logf.write(line + "\n")
            logf.flush()

    blocks = parse_dir(args.source)
    log(f"parsed {len(blocks)} certificate blocks from {args.source} "
        f"(grid {args.grid}, {nc} colors, alphabet {sorted(fd.GRIDS[gkey]['units'])})")

    developed = []   # (pat, cert, meta)
    fails = Counter()
    ambiguous = 0
    t0 = time.time()
    for i, (cert, meta) in enumerate(blocks):
        pats, reasons = develop_cert(cert, args.grid, gkey)
        if not pats:
            fails[reasons[0] if reasons else "?"] += 1
            continue
        # distinct mirror axes that both develop must agree up to canonical form (cell grids only;
        # patches have no lattice canonical, so a variant split is just counted there)
        if canon:
            forms = {canon(p["a"], p["b"], p["d"], p["cells"], cfg["full"], ident) for p in pats}
            if len(forms) > 1:
                ambiguous += 1
        elif len(pats) > 1:
            ambiguous += 1
        developed.append((pats[0], cert, meta))
        # per-block invariant checks
        korb = len(set(pats[0]["orbit"] if canon else pats[0]["vorbit"]))
        if korb != cert.get("k") or cert.get("k") != meta["kf"]:
            log(f"  ORBIT-COUNT MISMATCH {meta['file']}: developed {korb}, cert {cert.get('k')}")
        if len(cert["structure"]) != meta["nf"]:
            log(f"  EDGE-ORBIT/NAME MISMATCH {meta['file']}: {len(cert['structure'])} items, name says {meta['nf']}")
        if i % 2000 == 1999:
            el = time.time() - t0
            log(f"  developed {i + 1}/{len(blocks)}  ({el:.0f}s, ETA {el / (i + 1) * (len(blocks) - i - 1):.0f}s)")
    log(f"developed {len(developed)}/{len(blocks)} blocks, {ambiguous} with disagreeing table variants")
    for r, c in fails.most_common(5):
        log(f"    failure x{c}: {r}")

    by_k_blocks = Counter(m["kf"] for _, _, m in developed)
    by_k_main = Counter(m["kf"] for _, _, m in developed if not m["o"])
    log(f"blocks per k (main): {dict(sorted(by_k_main.items()))}")
    log(f"blocks per k (o):    {dict(sorted((k, by_k_blocks[k] - by_k_main[k]) for k in by_k_blocks))}")

    # How many colors each solution actually uses. An n-color corpus re-embeds every smaller catalogue
    # (a 3-color run holds each 2-coloring once per ORDERED pair of letters), so this split is both the
    # size of what --surjective keeps and a cross-check: the m-color rows must reproduce the shipped
    # m-color counts per k.
    by_used = Counter((m["kf"], len(colors_used(p))) for p, _, m in developed)
    for used in sorted({u for _, u in by_used}):
        per_k = {k: c for (k, u), c in sorted(by_used.items()) if u == used}
        log(f"blocks using {used} color(s): {per_k} = {sum(per_k.values())}")

    if canon:
        # ---------------- convention experiment: which quotient makes Marek's counts a bijection?
        # "relabel" folds the whole symmetric group on colors (the 2-color swap generalized).
        conventions = [("rot", cfg["rot"], False), ("rot+mirror", cfg["full"], False),
                       ("rot+relabel", cfg["rot"], True), ("rot+mirror+relabel", cfg["full"], True)]
        for name, group, swap in conventions:
            perms = relabels(nc, swap)
            seen_all = defaultdict(set)
            seen_main = defaultdict(set)
            dup_all = 0
            for pat, cert, meta in developed:
                f = canon(pat["a"], pat["b"], pat["d"], pat["cells"], group, perms)
                if f in seen_all[meta["kf"]]:
                    dup_all += 1
                seen_all[meta["kf"]].add(f)
                if not meta["o"]:
                    seen_main[meta["kf"]].add(f)
            log(f"convention {name:18s}: distinct per k (all blocks) "
                f"{dict((k, len(s)) for k, s in sorted(seen_all.items()))}, {dup_all} dups")
            log(f"           {'':18s}  distinct per k (main only)  "
                f"{dict((k, len(s)) for k, s in sorted(seen_main.items()))}")

        # the _o_ split: chirality of o vs main blocks (the square run settled this as the split's
        # meaning; re-verified per grid).
        mirror_gen = (-1, 0, 0, 1) if args.grid == "square" else (1, 1, 0, -1)
        REFL = [fd.mat_mul(r, mirror_gen) for r in cfg["rot"]]

        def is_chiral(p):
            return (canon(p["a"], p["b"], p["d"], p["cells"], cfg["rot"], ident)
                    != canon(p["a"], p["b"], p["d"], p["cells"], REFL, ident))

        o_blocks = [(p, c, m) for p, c, m in developed if m["o"]]
        if o_blocks:
            o_chiral = sum(1 for p, _, _ in o_blocks if is_chiral(p))
            main_chiral = sum(1 for p, _, m in developed if not m["o"] and is_chiral(p))
            log(f"chiral blocks: {o_chiral}/{len(o_blocks)} in o files, {main_chiral} in main files")

    # ---------------- dedup under the atlas convention (mirror merges, colors labeled) and write.
    # Patch mode has no lattice canonical: Marek's own dedup is trusted there, as it provably matches
    # the atlas convention on both cell grids.
    if args.out:
        writable = developed
        if args.surjective:
            writable = [(p, c, m) for p, c, m in developed if len(colors_used(p)) == nc]
            log(f"surjective filter: {len(writable)}/{len(developed)} use all {nc} colors "
                f"(the rest re-embed the smaller catalogues)")
        chosen = []
        if canon:
            seen = {}
            dups = 0
            for pat, cert, meta in writable:
                f = canon(pat["a"], pat["b"], pat["d"], pat["cells"], cfg["full"], ident)
                if f in seen:
                    dups += 1
                    continue
                seen[f] = True
                chosen.append((pat, cert, meta))
            log(f"atlas dedup (rot+mirror, colors labeled): {len(chosen)} distinct, {dups} folded")
        else:
            chosen = writable
        prefix = id_prefix(args.grid, nc)
        by_k = Counter()
        recs_by_k = defaultdict(list)
        for pat, cert, meta in chosen:
            k = meta["kf"]
            by_k[k] += 1
            rec = {"id": f"{prefix}-{k}-{by_k[k]:05d}", "k": k,
                   "vcs": [f"({', '.join(t['figure'])}){t['tag']}" for t in cert["types"]],
                   "tileOrbits": cert.get("ntiles", 0),
                   "edgeOrbits": len(cert["structure"])}
            # 2 colors is the implied default, so only a wider palette is written out — the shipped
            # 2-color files stay byte-identical if they are ever regenerated.
            if nc != 2:
                rec["colors"] = nc
            if fd.is_patch_grid(gkey):
                # Self-contained: dummy lattice fields so every cell-grid consumer type-checks; the
                # real geometry lives under `patch` — the freedraw ts convention exactly.
                rec.update({"grid": args.grid, "a": 1, "b": 0, "d": 1, "cells": [0], "orbit": [0],
                            "patch": pat})
            else:
                rec.update({"a": pat["a"], "b": pat["b"], "d": pat["d"],
                            "cells": pat["cells"], "orbit": pat["orbit"]})
                if args.grid == "triangle":
                    rec["grid"] = "triangle"
            recs_by_k[k].append(rec)
        for k, recs in sorted(recs_by_k.items()):
            path = args.out.replace(".json", f"-k{k}.json")
            json.dump(recs, open(path, "w"), separators=(",", ":"))
            log(f"wrote {path}: {len(recs)} colorings, {os.path.getsize(path) / 1e6:.2f} MB")
        log(f"total distinct colorings by k: {dict(sorted(by_k.items()))}")


if __name__ == "__main__":
    main()
