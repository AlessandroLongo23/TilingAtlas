#!/usr/bin/env python3
"""Develop Marek Čtrnáct's SCHWARZ-TRIANGLE edge-system certificates on the sphere and in H².

THE OBJECT. The freedraw object on a Schwarz board: a periodic subset of the edges of the (p,q,r)
triangle tiling, with each edge carrying a DIGON whose letter says whether it is drawn (B2/D2/F2) or
not (A2/C2/E2). The tiles are the regions that fall out when triangles are merged across undrawn
edges. `k` counts vertex orbits of the decorated tiling — Marek's "Number of vertices".

WHY IT IS A NEW BACK END. develop_freedraw.py already develops the EUCLIDEAN board (2,3,6) exactly,
in ℤ[ζ₁₂]. Two things stop that path from covering the rest:

  1. Curvature. (2,2,3) (2,2,4) (2,3,3) (2,3,4) (2,3,5) are spherical and (2,3,7) (2,4,5) hyperbolic,
     so there is no period lattice to reduce onto and no cyclotomic ring to develop in. The sphere
     develops to a finite closed complex (SO(3)); H² develops forever and ships DARTS the client
     re-develops under the live view (SU(1,1)), exactly as develop_hyp_edges.py does.
  2. Scalene tiles. Every earlier hyperbolic/spherical developer here assumes ONE edge length ℓ and
     REGULAR faces, so a dart's turn is `interiorAngle(lvert[rneig[h]], ℓ)` and its edge involution
     is the single `medge(ℓ)`. A Schwarz triangle has three angles and three side lengths, so both
     become per-dart: `alpha[h]` from the corner letter, `elen[h]` from the digon letter. That is the
     whole difference, and it is why the shipped hyperbolic records grow `alpha`/`elen`/`drawn`
     arrays (see lib/render/hyperbolicDevelopClient.ts, which prefers them when present and falls
     back to the regular-tiling derivation otherwise, so every existing record is untouched).

Shared with the Euclidean path, imported not copied: fd.parse_file (the Conway certificate parser),
fd.VTable (the site-symmetry fold) and fd.Block (the makeglue port). The board tables — alphabet,
edge classes, edge lengths — come from schwarz_board.py and are checked against each corpus's own
vertex figures before anything develops.

Usage:
    develop_schwarz.py <corpus-dir> --board 235 --out public/schwarz-sph/s235
    develop_schwarz.py <corpus-dir> --board 237 --out public/schwarz-hyp/h237 --report r.txt
    develop_schwarz.py --classify <dir>          # which board does each certificate belong to?
    develop_schwarz.py --selftest
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
from develop_hyperbolic import _heading, _pos, medge, rot
from schwarz_board import (
    BOARDS,
    BoardError,
    DIGON_LETTERS,
    DRAWN_LETTERS,
    alphabet,
    board_label,
    check_corpus,
    edge_lengths,
    geometry_of,
    letter_pairs,
    triangle_count,
)

TWO_PI = 2 * math.pi
TOL = 1e-6       # spherical position dedup grid
HTOL = 1e-4      # hyperbolic position dedup grid (matches develop_hyperbolic.py)
ANGTOL = 1e-3    # hyperbolic heading dedup grid
_ID2 = np.eye(2, dtype=complex)
ZHAT = np.array([0.0, 0.0, 1.0])
XHAT = np.array([1.0, 0.0, 0.0])

TILE_CAP = 400   # base triangles per merged tile before H² calls it unbounded


# ------------------------------------------------------------------ vertex tables (the bridge)
def vtable_variants_sch(figure, tag, units):
    """develop_freedraw.vtable_variants with 30°-unit arithmetic replaced by radians, and the board's
    digon convention (every edge carries one; the letter says whether it is drawn) passed through.

    The rotation order is 2π / Σ(listed angles), NOT the digit in the corner letter — see the note in
    schwarz_board.py about (2,2,3), whose S3 corner sits at a site of rotation order 6."""
    for c in figure:
        if c not in units:
            raise DevelopError(f"letter {c} not in the board alphabet")
    s = sum(units[c] for c in figure)
    if s <= 1e-9:
        raise DevelopError(f"figure {figure} is all digons (zero angle sum)")
    rotf = TWO_PI / s
    rotn = round(rotf)
    if rotn < 1 or abs(rotf - rotn) > 1e-6:
        raise DevelopError(f"figure {figure} angle sum does not divide 2π (rot={rotf:.6f})")
    t = len(figure)
    m = re.fullmatch(r"(F|C\d+|A[a-z0-9]*|D\d+[a-z]?)(x\d+)?", tag or "F")
    if not m:
        raise DevelopError(f"unrecognised site tag {tag!r}")
    head = m.group(1)
    kw = {"digons": DIGON_LETTERS, "drawn_letters": DRAWN_LETTERS}
    if head == "F" or head.startswith("C"):
        if head.startswith("C") and int(head[1:]) != rotn:
            raise DevelopError(f"tag {tag} order != rotation order {rotn}")
        return [fd.VTable(figure, units, chiral=True, **kw)]
    if head.startswith("D") and int(re.match(r"D(\d+)", head).group(1)) != 2 * rotn:
        raise DevelopError(f"tag {tag} order != 2 × rotation order {rotn}")
    axes = [a for a in range(t) if all(figure[s2] == figure[(a - s2 - 1) % t] for s2 in range(t))]
    if not axes:
        raise DevelopError(f"tag {tag} claims a mirror but figure {figure} admits none")
    return [fd.VTable(figure, units, chiral=False, axis=a, **kw) for a in axes]


def build_blocks(cert, units, lens):
    """Every table-variant block that survives glue construction, each carrying `elen` — the length of
    each dart's edge, read off the digon letter beside it. A dart and its glue partner must agree."""
    variant_lists = [vtable_variants_sch(t["figure"], t["tag"], units) for t in cert["types"]]
    combos = [[]]
    for vl in variant_lists:
        combos = [c + [v] for c in combos for v in vl]
    out, reasons = [], []
    for tables in combos:
        try:
            block = fd.Block(cert, tables, "sch")
            attach_edge_lengths(block, lens)
            out.append(block)
        except DevelopError as e:
            reasons.append(str(e))
    return out, len(combos), reasons


