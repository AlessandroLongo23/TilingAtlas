#!/usr/bin/env python3
"""Draw a Delaney-Dress symbol. Euclidean: symbol in, period cell out (this docstring, `realize`).
Any geometry: `circle_pattern` finds the metric from the quotient alone, `chamber_steps` turns it into
isometries, `develop_sphere` unfolds a spherical symbol to the whole sphere.

A D-symbol fixes a tiling's topology and symmetry and says nothing about shape, so a drawing is a
CHOICE. The choice made here is the equilibrium one: every vertex sits at the centroid of its
neighbours. On a torus that placement is unique up to an affine map, and the affine map is then fixed
by asking the edge vectors to have an isotropic second moment, which makes every symmetry of the symbol
an isometry of the picture. Tiles come out convex whenever the tiling is 3-connected. Where two tiles
meet along more than one edge, straight edges give one of them no area, `ok` says so, and main() draws
that type again on the barycentric subdivision (`bary`), each edge through its midpoint.

Steps, all on the chamber graph, no search:
  1. orientation cover        chambers (c, +-1), every sigma flips the sign
  2. rotation cover           an angle structure (corner angles per chamber that sum correctly round
                              every vertex, edge and face) gives each chamber a direction; its holonomy
                              is the rotation part of the symmetry group, a class mod N. Unwinding it
                              leaves translations only: a torus.
  3. harmonic 1-forms         edge vectors that close round every face and balance at every vertex
                              form a 2-dimensional space; a basis of it IS the equilibrium drawing.
  4. whiten, integrate        positions from a spanning tree, lattice from the leftover cycles.

EXACTLY THE TYPE'S SYMMETRY. Plain equilibrium has the full symmetry of the underlying graph, so every
type on one topology would get one picture: 93 isogonal types, 11 pictures. Two things remove the
surplus, both constant on the type's own classes and so still symmetric under its own group:
  - each edge class gets its own spring weight, so classes come out with different lengths;
  - each edge class is bent by the curve its stabilizer allows (Grunbaum and Shephard's edge shapes,
    the ones Tactile uses): J when nothing fixes the edge, S for a half-turn about its midpoint, U for
    a mirror across it, and straight when a mirror runs along it.
A type whose edges all lie on mirrors cannot bend, and its tiles are then as symmetric as the graph
allows. Those get a MARK: a small scalene triangle in every chamber of one class. A symmetry of the
marked picture carries a marked chamber to a marked chamber, some element of the type's group does the
same, and two symmetries of a tiling that agree on one chamber are equal. So one marked class is enough.
`symmetry_order` then counts the symmetries the finished picture really has; main() refuses to call a
row clean unless that count equals the order of the type's point group.

usage: develop_dsym.py <euclidean.tdb> "<sql where>" <reference-atlas.json[.gz]> [log]
       e.g. "vertices<=2" for the two complete levels, written as atlas rows (source "tegula")
       The rows carry no renderCell: the atlas bends each skeleton on first draw (lib/tilings/tegula.ts).
"""
import math
import sqlite3
import sys
import time
from collections import Counter
from fractions import Fraction
from math import gcd

import numpy as np

from develop_freedraw import write_json

TAU = 2 * math.pi
JX = 0.35        # where along the edge a J bend peaks by default
SEG = 12         # segments a bent edge is flattened into
# Pull of an edge on its own midpoint, against the pull of the two tiles beside it. At 1 the tiles that
# share two edges come out as slivers; 0.1 triples the roundness of the thinnest decile (0.059 -> 0.149
# over the 144 types at k <= 2) and lower gains nothing.
BARY_W = 0.1
LONG = 2.0       # radians: past this a spherical edge is drawn through its tangency point


def parse_tegula(text):
    """'<4.0:2:1 2,1 2,2:3 3,6>' -> (n, [s0,s1,s2], m01, m12), chambers 0..n-1. Delgado-Friedrichs'
    compressed form: each involution lists images only for chambers not yet paired, each m lists one
    value per orbit in first-seen order."""
    _, size, ops, ms = text.strip("<>").split(":")
    n = int(size.split()[0])
    s = []
    for part in ops.split(","):
        img, vals = {}, iter(int(x) - 1 for x in part.split())
        for c in range(n):
            if c not in img:
                d = next(vals)
                img[c], img[d] = d, c
        s.append([img[c] for c in range(n)])
    m = []
    for (i, j), part in zip(((0, 1), (1, 2)), ms.split(",")):
        lab, vals = {}, iter(int(x) for x in part.split())
        for c in range(n):
            if c in lab:
                continue
            v, todo = next(vals), [c]
            while todo:                            # the (i,j)-orbit of c
                d = todo.pop()
                if d not in lab:
                    lab[d] = v
                    todo += [s[i][d], s[j][d]]
        m.append([lab[c] for c in range(n)])
    return n, s, m[0], m[1]


