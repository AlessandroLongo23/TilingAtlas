#!/usr/bin/env python3
"""Develop a MARKED palette: one where an edge type says whether the edge is drawn.

Marek's proposal, 2026-08-13. Freedraw today marks a drawn edge by inserting a degenerate two-sided
tile — its square-grid alphabet is {A2 digon, A4 square}, "the digon marking a drawn edge". That is a
workaround for an alphabet with no vocabulary for an EDGE, and it costs degenerate faces, extra
degree-2 vertices and a bigger alphabet. With edge types the property goes on the edge: split every
edge type into a drawn and an undrawn variant, glue like to like, ink only the drawn ones. Where an
edge is undrawn the two tiles across it merge into one CELL, so the cells are polyforms glued from the
palette's tiles.

Nothing here searches and nothing here re-derives edge types. It reads them from the alphabet
(tables.py ETYPE, the same array the solver constrained gluings with), so developer and solver agree
by construction, and `glue` becomes a CHECK: a tiling in which some half-edge is glued to one of a
different type would mean the search ignored its own constraint. That check has never fired.

The geometry is develop_tri45's, unchanged — exact ℤ[ζ₂₄], one step per dart, length taken from the
palette's edgeLengths. A marked palette declares its drawn and undrawn variants at the SAME length,
so the developed board is the plain unmarked board and the marking rides on top of it.

  python3 develop_marked.py --palette alphabets/palettes/fdsq.json --tables tables/fdsq \
      --pruned run-fdsq/out/pruned --kmin 1 --kmax 3 --drawn d --out fdsq-cells.json
"""
import argparse
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import develop_tri45 as dt          # noqa: E402  (exact ℤ[ζ₂₄] develop, shared)
import family_flex as ff            # noqa: E402


