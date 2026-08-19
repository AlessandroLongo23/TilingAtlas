#!/usr/bin/env python3
"""length_family.py — a tiling's freedom in its EDGE LENGTHS, at fixed angles.

The counterpart to `intrinsic_freedom.py`, and the two together are the whole deformation picture:

    intrinsic_freedom   variables = one ANGLE per dart, edges pinned at 1.
                        "How far can this tiling bend?"   Closure Σ exp(i·φ) = 0 is NONLINEAR, so the
                        answer is the local dimension at the tiling in hand.

    length_family       variables = one LENGTH per EDGE, angles pinned where they are.
                        "How far can this tiling stretch?"  The angles fix every edge DIRECTION, so
                        closure Σ ℓ_e·d_e = 0 is LINEAR and the answer is global, not local: the
                        realizable assignments are ker(A) ∩ {ℓ > 0}, a relatively open convex
                        polyhedral cone, and its dimension is exact.

Why the second one is what the non-edge-to-edge shelves need. A T-junction subdivides a tile's side, so
the two pieces are separate EDGES of the map that must sum to one SIDE of the tile. Nothing about that is
an angle: every angle in the brick pattern is 90 or 180 no matter where the rows sit. Ask
`intrinsic_freedom` and it reports the bend freedom, which is not the slider anyone wants; ask this and
the slider is the offset.

Constraints, per face of the refined map (`tiling_key.refine` promotes each T-junction to a vertex, so
"face" is a tile and "edge" is one piece of one of its sides):

    per FACE     Σ ℓ_e·d_e = 0 around the boundary                                        [2 linear]
    per FACE     if the palette calls the tile REGULAR, its geometric SIDES are equal,
                 a side being a maximal run of edges through flat (180°) corners           [S−1 linear]

    dimension = #edges − rank(A);  parameters = dimension − 1, the one dropped being scale.

⚑ REGULARITY MUST BE READ AT A GENERIC POINT of the family, never at a symmetric member. At A = B = C an
equiangular hexagon IS equilateral, so auto-detecting "regular" there imposes all-sides-equal and reports
a 3-parameter family as rigid. Same trap as measuring k at all-shifts-½. Pass `regular` explicitly when
the palette knows the answer; the auto-detect is a convenience for cells that arrive without a palette.

⚑ The cone bounds THIS MAP, not the plane. Past an endpoint some edge goes non-positive and this map
dies, but the tiling often survives as a different map with the pieces relabelled — sliding the brick's
offset past a full period is the same tiling, renamed.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tiling_key as TK
import vertex_orbits as vo

TOL = 1e-9


def _rank(rows, ncol, tol=1e-9):
    """Gauss-Jordan rank with partial pivoting; also returns the reduced rows and pivot columns."""
    m = [r[:] for r in rows]
    piv, rank = [], 0
    for c in range(ncol):
        if rank >= len(m):
            break
        best = max(range(rank, len(m)), key=lambda r: abs(m[r][c]))
        if abs(m[best][c]) < tol:
            continue
        m[rank], m[best] = m[best], m[rank]
        pv = m[rank][c]
        m[rank] = [x / pv for x in m[rank]]
        for r in range(len(m)):
            if r == rank or abs(m[r][c]) < tol:
                continue
            f = m[r][c]
            m[r] = [x - f * y for x, y in zip(m[r], m[rank])]
        piv.append(c)
        rank += 1
    return rank, m, piv


def _vertex_count(sigma, alpha, n):
    """Vertices of a dart map: the orbits of sigma-after-alpha. Same map as E = orbits of alpha and
    F = orbits of sigma, so V - E + F is the Euler characteristic of the thing actually built."""
    seen, V = [False] * n, 0
    for d in range(n):
        if seen[d]:
            continue
        V += 1
        x = d
        while not seen[x]:
            seen[x] = True
            x = sigma[alpha[x]]
    return V


def kernel(rows, ncol, tol=1e-9):
    """A basis of ker(A), one vector per free column, with a 1 in that column."""
    rank, m, piv = _rank(rows, ncol, tol)
    free = [c for c in range(ncol) if c not in piv]
    out = []
    for fc in free:
        v = [0.0] * ncol
        v[fc] = 1.0
        for ri, pc in enumerate(piv):
            v[pc] = -m[ri][fc]
        out.append(v)
    return out, free


def freedom(polys, basis, regular=None, tol=1e-9):
    """(dim, info) — length-parameter count of the tiling, or (None, why) if the map cannot be built.

    `regular` may be a list of booleans, one per face of the REFINED map in `reps` order, saying whether
    the palette calls that tile regular. None auto-detects from the member in hand; see the warning above.
    """
    rp = TK.refine(TK.smooth(polys, basis), basis)
    m = TK.build_map(rp, basis)
    if m is None:
        return None, {"reason": "map"}
    labels, sigma, alpha, reps, ps, darts = m
    n = len(darts)

    # one variable per EDGE; alpha pairs the two darts of an edge
    eidx, E = {}, 0
    for d in range(n):
        if d not in eidx:
            eidx[d] = eidx[alpha[d]] = E
            E += 1

    # unit direction of each dart, straight off the geometry — the angles are what pin these
    dirs = []
    for (r, j) in darts:
        v = ps[reps[r]]["v"]
        a, b = v[j], v[(j + 1) % len(v)]
        L = abs(b - a)
        if L < TOL:
            return None, {"reason": "degenerate edge"}
        dirs.append((b - a) / L)

    faces = {}
    for i, (r, j) in enumerate(darts):
        faces.setdefault(r, []).append(i)
    for r in faces:
        faces[r].sort(key=lambda i: darts[i][1])

    rows, nsides = [], []
    for fi, r in enumerate(sorted(faces)):
        ds = faces[r]
        rx, ry = [0.0] * E, [0.0] * E
        for i in ds:
            rx[eidx[i]] += dirs[i].real
            ry[eidx[i]] += dirs[i].imag
        rows += [rx, ry]

        # geometric SIDES: consecutive darts with the same direction are one side, the corner between
        # them being flat. The wrap-around run must be merged — if the LAST corner is flat the first dart
        # continues the side the last dart started, and splitting them turns a square with two subdivided
        # sides into a rigid hexagon.
        sides, lens = [], []
        for k, i in enumerate(ds):
            prev = ds[k - 1]
            if k == 0 or abs(dirs[i] - dirs[prev]) > 1e-9:
                sides.append([0.0] * E)
                lens.append(0.0)
            sides[-1][eidx[i]] += 1.0
            v = ps[reps[r]]["v"]
            a, b = v[darts[i][1]], v[(darts[i][1] + 1) % len(v)]
            lens[-1] += abs(b - a)
        if len(sides) > 1 and abs(dirs[ds[0]] - dirs[ds[-1]]) <= 1e-9:
            tail, tl = sides.pop(), lens.pop()
            sides[0] = [x + y for x, y in zip(sides[0], tail)]
            lens[0] += tl
        nsides.append(len(sides))

        is_reg = (all(abs(x - lens[0]) < 1e-6 for x in lens) if regular is None
                  else bool(regular[fi]))
        if is_reg:
            for s in sides[1:]:
                rows.append([x - y for x, y in zip(s, sides[0])])

    rank, _, _ = _rank(rows, E, tol)
    # V, E and F must all be counted on the SAME map — the primitive quotient `build_map` works on.
    # Reading V off `lattice_reps` with the GIVEN basis mixed a supercell count into a primitive one and
    # reported chi = 2, 3, 6 on cells that are perfectly good tori; 113 of the 146 shipped T-junction
    # rows carried such a chi. Vertices are the orbits of sigma-after-alpha on the darts.
    V = _vertex_count(sigma, alpha, n)
    F = len(reps)
    return E - rank, {
        "V": V, "E": E, "F": F, "euler": V - E + F,
        "rank": rank, "dim": E - rank, "params": E - rank - 1,
        "sides": nsides, "tiles": sorted(len(ps[reps[r]]["v"]) for r in sorted(faces)),
    }


def cone(polys, basis, regular=None, tol=1e-9):
    """(kernel basis, free edge indices) — the cone itself, for building a slider chart."""
    rp = TK.refine(polys, basis)
    m = TK.build_map(rp, basis)
    if m is None:
        return None, None
    d, info = freedom(polys, basis, regular, tol)
    if d is None:
        return None, None
    return info, None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("cells", help="JSON: [{id, renderCell:{cellPolygons:[{n,vertices}], basis}}]")
    ap.add_argument("--expect", help="JSON: {id: params} to check against")
    ap.add_argument("--json", help="write the results here")
    a = ap.parse_args()

    entries = json.load(open(a.cells))
    expect = json.load(open(a.expect)) if a.expect else {}
    out, bad = {}, 0
    for e in entries:
        polys, basis = vo.float_cell(e["renderCell"])
        dim, info = freedom(polys, basis)
        if dim is None:
            print(f"{e['id']:26s} FAILED: {info.get('reason')}")
            bad += 1
            continue
        out[e["id"]] = info
        line = (f"{e['id']:26s} V={info['V']:2d} E={info['E']:2d} F={info['F']:2d} "
                f"chi={info['euler']:2d}  params={info['params']}")
        if e["id"] in expect:
            ok = info["params"] == expect[e["id"]]
            bad += 0 if ok else 1
            line += f"  expect {expect[e['id']]}  {'OK' if ok else '<<< MISMATCH'}"
        print(line)
    if a.json:
        json.dump(out, open(a.json, "w"), indent=1)
    print(f"\n{len(out)} cells, {bad} disagreement(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())


# ── the chart: the family as sliders, not just a dimension ────────────────────────────────────────
def chart(polys, basis, tol=1e-9):
    """The family as an Atlas length-family: coordinates, a valid BOX, and every vertex affine in them.

    `freedom` returns a number. A number is not a slider. The coordinates here are d actual EDGE lengths
    — the free columns of the closure system — with the developed member (every edge 1) as the default,
    so a parameter has a name and the tiling you see at the defaults is the one the engine developed.

    Positivity is a CONE, not a box, so an axis-aligned slider box has to be fitted inside it. Each
    dependent edge is affine in the coordinates, so interval arithmetic gives an exact SUFFICIENT test
    for a whole box at once, and the largest safe radius is found by bisection on it. Conservative by
    construction: every point of the emitted box is a real tiling, and some real tilings lie outside it.
    """
    rp = TK.refine(TK.smooth(polys, basis), basis)
    m = TK.build_map(rp, basis)
    if m is None:
        return None
    labels, sigma, alpha, reps, ps, darts = m
    n = len(darts)
    eidx, E = {}, 0
    for d in range(n):
        if d not in eidx:
            eidx[d] = eidx[alpha[d]] = E
            E += 1
    dirs = []
    for (r, j) in darts:
        v = ps[reps[r]]["v"]
        a, b = v[j], v[(j + 1) % len(v)]
        L = abs(b - a)
        if L < TOL:
            return None
        dirs.append((b - a) / L)

    faces = {}
    for i, (r, j) in enumerate(darts):
        faces.setdefault(r, []).append(i)
    for r in faces:
        faces[r].sort(key=lambda i: darts[i][1])

    rows = []
    for r in sorted(faces):
        ds = faces[r]
        rx, ry = [0.0] * E, [0.0] * E
        for i in ds:
            rx[eidx[i]] += dirs[i].real
            ry[eidx[i]] += dirs[i].imag
        rows += [rx, ry]
        sides, lens = [], []
        for k, i in enumerate(ds):
            prev = ds[k - 1]
            if k == 0 or abs(dirs[i] - dirs[prev]) > 1e-9:
                sides.append([0.0] * E); lens.append(0.0)
            sides[-1][eidx[i]] += 1.0
            v = ps[reps[r]]["v"]
            a, b = v[darts[i][1]], v[(darts[i][1] + 1) % len(v)]
            lens[-1] += abs(b - a)
        if len(sides) > 1 and abs(dirs[ds[0]] - dirs[ds[-1]]) <= 1e-9:
            t, tl = sides.pop(), lens.pop()
            sides[0] = [x + y for x, y in zip(sides[0], t)]; lens[0] += tl
        if all(abs(x - lens[0]) < 1e-6 for x in lens):
            for s in sides[1:]:
                rows.append([x - y for x, y in zip(s, sides[0])])

    K, free = kernel(rows, E, tol)
    d = len(K)
    if d < 2:
        return None

    # the developed member, in coordinates: every edge is 1, so c_i = 1 for each free edge
    c0 = [1.0] * d
    def lens_at(c):
        return [sum(c[i] * K[i][e] for i in range(d)) for e in range(E)]
    if min(lens_at(c0)) < 1e-7:
        return None

    # largest safe radius, by bisection on an interval-arithmetic test of the whole box
    def box_ok(rad):
        lo = [1.0 - rad] * d; hi = [1.0 + rad] * d
        for e in range(E):
            mn = sum(min(K[i][e] * lo[i], K[i][e] * hi[i]) for i in range(d))
            if mn <= 1e-7:
                return False
        return True
    a_, b_ = 0.0, 0.95
    if not box_ok(1e-4):
        return None
    for _ in range(40):
        mid = (a_ + b_) / 2
        if box_ok(mid): a_ = mid
        else: b_ = mid
    rad = a_ * 0.98

    # positions: affine (in fact linear) in the coordinates. Place vertex 0 at the origin and walk.
    pos = [None] * len(reps)
    # coefficient of c_i at a vertex = sum over the path's edges of K_i[e] * direction
    base = [[0j] * d for _ in reps]
    seen = {0}; pos[0] = True; q = [0]
    lat = []
    while q:
        r = q.pop(0)
        for i in faces[r]:
            e = eidx[i]
            step = [K[t][e] * dirs[i] for t in range(d)]
            far = [base[r][t] + step[t] for t in range(d)]
            r2 = darts[alpha[i]][0]
            if r2 not in seen:
                seen.add(r2); base[r2] = far; q.append(r2)
            else:
                dv = [far[t] - base[r2][t] for t in range(d)]
                if sum(abs(x) for x in dv) > 1e-7:
                    lat.append(dv)
    if len(seen) != len(reps):
        return None
    ev = lambda co: sum(c0[t] * co[t] for t in range(d))
    uniq = []
    for v in lat:
        if not any(abs(ev(v) - ev(u)) < 1e-7 for u in uniq):
            uniq.append(v)
    if len(uniq) < 2:
        return None
    t1 = uniq[0]
    t2 = next((v for v in uniq[1:] if abs((ev(t1).conjugate() * ev(v)).imag) > 1e-7), None)
    if t2 is None:
        return None

    out_polys = []
    for r in sorted(faces):
        vs, cur = [], list(base[r])
        for i in faces[r]:
            vs.append(list(cur))
            e = eidx[i]
            cur = [cur[t] + K[t][e] * dirs[i] for t in range(d)]
        out_polys.append({"n": len(ps[reps[r]]["v"]), "v": vs})
    return {"d": d, "radius": rad, "cellPolygons": out_polys, "basis": [t1, t2],
            "E": E, "F": len(reps), "V": len(vo.lattice_reps(rp, basis))}


def chart2(polys, basis, tol=1e-9):
    """The family as sliders, ANCHORED on the engine's own developed geometry.

    `chart` rebuilt the cell by walking the dart map and picked lattice vectors out of the walk's
    discrepancies. Those are genuine translations but need not be a BASIS, and a wrong pair doubles the
    covering — which the closure system cannot see, and the covering check rejected all 144 of them.

    So do not rebuild what is already correct. The engine hands over exact face coordinates and an exact
    T1, T2 for the member it developed; every position is LINEAR in the edge lengths, so all that is
    missing is the DERIVATIVE of each vertex with respect to each coordinate. Those come from propagating
    d(position) = K_i[e] * direction across a patch of lattice translates, starting from one pinned
    vertex. T1 and T2 keep the values the engine gave them and pick up the derivative measured between a
    vertex and its own translate.

    Edges are identified by midpoint modulo the lattice — the same key `build_map` pairs darts with — so
    no dart bookkeeping is needed and the patch labels itself.

    TWO CORRECTIONS, 2026-08-18, after the first version shipped 146 rows that were 26 tilings.

    1. `TK.smooth` runs before `refine`. Without it the system carried one variable per edge of the
       SPLIT map, including splits at points that are a corner of no tile, and those coordinates move
       nothing: the rectangle grid came out as a 3-parameter family whose first and third sliders were
       the same width. Every such coordinate is gone from the cone before it is built.

    2. The anchor is the developed member's own EDGE LENGTHS, not the all-ones vector. After smoothing a
       side that was 1 + 1 is a single edge of length 2, so all-ones is no longer a point of the cone.
       The coordinates are the free edges (kernel(...) puts a 1 in each free column), so the developed
       coordinate vector is read straight off the geometry, and the residual check that it lies in
       ker(A) replaces the old all-ones guard.

    Scale is then removed by PINNING one coordinate. Scaling acts on the cone as c -> lambda*c, so the
    slice {c : c_j = c0_j} meets every similarity class exactly once: no member is lost and no member is
    reachable twice. The pinned edge is the longest one at the developed member, which makes it the
    natural unit the others are read against.
    """
    Sm = vo.S()
    rp = TK.refine(TK.smooth([p for p in polys if abs(Sm.signed_area(p["v"])) > Sm.ZERO_AREA], basis), basis)
    b0, b1 = basis
    det = (b0.conjugate() * b1).imag
    if abs(det) < 1e-12:
        return None

    def frac(z):
        a = (z.real * b1.imag - b1.real * z.imag) / det
        b = (b0.real * z.imag - z.real * b0.imag) / det
        return a, b

    def ekey(m):
        a, b = frac(m)
        return (round((a % 1.0) % 1.0, 5), round((b % 1.0) % 1.0, 5))

    # edge classes and the closure system, all keyed geometrically
    eidx, elen = {}, {}
    for p in rp:
        v = p["v"]
        for j in range(len(v)):
            a, b = v[j], v[(j + 1) % len(v)]
            k = ekey((a + b) / 2)
            if k not in eidx:
                eidx[k] = len(eidx)
                elen[eidx[k]] = abs(b - a)
    E = len(eidx)
    rows = []
    for p in rp:
        v = p["v"]
        m = len(v)
        rx, ry = [0.0] * E, [0.0] * E
        dirs = []
        for j in range(m):
            a, b = v[j], v[(j + 1) % m]
            L = abs(b - a)
            if L < TOL:
                return None
            d = (b - a) / L
            dirs.append(d)
            e = eidx[ekey((a + b) / 2)]
            rx[e] += d.real
            ry[e] += d.imag
        rows += [rx, ry]
        sides, lens = [], []
        for j in range(m):
            if j == 0 or abs(dirs[j] - dirs[j - 1]) > 1e-9:
                sides.append([0.0] * E)
                lens.append(0.0)
            a, b = v[j], v[(j + 1) % m]
            sides[-1][eidx[ekey((a + b) / 2)]] += 1.0
            lens[-1] += abs(b - a)
        if len(sides) > 1 and abs(dirs[0] - dirs[-1]) <= 1e-9:
            t, tl = sides.pop(), lens.pop()
            sides[0] = [x + y for x, y in zip(sides[0], t)]
            lens[0] += tl
        if all(abs(x - lens[0]) < 1e-6 for x in lens):
            for s in sides[1:]:
                rows.append([x - y for x, y in zip(s, sides[0])])

    K, free = kernel(rows, E, tol)
    dim = len(K)
    if dim < 2:
        return None                     # only scale: the tiling is rigid, which is how it already ships

    # The developed member, in coordinates. K_i carries a 1 in free column i and 0 in the others, so the
    # coordinate of a kernel vector is just its entry there — no solve, only a check that the developed
    # lengths really are a kernel vector.
    c0 = [elen[f] for f in free]
    if min(c0) <= 1e-7:
        return None
    for e in range(E):
        if abs(sum(c0[i] * K[i][e] for i in range(dim)) - elen[e]) > 1e-6:
            return None                 # the developed lengths are not in ker(A): the system is wrong

    # derivative field over a patch of translates, from one pinned vertex
    pt = lambda z: (round(z.real, 5), round(z.imag, 5))
    adj = {}
    for i in range(-2, 3):
        for j in range(-2, 3):
            t = i * b0 + j * b1
            for p in rp:
                v = p["v"]
                m = len(v)
                for q in range(m):
                    a, b = v[q] + t, v[(q + 1) % m] + t
                    L = abs(b - a)
                    e = eidx[ekey((a + b) / 2)]
                    dd = (b - a) / L
                    adj.setdefault(pt(a), []).append((pt(b), e, dd))
                    adj.setdefault(pt(b), []).append((pt(a), e, -dd))
    start = pt(rp[0]["v"][0])
    deriv = {start: [0j] * dim}
    stack = [start]
    while stack:
        u = stack.pop()
        for (w, e, dd) in adj.get(u, ()):
            nv = [deriv[u][i] + K[i][e] * dd for i in range(dim)]
            if w not in deriv:
                deriv[w] = nv
                stack.append(w)
            elif any(abs(deriv[w][i] - nv[i]) > 1e-6 for i in range(dim)):
                return None  # the derivative field is not closed: the system is wrong, not the cell

    def dvec(z):
        return deriv.get(pt(z))

    # PIN the longest developed edge and drop its column: that kills the scale direction exactly.
    pin = max(range(dim), key=lambda i: c0[i])
    keep = [i for i in range(dim) if i != pin]
    d = len(keep)

    base = rp[0]["v"][0]
    dT = []
    for T in (b0, b1):
        a, b = dvec(base), dvec(base + T)
        if a is None or b is None:
            return None
        dT.append([b[i] - a[i] for i in keep])

    out = []
    for p in rp:
        vs = []
        for z in p["v"]:
            g = dvec(z)
            if g is None:
                return None
            vs.append((z, [g[i] for i in keep]))
        out.append({"n": p.get("n", len(p["v"])), "v": vs})

    # a slider box inside the positivity cone, by interval arithmetic on every edge, with the pinned
    # coordinate held at its developed value
    def ok(rad):
        for e in range(E):
            lo = c0[pin] * K[pin][e]
            for i in keep:
                lo += min(K[i][e] * (c0[i] - rad), K[i][e] * (c0[i] + rad))
            if lo <= 1e-7:
                return False
        return True
    if not ok(1e-4):
        return None
    a_, b_ = 0.0, 0.95 * max(c0)
    for _ in range(50):
        mid = (a_ + b_) / 2
        if ok(mid):
            a_ = mid
        else:
            b_ = mid
    return {"dim": dim, "d": d, "c0": [c0[i] for i in keep], "radius": a_ * 0.98,
            "pin": {"edge": free[pin], "length": c0[pin]},
            "cellPolygons": out, "basis": [(b0, dT[0]), (b1, dT[1])],
            "E": E, "F": len(rp), "V": None}
