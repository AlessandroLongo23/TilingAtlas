#!/usr/bin/env python3
"""Homogeneous edge-to-edge tilings by regular polygons, enumerated as Delaney-Dress symbols, with no bound on k.

A tiling is homogeneous for a kind of cell when any two cells that look alike are equivalent under its symmetry
group: one orbit per local figure. Three kinds are searched:

  vertex   figure = the vertex star. Krötenheerdt's tilings (k vertex orbits, k distinct stars): 135.
  edge     figure = the FULL edge figure, the stars at both ends read from the edge (Chavey's thesis; Galebach
           classified them: 203, probabilitysports.com/edgeproof.html).
  face-stars  figure = the FULL face figure, the face with every face sharing a vertex with it, i.e. the star at
           each corner (Galebach's "face-figure-homogeneous" tilings, proposed on Discord 2026-11-07; 669 figures
           from the 15 stars). Grown a vertex star at a time (the vertex kind's catalogue, but a star may recur),
           to at most --kmax vertex orbits. A face is read as its corners arrive and must stay a run of a valid
           figure that no closed face orbit owns yet; when its orbit closes, it claims its figure. Equal figures
           are never merged: every stabilizer is tried, so the symbol under the full group is reached, and in it
           two face orbits with one figure are a failure. Complete for k <= kmax, and for every k when the run
           reports that the cap cut no branch. FINISHES with no bound: 13,144 tilings, k up to 54 (peak 609 at
           k = 22), 134 million nodes, 28 minutes on 8 processes (--kmax 1000, cap never reached).
  face-simple  figure = the SIMPLE face figure, the face with the faces across its edges only (the cyclic word of
           their sizes). The face-stars search with one change: a face orbit claims its simple figure, so two face
           orbits whose full figures differ but whose simple figures agree are a failure. Equal full figures give
           equal simple ones, so these tilings are a subset of face-stars'; the run checks that.

METHOD. A periodic tiling is its D-symbol: the flags modulo the symmetry group, with s0 (other end of the edge),
s1 (other edge of the face at the vertex), s2 (other face across the edge), m01 = face size, m12 = degree.
Homogeneity says each figure F that occurs owns ONE orbit of cells, so the chambers are F's flags modulo the
cell's stabilizer H (a subgroup of F's own symmetries), and the two involutions that keep the cell (s0, s2 for an
edge; s1, s2 for a vertex) are read off F. Only the third is unknown. It must match the geometry, which fixes
the neighbouring figure F' up to the star at the new end; and since F' may occur only once, an F' already in the
symbol is FORCED onto its own chambers. That is what makes the search finite (at most 4 chambers per edge figure).
Pruning: the D-symbol axiom (r_ij divides m_ij on every orbit the unknown involution closes, and an open orbit
already longer than m_ij dies), and a forward check (every open chamber still has a candidate). Chambers are
filled nearest-to-closing first (the open chamber on the face or vertex with the fewest links still missing):
the divisibility test only bites when an orbit closes. Measured: lowest-numbered first leaves dozens of chambers
open and was 80 to 100,000 times slower on the heavy starts; fewest-candidates first was worse still.

COMPLETE: every homogeneous tiling has such a symbol (under its full group) and the search tries every value of
the unknown involution, every H, and every figure; figures are tried from a lowest one up, so each labelled
symbol is built once. SOUND: a finished symbol whose vertex stars all sum to 360 degrees has curvature 0 term by
term, and gluing regular polygons along it develops into a Euclidean tiling whose combinatorial symmetries are
isometries. The minimal image gives the tiling under its full group, its canonical form dedupes, and edge orbits
cannot merge there because they carry different figures.

The vertex stars themselves are derived, not listed: every cyclic word of regular polygons whose angles sum to
360 degrees (21), then the ones that cannot occur are removed by two local tests to a fixpoint: an edge of the
star with no valid full edge figure, or a face that cannot be ringed by corners of the surviving stars (this is
how 4.5.20 and 5.5.10 go: the pentagon's neighbours would have to alternate). A full edge figure is valid when
its polygons do not overlap and every vertex they share away from the edge (the far corner of a triangle) can be
completed to a surviving star.

The depth-first loop is homogeneous_dfs.cpp (built on first use); this file builds the catalogue, runs one
search per start figure in a process pool, and reads every finished symbol.

usage: homogeneous.py vertex|edge|face-stars|face-simple [--kmax K] [--jobs N] [--log FILE] [--out FILE]
                       [--figures FILE] [--catalogue FILE] [--split LABEL:H,... --parts N --depth D]
  --kmax: the face kinds only, and required there. --split: those start units (start star, stabilizer index) run
  as N slices of their tree cut at depth D, for more processes on the heavy ones.
  vertex: 135 tilings, 24,471 nodes. edge: 203 tilings, 126,767 nodes. About a second each; results and logs in
  experiments/results/homogeneous-2026-11-08/. face-stars, the full run (log and result in
  experiments/results/homogeneous-2026-11-09/face-stars-all.*):
    homogeneous.py face-stars --kmax 1000 --jobs 8 --split "3^6:0,3^6:1,3^6:2,3^4.6:0" --parts 16 --depth 10
"""
import gzip
import json
import math
import os
import pickle
import subprocess
import sys
import time
from fractions import Fraction
from itertools import permutations
from multiprocessing import Pool

