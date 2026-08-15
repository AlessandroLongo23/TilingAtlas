#!/usr/bin/env python3
"""Develop PERIOD-QUOTIENT solutions into parametric family cells.

The quotient search (gen_alphabet --quotient-period) returns combinatorial types whose corner classes are
(shape, position) with no angles. `quotient_feasible` decides which of them a single angle assignment can
close. This turns each survivor into the same record `export_period_families.py` emits, so the shelf
builder consumes it unchanged.

The join between the two halves is one line: patch `tab.CLASS_UNITS` with the solved angles before
developing. Everything downstream — decode, flex_model, develop_multi, trace_faces_multi, the exact region
— reads the alphabet's units and needs no idea where they came from.

⚑ The seed must be an INTEGER point of the polytope, because the exact development indexes edge directions
by ζ_D power and a non-integral angle has no direction index. Feasibility is over ℚ, so a family can be
real and have no grid seed at this D; those are reported, not silently dropped, and they are exactly the
families the concrete grid search could never have reached either.

⚑ A quotient block is ALREADY a family — that is the point of the quotient — so there is no grouping stage
here. What remains is deduplication: several blocks can be different representations of one family, which
is the same canonical-labelled-map key the concrete exporter uses.

Usage:
  python3 export_quotient_families.py --tables tables/equi3q-cx-z24 \
      --catalog 1:tables/_work/q-e3-k2/out/pruned --catalog 2:tables/_work/q-e3-k2/out/pruned \
      --out ../../experiments/period-oracle/ctrnact-quotient-families.cells.json \
      --log ../../experiments/results/quotient-families-export.log
"""
import argparse, importlib.util, itertools, json, os, re, sys, time
from fractions import Fraction

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import family_flex as ff
import export_period_families as epf
import vertex_orbits as vo

_spec = importlib.util.spec_from_file_location(
    "qfeas", os.path.join(os.path.dirname(os.path.abspath(__file__)), "quotient_feasible.py"))
qf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(qf)

LOG = None


def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    if LOG:
        LOG.write(line + "\n")
        LOG.flush()


def solution_form(vt, D):
    """(var, part, basis, free, rigid_angles) — the polytope in parametric form, or None if inconsistent.

    x = part + Σ tⱼ·basisⱼ over the free columns, exactly as `quotient_feasible.analyse` builds it, from
    the same `build_system` so the seed search and the feasibility verdict can never drift apart.
    """
    var, shapes, rows, rigid = qf.build_system(vt, D)
    if not var:
        return None
    N = len(var)
    R, piv = qf.rref(rows, N)
    for r in R:
        if all(x == 0 for x in r[:N]) and r[N] != 0:
            return None
    free = [c for c in range(N) if c not in piv]
    part = [Fraction(0)] * N
    for i, c in enumerate(piv):
        part[c] = R[i][N]
    basis = []
    for fc in free:
        v = [Fraction(0)] * N
        v[fc] = Fraction(1)
        for i, c in enumerate(piv):
            v[c] = -R[i][fc]
        basis.append(v)
    return var, part, basis, free, rigid


def forced_equal(part, basis, N):
    """Corner-class pairs the linear system pins together at EVERY point of the family.

    The distinction that matters for a k label. If x_i = x_j only at the point the search happened to
    return, the family is fine and the seed is bad. If x_i − x_j ≡ 0 on the whole solution set, the two
    abstract classes are one geometric angle everywhere, the vertex types built on them are the same
    figure everywhere, and the block's k is inflated as a fact about the block, not about the seed.
    """
    return {(i, j) for i in range(N) for j in range(i + 1, N)
            if part[i] == part[j] and all(b[i] == b[j] for b in basis)}