def faces_with_darts(placed, rneig, glue, lvert, units, etype, sign=1):
    """develop_tri45.faces_of, keeping the DART behind each boundary edge.

    Edge i of the returned face runs from vertex i to vertex i+1 and is the half-edge `darts[i]`, so
    its drawn/undrawn state is one lookup. The walk itself is unchanged.
    """
    seen, faces = set(), []
    for (h0, d0), pos0 in placed.items():
        if (h0, d0) in seen:
            continue
        cyc, cur, d, pos, ok = [], h0, d0, pos0, True
        for _ in range(64):
            cyc.append((cur, d, pos))
            g = glue[cur]
            npos = dt.zadd(pos, dt.STEP[etype(cur)][d])
            nd = (d + dt.D // 2) % dt.D
            r = rneig[g]
            nd = (nd + sign * units[lvert[r]]) % dt.D
            cur, d, pos = r, nd, npos
            if (cur, d) == (h0, d0):
                break
        else:
            ok = False
        if not ok or len(cyc) < 3:
            continue
        for m in cyc:
            seen.add((m[0], m[1]))
        faces.append({"verts": [m[2] for m in cyc],
                      "keys": [(m[0], m[1]) for m in cyc],
                      "darts": [m[0] for m in cyc]})
    return faces


def merge_cells(faces, glue, typ, drawn_ids):
    """Union faces across UNDRAWN half-edges; each class is one cell of the drawn figure.

    The face on the other side of half-edge h from the face holding key (h, d) is the face holding
    (glue[h], d + 180): crossing an edge lands on the glued dart facing back. Union-find over that
    relation, restricted to undrawn edges.
    """
    owner = {}
    for i, f in enumerate(faces):
        for key in f["keys"]:
            owner[key] = i
    parent = list(range(len(faces)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    unmatched = 0
    for i, f in enumerate(faces):
        for (h, d) in f["keys"]:
            if typ[h] in drawn_ids:
                continue
            other = owner.get((glue[h], (d + dt.D // 2) % dt.D))
            if other is None:
                unmatched += 1
                continue
            union(i, other)
    cells = {}
    for i in range(len(faces)):
        cells.setdefault(find(i), []).append(i)
    return list(cells.values()), unmatched


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--palette", required=True)
    ap.add_argument("--tables", required=True, help="tables/<palette> directory")
    ap.add_argument("--pruned", required=True)
    ap.add_argument("--kmin", type=int, default=1)
    ap.add_argument("--kmax", type=int, default=3)
    ap.add_argument("--drawn", default=None,
                    help="comma-separated edge-type labels meaning DRAWN; defaults to the palette's "
                         "own drawnTypes, which normalize_palette derives from \"freedraw\": true")
    ap.add_argument("--sign", type=int, default=1, choices=[1, -1])
    ap.add_argument("--complement", action="store_true",
                    help="BUBBLE TILES: the two sides of an edge must DIFFER (a bump meets a bite) "
                         "instead of agreeing. Faces are not merged; --drawn names the BITE type, and "
                         "each face reports its per-edge bite word, which is its tile identity.")
    ap.add_argument("--shelf", default=None, metavar="GRID",
                    help="BUBBLE SHELF FORM: emit the record public/bubble/*.json holds — id, k, grid, "
                         "T1, T2, deduplicated verts, polys as index rings, bites — instead of the "
                         "developer's own. GRID is the BubbleGrid string the shelf keys the board on.")
    ap.add_argument("--mixed", action="store_true",
                    help="A MIXED BOARD MUST ACTUALLY MIX: keep only solutions using every family in "
                         "the palette. An all-tile palette contains the single-family searches as "
                         "special cases, so without this a mixed board lists tilings that are already "
                         "on their own board (923 of tri+hex's 1,696 were pure triangle).")
    ap.add_argument("--id-prefix", default=None,
                    help="Record-id prefix; defaults to the tables directory name. The shelf's ids are "
                         "short codes (bt, bs, bh, brh, bth), not palette names, and they only have to "
                         "be unique across the atlas.")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    units, ein, eout, edge_ids = dt.build(args.palette)
    sys.path.insert(0, os.path.join(HERE, "alphabets"))
    from palette_spec import normalize_palette, drawn_types
    spec = normalize_palette(json.load(open(args.palette)))
    lengths = spec.get("edgeLengths") or {}
    dt.STEP.clear()
    for lab, i in edge_ids.items():
        if lab not in lengths:
            raise SystemExit(f"palette declares edge type {lab!r} with no entry in edgeLengths")
        dt.STEP[i] = dt._len_step(lengths[lab])
    labels = args.drawn.split(",") if args.drawn else drawn_types(spec)
    if not labels:
        raise SystemExit("no drawn edge types: give --drawn, or set \"freedraw\": true in the palette")
    for lab in labels:
        if lab not in edge_ids:
            raise SystemExit(f"drawn type {lab!r} is not an edge type of this palette "
                             f"({sorted(edge_ids)})")
    drawn_ids = frozenset(edge_ids[lab] for lab in labels)

    # The --mixed filter reads the family set off each output file's NAME, which is where the solver
    # already records it. Imported rather than restated: bubble_mix_census.py is the census that made
    # the same read, and two copies of "which family is this famchar" is how the rhombus/square
    # confusion gets reintroduced.
    fam_of = all_fams = None
    if args.mixed:
        sys.path.insert(0, HERE)
        from bubble_mix_census import families_in, palette_families
        fam_of, all_fams = palette_families(os.path.splitext(os.path.basename(args.palette))[0])

    tab = ff.load_tables(args.tables)
    if not hasattr(tab, "ETYPE"):
        raise SystemExit(f"{args.tables}/tables.py has no ETYPE — regenerate the alphabet")

    out, fails = [], []
    for k in range(args.kmin, args.kmax + 1):
        for path in sorted(glob.glob(os.path.join(args.pruned, "eupruned_%02d_*.txt" % k))):
            # Whole FILES are skipped, not blocks: every solution in one file uses the same tile set.
            if args.mixed and families_in(os.path.basename(path), fam_of) != all_fams:
                continue
            blocks, cur = [], []
            for line in open(path):
                line = line.rstrip("\n")
                if line == "---":
                    if cur:
                        blocks.append(cur)
                    cur = []
                else:
                    cur.append(line)
            if cur:
                blocks.append(cur)
            for b in blocks:
                b = [l for l in b if l.strip()]
                # Raw solver blocks lead with a count line the pruned ones do not have. Accepting both
                # lets this develop the pre-dedup output, which is how you tell a solver gap from a
                # pruner one.
                if b and b[0].startswith("Number of vertex types:"):
                    b = b[1:]
                if len(b) < 4:
                    continue
                # Find the gluing line by shape, not by index: raw blocks carry no "Count type" line,
                # so it sits one row earlier there than in the pruned ones.
                # ⛑ `@` IS PART OF THE ALPHABET, and leaving it out silently deleted every k >= 5.
                # Vertices past the fourth are written `0@4`, `1@4`, ...; primes only run to three
                # (0, 0', 0'', 0'''). So at k <= 4 the line never contains an `@` and the omission is
                # invisible, while at k = 5 the pattern matched nothing, `conway` came back None, and
                # the block was dropped by the `continue`: 33,377 square tilings developed as ZERO,
                # with no error raised and no failure counted. Anything that can lose a whole k slice
                # has to be loud, so an unparseable block is now a recorded failure.
                conway = next((l for l in b if re.fullmatch(r"[\(\[][()\[\]0-9 '*@]*", l)), None)
                if conway is None:
                    fails.append((k, "?", "no gluing line found in block"))
                    continue
                tes = [l for l in b if l.startswith("TES file:")]
                tid = tes[0].split("/")[-1].strip().replace(".tes", "").replace(" ", "_") if tes else "?"
                try:
                    rneig, lneig, mirro, cls, glue = ff.decode(tab, b[0], conway)
                    typ = ff.decode_etype(tab, b[0])
                    if len(typ) != len(rneig):
                        raise dt.DevelopError("ETYPE length %d != dart count %d" % (len(typ), len(rneig)))
                    # The search's own constraint, re-checked on the developed object: a gluing joins
                    # two half-edges, and they must be the same type. If this ever fires the solver
                    # emitted something its alphabet forbids.
                    for h, g in enumerate(glue):
                        if g < 0:
                            continue
                        if (typ[h] == typ[g]) if args.complement else (typ[h] != typ[g]):
                            raise dt.DevelopError("glue joins edge types %d and %d" % (typ[h], typ[g]))
                    T1, T2, seeds, placed, _etype_prop = dt.develop(
                        rneig, lneig, mirro, cls, glue, units, ein, eout, args.sign, types=typ)
                    faces = faces_with_darts(placed, rneig, glue, cls, units, lambda h: typ[h], args.sign)
                    # Per-face BITE word, in boundary-edge order: 1 where this face owns the bite, 0
                    # where it owns the bump. It is both the arc direction for rendering and, up to
                    # rotation, the face's bubble-tile identity.
                    bites = [[int(typ[h] in drawn_ids) for h in f["darts"]] for f in faces]
                    if args.complement:
                        # THE BALANCE EQUATION, as an invariant rather than a filter. Orient every
                        # edge bump-side to bite-side and sum(indeg - outdeg) over the quotient torus
                        # is |E| - |E| = 0 for ANY orientation, so this is the handshake identity and
                        # holds for every genuine bubble tiling. It fails exactly when some edge got a
                        # bump on both sides, which is the one way complementary gluing can go wrong.
                        if sum(2 * sum(w) - len(w) for w in bites):
                            raise dt.DevelopError("balance equation violated")
                        cells, unmatched = [[i] for i in range(len(faces))], 0
                    else:
                        cells, unmatched = merge_cells(faces, glue, typ, drawn_ids)
                    if unmatched:
                        raise dt.DevelopError("%d undrawn half-edges with no neighbouring face" % unmatched)
                    # Drawn segments, deduplicated: a drawn edge is walked once from each side.
                    segs, segkey = [], set()
                    deg = {}
                    for f in faces:
                        n = len(f["verts"])
                        for i in range(n):
                            if typ[f["darts"][i]] not in drawn_ids:
                                continue
                            p, q = f["verts"][i], f["verts"][(i + 1) % n]
                            fp = (round(dt.zfloat(p).real, 6), round(dt.zfloat(p).imag, 6))
                            fq = (round(dt.zfloat(q).real, 6), round(dt.zfloat(q).imag, 6))
                            key = tuple(sorted([fp, fq]))
                            if key in segkey:
                                continue
                            segkey.add(key)
                            segs.append([list(fp), list(fq)])
                    rec_id = "%s-%d-%05d" % (args.id_prefix or os.path.basename(args.tables), k,
                                             len([o for o in out if o["k"] == k]) + 1)
                    if args.shelf:
                        # The shelf form. `faces` already holds each ring as PLACED-VERTEX KEYS, so the
                        # deduplication the catalogue wants is a numbering of the keys already in hand —
                        # the developer was throwing it away and spelling every corner out. A square k=5
                        # cell has ~20 distinct vertices behind ~70 corners, which is the four-times-the-
                        # bytes the shelf note records. 4 decimals, the substrate being a unit lattice.
                        vidx, verts, polys = {}, [], []
                        for f in faces:
                            ring = []
                            for key in f["verts"]:
                                if key not in vidx:
                                    vidx[key] = len(verts)
                                    z = dt.zfloat(key)
                                    verts.append([round(z.real, 4), round(z.imag, 4)])
                                ring.append(vidx[key])
                            polys.append(ring)
                        out.append({
                            "id": rec_id, "k": k, "grid": args.shelf,
                            "T1": [round(dt.zfloat(T1).real, 4), round(dt.zfloat(T1).imag, 4)],
                            "T2": [round(dt.zfloat(T2).real, 4), round(dt.zfloat(T2).imag, 4)],
                            "verts": verts, "polys": polys, "bites": bites,
                        })
                        continue
                    out.append({
                        "id": rec_id,
                        "k": k,
                        "source": tid,
                        "T1": [round(dt.zfloat(T1).real, 9), round(dt.zfloat(T1).imag, 9)],
                        "T2": [round(dt.zfloat(T2).real, 9), round(dt.zfloat(T2).imag, 9)],
                        "drawn": segs,
                        "faces": [[[round(dt.zfloat(p).real, 9), round(dt.zfloat(p).imag, 9)]
                                   for p in f["verts"]] for f in faces],
                        "cells": cells,
                        "bites": bites,
                        "stats": {"vertices": len(placed), "faces": len(faces),
                                  "cells": len(cells), "drawnEdges": len(segs)},
                    })
                except dt.DevelopError as e:
                    fails.append((k, tid, str(e)))

    json.dump(out, open(args.out, "w"))
    per = {}
    for o in out:
        per[o["k"]] = per.get(o["k"], 0) + 1
    print("developed:", {k: per.get(k, 0) for k in range(args.kmin, args.kmax + 1)},
          "total", len(out), "failures", len(fails))
    reasons = {}
    for _k, _t, msg in fails:
        reasons[msg.split("(")[0].strip()] = reasons.get(msg.split("(")[0].strip(), 0) + 1
    for r, n in sorted(reasons.items(), key=lambda x: -x[1])[:6]:
        print("  FAIL %4d  %s" % (n, r))


if __name__ == "__main__":
    main()