from dsymbol_from_darts import minimal_image, DSymbol, canonical_form, validate, curvature

# ── vertex stars ──


def interior(p):
    return math.pi * (p - 2) / p


def cyclic_canon(word):
    """Smallest rotation of the word or of its reverse."""
    d = len(word)
    return min(min(tuple(w[i:] + w[:i]) for i in range(d)) for w in (list(word), list(word)[::-1]))


def all_stars():
    """Every cyclic word of regular polygons (sizes >= 3) whose interior angles sum to 360 degrees."""
    sols = set()

    def rec(prefix, rem):
        if rem == 0 and len(prefix) >= 3:
            sols.add(tuple(prefix))
            return
        if len(prefix) == 6 or rem <= 0:
            return
        for p in range(prefix[-1] if prefix else 3, 43):   # 42 is the largest: 1/3 + 1/7 + 1/42 = 1/2
            rec(prefix + [p], rem - Fraction(p - 2, p))

    rec([], Fraction(2))
    return sorted({cyclic_canon(perm) for s in sols for perm in permutations(s)})


def rooted(types):
    """Every star read counter-clockwise from one of its edges: rotations and reflections of each word."""
    out = set()
    for t in types:
        for w in (list(t), list(t)[::-1]):
            out |= {tuple(w[i:] + w[:i]) for i in range(len(w))}
    return out


# ── full edge figures: (a, b) = the star at A read ccw from AB, the star at B read ccw from BA ──
# a[0] = b[-1] is the face above AB, a[-1] = b[0] the face below. The edge's four symmetries act on placements and
# on the flags f = 2*end + side (end 0 = A, side 0 = above) as XOR masks: 1 = mirror in the edge line (side flips),
# 2 = mirror in the perpendicular bisector (end flips), 3 = half-turn. Galebach's tags: D- = {0,1}, D| = {0,2},
# C2 = {0,3}, D+ = all four, C1 = {0}.


def image(P, g):
    a, b = P
    return [(a, b), (a[::-1], b[::-1]), (b[::-1], a[::-1]), (b, a)][g]


def polygon(x, y, t, p):
    pts = []
    for _ in range(p):
        pts.append((x, y))
        x, y, t = x + math.cos(t), y + math.sin(t), t + 2 * math.pi / p
    return pts


def overlap(P, Q, eps=1e-7):
    """Do two convex polygons share interior? Separating axis test; touching is allowed."""
    for poly in (P, Q):
        for i in range(len(poly)):
            (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % len(poly)]
            nx, ny = y2 - y1, x1 - x2
            pp = [nx * x + ny * y for x, y in P]
            qq = [nx * x + ny * y for x, y in Q]
            if min(max(pp), max(qq)) - max(min(pp), min(qq)) < eps:
                return False
    return True


