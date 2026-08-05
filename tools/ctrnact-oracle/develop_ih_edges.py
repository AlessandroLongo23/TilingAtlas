#!/usr/bin/env python3
"""Decode Marek Čtrnáct's `edges_isohedral_IH<nn>` certificates — edge systems on a PARAMETRIC
isohedral tile — into records the client realises at any point of the type's parameter family.

SAME SHAPE AS develop_pent_edges.py, DIFFERENT BOARD. Both decorate a tile whose geometry is a free
parameter rather than forced by a vertex figure, so both ship combinatorics only:

  * which corner of the tile sits at each dart of each vertex orbit,
  * which edge CLASS each half-edge belongs to,
  * whether that edge is drawn,
  * how the darts glue.

Nothing there moves when a parameter moves. What differs from the pentagon board is where the geometry
comes from at the far end: the pentagon needed its own closure solver (its tile has a split side and
lib/pentagon/types.ts's type 1 side defaults do not close it), whereas an isohedral type is ALREADY
parameterised, by Craig Kaplan's Tactile, vendored at lib/isohedral/vendor and driving /isohedral. So
this file has no geometry in it at all, not even a validation point.

IH01, the only board so far. Tactile reports it as numVertices 6, numEdgeShapes 3, edgeWord "abcABC" —
a hexagon whose opposite edges pair by translation — and the corpus says exactly the same thing without
being asked:

    A -a- B -b- C -c- D -a- E -b- F -c- A

every corner followed by a fixed class (A→a, B→b, C→c, D→a, E→b, F→c) across all 88,085 occurrences,
and vertices only ever {A,C,E} or {B,D,F}, so A+C+E = B+D+F = 360° and the six sum to a hexagon's 720°.

THE ALPHABET, measured and asserted rather than assumed:

  A6 … F6   the hexagon presented at corner A … F
  X10, X11  an UNDRAWN half-edge slot of edge class x
  X12, X13  a DRAWN one

Each class gets four letters because each class occurs TWICE on the tile, so it needs two slots. The
10/11 ↔ 12/13 split is measured the same way it was on the pentagon board: exactly ONE certificate of
the 69,389 carries no 12/13 letter at all, and that one is the bare board. It sits at k = 2, which is
also why the census has nothing at k = 1 — the undecorated tiling already has two vertex orbits.

Usage:
    develop_ih_edges.py <corpus-dir> --board IH01 --out public/isohedral-edges/ie01 --report ...
    develop_ih_edges.py --selftest
"""
import argparse
import glob
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

import develop_freedraw as fd
from develop_freedraw import DevelopError

