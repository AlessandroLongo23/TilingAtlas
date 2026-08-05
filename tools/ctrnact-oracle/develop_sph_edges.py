#!/usr/bin/env python3
"""Develop Marek Čtrnáct's SPHERICAL edge-system certificates (his `pt_edges_443` … `pt_edges_3336`
family, plus `cuboctahedron_edges`) into the atlas's three.js sphere records.

THE OBJECT. Exactly the object develop_hyp_edges.py develops, moved from H² to S²: a periodic subset
of the edges of a uniform polyhedron, with drawn edges modelled as DIGONS (A2, interior angle 0)
inserted into the vertex figure, and the tiles the regions that fall out when base faces are merged
across UNDRAWN edges. `k` counts VERTEX orbits of the decorated tiling — Marek's "Number of
vertices".

WHY IT IS ITS OWN FILE AND NOT A THIRD BASE IN develop_hyp_edges. Only the back end differs, but it
differs completely: H² never closes, so that file ships DARTS and the client re-develops under the
live view; the sphere closes into a finite polyhedron, so a record here ships which of a FIXED board's
edges are drawn. The two halves it is assembled from already exist and are imported, not copied:

  * front end — develop_freedraw's parser / VTable / Block, through develop_hyp_edges.build_block.
    The digon convention is that file's, not develop_schwarz's: only a DRAWN edge carries a digon.
  * back end  — develop_schwarz.py's spherical half: the SO(3) flood-fill, the canonical shared board
    and the per-pattern projection onto it, which is what makes 102,278 cuboctahedron records ship as
    12 MB instead of 150 MB.

WHAT CHANGES FROM develop_schwarz's sphere. Its board is a Schwarz triangulation: every face is a
triangle and every edge carries a digon, and it aligns a development by naming a reference FLAG off
the certificate's own letters. Neither holds here. These boards mix face sizes (a prism has squares
and one n-gon pair, the cuboctahedron triangles and squares), and a flag's letters depend on the
decoration, since an undrawn edge has no digon at all. So the alignment is computed from the
DEVELOPED GEOMETRY instead (`frame_candidates`): a candidate frame per (face, incident vertex) flag
of the smallest face size, tried until one lands the whole vertex set on the canonical board. The
landing is asserted, never assumed — `run` raises if no candidate works, because two developments of
one board that do not land on each other would mean the board is not what the corpus says it is.

BOARD IDENTITY IS CHECKED, NOT TRUSTED. Each board declares the V/E/F of the polyhedron it claims to
be, and every development is measured against it before anything is emitted. A prism corpus that
developed into 12 vertices would fail here rather than ship as a prism.

Usage:
    develop_sph_edges.py <corpus-dir> --board 443 --out public/spherical-edges/x443
    develop_sph_edges.py <corpus-dir> --board cuboctahedron --ks 1,2,3 --out ... --report ...
    develop_sph_edges.py --selftest
"""
import argparse
import glob
import json
import math
import os
import re
import sys
import time
from collections import Counter, defaultdict

import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

import develop_freedraw as fd
from develop_freedraw import DevelopError
from develop_hyp_edges import build_block, tile_size

TWO_PI = 2 * math.pi
TOL = 1e-6
ZHAT = np.array([0.0, 0.0, 1.0])
XHAT = np.array([1.0, 0.0, 0.0])

