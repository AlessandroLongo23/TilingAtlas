#!/usr/bin/env python3
"""Polyform geometry for the three atomic lattices, shared by gen_alphabet (which needs a tile's
boundary ANGLE WORD) and gen_polyform_palette (which needs to ENUMERATE the shapes).

A polyform is n copies of one atomic tile glued edge to edge:

  square    cell (x, y)      unit square, bottom-left corner    boundary angles 90/180/270
  triangle  cell (a, b, u)   unit triangle, u = 0 up / 1 down   boundary angles 60/120/180/240/300
  hex       cell (q, r)      unit hexagon, axial coords         boundary angles 120/240

Vertices live in one integer basis per lattice: (1,0),(0,1) for the square, (1,0),(1/2,√3/2) for
the other two — a hexagon's six corners ARE the six triangular-lattice neighbours of its centre, so
triangles and hexagons share a coordinate system and differ only in which cells exist. Every
boundary edge is therefore one of N = 4 or 6 unit directions, and the interior angle at a boundary
vertex is D/2 − turn·D/N units exactly: integer arithmetic throughout, no floats, no rounding.

Downstream, all three are the SAME tile kind. A tile is its cyclic interior-angle word; the lattice
only decides which angles can occur. That is why one `polyomino` kind in gen_alphabet covers all of
them and why polyiamonds needed no new search — only this file's boundary walk.
"""

# Unit edge directions, CCW from +x. The turn between consecutive boundary edges is an index
# difference in this list, which is how the interior angle stays exact.
DIRS4 = [(1, 0), (0, 1), (-1, 0), (0, -1)]
DIRS6 = [(1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1), (1, -1)]


# --- per-lattice cell model: CCW vertex loop, edge neighbours, and centre <-> cell -------------
# The centre is in SCALED integer coordinates (×2 square, ×3 triangle, ×1 hex) so a rotation or a
# reflection of the lattice is an integer map on centres and never leaves the grid.
def _verts_square(c):
    x, y = c
    return [(x, y), (x + 1, y), (x + 1, y + 1), (x, y + 1)]


def _verts_tri(c):
    a, b, u = c
    return [(a + 1, b), (a + 1, b + 1), (a, b + 1)] if u else [(a, b), (a + 1, b), (a, b + 1)]


def _verts_hex(c):
    q, r = c
    cu, cv = q - r, q + 2 * r
    return [(cu + dx, cv + dy) for dx, dy in DIRS6]


def _nbrs_square(c):
    x, y = c
    return [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]


def _nbrs_tri(c):
    a, b, u = c
    return [(a, b, 1 - u)] + ([(a + 1, b, 0), (a, b + 1, 0)] if u else [(a - 1, b, 1), (a, b - 1, 1)])


def _nbrs_hex(c):
    q, r = c
    return [(q + dq, r + dr) for dq, dr in DIRS6]


