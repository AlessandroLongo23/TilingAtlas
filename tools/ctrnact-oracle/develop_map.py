#!/usr/bin/env python3
"""develop_map.py — a developed cell from a combinatorial map and a list of corner angles.

`intrinsic_family.py` moves a tiling around inside its own parameter space, and every point it reaches is
a vector of angles. Nothing renders angles. This walks the other way: place one face, glue its neighbours
across the edge involution, and read the translation lattice off the loops that close. The output is the
same `(polys, basis)` pair `scan-family-ranges.cell_at` produces from a symbolic cell, so every health
test, the orbit counter and the tiling key all apply unchanged.

Two things carry the whole file.

**The angle convention.** Dart j owns vertex j AND the edge from vertex j to vertex j+1, which is how
`tiling_key.build_map` pairs them, so the interior angle at dart j is the turn between edge j−1 and edge
j: θ_j = θ_{j−1} + s·(180 − a_j), with s = +1 for a counter-clockwise cell and −1 for a clockwise one.

⚑ Do NOT take this from `intrinsic_freedom.freedom`. Its closure recursion advances by (180 − a_j) AFTER
emitting edge j, which attributes dart j's angle to the FAR end of its edge. That is harmless there and
provably so: closure is Σ exp(iφ) over the whole cyclic set, and the two conventions differ by a cyclic
shift of that set, which is why the residual self-check passes on all 470 entries either way. Development
is not a sum. Taken from `freedom`, every face comes out rotated by one corner and nothing closes.

**The lattice.** Faces are placed on a spanning tree of the dual graph; every dart NOT in the tree closes
a loop, and the gap between where it says its neighbour goes and where the tree already put it is a
translation period. Those periods generate the tiling's lattice, and two of them (as an integer
combination, computed once at the anchor and constant along the family) are its basis.
"""
import argparse
import cmath
import math
import os
import sys
import time
from collections import Counter, deque

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import intrinsic_family as IFM
import tiling_key as TK
import vertex_orbits as vo

D2R = math.pi / 180.0


def local_face(angles, darts, orient):
    """One face in its own frame: unit edges, vertex 0 at the origin, edge 0 along the positive real axis.

    Returns (vertices, closure error). The error is |v_L − v_0|, which is the closure constraint the
    family solver has already driven to zero; it is returned instead of asserted so the caller can report
    which face failed and by how much.
    """
    L = len(darts)
    th = 0.0
    v = [0j]
    for j in range(L):
        v.append(v[-1] + cmath.exp(1j * th))
        th += orient * (180.0 - angles[darts[(j + 1) % L]]) * D2R
    return v[:L], abs(v[L] - v[0])


def placement_tree(fam):
    """[(face, dart-it-was-glued-across)] in placement order; the root is (0, −1).

    Shipped with the cell rather than left to be re-derived. It depends on nothing but the map, so both
    sides would compute the same thing — as long as both walk the faces in the same order, which is a
    silent assumption of exactly the kind that turns into a rendering bug nobody can localise.
    """
    seen = {0}
    order = [(0, -1)]
    queue = deque([0])
    while queue:
        f = queue.popleft()
        for d in fam.faces[f]:
            g = fam.face_of[fam.alpha[d]]
            if g in seen:
                continue
            seen.add(g)
            order.append((g, int(d)))
            queue.append(g)
    return order


def develop(fam, angles, combo=None):
    """(polys, basis, info) — the cell at these angles, or (None, None, info) if it does not close.

    `combo` is the integer expression of the two lattice generators over the loop periods, from
    `lattice_combo` at the anchor. Passing it keeps the basis CONTINUOUS along a deformation; recomputing
    it per point would be free to pick a different (equally valid) basis one step later and make the cell
    jump. Omit it only when computing it.
    """
    a = np.asarray(angles, float)
    L = [local_face(a, ds, fam.orient) for ds in fam.faces]
    worst = max(e for _v, e in L)
    if worst > 1e-6:
        return None, None, {"reason": "face does not close", "error": worst}
    local = [v for v, _e in L]

    place = [None] * len(fam.faces)              # face → (rotation, translation)
    place[0] = (1 + 0j, 0j)
    tree = set()
    for f2, d in placement_tree(fam)[1:]:
        f = fam.face_of[d]
        j = fam.pos_of[d]
        rf, tf = place[f]
        g, j2 = fam.face_of[fam.alpha[d]], fam.pos_of[fam.alpha[d]]
        # the shared edge is traversed the OTHER way round the neighbour, so its two ends swap
        p0 = rf * local[f][j] + tf
        p1 = rf * local[f][(j + 1) % len(fam.faces[f])] + tf
        q0, q1 = local[g][j2], local[g][(j2 + 1) % len(fam.faces[g])]
        rg = (p0 - p1) / (q1 - q0)
        place[g] = (rg, p1 - rg * q0)
        tree.add(d)
        tree.add(fam.alpha[d])
    if any(p is None for p in place):
        return None, None, {"reason": "map is not connected"}

    periods = []
    for f, ds in enumerate(fam.faces):
        rf, tf = place[f]
        for j, d in enumerate(ds):
            if d in tree:
                continue
            g, j2 = fam.face_of[fam.alpha[d]], fam.pos_of[fam.alpha[d]]
            p0 = rf * local[f][j] + tf
            p1 = rf * local[f][(j + 1) % len(ds)] + tf
            q0 = local[g][j2]
            q1 = local[g][(j2 + 1) % len(fam.faces[g])]
            rg = (p0 - p1) / (q1 - q0)
            tg = p1 - rg * q0
            rgot, tgot = place[g]
            if abs(rg - rgot) > 1e-7:
                return None, None, {"reason": "loop holonomy is not a translation", "error": abs(rg - rgot)}
            periods.append((d, tg - tgot))

    polys = [{"n": len(ds), "v": [place[f][0] * z + place[f][1] for z in local[f]]}
             for f, ds in enumerate(fam.faces)]
    if combo is None:
        return polys, None, {"periods": periods}
    byd = dict(periods)
    basis = []
    for row in combo:
        z = 0j
        for d, c in row:
            if d not in byd:
                return None, None, {"reason": f"loop dart {d} vanished"}
            z += c * byd[d]
        basis.append(z)
    basis = reduce_basis(basis[0], basis[1])
    if basis is None:
        return None, None, {"reason": "degenerate lattice"}
    return polys, basis, {"periods": periods}


