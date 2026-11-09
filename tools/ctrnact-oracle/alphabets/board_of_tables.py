#!/usr/bin/env python3
"""board_of_tables.py <tables.py> [kmin kmax]: a Tiling Searcher board from a palette's compiled alphabet.

gen_alphabet.py compiles a palette into vertex types and corner classes (tables/<palette>/tables.py), and that is
all eu_solver's search reads (docs/superpowers/specs/2026-11-08-one-engine-audit.md). A board says the same
thing in the Searcher's terms:
  - one `angle` line per corner class, its angle in degrees (the engines read none; the app draws with them);
  - one `face` line per tile: its corner cycle by CLASS_NEXT, repeated to its CLASS_L corners;
  - one `vertex` line per corner word. The symmetry variants of a word (the S/R/A/F suffixes) are one line:
    the Searcher derives them, as gen_alphabet does.
A vertex of fewer than three corners does not count towards k in either engine (COUNTING 0 here, flat there).
Refused:
  - edge types (a nonzero ETYPE). Tables older than ETYPE have none.
  - corners with a mirror twin (CLASS_SIGMA not the identity: dihex, domino and other polyforms). eu_solver
    reflects a vertex by reversing its word and taking each corner's twin; the Searcher reverses the word only,
    and labels its corners without a mirror flag. Neither plain conversion nor one symbol per twin pair
    reproduces eu_solver's counts (dihex k <= 2: 8, 18 against 0, 0 and 4, 4), so the mapping is still open.
"""
import importlib.util
import re
import sys


def load(path):
    spec = importlib.util.spec_from_file_location("tables", path)
    t = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(t)
    return t


def board(t, name, kmin, kmax):
    if any(e for row in getattr(t, "ETYPE", []) for e in row):
        sys.exit("edge types are not carried to boards yet")
    if any(c != i for i, c in enumerate(getattr(t, "CLASS_SIGMA", []))):
        sys.exit("corners with a mirror twin (CLASS_SIGMA) are not carried to boards yet")
    # a class shown as a bare number is a regular polygon's corner, A<n> in Marek's encoding; the rest are names
    sym, used = [], set()
    for c, disp in enumerate(t.CLASS_DISP):
        s = "A" + disp if re.fullmatch(r"\d+", disp) else "A" + disp.replace("*", "")
        while s in used:
            s += "_"
        used.add(s)
        sym.append(s)
    by_disp = {d: c for c, d in enumerate(t.CLASS_DISP)}
    if len(by_disp) != len(t.CLASS_DISP):
        sys.exit("two corner classes share a display name, so a vertex symbol cannot be read")
    lines = [f"name {name}", f"k {kmin} {kmax}", ""]
    for c, s in enumerate(sym):
        deg = t.CLASS_UNITS[c] * 360 / t.D
        lines.append(f"angle {s} {deg:g}" if deg == round(deg, 6) else f"angle {s} {deg:.6f}")
    lines.append("")
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
        lines.append(f"face {' '.join(sym[c] for c in cycle)} x {t.CLASS_L[c0] // len(cycle)}")
    lines.append("")
    seen = set()
    for i, s in enumerate(t.SYMBOLS):
        word = [by_disp[d] for d in s[1 : s.index(")")].split(",")]
        if (len(word) < 3) == bool(t.COUNTING[i]):
            sys.exit(f"vertex type {s}: counting {t.COUNTING[i]} with {len(word)} corners")
        # one line per word up to rotation and reflection
        key = min(tuple(w[j:] + w[:j]) for w in (word, word[::-1]) for j in range(len(w)))
        if key not in seen:
            seen.add(key)
            lines.append("vertex " + " ".join(sym[c] for c in word))
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    path = sys.argv[1]
    kmin, kmax = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (1, 4)
    name = re.sub(r"^(?:.*/)?tables/([^/]+)/tables\.py$", r"\1", path)
    sys.stdout.write(board(load(path), name, kmin, kmax))