def completable(faces, stars):
    """faces: (size, start angle) round one point. Some star must hold them all at those angles."""
    near = lambda u, v: abs((u - v + math.pi) % (2 * math.pi) - math.pi) < 1e-6  # noqa: E731
    p0, t0 = faces[0]
    for r in stars:
        if r[0] != p0:
            continue
        starts, s = [], 0.0
        for p in r:
            starts.append((p, s + t0))
            s += interior(p)
        if all(any(q == p and near(u, t) for q, u in starts) for p, t in faces[1:]):
            return True
    return False


def figure_ok(a, b, stars):
    polys, t = [], 0.0
    for p in a:                                   # the star at A, from the edge AB
        polys.append(polygon(0.0, 0.0, t, p))
        t += interior(p)
    t = math.pi + interior(b[0])
    for p in b[1:-1]:                             # the star at B without the two faces of the edge
        polys.append(polygon(1.0, 0.0, t, p))
        t += interior(p)
    if any(overlap(polys[i], polys[j]) for i in range(len(polys)) for j in range(i)):
        return False
    at = {}
    for poly in polys:
        n = len(poly)
        for i, (x, y) in enumerate(poly):
            nx, ny = poly[(i + 1) % n]
            at.setdefault((round(x, 6) + 0.0, round(y, 6) + 0.0), []).append((n, math.atan2(ny - y, nx - x)))
    return all(completable(f, stars) for q, f in at.items()
               if len(f) > 1 and q not in ((0.0, 0.0), (1.0, 0.0)))


def edge_figures(stars):
    """Valid full edge figures, canonical placement = the smallest of its four images."""
    idx = {}
    for r in stars:
        idx.setdefault((r[0], r[-1]), []).append(r)
    figs = set()
    for a in stars:
        for b in idx.get((a[-1], a[0]), ()):
            C = min(image((a, b), g) for g in range(4))
            if C not in figs and figure_ok(C[0], C[1], stars):
                figs.add(C)
    return sorted(figs, key=lambda C: (len(C[0]) + len(C[1]), C))


def corners_close(p, stars):
    """Can a p-gon be ringed? Corner (x, y) = consecutive neighbours of the p-gon at one of its vertices."""
    sizes = sorted({q for r in stars for q in r})
    ix = {q: i for i, q in enumerate(sizes)}
    n = len(sizes)
    A = [[0] * n for _ in range(n)]
    for r in stars:
        if r[1 % len(r)] == p:
            A[ix[r[2 % len(r)]]][ix[r[0]]] = 1
    R = [[int(i == j) for j in range(n)] for i in range(n)]
    for _ in range(p):
        R = [[int(any(R[i][k] and A[k][j] for k in range(n))) for j in range(n)] for i in range(n)]
    return any(R[i][i] for i in range(n))


def usable_stars(log=print):
    types = all_stars()
    log(f"stars with angle sum 360: {len(types)}")
    while True:
        stars = rooted(types)
        figs = edge_figures(stars)
        ends = {a for a, b in figs} | {b for a, b in figs}
        ends |= {w[::-1] for w in ends}
        drop = [t for t in types if not rooted([t]) <= ends or not all(corners_close(p, stars) for p in set(t))]
        if not drop:
            return types, stars, figs
        log("  cannot occur: " + ", ".join(word(t) for t in drop))
        types = [t for t in types if t not in drop]


def word(w):
    out, i = [], 0
    while i < len(w):
        j = i
        while j < len(w) and w[j] == w[i]:
            j += 1
        out.append(str(w[i]) + (f"^{j - i}" if j - i > 1 else ""))
        i = j
    return ".".join(out)


# ── full face figures: a p-gon with the star at each corner. Corners 0..p-1 run ccw, edge i joins corners i and
# i+1, and star i is read ccw round corner i from the p-gon: (p, the face across edge i-1, ..., the face across
# edge i). The p-gon's 2p symmetries map placements to placements; a reflection reverses each star. A flag is
# 2 * edge + end, end 1 at the edge's second corner. ──


def face_image(P, g):
    """Placement P under symmetry g: g < p turns by g corners; g >= p reflects, then turns by g - p."""
    p = len(P)
    if g >= p:
        P, g = tuple((P[-i % p][0],) + P[-i % p][:0:-1] for i in range(p)), g - p
    return P[g:] + P[:g]