def ds_name(n, s, m01, m12):
    """Tegula's permanent name for a connected symbol, e.g. DS07-3R55-E1RJ-G (Huson, "Delaney-Dress
    Names", 2026-08-18; written from that spec). The row id of a .tdb is emission order and differs
    between databases holding the same tilings; the name is computed from the symbol alone.
    Canonical form: from every chamber as seed, relabel in Gavrog's traversal order (one queue per
    index, lowest non-empty first, back for s0 and s1, front for s2) and keep the smallest protocol
    s0.. s1.. s2.. m01.. m12... The name is that form packed into bits and written in Crockford base 32."""
    best = None
    for seed in range(n):
        order, seen, q = [seed], {seed}, [[s[i][seed]] for i in range(3)]
        while len(order) < n:
            for i in range(3):
                while q[i] and q[i][-1 if i < 2 else 0] in seen:
                    q[i].pop(-1 if i < 2 else 0)
                if q[i]:
                    break
            b = q[i].pop(-1 if i < 2 else 0)
            seen.add(b)
            order.append(b)
            for j in range(3):
                if j != i:
                    q[j].append(s[j][b])
        new = {c: k for k, c in enumerate(order)}
        proto = [new[s[i][c]] for i in range(3) for c in order] + [m[c] for m in (m01, m12) for c in order]
        if best is None or proto < best:
            best = proto
    s, ms = [best[i * n:(i + 1) * n] for i in range(3)], [best[3 * n:4 * n], best[4 * n:]]

    def gamma(v):
        return "0" * (v.bit_length() - 1) + format(v, "b")

    assert n < 63                                          # larger sizes escape to gamma(n); none in Tegula
    bits = format(n, "06b")
    for si in s:                                           # each pairing as a rank among the unpaired
        free = list(range(n))
        while free:
            a = free.pop(0)
            r = 0 if si[a] == a else 1 + free.index(si[a])
            if r:
                free.remove(si[a])
            bits += "0" if r == 1 else "10" if r == 0 else "11" + gamma(r - 1)
    for i, m in enumerate(ms):                             # one m per orbit, by smallest chamber
        seen = set()
        for a in range(n):
            if a not in seen:
                bits += {3: "00", 4: "01", 5: "100", 6: "101"}.get(m[a]) or "11" + gamma(m[a])
                b = a
                while b not in seen or b != a:         # r = s_j s_i; the orbit is the r-cycle and its s_i image
                    seen |= {b, s[i][b]}
                    b = s[i + 1][s[i][b]]
    bits += "0" * (-len(bits) % 5)
    code = "".join("0123456789ABCDEFGHJKMNPQRSTVWXYZ"[int(bits[k:k + 5], 2)] for k in range(0, len(bits), 5))
    return "-".join(["DS%02d" % n] + [code[k:k + 4] for k in range(0, len(code), 4)])


def orbits(s, i, j, n):
    """Orbit id per chamber under <s_i, s_j>, and the number of orbits."""
    oid, k = [-1] * n, 0
    for c in range(n):
        if oid[c] < 0:
            todo = [c]
            while todo:
                d = todo.pop()
                if oid[d] < 0:
                    oid[d] = k
                    todo += [s[i][d], s[j][d]]
            k += 1
    return oid, k


def component(start, step):
    """BFS closure of `start` under step(node) -> 3 neighbours; returns nodes in discovery order."""
    seen, order = {start: 0}, [start]
    for node in order:
        for nb in step(node):
            if nb not in seen:
                seen[nb] = len(order)
                order.append(nb)
    return seen, order


def geometry_of(n, m01, m12):
    """+1 sphere, 0 plane, -1 hyperbolic plane: the sign of the orbifold Euler characteristic."""
    chi = sum(Fraction(1, m01[c]) + Fraction(1, m12[c]) - Fraction(1, 2) for c in range(n))
    return (chi > 0) - (chi < 0)


def circle_pattern(n, s, m01, m12, tol=1e-11):
    """The quotient method: a constant-curvature metric for a symbol, with no cover and no search.

    Koebe, Andreev and Thurston: a map on a surface has a circle about every vertex and one about every
    tile, tangent along the edges and crossing at right angles, in exactly one metric of constant
    curvature. Each chamber is then a right triangle, right angle at the point E where its edge touches
    the circles, legs r_V and r_F. Radii are constant on the symbol's own orbits, so the unknowns are one
    radius per vertex class and per tile class, and the equations say the corners close up: round a
    vertex of rotation order m12 the angles at V sum to 2 pi, round a tile the angles at F do.

    Returns (r_V, r_F, angle at V, angle at F), each per chamber, or None when Newton does not converge:
    the pattern does not exist when two tiles meet along more than one edge.
    The same lines serve the three geometries; only the right-triangle formula changes."""
    g = geometry_of(n, m01, m12)
    vo, nv = orbits(s, 1, 2, n)
    fo, nf = orbits(s, 0, 1, n)
    want = np.zeros(nv + nf)
    for c in range(n):
        want[vo[c]] += math.pi / m12[c]
        want[nv + fo[c]] += math.pi / m01[c]

    def radii(u):                                          # sphere: r in (0, pi), a tile may pass a hemisphere
        return 2 * np.arctan(np.exp(u)) if g > 0 else np.exp(u)

    def corner(leg, opp):                                  # angle at the end of `leg`, facing `opp`
        if g > 0:
            return np.arctan2(np.sin(opp), np.cos(opp) * np.sin(leg))
        if g < 0:
            return np.arctan2(np.tanh(opp), np.sinh(leg))
        return np.arctan2(opp, leg)

    def angles(u):
        r = radii(u)
        a, b = r[vo], r[[nv + f for f in fo]]
        return a, b, corner(a, b), corner(b, a)

    def miss(u):
        _, _, av, af = angles(u)
        got = np.zeros(nv + nf)
        np.add.at(got, vo, av)
        np.add.at(got, [nv + f for f in fo], af)
        return got - want

    # The sphere's equations are not convex, so Newton there is tried from several sizes of circle.
    for r0 in (0.5, 0.2, 1.0, 0.08, 1.4) if g > 0 else (1.0,):
        u = np.full(nv + nf, math.log(math.tan(r0 / 2)) if g > 0 else 0.0)
        for _ in range(200):
            f = miss(u)
            if np.abs(f).max() < tol:
                return angles(u)
            J = np.empty((len(u), len(u)))
            for k in range(len(u)):
                du = np.zeros(len(u))
                du[k] = 1e-6
                J[:, k] = (miss(u + du) - miss(u - du)) / 2e-6
            step = np.linalg.lstsq(J, -f, rcond=1e-9)[0]       # the plane has a free scale: least squares drops it
            t = 1.0
            while t > 1e-4 and not np.abs(miss(u + t * step)).max() < np.abs(f).max():
                t /= 2
            u = u + t * step
            if np.abs(u).max() > 30:
                break
    return None