def reduce_basis(u, v):
    """Lagrange–Gauss reduction of the lattice basis. Same lattice, shortest pair.

    ⚑ Not cosmetic. `basisCombo` is a fixed integer combination, so as the tiling deforms the two
    generators it names can become arbitrarily skewed while still spanning the right lattice. Everything
    that builds a PATCH — `vertex_orbits._translates`, `scan-family-ranges.covering`, `tiling_key` —
    sizes its translate grid as radius / (det / longest side), which is the fundamental domain's HEIGHT,
    so a skewed basis makes that grid explode. On `period-k1-001` one probe near the end of a ray took
    the export to 1.5 GB and never returned. A reduced basis has height ≥ (√3/2)·|shortest|, which bounds
    it. Reduction changes neither the lattice nor the tiling, only which two vectors name it.

    ⚑ Terminate on |v| ≥ |u| after the subtraction, NOT on q = 0. In a lattice with hexagonal symmetry
    several vectors share a length and the q = 0 test never fires: `period-k2-044` cycled through three
    generators of equal norm until the iteration cap and reported a perfectly good lattice degenerate.
    Rounding is floor(x + ½) on both sides of the port, since Python rounds halves to even and JavaScript
    rounds them up, and a basis that differs by one lattice step fails the parity test.
    """
    for _ in range(200):
        n2 = u.real * u.real + u.imag * u.imag
        if n2 < 1e-24:
            return None
        q = math.floor((v.real * u.real + v.imag * u.imag) / n2 + 0.5)
        v = v - q * u
        if v.real * v.real + v.imag * v.imag >= n2 - 1e-12:
            return [u, v] if abs(u.real * v.imag - v.real * u.imag) > 1e-12 else None
        u, v = v, u
    return None