def face_polys(P, x=0.0, y=0.0, t=0.0):
    """The figure's polygons as (size, centroid, vertices), corner 0 at (x, y) and edge 0 leaving it at angle t."""
    corners, out = polygon(x, y, t, len(P)), []
    for i, star in enumerate(P):
        (x, y), (nx, ny) = corners[i], corners[(i + 1) % len(P)]
        t = math.atan2(ny - y, nx - x)
        for q in star:
            poly = polygon(x, y, t, q)
            c = (sum(u for u, v in poly) / q, sum(v for u, v in poly) / q)
            if not any(q2 == q and math.dist(c, c2) < 1e-6 for q2, c2, _ in out):
                out.append((q, c, poly))
            t += interior(q)
    return out


def face_ok(P, stars):
    """No two of the figure's polygons overlap, and every point they share off the p-gon can take a star."""
    p = len(P)
    corners = polygon(0.0, 0.0, 0.0, p)
    polys = [poly for q, c, poly in face_polys(P)]
    if any(overlap(polys[i], polys[j]) for i in range(len(polys)) for j in range(i)):
        return False
    at, own = {}, {(round(x, 6) + 0.0, round(y, 6) + 0.0) for x, y in corners}
    for poly in polys:
        n = len(poly)
        for i, (x, y) in enumerate(poly):
            nx, ny = poly[(i + 1) % n]
            at.setdefault((round(x, 6) + 0.0, round(y, 6) + 0.0), []).append((n, math.atan2(ny - y, nx - x)))
    return all(completable(f, stars) for q, f in at.items() if len(f) > 1 and q not in own)


def face_figures(stars):
    """Valid full face figures, canonical placement = the smallest of its 2p images."""
    by = {}
    for r in stars:
        by.setdefault(r[0], []).append(r)
    figs, seen = [], set()

    def grow(P, p):
        if len(P) == p:
            C = min(face_image(P, g) for g in range(2 * p)) if P[-1][-1] == P[0][1] else None
            if C and C not in seen:
                seen.add(C)
                if face_ok(C, stars):
                    figs.append(C)
            return
        for r in by[p]:
            if not P or r[1] == P[-1][-1]:
                grow(P + (r,), p)

    for p in sorted(by):
        grow((), p)
    return sorted(figs, key=lambda C: (len(C), C))


def face_label(C):
    return f"{len(C)}[" + " ".join(word(s) for s in C) + "]"


def simple_label(P):
    """The simple face figure of a placement: the p-gon and the sizes across its edges, up to turning and mirroring."""
    return f"{len(P)}[" + ".".join(map(str, cyclic_canon([s[1] for s in P]))) + "]"


def galebach_figure(a, b):
    """His canonical spelling, the same rule as scripts/classify-edge-homogeneous.ts (string tokens)."""
    U, W = [str(x) for x in a], [str(x) for x in b]
    s = lambda u, w: ".".join(u) + "/" + ".".join(w)  # noqa: E731
    return min(s(U, W), s(W, U), s(U[::-1], W[::-1]), s(W[::-1], U[::-1]))


# ── catalogues: per figure its flags, the two known involutions, its symmetries, and the third involution's
# candidates as (figure', flag') in canonical coordinates ──


class Catalogue:
    pass


def edge_catalogue(stars, figs):
    c = Catalogue()
    c.kind, c.ext, c.figs = "edge", 1, figs
    c.nf = [4] * len(figs)
    c.inner = {0: [[f ^ 2 for f in range(4)]] * len(figs), 2: [[f ^ 1 for f in range(4)]] * len(figs)}
    table = {}
    for F, C in enumerate(figs):
        for g in range(4):
            table.setdefault(image(C, g), (F, g))
    c.aut = [[[f ^ g for f in range(4)] for g in range(4) if image(C, g) == C] for C in figs]
    c.m01 = [[a[0], a[-1], a[0], a[-1]] for a, b in figs]
    c.m12 = [[len(a), len(a), len(b), len(b)] for a, b in figs]
    idx = {}
    for r in stars:
        idx.setdefault((r[0], r[-1]), []).append(r)
    c.opts = []
    for F, (a, b) in enumerate(figs):
        row = []
        for f in range(4):
            u, h = ((b, f ^ 3) if f >> 1 else (a, f))
            if h == 0:   # the face above, at A: its other edge at A has a[1] above it
                u2, f2, need = u[1:] + u[:1], 1, (u[0], u[1])
            else:
                u2, f2, need = u[-1:] + u[:-1], 0, (u[-2], u[-1])
            got = set()
            for w in idx.get(need, ()):
                if (u2, w) in table:
                    F2, g = table[(u2, w)]
                    got.add((F2, min(p[f2 ^ g] for p in c.aut[F2])))
            row.append(sorted(got))
        c.opts.append(row)
    c.label = [galebach_figure(a, b) for a, b in figs]
    return c


