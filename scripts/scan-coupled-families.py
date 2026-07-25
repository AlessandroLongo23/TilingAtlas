#!/usr/bin/env python3
"""scan-coupled-families.py — recover the COUPLED multi-parameter families the mixed export ships as
1-dimensional slices, and emit a plan that collapses each set of slices into one family.

Why (AL, 2026-07-26, from k2-45/k2-46/k2-50 on /play: "the same tiling, just with a different angle for the
rhombus and the star"). export_combined_families.analyze_block gives a species its own slider only when it
flexes ALONE — its column in the vertex δ-matrix is all-zero. When the flex space is 2-dimensional but every
species is coupled, it develops the single direction ns[0]: a 1-D slice through whatever grid member it
started from. The pinned angle then enters the family key, so each parallel slice is keyed as a separate
family. Six mixed entries turn out to be four lines through ONE 2-parameter family, and everything off those
lines — including whole grid lines whose species the palette lacks — is absent from the atlas. §103.

What this does:
  * develops each coupled record with P = flexdim (qeff from the full null-space basis, via the exporter's
    own develop_multi / trace_faces_multi), so the family is the real 2-parameter object;
  * picks the parameter basis so each axis IS a species angle (see `species_aligned_basis`) — the sliders
    then read "rhombus angle" and "star angle" rather than two abstract null-space directions;
  * computes the valid region EXACTLY as a polytope from the per-species angle bounds, rather than by
    sampling: every species angle is affine in δ, and an isotoxal 2m-gon needs both of its alternating
    angles positive, which is two half-planes per species;
  * groups the records into families by looking for one's seed at an integer δ of another's, confirmed by an
    explicit isometry (a false merge here would claim two different families are one);
  * emits the plan: survivor id, its 2-D region, and an alias per absorbed slice with the δ where it sits.

Run:  python3 scripts/scan-coupled-families.py <out.log> [--emit-plan <plan.json>]
"""
import cmath
import glob
import json
import math
import os
import sys
from fractions import Fraction

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORACLE = os.path.join(ROOT, "tools", "ctrnact-oracle")
sys.path.insert(0, ORACLE)
os.chdir(ORACLE)

import family_flex as ff  # noqa: E402
import export_combined_families as ec  # noqa: E402

TABLES = "tables/isotoxal-star-z24"
PRUNED = ["run-par-k1-isotoxal-star-z24-pruned/out/pruned", "run-par-k2-isotoxal-star-z24-pruned/out/pruned"]
CELLS = ["experiments/results/ctrnact-mixed-families.cells.json",
         "experiments/results/ctrnact-mixed-families-k2.cells.json"]
SPAN = 6      # integer δ half-width searched for another family's seed
R = 6.0       # congruence patch radius
UNIT = 15.0   # degrees per angle unit (D = 24)


def angle_limit(v):
    """Sum of an isotoxal 2m-gon's two alternating angles, in units: 360 − 720/V degrees for V vertices.

    Both alternating angles must be positive, so this is the open upper bound on either of them — and the
    bound is what makes the valid region a polytope. V=4 (rhombus) → 12 units = 180°; V=6 → 16; V=12 → 20.
    """
    return Fraction(360 * v - 720, 15 * v)


def species_aligned_basis(ns, nspec):
    """Re-basis the integer null space so that, wherever possible, each axis IS one species' angle.

    A coupled family has no species that moves alone, so every parameter must move several species — but a
    basis can still be chosen in which some species' coefficient vector across the axes is a unit vector,
    and then that species' angle is exactly α0 + δ_p. Those are the species worth naming the sliders after:
    for k2-45 it recovers the rhombus and the 6-pointed star, which is how AL described the family.

    Returns (basis, pivot_species) with basis a list of P integer vectors over species.
    """
    rows = [[Fraction(x) for x in v] for v in ns]
    P = len(rows)
    piv = []
    r = 0
    for c in range(nspec):  # Gauss-Jordan over the species columns
        p = next((i for i in range(r, P) if rows[i][c] != 0), None)
        if p is None:
            continue
        rows[r], rows[p] = rows[p], rows[r]
        rows[r] = [x / rows[r][c] for x in rows[r]]
        for i in range(P):
            if i != r and rows[i][c] != 0:
                f = rows[i][c]
                rows[i] = [a - f * b for a, b in zip(rows[i], rows[r])]
        piv.append(c)
        r += 1
        if r == P:
            break
    # clear denominators per row so the basis stays integral
    out = []
    for row in rows:
        d = 1
        for x in row:
            d = d * x.denominator // math.gcd(d, x.denominator)
        out.append([int(x * d) for x in row])
    # a species is "aligned" with axis p when its column across the basis is the unit vector e_p
    aligned = {}
    for s in range(nspec):
        col = [out[p][s] for p in range(P)]
        if sum(1 for x in col if x != 0) == 1 and max(col) == 1:
            aligned[col.index(1)] = s
    return out, [aligned.get(p, piv[p] if p < len(piv) else None) for p in range(P)]