def generic_seed(vt, D, ub):
    """(seed, info) — the MOST GENERIC integer point of the family's polytope.

    Replaces the first-found point (2026-08-09). Enumeration order is lexicographic and small values come
    first, so "first found" is systematically the most symmetric corner of the polytope: two abstract
    corner classes take equal angles, two abstract vertex types collapse into one figure, and the tiling
    that ships has visibly fewer orbits than its label claims. AL saw it directly on the k=3 tier ("this
    is really k=2, not k=3"). Measured with `vertex_orbits.orbit_count` on the first-found-seed export,
    12 of 103 families rendered a tiling with fewer orbits at their own default than the family has
    generically — 10 showing k=2 and 2 showing k=1 where the family is k=3. Re-exported with this seed,
    that count is 0.

    ⚑ It does not fix everything, and the previous session's note claimed more damage than exists. The
    same file also holds 7 families that are k=1 at EVERY parameter and 25 pinned tilings that are k=2 at
    their only parameter; no seed touches those, `vertex_orbits.stamp_records` is what corrects them. The
    "65 of 103 families and 29 of 70 pinned" recorded in docs/period-quotient-2026-08-09.md reproduces
    under neither reading — the orbit count gives 7 and the distinct-vertex-figure count 29 — so treat it
    as unverified and superseded by the numbers here.

    Generic here means: maximise the whole SORTED vector of gaps between corner angles the system does not
    force equal — smallest gap first, then the next, and so on — counting the fixed angles of the regular
    tiles in the same vertex as competitors, since a period corner landing on 120° collapses a figure just
    as thoroughly as landing on its neighbour. Ties break on the distance to the 0/180° walls (a corner at
    1 unit is a sliver nobody wants as a default), then lexicographically, so the choice is deterministic.

    ⚑ The sorted vector, not its minimum. Maximising `min(gaps)` looks equivalent and is not: a family
    whose hexagon corner is pinned at 60° by its own triangle vertex has an UNAVOIDABLE zero in the list,
    every candidate point scores min-gap 0, and the tiebreak then picks on wall distance — which chose
    (10,10,4) over (9,11,4) on 34 of 100 k=2 families, i.e. the coincident point, which is the exact bug
    this function exists to remove. Comparing the sorted vectors puts the shared zero first on both sides
    and lets the second entry decide.

    The polytope is small — free columns run over 1..ub−1 with ub = D/2 and P ≤ 3 — so this enumerates
    every integer point rather than searching, and `info["points"]` reports how many there were.
    """
    S = solution_form(vt, D)
    if S is None:
        return None, {}
    var, part, basis, free, rigid = S
    N = len(var)
    forced = forced_equal(part, basis, N)
    pairs = [(i, j) for i in range(N) for j in range(i + 1, N) if (i, j) not in forced]
    lo, hi = 1, int(ub) - 1
    best, best_score, npts = None, None, 0
    for vals in itertools.product(range(lo, hi + 1), repeat=len(free)):
        x = list(part)
        for t, b in zip(vals, basis):
            x = [xi + t * bi for xi, bi in zip(x, b)]
        if any(v.denominator != 1 or not (0 < v < ub) for v in x):
            continue
        npts += 1
        gaps = [abs(x[i] - x[j]) for i, j in pairs]
        gaps += [abs(x[i] - a) for i in range(N) for a in rigid]
        score = (tuple(sorted(gaps)),
                 min(min(v, ub - v) for v in x),
                 tuple(-v for v in vals))
        if best_score is None or score > best_score:
            best, best_score = x, score
    if best is None:
        return None, {"points": 0, "forced": len(forced)}
    stuck = [(i, j) for i, j in pairs if best[i] == best[j]]
    return ({k: int(best[j]) for k, j in var.items()},
            {"points": npts, "forced": len(forced), "coincident": len(stuck),
             "minGap": float(best_score[0][0]) if best_score[0] else None})


CLS = re.compile(r"^(e\d+-\d+'?)@(\d+)$")


def apply_seed(tab, seed, base_units):
    """Patch CLASS_UNITS with the solved angles; restore anything the seed does not mention."""
    for c, disp in enumerate(tab.CLASS_DISP):
        m = CLS.match(disp)
        tab.CLASS_UNITS[c] = seed.get((m.group(1), int(m.group(2))), base_units[c]) if m else base_units[c]


_sfr = None


def sfr():
    """scripts/scan-family-ranges.py, loaded lazily — its cell evaluation and labelled-cloud congruence
    are the same ones the range scan uses, so the two agree by construction."""
    global _sfr
    if _sfr is None:
        root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
        sp = importlib.util.spec_from_file_location("sfr", os.path.join(root, "scripts", "scan-family-ranges.py"))
        _sfr = importlib.util.module_from_spec(sp)
        sp.loader.exec_module(_sfr)
    return _sfr