def dihedral(d):
    """(face map, edge map) for the 2d symmetries of a d-cycle; edge i sits between faces i-1 and i."""
    out = []
    for k in range(d):
        out.append(([(j - k) % d for j in range(d)], [(i - k) % d for i in range(d)]))
        out.append(([(-j - k) % d for j in range(d)], [(1 - i - k) % d for i in range(d)]))
    return out


def vertex_catalogue(types, stars, figs):
    c = Catalogue()
    c.kind, c.ext, c.figs = "vertex", 0, list(types)
    ok = set(figs) | {image(C, g) for C in figs for g in range(4)}
    flag = lambda i, t, d: 2 * (i % d) + t  # noqa: E731   t = 0: face i, t = 1: face i-1
    pos = {t: n for n, t in enumerate(types)}

    def canon(w, fl):
        """(type, flag) for the star word w (any rotation/reflection) and a flag in w's coordinates."""
        d = len(w)
        i, t = fl >> 1, fl & 1
        best = None
        for fm, em in dihedral(d):
            w2 = [0] * d
            for j in range(d):
                w2[fm[j]] = w[j]
            j2, i2 = fm[(i - t) % d], em[i]
            cand = (tuple(w2), flag(i2, 0 if j2 == i2 else 1, d))
            if best is None or cand < best:
                best = cand
        return best

    c.nf, c.aut, c.m01, c.m12, c.opts, s1, s2 = [], [], [], [], [], [], []
    for T in types:
        d = len(T)
        c.nf.append(2 * d)
        s2.append([f ^ 1 for f in range(2 * d)])
        s1.append([0] * (2 * d))
        for i in range(d):
            s1[-1][flag(i, 0, d)] = flag(i + 1, 1, d)
            s1[-1][flag(i + 1, 1, d)] = flag(i, 0, d)
        perms = []
        for fm, em in dihedral(d):
            if all(T[fm[j]] == T[j] for j in range(d)):
                perms.append([flag(em[f >> 1], 0 if fm[((f >> 1) - (f & 1)) % d] == em[f >> 1] else 1, d)
                              for f in range(2 * d)])
        c.aut.append(perms)
        c.m01.append([T[((f >> 1) - (f & 1)) % d] for f in range(2 * d)])
        c.m12.append([d] * (2 * d))
    for T in types:                               # the neighbour across each flag's edge
        d, row = len(T), []
        for f in range(2 * d):
            i, t = f >> 1, f & 1
            a = T[i:] + T[:i]
            got = set()
            for b in stars:
                if b[0] == a[-1] and b[-1] == a[0] and (a, b) in ok:
                    w, fl = canon(b, 1 - t)
                    F2 = pos[w]
                    got.add((F2, min(p[fl] for p in c.aut[F2])))
            row.append(sorted(got))
        c.opts.append(row)
    c.inner = {1: s1, 2: s2}
    c.label = [word(T) for T in types]
    return c


def subgroups(perms):
    """Every subgroup of a small group of flag permutations (dihedral groups: two generators suffice)."""
    def close(gens):
        G = {tuple(range(len(perms[0])))}
        frontier = list(G)
        while frontier:
            new = []
            for x in frontier:
                for g in gens:
                    y = tuple(g[i] for i in x)
                    if y not in G:
                        G.add(y)
                        new.append(y)
            frontier = new
        return frozenset(G)
    out = {close([])}
    for g in perms:
        for h in perms:
            out.add(close([g, h]))
    return sorted(out, key=lambda G: (len(G), sorted(G)))