def chamber_steps(n, s, pattern, g):
    """N[i][c], the isometry that carries chamber c's frame to its s_i neighbour's, in the geometry g.

    A frame puts the chamber's vertex at the base point, its edge along +x and its tile on the +y side;
    points are columns (x, y, w) on the plane w = 1, the unit sphere or the hyperboloid, so one 3x3
    product serves all three. A neighbour is always a mirror image, hence the reflections."""
    rv, rf, av, _ = pattern
    c_, s_ = (math.cos, math.sin) if g > 0 else (math.cosh, math.sinh)

    def tx(d):                                             # slide along the edge
        if g == 0:
            return np.array([[1, 0, d], [0, 1, 0], [0, 0, 1.0]])
        return np.array([[c_(d), 0, s_(d)], [0, 1, 0], [-g * s_(d), 0, c_(d)]])

    def rot(a):
        return np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1.0]])

    flip_y, flip_x = np.diag([1.0, -1, 1]), np.diag([-1.0, 1, 1])
    N = [[tx(rv[c]) @ flip_x @ tx(-rv[s[0][c]]) for c in range(n)],     # across the tile's inradius
         [rot(2 * av[c]) @ flip_y for c in range(n)],                    # across the line to the tile's centre
         [flip_y] * n]                                                   # across the edge
    hyp = [math.hypot(rv[c], rf[c]) if g == 0 else
           (math.acos(c_(rv[c]) * c_(rf[c])) if g > 0 else math.acosh(c_(rv[c]) * c_(rf[c]))) for c in range(n)]
    base = np.array([0, 0, 1.0])
    corners = [(base, tx(rv[c]) @ base, rot(av[c]) @ tx(hyp[c]) @ base) for c in range(n)]   # V, E, F in the frame
    return N, corners


def relation_defect(n, s, m01, m12, N):
    """How far the steps are from generating a tiling: each (s_i s_j)^m_ij must come back to the frame it
    left (Poincare's polygon theorem). Zero up to rounding means the geometry closes round every vertex,
    edge and tile, which is the whole condition in a simply connected space."""
    worst = 0.0
    for i, j, m in ((0, 1, m01), (1, 2, m12), (0, 2, [2] * n)):
        for c0 in range(n):
            G, c = np.eye(3), c0
            for _ in range(m[c0]):
                G = G @ N[i][c]
                c = s[i][c]
                G = G @ N[j][c]
                c = s[j][c]
            worst = max(worst, float(np.abs(G - np.eye(3)).max())) if c == c0 else float("inf")
    return worst


def develop_sphere(n, s, pattern, m01, limit=40000):
    """The whole tiling of the sphere from one symbol: unit vertices and tile rings, or None.

    Breadth-first over the chamber copies, merged by where their three corners land. The count closes at
    n times the order of the symmetry group, and the triangles then cover the sphere exactly once: that
    area, 4 pi, is the certificate, and it is not implied by the equations circle_pattern solved."""
    N, corners = chamber_steps(n, s, pattern, 1)
    key = lambda G, c: tuple(np.round(np.concatenate([G @ p for p in corners[c]]), 6) + 0.0)
    seen, todo = {key(np.eye(3), 0): (0, np.eye(3))}, [(0, np.eye(3))]
    for c, G in todo:
        for i in range(3):
            d, H = s[i][c], G @ N[i][c]
            k = key(H, d)
            if k not in seen:
                if len(seen) >= limit:
                    return None
                seen[k] = (d, H)
                todo.append((d, H))
    rv, rf, av, af = pattern
    area = sum(av[c] + af[c] - math.pi / 2 for c, _ in todo)
    if abs(area - 4 * math.pi) > 1e-6:
        return None
    # An edge is the geodesic through its tangency point E. Between two corners more than LONG apart the
    # renderer's own shortest arc is no longer that curve (and between antipodes it is not defined). A
    # symbol with such an edge, or with a two-cornered tile, is drawn in HALF edges throughout: every E
    # is a ring point, as in realize's `bary`, and the unit that bends is vertex to tangency point.
    vo, nv = orbits(s, 1, 2, n)
    halves = any(rv[c] + rv[s[0][c]] > LONG or m01[c] < 3 for c in range(n))
    ecls, ne = orbits(s, 2, 2, n) if halves else orbits(s, 0, 2, n)
    first = [ecls.index(j) for j in range(ne)]
    kind = ["I" if s[2][r] == r else "J" if halves else "U" if s[0][r] == r else "S" if s[0][r] == s[2][r] else "J"
            for r in first]

    def tag(c, back):                                      # realize's side tag: class, reversed, far side
        r = first[ecls[c]]
        where = [r, r if halves else s[0][r], s[2][r], s[0][s[2][r]]].index(c)
        return ecls[c] * 4 + (back if halves else where in (1, 3)) * 2 + (where in (2, 3))

    pts, cls, tiles = {}, [], {}

    def point(P, k):
        key = tuple(np.round(P, 6) + 0.0)
        if key not in pts:
            pts[key] = len(pts)
            cls.append(k)
        return pts[key]

    for c, G in todo:
        V, E, F = (G @ p for p in corners[c])
        tiles.setdefault(tuple(np.round(F, 6) + 0.0), (F, c, []))[2].append((c, V, E))
    faces = []
    for F, c0, copies in tiles.values():                   # counter-clockwise seen from outside
        a = np.cross(F, [0.3, 0.5, 0.81])
        a /= np.linalg.norm(a)
        b = np.cross(F, a)
        ang = lambda P: math.atan2(P @ b, P @ a)
        ring = []                                          # (angle, point index, side tag leaving it)
        for c, V, E in copies:
            ahead = (ang(E) - ang(V)) % TAU < math.pi      # c's edge is the one after its vertex
            if ahead:
                ring.append((ang(V), point(V, vo[c]), tag(c, False)))
            elif halves:                                   # the half edge arriving at this vertex
                ring.append((ang(E), point(E, nv), tag(c, True)))
        ring.sort()
        faces.append((c0, [i for _, i, _ in ring], [t for _, _, t in ring], [round(float(x), 5) + 0.0 for x in F]))
    return {"vertices": [list(k) for k in pts], "vclass": cls, "faces": faces, "order": len(todo) // n,
            "kinds": "".join(kind), "halves": halves}


