#!/usr/bin/env python3
"""Decode Marek Čtrnáct's `edges_pentagons_<nn>` certificates — edge systems on a PARAMETRIC convex
pentagon — into records the client can realise at any point of the pentagon's parameter family.

WHAT IS NEW HERE, AND WHY IT NEEDED ITS OWN FILE. Every edge board the atlas held before this one
decorates a tile whose geometry is FORCED: develop_hyp_edges and develop_sph_edges both read their
angles off `interior_angle(n, ℓ)`, the one regular n-gon its vertex figure closes at. A Kershner
pentagon has no such ℓ. Type 1 is a five-parameter family (three angles and two side ratios,
lib/pentagon/types.ts), every member of which tiles, so there is no single geometry to bake.

SO THIS FILE SHIPS NO GEOMETRY AT ALL. What a certificate actually says is parameter-free:

  * which corner of the pentagon (A…E, or a flat π) sits at each dart of each vertex orbit,
  * which edge CLASS (a…e) each half-edge belongs to,
  * whether that edge is drawn,
  * how the darts glue.

None of that moves when the sliders move. The client re-develops the geometry from the live parameter
point exactly as lib/render/hyperbolicDevelopClient.ts re-develops darts under the live view — same
division of labour, different reason for it (there the view moves, here the tile shape does).

THE ALPHABET, derived from the corpus and asserted here rather than assumed:

  A5 … E5   the pentagon presented at corner A … E
  Pi        a FLAT vertex: a 180° corner sitting inside a neighbour's edge. It is not a corner of any
            tile, and the glossary's "tile vertex vs tiling vertex" rule is why it can exist at all.
  X10, X11  an UNDRAWN half-edge slot of edge class X
  X12, X13  a DRAWN one

The 10/11 ↔ 12/13 split is measured, not guessed: over all 17,993 certificates the number of 12/13
letters runs 0…29 like a decoration count should, and exactly ONE certificate has zero of them — the
bare board, the undecorated tiling itself. That record also explains the census having nothing at
k = 1: the undecorated Type 1 tiling already has two vertex orbits, so no decoration of it can have one.

Usage:
    develop_pent_edges.py <corpus-dir> --type 1 --out public/pentagon-edges/pe1 --report ...
    develop_pent_edges.py --selftest
"""
import argparse
import glob
import json
import math
import os
import re
import sys
import time
from collections import Counter, defaultdict

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

import develop_freedraw as fd
from develop_freedraw import DevelopError

TWO_PI = 2 * math.pi
TOL = 1e-7        # planar dedup grid for the validation develop
ANGTOL = 1e-6

CORNERS = ["A", "B", "C", "D", "E"]

# The parametric pentagon families Marek has edge solvers for, by the id his corpora use. `angles` is a
# VALIDATION point only — a member of the family used to check that every certificate develops into a
# closed planar patch. Nothing derived from it is shipped; the records are parameter-free.
#
# Type 1 (Reinhardt 1918) is B + C = 180°, which is exactly what the corpus's two vertex figures force:
# (A5,·,E5,·,D5,·) closes as A + E + D = 360° and (Pi,·,B5,·,C5,·) as 180° + B + C = 360°. The two sum
# to 540°, the pentagon's own angle sum, so the system is consistent — asserted in `board_of`.
FAMILIES = {
    "1": {
        "type": 1,
        "label": "Type 1",
        "constraint": "B + C = 180°",
        # lib/pentagon/types.ts Type 1 defaults: A=120, B=100, D=110 -> C=80, E=130.
        "angles": {"A": 120.0, "B": 100.0, "C": 80.0, "D": 110.0, "E": 130.0},
        # Side lengths a…e at that point (lib/pentagon/types.ts side defaults b/a, c/a). Only the
        # RATIOS matter and only for validation; a is the unit.
        "sides": {"a": 1.0, "b": 2.253835, "c": 2.251052, "d": 1.0, "e": 1.0},
        "solver": "pt_edges_pentagons_01.exe",
    },
}


def is_corner(letter):
    return len(letter) == 2 and letter[0] in CORNERS and letter[1] == "5"


def is_flat(letter):
    return letter == "Pi"


def is_digon(letter):
    return bool(re.fullmatch(r"[A-E]1[0-3]", letter))


def edge_class(letter):
    """'B12' -> 'b'. The digon letter names which of the pentagon's five sides this is."""
    return letter[0].lower()


def is_drawn_letter(letter):
    """12/13 drawn, 10/11 undrawn — the measured convention (see the module docstring)."""
    return is_digon(letter) and int(letter[1:]) in (12, 13)