def attach_edge_lengths(block, lens):
    """block.eclass[h] / block.elen[h] = the digon letter naming dart h's edge class, and its length. A
    dart lies between the corners tile[lneig[h]] and tile[h]; on this board exactly one of them is the
    digon naming the edge class."""
    n = len(block.rneig)
    eclass = [""] * n
    elen = [0.0] * n
    for h in range(n):
        cand = [c for c in (block.tile[h], block.tile[block.lneig[h]]) if c in lens]
        if len(cand) != 1:
            raise DevelopError(f"dart {h} has {len(cand)} edge-class digons, want exactly 1")
        eclass[h] = cand[0]
        elen[h] = lens[cand[0]]
    for h in range(n):
        if abs(elen[h] - elen[block.glue[h]]) > 1e-12:
            raise DevelopError("glued darts disagree on edge length")
    block.eclass = eclass
    block.elen = elen


def vertex_letter(block, h):
    """The corner letter of the VERTEX dart h sits at. Corners and digons alternate around a vertex, so
    it is tile[h] when that is a corner and tile[rneig[h]] when h is a digon side."""
    c = block.tile[h]
    return c if c.startswith("S") else block.tile[block.rneig[h]]


# ------------------------------------------------------------------ quotient faces + tile orbits
def quotient_faces(block, corners):
    """Cycles of nxt(h) = glue[rneig[h]] — the faces of the quotient complex, each a Schwarz TRIANGLE
    or a DIGON. Unlike the regular-tiling version in develop_hyp_edges.py the corner letters VARY
    along a triangle (that is what "scalene" means here), so what is asserted is the shape: a triangle
    cycle carries the board's own three corner letters — as a MULTISET, since the isoceles boards
    repeat one (a (2,2,3) triangle is S2, S2, S3) — and never folds, folding needing an equilateral
    tile that no board here has. A digon cycle carries one digon letter and folds by 1 or 2.

    `corners` is that multiset, sorted: ["S2", "S2", "S3"] for (2,2,3)."""
    n = len(block.rneig)
    face_of = [-1] * n
    faces = []
    for h0 in range(n):
        if face_of[h0] != -1:
            continue
        fid = len(faces)
        darts, h = [], h0
        for _ in range(64):
            face_of[h] = fid
            darts.append(h)
            h = block.glue[block.rneig[h]]
            if h == h0:
                break
        else:
            raise DevelopError("quotient face walk did not close")
        letters = [block.tile[x] for x in darts]
        digon = [c in DIGON_LETTERS for c in letters]
        if all(digon):
            if len(set(letters)) != 1:
                raise DevelopError(f"digon face mixes letters {set(letters)}")
            if len(darts) not in (1, 2):
                raise DevelopError(f"digon face has {len(darts)} darts")
            faces.append({"darts": darts, "kind": "digon", "letter": letters[0]})
        elif any(digon):
            raise DevelopError("face walk mixes corners and digons")
        else:
            if len(darts) != 3 or sorted(letters) != corners:
                raise DevelopError(
                    f"triangle face has darts={len(darts)} letters={sorted(letters)}, want {corners}")
            faces.append({"darts": darts, "kind": "tri", "letter": None})
    return face_of, faces


def _neighbour_dart(block, e):
    """The dart of the face on the FAR side of edge-dart `e`. `e` is an edge of the face containing
    lneig[e]; its co-dart glue[e] is an edge of the face containing lneig[glue[e]], which is what this
    returns. (develop_hyp_edges.py's `other` step, named.)"""
    return block.lneig[block.glue[e]]


def _digon_hop(block, face_of, faces, e):
    """Cross edge-dart `e` out of a triangle, through the digon that sits on every edge of this board,
    and out its far side: returns the far triangle's edge-dart, i.e. the `e2` whose neighbour dart
    lands on the triangle beyond.

    Two steps, because a Schwarz edge is TWO tiling edges with a zero-area digon between them:
        d  = the digon member dart the crossing lands on
        d2 = the digon's next dart (its face walk; d2 == d when the digon folds onto itself, which
             is exactly when the two triangles across the edge are one quotient face)
        e2 = d2's edge — the digon's far side."""
    d = _neighbour_dart(block, e)
    if faces[face_of[d]]["kind"] != "digon":
        raise DevelopError("an edge does not carry a digon")
    d2 = block.glue[block.rneig[d]]
    if face_of[d2] != face_of[d]:
        raise DevelopError("the digon face walk left the digon")
    return block.rneig[d2]


def _across(block, face_of, faces, e):
    """The quotient face on the far side of edge-dart `e`, hopping its digon."""
    return face_of[_neighbour_dart(block, _digon_hop(block, face_of, faces, e))]


