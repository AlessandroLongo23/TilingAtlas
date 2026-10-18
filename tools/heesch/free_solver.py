#!/usr/bin/env python3
"""Heesch numbers of free polyforms: shapes glued edge to edge from unit regular polygons, with
copies placed edge to edge anywhere, on no grid.

A grid solver (heesch-sat) can only place copies on the grid the shape was cut from, so on a grid
with two kinds of cell a lone square "does not tile". Here a shape made of squares and triangles
may meet its copies in any of the ways squares and triangles meet, which is every edge-to-edge
tiling by them at once.

Corners live in ℤ[ζ₁₂], exactly (the ring arithmetic is develop.py's). That ring is dense in the
plane, so there is no box of placements to enumerate: candidates are GENERATED, by matching a
boundary edge of a copy against a boundary edge of one already generated, and the set is finite
because each corona is a bounded number of such steps from the last.

The encoding follows Kaplan (2022) with cells replaced by edges, since copies off a grid share no
cells: a copy is a variable per corona level; an inner copy has every boundary edge matched and
every corner closed; two copies that overlap exclude each other; a copy at level k touches level
k-1 and nothing below it. A corona that cannot exist is an UNSAT answer from CryptoMiniSat.

The number computed lets the OUTERMOST corona enclose holes (Kaplan's Hh).

Usage: free_solver.py --cells square,triangle --size 4 [--maxlevel 3] [--log FILE]
"""
import argparse
import itertools
import math
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "ctrnact-oracle"))
from pysat.solvers import Solver  # noqa: E402
from develop import ZERO, ZK, zadd, zfloat, zmul_zeta, zscale, zsub  # noqa: E402

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
        self.iso = (0, 0, ZERO)
        edges = {(c[i], c[(i + 1) % len(c)]) for c in cells for i in range(len(c))}
        self.edges = {e for e in edges if (e[1], e[0]) not in edges}
        self.verts = {a for a, _ in self.edges}
        # A cell named exactly: its side count, lowest corner, and the direction of the edge leaving it.
        self.ckeys = []
        for c in cells:
            i = c.index(min(c))
            self.ckeys.append((len(c), c[i], DIR[zsub(c[(i + 1) % len(c)], c[i])]))
        self.key = frozenset(self.ckeys)
        self.polys = [[zfloat(v) for v in c] for c in cells]
        pts = [z for poly in self.polys for z in poly]
        self.centre = sum(pts) / len(pts)
        self.radius = max(abs(z - self.centre) for z in pts)
        # Boundary edges as a neighbour must meet them, plain and mirrored. A reflected copy runs its
        # boundary backwards, so the ends of a mirrored edge swap.
        sides = [(u, v, 0) for u, v in self.edges] + [(conj(v), conj(u), 1) for u, v in self.edges]
        self.sides = [(DIR[zsub(e, s)], [rot(s, r) for r in range(12)], f) for s, e, f in sides]

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

    def overlaps(self, other):
        if abs(self.centre - other.centre) > self.radius + other.radius - EPS:
            return False
        return any(overlap(p, q) for p in self.polys for q in other.polys)

    def placed(self, f, r, t):
        """This shape under the isometry z ↦ ζʳ·(z̄ if f else z) + t."""
        move = lambda v: zadd(rot(conj(v) if f else v, r), t)  # noqa: E731
        cells = [tuple(move(v) for v in c) for c in self.cells]
        copy = Copy([c[:1] + c[:0:-1] for c in cells] if f else cells)
        copy.iso = (f, r, t)
        return copy

    def matches(self, base):
        """The isometries that lay a copy of `base` against one boundary edge of this copy."""
        out = set()
        for a, b in self.edges:
            d = DIR[zsub(a, b)]
            for along, turned, f in base.sides:
                r = (d - along) % 12
                out.add((f, r, zsub(b, turned[r])))
        return out


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