# Marek's spherical edge boards, by the id his corpora use. `config` is the vertex figure of the
# UNDECORATED polyhedron in cyclic order; `vef` is its (V, E, F), which every development is checked
# against. Everything else — the edge arc ρ, the alphabet, the rotation orders — is derived, so adding
# a board is one row.
BOARDS = {
    "443": {"config": [4, 4, 3], "label": "3.4.4", "solid": "triangular prism",
            "vef": (6, 9, 5), "solver": "pt_edges_443.exe"},
    "445": {"config": [4, 4, 5], "label": "4.4.5", "solid": "pentagonal prism",
            "vef": (10, 15, 7), "solver": "pt_edges_445.exe"},
    "446": {"config": [4, 4, 6], "label": "4.4.6", "solid": "hexagonal prism",
            "vef": (12, 18, 8), "solver": "pt_edges_446.exe"},
    "447": {"config": [4, 4, 7], "label": "4.4.7", "solid": "heptagonal prism",
            "vef": (14, 21, 9), "solver": "pt_edges_447.exe"},
    "448": {"config": [4, 4, 8], "label": "4.4.8", "solid": "octagonal prism",
            "vef": (16, 24, 10), "solver": "pt_edges_448.exe"},
    "663": {"config": [6, 6, 3], "label": "3.6.6", "solid": "truncated tetrahedron",
            "vef": (12, 18, 8), "solver": "pt_edges_663.exe"},
    "664": {"config": [6, 6, 4], "label": "4.6.6", "solid": "truncated octahedron",
            "vef": (24, 36, 14), "solver": "pt_edges_664.exe"},
    "3334": {"config": [3, 3, 3, 4], "label": "3.3.3.4", "solid": "square antiprism",
             "vef": (8, 16, 10), "solver": "pt_edges_3334.exe"},
    "3335": {"config": [3, 3, 3, 5], "label": "3.3.3.5", "solid": "pentagonal antiprism",
             "vef": (10, 20, 12), "solver": "pt_edges_3335.exe"},
    "3336": {"config": [3, 3, 3, 6], "label": "3.3.3.6", "solid": "hexagonal antiprism",
             "vef": (12, 24, 14), "solver": "pt_edges_3336.exe"},
    "3337": {"config": [3, 3, 3, 7], "label": "3.3.3.7", "solid": "heptagonal antiprism",
             "vef": (14, 28, 16), "solver": "pt_edges_3337.exe"},
    # 2 octagons + 16 triangles: V = 2n, E = 4n, F = 2 + 2n at n = 8, the same antiprism arithmetic as
    # the four above it.
    "3338": {"config": [3, 3, 3, 8], "label": "3.3.3.8", "solid": "octagonal antiprism",
             "vef": (16, 32, 18), "solver": "pt_edges_3338.exe"},
    # The first CHIRAL board on this shelf: the snub cube has no mirror symmetry, so its isometry group
    # is the rotation group O (order 24) and not Oh. `board_project` already tries the reflected frame
    # (_YFLIP) for every candidate, so a development that came out mirrored still lands on the one board
    # instead of forking an enantiomorph — which is what the per-k census check confirms.
    "33334": {"config": [3, 3, 3, 3, 4], "label": "3.3.3.3.4", "solid": "snub cube",
              "vef": (24, 60, 38), "solver": "pt_edges_33334.exe"},
    # 3.4.4.4 is shared by the rhombicuboctahedron and the pseudo-rhombicuboctahedron (J37, the
    # elongated square gyrobicupola): same V/E/F, same figure at EVERY vertex, so `census_key` cannot
    # separate them and KNOWN_SOLIDS must not try. The corpus develops into both and the second gets
    # the `4443v2` fallback id; which of the two it is has to be decided from geometry, not census.
    "4443": {"config": [4, 4, 4, 3], "label": "3.4.4.4", "solid": "rhombicuboctahedron",
             "vef": (24, 48, 26), "solver": "pt_edges_4443.exe"},
    "cuboctahedron": {"config": [3, 4, 3, 4], "label": "3.4.3.4", "solid": "cuboctahedron",
                      "vef": (12, 24, 14), "solver": "pt_cuboctahedron_edges.exe"},
}


# ---------------------------------------------------------------- spherical geometry
def regular_spherical_polygon(p, rho):
    """Vertices of a regular spherical p-gon of side ρ, centred on ẑ. None when ρ is too long to close."""
    s = math.sin(rho / 2.0) / math.sin(math.pi / p)
    if s > 1.0:
        return None
    r = math.asin(s)
    return np.array([[math.sin(r) * math.cos(2 * math.pi * i / p),
                      math.sin(r) * math.sin(2 * math.pi * i / p),
                      math.cos(r)] for i in range(p)])


def interior_angle(p, rho):
    """Interior angle of a regular spherical p-gon of side ρ. The digon (p=2) is 0, exactly as
    α(2, ℓ) = 2·asin(cos(π/2)/cosh(ℓ/2)) = 0 in H² — which is what lets a drawn edge be a zero-area
    face in both geometries. It is returned as an exact 0, not computed: the general path would take
    acos of a dot product that is 1 to rounding, and acos amplifies that to ~1e-8."""
    if p == 2:
        return 0.0
    v = regular_spherical_polygon(p, rho)
    if v is None:
        return math.pi
    v0, v1, vm = v[0], v[1], v[p - 1]

    def tangent(a, b):
        t = b - np.dot(b, a) * a
        n = np.linalg.norm(t)
        if n < 1e-15:
            return t
        return t / n

    t1, t2 = tangent(v0, v1), tangent(v0, vm)
    if np.linalg.norm(t1) < 1e-15 or np.linalg.norm(t2) < 1e-15:
        return 0.0
    return math.acos(max(-1.0, min(1.0, float(np.dot(t1, t2)))))


def solve_rho(config, tol=1e-14):
    """The edge arc ρ with Σ α(pᵢ, ρ) = 2π — the positive-defect closure. None when the config is not
    spherical (Euclidean angle sum ≥ 2π)."""
    euclid = sum(math.pi * (n - 2) / n for n in config)
    if euclid >= TWO_PI - 1e-12:
        return None
    lo, hi = 1e-9, 2 * math.pi / max(config) - 1e-9

    def f(rho):
        return sum(interior_angle(p, rho) for p in config) - TWO_PI

    if f(lo) >= 0 or f(hi) <= 0:
        return None
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if f(mid) > 0:
            hi = mid
        else:
            lo = mid
        if hi - lo < tol:
            break
    return 0.5 * (lo + hi)


def alphabet(config):
    """(ρ, {letter: interior angle at ρ}) for the board's faces plus the digon that marks a drawn edge."""
    rho = solve_rho(list(config))
    if rho is None:
        raise DevelopError(f"config {config} is not spherical (Euclidean angle sum ≥ 2π)")
    units = {"A2": interior_angle(2, rho)}
    for n in sorted(set(config)):
        units[f"A{n}"] = interior_angle(n, rho)
    return rho, units


def Rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def Medge(rho):
    """Half-turn about the edge midpoint — the SO(3) twin of medge(ℓ) in SU(1,1)."""
    c, s = math.cos(rho), math.sin(rho)
    return np.array([[-c, 0.0, s], [0.0, -1.0, 0.0], [s, 0.0, c]])


def _key_pos(v):
    return (round(v[0] / TOL), round(v[1] / TOL), round(v[2] / TOL))


def _key_inst(h, R):
    pos, hx = R @ ZHAT, R @ XHAT
    return (h, round(pos[0] / TOL), round(pos[1] / TOL), round(pos[2] / TOL),
            round(hx[0] / TOL), round(hx[1] / TOL), round(hx[2] / TOL))


# ---------------------------------------------------------------- develop (SO(3) flood-fill)
def develop_sphere(block, rho, sign=1, guard=20000):
    """Flood-fill the instance orbit under {rneig, glue} in SO(3). `sign` flips the turn direction:
    chirality is not in the combinatorics, so both are tried and the one that closes wins. Returns
    (verts, inst, rn, gl) with inst[i] = (dart, R, vertex id)."""
    M = Medge(rho)
    inst_id, inst, rn, gl = {}, [], [], []
    vert_id, verts = {}, []

    def vid_of(R):
        pos = R @ ZHAT
        pos = pos / np.linalg.norm(pos)
        key = _key_pos(pos)
        if key not in vert_id:
            vert_id[key] = len(verts)
            verts.append(pos)
        return vert_id[key]

    def get_inst(h, R):
        key = _key_inst(h, R)
        if key in inst_id:
            return inst_id[key], False
        idx = len(inst)
        inst_id[key] = idx
        inst.append((h, R, vid_of(R)))
        rn.append(-1)
        gl.append(-1)
        return idx, True

    seed, _ = get_inst(0, np.eye(3))
    stack, pops = [seed], 0
    while stack:
        pops += 1
        if pops > guard:
            raise DevelopError(f"flood-fill did not close within {guard} instances")
        idx = stack.pop()
        h, R, _ = inst[idx]
        ridx, isnew = get_inst(block.rneig[h], R @ Rz(sign * block.step[h]))
        rn[idx] = ridx
        if isnew:
            stack.append(ridx)
        gidx, isnew = get_inst(block.glue[h], R @ M)
        gl[idx] = gidx
        if isnew:
            stack.append(gidx)
    return verts, inst, rn, gl


def sphere_complex(block, rho, vef):
    """Develop the decorated board and read off the finished complex: unit vertices, face rings,
    per-face merged-tile id, the edge list with drawn flags, and the vertex-orbit labels."""
    last = None
    for sign in (1, -1):
        try:
            verts, inst, rn, gl = develop_sphere(block, rho, sign=sign)
            return _emit(block, rho, vef, verts, inst, rn, gl)
        except DevelopError as e:
            last = e
    raise last