def start_stabilizers(perms):
    """Indices into subgroups(perms), one per conjugacy class: a start cell under H and under gHg^-1 is the same
    search with its flags renamed."""
    subs, seen, keep = subgroups(perms), set(), []
    inv = [tuple(sorted(range(len(g)), key=lambda i: g[i])) for g in perms]
    for h, H in enumerate(subs):
        if H not in seen:
            keep.append(h)
            seen |= {frozenset(tuple(g[x[gi[i]]] for i in range(len(g))) for x in H) for g, gi in zip(perms, inv)}
    return keep


# ── the search: the depth-first loop runs in homogeneous_dfs.cpp; this side writes the catalogue for it ──

DFS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "homogeneous_dfs")


def build_dfs():
    src = DFS + ".cpp"
    if not os.path.exists(DFS) or os.path.getmtime(DFS) < os.path.getmtime(src):
        subprocess.run(["c++", "-O2", "-std=c++17", "-o", DFS, src], check=True)


def catalogue_text(c):
    """The catalogue as homogeneous_dfs reads it: per figure its flags' m01, m12, the two known involutions,
    its symmetries, every subgroup as flag -> orbit number (first seen first), and per flag the candidates."""
    i1, i2 = sorted(c.inner)
    out = [f"{c.ext} {i1} {i2}", str(len(c.figs))]
    for F in range(len(c.figs)):
        nf = c.nf[F]
        out.append(" ".join(map(str, [nf, *c.m01[F], *c.m12[F], *c.inner[i1][F], *c.inner[i2][F]])))
        out.append(" ".join(map(str, [len(c.aut[F])] + [g for p in c.aut[F] for g in p])))
        subs = []
        for H in subgroups(c.aut[F]):
            num, orbit = {}, []
            for f in range(nf):
                rep = min(h[f] for h in H)
                orbit.append(num.setdefault(rep, len(num)))
            subs.append(orbit)
        out.append(" ".join(map(str, [len(subs)] + [o for orbit in subs for o in orbit])))
        for row in c.opts[F]:
            out.append(" ".join(map(str, [len(row)] + [v for o in row for v in o])))
    if c.kind in FACE_KINDS:                      # the face table: star words, then per figure the figure a closed
        imgs = [[face_image(C, g) for g in range(2 * len(C))] for C in c.faces]   # face orbit claims, and every
        words = sorted({w for row in imgs for P in row for w in P})               # placement
        ix = {w: i for i, w in enumerate(words)}
        owner = {}
        if c.kind == "face-simple":
            owner = {F: owner.setdefault(simple_label(C), len(owner)) for F, C in enumerate(c.faces)}
        out += [str(len(words))] + [" ".join(map(str, [len(w), *w])) for w in words] + [str(len(imgs))]
        out += [" ".join(map(str, [owner.get(F, F), len(row[0]), len(row)] + [ix[w] for P in row for w in P]))
                for F, row in enumerate(imgs)]
    return "\n".join(out) + "\n"


def symbol(c, elems, s):
    """D-symbol of a finished search: chambers (figure, flag) and the three involutions."""
    rng = range(len(elems))
    return DSymbol(*({x: si[x] for x in rng} for si in s), {x: c.m01[F][f] for x, (F, f) in enumerate(elems)},
                   {x: c.m12[F][f] for x, (F, f) in enumerate(elems)})


# ── reading a finished symbol ──

TAG = {4: "C1", 1: "D+"}


def edge_tag(mi, orbit):
    if len(orbit) in TAG:
        return TAG[len(orbit)]
    x = min(orbit)
    return "C2" if mi.s[0][x] == mi.s[2][x] != x else "D-" if mi.s[2][x] == x else "D|"


def orbit_list(sym, i, j):
    seen, out = set(), []
    for x in range(sym.n):
        if x not in seen:
            orb, todo = set(), [x]
            while todo:
                y = todo.pop()
                if y not in orb:
                    orb.add(y)
                    todo += [sym.s[i][y], sym.s[j][y]]
            seen |= orb
            out.append(sorted(orb))
    return out