def coupled_family(tab, blocks, vt):
    """Develop the FULL flex space: P = flexdim, one parameter per (species-aligned) basis vector."""
    rneig, lneig, mirro, cls, glue = ff.decode(tab, vt, blocks[vt])
    species, qvec = ec.species_and_q(tab, cls)
    rows = ec.vertex_qsums(tab, vt, species)
    ns = ff.int_nullspace(rows, len(species))
    basis_vecs, pivots = species_aligned_basis(ns, len(species))
    P = len(basis_vecs)
    qeff = {}
    for c in set(cls):
        q = qvec.get(c, (0,) * len(species))
        qeff[c] = tuple(sum(basis_vecs[p][s] * q[s] for s in range(len(species))) for p in range(P))
    placed, periods = ec.develop_multi(tab, rneig, cls, glue, qeff, P)
    rank, lat = ff.period_lattice(periods)
    if rank != 2:
        raise RuntimeError(f"formal period rank {rank} != 2")
    faces = ec.trace_faces_multi(tab, rneig, cls, glue, qeff, placed)
    byshape = {}
    for verts, tile in faces:
        shape, anchor = ff.face_canonical(verts)
        byshape.setdefault((shape, tile), []).append((anchor, verts))
    cell = [(t, v) for (shape, t), lst in byshape.items() for _, v in ff.dedupe_mod_lattice(lst, lat)]
    polys = [{"n": ec.poly_n(tab.TILE_NAME[t]),
              "star": ec.is_star_name(tab.TILE_NAME[t]),
              "verts": [ec.lp_terms_multi(v) for v in verts]}
             for t, verts in cell]
    return dict(
        P=P, basis_vecs=basis_vecs, pivots=pivots, ns=ns, rows=rows,
        species=[tab.TILE_NAME[s] for s in species],
        seed=[int(ec.alpha_units(tab, s)) for s in species],
        # poly_n already returns the VERTEX count for a star name (a 3-pointed star is a 6-gon, a 6-pointed
        # star a 12-gon), so it must NOT be doubled. Doubling it let a 3-pointed star's angle range up to
        # 300° when a hexagon's two alternating angles can only sum to 240° — the region then contained
        # points whose tiles self-intersect, which is how this was caught.
        vsides=[ec.poly_n(tab.TILE_NAME[s]) for s in species],
        polys=polys, bas=[ec.lp_terms_multi(lat[0]), ec.lp_terms_multi(lat[1])], vt=vt)


def region_of(fam):
    """The valid region as one record per species: angle = seed + coef·δ must lie in (0, limit).

    Exact, not sampled. Every species angle is affine in δ and an isotoxal tile needs both alternating
    angles positive, so the region is the intersection of 2·(#species) half-planes — a polytope, which is
    precisely why these families cannot ship as two independent box-ranged sliders.
    """
    out = []
    for s, name in enumerate(fam["species"]):
        out.append({
            "species": name,
            "coef": [fam["basis_vecs"][p][s] for p in range(fam["P"])],
            "seedUnits": fam["seed"][s],
            "limitUnits": float(angle_limit(fam["vsides"][s])),
        })
    return out


def half_planes(region, P):
    """The region as rows (a·δ ≤ b). Two per species: the angle above 0 and below its limit."""
    rows = []
    for r in region:
        c = r["coef"]
        rows.append(([-x for x in c], float(r["seedUnits"]), r["species"] + ">0"))
        rows.append((list(c), r["limitUnits"] - r["seedUnits"], r["species"] + "<limit"))
    return [(a, b, why) for a, b, why in rows if any(a)] if P else []