# The isohedral boards Marek has edge solvers for. `corners` is the tile's corner letters in the order
# his alphabet uses them, `classes` its edge classes. `sides` is the cyclic boundary as (corner, class
# leaving it) — derived from the corpus, ASSERTED against it by `check_incidence`, and the one thing the
# client needs in order to line his labels up with Tactile's own vertex and edge-shape indexing.
BOARDS = {
    "IH01": {
        "ih": 1,
        "label": "IH01",
        "corners": ["A", "B", "C", "D", "E", "F"],
        "classes": ["a", "b", "c"],
        "sides": [("A", "a"), ("B", "b"), ("C", "c"), ("D", "a"), ("E", "b"), ("F", "c")],
        # Tactile's own description of the same tile, for the client to check itself against.
        "tactile": {"numVertices": 6, "numEdgeShapes": 3, "edgeWord": "abcABC"},
        # Corners meeting at one tiling vertex. 3 on both boards so far; a board fact, not a constant,
        # because `alphabet` divides 2*pi by it and a 4-valent board would silently get wrong placeholders.
        "vertex_corners": 3,
        # Tactile aspects. ONE means every tile is a translate of every other, which is what makes
        # `corner -> class leaving it` a FUNCTION on this board and lets `check_incidence` demand equality.
        "aspects": 1,
        "solver": "pt_edges_isohedral_IH01.exe",
    },
    "IH02": {
        "ih": 2,
        "label": "IH02",
        # Corner letters in TACTILE's tilingVertices order, which is NOT alphabetical here — see the
        # note on `aspects` below for why the corpus alone cannot order them and what pinned this.
        "corners": ["F", "A", "B", "C", "D", "E"],
        "classes": ["a", "b", "c"],
        "sides": [("F", "a"), ("A", "a"), ("B", "b"), ("C", "c"), ("D", "c"), ("E", "b")],
        "tactile": {"numVertices": 6, "numEdgeShapes": 3, "edgeWord": "aabccB"},
        "vertex_corners": 3,
        # TWO aspects: the tiling contains reflected copies, so going round a vertex you meet a tile
        # either way about, and the digon following a corner is one side of it on a direct tile and the
        # OTHER side on a reflected one. So `corner -> class` is not a function here — the corpus gives
        # B and F two classes each — and `check_incidence` weakens to containment on this board.
        "aspects": 2,
        "solver": "pt_edges_isohedral_IH02.exe",
    },
    "IH03": {
        "ih": 3,
        "label": "IH03",
        # PROVISIONAL corner order until scripts/solve-ih-board.ts has records to test against; the
        # decoded record depends only on the LETTERS, so this is safe to decode with and fix after.
        "corners": ["A", "B", "C", "D", "E", "F"],
        "classes": ["a", "b", "c"],
        "sides": [("A", "a"), ("B", "b"), ("C", "a"), ("D", "c"), ("E", "b"), ("F", "c")],
        "tactile": {"numVertices": 6, "numEdgeShapes": 3, "edgeWord": "abacBc"},
        "vertex_corners": 3,
        "aspects": 2,
        "solver": "pt_edges_isohedral_IH03.exe",
    },
    "IH04": {
        "ih": 4,
        "label": "IH04",
        # PROVISIONAL until scripts/solve-ih-board.ts has records; the decoded record depends only on the
        # LETTERS. FIVE classes here, and only `b` occurs twice — the other four get one digon slot each,
        # which is why the alphabet is 12 letters and not 20.
        "corners": ["A", "B", "C", "D", "E", "F"],
        "classes": ["a", "b", "c", "d", "e"],
        "sides": [("A", "a"), ("B", "b"), ("C", "c"), ("D", "d"), ("E", "b"), ("F", "e")],
        "tactile": {"numVertices": 6, "numEdgeShapes": 5, "edgeWord": "abcdBe"},
        "vertex_corners": 3,
        "aspects": 2,
        "solver": "pt_edges_isohedral_IH04.exe",
    },
    "IH05": {
        "ih": 5,
        "label": "IH05",
        # PROVISIONAL until scripts/solve-ih-board.ts has records; the decoded record depends only on the
        # LETTERS. FOUR aspects, the first board past two, so `check_incidence` runs in its weakened
        # containment form. Classes `a` and `d` occur once each and so carry no direction bit; both are
        # Tactile S edges, which are their own reverse, so nothing needs one.
        "corners": ["A", "B", "C", "D", "E", "F"],
        "classes": ["a", "b", "c", "d"],
        "sides": [("A", "a"), ("B", "b"), ("C", "c"), ("D", "c"), ("E", "b"), ("F", "d")],
        "tactile": {"numVertices": 6, "numEdgeShapes": 4, "edgeWord": "abccBd"},
        "vertex_corners": 3,
        "aspects": 4,
        "solver": "pt_edges_isohedral_IH05.exe",
    },
    "IH06": {
        "ih": 6,
        "label": "IH06",
        # PROVISIONAL until scripts/solve-ih-board.ts has records. Four aspects again, and the same
        # single-slot arrangement IH05 has: `a` and `c` occur once each and are the two S edges.
        "corners": ["A", "B", "C", "D", "E", "F"],
        "classes": ["a", "b", "c", "d"],
        "sides": [("A", "a"), ("B", "b"), ("C", "c"), ("D", "d"), ("E", "b"), ("F", "d")],
        "tactile": {"numVertices": 6, "numEdgeShapes": 4, "edgeWord": "abcdbd"},
        "vertex_corners": 3,
        "aspects": 4,
        "solver": "pt_edges_isohedral_IH06.exe",
    },
    "IH07": {
        "ih": 7,
        "label": "IH07",
        # PROVISIONAL until scripts/solve-ih-board.ts has records. THREE aspects, and the first board
        # with rotation centres: three of its six corners are 120° and meet three copies of themselves,
        # which the corpus reports either in full (`BBB`, tagged F) or quotiented (`B`, tagged C3).
        "corners": ["A", "B", "C", "D", "E", "F"],
        "classes": ["a", "b", "c"],
        "sides": [("A", "a"), ("B", "a"), ("C", "b"), ("D", "b"), ("E", "c"), ("F", "c")],
        "tactile": {"numVertices": 6, "numEdgeShapes": 3, "edgeWord": "aAbBcC"},
        "vertex_corners": 3,
        "aspects": 3,
        "solver": "pt_edges_isohedral_IH07.exe",
    },
    "IH08": {
        "ih": 8,
        "label": "IH08",
        # ⚑ The first board whose corner letters REPEAT. Its word `abcabc` repeats with period three, so
        # its six corners fall into three classes and the corpus names only A, B, C — still A6/B6/C6,
        # because the tile is still a hexagon. One aspect, three S edges, and the only board so far with
        # odd k in its census (its bare tiling has ONE vertex orbit, so the shelf starts at k=1).
        "corners": ["A", "B", "C", "A", "B", "C"],
        "classes": ["a", "b", "c"],
        "sides": [("A", "a"), ("B", "b"), ("C", "c"), ("A", "a"), ("B", "b"), ("C", "c")],
        "tactile": {"numVertices": 6, "numEdgeShapes": 3, "edgeWord": "abcabc"},
        "vertex_corners": 3,
        "aspects": 1,
        "solver": "pt_edges_isohedral_IH08.exe",
    },
    "IH09": {
        "ih": 9,
        "label": "IH09",
        # PROVISIONAL until scripts/solve-ih-board.ts has records. Corner letters repeat, like IH08's:
        # `abbabb` at period three. TWO edge classes, the fewest so far; `a` is the S edge and occurs
        # twice with one slot, `b` is the J edge and occurs four times with two.
        "corners": ["A", "B", "C", "A", "B", "C"],
        "classes": ["a", "b"],
        "sides": [("A", "a"), ("B", "b"), ("C", "b"), ("A", "a"), ("B", "b"), ("C", "b")],
        "tactile": {"numVertices": 6, "numEdgeShapes": 2, "edgeWord": "abbabb"},
        "vertex_corners": 3,
        "aspects": 2,
        "solver": "pt_edges_isohedral_IH09.exe",
    },
    "IH10": {
        "ih": 10,
        "label": "IH10",
        # The most degenerate board there is, and the only labelling that survives at all: ONE corner
        # letter, ONE edge class, and ZERO parameters — Tactile hands back a single fixed tile, the
        # regular hexagon. Nothing here needed solving; nothing here could be got wrong. It is also the
        # first corpus with MIRROR site tags (`Aa`, `Ac`, `D6a`) beside the rotation centres.
        "corners": ["A", "A", "A", "A", "A", "A"],
        "classes": ["a"],
        "sides": [("A", "a"), ("A", "a"), ("A", "a"), ("A", "a"), ("A", "a"), ("A", "a")],
        "tactile": {"numVertices": 6, "numEdgeShapes": 1, "edgeWord": "aAaAaA"},
        "vertex_corners": 3,
        "aspects": 1,
        "solver": "pt_edges_isohedral_IH10.exe",
    },
}