def sphere_record(rid, name, n, s, m01, m12, sph, pattern):
    """A developed sphere as the atlas's SphPolyPattern (lib/tilings/sph-poly.ts), tiles coloured by the
    type's own tile classes, as the Euclidean shelf colours them."""
    fo, nf = orbits(s, 0, 1, n)
    vo, nv = orbits(s, 1, 2, n)
    faces = [f[1] for f in sph["faces"]]
    size = [len(r) for r in faces]
    sizes = sorted(set(size))
    edges = sorted({tuple(sorted((r[i], r[(i + 1) % len(r)]))) for r in faces for i in range(len(r))})
    idx = component((0, 1), lambda u: [(s[i][u[0]], -u[1]) for i in range(3)])[0]
    figs = Counter()
    for c0 in {vo.index(j) for j in range(nv)}:            # the tiles round one vertex of each class
        fig, c = [], c0
        for _ in range(m12[c0]):
            fig.append(m01[c])
            c = s[2][s[1][c]]
        k = len(fig)
        figs[".".join(map(str, min(fig[i:] + fig[:i] for i in range(k))))] += sph["vclass"].count(vo[c0])
    return {
        "id": name, "k": nv, "certK": nv, "base": "tegula", "family": ".".join(map(str, sorted(set(m01)))),
        "config": " + ".join(sorted(figs)), "edge": 0, "chiral": len(idx) == n,
        "vertices": [[round(x, 5) + 0.0 for x in v] for v in sph["vertices"]], "faces": faces, "faceSize": size,
        "fillGroup": [fo[f[0]] for f in sph["faces"]], "edges": [list(e) for e in edges],
        # For the cell editor (lib/tilings/tegula.ts bendSphere): each ring side's edge class and how it
        # sits on the class's curve, the kind of each class, the tile centres the bent tiles are fanned
        # from, and one handle per class. Shipped unbent: the polyhedron is the default picture.
        # `halves`: the ring points include the edges' tangency points, so the classes are half edges.
        "bend": {"sides": [f[2] for f in sph["faces"]], "kinds": sph["kinds"], "centers": [f[3] for f in sph["faces"]],
                 **({"halves": True} if sph["halves"] else {}),
                 "shape": [[{"J": JX, "S": 0.25}.get(k, 0.5), 0] for k in sph["kinds"]]},
        "vorbit": sph["vclass"], "symOrbit": sph["vclass"],
        "stats": {"verts": len(sph["vertices"]), "edges": len(edges), "faces": len(faces),
                  "symmetryOrder": sph["order"], "symmetryOrbits": nv, "sizes": sizes,
                  "sizeCensus": [size.count(z) for z in sizes], "figures": sorted(figs.items()),
                  "greatCircleFaces": sum(1 for f in sph["faces"] if abs(pattern[1][f[0]] - math.pi / 2) < 1e-6),
                  "certOrbits": nv},
    }


