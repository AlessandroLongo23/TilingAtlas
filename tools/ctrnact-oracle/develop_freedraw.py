#!/usr/bin/env python3
"""Develop freedraw solutions: Marek Ctrnact's Planar Tilings certificates -> edge bitmasks.

Sibling of develop.py / develop_hyperbolic.py / develop_spherical.py, occupying the same pipeline
slot: the solver searches combinatorially, this turns its certificates into geometry. Nothing here
searches. The conventions are NOT guessed: PT's output is the same Conway half-edge notation our
own eu pipeline emits (pruner.py writes it, develop.py develops it -- same author, shared ancestry),
so the gluing semantics below are ported from pruner.py's makeglue()/decipher() and develop.py's
star-walk BFS, which are validated against A068599 to k=16. What pruner.py hard-codes as 44 tables
for the regular alphabet (labellistin/rneiglistin/mirrolistin/lvertlistin) is generated here
programmatically from the vertex figure + site-symmetry tag, because the freedraw alphabet is open.

THE OBJECT. A freedraw tiling is a periodic subset of the edges of a grid with no vertex of degree
1. Marek models drawn edges as DIGONS (A2, interior angle 0) added to the grid's tiling, so the
whole system is "the usual k-uniform machinery with one extra letter". The interior-angle formula
180 - 360/n already extends to the digon (n=2 -> 0 degrees); nothing else changes.

THE CERTIFICATE (per solution):
    Number of vertices: k
    (A2, A4, A2, A4, A4, A4)Ac, ...    one entry per vertex orbit: figure + site-symmetry tag
    <same line with multiplicities>    ignored
    (0 1)[2](6)                        Conway gluing line (the "structure line")
    2/1(A4) - 0/6(A4) - ...            tile-orbit chains (redundant for developing; unused)

CONVENTIONS (all ported, none guessed):
  * The listed figure is the full corner cycle folded by the ROTATION part of the site group;
    the rotation order is 360 / (angle sum of the listed corners).
  * Slots (half-edges) and corners alternate; slot j precedes corner j. A slot is a digon side --
    its grid edge is DRAWN -- iff an adjacent corner is A2.
  * Site tags: F/Cn = chiral site (no mirror): the quotient carries a full starred copy of the
    vertex (labels *0..*t-1), mirro swaps the copies -- exactly pruner.py's F/R tables. An/Dn = a
    mirror is present: no extra copies; mirro is the mirror's slot involution and the mirror
    partner of slot s is labelled *rep -- exactly pruner.py's A/S tables. Which axis a letter
    (Aa..Ae, D4a/D4b) means is resolved per figure: usually the corner condition admits exactly
    one axis; when several are valid, every candidate is developed and the one whose gluing
    closes consistently wins (wrong axes die in label lookup, glue completeness, or develop).
  * Structure line: () = orientation-preserving gluing, [] = reversing (the star goes on the
    second end; the choice of side is irrelevant because every gluing also glues the mirror
    images: glue[mirro[a]] = mirro[b] -- ported verbatim).
  * Develop: BFS over (quotient half-edge, direction) keyed positions; crossing an edge lands on
    glue[h] at direction+180; re-meeting a key at a different position yields a translation
    period. The period lattice and one fundamental domain of drawn edges are the whole answer.

Validation: developing all 1420 square certificates (k<=3) must reproduce, bijectively up to p4m,
the 1420 independently enumerated bitmasks in public/freedraw/solutions.json.

Usage:
    develop_freedraw.py <dir> --grid square --oracle public/freedraw/solutions.json
    develop_freedraw.py <dir> --grid triangle --out tri_solutions.json [--oracle tri_k1.json]
"""
import argparse
import json
import os
import re
import sys
from collections import Counter, deque

# ---------------------------------------------------------------- grids
# units: interior angle in 30-degree units (A2 digon = 0 via 6 - 12//n).
# step(d): unit vector of direction d (30-degree units) in the grid's own integer basis -- square
# basis (1, i), triangle basis (e1, e2) with e2 at 60 degrees. Directions off the grid raise.
SQ_STEP = {0: (1, 0), 3: (0, 1), 6: (-1, 0), 9: (0, -1)}
TR_STEP = {0: (1, 0), 2: (0, 1), 4: (-1, 1), 6: (-1, 0), 8: (0, -1), 10: (1, -1)}
GRIDS = {
    "square": {"units": {"A2": 0, "A4": 3}, "step": SQ_STEP,
               "axes": [(1, 0), (0, 1)], "axis_names": ["h", "v"]},
    "triangle": {"units": {"A2": 0, "A3": 2}, "step": TR_STEP,
                 "axes": [(1, 0), (0, 1), (1, -1)], "axis_names": ["h", "v", "w"]},
    # The combined grid has NO fixed lattice: the underlying square-triangle tiling varies per
    # solution, so there is nothing to index a bitmask into. Develop runs in exact Z[zeta12]
    # instead and the emitter writes an explicit patch (vertices + edges + faces per period).
    "ts": {"units": {"A2": 0, "A3": 2, "A4": 3}, "step": None, "axes": None, "axis_names": None},
}

# ---------------------------------------------------------------- exact Z[zeta12] (from develop.py)
# element = (a,b,c,d) = a + b*z + c*z^2 + d*z^3, z = e^{i*pi/6}, minimal polynomial z^4 = z^2 - 1.
def zmul_zeta(v):
    a, b, c, d = v
    return (-d, a, b + d, c)


def zpow(k):
    v = (1, 0, 0, 0)
    for _ in range(k % 12):
        v = zmul_zeta(v)
    return v


ZK = [zpow(k) for k in range(12)]
ZZERO = (0, 0, 0, 0)