def dedupe_congruent(records, log):
    """Merge families whose cells are the SAME TILING at their defaults.

    The concrete pipeline does this in build-period-atlas.ts by keying member SNAPSHOTS on the exact
    ℤ[ζ₂₄] congruence. Quotient families have no snapshots — their angles were solved, not enumerated —
    so the same argument runs directly on the developed cells: a tiling determines its deformation class,
    so two families of equal dimension whose cells are congruent are one family. Float congruence via the
    labelled centroid clouds in scan-family-ranges, which tries every largest-tile anchor and confirms an
    explicit isometry rather than trusting a radial fingerprint.
    """
    S = sfr()

    def samples(r):
        """Parameter tuples spread across the family's own region. Comparing DEFAULTS alone is not enough:
        the seed is whichever integer point the solver reached first, so two representations of one family
        routinely sit at different points of the same curve and read as different tilings."""
        n = {1: 9, 2: 5}.get(r["P"], 3)
        axes = []
        for p in r["params"]:
            lo, hi = p["alphaRangeDegOpen"]
            axes.append([lo + (hi - lo) * (i + 1) / (n + 1) for i in range(n)] + [p["defaultAlphaDeg"]])
        return list(itertools.product(*axes))

    def invariant(r):
        """Cheap NECESSARY condition for two families to be the same: same dimension, same multiset of tile
        sizes. Congruence is one cloud build per pair, so without a prefilter this is 435² and does not
        finish; with it only same-topology pairs reach `isometry_between`.

        ⚑ Cell AREA must not be in here, though it is the obvious third component. It varies along the
        curve, so two representations of one family sitting at different parameter points have different
        areas, and keying on it would block exactly the merges the sampling exists to find."""
        return (r["P"], tuple(sorted(len(q["vertices"]) for q in r["cellPolygons"])))

    keep, reps = [], []
    for r in records:
        pc = {"params": r["params"], "cellPolygons": r["cellPolygons"], "basis": r["basis"]}
        a0 = [p["defaultAlphaDeg"] for p in r["params"]]
        inv = invariant(r)
        dup = False
        for pc2, pts2, P2, inv2 in reps:
            if inv2 != inv:
                continue
            for a2 in pts2:
                try:
                    if S.isometry_between(pc, a0, pc2, list(a2)):
                        dup = True
                        break
                except Exception:                                    # noqa: BLE001
                    continue
            if dup:
                break
        if not dup:
            reps.append((pc, samples(r), r["P"], inv))
            keep.append(r)
    log(f"congruence dedup: {len(records)} → {len(keep)} families ({len(records) - len(keep)} duplicate "
        f"representations of the same tiling merged)")
    for i, r in enumerate(keep, 1):
        r["id"] = f"{r['id'].rsplit('-', 1)[0]}-{i:03d}"
    return keep



def true_period(head):
    """Word period of one repeat of a tile's solved angles."""
    for q in range(1, len(head) + 1):
        if len(head) % q == 0 and all(head[i] == head[i % q] for i in range(len(head))):
            return q
    return len(head)


def degenerate_shapes(vt, seed):
    """Shapes whose SOLVED angles collapse to a shorter period — the tile is not really period-p there.

    A pinned solution is a single point, so this is decidable and it matters: the first pinned k=3 block
    solves to 120/120/120, which is a REGULAR hexagon wearing a period-3 label, and its tiling is the
    hexagonal one that already ships in the regular atlas. Families are exempt — a curve's generic point
    has distinct angles, and passing through a symmetric member is a feature of the slider, not a
    misfiling of the entry.
    """
    bad = []
    shapes = {}
    for w in qf.vertex_words(vt):
        for tok in w:
            m = qf.SHAPE.match(tok)
            if m:
                shapes[f"{m.group(1)}-{m.group(3)}{m.group(4)}"] = int(m.group(2))
    for sh, p in shapes.items():
        head = [seed[(sh, i)] for i in range(p)]
        if true_period(head) < p:
            bad.append((sh, head))
    return bad


def rigid_cell(fam):
    """A P=0 family's cell as plain float geometry: at P=0 every Laurent term carries the empty exponent,
    so each coordinate is a single constant and there is nothing to evaluate."""
    def pt(terms):
        x = y = 0.0
        for _m, re_, im_ in terms:
            x += re_
            y += im_
        return [x, y]
    return ({"cellPolygons": [{"n": q["n"], "star": q["star"], "vertices": [pt(v) for v in q["verts"]]}
                              for q in fam["polys"]],
             "basis": [pt(fam["bas"][0]), pt(fam["bas"][1])]})


