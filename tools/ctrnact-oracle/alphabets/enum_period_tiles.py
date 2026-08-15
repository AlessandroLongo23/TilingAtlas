#!/usr/bin/env python3
"""Enumerate EQUILATERAL tiles whose interior-angle word has period p, on the 2pi/D grid.

The period-p family generalizes what the palettes already carry:
  p = 1  regular polygons ({3,4,6,8,12,24} at D=24)
  p = 2  the isotoxal 2n-gons — convex (rhombi, ...) and star (3*3, 4*2, ...)
  p = 3  new: 3n-gons with angles (a,b,c) repeated n times
  ...

Closure is FREE for n >= 2. Walking one period advances the edge direction by a fixed
rotation 360/n (the exterior angles of one period sum to 180p - sum(a) = 360/n), so the
boundary is s * (1 + w + w^2 + ... + w^(n-1)) with w a primitive n-th root of unity, and
that geometric sum is 0. The only arithmetic condition is that the angles live on the
grid: sum(a) = (D/2)*p - D/n units, so n must divide D.

What is NOT free is simplicity. A closed equilateral boundary can self-cross, and the
walk can revisit a vertex; both are tested here explicitly.

Usage:
  python3 enum_period_tiles.py --p 3 --D 24 --classify
  python3 enum_period_tiles.py --p 3 --D 24 --emit convex --name equi3-cx-z24 --out palettes/equi3-cx-z24.json
"""
import argparse, cmath, itertools, json, math, sys

TOL = 1e-9


def divisors(n):
    return [d for d in range(1, n + 1) if n % d == 0]


def walk(angles, D):
    """Vertices of the equilateral polygon with this cyclic interior-angle word (D-units)."""
    pts, z, d = [], complex(0, 0), 0
    for a in angles:
        pts.append(z)
        z += cmath.exp(2j * math.pi * d / D)
        d += (D // 2 - a)  # exterior turn, in D-units
    return pts, z


def _cross(o, a, b):
    return (a.real - o.real) * (b.imag - o.imag) - (a.imag - o.imag) * (b.real - o.real)


def _seg_hits(p1, p2, p3, p4, adjacent):
    """True if segments p1p2 and p3p4 share a point they should not."""
    d1, d2 = _cross(p3, p4, p1), _cross(p3, p4, p2)
    d3, d4 = _cross(p1, p2, p3), _cross(p1, p2, p4)
    if abs(d1) > TOL and abs(d2) > TOL and abs(d3) > TOL and abs(d4) > TOL:
        if (d1 > 0) != (d2 > 0) and (d3 > 0) != (d4 > 0):
            return True
        return False
    # collinear or touching: adjacent edges may share exactly their common endpoint
    def on(p, q, r):  # r on segment pq
        return (abs(_cross(p, q, r)) < TOL
                and min(p.real, q.real) - TOL <= r.real <= max(p.real, q.real) + TOL
                and min(p.imag, q.imag) - TOL <= r.imag <= max(p.imag, q.imag) + TOL)
    touches = [r for r in (p3, p4) if on(p1, p2, r)] + [r for r in (p1, p2) if on(p3, p4, r)]
    if not touches:
        return False
    if adjacent:
        # the shared endpoint is expected; anything more means the edges overlap or fold back
        shared = [r for r in touches if min(abs(r - p1), abs(r - p2)) < TOL
                  and min(abs(r - p3), abs(r - p4)) < TOL]
        return len(touches) > len(shared) or len(set((round(r.real, 9), round(r.imag, 9)) for r in touches)) > 1
    return True


def is_simple(pts):
    n = len(pts)
    for i in range(n):
        for j in range(i + 1, n):
            adjacent = (j == i + 1) or (i == 0 and j == n - 1)
            if _seg_hits(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n], adjacent):
                return False
    # repeated vertices (a pinch point the segment test can miss when edges only meet there)
    keys = [(round(p.real, 7), round(p.imag, 7)) for p in pts]
    return len(set(keys)) == n


def word_period(w):
    for p in range(1, len(w) + 1):
        if len(w) % p == 0 and all(w[i] == w[i % p] for i in range(len(w))):
            return p
    return len(w)


