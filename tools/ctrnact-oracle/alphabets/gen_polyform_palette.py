#!/usr/bin/env python3
"""Generate the palette for one polyform family: every polyform of one lattice and one order.

  gen_polyform_palette.py square 3      -> palettes/tromino.json
  gen_polyform_palette.py triangle 4    -> palettes/tetriamond.json
  gen_polyform_palette.py hex 4         -> palettes/tetrahex.json

Chirality is DISTINGUISHED, the shelf convention (AL 2026-08-08, measured on the tetromino palette:
dropping the mirror twins took k=1 from 27 distinct tilings to 16, and four of them use both
handednesses of one piece at once). So the palette lists ONE-SIDED polyforms, a chiral shape
appearing twice as X and X'. gen_alphabet's mirror_expand then has nothing left to add.

Names follow Polyform Puzzler where that project names the family (polyominoes: the Tetris letters;
polyiamonds C/I/T; polyhexes A/I/V and I/J/O/P/S/U/Y — puzzler.sourceforge.net/docs/), keyed by the
tile's canonical boundary word so the mapping cannot drift with enumeration order. An unnamed order
falls back to A, B, C…, which is honest: those letters are ours, not a convention.

The order-1 polyform of each lattice is the atomic tile itself — the square, triangular and hexagonal
grids — which the Regular shelf already holds, so orders start at 2.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from polyform import LATTICE, canon, enumerate_polyforms, polyform_angle_word  # noqa: E402

D = 12
# 360° / the lattice's smallest interior angle: how many tiles can meet at one point.
MAX_VALENCE = {"square": 4, "triangle": 6, "hex": 3}
FAMILY = {"square": "polyomino", "triangle": "polyiamond", "hex": "polyhex"}
ORDER_NAME = {
    "square": {2: "domino", 3: "tromino", 4: "tetromino", 5: "pentomino"},
    "triangle": {2: "diamond", 3: "triamond", 4: "tetriamond", 5: "pentiamond"},
    "hex": {2: "dihex", 3: "trihex", 4: "tetrahex", 5: "pentahex"},
}
ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def plural(word):
    return word + ("es" if word[-1] in "ox" else "s")


def canon_word(cells, lattice):
    """The free shape's fingerprint: its cyclic boundary word, minimised over rotations of the word
    AND its reversal (a reflection reverses the word). Independent of how the shape was found."""
    w = polyform_angle_word(cells, D, lattice)
    n = len(w)
    return min(tuple(x[i:] + x[:i]) for x in (w, w[::-1]) for i in range(n))


# name -> canonical boundary word (the free shape's fingerprint). Written out rather than derived so
# a rename is a one-line edit and a shape that stops matching fails loudly instead of quietly taking
# someone else's letter. A pair of names is a CHIRAL shape whose two handednesses have their own
# letters (the Tetris S/Z and J/L); a single name gives the reflection a prime, X'.
NAMES = {
    ("square", 2): {"I": (3, 3, 6, 3, 3, 6)},
    ("square", 3): {"I": (3, 3, 6, 6, 3, 3, 6, 6), "L": (3, 3, 6, 3, 6, 3, 3, 9)},
    ("square", 4): {  # the Tetris set — the shapes and letters of the hand-written tetromino.json
        "I": (3, 3, 6, 6, 6, 3, 3, 6, 6, 6),
        ("L", "J"): (3, 3, 6, 3, 6, 6, 3, 3, 6, 9),
        "T": (3, 3, 6, 6, 3, 3, 9, 3, 3, 9),
        "O": (3, 6, 3, 6, 3, 6, 3, 6),
        ("Z", "S"): (3, 3, 6, 3, 9, 3, 3, 6, 3, 9),
    },
    ("triangle", 2): {"R": (2, 4, 2, 4)},
    ("triangle", 3): {"T": (2, 4, 4, 2, 6)},
    ("triangle", 4): {"I": (2, 4, 6, 2, 4, 6), "T": (2, 6, 2, 6, 2, 6), "C": (2, 4, 4, 4, 2, 8)},
    ("hex", 2): {"I": (4, 4, 4, 4, 8, 4, 4, 4, 4, 8)},
    ("hex", 3): {
        "I": (4, 4, 4, 4, 8, 4, 8, 4, 4, 4, 4, 8, 4, 8),
        "A": (4, 4, 4, 8, 4, 4, 4, 8, 4, 4, 4, 8),
        "V": (4, 4, 4, 4, 8, 4, 4, 8, 4, 4, 4, 4, 8, 8),
    },
    ("hex", 4): {
        "I": (4, 4, 4, 4, 8, 4, 8, 4, 8, 4, 4, 4, 4, 8, 4, 8, 4, 8),
        "P": (4, 4, 4, 4, 8, 4, 8, 4, 4, 4, 8, 4, 4, 4, 8, 8),
        "J": (4, 4, 4, 4, 8, 4, 4, 8, 4, 8, 4, 4, 4, 4, 8, 4, 8, 8),
        "O": (4, 4, 4, 8, 4, 4, 8, 4, 4, 4, 8, 4, 4, 8),
        "S": (4, 4, 4, 4, 8, 4, 4, 8, 8, 4, 4, 4, 4, 8, 4, 4, 8, 8),
        "U": (4, 4, 4, 4, 8, 4, 4, 8, 4, 4, 8, 4, 4, 4, 4, 8, 8, 8),
        "Y": (4, 4, 4, 4, 8, 8, 4, 4, 4, 4, 8, 8, 4, 4, 4, 4, 8, 8),
    },
}

NOTE = {
    "square": "unions of unit SQUARES on the Gaussian-integer lattice; boundary corners 90°/180°/270°",
    "triangle": "unions of unit TRIANGLES on the triangular lattice; boundary corners 60°…300°",
    "hex": "unions of unit HEXAGONS on the honeycomb; boundary corners 120°/240°",
}


def build(lattice, order):
    shapes = enumerate_polyforms(lattice, order, mirror=False)
    L = LATTICE[lattice]
    # Group the one-sided shapes into free (mirror) classes, keeping first-seen order.
    classes, index = [], {}
    for sh in shapes:
        k = canon(sh, lattice, mirror=True)
        if k not in index:
            index[k] = len(classes)
            classes.append([])
        classes[index[k]].append(sh)

    named = NAMES.get((lattice, order))
    if named is not None:
        by_word = {}
        for name, word in named.items():
            assert word not in by_word, f"two names share a boundary word: {name}/{by_word[word]}"
            by_word[word] = name
        assert len(named) == len(classes), \
            f"{lattice} order {order}: {len(named)} names for {len(classes)} free shapes"

    tiles, seen = [], set()
    for ci, group in enumerate(classes):
        word = canon_word(group[0], lattice)
        entry = by_word[word] if named is not None else ALPHA[ci]
        if named is not None:
            assert word in by_word, f"{lattice} order {order}: unnamed shape, word {word}"
        letters = list(entry) if isinstance(entry, tuple) else [entry] + [entry + "'"]
        assert len(group) <= len(letters), f"{entry}: {len(group)} handednesses, {len(letters)} names"
        for j, sh in enumerate(group):                   # j = 1 is the reflection
            name = letters[j]
            assert name not in seen, f"duplicate tile name {name}"
            seen.add(name)
            tiles.append({
                "kind": "polyomino",
                "name": name,
                "famchar": name.replace("'", "m").lower(),
                "cells": [list(c) for c in sh],
            })
    return {
        "name": ORDER_NAME[lattice][order],
        "D": D,
        "lattice": lattice,
        "pinnedLegacy": False,
        "maxValence": MAX_VALENCE[lattice],
        "develop": "eu_develop",   # run-oracle.sh phase 3: exact ℤ[ζ₁₂] geometry with face polygons
        "comment": (
            f"The {len(tiles)} one-sided "
            f"{plural(ORDER_NAME[lattice][order]) if len(tiles) > 1 else ORDER_NAME[lattice][order]} "
            f"({len(classes)} free, {len(tiles) - len(classes)} of them a mirror twin): "
            f"{NOTE[lattice]}. Generated by alphabets/gen_polyform_palette.py {lattice} {order}; "
            "every tile is the `polyomino` kind, which is just a cyclic interior-angle word, so the "
            "lattice never reaches the search. Chirality is DISTINGUISHED (X ≠ X'), the shelf "
            "convention and a deliberate departure from the A068599 mirror-merge one. EXPLORATORY: "
            "no external oracle exists for k-uniform polyform tilings, so counts are observations."
        ),
        "tiles": tiles,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lattice", choices=sorted(LATTICE))
    ap.add_argument("order", type=int)
    ap.add_argument("--out")
    ap.add_argument("--print-words", action="store_true", help="dump the NAMES table for a new order")
    ap.add_argument("--force", action="store_true", help="overwrite an existing palette file")
    a = ap.parse_args()
    if a.order < 2:
        raise SystemExit("order 1 is the atomic tile — the regular grid, already on the Regular shelf")
    if a.print_words:
        for sh in enumerate_polyforms(a.lattice, a.order, mirror=True):
            print(canon_word(sh, a.lattice))
        return
    spec = build(a.lattice, a.order)
    out = a.out or os.path.join(os.path.dirname(os.path.abspath(__file__)), "palettes", spec["name"] + ".json")
    # tetromino.json is hand-written (and its tables are built): regenerating it would throw away the
    # comment that records the counting-vertex rule. Any existing palette is protected the same way.
    if os.path.exists(out) and not a.force:
        raise SystemExit(f"{out} exists — pass --force to overwrite, or --out to write elsewhere")
    with open(out, "w") as f:
        json.dump(spec, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"[gen] {spec['name']}: {len(spec['tiles'])} tiles -> {out}")


if __name__ == "__main__":
    main()