def polytope_2d(region, eps=1e-9):
    """Ordered vertices of the 2-D valid region, exactly, by intersecting every pair of boundary lines.

    The pad draws this, so it must be the real polygon and not an axis-aligned guess: holding one axis at 0
    and bounding the other (what an earlier version did) under-covers a slanted region, and the pad would
    clip off exactly the corners where the interesting tilings live.
    """
    rows = half_planes(region, 2)
    verts = []
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            (a1, b1, _), (a2, b2, _) = rows[i], rows[j]
            d = a1[0] * a2[1] - a1[1] * a2[0]
            if abs(d) < eps:
                continue
            x = (b1 * a2[1] - b2 * a1[1]) / d
            y = (a1[0] * b2 - a2[0] * b1) / d
            if all(a[0] * x + a[1] * y <= b + 1e-7 for a, b, _ in rows):
                if not any(abs(x - u) < 1e-7 and abs(y - v) < 1e-7 for u, v in verts):
                    verts.append((x, y))
    if not verts:
        return [], [[0.0, 0.0], [0.0, 0.0]]
    cx = sum(v[0] for v in verts) / len(verts)
    cy = sum(v[1] for v in verts) / len(verts)
    verts.sort(key=lambda v: math.atan2(v[1] - cy, v[0] - cx))
    bbox = [[min(v[0] for v in verts), max(v[0] for v in verts)],
            [min(v[1] for v in verts), max(v[1] for v in verts)]]
    return [[round(x, 9), round(y, 9)] for x, y in verts], bbox


def shipped_cell_at(rec, alpha_deg):
    """Evaluate a SHIPPED 1-parameter record at an α, in the same shape ev() returns."""
    ds = [(alpha_deg - p["alpha0Deg"]) * math.pi / 180 for p in rec["params"]]

    def term(ts):
        z = 0j
        for m, re, im in ts:
            a = m * ds[0] if not isinstance(m, list) else sum(mi * d for mi, d in zip(m, ds))
            z += complex(re, im) * cmath.exp(1j * a)
        return z

    polys = [[term(t) for t in q["vertices"]] for q in rec["cellPolygons"]]
    b = [term(rec["basis"][0]), term(rec["basis"][1])]
    det = abs(b[0].real * b[1].imag - b[0].imag * b[1].real)
    areas = [ec.poly_area(v) for v in polys]
    return dict(det=det, total=sum(areas), minarea=min(areas), polys=polys, basis=b, areas=areas)


def find_in_grid(target, grid):
    """The integer δ of the survivor whose tiling IS `target`, or None. Screen on (Σarea, |det|), decide
    with an explicit isometry — the radial invariants alone are not congruence (NOTES §102)."""
    for d, s in grid.items():
        if abs(s["total"] - target["total"]) > 1e-7 or abs(s["det"] - target["det"]) > 1e-7:
            continue
        if next((k for x in clouds(s) for y in clouds(target) if (k := isometry(x, y))), None):
            return d
    return None


def slice_direction(rec_b, seed_delta, grid):
    """Where the absorbed family's SHIPPED slider points, in the survivor's δ coordinates.

    Without it an old deep link resolves to the right point and then travels along the wrong line. Derived
    from the shipped 1-parameter record itself — not from this script's re-basis of the flex space, which is
    a different direction entirely (for k2-45's group the exported slider is the DIAGONAL of the new axes,
    since it moves the rhombus and the 3-pointed star together while pinning the 6-pointed star).
    """
    a0 = rec_b["params"][0]["alpha0Deg"]
    step = shipped_cell_at(rec_b, a0 + UNIT)
    if not tiles(step):
        return None
    d = find_in_grid(step, grid)
    return None if d is None else [d[p] - seed_delta[p] for p in range(len(seed_delta))]


def ev(fam, du):
    deltas = [x * math.pi / 12 for x in du]
    b = [ec.eval_terms_multi(t, deltas) for t in fam["bas"]]
    det = abs(b[0].real * b[1].imag - b[0].imag * b[1].real)
    polys = [[ec.eval_terms_multi(t, deltas) for t in p["verts"]] for p in fam["polys"]]
    areas = [ec.poly_area(v) for v in polys]
    return dict(det=det, total=sum(areas), minarea=min(areas), polys=polys, basis=b, areas=areas)


def tiles(s):
    return abs(s["total"] - s["det"]) < 1e-9 and s["minarea"] > 1e-7


def clouds(s, radius=R):
    b, det = s["basis"], s["det"]
    h = det / max(abs(b[0]), abs(b[1]))
    extent = max(abs(z) for v in s["polys"] for z in v)
    n = int(math.ceil((radius + 2 * extent) / max(h, 1e-9))) + 1
    pre = [((len(v), round(a, 6)), sum(v) / len(v)) for v, a in zip(s["polys"], s["areas"])]
    top = max(t[0] for t, _ in pre)
    trans = [i * b[0] + j * b[1] for i in range(-n, n + 1) for j in range(-n, n + 1)]
    return [[(lab, z + t - anc) for t in trans for lab, z in pre if abs(z + t - anc) <= radius + 1e-6]
            for lab0, anc in pre if lab0[0] == top]