def realize(n, s, m01, m12, deform=True, mark=False, bary=False, pattern=None):
    # 1. orientation cover
    idx, nodes = component((0, 1), lambda u: [(s[i][u[0]], -u[1]) for i in range(3)])
    N1 = len(nodes)
    S = [[idx[(s[i][c], -e)] for (c, e) in nodes] for i in range(3)]
    base = [c for c, _ in nodes]
    eps = [e for _, e in nodes]

    # 2. angle structure: x = corner angle at the tiling vertex, pi/2 at the edge midpoint, the rest
    #    at the face centre. Round a vertex of rotation order v the x's sum to 2pi/v; same for faces.
    vo, nv = orbits(S, 1, 2, N1)
    fo, nf = orbits(S, 0, 1, N1)
    A = np.zeros((nv + nf, N1))
    b = np.zeros(nv + nf)
    vsz, fsz = Counter(vo), Counter(fo)
    order = 1
    for c in range(N1):
        A[vo[c], c] = A[nv + fo[c], c] = 1
    for c in range(N1):
        rv = m12[base[c]] * 2 // vsz[vo[c]]                # rotation order at this vertex
        rf = m01[base[c]] * 2 // fsz[fo[c]]
        b[vo[c]] = TAU / rv
        b[nv + fo[c]] = fsz[fo[c]] * math.pi / 2 - TAU / rf
        order = order * rv // gcd(order, rv)
        order = order * rf // gcd(order, rf)
    eo, _ = orbits(S, 0, 2, N1)
    if min(Counter(eo).values()) == 2:
        order = order * 2 // gcd(order, 2)                 # a 2-fold centre on an edge midpoint
    x = np.linalg.lstsq(A, b, rcond=None)[0]
    if np.abs(A @ x - b).max() > 1e-7:
        return None, "no angle structure (not Euclidean?)"
    aF = math.pi / 2 - x

    def turn(i, c):                                        # direction change crossing side i of c
        if i == 0:
            return math.pi
        if i == 2:
            return 0.0
        return -eps[c] * (math.pi + aF[c] + aF[S[1][c]])

    dirn, todo = {0: 0.0}, [0]
    for c in todo:
        for i in range(3):
            d = S[i][c]
            if d not in dirn:
                dirn[d] = dirn[c] + turn(i, c)
                todo.append(d)
    unit = TAU / order
    volt = [[int(round((dirn[c] + turn(i, c) - dirn[S[i][c]]) / unit)) % order for c in range(N1)] for i in range(3)]

    idx, nodes = component((0, 0), lambda u: [(S[i][u[0]], (u[1] + volt[i][u[0]]) % order) for i in range(3)])
    N2 = len(nodes)
    T = [[idx[(S[i][c], (t + volt[i][c]) % order)] for (c, t) in nodes] for i in range(3)]
    up = [c for c, _ in nodes]                             # torus chamber -> oriented chamber
    sign = [eps[c] for c in up]

    V, nV = orbits(T, 1, 2, N2)
    E, nE = orbits(T, 0, 2, N2)
    F, nF = orbits(T, 0, 1, N2)
    if nV - nE + nF != 0 or any(k != 4 for k in Counter(E).values()):
        return None, "cover is not a torus (chi=%d)" % (nV - nE + nF)

    # The type's own edge classes: a weight and a bend per class. bend[b] = (class, reversed, other side)
    # places base chamber b on its class's curve, drawn from the representative towards its own tile.
    # bary: every edge is drawn through its midpoint (see step 3), so the unit that bends is the HALF
    # edge, vertex to midpoint. Nothing but a mirror along it can fix a half edge: straight or free.
    ecls, ne = orbits(s, 2, 2, n) if bary else orbits(s, 0, 2, n)
    first = [ecls.index(j) for j in range(ne)]
    spread = [(2 * j / (ne - 1) - 1) if ne > 1 else 0.0 for j in range(ne)]
    weight = [math.exp(0.5 * q) if deform else 1.0 for q in spread]
    kind = ["I" if s[2][r] == r else "J" if bary else "U" if s[0][r] == r else "S" if s[0][r] == s[2][r] else "J"
            for r in first]
    bend = []
    for b_ in range(n):
        r = first[ecls[b_]]
        # FIRST match wins. When two of the four coincide the curve has the symmetry that makes the
        # earlier answer right, and applying both flips to an S edge would mirror it.
        where = [r, r if bary else s[0][r], s[2][r], s[0][s[2][r]]].index(b_)
        bend.append((ecls[b_], where in (1, 3), where in (2, 3)))

    def offset(b_, t_, back=None):                         # towards b_'s own tile, in edge lengths
        j, rev, far = bend[b_]
        rev = rev if back is None else back
        if not deform or kind[j] == "I":
            return 0.0
        u = 1 - t_ if rev else t_
        amp = (0.10 + 0.03 * spread[j]) * gain[0]
        # The SAME three profiles lib/tilings/tegula.ts draws, so what is checked here is what ships.
        g = {"U": math.sin(math.pi * u), "S": math.sin(TAU * u),
             "J": math.sin(math.pi * u ** (math.log(0.5) / math.log(JX)))}[kind[j]]
        return -amp * g if far else amp * g

    # 3. harmonic 1-forms. d(c) = dir[c] * vec[E[c]] is the edge vector leaving c's vertex.
    dr = [0] * N2
    for c in range(N2):
        if dr[c] == 0:
            dr[c] = dr[T[2][c]] = 1
            dr[T[0][c]] = dr[T[0][T[2][c]]] = -1
    if pattern:
        # The quotient method's geometry (circle_pattern), laid out on the torus. Each chamber is a right
        # triangle with legs r_V and r_F, so the half edge V -> E has length r_V and turns by the two
        # equal corner angles when the walk crosses to the next edge round the vertex.
        rv, _, alpha, _ = pattern
        ang, todo = {0: 0.0}, [0]
        for c in todo:
            b_ = base[up[c]]
            for d, turn in ((T[2][c], 0.0), (T[0][c], math.pi), (T[1][c], sign[c] * 2 * alpha[b_])):
                if d not in ang:
                    ang[d] = ang[c] + turn
                    todo.append(d)
                elif abs((ang[c] + turn - ang[d] + math.pi) % TAU - math.pi) > 1e-6:
                    return None, "circle pattern does not close on the torus"
        half = np.array([[rv[base[up[c]]] * math.cos(ang[c]), rv[base[up[c]]] * math.sin(ang[c])] for c in range(N2)])
    else:
        M = np.zeros((nV + nF, nE))
        for c in range(N2):
            M[V[c], E[c]] += dr[c] * weight[ecls[base[up[c]]]]
            if sign[c] > 0:
                M[nV + F[c], E[c]] += dr[c]
        if bary:
            # The same equilibrium on the BARYCENTRIC subdivision: vertices, edge midpoints and face centres,
            # one triangle per chamber. Two tiles that meet along more than one edge share vertices, so with
            # straight edges one of them has no area however the vertices sit; their midpoints are distinct
            # points of a simplicial triangulation, which always has an equilibrium embedding. Unknowns are
            # the three sides of each chamber (V->E shared across s2, E->F across s0, V->F across s1).
            col = [orbits(T, i, i, N2) for i in (2, 0, 1)]
            at = [0, col[0][1], col[0][1] + col[1][1]]
            M = np.zeros((N2 + nV + nE + nF, at[2] + col[2][1]))
            for c in range(N2):
                ve, ef, vf = (at[k] + col[k][0][c] for k in range(3))
                w = BARY_W * weight[ecls[base[up[c]]]]
                M[c, [ve, ef, vf]] = 1, 1, -1                  # the chamber closes
                M[N2 + V[c], ve] += w                          # and every point balances its neighbours
                M[N2 + V[c], vf] += 1
                M[N2 + nV + E[c], ve] -= w
                M[N2 + nV + E[c], ef] += 1
                M[N2 + nV + nE + F[c], ef] -= 1
                M[N2 + nV + nE + F[c], vf] -= 1
        _, sv, vt = np.linalg.svd(M)
        sv = np.concatenate([sv, np.zeros(M.shape[1] - len(sv))])
        if nE < 2 or sv[-2] > 1e-8 or (M.shape[1] > 2 and sv[-3] < 1e-8):
            return None, "harmonic space is not 2-dimensional"
        vec = vt[-2:].T                                        # one row per unknown

        # 4. whiten so every symmetry is an isometry, unit mean edge, counter-clockwise faces
        ew = np.zeros(nE)
        for c in range(N2):
            ew[E[c]] = weight[ecls[base[up[c]]]]
        w, U = np.linalg.eigh(vec.T @ vec if bary else vec.T @ (vec * ew[:, None]))
        vec = vec @ U @ np.diag(w ** -0.5) @ U.T
        # half[c]: from c's vertex to the midpoint of c's edge. Straight edges are the case where the two
        # halves of an edge are opposite, and everything below reads edges through `half` only.
        half = np.array([vec[col[0][0][c]] if bary else 0.5 * dr[c] * vec[E[c]] for c in range(N2)])
    half /= np.linalg.norm(half - half[T[0]], axis=1).mean()

    def faces():
        """Each tile as (flattened ring, indices of its true corners); marks collect in `marks`."""
        out, done = [], set()
        marks.clear()
        for c0 in range(N2):
            if sign[c0] < 0 or F[c0] in done:
                continue
            done.add(F[c0])
            poly, corners, sides, c, p = [], [], [], c0, pos[V[c0]].copy()
            while True:
                c2 = T[0][c]
                d = half[c] - half[c2]
                # bary: out along c's half edge, then back along the far end's, the midpoint a corner
                q = p.copy()
                for ch, h, back in ((c, half[c], False), (c2, -half[c2], True)) if bary else ((c, d, None),):
                    b_ = base[up[ch]]
                    corners.append(len(poly))
                    poly.append(q.copy())
                    sides.append(bend[b_][0] * 4 + (bend[b_][1] if back is None else back) * 2 + bend[b_][2])
                    if deform and kind[bend[b_][0]] != "I":
                        left = np.array([-h[1], h[0]])     # |left| = |h|, so offsets are in edge lengths
                        poly += [q + (i / SEG) * h + offset(b_, i / SEG, back) * left for i in range(1, SEG)]
                    q = q + h
                if mark:
                    # c sits at this end of the edge and T[0][c] at the far end, same tile, so the
                    # inward normal is shared. Base chamber 0 is the marked class.
                    for ch, a_, d_ in ((c, p, d), (T[0][c], p + d, -d)):
                        if base[up[ch]] == 0:
                            inw = np.array([-d[1], d[0]])
                            marks.append(np.array([a_ + x * d_ + y * inw for x, y in ((0.10, 0.04), (0.26, 0.04), (0.14, 0.11))]))
                p += d
                c = T[1][T[0][c]]
                if c == c0:
                    break
            out.append((np.array(poly), corners, sides))
        return out

    marks, gain = [], [1.0]
    pos, todo, seen, gens = {V[0]: np.zeros(2)}, [0], {0}, []
    for c in todo:
        d, far = T[0][c], pos[V[c]] + half[c] - half[T[0][c]]
        if V[d] not in pos:
            pos[V[d]] = far
        else:
            gens.append(far - pos[V[d]])                   # a closed walk: zero or a lattice vector
        for d in (T[0][c], T[1][c], T[2][c]):
            if d not in seen:
                seen.add(d)
                todo.append(d)
    basis = lattice_basis(gens)
    if basis is None:
        return None, "drawing collapsed (no rank-2 lattice)"
    fs = faces()
    area = lambda p: 0.5 * float(np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1]))
    if sum(area(p) for p, _, _ in fs) < 0:                    # mirror to counter-clockwise
        half[:, 1] *= -1
        for k in pos:
            pos[k] = pos[k] * (1, -1)
        basis = [v * (1, -1) for v in basis]
        fs = faces()
    # Collapse is judged on the STRAIGHT tiles: a bend gives a degenerate tile a sliver of area and
    # would hide it. The bends are then halved until no tile loses more than half its straight area,
    # which is what a curve cutting across a thin tile looks like.
    areas = [area(p[cs]) for p, cs, _ in fs]
    while deform and gain[0] and (any(area(p) < 0.5 * a_ for (p, _, _), a_ in zip(fs, areas) if a_ > 0)
                                  or crossing([p for p, _, _ in fs], basis)):
        gain[0] = gain[0] / 2 if gain[0] > 0.06 else 0.0   # five halvings, then give up and stay straight
        fs = faces()
    cell = abs(basis[0][0] * basis[1][1] - basis[0][1] * basis[1][0])
    elen = np.linalg.norm(half - half[T[0]], axis=1)
    ok = min(areas) > 1e-3 * cell / len(fs) and abs(sum(areas) - cell) < 1e-6 * cell and elen.min() > 1e-3
    # Turn T1 onto the x axis, and colour each tile by its orbit in the BASE symbol, so the picture
    # shows the transitivity classes. The keys are the atlas's own cell format (b = basis, p = polygons).
    c, sn = basis[0] / np.linalg.norm(basis[0])
    R = np.array([[c, sn], [-sn, c]])
    rnd = lambda v: [round(float(q), 5) + 0.0 for q in R @ v]
    base_face, _ = orbits(s, 0, 1, n)
    reps = _face_reps(F, sign, up, N2)
    return {
        "b": [rnd(basis[0]), rnd(basis[1])],
        # Bent and at full precision, for the checks here only: on a long thin cell, coordinates
        # rounded for shipping tilt the test isometry enough to miss a real symmetry.
        "p": [{"vertices": [list(R @ q) for q in p]} for p, _, _ in fs],
        # What ships: the straight tiles, each side tagged with its edge class and how it sits on the
        # class's curve (class * 4 + reversed * 2 + far side), and one default handle per class.
        "polys": [{"v": [rnd(q) for q in p[cs]], "hue": round(base_face[base[r]] * 137.5 % 360), "sides": sd}
                  for (p, cs, sd), r in zip(fs, reps)],
        "kinds": "".join(kind),
        "shape": [[{"J": JX, "S": 0.25}.get(kind[j], 0.5),
                   round((0.10 + 0.03 * spread[j]) * gain[0], 4) if kind[j] != "I" else 0] for j in range(ne)],
        "marks": [{"vertices": [list(R @ q) for q in m_]} for m_ in marks],
        "ok": bool(ok),
        "group": N2 // n,                                  # order of the type's point group
    }, None