# ── the lattice, once, at the anchor ──────────────────────────────────────────────────────────────────
def _egcd(a, b):
    if b == 0:
        return (abs(a), 1 if a >= 0 else -1, 0)
    g, x, y = _egcd(b, a % b)
    return (g, y, x - (a // b) * y)


def unimodular_rows(M):
    """Integer combinations of the rows of M (m × 2) giving (1,0) and (0,1), or None.

    Integer row reduction with the transform tracked. Returning None means the loop periods generate a
    PROPER sublattice of the tiling's translation lattice, i.e. the cell being developed is a supercell —
    worth failing on rather than papering over, because the area certificate would then be off by an
    integer factor and every count downstream with it.
    """
    m = len(M)
    vec = [list(r) for r in M]
    co = [[1 if j == i else 0 for j in range(m)] for i in range(m)]
    piv = []
    for col in (0, 1):
        cand = [i for i in range(m) if i not in piv and vec[i][col] != 0]
        if not cand:
            return None
        p = cand[0]
        for q in cand[1:]:
            a, b = vec[p][col], vec[q][col]
            g, x, y = _egcd(a, b)
            # the unimodular pair [[x, y], [−b/g, a/g]] puts gcd(a, b) in row p and 0 in row q
            np_, nq = [x * vec[p][k] + y * vec[q][k] for k in (0, 1)], \
                      [(-b // g) * vec[p][k] + (a // g) * vec[q][k] for k in (0, 1)]
            cp, cq = [x * co[p][k] + y * co[q][k] for k in range(m)], \
                     [(-b // g) * co[p][k] + (a // g) * co[q][k] for k in range(m)]
            vec[p], vec[q], co[p], co[q] = np_, nq, cp, cq
        piv.append(p)
    p0, p1 = piv
    if abs(vec[p0][0]) != 1 or abs(vec[p1][1]) != 1:
        return None                                   # index > 1: this cell is a supercell
    if vec[p0][0] < 0:
        vec[p0], co[p0] = [-v for v in vec[p0]], [-c for c in co[p0]]
    if vec[p1][1] < 0:
        vec[p1], co[p1] = [-v for v in vec[p1]], [-c for c in co[p1]]
    t = vec[p0][1]
    return [co[p0][i] - t * co[p1][i] for i in range(m)], co[p1]


def lattice_combo(fam, render_cell):
    """The two lattice generators as integer combinations of loop periods, computed at the anchor.

    Periods are expressed in the PRIMITIVE basis of the shipped cell — the same one `tiling_key.build_map`
    quotiented by — where they come out as integer pairs, and the combination that turns them into (1,0)
    and (0,1) is the answer. It is combinatorial, so it stays correct everywhere on the family.
    """
    polys, _b, info = develop(fam, fam.angles0)
    if polys is None:
        return None, info
    src, basis = vo.float_cell(render_cell)
    ps = [p for p in src if abs(vo.S().signed_area(p["v"])) > vo.S().ZERO_AREA]
    tiles = [(TK._tlabel(p["v"]), sum(p["v"]) / len(p["v"])) for p in ps]
    (h11, h12), (_z, h22) = TK.primitive_lattice(tiles, basis[0], basis[1])
    p1 = (h11 * basis[0] + h12 * basis[1]) / TK.SCALE
    p2 = (h22 * basis[1]) / TK.SCALE
    det = p1.real * p2.imag - p2.real * p1.imag
    M, darts = [], []
    for d, z in info["periods"]:
        x = (z.real * p2.imag - p2.real * z.imag) / det
        y = (p1.real * z.imag - z.real * p1.imag) / det
        if abs(x - round(x)) > 1e-5 or abs(y - round(y)) > 1e-5:
            return None, {"reason": "a loop period is not in the primitive lattice", "coords": (x, y)}
        if round(x) == 0 and round(y) == 0:
            continue
        M.append([int(round(x)), int(round(y))])
        darts.append(d)
    if not M:
        return None, {"reason": "no loop periods"}
    u = unimodular_rows([m[:] for m in M])
    if u is None:
        return None, {"reason": "loop periods generate a proper sublattice"}
    return [[(darts[i], c) for i, c in enumerate(row) if c] for row in u], {}


# ── the gate ──────────────────────────────────────────────────────────────────────────────────────────
def check(entry):
    """Develop an entry's own anchor and compare with what it ships. (ok, detail)."""
    fam, why = IFM.from_cell(entry["renderCell"])
    if fam is None:
        return False, f"no system: {why}"
    combo, info = lattice_combo(fam, entry["renderCell"])
    if combo is None:
        return False, f"lattice: {info.get('reason')}"
    polys, basis, info = develop(fam, fam.angles0, combo)
    if polys is None:
        return False, f"develop: {info.get('reason')}"
    Sm = vo.S()
    ok, reason = Sm.health(polys, basis)
    if not ok:
        return False, f"health: {reason}"
    area = sum(abs(Sm.signed_area(p["v"])) for p in polys)
    if abs(area - Sm.det_of(basis)) > 1e-9:
        return False, f"area certificate off by {abs(area - Sm.det_of(basis)):.2e}"
    want = TK.tiling_key(*vo.float_cell(entry["renderCell"]))
    got = TK.tiling_key(polys, basis)
    if got != want:
        return False, "developed a DIFFERENT tiling (key mismatch)"
    return True, f"{len(polys)} tiles, |b|=({abs(basis[0]):.4f}, {abs(basis[1]):.4f})"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shelf", default=None)
    ap.add_argument("--id", action="append", default=[])
    ap.add_argument("--gate", action="store_true",
                    help="develop every shelf entry from its own angles and compare with what it ships")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--log", default=None)
    args = ap.parse_args()
    out = open(args.log, "w") if args.log else None

    def log(m):
        print(m, flush=True)
        if out:
            out.write(m + "\n")
            out.flush()

    entries = IFM.shelf_entries(args.shelf)
    if args.id:
        entries = [e for e in entries if e["id"] in args.id or e.get("legacyId") in args.id]
    if args.limit:
        entries = entries[:args.limit]
    log(f"# development gate — {len(entries)} entries")
    bad, why_counts, t0 = 0, Counter(), time.time()
    for i, e in enumerate(entries, 1):
        ok, detail = check(e)
        if not ok:
            bad += 1
            why_counts[detail.split(" (")[0][:48]] += 1
            log(f"  ⚑ {e['id']:<16} {detail}")
        elif args.id:
            log(f"  {e['id']:<16} {detail}")
        if i % 50 == 0:
            el = time.time() - t0
            log(f"  ... {i}/{len(entries)}  {bad} failed  elapsed {el:.0f}s  ETA {el / i * (len(entries) - i):.0f}s")
    log("")
    for w, n in why_counts.most_common():
        log(f"  {n:>4}  {w}")
    log(f"development gate: {'PASS' if bad == 0 else f'FAIL — {bad} of {len(entries)}'}")
    sys.exit(0 if bad == 0 else 1)


if __name__ == "__main__":
    main()