def heesch(base, maxlevel):
    """(Hc, Hh, strict patch, loose patch, copies): the strict Heesch number and the one with holes
    allowed in the outermost corona, each with its patch as [(level, index into copies)].
    Hc == maxlevel means every corona asked for exists, which is what a tiler does."""
    copies, index = [base], {base.key: 0}
    placed, nbrs = {}, {}

    def neighbours(i):
        """Indices of the copies edge-matched to copy i that clear the centre tile."""
        if i not in nbrs:
            out = set()
            for g in copies[i].matches(base):
                if g not in placed:
                    q = base.placed(*g)
                    if q.overlaps(base):
                        placed[g] = None
                    else:
                        placed[g] = index.setdefault(q.key, len(copies))
                        if placed[g] == len(copies):
                            copies.append(q)
                if placed[g] is not None:
                    out.add(placed[g])
            nbrs[i] = out - {0}
        return nbrs[i]

    levels = [{0}]
    hc = hh = 0
    strict = loose = [(0, 0)]
    for n in range(1, maxlevel + 1):
        # Candidates for corona n: copies that touch a corona-(n-1) candidate, found by walking edge
        # matches outward from them. From corona 2 on a copy may not touch the centre.
        prev = set().union(*(copies[i].verts for i in levels[n - 1]))
        found, queue = set(), list(levels[n - 1])
        while queue:
            for j in neighbours(queue.pop()):
                if j in found or copies[j].verts.isdisjoint(prev):
                    continue
                if n >= 2 and not copies[j].verts.isdisjoint(base.verts):
                    continue
                found.add(j)
                queue.append(j)
        levels.append(found)
        model = solve(copies, levels, n, strict=True) if found else None
        if model is None:
            # No n coronas that are disks all the way out. One with holes in the last may still exist.
            model = solve(copies, levels, n, strict=False) if found else None
            if model is not None:
                hh, loose = n, model
            break
        hc = hh = n
        strict = loose = model
    return hc, hh, strict, loose, copies


def defect(copies, model):
    """The first way a patch fails to be a disk at some prefix of coronas: (k, copies at fault,
    what would mend it), or None. A hole is a second boundary loop; a pinch is a corner the
    boundary passes through twice."""
    for k in range(max(lv for lv, _ in model) + 1):
        members = [i for lv, i in model if lv <= k]
        edges = {e: i for i in members for e in copies[i].edges}
        out = {}
        for (a, b), i in edges.items():
            if (b, a) not in edges:
                out.setdefault(a, []).append(b)
        pinch = next((w for w, ends in out.items() if len(ends) > 1), None)
        if pinch is not None:
            return k, [i for i in members if pinch in copies[i].verts], ("vert", pinch)
        low = min(out, key=lambda w: (zfloat(w).imag, zfloat(w).real))
        todo = set(out)
        while todo:
            start = todo.pop()
            loop, cur = [start], out[start][0]
            while cur != start:
                todo.discard(cur)
                loop.append(cur)
                cur = out[cur][0]
            if low not in loop:
                ring = set(zip(loop, loop[1:] + loop[:1]))
                return k, sorted({edges[e] for e in ring}), ("edges", ring)
    return None


CROSSES = {}  # (cell, cell, relative position) -> do they overlap; the same few cases recur endlessly


def at_most_one(lits, clauses, var):
    """Ladder encoding: linear in the number of literals, where pairwise is quadratic."""
    if len(lits) < 5:
        clauses += [[-a, -b] for a, b in itertools.combinations(lits, 2)]
        return
    prev = None
    for lit in lits[:-1]:
        s = next(var)
        clauses.append([-lit, s])
        if prev is not None:
            clauses += [[-prev, s], [-lit, -prev]]
        prev = s
    clauses.append([-lits[-1], -prev])