CORNER_RE = re.compile(r"^([A-Z])(\d+)$")


def is_corner(letter, board):
    """⚑ The number in a corner letter is the tile's SIDE count, NOT how many corner letters the board
    has. Those agreed on IH01 to IH07, six each, and IH08 is where they part: its boundary word `abcabc`
    repeats with period three, so its six corners fall into THREE classes and the corpus names only
    A, B, C — still as A6, B6, C6, because the tile is still a hexagon."""
    m = CORNER_RE.match(letter)
    return bool(m) and m.group(1) in board["corners"] and int(m.group(2)) == len(board["sides"])


def is_digon(letter, board):
    m = CORNER_RE.match(letter)
    return bool(m) and m.group(1).lower() in board["classes"] and 10 <= int(m.group(2)) <= 13


def edge_class(letter):
    return letter[0].lower()


def is_drawn_letter(letter, board):
    """12/13 drawn, 10/11 undrawn — the measured convention (see the module docstring)."""
    return is_digon(letter, board) and int(letter[1:]) in (12, 13)


def alphabet(board):
    """{letter: angle} with every angle a PLACEHOLDER. The corners carry no numeric angle here: an
    isohedral type's corner angles are functions of its parameters, and this file ships no geometry, so
    the only thing the tables need from `units` is which letters are zero-angle digons. Placeholders are
    chosen to sum to 2π over a vertex so `vtable_variants` computes rotation order 1, which is what the
    corpus's F tags say every site is."""
    share = 2 * 3.141592653589793 / board["vertex_corners"]
    units = {f"{c}{len(board['corners'])}": share for c in board["corners"]}
    for c in board["classes"]:
        for d in (10, 11, 12, 13):
            units[f"{c.upper()}{d}"] = 0.0
    return units


