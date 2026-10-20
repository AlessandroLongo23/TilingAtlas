#!/usr/bin/env python3
"""Heesch numbers of free polyforms: shapes glued edge to edge from unit regular polygons, with
copies placed edge to edge anywhere, on no grid.

A grid solver (heesch-sat) can only place copies on the grid the shape was cut from, so on a grid
with two kinds of cell a lone square "does not tile". Here a shape made of squares and triangles
may meet its copies in any of the ways squares and triangles meet, which is every edge-to-edge
tiling by them at once.

This enumerates the shapes (corners in ℤ[ζ₁₂], exactly; the ring arithmetic is develop.py's),
hands them to free_heesch, and writes what it answers as page records: each non-tiler with its
Heesch numbers and witness patches, each tiler with the periodic tiling free_heesch found
(free_heesch -cert). check_free.py audits both kinds independently.

Usage: free_solver.py --cells square,triangle --size 4 [--L 5] [--log FILE] [--out FILE]
"""
import argparse
import json
import math
import pathlib
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "ctrnact-oracle"))
from develop import ZERO, ZK, zadd, zfloat, zmul_zeta, zscale, zsub  # noqa: E402

SOLVER = pathlib.Path(__file__).resolve().parent / "free_heesch"

DIR = {v: k for k, v in enumerate(ZK)}
# The turn at each corner of a cell, in steps of 30°: a square turns 90°, a triangle 120°.
TURN = {"square": 3, "triangle": 4, "hexagon": 2, "dodecagon": 1}
SIDES = {"square": 4, "triangle": 3, "hexagon": 6, "dodecagon": 12}
EPS = 1e-7


def rot(v, r):
    for _ in range(r % 12):
        v = zmul_zeta(v)
    return v


def conj(v):
    """Complex conjugation: ζ ↦ ζ⁻¹ = ζ¹¹."""
    out = ZERO
    for c, k in zip(v, (0, 11, 10, 9)):
        out = zadd(out, zscale(ZK[k], c))
    return out


def cell_on(a, b, kind):
    """The cell of this kind whose counter-clockwise boundary starts with the edge a → b."""
    k = DIR[zsub(b, a)]
    loop, p = [a], a
    for i in range(SIDES[kind] - 1):
        p = zadd(p, ZK[(k + i * TURN[kind]) % 12])
        loop.append(p)
    return tuple(loop)


def overlap(p, q):
    """Do two convex polygons (lists of complex corners) share interior? Separating axes."""
    for poly in (p, q):
        for i in range(len(poly)):
            e = poly[(i + 1) % len(poly)] - poly[i]
            n = complex(e.imag, -e.real)
            a = [(z.real * n.real + z.imag * n.imag) for z in p]
            b = [(z.real * n.real + z.imag * n.imag) for z in q]
            if max(a) <= min(b) + EPS or max(b) <= min(a) + EPS:
                return False
    return True


class Copy:
    """A set of cells: the shape itself, or one placed copy of it."""

    def __init__(self, cells):
        self.cells = cells
        edges = {(c[i], c[(i + 1) % len(c)]) for c in cells for i in range(len(c))}
        self.edges = {e for e in edges if (e[1], e[0]) not in edges}
        self.polys = [[zfloat(v) for v in c] for c in cells]

    def is_disk(self):
        """One boundary loop through distinct corners: no hole, no pinch."""
        nxt = {}
        for a, b in self.edges:
            if a in nxt:
                return False
            nxt[a] = b
        start = next(iter(nxt))
        n, cur = 1, nxt[start]
        while cur != start:
            n, cur = n + 1, nxt[cur]
        return n == len(nxt)

    def placed(self, f, r, t):
        """This shape under the isometry z ↦ ζʳ·(z̄ if f else z) + t."""
        move = lambda v: zadd(rot(conj(v) if f else v, r), t)  # noqa: E731
        cells = [tuple(move(v) for v in c) for c in self.cells]
        return Copy([c[:1] + c[:0:-1] for c in cells] if f else cells)


def free_polyforms(kinds, size):
    """Every hole-free shape of `size` cells of these kinds, glued edge to edge, up to isometry."""
    def canon(shape):
        best = None
        for f in (0, 1):
            for r in range(12):
                c = shape.placed(f, r, ZERO)
                t = min(v for cell in c.cells for v in cell)
                key = tuple(sorted(tuple(sorted(zsub(v, t) for v in cell)) for cell in c.cells))
                if best is None or key < best:
                    best = key
        return best

    level = {}
    for kind in kinds:
        s = Copy([cell_on(ZERO, ZK[0], kind)])
        level[canon(s)] = s
    for _ in range(size - 1):
        grown = {}
        for s in level.values():
            for a, b in s.edges:
                for kind in kinds:
                    cell = cell_on(b, a, kind)
                    poly = [zfloat(v) for v in cell]
                    if any(overlap(poly, p) for p in s.polys):
                        continue
                    t = Copy(s.cells + [cell])
                    if t.is_disk():
                        grown.setdefault(canon(t), t)
        level = grown
    return list(level.values())