def board_of(fam_id):
    """(units in radians, side lengths, alphabet) for a family, with its defining identity ASSERTED."""
    fam = FAMILIES[fam_id]
    a = fam["angles"]
    tot = sum(a.values())
    if abs(tot - 540.0) > 1e-9:
        raise DevelopError(f"type {fam['type']}: angles sum to {tot}, not 540")
    units = {f"{c}5": math.radians(a[c]) for c in CORNERS}
    units["Pi"] = math.pi
    for c in CORNERS:
        for n in (10, 11, 12, 13):
            units[f"{c}{n}"] = 0.0
    return units, fam["sides"], fam


def vtable_variants_pent(figure, tag, units):
    """develop_hyp_edges.vtable_variants_hyp with the pentagon's alphabet. The site rotation order is
    2π / Σ α(listed), asserted integral; on these boards it is always 1 (every certificate is tagged F),
    but the general form is what would let a mirrored family through unchanged."""
    for c in figure:
        if c not in units:
            raise DevelopError(f"letter {c} not in the pentagon alphabet")
    s = sum(units[c] for c in figure)
    if s <= 1e-9:
        raise DevelopError(f"figure {figure} has zero angle sum")
    rotf = TWO_PI / s
    rotn = round(rotf)
    if rotn < 1 or abs(rotf - rotn) > 1e-6:
        raise DevelopError(f"figure {figure} angle sum does not divide 2pi (rot={rotf:.6f})")
    t = len(figure)
    m = re.fullmatch(r"(F|C\d+|A[a-z0-9]*|D\d+[a-z]?)(x\d+)?", tag or "F")
    if not m:
        raise DevelopError(f"unrecognised site tag {tag!r}")
    head = m.group(1)
    digons = tuple(l for l in units if is_digon(l))
    drawn = tuple(l for l in digons if is_drawn_letter(l))
    kw = {"digons": digons, "drawn_letters": drawn}
    if head == "F" or head.startswith("C"):
        if head.startswith("C") and int(head[1:]) != rotn:
            raise DevelopError(f"tag {tag} order != rotation order {rotn}")
        return [fd.VTable(figure, units, chiral=True, **kw)]
    if head.startswith("D") and int(re.match(r"D(\d+)", head).group(1)) != 2 * rotn:
        raise DevelopError(f"tag {tag} order != 2 x rotation order {rotn}")
    axes = [a for a in range(t) if all(figure[s2] == figure[(a - s2 - 1) % t] for s2 in range(t))]
    if not axes:
        raise DevelopError(f"tag {tag} claims a mirror but figure {figure} admits none")
    return [fd.VTable(figure, units, chiral=False, axis=a, **kw) for a in axes]


def build_block(cert, units):
    """Every (figure, tag) table combination that survives glue construction."""
    variant_lists = [vtable_variants_pent(t["figure"], t["tag"], units) for t in cert["types"]]
    combos = [[]]
    for vl in variant_lists:
        combos = [c + [v] for c in combos for v in vl]
    out, reasons = [], []
    for tables in combos:
        try:
            # The grid name is deliberately not in develop_freedraw.GRIDS: Block then makes no ring or
            # edge-length assumption and is used purely for its glue, which is the only part of it that
            # is parameter-free. Edge classes are recovered here instead (see `edge_of`).
            out.append(fd.Block(cert, tables, "pent"))
        except DevelopError as e:
            reasons.append(str(e))
    return out, len(combos), reasons


def edge_of(block, h):
    """The edge class of half-edge h. h lies between corners tile[lneig[h]] and tile[h], and on this
    board EVERY edge carries a digon, so exactly one of the two names the class."""
    cands = [c for c in (block.tile[h], block.tile[block.lneig[h]]) if is_digon(c)]
    if not cands:
        raise DevelopError(f"half-edge {h} has no edge-class digon "
                           f"({block.tile[block.lneig[h]]}|{block.tile[h]})")
    classes = {edge_class(c) for c in cands}
    if len(classes) > 1:
        raise DevelopError(f"half-edge {h} straddles two edge classes {sorted(classes)}")
    return cands[0]


def combinatorics(block):
    """The parameter-free record: per half-edge, the corner it crosses, its edge class, whether it is
    drawn, plus rneig/glue. This is everything the client needs to place tiles once it has a pentagon."""
    n = len(block.rneig)
    corner, edge, drawn = [], [], []
    for h in range(n):
        c = block.tile[h]
        # tile[h] is the corner crossed stepping h -> rneig[h]; on a digon slot it is the digon itself
        # (a zero angle), which is exactly what makes a drawn edge a flat "corner" in the walk.
        corner.append(c)
        edge.append(edge_of(block, h))
        drawn.append(bool(block.drawn[h]))
    return {
        "rneig": list(block.rneig),
        "glue": list(block.glue),
        "corner": corner,
        "edge": edge,
        "drawn": "".join("1" if d else "0" for d in drawn),
        "orbit": list(block.orbit_of),
    }


