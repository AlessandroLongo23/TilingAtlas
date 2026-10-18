#!/usr/bin/env python3
"""Generate lib/heesch/grids.json from heesch-sat's own grid classes.

Reads the JSON dump_grids prints (every cell near the origin, corners in cell coordinates) and
reduces it to what a grid IS for our purposes: the translation lattice, one cell per translation
class with its corners as offsets from the cell's point, and the map to the page. Every cell of a
class is checked to carry the same offsets, which is the proof that the lattice is right.

Usage: dump_grids | gen_grids.py
"""
import json
import math
import pathlib
import sys

OUT = pathlib.Path(__file__).resolve().parents[2] / "lib/heesch/grids.json"

# Display order, and the words the page uses. `noun` completes "9-…".
#
# `aligned` says what it means that the solver only places copies on the grid. On the first three
# grids that is the standing convention of the literature (Kaplan 2022; Myers' tables) and the number
# is the shape's Heesch number. On the rest it is a RESTRICTION: copies off the grid are not tried, so
# a lone square of 4.8.8 comes out as a non-tiler, and a number is only a lower bound on the true one.
NAMES = {
    "omino": ("Polyominoes", "omino", "convention"),
    "iamond": ("Polyiamonds", "iamond", "convention"),
    "hex": ("Polyhexes", "hex", "convention"),
    "kite": ("Polykites", "kite", "restriction"),
    "drafter": ("Polydrafters", "drafter", "restriction"),
    "abolo": ("Polyabolos", "abolo", "restriction"),
    "halfcairo": ("Half-Cairo", "half-Cairo", "restriction"),
    "octasquare": ("Octasquare", "octasquare", "restriction"),
    "trihex": ("Trihex", "trihex", "restriction"),
    "bevelhex": ("Bevelhex", "bevelhex", "restriction"),
}


def regular_bevelhex(g):
    """Move the corners of the 4.6.12 grid to where a regular dodecagon, hexagon and square put them.

    heesch-sat keeps every corner of this grid on the triangular lattice, which is right
    combinatorially and wrong metrically: its dodecagon has sides 1 and √3 alternating and its
    squares are 1 × √3 rectangles. Nothing the solver computes depends on that, so only the drawing
    changes. Every corner lies on exactly one dodecagon, at √7 from its centre; it moves to the same
    position around that centre on a regular dodecagon of side 1, and the centres spread to 3 + √3
    apart. The result is written back in the solver's coordinates, so its transforms still apply.
    """
    r3 = math.sqrt(3)
    spread = (3 + r3) / 6
    radius = 1 / (2 * math.sin(math.radians(15)))
    page = lambda x, y: (x + y / 2, r3 * y / 2)  # noqa: E731

    def regular(x, y):
        for cx in (6 * math.floor(x / 6), 6 * math.floor(x / 6) + 6):
            for cy in (6 * math.floor(y / 6), 6 * math.floor(y / 6) + 6):
                dx, dy = page(x - cx, y - cy)
                if abs(dx * dx + dy * dy - 7) < 1e-6:
                    turn = math.radians(15 + 30 * round((math.degrees(math.atan2(dy, dx)) - 15) / 30))
                    px, py = page(cx, cy)
                    px, py = spread * px + radius * math.cos(turn), spread * py + radius * math.sin(turn)
                    v = py / (r3 / 2) / spread
                    return [px / spread - v / 2, v]
        raise ValueError(f"corner {(x, y)} is on no dodecagon")

    for cell in g["cells"]:
        cell["verts"] = [regular(x, y) for x, y in cell["verts"]]


def reducer(period):
    (ax, ay), (bx, by) = period
    det = ax * by - ay * bx
    assert det > 0, "period must be positively oriented"

    def reduce(p):
        u, v = (p[0] * by - p[1] * bx) // det, (ax * p[1] - ay * p[0]) // det
        return (p[0] - u * ax - v * bx, p[1] - u * ay - v * by)

    return reduce


def main():
    raw = json.load(sys.stdin)
    grids = {}
    for name, (label, noun, aligned) in NAMES.items():
        g = raw[name]
        if name == "bevelhex":
            regular_bevelhex(g)
        (ax, ay), (bx, by) = g["period"]
        if ax * by - ay * bx < 0:
            g["period"].reverse()
        reduce = reducer(g["period"])
        kinds = {}
        for cell in g["cells"]:
            at = tuple(cell["at"])
            offsets = [(round(x - at[0], 9), round(y - at[1], 9)) for x, y in cell["verts"]]
            # Counter-clockwise on the page; both page bases are positively oriented.
            if sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(offsets, offsets[1:] + offsets[:1])) < 0:
                offsets.reverse()
            k = offsets.index(min(offsets))
            offsets = offsets[k:] + offsets[:k]
            seen = kinds.setdefault(reduce(at), offsets)
            assert all(math.isclose(a, b, abs_tol=1e-6) for p, q in zip(seen, offsets) for a, b in zip(p, q)), \
                f"{name}: cells of one translation class disagree at {at}"
        # The smallest scale that makes every corner an integer, when there is one.
        flat = [c for offsets in kinds.values() for p in offsets for c in p]
        den = next((d for d in (1, 2, 3, 4, 6, 12) if all(abs(c * d - round(c * d)) < 1e-6 for c in flat)), None)
        scaled = (lambda c: round(c * den)) if den else (lambda c: round(c, 6))
        (e1x, e1y), (e2x, e2y) = g["page"]
        page = lambda p: (e1x * p[0] + e2x * p[1], e1y * p[0] + e2y * p[1])  # noqa: E731
        # Scale the page so the shortest cell edge is one unit on every grid.
        edge = min(
            math.dist(page(p), page(q))
            for offsets in kinds.values() for p, q in zip(offsets, offsets[1:] + offsets[:1])
        )
        grids[name] = {
            "label": label,
            "noun": noun,
            "aligned": aligned,
            "prefix": g["prefix"],
            "den": den or 1,
            "period": g["period"],
            "page": [[round(e1x / edge, 9), round(e2x / edge, 9)], [round(e1y / edge, 9), round(e2y / edge, 9)]],
            "cells": [{"at": list(at), "verts": [[scaled(x), scaled(y)] for x, y in offsets]} for at, offsets in sorted(kinds.items())],
        }
        print(f"{name}: {len(kinds)} cell kinds, den {den}, shortest edge {edge:.4f}")
    # Not a grid at all: shapes of unit squares and triangles whose copies meet edge to edge anywhere
    # (tools/heesch/free_solver.py). Its records are already in page coordinates.
    grids["sqtri"] = {
        "label": "Squares & triangles", "noun": "cell shape", "aligned": "free", "prefix": "",
        "den": 1, "period": [[1, 0], [0, 1]], "page": [[1.0, 0.0], [0.0, 1.0]], "cells": [],
    }
    lines = ",\n".join(f"\t{json.dumps(k)}: {json.dumps(v, separators=(',', ':'))}" for k, v in grids.items())
    OUT.write_text("{\n" + lines + "\n}\n")


if __name__ == "__main__":
    main()