def iso_map(f, r, t):
    """z -> zeta^r (conj z if f else z) + t, as (x, y) -> (ax + by + c, dx + ey + f)."""
    c, sn, at = math.cos(r * math.pi / 6), math.sin(r * math.pi / 6), zfloat(t)
    return [round(v, 6) for v in ((c, sn, at.real, sn, -c, at.imag) if f else (c, -sn, at.real, sn, c, at.imag))]


def page_row(shape, res):
    """One shape in the /heesch page's record format, in plain page coordinates, from free_heesch's
    answer: Heesch numbers and witness patches, or for a tiler the lattice and the copies of a period."""
    num = lambda z: [round(z.real, 6), round(z.imag, 6)]  # noqa: E731
    nxt = dict(shape.edges)
    start = min(nxt, key=lambda w: (zfloat(w).imag, zfloat(w).real))
    loop, cur = [start], nxt[start]
    while cur != start:
        loop.append(cur)
        cur = nxt[cur]
    ring = [zfloat(w) for w in loop]
    turn = lambda a, b, c: (b - a).real * (c - b).imag - (b - a).imag * (c - b).real  # noqa: E731
    ring = [b for a, b, c in zip(ring[-1:] + ring[:-1], ring, ring[1:] + ring[:1]) if abs(turn(a, b, c)) > EPS]
    inner = {(c[i], c[(i + 1) % len(c)]) for c in shape.cells for i in range(len(c))} - shape.edges
    row = {
        "cells": len(shape.cells),
        "o": [c for z in ring for c in num(z)],
        "s": [c for a, b in inner if a < b for z in (zfloat(a), zfloat(b)) for c in num(z)],
        # The cells, for the audit only; build_data drops them from what the page fetches.
        "k": [[c for v in cell for c in num(zfloat(v))] for cell in shape.cells],
    }
    if "cert" in res:
        l, k = res["cert"]["l"], res["cert"]["k"]
        u, v = zfloat(tuple(l[:4])), zfloat(tuple(l[4:]))
        # The shortest basis (Lagrange), so the page's patch of the tiling comes out round.
        while True:
            if abs(u) > abs(v):
                u, v = v, u
            mu = (u.real * v.real + u.imag * v.imag) / abs(u) ** 2
            if abs(mu) <= 0.5 + 1e-9:  # reduced; at exactly a half, float noise must not flip it back
                break
            v -= round(mu) * u
        maps = [x for i in range(0, len(k), 6) for x in iso_map(k[i], k[i + 1], tuple(k[i + 2:i + 6]))]
        row["p"] = {"l": [*num(u), *num(v)], "k": maps}
        return row
    patch = lambda w: [x for level, f, r, *t in w for x in (level, *iso_map(f, r, tuple(t)))]  # noqa: E731
    row["hc"], row["hh"] = res["hc"], res["hh"]
    if res["hc"] > 0:
        row["w"] = patch(res["w"])
    if res["hh"] != res["hc"]:
        row["wh"] = patch(res["wh"])
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", default="square,triangle")
    ap.add_argument("--size", type=int, required=True)
    ap.add_argument("--L", type=int, default=5, help="coronas free_heesch looks for before it calls a shape capped")
    ap.add_argument("--log")
    ap.add_argument("--out", help="write the page records (JSON)")
    args = ap.parse_args()
    log = open(args.log, "a") if args.log else sys.stdout

    def say(msg):
        print(f"[{time.strftime('%H:%M:%S')}] {msg}", file=log, flush=True)

    shapes = free_polyforms(args.cells.split(","), args.size)
    say(f"free polyforms of {args.size} cells from {args.cells}: {len(shapes)} hole-free shapes; free_heesch -L {args.L}")
    lines = "".join(" ".join([str(len(s.cells))] + [" ".join([str(len(c))] + [str(x) for v in c for x in v]) for c in s.cells]) + "\n" for s in shapes)
    # The shapes go in through a file: written to a pipe, they would block once free_heesch's answers
    # filled the pipe back, with nobody reading them yet.
    inp = tempfile.TemporaryFile("w+")
    inp.write(lines)
    inp.seek(0)
    proc = subprocess.Popen([str(SOLVER), "-L", str(args.L), "-cert"], stdin=inp, stdout=subprocess.PIPE, text=True)
    rows, tilers, unresolved, t0 = [], [], 0, time.time()
    for done, (s, line) in enumerate(zip(shapes, proc.stdout), 1):
        res = json.loads(line)
        if "cert" in res:
            tilers.append(page_row(s, res))
        elif res["capped"]:
            unresolved += 1  # every corona asked for exists, and no periodic tiling was found
        else:
            rows.append(page_row(s, res))
        el = time.time() - t0
        if done == len(shapes) or done % max(1, len(shapes) // 20) == 0:
            say(f"  {done}/{len(shapes)}  tilers {len(tilers)}  non-tilers {len(rows)}  unresolved {unresolved}  elapsed {el:.0f}s  ETA {el * (len(shapes) - done) / done:.0f}s")
    if proc.wait() != 0:
        sys.exit("free_heesch failed")
    say(f"done: {len(tilers)} tile, {len(rows)} do not, {unresolved} unresolved")
    if args.out:
        pathlib.Path(args.out).write_text(json.dumps({"cells": args.size, "total": len(shapes), "unresolved": unresolved, "shapes": rows, "tilers": tilers}, separators=(",", ":")))


if __name__ == "__main__":
    main()