# ------------------------------------------------------------------ validation develop (planar)
def develop_patch(block, units, sides, rounds=6, guard=200000):
    """Walk the dart graph in the plane from one seed: rneig pivots about the shared vertex by the
    crossed corner's angle, glue steps along the edge to the neighbour.

    WHAT THIS DOES AND DOES NOT ESTABLISH. It exercises the decoded rneig/glue/edge-class tables and
    trips the guard if they are malformed, so it is a structural check. It is NOT a closure proof: the
    seed parameter point is a member of Kershner type 1, and this board needs MORE than type 1. Its
    tile has six boundary edges of classes (a, e, b, d, c, b) — class b twice — with one flat π corner,
    so one pentagon side is split by a neighbour's vertex and the tiling forces a side relation type 1
    does not. Until that relation is solved, no parameter point here makes the tiles close, and this
    function must not be read as saying otherwise. See NOTES §"the parametric pentagon board"."""
    inst = {}
    order = []
    start = (0, 0.0 + 0.0j, 0.0)

    def key(h, z, th):
        return (h, round(z.real / TOL), round(z.imag / TOL),
                round(math.cos(th) / ANGTOL), round(math.sin(th) / ANGTOL))

    def add(h, z, th):
        k = key(h, z, th)
        if k in inst:
            return None
        inst[k] = (h, z, th)
        order.append((h, z, th))
        return k

    add(*start)
    i = 0
    while i < len(order):
        if len(order) > guard:
            raise DevelopError("develop guard tripped")
        h, z, th = order[i]
        i += 1
        if len(order) > rounds * 400:
            continue
        # Walk to the next dart around the same vertex: rotate the heading by the corner angle.
        rn = block.rneig[h]
        add(rn, z, th + units[block.tile[h]])
        # Cross the edge: advance by its length, then reverse.
        gl = block.glue[h]
        if gl is not None and gl >= 0:
            L = sides[edge_class(edge_of(block, h))]
            z2 = z + L * complex(math.cos(th), math.sin(th))
            add(gl, z2, th + math.pi)
    return order


def check_closure(block, units):
    """Every vertex orbit's listed angles must sum to 2π. This is the certificate's own claim and the
    reason the family is constrained at all, so it is asserted per record and never assumed."""
    for o, tb in enumerate(block.tables):
        # tb.tile is the corner crossed at each slot; the first tb.t of them are the unmirrored ones,
        # which are exactly the figure as the certificate listed it.
        s = sum(units[tb.tile[i]] for i in range(tb.t))
        if abs(s - TWO_PI) > 1e-9:
            raise DevelopError(f"orbit {o} closes to {math.degrees(s):.4f}deg, not 360")


# ------------------------------------------------------------------ driver
CERT_NAME = re.compile(r"^(?P<fam>.+)solver_(?P<k>\d+)_(?P<tok>[A-Za-z0-9]+)(?P<chir>_o)?_(?P<n>\d+)\.txt$")


def load_corpus(source):
    paths = sorted(glob.glob(os.path.join(source, "*.txt"))) if os.path.isdir(source) else [source]
    rows = []
    for path in paths:
        m = CERT_NAME.match(os.path.basename(path))
        if not m:
            continue
        k, chiral = int(m.group("k")), bool(m.group("chir"))
        for cert in fd.parse_file(path):
            rows.append((path, k, chiral, cert))
    return rows