def _face_reps(F, sign, up, N2):
    out, done = [], set()
    for c in range(N2):
        if sign[c] > 0 and F[c] not in done:
            done.add(F[c])
            out.append(up[c])
    return out


def crossing(polys, basis):
    """True when two boundary segments of the drawing properly cross, in the cell or across its border."""
    B = np.array(basis).T
    segs = np.concatenate([np.stack([p, np.roll(p, -1, axis=0)], axis=1) for p in polys])
    segs = segs - (np.floor(segs.mean(axis=1) @ np.linalg.inv(B).T) @ B.T)[:, None, :]   # midpoints into the cell
    far = np.concatenate([segs + B @ np.array([i, j]) for i in (-1, 0, 1) for j in (-1, 0, 1)])
    cross = lambda u, v: u[..., 0] * v[..., 1] - u[..., 1] * v[..., 0]
    p1, p2 = segs[:, None, 0], segs[:, None, 1]
    q1, q2 = far[None, :, 0], far[None, :, 1]
    a = cross(p2 - p1, q1 - p1) * cross(p2 - p1, q2 - p1)
    b = cross(q2 - q1, p1 - q1) * cross(q2 - q1, p2 - q1)
    return bool(np.any((a < -1e-10) & (b < -1e-10)))


def symmetry_order(cell, Q=4096):
    """How many isometries, counted modulo the cell's translations, map the drawing onto itself.

    Every boundary point the cell carries (vertices, curve samples, and the midpoint of every segment so
    that straight edges count too) is hashed modulo the lattice. A symmetry must send one fixed segment
    onto some segment of equal length, in one of four ways; each candidate is kept if it sends every
    point onto a point. Equal to the type's point-group order exactly when the picture has no symmetry
    the type lacks, and no translation finer than the type's lattice."""
    B = np.array(cell["b"]).T                              # rounded to 1e-5: fine for a lattice
    Binv = np.linalg.inv(B)
    segs = []
    for p in cell["p"] + cell["marks"]:
        v = np.array(p["vertices"])
        segs.append(np.stack([v, np.roll(v, -1, axis=0)], axis=1))
    segs = np.concatenate(segs)                            # S x 2 x 2
    pts = np.concatenate([segs[:, 0], segs.mean(axis=1)])

    def keys(x):
        f = (x @ Binv.T) % 1.0
        return np.round(f * Q).astype(np.int64) % Q

    k = keys(pts)
    have = set()
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            have.update(map(tuple, (k + (dx, dy)) % Q))
    length = np.linalg.norm(segs[:, 1] - segs[:, 0], axis=1)
    ref = int(np.argmax(length))                           # the longest: least angular error from rounding
    a, b_ = segs[ref]
    u = (b_ - a) / length[ref]
    found = []
    for i in np.nonzero(np.abs(length - length[ref]) < 5e-4)[0]:
        for a2, b2 in (segs[i], segs[i][::-1]):
            w = (b2 - a2) / length[i]
            for flip in (1, -1):                           # rotation taking u to w, or the reflection
                R = np.array([[w[0] * u[0] + flip * w[1] * u[1], w[0] * u[1] - flip * w[1] * u[0]],
                              [w[1] * u[0] - flip * w[0] * u[1], w[1] * u[1] + flip * w[0] * u[0]]])
                img = (pts - a) @ R.T + a2
                if all(tuple(q) in have for q in keys(img[:: max(1, len(img) // 40)])) and \
                        all(tuple(q) in have for q in keys(img)):
                    shift = a2 - a @ R.T
                    if not any(np.abs(R - R0).max() < 1e-3 and
                               np.abs(((shift - s0) @ Binv.T + 0.5) % 1.0 - 0.5).max() < 1e-3 for R0, s0 in found):
                        found.append((R, shift))
    return len(found)


def lattice_basis(gens, tol=1e-6):
    """Reduced basis of the rank-2 lattice the vectors generate. Each insertion either lands on the
    lattice or shrinks its determinant by an integer factor, so this is Euclid's algorithm in the plane."""
    B = []
    pending = [g for g in gens if np.linalg.norm(g) > tol]
    while pending:
        g = pending.pop()
        if len(B) == 2:
            co = np.linalg.solve(np.array(B).T, g)
            g = g - np.array(B).T @ np.round(co)
        elif len(B) == 1:
            g = g - round(float(g @ B[0] / (B[0] @ B[0]))) * B[0]
        if np.linalg.norm(g) <= tol:
            continue
        if len(B) < 2 and (not B or abs(B[0][0] * g[1] - B[0][1] * g[0]) > tol):
            B.append(g)
            continue
        pending += B                                       # g is a new, smaller lattice vector
        B = [g]
    if len(B) < 2:
        return None
    a, c = B
    while True:                                            # Lagrange-Gauss
        if a @ a > c @ c:
            a, c = c, a
        shorter = c - round(float(a @ c / (a @ a))) * a
        if shorter @ shorter > c @ c - tol:                # a tie at exactly half would flip for ever
            break
        c = shorter
    if a[0] * c[1] - a[1] * c[0] < 0:
        c = -c
    return [a, c]


def main(db, where, out, logpath=None):
    con = sqlite3.connect(db)
    rows = con.execute(
        "select id,symbol,complexity,orbifold,tiles,edges,vertices,normal,tile_deg "
        "from tilings where %s order by vertices,id" % where).fetchall()
    log = open(logpath, "w") if logpath else sys.stderr

    def say(x):
        log.write(x + "\n")
        log.flush()

    say("develop_dsym: %d Euclidean symbols where %s, %s" % (len(rows), where, time.strftime("%Y-%m-%d %H:%M")))
    res, fail, bad, wrong, marked, through, globes = [], Counter(), Counter(), [], 0, 0, 0
    t0 = time.time()
    for i, (rid, sym, cx, orb, nt, ne, nv, normal, tdeg) in enumerate(rows, 1):
        name = ds_name(*parse_tegula(sym))
        sy = parse_tegula(sym)
        if geometry_of(sy[0], sy[2], sy[3]) > 0:
            pat = circle_pattern(*sy)
            sph = pat is not None and min(pat[2].min(), pat[3].min()) > 0 and develop_sphere(sy[0], sy[1], pat, sy[2])
            if sph and len(sph["vertices"]) + len(sph["faces"]) - sum(len(f[1]) for f in sph["faces"]) // 2 != 2:
                sph = None                                 # a second certificate: the solid is a sphere
            if not sph:
                fail["no circle pattern" if pat is None else "does not unfold to the sphere"] += 1
                say("  FAIL id=%d n=%d %s normal=%s" % (rid, cx, orb, normal))
            else:
                rec = sphere_record(rid, "tegula-" + name, *sy, sph, pat)
                globes += 1
                res.append({
                    "id": rec["id"], "source": "tegula", "k": nv, "family": rec["family"], "geometry": "spherical",
                    "sphPoly": rec, "discoverer": "Zeller, Delgado-Friedrichs and Huson (Tegula, 2021)",
                    "note":
                        "Topological type %s in Tegula's naming, row %d of its spherical-1-24 database. "
                        "Delaney-Dress symbol %s, complexity %d, symmetry group %s of order %d; %d tile "
                        "class%s, %d edge class%s. A type fixes which tiles meet and how the symmetry acts, "
                        "never the shape: this drawing is the one in which every vertex and every tile has a "
                        "circle, tangent along the edges and crossing at right angles, with tiles coloured by "
                        "symmetry class." % (name, rid, sym, cx, orb, sph["order"], nt, "" if nt == 1 else "es",
                                             ne, "" if ne == 1 else "es"),
                })
            if i % 200 == 0 or i == len(rows):
                el = time.time() - t0
                say("  progress %d/%d (%.0f%%)  elapsed %.0fs  ETA %.0fs" % (i, len(rows), 100 * i / len(rows), el, el * (len(rows) - i) / i))
            continue
        cell, why = realize(*parse_tegula(sym))
        # Straight edges cannot draw a type in which two tiles meet along more than one edge. Those go
        # through their edge midpoints instead, and only those: the kink is a cost the others need not pay.
        kinked = cell is not None and not cell["ok"]
        if kinked:
            again, _ = realize(*parse_tegula(sym), bary=True)
            kinked = again is not None and again["ok"]
            cell = again if kinked else cell
            through += kinked
        if cell is None:
            fail[why] += 1
            say("  FAIL id=%d n=%d %s: %s" % (rid, cx, orb, why))
        else:
            if not cell["ok"]:
                bad[(nv, normal)] += 1
            else:
                got = symmetry_order(cell)
                if got > cell["group"]:                    # nothing left to bend: mark it
                    cell, _ = realize(*parse_tegula(sym), mark=True, bary=kinked)
                    got = symmetry_order(cell)
                    marked += 1
                if got != cell["group"]:
                    wrong.append(rid)
                    say("  SYMMETRY id=%d n=%d %s: picture has %d symmetries per cell, type has %d" % (rid, cx, orb, got, cell["group"]))
            sides = sorted(set(int(x) for x in tdeg.split()))
            res.append({
                # the name leads with the zero-padded size: the shelves sort ids as text
                "id": "tegula-" + name, "source": "tegula", "k": nv, "family": ".".join(map(str, sides)),
                "tegula": {"basis": cell["b"], "polys": cell["polys"], "kinds": cell["kinds"], "shape": cell["shape"],
                           **({"marks": [[[round(float(x), 5) for x in q] for q in m_["vertices"]] for m_ in cell["marks"]]}
                              if cell["marks"] else {})},
                "discoverer": "Zeller, Delgado-Friedrichs and Huson (Tegula, 2021)",
                "note":
                    "Topological type %s in Tegula's naming, row %d of its euclidean-1-24 database. "
                    "Delaney-Dress symbol %s, complexity %d, "
                    "symmetry group %s; %d tile class%s (sides %s), %d edge class%s. A type fixes which tiles meet "
                    "and how the symmetry acts, never the shape: this is its equilibrium drawing, every vertex at "
                    "the centroid of its neighbours, with tiles coloured by symmetry class."
                    % (name, rid, sym, cx, orb, nt, "" if nt == 1 else "es", ", ".join(map(str, sides)), ne, "" if ne == 1 else "es")
                    + (" Every edge of this type lies on a mirror, so the tiles alone would show more symmetry "
                       "than the type has; the small dark triangles are marks that remove the surplus."
                       if cell["marks"] else "")
                    + (" Two tiles of this type meet along more than one edge, so no drawing with straight edges "
                       "exists: every edge is drawn through its midpoint, and the midpoints are corners here."
                       if kinked else "")
                    + ("" if cell["ok"] else " COLLAPSED DRAWING: in equilibrium at least one tile of this type has no "
                       "area, so the picture shows fewer tiles than the type has. The type is not pseudo-convex "
                       "(two of its tiles meet in more than one piece) and needs a different drawing."),
            })
        if i % 500 == 0 or i == len(rows):
            el = time.time() - t0
            say("  progress %d/%d (%.0f%%)  elapsed %.0fs  ETA %.0fs" % (i, len(rows), 100 * i / len(rows), el, el * (len(rows) - i) / i))
    say("drawn %d of %d, %d of them through edge midpoints; collapsed by (k, pseudo-convex) %s; failed %d %s"
        % (len(res), len(rows), through, dict(sorted(bad.items())), sum(fail.values()), dict(fail)))
    if globes:
        say("%d unfolded to the whole sphere, each covered once (area 4 pi) with Euler characteristic 2" % globes)
    flat = len(res) - globes - sum(bad.values())
    if flat:
        say("symmetry check on the %d clean plane drawings (%d of them marked): %d have exactly their type's symmetry, %d do not %s"
            % (flat, marked, flat - len(wrong), len(wrong), wrong[:40]))
    write_json(out, res, separators=(",", ":"))


if __name__ == "__main__":
    main(*sys.argv[1:5])