def read_faces(sym, simple=False):
    """Each face orbit's full (or simple) face figure as the symbol has it: walk the face, read the star at each
    corner."""
    out = []
    for orbit in orbit_list(sym, 0, 1):
        x, P = orbit[0], []
        for _ in range(sym.m01[x]):
            star, y = [sym.m01[x]], sym.s[2][x]
            while len(star) < sym.m12[x]:
                star.append(sym.m01[y])
                y = sym.s[2][sym.s[1][y]]
            P.append(tuple(star))
            x = sym.s[0][sym.s[1][x]]
        out.append(simple_label(P) if simple else face_label(min(face_image(tuple(P), g) for g in range(2 * len(P)))))
    return out


def describe(c, elems, s):
    """The tiling under its full group: canonical form (identity), k, e, t, and the homogeneous figures."""
    sym = symbol(c, elems, s)
    ok, why = validate(sym)
    assert ok, why
    assert curvature(sym) == 0
    mi, proj = minimal_image(sym, with_proj=True)
    cf = canonical_form(mi)
    V, E, T = orbit_list(mi, 1, 2), orbit_list(mi, 0, 2), orbit_list(mi, 0, 1)
    fig_of = {}
    for x, (F, f) in enumerate(elems):
        fig_of.setdefault(proj[x], F)
    if c.kind == "edge":
        figs = sorted(f"{c.label[fig_of[o[0]]]}({edge_tag(mi, o)})" for o in E)
        assert len({f.split('(')[0] for f in figs}) == len(E), "two edge orbits share a figure"
    elif c.kind in FACE_KINDS:
        figs = sorted(read_faces(mi, simple=c.kind == "face-simple"))
        assert len(set(figs)) == len(T), "two face orbits share a figure"
    else:
        figs = sorted(c.label[fig_of[o[0]]] for o in V)
        assert len(set(figs)) == len(V), "two vertex orbits share a star"
    return cf, {"k": len(V), "e": len(E), "t": len(T), "chambers": mi.n, "figures": figs}


# ── driver ──

STATE = {}
FACE_KINDS = ("face-stars", "face-simple")


def catalogue(kind, log=lambda s: None):
    types, stars, figs = usable_stars(log=lambda s: None)
    if kind in FACE_KINDS:
        c = vertex_catalogue(types, stars, figs)
        c.kind, c.faces = kind, face_figures(stars)
        log(f"valid full face figures: {len(c.faces)}")
        return c
    return edge_catalogue(stars, figs) if kind == "edge" else vertex_catalogue(types, stars, figs)


def init(cat, logpath=None, kmax=None):
    STATE.update(cat=cat, text=catalogue_text(cat), log=logpath, kmax=kmax)


def one_start(unit):
    """Every symbol whose lowest figure is `start` (with h: under its h-th stabilizer only; with part (i, n, d): the
    i-th of n slices of the tree at depth d), through homogeneous_dfs; its long-run lines go to the log."""
    start, h, part = unit
    c = STATE["cat"]
    found, completions, nodes, hits, t0 = {}, 0, 0, 0, time.time()
    err = open(STATE["log"], "a") if STATE["log"] else subprocess.DEVNULL
    kmax = [str(STATE["kmax"]), str(h), *map(str, part or ())] if STATE.get("kmax") else []
    proc = subprocess.Popen([DFS, str(start), *kmax], stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=err, text=True)
    proc.stdin.write(STATE["text"])
    proc.stdin.close()
    for line in proc.stdout:
        if line.startswith("N "):
            nodes, hits = map(int, line.split()[1:])
            continue
        head, *inv = line[2:].split(" | ")
        nums = list(map(int, head.split()))
        elems = list(zip(nums[1::2], nums[2::2]))
        completions += 1
        cf, info = describe(c, elems, [list(map(int, x.split())) for x in inv])
        found.setdefault(repr(cf), dict(info, dsymbol=cf))
    assert proc.wait() == 0, f"homogeneous_dfs failed on start {start}"
    return unit, nodes, hits, completions, found, time.time() - t0


