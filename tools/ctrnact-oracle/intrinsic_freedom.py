#!/usr/bin/env python3
"""intrinsic_freedom.py — how many parameters a DEVELOPED tiling really has, independent of any palette.

Why this exists (AL, 2026-08-09, on period-k3-271 and twice before on rigid-039):

    "the regular hexagon can be squeezed and the irregular morph to accommodate for it"

Every P the atlas reports so far is palette-relative. `export_period_families.flex_model` counts the null
space over the ALPHABET's corner classes, so a tile the alphabet calls `6` contributes a constant, and a
tiling that deforms is reported rigid because the palette has no symbol for what it deforms into. The
quotient is no better in this respect and is worse in another: it identifies all tiles of one shape, so
two hexagons of different angles need two different shapes, and the alphabet offers exactly two (`e3-6`
and its mirror). period-k3-271 needed a third, so its second hexagon had to be the rigid `6`.

This asks the question the palette cannot. Take the developed cell, read its combinatorial map, and count
the freedom of the tiling ITSELF:

    variables    one angle per dart — every corner of every tile in the primitive cell
    per TILE     its L angles sum to (L−2)·180                                     [1 linear]
    per TILE     the unit-edge boundary closes: Σ exp(i·φⱼ) = 0, φⱼ the running
                 turn — the constraint that makes the polygon a polygon           [2 nonlinear]
    per VERTEX   the incident angles sum to 360                                    [1 linear]

    dimension = #darts − rank(Jacobian at the current angles)

The closure rows are nonlinear, so this is the LOCAL dimension at the tiling in hand, which is the honest
answer to "can I move it from here" and is what a slider needs. Rank comes from an SVD-free Gram–Schmidt
with a tolerance, and the tolerance is checked against the singular-value gap rather than assumed.

⚑ It says nothing about whether the deformation stays embedded — that is what the range scan measures —
only whether the tiling is a point or lies on a curve. A tiling reported with dimension 0 here is RIGID in
the strong sense: no palette will ever give it a slider.

Gate: `--gate` runs it on the shelf, where the answer is known from the other side. Every entry that
already ships a P-parameter family must come out with dimension ≥ P (its palette cannot have invented
freedom), and the 11 Archimedean tilings must come out at the freedom of their own angle systems.
"""
import argparse
import cmath
import json
import glob
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tiling_key as TK
import vertex_orbits as vo

D2R = math.pi / 180.0


def _rank(rows, tol=1e-7):
    """Rank by modified Gram–Schmidt. Returns (rank, smallest kept norm, largest dropped norm) so the
    caller can see whether the tolerance actually separated anything."""
    basis = []
    kept, dropped = [], []
    for r in rows:
        v = list(r)
        for u in basis:
            d = sum(a * b for a, b in zip(v, u))
            v = [a - d * b for a, b in zip(v, u)]
        n = math.sqrt(sum(x * x for x in v))
        if n > tol:
            basis.append([x / n for x in v])
            kept.append(n)
        else:
            dropped.append(n)
    return len(basis), (min(kept) if kept else float("inf")), (max(dropped) if dropped else 0.0)