def _emit(block, rho, vef, verts, inst, rn, gl):
    # Faces: walk nxt(i) = gl[rn[i]] over the developed instances. A ring of 2 is the digon that marks
    # a drawn edge and is NOT a face of the board; everything else is.
    faces, seen, face_seed = [], set(), []
    for start in range(len(inst)):
        if start in seen:
            continue
        ring, members, idx, ok = [], [], start, False
        for _ in range(64):
            members.append(idx)
            ring.append(inst[idx][2])
            idx = gl[rn[idx]]
            if idx == start:
                ok = True
                break
        if not ok:
            raise DevelopError("developed face did not close")
        seen.update(members)
        if len(ring) == 2:
            continue
        if len(ring) < 3:
            raise DevelopError(f"developed face has {len(ring)} corners")
        faces.append(ring)
        face_seed.append(members[0])

    # Edges: one per glued instance pair, with the drawn bit off the dart. A drawn edge's digon traces
    # the same segment as its two real faces, so the undirected vertex pair dedups all of them.
    edges = {}
    for i, (h, R, va) in enumerate(inst):
        vb = inst[gl[i]][2]
        if va == vb:
            continue
        key = (min(va, vb), max(va, vb))
        drawn = bool(block.drawn[h])
        if key in edges and edges[key] != drawn:
            raise DevelopError("edge drawn flag disagrees across its darts")
        edges[key] = drawn

    V, E, F = vef
    if (len(verts), len(edges), len(faces)) != (V, E, F):
        raise DevelopError(f"developed V={len(verts)} E={len(edges)} F={len(faces)}, "
                           f"board is V={V} E={E} F={F}")
    if len(verts) - len(edges) + len(faces) != 2:
        raise DevelopError("Euler != 2")

    # Every developed side must measure ρ — the check that the one forced arc was applied, not assumed.
    for (a, b) in edges:
        d = math.acos(max(-1.0, min(1.0, float(np.dot(verts[a], verts[b])))))
        if abs(d - rho) > 1e-6:
            raise DevelopError(f"developed edge arc {d:.9f} != rho {rho:.9f}")

    # Merged tiles: flood the developed faces across UNDRAWN edges. Done on the finished sphere, not in
    # the quotient, so the tile count is the REAL one and not an orbit count.
    face_of_edge = defaultdict(list)
    for fi, ring in enumerate(faces):
        for a in range(len(ring)):
            u, v = ring[a], ring[(a + 1) % len(ring)]
            face_of_edge[(min(u, v), max(u, v))].append(fi)
    parent = list(range(len(faces)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for key, fs in face_of_edge.items():
        if len(fs) != 2:
            raise DevelopError(f"edge {key} borders {len(fs)} faces")
        if edges.get(key, True):
            continue
        a, b = find(fs[0]), find(fs[1])
        if a != b:
            parent[max(a, b)] = min(a, b)
    roots, tile_of = {}, []
    for fi in range(len(faces)):
        r = find(fi)
        if r not in roots:
            roots[r] = len(roots)
        tile_of.append(roots[r])

    vorbit = [-1] * len(verts)
    for (h, R, v) in inst:
        o = block.orbit_of[h]
        if vorbit[v] not in (-1, o):
            raise DevelopError("a vertex hosts two certificate orbits")
        vorbit[v] = o
    if -1 in vorbit:
        raise DevelopError("a developed vertex was never labelled")

    sizes = Counter(tile_of)
    return {
        "vertices": [[float(x) for x in v] for v in verts],
        "faces": [list(map(int, r)) for r in faces],
        "faceTile": [int(t) for t in tile_of],
        "edges": [[int(a), int(b), 1 if edges[(a, b)] else 0] for (a, b) in sorted(edges)],
        "vorbit": [int(x) for x in vorbit],
        "stats": {
            "tiles": len(roots),
            "tileSizes": sorted(sizes.values(), reverse=True),
            "faces": len(faces),
            "verts": len(verts),
            "edges": len(edges),
            "drawnEdges": sum(1 for v in edges.values() if v),
        },
    }


# ---------------------------------------------------------------- the shared board
# EVERY pattern on one board develops the SAME polyhedron; a decoration only says which of its edges
# are drawn. What differs between two developments is where the seed flag landed and the order the
# flood-fill happened to number things in, so the two are congruent but neither aligned nor indexed
# alike. Aligning every development onto one canonical board lets a shard carry the board ONCE in its
# header and each pattern only its drawn bits and tile ids: the cuboctahedron's k=12 slice is 96,804
# tilings, ~150 MB with the polyhedron repeated and ~12 MB without.
_VTOL = 1e-6
_STOL = 1e-6   # symmetry-group vertex lattice (symmetry_orbits); same size as _VTOL, different job
_ID3 = np.eye(3)
# The one reflection that fixes a flag frame: mirror across its own z–x plane.
_YFLIP = np.diag([1.0, -1.0, 1.0])


def _orthonormal(z, x):
    """Right-handed frame with ẑ' = z and x̂' in the z–x plane. Columns are the basis vectors, so the
    matrix maps (ẑ, x̂) onto (z, x) — which is exactly the frame a developed flag sits in."""
    z = np.asarray(z, dtype=float)
    z = z / np.linalg.norm(z)
    x = np.asarray(x, dtype=float) - float(np.dot(x, z)) * z
    n = np.linalg.norm(x)
    if n < 1e-9:
        return None
    x = x / n
    return np.column_stack([x, np.cross(z, x), z])


def frame_candidates(cx):
    """Frames read off the DEVELOPED GEOMETRY alone, for the flags on the smallest faces: one per
    (face, incident vertex). Any isometry carrying one development's frame onto another's carries the
    whole board, so the caller tries these in order and takes the first that lands."""
    verts = [np.asarray(v) for v in cx["vertices"]]
    smallest = min(len(r) for r in cx["faces"])
    out = []
    for ring in cx["faces"]:
        if len(ring) != smallest:
            continue
        centre = np.mean([verts[i] for i in ring], axis=0)
        for vi in ring:
            f = _orthonormal(verts[vi], centre)
            if f is not None:
                out.append(f)
    if not out:
        raise DevelopError("no usable flag frame on the development")
    return out


class SphEdgeBoard:
    """The canonical developed polyhedron, in a fixed vertex / face / edge order.

    Built from the first pattern that develops, then every later pattern is mapped ONTO it. Vertices
    are ordered by rounded position and faces and edges by their vertex indices, so the order is a
    function of the point set alone — nothing about the certificate that happened to build it. Unlike
    the Schwarz board a face ring is kept as a RING, not a sorted triple: these boards have faces
    bigger than a triangle, and a renderer needs the boundary order."""

    def __init__(self, verts, faces, edges):
        order = sorted(range(len(verts)), key=lambda i: tuple(round(float(x), 7) for x in verts[i]))
        remap = {old: new for new, old in enumerate(order)}
        self.vertices = [[float(x) for x in verts[i]] for i in order]
        self.lookup = {_key_pos(np.asarray(v)): i for i, v in enumerate(self.vertices)}
        if len(self.lookup) != len(self.vertices):
            raise DevelopError("two board vertices land on one position")
        rings = [canon_ring([remap[v] for v in ring]) for ring in faces]
        self.faces = sorted(rings)
        self.face_index = {frozenset(f): i for i, f in enumerate(self.faces)}
        self.edges = sorted((min(remap[a], remap[b]), max(remap[a], remap[b])) for (a, b) in edges)
        self.edge_index = {e: i for i, e in enumerate(self.edges)}
        if len(self.face_index) != len(self.faces) or len(self.edge_index) != len(self.edges):
            raise DevelopError("the canonical board has a repeated face or edge")

    def ref_frame(self):
        """The board's own reference flag, chosen by the SAME rule frame_candidates uses on a
        development: the first face of the smallest size, at its first vertex. Picking it off
        `faces[0]` instead would pick a square on a prism, and no triangle-flag frame could ever
        land on it."""
        smallest = min(len(f) for f in self.faces)
        ring = next(f for f in self.faces if len(f) == smallest)
        centre = np.mean([np.asarray(self.vertices[i]) for i in ring], axis=0)
        return _orthonormal(self.vertices[ring[0]], centre)

    def match(self, verts, align):
        """Vertex index map from a development (under `align`) onto this board, or None when it does
        not land — which is how a wrong frame candidate is detected and the next one tried."""
        out = []
        for v in verts:
            p = align @ np.asarray(v)
            i = self.lookup.get(_key_pos(p))
            if i is None:
                # A hair off the dedup grid is still the same vertex; fall back to the nearest.
                best, bd = -1, 1e9
                for j, c in enumerate(self.vertices):
                    d = abs(p[0] - c[0]) + abs(p[1] - c[1]) + abs(p[2] - c[2])
                    if d < bd:
                        best, bd = j, d
                if bd > _VTOL:
                    return None
                i = best
            out.append(i)
        if len(set(out)) != len(self.vertices):
            return None
        return out


def vertex_figures(vertices, faces):
    """The cyclic sequence of incident face sizes at every vertex, canonicalised (smallest rotation of
    either direction). Two faces are consecutive at v when they share an edge through v, so walking
    that adjacency is the vertex figure — the invariant that separates a board from a twin sharing its
    V/E/F."""
    # Chained through the SHARED EDGE, not through ring direction: the rings a flood-fill returns need
    # not be consistently oriented, and assuming they are silently mis-chains a mixed-size board.
    inc = defaultdict(list)
    for fi, ring in enumerate(faces):
        for a, v in enumerate(ring):
            inc[v].append((fi, ring[(a - 1) % len(ring)], ring[(a + 1) % len(ring)]))
    out = []
    for v in range(len(vertices)):
        items = inc[v]
        if not items:
            raise DevelopError("a board vertex is on no face")
        ends = {fi: (u, w) for (fi, u, w) in items}
        at_edge = defaultdict(list)
        for fi, u, w in items:
            at_edge[u].append(fi)
            at_edge[w].append(fi)
        if any(len(fs) != 2 for fs in at_edge.values()):
            raise DevelopError("an edge at a vertex does not border exactly two faces")
        start = items[0][0]
        cur, came = start, ends[start][0]
        order = []
        for _ in range(len(items)):
            order.append(len(faces[cur]))
            u, w = ends[cur]
            leave = w if came == u else u
            nxt = [f for f in at_edge[leave] if f != cur]
            if len(nxt) != 1:
                raise DevelopError("vertex figure did not chain")
            cur, came = nxt[0], leave
        if cur != start:
            raise DevelopError("vertex figure did not close")
        n = len(order)
        rots = [tuple(order[(i + s) % n] for s in range(n)) for i in range(n)]
        rots += [tuple(order[(i - s) % n] for s in range(n)) for i in range(n)]
        out.append(min(rots))
    return out


def census_key(figs):
    """Sorted (figure, count) census of a board's vertex figures — its combinatorial identity."""
    return tuple(sorted(Counter(figs).items()))


def dotted(fig):
    return ".".join(str(x) for x in fig)


def _frame(z, x):
    """Right-handed frame with ẑ' = z and x̂' in the z–x plane; None when the two are parallel."""
    z = np.asarray(z, dtype=float)
    z = z / np.linalg.norm(z)
    x = np.asarray(x, dtype=float) - float(np.dot(x, z)) * z
    nx = np.linalg.norm(x)
    if nx < 1e-9:
        return None
    x = x / nx
    return np.column_stack([x, np.cross(z, x), z])


def symmetry_orbits(vertices, faces):
    """Vertex orbits under the polyhedron's OWN isometry group, measured from the geometry.

    A symmetry of a polyhedron is determined by where it sends one FLAG (a face together with an
    incident vertex), so enumerating the isometries that carry flag 0 to each flag in turn — each with
    its mirror — enumerates the whole group, and a candidate is kept only when it maps the vertex set
    AND the face set onto themselves. Returns (orbit id per vertex, |G|).

    This is the invariant the census cannot supply: it is what separates a uniform solid from the
    Johnson gyro-twin that shares its vertex figure at every vertex."""
    V = [np.asarray(v, dtype=float) for v in vertices]
    lookup = {}
    for i, v in enumerate(V):
        lookup[tuple(round(float(x) / _STOL) for x in v)] = i
    face_keys = {frozenset(r) for r in faces}

    flags = []
    for ring in faces:
        centre = np.mean([V[i] for i in ring], axis=0)
        for vi in ring:
            f = _frame(V[vi], centre)
            if f is not None:
                flags.append(f)
    if not flags:
        raise DevelopError("no usable flag frame")
    base = flags[0]

    group = []
    for g in flags:
        for extra in (_ID3, _YFLIP):
            A = g @ extra @ base.T
            vmap = []
            for v in V:
                p = A @ v
                j = lookup.get(tuple(round(float(x) / _STOL) for x in p))
                if j is None:
                    vmap = None
                    break
                vmap.append(j)
            if vmap is None or len(set(vmap)) != len(V):
                continue
            if any(frozenset(vmap[i] for i in r) not in face_keys for r in faces):
                continue
            group.append(vmap)
    if not group:
        raise DevelopError("the identity is not in the measured symmetry group")

    parent = list(range(len(V)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for vmap in group:
        for i, j in enumerate(vmap):
            a, b = find(i), find(j)
            if a != b:
                parent[max(a, b)] = min(a, b)
    roots, orbit = {}, []
    for i in range(len(V)):
        r = find(i)
        if r not in roots:
            roots[r] = len(roots)
        orbit.append(roots[r])
    return orbit, len(group)


# Boards a corpus can develop into, keyed by (vertex-figure census, vertex orbits under the solid's own
# isometry group). A corpus is named for the uniform solid Marek solved on, but the solver enumerates by
# ANGLE CLOSURE, so a twin that shares the edge length and the V/E/F comes back in the same run:
# `cuboctahedron_edges` holds both 3.4.3.4 (the cuboctahedron, vertex-transitive) and the gyro-twin J27,
# whose vertices split 6 × 3.4.3.4 + 6 × 3.3.4.4.
#
# THE CENSUS ALONE IS NOT ENOUGH, and `edges_4443` is the textbook counterexample: the
# rhombicuboctahedron and the pseudo-rhombicuboctahedron J37 have V=24 E=48 F=26 and 3.4.4.4 at EVERY
# vertex, so nothing local separates them. Only the global symmetry does, and decisively — the
# rhombicuboctahedron is vertex-transitive (one orbit, |G|=48), J37 is not (two orbits, |G|=16). Hence
# the second half of the key. The same table lives in develop_ai1_sph.py keyed the same way; a solid
# absent from it is never guessed at, it gets a numbered fallback id.
KNOWN_SOLIDS = {
    (((( 3, 4, 3, 4), 12),), 1): ("cuboctahedron", "cuboctahedron", "3.4.3.4"),
    (((( 3, 3, 4, 4), 6), ((3, 4, 3, 4), 6)), 2): ("j27", "triangular orthobicupola (J27)", "3.3.4.4 / 3.4.3.4"),
    (((( 3, 4, 4, 4), 24),), 1): ("4443", "rhombicuboctahedron", "3.4.4.4"),
    (((( 3, 4, 4, 4), 24),), 2): ("j37", "pseudo-rhombicuboctahedron (J37)", "3.4.4.4"),
}


def canon_ring(ring):
    """A face ring in a canonical rotation and direction: start at the smallest vertex, run toward the
    smaller neighbour. Makes two developments of one face produce one tuple."""
    n = len(ring)
    i = min(range(n), key=lambda j: ring[j])
    fwd = tuple(ring[(i + s) % n] for s in range(n))
    bwd = tuple(ring[(i - s) % n] for s in range(n))
    return min(fwd, bwd)


def board_project(board, cx):
    """Re-express one development against the canonical board: which canonical face carries which
    merged tile, and which canonical edges are drawn. Returns (faceTile, drawn-string, vorbit), or
    None when no frame candidate lands the development on the board."""
    ref = board.ref_frame()
    for frame in frame_candidates(cx):
        # `ref @ frameᵀ` is a rotation. A development that came out with the opposite handedness — the
        # sign = −1 branch of sphere_complex — is the board's mirror image, congruent to it but never by
        # a rotation, so each candidate gets its reflected twin as well. Without it the cuboctahedron
        # (whose rotation group is simply transitive on triangle flags, so a wrong handedness has no
        # rotation to fall back on) fails to land on its own board.
        for extra in (_ID3, _YFLIP):
            align = ref @ extra @ frame.T
            vmap = board.match(cx["vertices"], align)
            if vmap is not None:
                break
        if vmap is None:
            continue
        face_tile = [0] * len(board.faces)
        for ring, t in zip(cx["faces"], cx["faceTile"]):
            face_tile[board.face_index[frozenset(vmap[v] for v in ring)]] = int(t)
        drawn = ["0"] * len(board.edges)
        for a, b, d in cx["edges"]:
            u, w = vmap[a], vmap[b]
            drawn[board.edge_index[(u, w) if u < w else (w, u)]] = "1" if d else "0"
        vorbit = [0] * len(board.vertices)
        for i, o in enumerate(cx["vorbit"]):
            vorbit[vmap[i]] = int(o)
        # Renumber tiles by first canonical face, so two records describing one tiling describe it
        # identically.
        seen, renum = {}, []
        for t in face_tile:
            if t not in seen:
                seen[t] = len(seen)
            renum.append(seen[t])
        return renum, "".join(drawn), vorbit
    return None


# ---------------------------------------------------------------- one certificate -> one record
def develop_cert(cert, board_id, board, rho, units):
    blocks, ncombo, reasons = build_block(cert, units)
    if not blocks:
        return None, "glue: " + "; ".join(sorted(set(reasons))[:2]), ncombo
    for block in blocks:
        try:
            cx = sphere_complex(block, rho, board["vef"])
        except DevelopError as e:
            reasons.append(str(e))
            continue
        cx["k"] = cert.get("k")
        cx["board"] = board_id
        cx["config"] = board["label"]
        cx["solid"] = board["solid"]
        cx["stats"]["tileOrbits"] = len(set(block.orbit_of))
        return cx, None, ncombo
    return None, "develop: " + "; ".join(sorted(set(reasons))[:2]), ncombo


# ---------------------------------------------------------------- driver
CERT_NAME = re.compile(r"^(?P<fam>.+)solver_(?P<k>\d+)_(?P<tok>[A-Z0-9]+)(?P<chir>_o)?_(?P<n>\d+)\.txt$")


def load_corpus(source):
    paths = sorted(glob.glob(os.path.join(source, "*.txt"))) if os.path.isdir(source) else [source]
    rows = []
    for path in paths:
        m = CERT_NAME.match(os.path.basename(path))
        if not m:
            continue
        k, chiral = int(m.group("k")), bool(m.group("chir"))
        for cert in fd.parse_file(path):
            rows.append((path, k, chiral, cert))
    return rows


def run(source, board_id, out_prefix, ks=None, report_path=None, limit=None, progress=0):
    board = BOARDS[board_id]
    rho, units = alphabet(board["config"])
    rows = load_corpus(source)
    if ks:
        rows = [r for r in rows if r[1] in ks]
    if limit:
        rows = rows[:limit]

    # One entry per DISTINCT board the corpus develops into (see KNOWN_SOLIDS): the canonical sphere,
    # its identity, and its patterns by k. A corpus is usually one board; `cuboctahedron_edges` is two.
    boards = []
    failures, fail_examples = Counter(), {}
    multi = 0
    t0 = time.time()
    for i, (path, k, chiral, cert) in enumerate(rows):
        if progress and i and i % progress == 0:
            el = time.time() - t0
            print(f"  [{el:6.0f}s] {i}/{len(rows)} developed, {sum(failures.values())} failed, "
                  f"ETA {el * (len(rows) - i) / i:.0f}s", flush=True)
        if cert.get("k") != k:
            failures["certificate k disagrees with the file name"] += 1
            continue
        cx, err, ncombo = develop_cert(cert, board_id, board, rho, units)
        if cx is None:
            key = err.split(":")[0]
            failures[key] += 1
            fail_examples.setdefault(key, err)
            continue
        if ncombo > 1:
            multi += 1
        proj = target = None
        for entry in boards:
            proj = board_project(entry["canon"], cx)
            if proj is not None:
                target = entry
                break
        if proj is None:
            canon = SphEdgeBoard(cx["vertices"], cx["faces"], [(a, b) for a, b, _ in cx["edges"]])
            census = census_key(vertex_figures(canon.vertices, canon.faces))
            # Measured, not inferred: the symmetry orbit count is the only thing separating a uniform
            # solid from a Johnson twin with its vertex figure at every vertex (rhombicuboctahedron vs
            # J37). See KNOWN_SOLIDS.
            sym, gorder = symmetry_orbits(canon.vertices, canon.faces)
            key = (census, len(set(sym)))
            # A named twin keeps its own identity; otherwise the FIRST board a corpus develops into is
            # the one the corpus is named for, and any later one gets a numbered id so it is visible
            # as an unnamed extra instead of silently merging into the headline board.
            fallback = ((board_id, board["solid"], board["label"]) if not boards
                        else (f"{board_id}v{len(boards) + 1}", board["solid"], board["label"]))
            bid, solid, label = KNOWN_SOLIDS.get(key, fallback)
            target = {"canon": canon, "id": bid, "solid": solid, "label": label,
                      "census": census, "symOrbits": len(set(sym)), "gorder": gorder,
                      "by_k": defaultdict(list)}
            boards.append(target)
            proj = board_project(canon, cx)
            if proj is None:
                raise DevelopError(f"{path}: a development does not land on the board it just built")
        face_tile, drawn, vorbit = proj
        target["by_k"][k].append({
            "k": k, "board": target["id"], "config": target["label"], "solid": target["solid"],
            "chiral": chiral, "faceTile": face_tile, "drawn": drawn, "vorbit": vorbit,
            "stats": cx["stats"],
        })
    elapsed = time.time() - t0

    written = []
    for entry in boards:
        canon = entry["canon"]
        for k in sorted(entry["by_k"]):
            recs = entry["by_k"][k]
            for i, r in enumerate(recs, start=1):
                r["id"] = f"xe{entry['id']}-{k}-{i:05d}"
            if not out_prefix:
                continue
            os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)
            stem = os.path.join(os.path.dirname(out_prefix), f"x{entry['id']}")
            path = f"{stem}-k{k}.json"
            payload = {
                "board": entry["id"],
                "config": entry["label"],
                "solid": entry["solid"],
                "geometry": "spherical",
                "k": k,
                "edge": rho,
                "vertices": [[round(x, 9) for x in v] for v in canon.vertices],
                "faces": [list(f) for f in canon.faces],
                "edges": [list(e) for e in canon.edges],
                "patterns": recs,
            }
            with open(path, "w") as fh:
                json.dump(payload, fh, separators=(",", ":"))
            written.append((path, len(recs), os.path.getsize(path)))
    by_k = defaultdict(list)
    for entry in boards:
        for k, recs in entry["by_k"].items():
            by_k[k].extend(recs)

    lines = [f"spherical edge-system develop — board {board['label']} ({board_id}, {board['solid']})",
             f"source          : {source}",
             f"forced edge arc : rho = {rho:.12f}",
             f"certificates in : {len(rows)}",
             f"developed       : {sum(len(v) for v in by_k.values())}",
             f"failed          : {sum(failures.values())}",
             f"multi-variant   : {multi}",
             f"wall            : {elapsed:.1f}s ({1000 * elapsed / max(1, len(rows)):.1f} ms/certificate)",
             ""]
    for entry in boards:
        c = entry["canon"]
        census = "  ".join(f"{dotted(f)}×{n}" for f, n in entry["census"])
        lines.append(f"board {entry['id']:16s}: {entry['solid']} — V={len(c.vertices)} "
                     f"E={len(c.edges)} F={len(c.faces)}, vertices {census}, "
                     f"|G|={entry['gorder']} in {entry['symOrbits']} vertex orbit(s), "
                     f"{sum(len(v) for v in entry['by_k'].values())} patterns")
    if len(boards) > 1:
        lines.append("NOTE: this corpus develops into more than one polyhedron. The solver enumerates by "
                     "angle closure, so a twin sharing the edge length and the V/E/F comes back in the "
                     "same run; each ships as its own board.")
    lines.append("")
    for reason, n in failures.most_common():
        lines.append(f"   {n:6d}  {reason}   e.g. {fail_examples.get(reason, '')[:110]}")
    lines.append("")
    lines.append(f"{'k':>4} {'tilings':>9} {'tiles: min':>11} {'max':>6}")
    ks_present = sorted(by_k)
    for k in ks_present:
        counts = [r["stats"]["tiles"] for r in by_k[k]]
        lines.append(f"{k:>4} {len(by_k[k]):>9} {min(counts):>11} {max(counts):>6}")
    # A gap in k is a CORPUS fact, not a board fact — say which, instead of letting the shelf present a
    # hole as an enumeration result. On these boards the intermediate zeros are real (Marek's census
    # files confirm them), and k is capped by the polyhedron's vertex count.
    if ks_present:
        missing = [k for k in range(ks_present[0], ks_present[-1] + 1) if k not in by_k]
        if missing:
            lines.append(f"NOTE: no certificates for k = {missing}; check the board's census file "
                         f"before reading these as gaps in the run.")
    for path, n, sz in written:
        lines.append(f"wrote {path}: {n} records, {sz / 1e6:.2f} MB")
    report = "\n".join(lines) + "\n"
    if report_path:
        os.makedirs(os.path.dirname(report_path) or ".", exist_ok=True)
        open(report_path, "w").write(report)
    print(report)
    return by_k, failures


# ---------------------------------------------------------------- selftest
def _selftest():
    for bid, b in BOARDS.items():
        rho, units = alphabet(b["config"])
        s = sum(units[f"A{n}"] for n in b["config"])
        assert abs(s - TWO_PI) < 1e-9, f"{bid} does not close at the solved rho ({s})"
        assert abs(units["A2"]) < 1e-12, f"{bid} digon angle is not 0"
        V, E, F = b["vef"]
        assert V - E + F == 2, f"{bid} declared V/E/F is not Euler-2"
        # Every board vertex has deg(config) edges, and 2E = V·deg.
        assert 2 * E == V * len(b["config"]), f"{bid} declared E disagrees with the vertex figure"
    print(f"[selftest] {len(BOARDS)} boards close, digons are flat, V/E/F consistent")
    assert canon_ring([3, 1, 2]) == (1, 2, 3) and canon_ring([1, 3, 2]) == (1, 2, 3), "canon_ring"
    f = _orthonormal([0, 0, 1], [1, 0, 0])
    assert np.allclose(f, np.eye(3)), "identity frame"
    print("[selftest] PASS")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?", help="certificate directory (or a single .txt)")
    ap.add_argument("--board", default="443", choices=sorted(BOARDS))
    ap.add_argument("--out", help="output prefix; writes <prefix>-k<k>.json")
    ap.add_argument("--report")
    ap.add_argument("--ks", help="comma-separated k values to decode (default: all present)")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--progress", type=int, default=0)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
        return
    if not args.source:
        ap.error("source is required unless --selftest")
    ks = set(int(x) for x in args.ks.split(",")) if args.ks else None
    run(args.source, args.board, args.out, ks, args.report, args.limit, args.progress)


if __name__ == "__main__":
    main()