def enumerate_period(p, D, amin=1, amax=None, allow_straight=False, simple_only=True,
                     allow_degenerate=False):
    """All period-p equilateral TILES on the D-grid, keyed by (n_periods, angle tuple).

    Self-intersecting boundaries are dropped by default: a polygon whose boundary crosses itself is
    not a tile, so counting one inflates the family. The angle-sum condition does NOT catch them —
    it forces turning number 1 for every closing word, self-intersecting or not — so the segment test
    in is_simple() is the only thing separating them. At p=3, D=24 it drops 23 of 390, each one a
    single very reflex corner (240-345 deg) against two sharp ones: [330,15,15] crosses its own
    edge 1 with edge 3 at (0.583, -0.241), and [240,60,60] revisits (1,0) as its fourth vertex.
    Pass simple_only=False (CLI: --include-selfint) to get them back for inspection.
    """
    amax = amax if amax is not None else D - 1
    out = []
    for n in divisors(D):
        if n < 2:
            continue
        total = (D // 2) * p - D // n
        if total < p * amin or total > p * amax:
            continue
        seen = set()
        for combo in itertools.product(range(amin, amax + 1), repeat=p):
            if sum(combo) != total:
                continue
            if not allow_straight and any(a == D // 2 for a in combo):
                continue
            # quotient by the dihedral symmetry of the cyclic word (rotation + reversal)
            reps = [tuple(combo[i:] + combo[:i]) for i in range(p)]
            rev = tuple(reversed(combo))
            reps += [tuple(rev[i:] + rev[:i]) for i in range(p)]
            key = max(reps)
            if key in seen:
                continue
            seen.add(key)
            if word_period(list(key)) != p and not allow_degenerate:
                # A word whose true period is shorter belongs to that shorter family, and listing it here
                # too would show the regular hexagon twice in a CONCRETE palette. In a QUOTIENT palette it
                # is the opposite: the shape `e3-6` means "equilateral hexagon with corner classes
                # @0,@1,@2" and the regular hexagon is a POINT of it, so dropping (120,120,120) makes
                # every family that passes through the regular hexagon unreachable — the solver has to
                # name that tile with the rigid symbol `6`, which pins the whole system. AL, twice, on
                # rigid-039 and period-k3-271: "the regular hexagon can be squeezed and the irregular
                # morph to accommodate for it." This flag is what lets the alphabet say that.
                continue
            angles = list(key) * n
            pts, close = walk(angles, D)
            assert abs(close) < 1e-7, f"non-closing {key} n={n}"
            convex = all(a < D // 2 for a in key)
            simple = is_simple(pts)
            if simple_only and not simple:
                continue
            out.append({
                "period": p, "n": n, "L": p * n, "angles": list(key),
                "convex": convex and simple, "simple": simple,
                "cls": "convex" if (convex and simple) else ("concave" if simple else "star"),
            })
    return out


FAMCHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


def main():
    ap = argparse.ArgumentParser()
    # Comma-separated so ONE palette can carry several periods at once (`--p 2,3` = regular + isotoxal +
    # period-3). The periods are independent families, so this is a concatenation, not a new enumeration:
    # word_period() already rejects a word whose true period is shorter, so p=2 and p=3 cannot overlap.
    ap.add_argument("--p", default="3", help="period, or a comma-separated list (e.g. 2,3)")
    ap.add_argument("--D", type=int, default=24)
    ap.add_argument("--classify", action="store_true")
    ap.add_argument("--emit", choices=["convex", "simple", "all"])
    ap.add_argument("--name")
    ap.add_argument("--out")
    ap.add_argument("--regular", default="3,4,6,8,12", help="regular n-gons to include in the emitted palette")
    ap.add_argument("--maxL", type=int, default=0, help="drop tiles with more than this many edges (0 = no cap)")
    # A thin corner is what makes the vertex-configuration enumeration explode, not a long tile: on the
    # p=2,3 palette at D=24 the single 15-degree rhombus e2-4-165.15 is 37x of the space and the 30-degree
    # corners another 17x, while capping edge count does nothing at all. It is also a COMPLETENESS knob in
    # the honest direction: maxValence caps a vertex at 12 corners, so a 15-degree corner (24-fold vertex)
    # and a 30-degree one (12-fold) are already being truncated by that cap. Cutting at 45 degrees leaves
    # max valence 8, where the cap never binds.
    ap.add_argument("--min-angle", type=float, default=0.0, dest="min_angle",
                    help="drop tiles with any corner below this many DEGREES (0 = no cut)")
    ap.add_argument("--allow-degenerate", action="store_true", dest="allow_degenerate",
                    help="keep period-p words whose true period is SHORTER (the regular hexagon as "
                         "e3-6-120.120.120). Wrong for a concrete palette — it lists the tile twice — and "
                         "necessary for a quotient one, where it is the point of the shape at which the "
                         "tile happens to be regular.")
    ap.add_argument("--include-selfint", action="store_true",
                    help="keep self-intersecting boundaries (not tiles; for inspection only)")
    args = ap.parse_args()
    periods = [int(x) for x in str(args.p).split(",") if x.strip()]

    tiles = [t for p in periods for t in enumerate_period(p, args.D, simple_only=not args.include_selfint,
                                                         allow_degenerate=args.allow_degenerate)]
    if args.classify:
        dropped = 0
        if not args.include_selfint:
            dropped = sum(len(enumerate_period(p, args.D, simple_only=False)) for p in periods) - len(tiles)
        print(f"period p={','.join(map(str, periods))} on the 2pi/{args.D} grid"
              + (f"  ({dropped} self-intersecting boundaries excluded: not tiles)" if dropped else ""))
        by = {}
        for t in tiles:
            by.setdefault((t["n"], t["L"]), []).append(t)
        cols = [("convex", "convex"), ("concave", "concave")] + \
               ([("star", "selfint")] if args.include_selfint else [])
        print(f"{'n':>3} {'L':>4} " + " ".join(f"{h:>8}" for _, h in cols) + f" {'total':>6}")
        tot = [0] * len(cols)
        for (n, L), ts in sorted(by.items()):
            row = [sum(1 for t in ts if t["cls"] == key) for key, _ in cols]
            tot = [a + b for a, b in zip(tot, row)]
            print(f"{n:>3} {L:>4} " + " ".join(f"{v:>8}" for v in row) + f" {len(ts):>6}")
        print(f"{'':>3} {'ALL':>4} " + " ".join(f"{v:>8}" for v in tot) + f" {sum(tot):>6}")
        print()
        for t in sorted(tiles, key=lambda t: (t["n"], t["angles"])):
            if t["cls"] == "convex":
                print(f"  convex  L={t['L']:<3} angles={t['angles']}  ({[a*15 for a in t['angles']]} deg)")
        return

    if not args.emit:
        return
    keep = [t for t in tiles if (args.emit == "all"
                                 or (args.emit == "convex" and t["cls"] == "convex")
                                 or (args.emit == "simple" and t["simple"]))]
    if args.maxL:
        keep = [t for t in keep if t["L"] <= args.maxL]
    if args.min_angle:
        cut = args.min_angle / (360.0 / args.D)
        keep = [t for t in keep if min(t["angles"]) >= cut - 1e-9]
    spec = {"name": args.name, "D": args.D, "pinnedLegacy": False, "maxValence": 12,
            "comment": f"Regular {{{args.regular}}} + all period-{'/'.join(map(str, periods))} equilateral "
                       f"tiles ({args.emit}) on the zeta{args.D} grid, from enum_period_tiles.py."
                       + (f" Corners below {args.min_angle:g} deg excluded." if args.min_angle else ""),
            "pruneOverlap": True, "tiles": []}
    for n in [int(x) for x in args.regular.split(",") if x]:
        spec["tiles"].append({"kind": "regular", "n": n, "name": str(n),
                              "famchar": {3: "3", 4: "4", 6: "6", 8: "8", 12: "c", 24: "x"}.get(n, str(n))})
    for i, t in enumerate(sorted(keep, key=lambda t: (t["period"], t["n"], t["angles"]))):
        nm = f"e{t['period']}-{t['L']}-" + ".".join(str(a * (360 // args.D)) for a in t["angles"])
        spec["tiles"].append({"kind": "composite", "name": nm,
                              "angles": t["angles"] * t["n"],
                              "famchar": "e" + FAMCHARS[i % len(FAMCHARS)]})
    out = args.out or f"palettes/{args.name}.json"
    json.dump(spec, open(out, "w"), indent=1)
    from collections import Counter
    per = Counter(t["period"] for t in keep)
    print(f"wrote {out}: {len(spec['tiles'])} tiles ("
          + ", ".join(f"{n} period-{p}" for p, n in sorted(per.items()))
          + f", {len(spec['tiles']) - len(keep)} regular)")


if __name__ == "__main__":
    main()