def solve(copies, levels, n, strict):
    """Is there a patch of n coronas? Returns [(level, index)] or None. `strict` asks that every prefix
    of coronas be a disk: each defect a model shows is forbidden as a pattern (these copies at these
    levels, with nothing mending it) and the solver is asked again."""
    var = itertools.count(1)
    x = {(i, k): next(var) for k in range(n + 1) for i in levels[k]}
    used = sorted({i for i, _ in x})
    y = {i: next(var) for i in used}
    clauses = [[x[(0, 0)]]]
    by_edge, by_vert = {}, {}
    for i in used:
        ks = [k for k in range(n + 1) if (i, k) in x]
        clauses += [[-x[(i, k)], y[i]] for k in ks]
        clauses.append([-y[i]] + [x[(i, k)] for k in ks])
        clauses += [[-x[(i, a)], -x[(i, b)]] for a, b in itertools.combinations(ks, 2)]
        for e in copies[i].edges:
            by_edge.setdefault(e, []).append(i)
        for w in copies[i].verts:
            by_vert.setdefault(w, []).append(i)
    # U[e]: some copy in the patch has e on its boundary. T[w, k]: a level-k copy has the corner w.
    U = {e: next(var) for e in by_edge}
    for e, owners in by_edge.items():
        clauses += [[-y[i], U[e]] for i in owners]
        clauses.append([-U[e]] + [y[i] for i in owners])
        at_most_one([y[i] for i in owners], clauses, var)
    T = {}
    for w, owners in by_vert.items():
        for k in range(n + 1):
            at = [x[(i, k)] for i in owners if (i, k) in x]
            if at:
                T[(w, k)] = next(var)
                clauses += [[-v, T[(w, k)]] for v in at]
                clauses.append([-T[(w, k)]] + at)
    # No overlap, through the cells. C[c]: some copy in the patch contains the cell c. A cell belongs
    # to one copy at most, and two different cells that overlap (possible off a grid: a triangle laid
    # across a square) are never both used. Which pairs overlap is decided once per relative position.
    by_cell = {}
    for i in used:
        for ck, poly in zip(copies[i].ckeys, copies[i].polys):
            by_cell.setdefault(ck, ([], poly))[0].append(i)
    C = {ck: next(var) for ck in by_cell}
    buckets = {}
    for ck, (owners, poly) in by_cell.items():
        clauses += [[-y[i], C[ck]] for i in owners]
        at_most_one([y[i] for i in owners], clauses, var)
        mid = sum(poly) / len(poly)
        buckets.setdefault((math.floor(mid.real / 2), math.floor(mid.imag / 2)), []).append((ck, poly, mid))
    for (bx, by), mine in buckets.items():
        near = [c for dx in (-1, 0, 1) for dy in (-1, 0, 1) for c in buckets.get((bx + dx, by + dy), ())]
        for ck, poly, mid in mine:
            for ck2, poly2, mid2 in near:
                if ck < ck2 and abs(mid - mid2) < 2:
                    rel = (ck[0], ck[2], ck2[0], ck2[2], zsub(ck2[1], ck[1]))
                    if rel not in CROSSES:
                        CROSSES[rel] = overlap(poly, poly2)
                    if CROSSES[rel]:
                        clauses.append([-C[ck], -C[ck2]])
    # Inner copies are surrounded: every boundary edge matched, every corner closed all the way round.
    inner = {}
    for (i, k), v in x.items():
        if k < n:
            for a, b in copies[i].edges:
                clauses.append([-v, U[(b, a)]] if (b, a) in U else [-v])
            for w in copies[i].verts:
                inner.setdefault(w, []).append(v)
    at_vert = {}
    for e in by_edge:
        for w in e:
            at_vert.setdefault(w, []).append(e)
    for w, vs in inner.items():
        closed = next(var)
        clauses += [[-v, closed] for v in vs]
        for e in at_vert[w]:
            clauses.append([-closed, -U[e], U[(e[1], e[0])]] if (e[1], e[0]) in U else [-closed, -U[e]])
    # A level-k copy touches level k-1 and nothing below it.
    for (i, k), v in x.items():
        if k == 0:
            continue
        clauses.append([-v] + [T[(w, k - 1)] for w in copies[i].verts if (w, k - 1) in T])
        clauses += [[-v, -T[(w, m)]] for w in copies[i].verts for m in range(k - 1) if (w, m) in T]
    # One incremental solver for the whole loop: a strict search on a shape that tiles can rule out
    # thousands of pinched patches one blocking clause at a time, and a fresh solver per clause was
    # what made that take hours.
    with Solver(name="cadical153", bootstrap_with=clauses) as sat:
        while True:
            if not sat.solve():
                return None
            true = {t for t in sat.get_model() if t > 0}
            model = sorted((k, i) for (i, k), v in x.items() if v in true)
            flaw = defect(copies, model) if strict else None
            if flaw is None:
                return model
            k, at_fault, (what, where) = flaw
            level = dict((i, lv) for lv, i in model)
            if what == "vert":
                menders = [j for j in by_vert[where] if j not in at_fault]
            else:
                menders = {j for a, b in where for j in by_edge.get((b, a), ())}
            sat.add_clause([-x[(i, level[i])] for i in at_fault] + [x[(j, m)] for j in menders for m in range(k + 1) if (j, m) in x])


