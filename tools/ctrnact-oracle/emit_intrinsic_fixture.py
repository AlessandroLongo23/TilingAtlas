#!/usr/bin/env python3
"""emit_intrinsic_fixture.py — the parity fixture for lib/utils/intrinsicCell.test.ts.

An intrinsic cell is SOLVED, not evaluated, so there are two solvers to keep honest: this one and the
TypeScript one the browser runs. They deliberately differ inside — Python takes a least-norm `lstsq`
step, TypeScript a damped normal-equation one, because a browser has no LAPACK — and that is fine only
because the chart's fixed point is determined by the pinned angles, not by the route taken to it. This
fixture is what turns "should be fine" into a test: real records, real slider positions, and the exact
cell Python develops there.

Precedent: `scan-family-ranges.py:ev` mirrors `paramCell.ts:evalTerms` for the Laurent path and the two
have drifted apart twice.

Run (after export_intrinsic_cells.py):
  python3 emit_intrinsic_fixture.py --cells ../../experiments/period-oracle/intrinsic-cells.json \
      --out ../../lib/utils/__fixtures__/intrinsic-cells.fixture.json
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import develop_map as DM
import intrinsic_family as IFM
import vertex_orbits as vo

# Deliberately not the round fractions of each range: a chart that only agrees at the anchor and the
# midpoint agrees where the tiling's symmetry does the work.
FRACTIONS = [0.3719, -0.4411, 0.8237]


def sample(rec, entry, n_points):
    """Cases for one record: the anchor, then ONE axis at a time moved to a fraction of its own range.

    ⚑ One axis at a time, not all of them together, and the first version got this wrong. Per-axis ranges
    are scanned with the other axes held, so they describe a CROSS of certified intervals; moving every
    axis to 73% of its own range lands off that cross, in a place where the angles still solve but the
    tiles overlap. Python develops there quite happily — `develop` answers "what does this map look like
    at these angles", not "is this a tiling" — while `evaluateIntrinsic` checks the area certificate and
    refuses, exactly as it should. The two then disagree for a reason that is not a bug in either. Every
    case here is checked to be a tiling before it goes in the fixture.
    """
    fam, why = IFM.from_cell(entry["renderCell"])
    if fam is None:
        return None
    combo = [[(int(d), int(c)) for d, c in row] for row in rec["basisCombo"]]
    fam.free = list(rec["freeDarts"])
    fam.basic = [i for i in range(fam.n) if i not in set(fam.free)]
    if not fam.free:
        return None
    home = fam.angles0[fam.free].copy()

    def case_at(t):
        a, _why = fam.chart(t, warm=fam.angles0)
        if a is None:
            return None
        polys, basis, _i = DM.develop(fam, a, combo)
        if polys is None:
            return None
        Sm = vo.S()
        ok, _r = Sm.health(polys, basis)
        area = sum(abs(Sm.signed_area(p["v"])) for p in polys)
        if not ok or abs(area - Sm.det_of(basis)) > 1e-9:
            return None
        return {
            "t": [round(float(x), 9) for x in t],
            "cellPolygons": [{"n": p["n"], "vertices": [[round(z.real, 10), round(z.imag, 10)] for z in p["v"]]}
                             for p in polys],
            "basis": [[round(b.real, 10), round(b.imag, 10)] for b in basis],
        }

    cases = []
    anchor = case_at(home.copy())
    if anchor:
        cases.append(anchor)
    for j, p in enumerate(rec["params"]):
        lo, hi = p["alphaRangeDegOpen"]
        for f in FRACTIONS:
            t = home.copy()
            t[j] = home[j] + (hi - home[j]) * f if f >= 0 else home[j] + (home[j] - lo) * f
            c = case_at(t)
            if c:
                cases.append(c)
            if len(cases) >= n_points:
                return cases
    return cases


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--count", type=int, default=8)
    ap.add_argument("--points", type=int, default=9)
    args = ap.parse_args()
    recs = {r["id"]: r for r in json.load(open(args.cells))}
    entries = {e["id"]: e for e in IFM.shelf_entries()}

    # spread over dimension: a 1-parameter family and a 19-parameter one exercise different code
    by_d = {}
    for r in recs.values():
        by_d.setdefault(len(r["params"]), []).append(r)
    picked = []
    for d in sorted(by_d, reverse=True):
        picked.append(sorted(by_d[d], key=lambda r: r["id"])[0])
        if len(picked) >= args.count:
            break
    out = []
    for r in picked:
        cases = sample(r, entries[r["id"]], args.points)
        if not cases:
            continue
        out.append({
            "id": r["id"],
            "freeDarts": r["freeDarts"],
            "params": r["params"],
            "intrinsic": {k: r[k] for k in ("kind", "faceSizes", "facePeriods", "alpha", "angles0", "orient", "tree", "basisCombo")},
            "cases": cases,
        })
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    json.dump(out, open(args.out, "w"), separators=(",", ":"))
    print(f"{len(out)} records, {sum(len(r['cases']) for r in out)} cases → {args.out} "
          f"({os.path.getsize(args.out) / 1024:.0f} KB)")
    print("  dimensions: " + ", ".join(f"{r['id']} d={len(r['params'])}" for r in out))


if __name__ == "__main__":
    main()