def vtable_variants_ih(figure, tag, board, units):
    """develop_pent_edges.vtable_variants_pent with this board's digon set."""
    for c in figure:
        if c not in units:
            raise DevelopError(f"letter {c} not in the {board['label']} alphabet")
    t = len(figure)
    m = re.fullmatch(r"(F|C\d+|A[a-z0-9]*|D\d+[a-z]?)(x\d+)?", tag or "F")
    if not m:
        raise DevelopError(f"unrecognised site tag {tag!r}")
    head = m.group(1)
    digons = tuple(l for l in units if is_digon(l, board))
    drawn = tuple(l for l in digons if is_drawn_letter(l, board))
    kw = {"digons": digons, "drawn_letters": drawn}
    if head == "F" or head.startswith("C"):
        return [fd.VTable(figure, units, chiral=True, **kw)]
    axes = [a for a in range(t) if all(figure[s] == figure[(a - s - 1) % t] for s in range(t))]
    if not axes:
        raise DevelopError(f"tag {tag} claims a mirror but figure {figure} admits none")
    return [fd.VTable(figure, units, chiral=False, axis=a, **kw) for a in axes]


def build_block(cert, board, units):
    variant_lists = [vtable_variants_ih(t["figure"], t["tag"], board, units) for t in cert["types"]]
    combos = [[]]
    for vl in variant_lists:
        combos = [c + [v] for c in combos for v in vl]
    out, reasons = [], []
    for tables in combos:
        try:
            # Grid name deliberately absent from develop_freedraw.GRIDS, so Block makes no ring or
            # edge-length assumption and is used purely for its glue — the parameter-free half.
            out.append(fd.Block(cert, tables, "ih"))
        except DevelopError as e:
            reasons.append(str(e))
    return out, len(combos), reasons


def edge_of(block, h, board):
    """The edge class of half-edge h. Every edge on these boards carries a digon (drawn or undrawn), so
    exactly one of the two corners flanking h names the class."""
    cands = [c for c in (block.tile[h], block.tile[block.lneig[h]]) if is_digon(c, board)]
    if not cands:
        raise DevelopError(f"half-edge {h} has no edge-class digon")
    classes = {edge_class(c) for c in cands}
    if len(classes) > 1:
        raise DevelopError(f"half-edge {h} straddles two edge classes {sorted(classes)}")
    return cands[0]


def site_rotation_order(tag):
    """How much of a vertex a site figure lists: the ROTATIONAL order of its site group.

      `F`, `A*`  1, the whole turn. `A*` is a mirror site, and a mirror folds a figure's ORDER without
                 folding its angle sum, so it lists every corner just as `F` does.
      `Cn`       n. A pure n-fold centre, so the figure is a 1/n of the vertex (IH07's `C3`).
      `Dn`       n/2. ⚑ NOT n: a dihedral group of order n has n/2 rotations, and it is the rotations
                 that divide the turn. IH10's `D6a` lists ONE 120-degree corner, which closes at 360/3
                 and not at 360/6. Reading D6 as sixfold, or as onefold, throws the board out.
    """
    m = re.match(r"([CD])(\d+)", tag or "F")
    if not m:
        return 1
    n = int(m.group(2))
    if m.group(1) == "C":
        return n
    if n % 2:
        raise DevelopError(f"site tag {tag} names a dihedral group of odd order {n}")
    return n // 2