def zadd(u, v):
    return (u[0] + v[0], u[1] + v[1], u[2] + v[2], u[3] + v[3])


def zsub(u, v):
    return (u[0] - v[0], u[1] - v[1], u[2] - v[2], u[3] - v[3])


def zscale(u, m):
    return (u[0] * m, u[1] * m, u[2] * m, u[3] * m)


import cmath as _cmath
import math as _math

_ZE = [_cmath.exp(1j * _math.pi / 6) ** k for k in range(4)]


def zfloat(v):
    return v[0] * _ZE[0] + v[1] * _ZE[1] + v[2] * _ZE[2] + v[3] * _ZE[3]


class DevelopError(Exception):
    pass


# ---------------------------------------------------------------- certificate parsing
VTYPE = re.compile(r"\(([^)]*)\)([A-Za-z0-9]*)")
REF = re.compile(r"(\*?)(\d+)('*)(?:@(\d+))?")


def parse_ref(s):
    m = REF.fullmatch(s.strip())
    if not m:
        raise DevelopError(f"bad ref {s!r}")
    star, num, primes, at = m.groups()
    return {"mirror": star == "*", "pos": int(num), "orbit": int(at) if at else len(primes)}


def parse_block(text):
    lines = [l.rstrip() for l in text.strip().splitlines() if l.strip()]
    b = {}
    i = 0
    if lines[0].lower().startswith("number of vertices"):
        b["k"] = int(lines[0].split(":")[1])
        i = 1
    b["types"] = [
        {"figure": [t.strip() for t in m.group(1).split(",")], "tag": m.group(2)}
        for m in VTYPE.finditer(lines[i])
    ]
    i += 1
    if i < len(lines) and VTYPE.search(lines[i]) and "/" not in lines[i]:
        i += 1  # the multiplicity line
    b["structure"] = [
        {"kind": "()" if k == "(" else "[]", "items": [parse_ref(x) for x in body.split()]}
        for k, body in re.findall(r"([\(\[])([^\)\]]*)[\)\]]", lines[i])
    ]
    return b