def tile_orbits(block, face_of, faces):
    """Merge triangles across UNDRAWN edges. Returns (orbit per face, count); digons get -1."""
    parent = list(range(len(faces)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    for fid, f in enumerate(faces):
        if f["kind"] != "tri":
            continue
        for h in f["darts"]:
            e = block.rneig[h]
            if block.drawn[e]:
                continue
            other = _across(block, face_of, faces, e)
            if faces[other]["kind"] != "tri":
                raise DevelopError("undrawn edge does not lead to a triangle")
            union(fid, other)
    roots = {}
    orbit = [-1] * len(faces)
    for fid, f in enumerate(faces):
        if f["kind"] != "tri":
            continue
        r = find(fid)
        if r not in roots:
            roots[r] = len(roots)
        orbit[fid] = roots[r]
    return orbit, len(roots)


# ------------------------------------------------------------------ spherical develop (SO(3))
def Rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def Medge_sph(rho):
    """Half-turn about the edge midpoint: Ry(ρ)·Rz(π). Moves the frame's vertex a distance ρ along its
    heading and turns it round to face back — the SO(3) twin of medge(ℓ) in SU(1,1)."""
    c, s = math.cos(rho), math.sin(rho)
    return np.array([[-c, 0.0, s], [0.0, -1.0, 0.0], [s, 0.0, c]])


def _key_pos(v):
    return (round(v[0] / TOL), round(v[1] / TOL), round(v[2] / TOL))


def _key_inst(h, R):
    pos = R @ ZHAT
    hx = R @ XHAT
    return (h, round(pos[0] / TOL), round(pos[1] / TOL), round(pos[2] / TOL),
            round(hx[0] / TOL), round(hx[1] / TOL), round(hx[2] / TOL))


def develop_sphere(block, sign=1, guard=8000):
    """Flood-fill the instance orbit under {rneig, glue} in SO(3). `sign` flips the turn direction —
    a certificate's chirality is not in the combinatorics, so both are tried and the one that closes
    to a sphere wins. Returns (verts, inst, rn, gl) with inst[i] = (dart, R, vertex id)."""
    n = len(block.rneig)
    Meds = {}

    def M(h):
        key = round(block.elen[h], 12)
        if key not in Meds:
            Meds[key] = Medge_sph(block.elen[h])
        return Meds[key]

    inst_id = {}
    inst = []
    rn, gl = [], []
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
    stack = [seed]
    pops = 0
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
        gidx, isnew = get_inst(block.glue[h], R @ M(h))
        gl[idx] = gidx
        if isnew:
            stack.append(gidx)
    return verts, inst, rn, gl


def sphere_complex(block, pqr, lens):
    """Develop the board on S² and read off the finished complex: unit vertices, triangle rings,
    per-triangle merged-tile orbit, and the edge list with drawn flags."""
    last = None
    for sign in (1, -1):
        try:
            verts, inst, rn, gl = develop_sphere(block, sign=sign)
            return _sphere_emit(block, pqr, lens, verts, inst, rn, gl)
        except DevelopError as e:
            last = e
    raise last


def _sphere_emit(block, pqr, lens, verts, inst, rn, gl):
    # Faces: walk nxt(i) = gl[rn[i]] over the developed instances. Rings of 3 are triangles, rings of
    # 2 are the digons that mark every edge.
    tris, seen = [], set()
    tri_seed = []
    for start in range(len(inst)):
        if start in seen:
            continue
        ring, members, idx = [], [], start
        ok = False
        for _ in range(8):
            members.append(idx)
            ring.append(inst[idx][2])
            nxt = gl[rn[idx]]
            idx = nxt
            if idx == start:
                ok = True
                break
        if not ok:
            raise DevelopError("developed face did not close")
        for m in members:
            seen.add(m)
        if len(ring) == 3:
            tris.append(ring)
            tri_seed.append(members[0])
        elif len(ring) != 2:
            raise DevelopError(f"developed face has {len(ring)} corners")

    # Edges: one per glued instance pair, with the drawn bit off the dart. Both digon sides trace the
    # same segment, so the undirected vertex pair dedups them.
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

    ntri = triangle_count(pqr)
    if len(tris) != ntri:
        raise DevelopError(f"developed {len(tris)} triangles, board has {ntri}")
    if len(verts) - len(edges) + len(tris) != 2:
        raise DevelopError(f"Euler != 2 (V={len(verts)} E={len(edges)} F={len(tris)})")

    # Merged tiles: flood the developed triangles across undrawn edges. Doing it on the finished
    # sphere rather than in the quotient means the tile count is the REAL one, not an orbit count.
    face_of_edge = defaultdict(list)
    for fi, ring in enumerate(tris):
        for a in range(3):
            u, v = ring[a], ring[(a + 1) % 3]
            face_of_edge[(min(u, v), max(u, v))].append(fi)
    parent = list(range(len(tris)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for key, fs in face_of_edge.items():
        if len(fs) != 2:
            raise DevelopError(f"edge {key} borders {len(fs)} triangles")
        if edges.get(key, True):
            continue
        a, b = find(fs[0]), find(fs[1])
        if a != b:
            parent[max(a, b)] = min(a, b)
    roots, tile_of = {}, []
    for fi in range(len(tris)):
        r = find(fi)
        if r not in roots:
            roots[r] = len(roots)
        tile_of.append(roots[r])

    # Every developed side must measure as its class length — the check that the per-dart edge table
    # was applied, not merely carried.
    want = sorted(round(v, 9) for v in set(lens.values()))
    for (a, b) in edges:
        d = math.acos(max(-1.0, min(1.0, float(np.dot(verts[a], verts[b])))))
        if min(abs(d - w) for w in want) > 1e-6:
            raise DevelopError(f"developed edge length {d:.9f} is not a class length {want}")

    tile_sizes = Counter(tile_of)
    return {
        "align": _align_matrix(block, inst),
        "vertices": [[float(x) for x in v] for v in verts],
        "faces": [list(map(int, r)) for r in tris],
        "faceTile": [int(t) for t in tile_of],
        "edges": [[int(a), int(b), 1 if edges[(a, b)] else 0] for (a, b) in sorted(edges)],
        "vorbit": _vertex_orbits(block, inst, verts),
        "stats": {
            "tiles": len(roots),
            "tileSizes": sorted(tile_sizes.values(), reverse=True),
            "triangles": len(tris),
            "verts": len(verts),
            "edges": len(edges),
            "drawnEdges": sum(1 for v in edges.values() if v),
        },
    }


# ------------------------------------------------------------------ the shared board
# EVERY pattern on one board develops the SAME sphere — the (p,q,r) triangle tiling is fixed, and a
# decoration only says which of its edges are drawn. What differs between two developments is where the
# seed flag landed and the BFS order the vertices came out in, so the geometry is congruent but neither
# aligned nor indexed alike.
#
# That matters at this scale: 224 reaches 61,914 tilings at k=10 and 233 45,580 at k=7, and shipping the
# 16 (resp. 24) triangles with each of them cost 74 MB and 78 MB for those two slices alone. Aligning
# every development onto one canonical board lets a shard carry the board ONCE in its header and each
# pattern only its drawn bits and tile ids — the same 74 MB slice becomes a few MB.
#
# The alignment is exact, not fitted. A developed instance is a FLAG (vertex, edge, side); the board's
# symmetry group is transitive on flags of a given (corner letter, edge class); so mapping any one such
# flag to the identity frame maps the whole board onto itself. `_align_matrix` picks that flag by a rule
# that reads only the certificate's letters, and `SphBoard.absorb` asserts the result lands on the
# canonical vertex set rather than trusting it.


def _align_matrix(block, inst):
    """Rᵣₑբ⁻¹ for the canonical reference flag: the lowest-numbered corner letter, then the first edge
    class at it. Applying it puts that flag at (ẑ, x̂), which is where the canonical board has it."""
    def key(i):
        h = inst[i][0]
        return (int(vertex_letter(block, h)[1:]), block.eclass[h], i)

    ref = min(range(len(inst)), key=key)
    return inst[ref][1].T  # a rotation's inverse is its transpose


# The one reflection that fixes the reference flag (the xz-plane mirror). A development that came out
# with the opposite handedness — develop_sphere's sign = −1 — is the board's mirror image, congruent to
# it but not by a rotation, so the alignment gets one extra candidate rather than a special case.
_YFLIP = np.diag([1.0, -1.0, 1.0])

_VTOL = 1e-6


class SphBoard:
    """The canonical developed (p,q,r) sphere, in a fixed vertex / triangle / edge order.

    Built from the first pattern that develops, then every later pattern is mapped ONTO it. Vertices are
    ordered by rounded position, triangles by their sorted vertex triple and edges likewise, so the order
    is a function of the point set alone — nothing about the certificate that happened to build it."""

    def __init__(self, verts, tris, edges):
        order = sorted(range(len(verts)), key=lambda i: tuple(round(float(x), 7) for x in verts[i]))
        remap = {old: new for new, old in enumerate(order)}
        self.vertices = [[float(x) for x in verts[i]] for i in order]
        self.faces = sorted(tuple(sorted(remap[v] for v in ring)) for ring in tris)
        self.edges = sorted((remap[a], remap[b]) if remap[a] < remap[b] else (remap[b], remap[a])
                            for (a, b) in edges)
        self.face_index = {f: i for i, f in enumerate(self.faces)}
        self.edge_index = {e: i for i, e in enumerate(self.edges)}
        if len(self.face_index) != len(self.faces) or len(self.edge_index) != len(self.edges):
            raise DevelopError("the canonical board has a repeated triangle or edge")

    def match(self, verts, align):
        """Vertex index map from a development (under `align`) onto this board, or None if it does not
        land — which is how the mirrored development is detected and retried."""
        out = []
        for v in verts:
            p = align @ np.asarray(v)
            best, bd = -1, 1e9
            for i, c in enumerate(self.vertices):
                d = abs(p[0] - c[0]) + abs(p[1] - c[1]) + abs(p[2] - c[2])
                if d < bd:
                    best, bd = i, d
            if bd > _VTOL:
                return None
            out.append(best)
        if len(set(out)) != len(self.vertices):
            return None
        return out


def board_project(board, cx):
    """Re-express one development against the canonical board: which canonical triangle carries which
    merged tile, and which canonical edges are drawn. Returns (faceTile, drawn-string, vorbit) or None
    when the development does not land on the board (never seen; the caller raises)."""
    for extra in (np.eye(3), _YFLIP):
        vmap = board.match(cx["vertices"], extra @ np.asarray(cx["align"]))
        if vmap is None:
            continue
        face_tile = [0] * len(board.faces)
        for ring, t in zip(cx["faces"], cx["faceTile"]):
            key = tuple(sorted(vmap[v] for v in ring))
            face_tile[board.face_index[key]] = int(t)
        drawn = ["0"] * len(board.edges)
        for a, b, d in cx["edges"]:
            u, w = vmap[a], vmap[b]
            drawn[board.edge_index[(u, w) if u < w else (w, u)]] = "1" if d else "0"
        vorbit = [0] * len(board.vertices)
        for i, o in enumerate(cx["vorbit"]):
            vorbit[vmap[i]] = int(o)
        # Renumber tiles by first canonical triangle, so two records that describe the same tiling
        # describe it identically.
        seen, renum = {}, []
        for t in face_tile:
            if t not in seen:
                seen[t] = len(seen)
            renum.append(seen[t])
        return renum, "".join(drawn), vorbit
    return None


def _vertex_orbits(block, inst, verts):
    """Certificate vertex-orbit label per developed vertex — the spherical twin of the patch's
    `vorbit`. Every instance sitting on a vertex must report the same orbit."""
    out = [-1] * len(verts)
    for (h, R, v) in inst:
        o = block.orbit_of[h]
        if out[v] not in (-1, o):
            raise DevelopError("a vertex hosts two certificate orbits")
        out[v] = o
    if -1 in out:
        raise DevelopError("a developed vertex was never labelled")
    return [int(x) for x in out]


# ------------------------------------------------------------------ hyperbolic develop (SU(1,1))
def develop_patch_hyp(block, boundR=0.86, guard=200000):
    """Flood-fill the instance orbit in the Poincaré disk, per-dart edge involution. Used to VALIDATE
    a certificate (the shipped record is the quotient darts, re-developed by the client)."""
    Meds = {}

    def M(h):
        key = round(block.elen[h], 12)
        if key not in Meds:
            Meds[key] = medge(block.elen[h])
        return Meds[key]

    inst_id = {}
    H, Gs, VID, RN, GL = [], [], [], [], []
    vert_id, verts = {}, []

    def vid_of(G):
        z = _pos(G)
        key = (round(z.real / HTOL), round(z.imag / HTOL))
        if key not in vert_id:
            vert_id[key] = len(verts)
            verts.append((z.real, z.imag))
        return vert_id[key]

    def add_inst(h, G):
        z, th = _pos(G), _heading(G)
        key = (h, round(z.real / HTOL), round(z.imag / HTOL),
               round(math.cos(th) / ANGTOL), round(math.sin(th) / ANGTOL))
        if key in inst_id:
            return inst_id[key], False
        idx = len(H)
        inst_id[key] = idx
        H.append(h); Gs.append(G); VID.append(vid_of(G)); RN.append(-1); GL.append(-1)
        return idx, True

    seed, _ = add_inst(0, _ID2.copy())
    stack, pops = [seed], 0
    while stack:
        pops += 1
        if pops > guard:
            raise DevelopError("patch exceeded guard")
        idx = stack.pop()
        h, G = H[idx], Gs[idx]
        if abs(_pos(G)) > boundR:
            continue
        ridx, isnew = add_inst(block.rneig[h], G @ rot(block.step[h]))
        RN[idx] = ridx
        if isnew:
            stack.append(ridx)
        gidx, isnew = add_inst(block.glue[h], G @ M(h))
        GL[idx] = gidx
        if isnew:
            stack.append(gidx)

    E = {}
    for i in range(len(H)):
        g = GL[i]
        if g >= 0 and VID[i] != VID[g]:
            key = (min(VID[i], VID[g]), max(VID[i], VID[g]))
            val = (bool(block.drawn[H[i]]), block.elen[H[i]])
            prev = E.get(key)
            if prev is not None and (prev[0] != val[0] or abs(prev[1] - val[1]) > 1e-12):
                raise DevelopError("the darts on one edge disagree on drawn flag or length")
            E[key] = val

    F, seen = [], set()
    for start in range(len(H)):
        ring, idx, ok = [], start, False
        for _ in range(8):
            ring.append(VID[idx])
            r = RN[idx]
            nxt = GL[r] if r >= 0 else -1
            if nxt < 0:
                break
            idx = nxt
            if idx == start:
                ok = True
                break
        if not ok or len(ring) < 3:
            continue
        canon = min(tuple(ring[i:] + ring[:i]) for i in range(len(ring)))
        if canon in seen:
            continue
        seen.add(canon)
        F.append(ring)
    return verts, E, F


def hdist(u, v):
    num = abs(u - v) ** 2
    den = (1 - abs(u) ** 2) * (1 - abs(v) ** 2)
    return math.acosh(1 + 2 * num / den) if den > 1e-15 else 0.0


def check_patch_hyp(verts, E, F, pqr, lens, tol=1e-3):
    """Every developed edge measures its own class length, every developed face is a triangle whose
    three sides are the board's three (so the angles are right too), and the patch is in the disk."""
    V = [complex(x, y) for (x, y) in verts]
    if not E:
        return False, {"error": "no edges"}
    worst_edge = 0.0
    for (a, b), (_, want) in E.items():
        worst_edge = max(worst_edge, abs(hdist(V[a], V[b]) - want))
    want_sides = sorted(round(side, 9) for side in
                        (lens[c] for c in ("A2", "C2", "E2") if c in lens))
    worst_face = 0.0
    bad_face = 0
    for ring in F:
        if len(ring) != 3:
            bad_face += 1
            continue
        got = sorted(round(hdist(V[ring[i]], V[ring[(i + 1) % 3]]), 9) for i in range(3))
        worst_face = max(worst_face, max(abs(g - w) for g, w in zip(got, want_sides)))
    res = {"edgeErr": worst_edge, "faceErr": worst_face, "nonTriangles": bad_face,
           "inDisk": max(abs(z) for z in V) < 1.0,
           "verts": len(verts), "edges": len(E), "faces": len(F)}
    ok = worst_edge < tol and worst_face < tol and bad_face == 0 and res["inDisk"]
    return ok, res


def _face_step_frame(block, h, G, M):
    """One step of the face walk from dart h: turn through h's corner, cross h's own edge, land on
    the next dart of the SAME face. (nxt(h) = glue[rneig[h]] with the frame carried along.)"""
    e = block.rneig[h]
    return block.glue[e], G @ rot(block.step[h]) @ M(e)


def _hop_frame(block, h, G, M):
    """Cross OUT of h's face over its edge rneig[h] and re-anchor on the neighbouring face's dart."""
    e = block.rneig[h]
    m = _neighbour_dart(block, e)
    return m, G @ rot(block.step[h]) @ M(e) @ rot(-block.step[m])


def classify_tiles_hyp(block, face_of, faces, orbit, norbits, cap=TILE_CAP):
    """Flood each merged-tile orbit in the disk to decide FINITE vs unbounded, and count its
    triangles. Same contract as develop_hyp_edges.classify_tiles, with the per-dart edge involution
    and the digon hop (a triangle's neighbour across an undrawn edge is two steps away, not one)."""
    Meds = {}

    def M(h):
        key = round(block.elen[h], 12)
        if key not in Meds:
            Meds[key] = medge(block.elen[h])
        return Meds[key]

    def fkey(h, G):
        z, th = _pos(G), _heading(G)
        return (h, round(z.real / HTOL), round(z.imag / HTOL),
                round(math.cos(th) / ANGTOL), round(math.sin(th) / ANGTOL))

    out = []
    for o in range(norbits):
        seed_face = next(f for f in range(len(faces)) if orbit[f] == o)
        h0 = faces[seed_face]["darts"][0]
        inst_face = set()
        stack = [(h0, _ID2.copy())]
        capped = False
        while stack:
            h, G = stack.pop()
            members, cur, Gc = [], h, G
            start = fkey(h, G)
            for _ in range(8):
                members.append((cur, Gc))
                Gc = Gc @ rot(block.step[cur]) @ M(block.rneig[cur])
                cur = block.glue[block.rneig[cur]]
                if fkey(cur, Gc) == start:
                    break
            else:
                raise DevelopError("tile face walk did not close")
            keys = [fkey(hi, Gi) for (hi, Gi) in members]
            if min(keys) in inst_face:
                continue
            inst_face.add(min(keys))
            if len(inst_face) > cap:
                capped = True
                break
            for (hi, Gi) in members:
                e = block.rneig[hi]
                if block.drawn[e]:
                    continue
                # Cross into the digon, walk its one face step, and cross out the far side — the
                # frame twin of _digon_hop, so the quotient merge and the developed flood agree.
                d, Gd = _hop_frame(block, hi, Gi, M)
                d2, Gd2 = _face_step_frame(block, d, Gd, M)
                m, Gm = _hop_frame(block, d2, Gd2, M)
                stack.append((m, Gm))
        out.append(-1 if capped else len(inst_face))
    return out


def emit_darts(block, face_of, faces, orbit):
    """The shipped quotient structure. `alpha`/`elen`/`drawn` are what make it scalene-ready: the
    client cannot derive any of the three from polygon sizes on this board (every face is a triangle,
    every edge carries a digon), so all three are explicit."""
    n = len(block.rneig)
    lvert = [0] * n
    for h in range(n):
        lvert[block.rneig[h]] = 2 if block.tile[h] in DIGON_LETTERS else 3
    tile_orbit = [int(orbit[face_of[h]]) for h in range(n)]
    return {
        "rneig": [int(x) for x in block.rneig],
        "glue": [int(x) for x in block.glue],
        "lvert": lvert,
        "orbit": [int(x) for x in block.orbit_of],
        "tileOrbit": tile_orbit,
        "alpha": [float(x) for x in block.step],
        "elen": [float(x) for x in block.elen],
        "drawn": [1 if x else 0 for x in block.drawn],
        "seed": 0,
    }


# ------------------------------------------------------------------ one certificate -> one record
def develop_cert(cert, board_id, units, lens, cap=TILE_CAP):
    pqr = BOARDS[board_id]
    geo = geometry_of(pqr)
    blocks, ncombo, reasons = build_blocks(cert, units, lens)
    if not blocks:
        return None, "glue: " + "; ".join(sorted(set(reasons))[:2]), ncombo
    corners = sorted(f"S{n}" for n in pqr)
    for block in blocks:
        try:
            face_of, faces = quotient_faces(block, corners)
            orbit, norbits = tile_orbits(block, face_of, faces)
            n_edges = len(block.rneig) // 2
            n_drawn = sum(1 for h in range(len(block.rneig)) if block.drawn[h]) // 2
            base = {
                "k": cert.get("k"),
                "board": board_id,
                "label": board_label(board_id),
                "geometry": geo,
            }
            if geo == "spherical":
                cx = sphere_complex(block, pqr, lens)
                rec = {**base, **cx}
                rec["stats"]["tileOrbits"] = norbits
                rec["stats"]["edgeOrbits"] = n_edges
                rec["stats"]["drawnEdgeOrbits"] = n_drawn
                return rec, None, ncombo
            if geo == "hyperbolic":
                verts, E, F = develop_patch_hyp(block)
                ok, res = check_patch_hyp(verts, E, F, pqr, lens)
                if not ok:
                    reasons.append("patch not Schwarz: %r" % res)
                    continue
                sizes = classify_tiles_hyp(block, face_of, faces, orbit, norbits, cap=cap)
                rec = {
                    **base,
                    "edges": sorted(round(lens[c], 12) for c in ("A2", "C2", "E2") if c in lens),
                    "tiles": res["faces"],
                    "darts": emit_darts(block, face_of, faces, orbit),
                    "stats": {
                        "tileOrbits": norbits,
                        "finite": sum(1 for s in sizes if s >= 0),
                        "unbounded": sum(1 for s in sizes if s < 0),
                        "sizes": sizes,
                        "edgeOrbits": n_edges,
                        "drawnEdgeOrbits": n_drawn,
                    },
                    "residual": {"edgeErr": res["edgeErr"], "faceErr": res["faceErr"]},
                }
                return rec, None, ncombo
            raise DevelopError("the Euclidean boards develop in develop_freedraw.py, not here")
        except DevelopError as e:
            reasons.append(str(e))
    return None, "develop: " + "; ".join(sorted(set(reasons))[:2]), ncombo


# ------------------------------------------------------------------ driver
CERT_NAME = re.compile(r"^(?P<fam>.+)solver_(?P<k>\d+)_(?P<tok>[A-Z0-9]+)(?P<chir>_o)?_(?P<n>\d+)\.txt$")
ID_PREFIX = {"spherical": "ss", "hyperbolic": "hs", "euclidean": "es"}


def load_corpus(source):
    """[(path, k, chiral, cert)] over a directory of certificate files (or one file)."""
    paths = sorted(glob.glob(os.path.join(source, "*.txt"))) if os.path.isdir(source) else [source]
    out = []
    for path in paths:
        m = CERT_NAME.match(os.path.basename(path))
        if not m:
            continue
        k = int(m.group("k"))
        chiral = bool(m.group("chir"))
        for cert in fd.parse_file(path):
            out.append((path, k, chiral, cert))
    return out


def classify(source):
    """Which board does each certificate file belong to? Marek's 237 drop puts (2,3,3) certificates in
    a folder named 236, so the folder name is not evidence — the alphabet is."""
    rows = load_corpus(source)
    by_file = defaultdict(list)
    for path, _, _, cert in rows:
        by_file[path].append(cert)
    out = {}
    for path, certs in sorted(by_file.items()):
        hits = []
        for bid, pqr in BOARDS.items():
            try:
                check_corpus(pqr, certs)
                hits.append(bid)
            except (BoardError, DevelopError):
                pass
        out[path] = hits
    return out


def run(source, board_id, out_prefix, ks=None, report_path=None, limit=None, cap=TILE_CAP,
        progress=0):
    pqr = BOARDS[board_id]
    geo = geometry_of(pqr)
    units = alphabet(pqr)
    lens = edge_lengths(pqr)
    rows = load_corpus(source)
    if ks:
        rows = [r for r in rows if r[1] in ks]
    if limit:
        rows = rows[:limit]
    check_corpus(pqr, [c for (_, _, _, c) in rows])

    by_k = defaultdict(list)
    failures = Counter()
    fail_examples = {}
    multi = 0
    board = None      # spherical only: the shared canonical sphere, built from the first development
    t0 = time.time()
    for i, (path, k, chiral, cert) in enumerate(rows):
        if progress and i and i % progress == 0:
            el = time.time() - t0
            eta = el * (len(rows) - i) / i
            print(f"  [{el:6.0f}s] {i}/{len(rows)} developed, "
                  f"{sum(failures.values())} failed, ETA {eta:.0f}s", flush=True)
        if cert.get("k") != k:
            failures["certificate k disagrees with the file name"] += 1
            continue
        rec, err, ncombo = develop_cert(cert, board_id, units, lens, cap=cap)
        if rec is None:
            key = err.split(":")[0]
            failures[key] += 1
            fail_examples.setdefault(key, err)
            continue
        if ncombo > 1:
            multi += 1
        rec["chiral"] = chiral
        if geo == "spherical":
            if board is None:
                al = np.asarray(rec["align"])
                board = SphBoard([al @ np.asarray(v) for v in rec["vertices"]],
                                 rec["faces"], [(a, b) for a, b, _ in rec["edges"]])
            proj = board_project(board, rec)
            if proj is None:
                # Not a soft failure: two developments of one board that do not land on each other
                # would mean the board is not what this file says it is.
                raise DevelopError(f"{path}: development does not land on the {board_id} board")
            face_tile, drawn, vorbit = proj
            rec = {kk: rec[kk] for kk in ("k", "board", "label", "geometry", "chiral", "stats")}
            rec["faceTile"] = face_tile
            rec["drawn"] = drawn
            rec["vorbit"] = vorbit
        by_k[k].append(rec)
    elapsed = time.time() - t0

    written = []
    prefix = ID_PREFIX[geo]
    for k in sorted(by_k):
        recs = by_k[k]
        for i, r in enumerate(recs, start=1):
            r["id"] = f"{prefix}{board_id}-{k}-{i:05d}"
        if out_prefix:
            os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)
            path = f"{out_prefix}-k{k}.json"
            if geo == "spherical":
                # The board once per shard, the patterns as drawn-bits + tile ids against it.
                payload = {
                    "board": board_id,
                    "label": board_label(board_id),
                    "geometry": geo,
                    "k": k,
                    "vertices": [[round(x, 9) for x in v] for v in board.vertices],
                    "faces": [list(f) for f in board.faces],
                    "edges": [list(e) for e in board.edges],
                    "patterns": recs,
                }
            else:
                payload = recs
            with open(path, "w") as fh:
                json.dump(payload, fh, separators=(",", ":"))
            written.append((path, len(recs), os.path.getsize(path)))

    lines = [f"Schwarz edge-system develop — board {board_label(board_id)} ({board_id}, {geo})",
             f"source          : {source}",
             f"edge lengths    : " + ", ".join(f"{c}={lens[c]:.9f}" for c in ("A2", "C2", "E2") if c in lens),
             f"certificates in : {len(rows)}",
             f"developed       : {sum(len(v) for v in by_k.values())}",
             f"failed          : {sum(failures.values())}",
             f"multi-variant   : {multi}",
             f"wall            : {elapsed:.1f}s ({1000*elapsed/max(1,len(rows)):.1f} ms/certificate)",
             ""]
    if board is not None:
        lines.append(f"shared board    : V={len(board.vertices)} E={len(board.edges)} "
                     f"F={len(board.faces)} (every pattern lands on it)")
        lines.append("")
    for reason, n in failures.most_common():
        lines.append(f"   {n:6d}  {reason}   e.g. {fail_examples.get(reason,'')[:110]}")
    lines.append("")
    lines.append(f"{'k':>4} {'tilings':>9} {'tiles: min':>11} {'max':>6}")
    ks_present = sorted(by_k)
    for k in ks_present:
        recs = by_k[k]
        counts = [r["stats"].get("tiles", r["stats"]["tileOrbits"]) for r in recs]
        lines.append(f"{k:>4} {len(recs):>9} {min(counts):>11} {max(counts):>6}")
    # A gap in k is a CORPUS gap, not a fact about the board — say so rather than letting the shelf
    # present a hole as an enumeration result.
    if ks_present:
        missing = [k for k in range(ks_present[0], ks_present[-1] + 1) if k not in by_k]
        if missing:
            lines.append(f"NOTE: k coverage is non-contiguous — no certificates for k = {missing}. "
                         f"This is a gap in Marek's run, not an empty slice of the board.")
    for path, n, sz in written:
        lines.append(f"wrote {path}: {n} records, {sz/1e6:.2f} MB")
    report = "\n".join(lines) + "\n"
    if report_path:
        os.makedirs(os.path.dirname(report_path) or ".", exist_ok=True)
        open(report_path, "w").write(report)
    print(report)
    return by_k, failures


def _selftest():
    import schwarz_board
    schwarz_board._selftest()
    # The digon angle is 0 on every board, so a digon never turns the frame.
    for bid in BOARDS:
        u = alphabet(BOARDS[bid])
        assert all(u[c] == 0.0 for c in DIGON_LETTERS), bid
    # The bare (2,3,4) board: one certificate per corner, all edges undrawn, must develop to the 48
    # triangles of the disdyakis dodecahedron with one merged tile (nothing drawn = one region).
    fixtures = os.environ.get("SCHWARZ_FIXTURES")
    if fixtures and os.path.isdir(fixtures):
        for bid in sorted(os.listdir(fixtures)):
            d = os.path.join(fixtures, bid)
            if not os.path.isdir(d) or bid not in BOARDS:
                continue
            pqr = BOARDS[bid]
            if geometry_of(pqr) != "spherical":
                continue
            units, lens = alphabet(pqr), edge_lengths(pqr)
            rows = load_corpus(d)
            bare = [c for (_, _, _, c) in rows
                    if all(x not in DRAWN_LETTERS for t in c["types"] for x in t["figure"])]
            assert bare, f"{bid}: no nothing-drawn certificate"
            rec, err, _ = develop_cert(bare[0], bid, units, lens)
            assert rec, f"{bid}: bare board failed — {err}"
            assert rec["stats"]["tiles"] == 1, f"{bid}: bare board has {rec['stats']['tiles']} tiles"
            assert rec["stats"]["triangles"] == triangle_count(pqr), bid
            print(f"[selftest] {bid}: bare board develops to {rec['stats']['triangles']} triangles, 1 tile")
    else:
        print("[selftest] (set SCHWARZ_FIXTURES=<dir of <board>/ corpora> for the develop checks)")
    print("[selftest] develop_schwarz PASS")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?")
    ap.add_argument("--board", choices=sorted(BOARDS))
    ap.add_argument("--out")
    ap.add_argument("--report")
    ap.add_argument("--ks")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--cap", type=int, default=TILE_CAP)
    ap.add_argument("--progress", type=int, default=0)
    ap.add_argument("--classify", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
        return
    if not args.source:
        ap.error("source is required unless --selftest")
    if args.classify:
        for path, hits in classify(args.source).items():
            print(f"{os.path.basename(path):70s} {','.join(hits) or '-'}")
        return
    if not args.board:
        ap.error("--board is required")
    ks = set(int(x) for x in args.ks.split(",")) if args.ks else None
    run(args.source, args.board, args.out, ks, args.report, args.limit, args.cap, args.progress)


if __name__ == "__main__":
    main()