def freedom(polys, basis, tol=1e-7):
    """(dimension, info) — local parameter count of the tiling, or None if the map cannot be built."""
    m = TK.build_map(polys, basis)
    if m is None:
        return None, {"reason": "map"}
    labels, sigma, alpha, reps, ps, darts = m
    n = len(darts)
    idx = {d: i for i, d in enumerate(darts)}
    Sm = vo.S()

    # current angles, in degrees, in dart order
    ang = [Sm.angle_at(ps[reps[r]]["v"], j) for (r, j) in darts]

    # darts grouped per tile, in cyclic order
    tiles = {}
    for (r, j) in darts:
        tiles.setdefault(r, []).append((r, j))
    for r in tiles:
        tiles[r].sort(key=lambda t: t[1])

    # Vertices of the map: orbits of σ∘α. Walk across the edge, then step to the next corner of the tile
    # you land on, and you rotate around the shared point.
    #
    # ⚑ It is σ∘α and NOT α∘σ, and the two are not interchangeable. With α∘σ the cycles of a concave
    # tiling summed to 300/330/390/450 instead of 360 — they are not vertices at all — while a symmetric
    # test case (the 1-tile hexagon cell) gave 360 either way and hid it. That is why `verify` below is
    # not optional: the tiling in hand MUST satisfy its own constraints, and a dimension computed from a
    # system it does not satisfy is a number about nothing.
    nxt = [sigma[alpha[d]] for d in range(n)]
    seen, cycles = set(), []
    for d in range(n):
        if d in seen:
            continue
        cyc, x = [], d
        while x not in seen:
            seen.add(x)
            cyc.append(x)
            x = nxt[x]
        cycles.append(cyc)

    rows = []
    # per TILE: angle sum
    for r, ds in sorted(tiles.items()):
        row = [0.0] * n
        for d in ds:
            row[idx[d]] = 1.0
        rows.append(row)
    # per VERTEX: angle sum
    for cyc in cycles:
        row = [0.0] * n
        for d in cyc:
            row[d] += 1.0
        rows.append(row)
    # per TILE: unit-edge closure, differentiated. Walking the boundary, edge j points along
    # φ_j = Σ_{m<j} (180 − a_m); closure is Σ_j exp(i φ_j) = 0, so ∂/∂a_m of the real and imaginary parts
    # picks up −i·exp(i φ_j) for every j strictly after m.
    for r, ds in sorted(tiles.items()):
        L = len(ds)
        phi, e = 0.0, []
        for j in range(L):
            e.append(cmath.exp(1j * phi))
            phi += (180.0 - ang[idx[ds[j]]]) * D2R
        gr, gi = [0.0] * n, [0.0] * n
        for mi in range(L):
            s = sum(e[j] for j in range(mi + 1, L)) * (-1j) * D2R
            gr[idx[ds[mi]]] += s.real
            gi[idx[ds[mi]]] += s.imag
        rows.append(gr)
        rows.append(gi)

    # SELF-CHECK: the tiling in hand is a solution of its own system, or the system is wrong.
    resid = []
    for r, ds in sorted(tiles.items()):
        resid.append(sum(ang[idx[d]] for d in ds) - (len(ds) - 2) * 180.0)
    for cyc in cycles:
        resid.append(sum(ang[d] for d in cyc) - 360.0)
    for r, ds in sorted(tiles.items()):
        phi, z = 0.0, 0j
        for j in range(len(ds)):
            z += cmath.exp(1j * phi)
            phi += (180.0 - ang[idx[ds[j]]]) * D2R
        resid.append(z.real)
        resid.append(z.imag)
    worst = max(abs(x) for x in resid)
    if worst > 1e-6:
        return None, {"reason": "self-check", "residual": worst}

    rk, smallest_kept, largest_dropped = _rank(rows, tol)
    return n - rk, {"darts": n, "tiles": len(tiles), "vertices": len(cycles), "rows": len(rows),
                    "rank": rk, "gap": (smallest_kept, largest_dropped), "residual": worst}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shelf", default=None, help="a built shelf json (its -k*.json shards are included)")
    ap.add_argument("--id", action="append", default=[], help="only these ids")
    ap.add_argument("--gate", action="store_true",
                    help="check every parametric entry has intrinsic dimension >= its shipped P")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
    shelf = args.shelf or os.path.join(root, "public", "reference-atlas-period.json")
    files = [shelf] + sorted(glob.glob(shelf.replace(".json", "-k*.json")))
    entries = [e for f in files for e in json.load(open(f))]
    if args.id:
        entries = [e for e in entries if e["id"] in args.id or e.get("legacyId") in args.id]
    if args.limit:
        entries = entries[:args.limit]
    bad, rigid, flexible, unmeasured = 0, 0, 0, 0
    for e in entries:
        polys, basis = vo.float_cell(e["renderCell"])
        dim, info = freedom(polys, basis)
        P = len(e["paramCell"]["params"]) if e.get("paramCell") else 0
        if dim is None:
            why = info.get("reason")
            extra = f" residual {info['residual']:.2e}" if "residual" in info else ""
            print(f"  {e['id']:<18} NOT MEASURED ({why}{extra})")
            unmeasured += 1
            continue
        (rigid if dim == 0 else flexible).__class__
        if dim == 0:
            rigid += 1
        else:
            flexible += 1
        flag = ""
        if dim < P:
            flag = "  ⚑ LESS than its shipped P — the palette cannot invent freedom, so this is a bug"
            bad += 1
        elif P == 0 and dim > 0:
            flag = f"  ⚑ ships RIGID but has {dim} intrinsic parameter(s)"
        if args.id or flag or not args.gate:
            print(f"  {e['id']:<18} shipped P={P}  intrinsic dim={dim}   "
                  f"darts={info['darts']} tiles={info['tiles']} verts={info['vertices']}{flag}")
    print(f"\n{len(entries)} entries: {rigid} intrinsically rigid, {flexible} with at least one parameter, "
          f"{unmeasured} not measured")
    if args.gate:
        print(f"gate: {'PASS' if bad == 0 else f'FAIL — {bad} entries report less freedom than they ship'}")
        sys.exit(0 if bad == 0 else 1)


if __name__ == "__main__":
    main()