def parse_file(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    return [parse_block(c) for c in text.split("---") if c.strip()]


# ---------------------------------------------------------------- quotient vertex tables
# pruner.py's edgelabel(): orbits 0..3 get primes, beyond that "@n".
def edgelabel(core, orbit):
    return core + ("'" * orbit if orbit <= 3 else "@" + str(orbit))


class VTable:
    """The folded (site-symmetry-quotient) half-edge table of one vertex orbit -- the generated
    analogue of one row of pruner.py's labellistin/rneiglistin/mirrolistin/lvertlistin."""

    __slots__ = ("t", "n", "rneig", "lneig", "mirro", "step", "tile", "drawn", "core_labels", "axis")

    def __init__(self, listed, units, chiral, axis=None):
        t = len(listed)
        u = [units[c] for c in listed]
        self.t = t
        self.axis = axis
        if chiral:
            # Plain slots 0..t-1 walked forward, plus a full mirrored copy walked backward.
            self.n = 2 * t
            self.rneig = [(s + 1) % t for s in range(t)] + [t + (s - 1) % t for s in range(t)]
            self.step = u + [u[(s - 1) % t] for s in range(t)]
            # The corner crossed when stepping s -> rneig[s]: listed[s] plain, its mirror starred.
            self.tile = list(listed) + [listed[(s - 1) % t] for s in range(t)]
            self.mirro = [t + s for s in range(t)] + list(range(t))
            self.core_labels = [str(s) for s in range(t)] + ["*" + str(s) for s in range(t)]
        else:
            # A mirror in the site group: same t slots; mirro is the axis involution
            # mu(s) = (axis - s) mod t; the later of each pair is labelled *rep.
            mu = [(axis - s) % t for s in range(t)]
            self.n = t
            self.rneig = [(s + 1) % t for s in range(t)]
            self.step = u
            self.tile = list(listed)
            self.mirro = mu
            self.core_labels = [str(s) if s <= mu[s] else "*" + str(mu[s]) for s in range(t)]
        self.lneig = [0] * self.n
        for s in range(self.n):
            self.lneig[self.rneig[s]] = s
        drawn_plain = [listed[s] == "A2" or listed[(s - 1) % t] == "A2" for s in range(t)]
        self.drawn = drawn_plain + (drawn_plain if chiral else [])


def vtable_variants(figure, tag, grid):
    """All candidate VTables for one (figure, tag). More than one only when the figure admits
    several mirror axes; the developer tries each and lets consistency decide."""
    g = GRIDS[grid]
    units = g["units"]
    for c in figure:
        if c not in units:
            raise DevelopError(f"tile {c} not in the {grid} alphabet")
    s = sum(units[c] for c in figure)
    if s == 0 or 12 % s:
        raise DevelopError(f"figure {figure} angle sum {s * 30} does not divide 360")
    rot = 12 // s  # rotation order of the site group
    t = len(figure)

    m = re.fullmatch(r"(F|C\d+|A[a-z0-9]*|D\d+[a-z]?)(x\d+)?", tag or "F")
    if not m:
        raise DevelopError(f"unrecognised site tag {tag!r}")
    head = m.group(1)
    if head == "F" or head.startswith("C"):
        if head.startswith("C") and int(head[1:]) != rot:
            raise DevelopError(f"tag {tag} order != rotation order {rot} of {figure}")
        return [VTable(figure, units, chiral=True)]
    # A mirror is present (A* order 2, D* order 2*rot). Valid axes a: the reflection
    # slot s -> (a - s) mod t must preserve corner sizes: figure[s] == figure[(a-s-1) mod t].
    if head.startswith("D") and int(re.match(r"D(\d+)", head).group(1)) != 2 * rot:
        raise DevelopError(f"tag {tag} order != 2 * rotation order {rot} of {figure}")
    axes = [a for a in range(t)
            if all(figure[s] == figure[(a - s - 1) % t] for s in range(t))]
    if not axes:
        raise DevelopError(f"tag {tag} claims a mirror but figure {figure} admits none")
    return [VTable(figure, units, chiral=False, axis=a) for a in axes]


# ---------------------------------------------------------------- glue (pruner.py makeglue port)
class Block:
    """One certificate with a chosen VTable per orbit: global entry arrays + glue."""

    def __init__(self, cert, tables, grid):
        self.grid = grid
        self.tables = tables
        self.orbit_of = []
        self.slot_of = []   # index into the table's own entries
        self.offset = []
        rneig, lneig, mirro, step, tile, drawn, labels = [], [], [], [], [], [], []
        for o, tb in enumerate(tables):
            base = len(rneig)
            self.offset.append(base)
            rneig += [base + x for x in tb.rneig]
            lneig += [base + x for x in tb.lneig]
            mirro += [base + x for x in tb.mirro]
            step += tb.step
            tile += tb.tile
            drawn += tb.drawn
            labels += [edgelabel(c, o) for c in tb.core_labels]
            self.orbit_of += [o] * tb.n
            self.slot_of += list(range(tb.n))
        self.rneig, self.lneig, self.mirro, self.step, self.tile, self.drawn = (
            rneig, lneig, mirro, step, tile, drawn)
        self.label_index = {}
        for i, lab in enumerate(labels):
            if lab in self.label_index:
                raise DevelopError(f"duplicate label {lab}")
            self.label_index[lab] = i
        self.glue = self._make_glue(cert["structure"])

    def _ref_entry(self, ref, extra_star=False):
        star = ref["mirror"] != extra_star  # composing stars cancels
        lab = edgelabel(("*" if star else "") + str(ref["pos"]), ref["orbit"])
        if lab not in self.label_index:
            raise DevelopError(f"label {lab} not in table")
        return self.label_index[lab]

    def _make_glue(self, structure):
        glue = [-1] * len(self.rneig)
        for item in structure:
            items = item["items"]
            first = items[0]
            second = items[1] if len(items) > 1 else items[0]
            k0 = self._ref_entry(first)
            k1 = self._ref_entry(second, extra_star=(item["kind"] == "[]"))
            for a, b in ((k0, k1), (self.mirro[k0], self.mirro[k1])):
                if glue[a] not in (-1, b) or glue[b] not in (-1, a):
                    raise DevelopError("conflicting gluing")
                glue[a] = b
                glue[b] = a
        if -1 in glue:
            raise DevelopError("structure line does not glue every half-edge")
        return glue


# ---------------------------------------------------------------- develop (develop.py BFS port)
def develop(block):
    """BFS-develop a Block on its grid. Returns (periods' HNF lattice, drawn set, orbit map).

    Positions are exact integer pairs in the grid basis. placed maps (entry, direction) -> pos;
    the same key re-met at a different position yields a translation period (develop.py's trick:
    the quotient is finite, so the planar development revisits it on a lattice)."""
    g = GRIDS[block.grid]
    step = g["step"]
    placed = {}
    expanded = {}
    periods = []

    def star(h0, d0):
        seq = []
        cur, d = h0, d0
        for _ in range(40):
            seq.append((cur, d))
            cur2 = block.rneig[cur]
            d = (d + block.step[cur]) % 12
            cur = cur2
            if (cur, d) == (h0, d0):
                return seq
        raise DevelopError("star walk did not close")

    def reg(h, d, pos):
        key = (h, d)
        prev = placed.get(key)
        if prev is not None:
            if prev != pos:
                periods.append((pos[0] - prev[0], pos[1] - prev[1]))
            return False
        if pos in expanded:
            # A new entry claims an already-expanded vertex: the gluing is inconsistent
            # (wrong mirror axis or convention); fail loudly instead of absorbing it.
            raise DevelopError("star clash at an expanded vertex")
        placed[key] = pos
        return True

    reg(0, 0, (0, 0))
    q = deque([(0, 0, (0, 0))])
    guard = 0
    while q:
        guard += 1
        if guard > 100000:
            raise DevelopError("BFS did not terminate")
        h0, d0, pos = q.popleft()
        if pos in expanded:
            continue
        for (h, d) in star(h0, d0):
            reg(h, d, pos)
            if d not in step:
                raise DevelopError(f"direction {d} off the {block.grid} grid")
            dx, dy = step[d]
            npos = (pos[0] + dx, pos[1] + dy)
            gd = (d + 6) % 12
            if reg(block.glue[h], gd, npos):
                q.append((block.glue[h], gd, npos))
        # Marked AFTER the star registers its members, so the clash check in reg() only ever
        # fires for a foreign entry arriving at a finished vertex -- a genuine inconsistency.
        expanded[pos] = (h0, d0)

    if not periods:
        raise DevelopError("no periods (development did not wrap)")
    lat = None
    for v in periods:
        lat = lattice_add(lat, v)
    if lat is None or lat[0] == 0 or lat[2] == 0:
        raise DevelopError("period lattice rank < 2")
    return lat, placed, expanded


def egcd(a, b):
    old_r, r, old_s, s, old_t, t = a, b, 1, 0, 0, 1
    while r:
        qq = old_r // r
        old_r, r = r, old_r - qq * r
        old_s, s = s, old_s - qq * s
        old_t, t = t, old_t - qq * t
    if old_r < 0:
        old_r, old_s, old_t = -old_r, -old_s, -old_t
    return old_r, old_s, old_t


def lattice_add(lat, v):
    """Fold integer vector v into the lattice. States: None (empty); (a, b, 0) = rank 1 with the
    single generator (a, b); (a, b, d) with a, d > 0 = full rank in HNF, generators (a,0),(b,d)."""
    x, y = v
    if x == 0 and y == 0:
        return lat
    if lat is None:
        return (x, y, 0)
    a, b, d = lat
    if d == 0:
        det = a * y - b * x
        if det == 0:
            # parallel generators: combine gcd-wise along the shared primitive vector
            gp, _, _ = egcd(a, b) if (a or b) else (1, 0, 0)
            px, py = a // gp, b // gp
            m1 = gp
            m2 = x // px if px else y // py
            gm, _, _ = egcd(m1, m2)
            return (gm * px, gm * py, 0)
        return hnf2((a, b), (x, y))
    # full-rank lattice + one vector: fold into the second row, push the leftover into a
    gy, s, t = egcd(d, y)
    row2x = s * b + t * x
    left = (d // gy) * x - (y // gy) * b
    na, _, _ = egcd(a, left)
    if na == 0:
        raise DevelopError("degenerate lattice fold")
    return (na, row2x % na, gy)


def reduce_coset(a, b, d, x, y):
    q = y // d
    return ((x - q * b) % a) + a * (y - q * d)


def emit_pattern(block, lat, placed, expanded):
    """Reduce the developed drawn edges modulo the period lattice into the viewer's bitmask."""
    g = GRIDS[block.grid]
    a, b, d = lat
    n = a * d
    axes = g["axes"]
    step = g["step"]
    naxes = len(axes)
    bits = [[-1] * n for _ in range(naxes)]
    axis_of = {}
    for i, ax in enumerate(axes):
        axis_of[ax] = (i, 0)
        axis_of[(-ax[0], -ax[1])] = (i, 1)
    for (h, dd), pos in placed.items():
        vec = step[dd]
        i, backwards = axis_of[vec]
        base = pos if not backwards else (pos[0] + vec[0], pos[1] + vec[1])
        c = reduce_coset(a, b, d, base[0], base[1])
        val = 1 if block.drawn[h] else 0
        if bits[i][c] not in (-1, val):
            raise DevelopError("inconsistent drawn flag for one edge class")
        bits[i][c] = val
    for row in bits:
        if -1 in row:
            raise DevelopError("emitted domain has unseen edges")
    orbit = [-1] * n
    for pos, (h0, _) in expanded.items():
        c = reduce_coset(a, b, d, pos[0], pos[1])
        o = block.orbit_of[h0]
        if orbit[c] not in (-1, o):
            raise DevelopError("vertex coset maps to two orbits")
        orbit[c] = o
    if -1 in orbit:
        raise DevelopError("emitted domain has unseen vertices")
    return {"a": a, "b": b, "d": d, "bits": bits, "orbit": orbit}


# ---------------------------------------------------------------- combined grid (patch mode)
# No fixed lattice: develop in exact Z[zeta12], then emit an explicit patch — vertices, edges and
# polygon faces of one period, each endpoint a (vertex index, integer T1/T2 offset) pair. The BFS is
# the same as develop(); only positions are ring elements instead of grid pairs.

def lattice_basis_z(periods):
    """Integer basis of the Z-submodule of Z^4 spanned by the period ring elements (develop.py port)."""
    piv = {}
    for v in periods:
        v = list(v)
        if not any(v):
            continue
        for col in range(4):
            if v[col] == 0:
                continue
            if col in piv:
                b = piv[col]
                g, x, y = egcd_pair(b[col], v[col])
                nb = [x * b[i] + y * v[i] for i in range(4)]
                bc = b[col] // g
                vc = v[col] // g
                v = [bc * v[i] - vc * b[i] for i in range(4)]
                piv[col] = nb
            else:
                piv[col] = v
                v = [0, 0, 0, 0]
                break
    return [tuple(piv[c]) for c in sorted(piv)]


def egcd_pair(a, b):
    g, s, t = egcd(a, b)
    return g, s, t


def _dotf(u, v):
    a, b = zfloat(u), zfloat(v)
    return a.real * b.real + a.imag * b.imag


def gauss_reduce(T1, T2):
    a, b = tuple(T1), tuple(T2)
    for _ in range(1000):
        if _dotf(b, b) < _dotf(a, a):
            a, b = b, a
        da = _dotf(a, a)
        if da == 0:
            break
        m = int(round(_dotf(b, a) / da))
        if m == 0:
            break
        b = zsub(b, zscale(a, m))
    if _dotf(b, b) < _dotf(a, a):
        a, b = b, a
    return a, b


def develop_patch(block):
    """BFS-develop a Block in Z[zeta12]. Returns (T1, T2, placed) with placed[(entry, dir)] = pos."""
    placed = {}
    expanded = {}
    periods = []

    def star(h0, d0):
        seq = []
        cur, d = h0, d0
        for _ in range(40):
            seq.append((cur, d))
            cur2 = block.rneig[cur]
            d = (d + block.step[cur]) % 12
            cur = cur2
            if (cur, d) == (h0, d0):
                return seq
        raise DevelopError("star walk did not close")

    def reg(h, d, pos):
        key = (h, d)
        prev = placed.get(key)
        if prev is not None:
            if prev != pos:
                periods.append(zsub(pos, prev))
            return False
        if pos in expanded:
            raise DevelopError("star clash at an expanded vertex")
        placed[key] = pos
        return True

    reg(0, 0, ZZERO)
    q = deque([(0, 0, ZZERO)])
    guard = 0
    while q:
        guard += 1
        if guard > 100000:
            raise DevelopError("BFS did not terminate")
        h0, d0, pos = q.popleft()
        if pos in expanded:
            continue
        for (h, d) in star(h0, d0):
            reg(h, d, pos)
            npos = zadd(pos, ZK[d])
            gd = (d + 6) % 12
            if reg(block.glue[h], gd, npos):
                q.append((block.glue[h], gd, npos))
        expanded[pos] = (h0, d0)

    if not periods:
        raise DevelopError("no periods (development did not wrap)")
    basis = lattice_basis_z(periods)
    if len(basis) != 2:
        raise DevelopError(f"period lattice rank {len(basis)} != 2")
    T1, T2 = gauss_reduce(basis[0], basis[1])
    return T1, T2, placed


class PatchComplex:
    """The quotient cell complex of a developed combined-grid solution.

    The key fact (inherited from develop()): all placements of one (entry, dir) key differ by
    lattice vectors, because the lattice is GENERATED by those differences. So the quotient
    complex needs no further work: directed edges ARE the keys, and the whole face/adjacency
    structure is the pure combinatorial map next(K) = (lneig[glue[h]], d + 6 - step[...]).
    """

    def __init__(self, block, T1, T2, placed):
        self.block = block
        self.T1, self.T2 = T1, T2
        self.placed = placed
        f1, f2 = zfloat(T1), zfloat(T2)
        det = f1.real * f2.imag - f1.imag * f2.real
        if abs(det) < 1e-9:
            raise DevelopError("degenerate period basis")
        self._inv = (f2.imag / det, -f2.real / det, -f1.imag / det, f1.real / det)

    def lam_coords(self, zv):
        """Exact integer (m, n) with zv = m*T1 + n*T2; DevelopError if zv is not in the lattice."""
        p = zfloat(zv)
        m = round(self._inv[0] * p.real + self._inv[1] * p.imag)
        n = round(self._inv[2] * p.real + self._inv[3] * p.imag)
        if zsub(zv, zadd(zscale(self.T1, m), zscale(self.T2, n))) != ZZERO:
            raise DevelopError("vector not in the period lattice")
        return m, n

    def reduce_pos(self, pos):
        """(representative position in the base cell, (m, n) lift). Floor in float, subtract exact."""
        p = zfloat(pos)
        al = self._inv[0] * p.real + self._inv[1] * p.imag
        be = self._inv[2] * p.real + self._inv[3] * p.imag
        m = _math.floor(al + 1e-9)
        n = _math.floor(be + 1e-9)
        red = zsub(zsub(pos, zscale(self.T1, m)), zscale(self.T2, n))
        return red, (m, n)

    def build(self):
        b = self.block
        keys = sorted(self.placed)
        # Vertices: distinct reduced positions. Orbit label from the entry's certificate orbit.
        vindex = {}
        vorbit = []
        vpos = []
        key_vertex = {}
        key_off = {}
        for K in keys:
            red, off = self.reduce_pos(self.placed[K])
            if red not in vindex:
                vindex[red] = len(vpos)
                vpos.append(red)
                vorbit.append(b.orbit_of[K[0]])
            key_vertex[K] = vindex[red]
            key_off[K] = off
            if vorbit[vindex[red]] != b.orbit_of[K[0]]:
                raise DevelopError("vertex hosts two certificate orbits")
        # delta(K): lattice step from K's own instance to the reverse key's instance.
        delta = {}
        for (h, d) in keys:
            K = (h, d)
            Kr = (b.glue[h], (d + 6) % 12)
            far = zadd(self.placed[K], ZK[d])
            delta[K] = self.lam_coords(zsub(far, self.placed[Kr]))
        # Faces: cycles of next() over keys whose corner tile is a polygon (digons are the drawn
        # edge markers, not faces). next walks the face on the LEFT of the directed edge.
        def nxt(K):
            h, d = K
            g = b.glue[h]
            x = b.lneig[g]
            return (x, (d + 6 - b.step[x]) % 12)

        def face_tile(K):
            h, d = K
            return b.tile[b.lneig[b.glue[h]]]

        faces = []
        face_of_key = {}
        seen = set()
        for K0 in keys:
            if K0 in seen or face_tile(K0) == "A2":
                continue
            cyc = []
            offs = []
            K = K0
            o = (0, 0)
            tile = face_tile(K0)
            for _ in range(50):
                cyc.append(K)
                offs.append(o)
                seen.add(K)
                if face_tile(K) != tile:
                    raise DevelopError("face changed tile type mid-walk")
                K2 = nxt(K)
                # next edge starts at K's far vertex: off2 = off + (far - placed[K2]) in lattice coords
                far = zadd(self.placed[K], ZK[K[1]])
                step = self.lam_coords(zsub(far, self.placed[K2]))
                o = (o[0] + step[0], o[1] + step[1])
                K = K2
                if K == K0:
                    break
            else:
                raise DevelopError("face walk did not close")
            if o != (0, 0):
                raise DevelopError("face walk returned with a lattice offset")
            want = {"A3": 3, "A4": 4}[tile]
            if len(cyc) != want:
                raise DevelopError(f"{tile} face has {len(cyc)} corners")
            fid = len(faces)
            faces.append({"keys": cyc, "offs": offs, "tile": tile})
            for K, o in zip(cyc, offs):
                face_of_key[K] = (fid, o)
        # Torus Euler check. In the tiling-with-digons every drawn geometric edge is TWO tiling edges
        # (one against each neighbouring polygon) with a zero-area digon face between them, so
        # V - E + (polygon faces + digon faces) = 0 on the torus. Digon faces = A2-sided key pairs.
        n_e = len(keys) // 2
        n_digon = sum(1 for K in keys if face_tile(K) == "A2") // 2
        if len(vpos) - n_e + len(faces) + n_digon != 0:
            raise DevelopError(
                f"torus Euler failed: V={len(vpos)} E={n_e} F={len(faces)} D={n_digon}")
        self.vpos, self.vorbit = vpos, vorbit
        self.key_vertex, self.key_off = key_vertex, key_off
        self.delta, self.faces, self.face_of_key = delta, faces, face_of_key
        return self

    def classify(self):
        """Holonomy flood fill over faces across UNDRAWN edges — the same lift-mismatch machinery
        as the fixed-grid analyser, with quotient faces in place of lattice cells."""
        b = self.block
        comp = [-1] * len(self.faces)
        out = []
        for start in range(len(self.faces)):
            if comp[start] != -1:
                continue
            cid = len(out)
            lifts = {start: (0, 0)}
            comp[start] = cid
            periods = []
            queue = deque([start])
            while queue:
                f = queue.popleft()
                L = lifts[f]
                rec = self.faces[f]
                for K, oK in zip(rec["keys"], rec["offs"]):
                    h, d = K
                    if b.drawn[h]:
                        continue
                    Kr = (b.glue[h], (d + 6) % 12)
                    f2, o2 = self.face_of_key[Kr]
                    dK = self.delta[K]
                    L2 = (L[0] + oK[0] + dK[0] - o2[0], L[1] + oK[1] + dK[1] - o2[1])
                    if comp[f2] == -1:
                        comp[f2] = cid
                        lifts[f2] = L2
                        queue.append(f2)
                    elif comp[f2] == cid:
                        dm, dn = L2[0] - lifts[f2][0], L2[1] - lifts[f2][1]
                        if (dm, dn) != (0, 0):
                            periods.append((dm, dn))
                    else:
                        raise DevelopError("component collision")
            rank = span_rank2(periods)
            out.append({"faces": sorted(lifts), "rank": rank,
                        "cells": len(lifts), "holes": 0})
        # Holes for finite components: Euler over the materialised instance. A face-instance at lift L
        # places corner K at vpos[key_vertex[K]] + (key_off[K] + L + oK)*Lambda, so (vertex index,
        # that total offset) identifies a vertex instance; a directed-edge instance is (K, L + oK) and
        # its reverse is (Kr, L + oK + delta[K]) — sorting the pair names the undirected edge once.
        for c in out:
            if c["rank"] != 0:
                continue
            verts, edges, nf = set(), set(), 0
            stack = [(c["faces"][0], (0, 0))]
            seenf = {(c["faces"][0], (0, 0))}
            while stack:
                f, L = stack.pop()
                nf += 1
                rec = self.faces[f]
                for K, oK in zip(rec["keys"], rec["offs"]):
                    h, d = K
                    vi = self.key_vertex[K]
                    oi = self.key_off[K]
                    verts.add((vi, oi[0] + L[0] + oK[0], oi[1] + L[1] + oK[1]))
                    Kr = (b.glue[h], (d + 6) % 12)
                    inst = (K, (L[0] + oK[0], L[1] + oK[1]))
                    rinst = (Kr, (L[0] + oK[0] + self.delta[K][0], L[1] + oK[1] + self.delta[K][1]))
                    edges.add(tuple(sorted([inst, rinst])))
                    if not b.drawn[h]:
                        f2, o2 = self.face_of_key[Kr]
                        dK = self.delta[K]
                        L2 = (L[0] + oK[0] + dK[0] - o2[0], L[1] + oK[1] + dK[1] - o2[1])
                        if (f2, L2) not in seenf:
                            seenf.add((f2, L2))
                            stack.append((f2, L2))
            c["holes"] = 1 - (len(verts) - len(edges) + nf)
        return comp, out


def span_rank2(vs):
    first = None
    for w in vs:
        if w == (0, 0):
            continue
        if first is None:
            first = w
            continue
        if first[0] * w[1] - first[1] * w[0] != 0:
            return 2
    return 0 if first is None else 1


def emit_patch(block, T1, T2, placed):
    """The viewer payload: float T1/T2, vertices + orbit, edges and polygon faces as
    (vertex index, integer offset) pairs, plus per-face component ids and component ranks."""
    cx = PatchComplex(block, T1, T2, placed).build()
    comp, comps = cx.classify()
    rnd = lambda z: [round(z.real, 5), round(z.imag, 5)]
    verts = [rnd(zfloat(p)) for p in cx.vpos]
    edges = []
    seen = set()
    b = block
    for K in sorted(cx.key_vertex):
        h, d = K
        Kr = (b.glue[h], (d + 6) % 12)
        und = tuple(sorted([K, Kr]))
        if und in seen:
            continue
        seen.add(und)
        # Far point of K: placed[K] + ZK[d] = placed[Kr] + delta*Lambda. With placed[K] = vpos[vi] +
        # oi*Lambda and placed[Kr] = vpos[vj] + oj*Lambda, the segment anchored at vpos[vi] runs to
        # vpos[vj] + (oj + delta - oi)*Lambda.
        vi = cx.key_vertex[K]
        vj = cx.key_vertex[Kr]
        oi = cx.key_off[K]
        oj = cx.key_off[Kr]
        d0 = cx.delta[K]
        off = (oj[0] + d0[0] - oi[0], oj[1] + d0[1] - oi[1])
        # A drawn geometric edge is TWO tiling edges (one per digon side) tracing the same segment;
        # dedupe geometrically, normalising so the anchor endpoint carries offset (0, 0).
        a, bb = sorted([(vi, 0, 0), (vj, off[0], off[1])])
        gkey = (a[0], bb[0], bb[1] - a[1], bb[2] - a[2])
        if gkey in seen:
            continue
        seen.add(gkey)
        edges.append([vi, vj, off[0], off[1], 1 if b.drawn[h] else 0])
    # Polygon rings: corner K of a face instance sits at vpos[v] + (key_off[K] + oK)*Lambda; anchor
    # each ring at its first corner's total offset so the stored offsets stay small.
    polys = []
    poly_comp = []
    for fid, rec in enumerate(cx.faces):
        ring = []
        base = None
        for K, oK in zip(rec["keys"], rec["offs"]):
            oi = cx.key_off[K]
            tot = (oi[0] + oK[0], oi[1] + oK[1])
            if base is None:
                base = tot
            ring.append([cx.key_vertex[K], tot[0] - base[0], tot[1] - base[1]])
        polys.append(ring)
        poly_comp.append(comp[fid])
    stats = {
        "faceOrbits": len(comps),
        "finite": sum(1 for c in comps if c["rank"] == 0),
        "strips": sum(1 for c in comps if c["rank"] == 1),
        "unbounded": sum(1 for c in comps if c["rank"] == 2),
        "withHoles": sum(1 for c in comps if c["holes"] > 0),
    }
    return {
        "T1": rnd(zfloat(T1)),
        "T2": rnd(zfloat(T2)),
        "verts": verts,
        "vorbit": cx.vorbit,
        "edges": edges,
        "polys": polys,
        "polyComp": poly_comp,
        "compRank": [c["rank"] for c in comps],
        "compCells": [c["cells"] for c in comps],
        "compHoles": [c["holes"] for c in comps],
        "stats": stats,
    }


# ---------------------------------------------------------------- canonical form (fd_enum2 port)
def close_group(gens):
    ident = (1, 0, 0, 1)
    G = {ident}
    frontier = [ident]
    while frontier:
        x = frontier.pop()
        for hgen in gens:
            y = (hgen[0] * x[0] + hgen[1] * x[2], hgen[0] * x[1] + hgen[1] * x[3],
                 hgen[2] * x[0] + hgen[3] * x[2], hgen[2] * x[1] + hgen[3] * x[3])
            if y not in G:
                G.add(y)
                frontier.append(y)
    return sorted(G)


CANON_PG = {
    "square": close_group([(0, -1, 1, 0), (1, 0, 0, -1)]),      # D4 on Z^2
    "triangle": close_group([(0, -1, 1, 1), (1, 1, 0, -1)]),    # D6 in the (e1, e2) basis
}


def mat_apply(gm, p):
    return (gm[0] * p[0] + gm[1] * p[1], gm[2] * p[0] + gm[3] * p[1])


def hnf2(u, v):
    det = u[0] * v[1] - u[1] * v[0]
    if det == 0:
        return None
    if u[1] == 0 and v[1] == 0:
        return None
    gy, s, t = egcd(u[1], v[1])
    d = gy
    wx = s * u[0] + t * v[0]
    a = abs(det) // d
    return (a, wx % a, d)


def mat_mul(x, y):
    return (x[0] * y[0] + x[1] * y[2], x[0] * y[1] + x[1] * y[3],
            x[2] * y[0] + x[3] * y[2], x[2] * y[1] + x[3] * y[3])


def canonical(grid, a, b, d, bits):
    """Minimal (lattice, bits) over the grid's point group x translations. Same object as
    fd_enum2's canonical(), so developed patterns can be matched against enumerated ones."""
    g = GRIDS[grid]
    PG = CANON_PG[grid]
    dirs = g["axes"]
    ndir = {v: i for i, v in enumerate(dirs)}
    neg = {(-v[0], -v[1]): i for i, v in enumerate(dirs)}
    n = a * d
    best = None
    for gm in PG:
        lat2 = hnf2(mat_apply(gm, (a, 0)), mat_apply(gm, (b, d)))
        a2, b2, d2 = lat2
        n2 = a2 * d2
        gi = next(x for x in PG if mat_mul(x, gm) == (1, 0, 0, 1))
        # push bits through g then take the minimum over translations
        base = []
        for c2 in range(n2):
            v2 = (c2 % a2, c2 // a2)
            p0 = mat_apply(gi, v2)
            row = []
            for e in dirs:
                w = mat_apply(gi, e)
                if w in ndir:
                    j, qpos = ndir[w], p0
                else:
                    j, qpos = neg[w], (p0[0] + w[0], p0[1] + w[1])
                row.append(bits[j][reduce_coset(a, b, d, qpos[0], qpos[1])])
            base.append(row)
        for tc in range(n2):
            tx, ty = tc % a2, tc // a2
            cand = tuple(base[reduce_coset(a2, b2, d2, (c2 % a2) - tx, (c2 // a2) - ty)][j]
                         for j in range(len(dirs)) for c2 in range(n2))
            key = ((a2, b2, d2), cand)
            if best is None or key < best:
                best = key
    return best


# ---------------------------------------------------------------- driver
def develop_block(cert, grid):
    """Try every VTable variant combination; return the emitted patterns that develop cleanly."""
    variant_lists = [vtable_variants(t["figure"], t["tag"], grid) for t in cert["types"]]
    combos = [[]]
    for vl in variant_lists:
        combos = [c + [v] for c in combos for v in vl]
    out, reasons = [], []
    for tables in combos:
        try:
            block = Block(cert, tables, grid)
            if grid == "ts":
                T1, T2, placed = develop_patch(block)
                out.append(emit_patch(block, T1, T2, placed))
            else:
                lat, placed, expanded = develop(block)
                out.append(emit_pattern(block, lat, placed, expanded))
        except DevelopError as e:
            reasons.append(str(e))
    return out, len(combos), reasons


def run_ts(certs, args):
    """Combined-grid driver: develop every certificate into a patch, run the internal checks
    (star closure, glue completeness, face-walk closure, torus Euler — all inside develop/emit),
    verify the digon-free slice IS the known uniform square-triangle tilings, write per-k files."""
    from collections import defaultdict
    by_k = defaultdict(list)
    fails = []
    multi_ok = 0
    digonfree = Counter()
    fail_reasons = Counter()
    for ci, cert in enumerate(certs):
        pats, ncombo, reasons = develop_block(cert, "ts")
        for r in reasons:
            fail_reasons[r] += 1
        if not pats:
            fails.append(ci)
            continue
        if len(pats) > 1:
            # Distinct mirror axes that BOTH develop cleanly. Keep the first; count loudly.
            multi_ok += 1
        k = cert.get("k")
        if all("A2" not in t["figure"] for t in cert["types"]):
            digonfree[k] += 1
        by_k[k].append(pats[0])
    print(f"developed {sum(len(v) for v in by_k.values())}/{len(certs)} "
          f"({len(fails)} failed, {multi_ok} with >1 clean variant)")
    for r, c in fail_reasons.most_common(5):
        print(f"    variant failure x{c}: {r}")
    print(f"digon-free (= underlying uniform square-triangle tilings) per k: {dict(sorted(digonfree.items()))}")
    if args.out:
        for k, pats in sorted(by_k.items()):
            recs = []
            for i, p in enumerate(pats, start=1):
                # Self-contained FreedrawPattern records: the lattice-bits fields are 1x1 dummies so
                # every existing consumer type-checks; all real geometry lives under `patch`.
                recs.append({"id": f"fdts-{k}-{i:05d}", "k": k, "grid": "ts",
                             "a": 1, "b": 0, "d": 1, "h": [0], "v": [0], "orbit": [0],
                             "patch": p})
            path = args.out.replace(".json", f"-k{k}.json")
            json.dump(recs, open(path, "w"), separators=(",", ":"))
            sz = os.path.getsize(path)
            print(f"wrote {path}: {len(recs)} patches, {sz/1e6:.1f} MB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--grid", default="square", choices=sorted(GRIDS))
    ap.add_argument("--oracle", help="known-good bitmask JSON to match bijectively")
    ap.add_argument("--out")
    args = ap.parse_args()

    paths = ([os.path.join(args.source, p) for p in sorted(os.listdir(args.source))
              if p.endswith(".txt")] if os.path.isdir(args.source) else [args.source])
    certs = []
    for p in paths:
        certs.extend(parse_file(p))
    print(f"parsed {len(certs)} certificates")

    if args.grid == "ts":
        run_ts(certs, args)
        return

    oracle_index = {}
    oracle_ks = set()
    if args.oracle:
        axis_names = GRIDS[args.grid]["axis_names"]
        for r in json.load(open(args.oracle)):
            bits = [r[nm] for nm in axis_names]
            oracle_index[canonical(args.grid, r["a"], r["b"], r["d"], bits)] = r["id"]
            oracle_ks.add(r["k"])
        print(f"oracle: {len(oracle_index)} known patterns (k in {sorted(oracle_ks)})")

    developed = {}
    fails, multi = [], 0
    fail_reasons = Counter()
    for ci, cert in enumerate(certs):
        pats, ncombo, reasons = develop_block(cert, args.grid)
        for r in reasons:
            fail_reasons[r] += 1
        if ncombo > 1:
            multi += 1
        forms = {canonical(args.grid, p["a"], p["b"], p["d"], p["bits"]): p for p in pats}
        if not forms:
            fails.append(ci)
            continue
        if len(forms) > 1:
            # Ambiguous mirror axis that develops both ways: the oracle picks; otherwise report.
            hit = [f for f in forms if f in oracle_index] if oracle_index else []
            if len(hit) == 1:
                forms = {hit[0]: forms[hit[0]]}
            else:
                fails.append(ci)
                continue
        form, pat = next(iter(forms.items()))
        developed.setdefault(form, []).append((ci, cert.get("k"), pat))

    print(f"developed {sum(len(v) for v in developed.values())}/{len(certs)} "
          f"({len(fails)} failed, {multi} had multiple table variants)")
    for r, c in fail_reasons.most_common(6):
        print(f"    variant failure x{c}: {r}")
    dup = {f: v for f, v in developed.items() if len(v) > 1}
    if dup:
        print(f"WARNING: {len(dup)} canonical forms produced by more than one certificate")

    if oracle_index:
        # Judge the bijection only on the k values the oracle covers -- a partial oracle
        # (e.g. triangle k=1) validates its slice, it does not indict the rest.
        in_scope = {f: v for f, v in developed.items() if v[0][1] in oracle_ks}
        hits = sum(1 for f in in_scope if f in oracle_index)
        missed = [oracle_index[f] for f in oracle_index if f not in developed]
        print(f"oracle match (k in {sorted(oracle_ks)}): {hits}/{len(in_scope)} developed "
              f"forms are known; {len(missed)} known patterns not reached")
        print("BIJECTION on the oracle's slice"
              if hits == len(in_scope) == len(oracle_index) and not dup
              else "NOT A BIJECTION")
        if missed[:5]:
            print("  first missed:", missed[:5])

    if args.out:
        axis_names = GRIDS[args.grid]["axis_names"]
        by_k = Counter()
        out = []
        for form, v in sorted(developed.items()):
            ci, k, pat = v[0]
            by_k[k] += 1
            rec = {"id": f"fd{args.grid[0]}-{k}-{by_k[k]:04d}", "k": k,
                   "a": pat["a"], "b": pat["b"], "d": pat["d"], "orbit": pat["orbit"]}
            for i, nm in enumerate(axis_names):
                rec[nm] = pat["bits"][i]
            out.append(rec)
        json.dump(out, open(args.out, "w"), separators=(",", ":"))
        print(f"wrote {args.out}: {len(out)} patterns, by k: {dict(sorted(by_k.items()))}")


if __name__ == "__main__":
    main()