def isometry(a_pts, b_pts, radius=R):
    inner = radius - 1.0
    idx = {}
    for lab, z in b_pts:
        idx.setdefault(lab, []).append(z)
    a_inner = [(lab, z) for lab, z in a_pts if abs(z) <= inner]
    if not a_inner:
        return None
    ref = min(((lab, z) for lab, z in a_pts if abs(z) > 1e-9), key=lambda t: abs(t[1]))
    for z in idx.get(ref[0], []):
        if abs(abs(z) - abs(ref[1])) > 1e-6:
            continue
        for kind, rot in (("rotation", z / ref[1]), ("reflection", z / ref[1].conjugate())):
            if abs(abs(rot) - 1) > 1e-9:
                continue
            if all(any(abs(rot * (w.conjugate() if kind == "reflection" else w) - u) < 1e-6
                       for u in idx.get(lab, []))
                   for lab, w in a_inner):
                return kind
    return None


def main(out_path, plan_path=None):
    lines = []

    def log(s=""):
        lines.append(s)
        print(s, flush=True)
        with open(out_path, "w") as f:
            f.write("\n".join(lines) + "\n")

    recs = []
    for c in CELLS:
        recs += json.load(open(os.path.join(ROOT, c)))["records"]
    by_id = {r["id"]: r for r in recs}
    coupled = [r for r in recs if r["flexdim"] > len(r["params"])]
    log("=== scan-coupled-families: multi-parameter families shipped as 1-D slices ===")
    log(f"{len(recs)} mixed records, {len(coupled)} with flexdim > #params")

    tab = ff.load_tables(TABLES)
    blocks = {}
    for d in PRUNED:
        for f in sorted(glob.glob(os.path.join(d, "eupruned_*.txt"))):
            for vt, cw in ff.read_blocks(f):
                blocks[vt] = cw
    log(f"loaded {len(blocks)} pruned blocks from {len(PRUNED)} run dirs")
    log("")

    fams, seeds = {}, {}
    for r in coupled:
        sid = r["id"]
        vt = r["members"][0]["vertype"]
        if vt not in blocks:
            log(f"  ⚑ {sid}: vertype absent from the pruned blocks — skipped")
            continue
        try:
            fam = coupled_family(tab, blocks, vt)
        except Exception as e:
            log(f"  ⚑ {sid}: develop failed — {type(e).__name__}: {e}")
            continue
        s0 = ev(fam, [0] * fam["P"])
        if not tiles(s0):
            log(f"  ⚑ {sid}: coupled development does NOT tile at its own seed — skipped")
            continue
        fam["region"] = region_of(fam)
        fam["regionVertices"], fam["bbox"] = polytope_2d(fam["region"]) if fam["P"] == 2 else ([], [])
        fams[sid] = fam
        seeds[sid] = s0
        names = [fam["species"][p] if p is not None else "?" for p in fam["pivots"]]
        log(f"  {sid}")
        log(f"    species {fam['species']} seed {fam['seed']}")
        log(f"    P={fam['P']}  axes named after {names}  basis {fam['basis_vecs']}")
        log(f"    cell {sorted(p['n'] for p in fam['polys'])}  Σarea {s0['total']:.6f}  bbox {fam['bbox']}")

    # ── group: is one family's seed an integer δ of another's? ────────────────────────────────────────
    log("")
    log(f"=== grouping (integer δ ∈ [-{SPAN},{SPAN}]^P, isometry-confirmed) ===")
    ids = sorted(fams)
    edges = []
    for a in ids:
        fa = fams[a]
        if fa["P"] != 2:
            continue
        grid = {}
        for i in range(-SPAN, SPAN + 1):
            for j in range(-SPAN, SPAN + 1):
                s = ev(fa, [i, j])
                if tiles(s):
                    grid[(i, j)] = s
        for b in ids:
            if b == a or fams[b]["P"] != 2:
                continue
            sb = seeds[b]
            if sorted(p["n"] for p in fams[b]["polys"]) != sorted(p["n"] for p in fa["polys"]):
                continue
            for d, s in grid.items():
                if abs(s["total"] - sb["total"]) > 1e-7 or abs(s["det"] - sb["det"]) > 1e-7:
                    continue
                k = next((k for x in clouds(s) for y in clouds(sb) if (k := isometry(x, y))), None)
                if k:
                    edges.append((a, b, list(d), k))
                    log(f"  {a.replace('ctrnact-mixed-family-', '')} @ δ={d} IS "
                        f"{b.replace('ctrnact-mixed-family-', '')}'s seed ({k})")
                    break
    adj = {n: {} for n in ids}
    grids = {}
    for a, b, d, k in edges:
        adj[a][b] = d
    for a in ids:
        if fams[a]["P"] == 2:
            grids[a] = {(i, j): s for i in range(-SPAN, SPAN + 1) for j in range(-SPAN, SPAN + 1)
                        if tiles(s := ev(fams[a], [i, j]))}
    comps, seen = [], set()
    for n in ids:
        if n in seen:
            continue
        comp, stack = set(), [n]
        while stack:
            x = stack.pop()
            if x in comp:
                continue
            comp.add(x)
            stack += [y for y in adj[x] if y not in comp] + [y for y in ids if x in adj.get(y, {})]
        seen |= comp
        comps.append(sorted(comp))
    log("")
    log(f"{len(fams)} coupled records → {len(comps)} distinct famil(ies)")
    for c in comps:
        log(f"  {{{', '.join(x.replace('ctrnact-mixed-family-', '') for x in c)}}}")

    if not plan_path:
        return
    plan = {"families": []}
    for comp in comps:
        surv = comp[0]                      # lowest id keeps the entry, as with the duplicate absorptions
        fam = fams[surv]
        params = []
        for p in range(fam["P"]):
            s = fam["pivots"][p]
            a0 = fam["seed"][s] * UNIT if s is not None else 0.0
            lo, hi = fam["bbox"][p]
            params.append({
                "name": f"alpha{p + 1}",
                "alpha0Deg": a0,
                "deltaRangeDeg": [lo * UNIT, hi * UNIT],
                "alphaRangeDegOpen": [a0 + lo * UNIT, a0 + hi * UNIT],
                "defaultAlphaDeg": a0,
                "tile": fam["species"][s] if s is not None else None,
            })
        self_axis = slice_direction(by_id[surv], [0] * fam["P"], grids.get(surv, {}))
        if self_axis is None:
            log(f"  ⚑ {surv}: could not derive its OWN former slider axis — old links to it will keep "
                f"their raw α (the region clamp will catch anything outside)")
        absorbs = []
        for o in comp[1:]:
            d = adj[surv].get(o)
            if d is None:
                log(f"  ⚑ {surv}: no δ recorded for {o} — alias SKIPPED (link would land wrong)")
                continue
            dirv = slice_direction(by_id[o], d, grids.get(surv, {}))
            if dirv is None:
                log(f"  ⚑ {surv}: could not derive {o}'s slider direction — alias carries the seed only")
            absorbs.append({
                "id": o,
                "deltaUnits": d,
                # α_o ↦ deltaUnits + ((α_o − alpha0_o)/15)·axisUnits, so an old 1-D link lands on the right
                # point of the pad and moves along the line it used to move along
                "alpha0Deg": fams[o]["seed"][fams[o]["pivots"][0]] * UNIT if fams[o]["pivots"][0] is not None else 0.0,
                "axisUnits": dirv,
            })
        plan["families"].append({
            "id": surv,
            "P": fam["P"],
            "vertype": fam["vt"],
            "species": fam["species"],
            "seedUnits": fam["seed"],
            "basis": fam["basis_vecs"],
            "params": params,
            "region": fam["region"],
            "regionVertices": fam["regionVertices"],
            "cellPolygons": [{"n": p["n"], **({"star": True} if p["star"] else {}),
                              "vertices": p["verts"]} for p in fam["polys"]],
            "basisTerms": fam["bas"],
            "absorbs": absorbs,
            # The survivor's coordinate changed meaning: it used to be one angle along this line, and is now
            # a point in the region. Recorded so its own old deep links move onto the right line too.
            "selfAxisUnits": self_axis,
            "selfAlpha0Deg": (fam["seed"][fam["pivots"][0]] * UNIT) if fam["pivots"][0] is not None else 0.0,
        })
    with open(os.path.join(ROOT, plan_path), "w") as f:
        json.dump(plan, f, indent=1)
        f.write("\n")
    log("")
    log(f"=== plan → {plan_path} ===")
    for e in plan["families"]:
        log(f"  {e['id']}  P={e['P']}  absorbs {[a['id'].replace('ctrnact-mixed-family-', '') for a in e['absorbs']]}")


if __name__ == "__main__":
    argv = sys.argv[1:]
    plan = None
    if "--emit-plan" in argv:
        i = argv.index("--emit-plan")
        plan = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    if not argv:
        sys.exit(__doc__)
    main(os.path.join(ROOT, argv[0]), plan)