LATTICE = {
    "square": dict(
        dirs=DIRS4, verts=_verts_square, nbrs=_nbrs_square, seed=(0, 0), nrot=4,
        cen=lambda c: (2 * c[0] + 1, 2 * c[1] + 1),
        cell=lambda p: ((p[0] - 1) // 2, (p[1] - 1) // 2),
        rot=lambda p: (-p[1], p[0]),
        refl=lambda p: (p[0], -p[1]),
    ),
    "triangle": dict(
        dirs=DIRS6, verts=_verts_tri, nbrs=_nbrs_tri, seed=(0, 0, 0), nrot=6,
        # up-cell centre ≡ (1,1) mod 3, down-cell ≡ (2,2): the residue IS the up/down flag, and a
        # 60° rotation swaps them, which is exactly what the lattice does.
        cen=lambda c: (3 * c[0] + 1 + c[2], 3 * c[1] + 1 + c[2]),
        cell=lambda p: (((p[0] - 1 - (p[0] - 1) % 3) // 3), ((p[1] - 1 - (p[0] - 1) % 3) // 3), (p[0] - 1) % 3),
        rot=lambda p: (-p[1], p[0] + p[1]),
        refl=lambda p: (p[0] + p[1], -p[1]),
    ),
    "hex": dict(
        dirs=DIRS6, verts=_verts_hex, nbrs=_nbrs_hex, seed=(0, 0), nrot=6,
        cen=lambda c: (c[0] - c[1], c[0] + 2 * c[1]),
        cell=lambda p: (p[0] + (p[1] - p[0]) // 3, (p[1] - p[0]) // 3),
        rot=lambda p: (-p[1], p[0] + p[1]),
        refl=lambda p: (p[0] + p[1], -p[1]),
    ),
}


def boundary(cells, lattice="square"):
    """CCW outer boundary of a polyform as a loop of lattice vertices, EVERY vertex kept (a straight
    run carries a flat 180° corner, a notch a reflex one). Cell loops are CCW, so cancelling each
    interior edge against its reverse leaves the outer boundary already oriented interior-on-left."""
    L = LATTICE[lattice]
    edges = set()
    for c in cells:
        v = L["verts"](c)
        for i in range(len(v)):
            edges.add((v[i], v[(i + 1) % len(v)]))
    nxt = {}
    for a, b in edges:
        if (b, a) in edges:
            continue                                     # interior: two cells share it
        assert a not in nxt, f"boundary vertex {a} has two exits — pinch point, not simply connected"
        nxt[a] = b
    start = min(nxt, key=lambda p: (p[1], p[0]))         # lowest, then leftmost
    out, cur = [start], nxt[start]
    while cur != start:
        out.append(cur)
        cur = nxt[cur]
    assert len(out) == len(nxt), "boundary is not one loop (hole or pinch)"
    return out


def polyform_angle_word(cells, D, lattice="square"):
    """Cyclic interior-angle word in D-units around a polyform boundary. The turn from the incoming
    to the outgoing edge direction is an index difference in the lattice's N unit directions, so the
    interior angle is D/2 − turn·D/N — exact, and reflex corners fall out with no special case."""
    L = LATTICE[lattice]
    dirs = L["dirs"]
    N = len(dirs)
    assert D % N == 0, f"D={D} does not carry the {lattice} lattice's {N} directions"
    idx = {d: i for i, d in enumerate(dirs)}
    v = boundary(cells, lattice)
    m = len(v)
    w = []
    for i in range(m):
        px, py = v[i - 1]
        cx, cy = v[i]
        nx, ny = v[(i + 1) % m]
        t = (idx[(nx - cx, ny - cy)] - idx[(cx - px, cy - py)]) % N
        assert t != N // 2, f"180° reversal at {v[i]} — degenerate spike"
        if t > N // 2:
            t -= N
        w.append(D // 2 - t * (D // N))
    return w


def canon(cells, lattice="square", mirror=False):
    """Canonical key of a shape under translation plus the lattice's rotations (and reflections when
    `mirror`). Rotations only ⇒ one key per ONE-SIDED polyform; with mirror ⇒ one per FREE one."""
    L = LATTICE[lattice]
    best = None
    for m in range(2 if mirror else 1):
        pts = [L["cen"](c) for c in cells]
        if m:
            pts = [L["refl"](p) for p in pts]
        for _ in range(L["nrot"]):
            pts = [L["rot"](p) for p in pts]
            cs = [L["cell"](p) for p in pts]
            a0 = min(c[0] for c in cs)
            b0 = min(c[1] for c in cs)
            k = tuple(sorted((c[0] - a0, c[1] - b0) + tuple(c[2:]) for c in cs))
            if best is None or k < best:
                best = k
    return best


def enumerate_polyforms(lattice, order, mirror=False):
    """Every polyform of this lattice and order, one per congruence class, grown cell by cell.
    `mirror=False` (the shelf convention) keeps a chiral shape and its reflection apart."""
    L = LATTICE[lattice]
    cur = {canon([L["seed"]], lattice, mirror): (L["seed"],)}
    for _ in range(order - 1):
        nxt = {}
        for shape in cur.values():
            s = set(shape)
            for c in shape:
                for nb in L["nbrs"](c):
                    if nb in s:
                        continue
                    grown = tuple(sorted(s | {nb}))
                    nxt.setdefault(canon(grown, lattice, mirror), grown)
        cur = nxt
    return [cur[k] for k in sorted(cur)]


def ascii_art(cells, lattice="square"):
    """A rough picture of a shape, for eyeballing an enumeration before naming its pieces."""
    if lattice == "square":
        xs = [c[0] for c in cells]
        ys = [c[1] for c in cells]
        rows = []
        for y in range(max(ys), min(ys) - 1, -1):
            rows.append("".join("##" if (x, y) in cells else "  " for x in range(min(xs), max(xs) + 1)))
        return rows
    # Triangles and hexagons: plot cell centres on the (1,0),(1/2,√3/2) basis, two columns per unit.
    L = LATTICE[lattice]
    pts = [L["cen"](c) for c in cells]
    sc = 3 if lattice == "triangle" else 1
    grid = {}
    for u, v in pts:
        grid[(round(2 * (u / sc + (v / sc) / 2)), round(v / sc))] = "#"
    xs = [p[0] for p in grid]
    ys = [p[1] for p in grid]
    return ["".join(grid.get((x, y), " ") for x in range(min(xs), max(xs) + 1))
            for y in range(max(ys), min(ys) - 1, -1)]


# --- placement at a vertex: exact, integer, no floats ------------------------------------------
# A vertex configuration places one tile per corner class around the vertex at the running angle sum.
# Every interior angle is a whole number of lattice rotation steps, so each placement is an INTEGER
# map on cell centres and "do two tiles of this configuration overlap" is exact set intersection.
# Sound at a vertex for the reason the engine's search is: every tile there has a corner AT the
# vertex, so they all sit on the one lattice that vertex generates.
_SCALE = {"square": 2, "triangle": 3, "hex": 1}


def placed_cells(cells, lattice, pos, steps):
    """Cells of a polyform placed with boundary corner `pos` at the origin and its outgoing edge
    heading at lattice direction `steps`, as scaled integer centres."""
    L = LATTICE[lattice]
    dirs = L["dirs"]
    sc = _SCALE[lattice]
    idx = {d: i for i, d in enumerate(dirs)}
    v = boundary(cells, lattice)
    m = len(v)
    (vx, vy), (nx, ny) = v[pos], v[(pos + 1) % m]
    r = (steps - idx[(nx - vx, ny - vy)]) % len(dirs)
    pts = [(cx - sc * vx, cy - sc * vy) for cx, cy in (L["cen"](c) for c in cells)]
    for _ in range(r):
        pts = [L["rot"](p) for p in pts]
    return pts


def config_overlaps(word, lattice, D):
    """True if the placed tiles of a vertex configuration collide. `word` is [(cells, pos, units)]
    in cyclic order; `units` is the corner's interior angle in D-units."""
    step = D // len(LATTICE[lattice]["dirs"])
    steps, seen = 0, set()
    for cells, pos, units in word:
        for p in placed_cells(cells, lattice, pos, steps):
            if p in seen:
                return True
            seen.add(p)
        steps += units // step
    return False
