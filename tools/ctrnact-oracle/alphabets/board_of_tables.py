#!/usr/bin/env python3
"""board_of_tables.py <tables.py> [kmin kmax]: a Tiling Searcher board from a palette's compiled alphabet.

gen_alphabet.py compiles a palette into vertex types and corner classes (tables/<palette>/tables.py), and that is
all eu_solver's search reads (docs/superpowers/specs/2026-11-08-one-engine-audit.md). A board says the same
thing in the Searcher's terms:
  - one `angle` line per corner class, its angle in degrees (the engines read none; the app draws with them);
  - one `face` line per tile: its corner cycle by CLASS_NEXT, repeated to its CLASS_L corners;
  - one `vertex` line per corner word. The symmetry variants of a word (the S/R/A/F suffixes) are one line:
    the Searcher derives them, as gen_alphabet does.
  - edge types (ETYPE) as the Searcher writes them: an `edge` symbol in the middle of every tile edge, and a
    two-corner `vertex` line for each pair of types that may meet (like types, or unlike ones on a palette
    with edgeComplement; type 0 meets any).
A vertex of fewer than three corners does not count towards k in either engine (COUNTING 0 here, flat there).
Refused: an edge whose type the search chooses (the freedraw palettes: a corner class met with two types).
A corner and its mirror twin (CLASS_SIGMA: dihex, domino and other polyforms) share one symbol, and a tile and
its mirror image one face line. On those palettes eu_solver's own counts are no reference (it writes one tiling
on several period cells, which the shelf builders merge by geometry): compare with the shelf, shelf.sh.
"""
import importlib.util
import json
import os
import re
import sys


def load(path):
    spec = importlib.util.spec_from_file_location("tables", path)
    t = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(t)
    return t


def board(t, name, kmin, kmax, complement=False):
    # a dart's type is the type of its left corner's tile edge, the one before that corner in CLASS_NEXT order
    before = {}
    for labels, cls, ety in zip(t.LABELS, t.CLS, getattr(t, "ETYPE", [])):
        for c, e in zip(cls, ety):
            before.setdefault(c, set()).add(e)
    edged = any(e for es in before.values() for e in es)
    if edged and any(len(es) > 1 for es in before.values()):
        sys.exit("an edge type chosen by the search (a corner class met with two types) is not carried to boards yet")
    # A corner and its mirror twin (CLASS_SIGMA) are one symbol: the Searcher reflects a word by reversing it, and
    # with the twins merged that is eu_solver's reflection (reverse, then each corner's twin). Nothing is lost: a
    # face is read clockwise, so its word still says which twin each corner is.
    twin = list(getattr(t, "CLASS_SIGMA", [])) or list(range(len(t.CLASS_DISP)))
    # a class shown as a bare number is a regular polygon's corner, A<n> in Marek's encoding; the rest are names
    sym, used = [], set()
    for c, disp in enumerate(t.CLASS_DISP):
        if twin[c] < c:
            sym.append(sym[twin[c]])
            continue
        s = "A" + disp if re.fullmatch(r"\d+", disp) else "A" + disp.replace("*", "").replace("@", ".")  # `@` is a colour on a board
        while s in used:
            s += "_"
        used.add(s)
        sym.append(s)
    by_disp = {d: c for c, d in enumerate(t.CLASS_DISP)}
    if len(by_disp) != len(t.CLASS_DISP):
        sys.exit("two corner classes share a display name, so a vertex symbol cannot be read")
    lines = [f"name {name}", f"k {kmin} {kmax}", ""]
    for c, s in enumerate(sym):
        if twin[c] < c:
            continue
        deg = t.CLASS_UNITS[c] * 360 / t.D
        lines.append(f"angle {s} {deg:g}" if deg == round(deg, 6) else f"angle {s} {deg:.6f}")
    if edged:
        types = sorted({e for es in before.values() for e in es})
        lines += [f"edge E{e}" for e in types]
    lines.append("")
    least = lambda w: min(tuple(v[j:] + v[:j]) for v in (w, w[::-1]) for j in range(len(w)))  # up to rotation and reflection
    faces = set()
    for tile in sorted(set(t.CLASS_TILE)):
        c0 = min(c for c, x in enumerate(t.CLASS_TILE) if x == tile)
        cycle, c = [], c0
        while True:
            cycle.append(c)
            c = t.CLASS_NEXT[c]
            if c == c0:
                break
        if t.CLASS_L[c0] % len(cycle):
            sys.exit(f"tile {t.TILE_NAME[tile]}: corner cycle {len(cycle)} does not divide its {t.CLASS_L[c0]} corners")
        if edged and any(c not in before for c in cycle):
            continue  # a tile no vertex type uses
        word = [s for c in cycle for s in ([f"E{min(before[c])}"] if edged else []) + [sym[c]]]
        key = least(word * (t.CLASS_L[c0] // len(cycle)))
        if key not in faces:  # a tile's mirror image reads as the same face
            faces.add(key)
            lines.append(f"face {' '.join(word)} x {t.CLASS_L[c0] // len(cycle)}")
    if not faces or not t.SYMBOLS:
        sys.exit("an empty alphabet: no vertex type, or no tile whose every corner occurs in one")
    lines.append("")
    seen = set()
    for i, s in enumerate(t.SYMBOLS):
        word = [by_disp[d] for d in s[1 : s.index(")")].split(",")]
        if (len(word) < 3) == bool(t.COUNTING[i]):
            sys.exit(f"vertex type {s}: counting {t.COUNTING[i]} with {len(word)} corners")
        key = least([sym[c] for c in word])
        if key not in seen:
            seen.add(key)
            lines.append("vertex " + " ".join(sym[c] for c in word))
    if edged:
        lines += [f"vertex E{a} E{b}" for i, a in enumerate(types) for b in types[i:] if not a or not b or (a != b) == complement]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    path = sys.argv[1]
    kmin, kmax = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (1, 4)
    name = re.sub(r"^(?:.*/)?tables/([^/]+)/tables\.py$", r"\1", path)
    try:  # edgeComplement is the palette's, and the solver's EU_EDGE_COMPL; the tables do not record it
        complement = bool(json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "palettes", name + ".json"))).get("edgeComplement"))
    except OSError:
        complement = False
    sys.stdout.write(board(load(path), name, kmin, kmax, complement))