def corner_classes(board):
    """Per corner letter, the classes of the two sides meeting there — read off the declared boundary.

    On a ONE-aspect board every tile is met the same way round, so the digon following a corner is
    always the side LEAVING it and the map is a function. With two aspects a reflected tile is met the
    other way about and the side ENTERING the corner shows up instead, so both are legal.

    A corner letter can occur MORE THAN ONCE on the boundary (IH08's `abcabc` puts A, B and C at two
    corners each), so this unions over every occurrence instead of overwriting, which would have kept
    only the last one's classes and rejected the other three."""
    n = len(board["sides"])
    out = {}
    for i, (corner, cls) in enumerate(board["sides"]):
        prev = board["sides"][(i - 1) % n][1]
        seen = out.setdefault(corner, set())
        seen.add(cls)
        if board.get("aspects", 1) != 1:
            seen.add(prev)
    return out


def check_incidence(cert, board):
    """The corpus must agree with the board's declared boundary: every corner is followed around a
    vertex by a class the table allows there, and the corner sets meeting at a vertex have the size the
    board declares. This is the assertion that keeps BOARDS honest against a new drop.

    Containment, not equality, and only because of aspects: a corner whose two sides carry different
    classes can legitimately show either one, and a corner that never happens to be met on a reflected
    tile in a given certificate shows only one of them. Demanding equality here rejected every IH02
    record. What it still catches is a class that has no business at that corner at all.

    ⚑ A SITE TAGGED `Cn` LISTS A THIRD, OR AN nTH, OF A VERTEX. IH01 to IH06 tag every site `F` and show
    all three corners, so the count was a constant. IH07 has 3-fold rotation centres: `(C11, F6)C3` is a
    whole vertex where three copies of the SAME corner meet, quotiented by the rotation, so it lists ONE
    corner and not three. The count to expect is `vertex_corners / n`."""
    allowed = corner_classes(board)
    for t in cert["types"]:
        fig = t["figure"]
        for i, x in enumerate(fig):
            if not is_corner(x, board):
                continue
            nxt = fig[(i + 1) % len(fig)]
            if not is_digon(nxt, board):
                raise DevelopError(f"corner {x} is not followed by a digon")
            if edge_class(nxt) not in allowed[x[0]]:
                raise DevelopError(f"corner {x[0]} followed by class {edge_class(nxt)}, "
                                   f"not one of {sorted(allowed[x[0]])} as BOARDS says")
        order = site_rotation_order(t["tag"])
        want, rem = divmod(board["vertex_corners"], order)
        if rem:
            raise DevelopError(f"site tag {t['tag']} claims {order}-fold, which does not divide "
                               f"{board['vertex_corners']} corners")
        corners = sorted(x[0] for x in fig if is_corner(x, board))
        if len(corners) != want:
            raise DevelopError(f"vertex has {len(corners)} corners, not {want} as tag {t['tag']} says")