def dedupe_rigid(cells, log):
    """Distinct rigid tilings, by the same labelled-cloud congruence the families use — evaluated once
    each, since a pinned tiling has no parameter to sample."""
    S = sfr()
    keep = []
    for rec in cells:
        inv = (tuple(sorted(len(q["vertices"]) for q in rec["renderCell"]["cellPolygons"])),)
        polys = [{"n": q["n"], "v": [complex(x, y) for x, y in q["vertices"]]}
                 for q in rec["renderCell"]["cellPolygons"]]
        basis = [complex(*rec["renderCell"]["basis"][0]), complex(*rec["renderCell"]["basis"][1])]
        cl = S.clouds(polys, basis, S.PATCH_R + 1.0)
        dup = False
        for inv2, cl2 in keep:
            if inv2 != inv:
                continue
            if any(S.congruent_by(x, y, S.PATCH_R + 1.0) for x in cl for y in cl2):
                dup = True
                break
        if not dup:
            keep.append((inv, cl))
            rec["_keep"] = True
    out = [r for r in cells if r.pop("_keep", False)]
    log(f"rigid dedup: {len(cells)} → {len(out)} distinct tilings")
    return out


def drop_family_members(rigid, records, log):
    """Remove pinned tilings that ARE one parameter value of a family already being shipped.

    A pinned COMBINATORIAL type can be geometrically identical to a specific α of a continuous family, and
    then listing it separately shows the same tiling twice — the double-count the shelf's own rule forbids.
    AL spotted the symptom from the other side (a "rigid" entry that visibly ought to deform). Sampled
    across each family's own region, prefiltered on the tile multiset, and confirmed with an explicit
    isometry.
    """
    S = sfr()
    fams = []
    for r in records:
        pc = {"params": r["params"], "cellPolygons": r["cellPolygons"], "basis": r["basis"]}
        inv = tuple(sorted(len(q["vertices"]) for q in r["cellPolygons"]))
        n = {1: 25, 2: 9}.get(r["P"], 5)
        axes = [[p["alphaRangeDegOpen"][0] + (p["alphaRangeDegOpen"][1] - p["alphaRangeDegOpen"][0])
                 * (i + 1) / (n + 1) for i in range(n)] for p in r["params"]]
        fams.append((r["id"], pc, inv, list(itertools.product(*axes))))
    keep, dropped = [], []
    for t in rigid:
        rc = t["renderCell"]
        inv = tuple(sorted(len(q["vertices"]) for q in rc["cellPolygons"]))
        polys = [{"n": len(q["vertices"]), "v": [complex(x, y) for x, y in q["vertices"]]}
                 for q in rc["cellPolygons"]]
        basis = [complex(*rc["basis"][0]), complex(*rc["basis"][1])]
        cl = S.clouds(polys, basis, S.PATCH_R + 1.0)
        hit = None
        for fid, pc, finv, pts in fams:
            if finv != inv:
                continue
            for a in pts:
                try:
                    p2, b2 = S.cell_at(pc, list(a))
                    if any(S.congruent_by(x, y, S.PATCH_R + 1.0) for x in cl
                           for y in S.clouds(p2, b2, S.PATCH_R + 1.0)):
                        hit = fid
                        break
                except Exception:                                # noqa: BLE001
                    continue
            if hit:
                break
        (dropped if hit else keep).append((t, hit))
    for t, fid in dropped:
        log(f"  pinned {t['id']} is a member of {fid} — dropped (would double-count)")
    log(f"pinned tilings that are family members: {len(dropped)} dropped, {len(keep)} kept")
    return [t for t, _ in keep]