def main():
    kind = sys.argv[1]
    arg = lambda name, d: sys.argv[sys.argv.index(name) + 1] if name in sys.argv else d  # noqa: E731
    jobs = int(arg("--jobs", os.cpu_count()))
    kmax = int(arg("--kmax", 0)) or None
    assert (kind in FACE_KINDS) == (kmax is not None), "--kmax goes with the face kinds, and only there"
    logpath, out, figout = arg("--log", None), arg("--out", None), arg("--figures", None)
    logf = open(logpath, "a") if logpath else None

    def log(s):
        line = time.strftime("%H:%M:%S  ") + s
        print(line, flush=True)
        if logf:
            logf.write(line + "\n")
            logf.flush()

    bound = f"k <= {kmax}" if kmax else "no bound on k"
    log(f"=== {kind}-homogeneous tilings by regular polygons: D-symbol search, {bound} ===")
    types, stars, figs = usable_stars(log=log)
    log(f"stars that can occur: {len(types)}: " + ", ".join(word(t) for t in types))
    log(f"valid full edge figures: {len(figs)}")
    if figout:
        tag = {(0,): "C1", (0, 1): "D-", (0, 2): "D|", (0, 3): "C2", (0, 1, 2, 3): "D+"}
        with open(figout, "w") as fh:
            json.dump([{"figure": galebach_figure(a, b),
                        "symmetry": tag[tuple(g for g in range(4) if image((a, b), g) == (a, b))]}
                       for a, b in figs], fh, indent=1)
    build_dfs()
    cache = arg("--catalogue", None)
    if cache and os.path.exists(cache):
        with open(cache, "rb") as fh:
            c = pickle.load(fh)
        log(f"catalogue read from {cache}")
    else:
        c = catalogue(kind, log)
        if cache:
            with open(cache, "wb") as fh:
                pickle.dump(c, fh)
    init(c, kmax=kmax)
    n = len(c.figs)
    log(f"{n} figures to start from (each search keeps the figures above its start), {jobs} processes")
    found, nodes_total, hits_total, t0 = {}, 0, 0, time.time()
    order = sorted(range(n), key=lambda F: -sum(len(o) for o in c.opts[F]))
    split, parts, depth = arg("--split", "").split(","), int(arg("--parts", 1)), int(arg("--depth", 8))
    units = [(F, h, None) for F in order for h in (start_stabilizers(c.aut[F]) if kmax else [None])]
    heavy = [(F, h) for F, h, _ in units if f"{c.label[F]}:{h}" in split]
    units = [(F, h, (i, parts, depth)) for F, h in heavy for i in range(parts)] + [u for u in units if u[:2] not in heavy]
    if heavy:
        log(f"split into {parts} parts at depth {depth}: " + ", ".join(f"{c.label[F]} under stabilizer {h}" for F, h in heavy))
    with Pool(jobs, initializer=init, initargs=(c, logpath, kmax)) as pool:
        for i, (unit, nodes, hits, comps, got, dt) in enumerate(pool.imap_unordered(one_start, units), 1):
            nodes_total += nodes
            hits_total += hits
            for k, v in got.items():
                found.setdefault(k, v)
            start = unit[0]
            under = "" if unit[1] is None else f" under stabilizer {unit[1]}" + (f", part {unit[2][0]}" if unit[2] else "")
            cut = f", the cap cut {hits} branches" if hits else ""
            log(f"[{i}/{len(units)}] from {c.label[start]}{under}: {nodes} nodes, {comps} symbols, {len(got)} tilings,"
                f" {dt:.1f} s{cut} | total {len(found)} distinct, {nodes_total} nodes, {time.time() - t0:.0f} s elapsed")
    by_k = {}
    for v in found.values():
        by_k[v["k"]] = by_k.get(v["k"], 0) + 1
    log(f"done: {len(found)} {kind}-homogeneous tilings; by k: {dict(sorted(by_k.items()))}; "
        f"{nodes_total} nodes in {time.time() - t0:.0f} s")
    if kmax:
        log(f"the cap on k cut {hits_total} branches: " + ("complete for EVERY k" if not hits_total
            else f"complete for k <= {kmax} only"))
    if out:
        rows = sorted(found.items(), key=lambda kv: (kv[1]["e"], kv[1]["k"], kv[1]["figures"]))
        with gzip.open(out, "wt") if out.endswith(".gz") else open(out, "w") as fh:
            json.dump([v for k, v in rows], fh)


if __name__ == "__main__":
    main()