def combinatorics(block, board):
    """The parameter-free half of a record, with the drawn bit resolved PER EDGE and not per dart.

    ⚑ AN EDGE IS DRAWN IFF EITHER OF ITS TWO DARTS SAYS SO. On IH01 to IH05 the two always agree and
    this is a no-op — decoding those five before and after is byte-identical. IH06 is where it matters:
    its class `c` marks a drawn edge on ONE END ONLY, giving the pair (C10, C12) where every other
    single-slot class on every other board gives (C10, C10) or (C12, C12). Read per dart, 10 of the 14
    records at k=4 develop into a figure with NO period at all — the drawn set then depends on which
    dart the walk reached the edge from, and the shelf would draw something that is not a tiling.

    WHY `or` AND NOT `and`, since both make every IH06 record periodic and the geometry cannot tell
    them apart: under `and` no c-edge on IH06 could ever be drawn, so the board's full 1-skeleton —
    every edge drawn, a perfectly good edge system and one that a complete enumeration must contain —
    would be absent from the corpus. Under `or` it is there, at k=4 (ie06-4-00013 and -00014, 24 of 24).
    A solver does not emit a letter, 40 times in the k<=4 slice alone, that marks nothing.

    ⚑ STILL UNCONFIRMED BY MAREK. This is inference from his data, not something he has stated. The
    per-board disagreement count is reported so the anomaly stays visible instead of being smoothed
    away silently; if he says otherwise it is this function that changes, and nothing else.
    """
    n = len(block.rneig)
    drawn = [bool(block.drawn[h]) for h in range(n)]
    disagreed = 0
    for h in range(n):
        g = block.glue[h]
        if g < 0 or g <= h:
            continue
        if drawn[h] != drawn[g]:
            disagreed += 1
            drawn[h] = drawn[g] = True
    return {
        "rneig": list(block.rneig),
        "glue": list(block.glue),
        "corner": [block.tile[h] for h in range(n)],
        "edge": [edge_of(block, h, board) for h in range(n)],
        "drawn": "".join("1" if d else "0" for d in drawn),
        "orbit": list(block.orbit_of),
        "_disagreed": disagreed,
    }


CERT_NAME = re.compile(r"^(?P<fam>.+)solver_(?P<k>\d+)_(?P<tok>[A-Za-z0-9]+)(?P<chir>_o)?_(?P<n>\d+)\.txt$")


def load_corpus(source, ks=None):
    paths = sorted(glob.glob(os.path.join(source, "*.txt"))) if os.path.isdir(source) else [source]
    rows = []
    for path in paths:
        m = CERT_NAME.match(os.path.basename(path))
        if not m:
            continue
        k, chiral = int(m.group("k")), bool(m.group("chir"))
        if ks and k not in ks:
            continue
        for cert in fd.parse_file(path):
            rows.append((path, k, chiral, cert))
    return rows