def main():
    global LOG
    ap = argparse.ArgumentParser()
    ap.add_argument("--tables", required=True)
    ap.add_argument("--catalog", action="append", required=True, help="k:pruned-dir")
    ap.add_argument("--out", required=True)
    ap.add_argument("--log", required=True)
    ap.add_argument("--id-prefix", default="period-family")
    ap.add_argument("--samples", type=int, default=5,
                    help="generic parameter points sampled per family when measuring k")
    ap.add_argument("--max-angle", type=float, default=None, dest="max_angle",
                    help="upper bound per corner in D-units. Default D/2 = 180 deg = convex. Raise it to "
                         "let a family carry a REFLEX corner: a concave tile is a tile, and capping at "
                         "180 is what forced the concave work through fixed-angle palettes, which can "
                         "only ever emit snapshots.")
    args = ap.parse_args()
    LOG = open(args.log, "w")
    tab = ff.load_tables(args.tables)
    D = tab.D
    base_units = list(tab.CLASS_UNITS)
    ub = Fraction(args.max_angle).limit_denominator(1000) if args.max_angle else Fraction(D, 2)
    log(f"=== quotient family export; tables={args.tables} D={D} classes={len(base_units)} ===")

    groups, rigid = {}, []
    stats = {"infeasible": 0, "no-grid-seed": 0, "pinned-degenerate": 0, "failed": 0, "no-period": 0,
             "forced-coincidence": 0, "seed-coincident": 0}
    for spec in args.catalog:
        kstr, path = spec.split(":", 1)
        k = int(kstr)
        blocks = [b for b in qf.read_blocks(path, ks=(k,))]
        log(f"k={k}: {len(blocks)} quotient blocks in {path}")
        for bi, (bk, vt, conway) in enumerate(blocks, 1):
            st, P = qf.analyse(vt, D, ub)
            if st == "no-period":
                stats["no-period"] += 1
                continue
            if st == "infeasible":
                stats["infeasible"] += 1
                continue
            seed, sinfo = generic_seed(vt, D, ub)
            if seed is None:
                stats["no-grid-seed"] += 1
                log(f"  ⚑ no integer seed (real but off-grid at D={D}): {vt[:80]}")
                continue
            if sinfo.get("forced"):
                stats["forced-coincidence"] += 1
            if sinfo.get("coincident"):
                stats["seed-coincident"] += 1
            apply_seed(tab, seed, base_units)
            if st == "pinned":
                # A rigid tiling: real, angles forced, no slider. Shipped as a plain cell, not a family —
                # but only if its solved angles really do have period p; see degenerate_shapes.
                bad = degenerate_shapes(vt, seed)
                if bad:
                    stats["pinned-degenerate"] += 1
                    continue
                try:
                    fam = epf.analyze(tab, vt, conway, D, allow_pinned=True)
                except Exception as e:                              # noqa: BLE001
                    stats["failed"] += 1
                    log(f"  ⚑ rigid develop error {vt[:70]}: {e}")
                    continue
                rigid.append({"id": f"{args.id_prefix}-rigid-k{k}-{bi:04d}", "k": k, "P": 0,
                              "vertype": vt, "renderCell": rigid_cell(fam)})
                continue
            try:
                fam = epf.analyze(tab, vt, conway, D)
            except ValueError as e:
                stats["failed"] += 1
                continue
            except Exception as e:                                  # noqa: BLE001
                stats["failed"] += 1
                log(f"  ⚑ develop error {vt[:70]}: {e}")
                continue
            fam["k"] = k
            fam["mid"] = f"quotient-{args.id_prefix}-k{k}-{bi:04d}"
            groups.setdefault(epf.family_key(fam), []).append(fam)
        log(f"k={k}: {stats} → {len(groups)} keyed families so far")
    tab.CLASS_UNITS[:] = base_units

    records = epf.emit_records(groups, D, args.id_prefix, log, float(ub))
    records = dedupe_congruent(records, log)
    rigid = dedupe_rigid(rigid, log)
    rigid = drop_family_members(rigid, records, log)
    records, rigid = vo.stamp_records(records, rigid, log, args.samples, D)
    log(f"rigid tilings kept: {len(rigid)} (pinned, no deformation)")
    with open(args.out, "w") as f:
        json.dump({"_meta": {
            "source": "period-QUOTIENT search (gen_alphabet --quotient-period) + exact angle solve "
                      "(quotient_feasible) + coupled symbolic development (coupled_flex)",
            "note": "Each record is a CONTINUOUS family found WITHOUT enumerating grid angles; the "
                    "angles come from solving the tile/vertex linear system, not from the alphabet.",
        }, "records": records, "rigid": rigid}, f, indent=1)
    log(f"wrote {len(records)} family records → {args.out}")


if __name__ == "__main__":
    main()