def page_row(shape, hc, hh, strict, loose, copies):
    """One shape in the /heesch page's record format, in plain page coordinates."""
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

    def patch(model):
        out = []
        for level, i in model:
            f, r, t = copies[i].iso
            c, sn, at = math.cos(r * math.pi / 6), math.sin(r * math.pi / 6), zfloat(t)
            # z -> zeta^r * (conj z if f else z) + t, as (x, y) -> (ax + by + c, dx + ey + f)
            out += [level] + [round(v, 6) for v in ((c, sn, at.real, sn, -c, at.imag) if f else (c, -sn, at.real, sn, c, at.imag))]
        return out

    row = {
        "cells": len(shape.cells),
        "o": [c for z in ring for c in num(z)],
        "s": [c for a, b in inner if a < b for z in (zfloat(a), zfloat(b)) for c in num(z)],
        # The cells, for the audit only; build_data drops them from what the page fetches.
        "k": [[c for v in cell for c in num(zfloat(v))] for cell in shape.cells],
        "hc": hc,
        "hh": hh,
    }
    if hc > 0:
        row["w"] = patch(strict)
    if hh != hc:
        row["wh"] = patch(loose)
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", default="square,triangle")
    ap.add_argument("--size", type=int, required=True)
    ap.add_argument("--maxlevel", type=int, default=3)
    ap.add_argument("--part", default="0/1", help="i/n: do every n-th shape starting at the i-th")
    ap.add_argument("--log")
    ap.add_argument("--out", help="write the non-tilers found as page records (JSON)")
    args = ap.parse_args()
    log = open(args.log, "a") if args.log else sys.stdout

    def say(msg):
        print(f"[{time.strftime('%H:%M:%S')}] {msg}", file=log, flush=True)

    shapes = free_polyforms(args.cells.split(","), args.size)
    part, parts = map(int, args.part.split("/"))
    shapes = shapes[part::parts]
    say(f"[{args.part}] free polyforms of {args.size} cells from {args.cells}: {len(shapes)} hole-free shapes, up to {args.maxlevel} coronas")
    tally, rows, t0 = {}, [], time.time()
    for done, s in enumerate(shapes, 1):
        hc, hh, strict, loose, copies = heesch(s, args.maxlevel)
        capped = hc == args.maxlevel
        tally[(hc, hh)] = tally.get((hc, hh), 0) + 1
        if not capped:
            rows.append(page_row(s, hc, hh, strict, loose, copies))
        el = time.time() - t0
        say(f"  [{args.part}] {done}/{len(shapes)}  " + (f"closes all {hc} coronas asked" if capped else f"Hc={hc} Hh={hh}") +
            f"  cells {[len(c) for c in s.cells]}  elapsed {el:.0f}s  ETA {el * (len(shapes) - done) / done:.0f}s")
    say(f"[{args.part}] done: " + ", ".join(
        (f"{n} close all {hc}" if hc == args.maxlevel else f"{n} at Hc={hc}/Hh={hh}") for (hc, hh), n in sorted(tally.items())))
    if args.out:
        import json
        pathlib.Path(args.out).write_text(json.dumps({"cells": args.size, "maxlevel": args.maxlevel, "closed": sum(n for (hc, _), n in tally.items() if hc == args.maxlevel), "shapes": rows}, separators=(",", ":")))


if __name__ == "__main__":
    main()