def run(source, board_id, out_prefix=None, ks=None, report_path=None, limit=None, progress=0,
        budget=None):
    board = BOARDS[board_id]
    units = alphabet(board)

    # Per-k census first, so a budget can drop whole slices without parsing them.
    counts = Counter()
    for path in sorted(glob.glob(os.path.join(source, "*.txt"))):
        m = CERT_NAME.match(os.path.basename(path))
        if m:
            counts[int(m.group("k"))] += open(path).read().count("---")
    wanted, spent, dropped = [], 0, []
    for k in sorted(counts):
        if ks and k not in ks:
            continue
        if budget and spent + counts[k] > budget:
            dropped = [x for x in sorted(counts) if x >= k and (not ks or x in ks)]
            break
        wanted.append(k)
        spent += counts[k]

    rows = load_corpus(source, set(wanted))
    if limit:
        rows = rows[:limit]

    by_k = defaultdict(list)
    failures, fail_examples = Counter(), {}
    multi = 0
    one_sided = 0  # edges marked drawn at one end only — see combinatorics()
    t0 = time.time()
    for i, (path, k, chiral, cert) in enumerate(rows):
        if progress and i and i % progress == 0:
            el = time.time() - t0
            print(f"  [{el:6.0f}s] {i}/{len(rows)} decoded, {sum(failures.values())} failed, "
                  f"ETA {el * (len(rows) - i) / i:.0f}s", flush=True)
        if cert.get("k") != k:
            failures["certificate k disagrees with the file name"] += 1
            continue
        try:
            check_incidence(cert, board)
        except DevelopError as e:
            failures[str(e)[:60]] += 1
            continue
        blocks, ncombo, reasons = build_block(cert, board, units)
        if not blocks:
            key = ("glue: " + "; ".join(sorted(set(reasons))[:2]))[:80]
            failures[key.split(":")[0]] += 1
            fail_examples.setdefault(key.split(":")[0], key)
            continue
        if ncombo > 1:
            multi += 1
        try:
            rec = combinatorics(blocks[0], board)
        except DevelopError as e:
            failures[str(e)[:60]] += 1
            continue
        one_sided += rec.pop("_disagreed")
        rec.update({"k": k, "ih": board["ih"], "chiral": chiral,
                    "stats": {"darts": len(rec["rneig"]),
                              "drawnEdges": rec["drawn"].count("1"),
                              "vertexOrbits": len(set(rec["orbit"]))}})
        by_k[k].append(rec)
    elapsed = time.time() - t0

    written = []
    for k in sorted(by_k):
        recs = by_k[k]
        for i, r in enumerate(recs, start=1):
            r["id"] = f"ie{board['ih']:02d}-{k}-{i:05d}"
        if not out_prefix:
            continue
        os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)
        path = f"{out_prefix}-k{k}.json"
        with open(path, "w") as fh:
            json.dump(recs, fh, separators=(",", ":"))
        written.append((path, len(recs), os.path.getsize(path)))

    total = sum(len(v) for v in by_k.values())
    lines = [f"isohedral edge develop — {board['label']} (Tactile: {board['tactile']['edgeWord']}, "
             f"{board['tactile']['numVertices']} vertices, {board['tactile']['numEdgeShapes']} edge shapes)",
             f"source          : {source}",
             f"certificates in : {len(rows)}",
             f"decoded         : {total}",
             f"failed          : {sum(failures.values())}",
             f"multi-variant   : {multi}",
             f"wall            : {elapsed:.1f}s ({1000 * elapsed / max(1, len(rows)):.1f} ms/certificate)",
             "",
             f"one-sided marks : {one_sided}",
             "",
             "SHIPPED PARAMETER-FREE: corner letters, edge classes, drawn bits and the glue. The geometry",
             "is the client's, from Tactile at the live parameter point.",
             ""]
    if one_sided:
        lines.append(f"⚑ {one_sided} edges are marked drawn at ONE END ONLY, and are read as drawn. Zero on")
        lines.append("  IH01-IH05; see combinatorics() for why `or` and not `and`. UNCONFIRMED by Marek.")
        lines.append("")
    if dropped:
        lost = sum(counts[k] for k in dropped)
        lines.append(f"BUDGET: shipped k <= {max(wanted) if wanted else 0}; DROPPED k = {dropped} "
                     f"({lost} certificates). Enumerated and NOT shipped — the shelf must not read as exhausted.")
        lines.append("")
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
    return by_k, failures, dropped


def _selftest():
    b = BOARDS["IH01"]
    assert len(b["sides"]) == b["tactile"]["numVertices"], "boundary length != Tactile's vertex count"
    assert len({c for _, c in b["sides"]}) == b["tactile"]["numEdgeShapes"], "class count != Tactile's"
    # Every class occurs exactly twice, which is what "abcABC" means and why each needs two slots.
    per = Counter(c for _, c in b["sides"])
    assert set(per.values()) == {2}, per
    print("[selftest] IH01's boundary matches Tactile: 6 corners, 3 classes, each class twice")
    units = alphabet(b)
    assert is_corner("A6", b) and not is_corner("A10", b)
    assert is_digon("A10", b) and is_drawn_letter("A12", b) and not is_drawn_letter("A10", b)
    assert all(units[l] == 0.0 for l in units if is_digon(l, b))
    print("[selftest] alphabet: corners are X6, digons X10-X13, 12/13 drawn")
    print("[selftest] PASS")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?")
    ap.add_argument("--board", default="IH01", choices=sorted(BOARDS))
    ap.add_argument("--out")
    ap.add_argument("--report")
    ap.add_argument("--ks")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--budget", type=int, help="max certificates to ship, whole k slices, ascending k")
    ap.add_argument("--progress", type=int, default=0)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
        return
    if not args.source:
        ap.error("source is required unless --selftest")
    ks = set(int(x) for x in args.ks.split(",")) if args.ks else None
    run(args.source, args.board, args.out, ks, args.report, args.limit, args.progress, args.budget)


if __name__ == "__main__":
    main()