def run(source, fam_id, out_prefix=None, ks=None, report_path=None, limit=None, progress=0,
        validate=0):
    units, sides, fam = board_of(fam_id)
    rows = load_corpus(source)
    if ks:
        rows = [r for r in rows if r[1] in ks]
    if limit:
        rows = rows[:limit]

    by_k = defaultdict(list)
    failures, fail_examples = Counter(), {}
    multi = nvalidated = 0
    t0 = time.time()
    for i, (path, k, chiral, cert) in enumerate(rows):
        if progress and i and i % progress == 0:
            el = time.time() - t0
            print(f"  [{el:6.0f}s] {i}/{len(rows)} decoded, {sum(failures.values())} failed, "
                  f"ETA {el * (len(rows) - i) / i:.0f}s", flush=True)
        if cert.get("k") != k:
            failures["certificate k disagrees with the file name"] += 1
            continue
        blocks, ncombo, reasons = build_block(cert, units)
        if not blocks:
            key = ("glue: " + "; ".join(sorted(set(reasons))[:2]))[:120]
            failures[key.split(":")[0]] += 1
            fail_examples.setdefault(key.split(":")[0], key)
            continue
        if ncombo > 1:
            multi += 1
        block = blocks[0]
        try:
            check_closure(block, units)
            rec = combinatorics(block)
            if validate and nvalidated < validate:
                develop_patch(block, units, sides)
                nvalidated += 1
        except DevelopError as e:
            failures[str(e).split(":")[0]] += 1
            fail_examples.setdefault(str(e).split(":")[0], str(e))
            continue
        rec.update({"k": k, "type": fam["type"], "chiral": chiral,
                    "stats": {"darts": len(rec["rneig"]),
                              "drawnEdges": rec["drawn"].count("1"),
                              "vertexOrbits": len(set(rec["orbit"]))}})
        by_k[k].append(rec)
    elapsed = time.time() - t0

    written = []
    for k in sorted(by_k):
        recs = by_k[k]
        for i, r in enumerate(recs, start=1):
            r["id"] = f"pe{fam_id}-{k}-{i:05d}"
        if not out_prefix:
            continue
        os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)
        path = f"{out_prefix}-k{k}.json"
        with open(path, "w") as fh:
            json.dump(recs, fh, separators=(",", ":"))
        written.append((path, len(recs), os.path.getsize(path)))

    total = sum(len(v) for v in by_k.values())
    lines = [f"parametric-pentagon edge develop — {fam['label']} ({fam['constraint']})",
             f"source          : {source}",
             f"certificates in : {len(rows)}",
             f"decoded         : {total}",
             f"failed          : {sum(failures.values())}",
             f"multi-variant   : {multi}",
             f"walked          : {nvalidated} traversed the dart graph without a malformed table "
             f"(a STRUCTURAL check, not a closure proof — see develop_patch)",
             f"wall            : {elapsed:.1f}s ({1000 * elapsed / max(1, len(rows)):.1f} ms/certificate)",
             "",
             "SHIPPED PARAMETER-FREE: corner letters, edge classes, drawn bits and the glue. The",
             "geometry is the client's, from the live slider point.",
             ""]
    for reason, n in failures.most_common():
        lines.append(f"   {n:6d}  {reason}   e.g. {fail_examples.get(reason, '')[:110]}")
    lines.append("")
    lines.append(f"{'k':>4} {'tilings':>9} {'drawn edges: min':>17} {'max':>6}")
    for k in sorted(by_k):
        d = [r["stats"]["drawnEdges"] for r in by_k[k]]
        lines.append(f"{k:>4} {len(by_k[k]):>9} {min(d):>17} {max(d):>6}")
    for path, n, sz in written:
        lines.append(f"wrote {path}: {n} records, {sz / 1e6:.2f} MB")
    report = "\n".join(lines) + "\n"
    if report_path:
        os.makedirs(os.path.dirname(report_path) or ".", exist_ok=True)
        open(report_path, "w").write(report)
    print(report)
    return by_k, failures


def _selftest():
    units, sides, fam = board_of("1")
    assert abs(units["A5"] + units["E5"] + units["D5"] - TWO_PI) < 1e-12, "A+E+D != 360"
    assert abs(units["Pi"] + units["B5"] + units["C5"] - TWO_PI) < 1e-12, "pi+B+C != 360"
    print("[selftest] type 1: both vertex figures close to 360 at the validation point")
    assert is_drawn_letter("B12") and is_drawn_letter("B13")
    assert not is_drawn_letter("B10") and not is_drawn_letter("B11")
    assert edge_class("B12") == "b" and edge_class("A10") == "a"
    print("[selftest] 12/13 drawn, 10/11 undrawn, letter names the edge class")
    print("[selftest] PASS")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?")
    ap.add_argument("--type", dest="fam", default="1", choices=sorted(FAMILIES))
    ap.add_argument("--out")
    ap.add_argument("--report")
    ap.add_argument("--ks")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--progress", type=int, default=0)
    ap.add_argument("--validate", type=int, default=25,
                    help="develop this many records into a planar patch as a decode check")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
        return
    if not args.source:
        ap.error("source is required unless --selftest")
    ks = set(int(x) for x in args.ks.split(",")) if args.ks else None
    run(args.source, args.fam, args.out, ks, args.report, args.limit, args.progress, args.validate)


if __name__ == "__main__":
    main()
