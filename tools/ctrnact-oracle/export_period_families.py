#!/usr/bin/env python3
"""Export the PERIOD-p equilateral families parametrically.

The period-3 shelf ships fixed-angle snapshots of continuous families: 198 entries collapse into 32
topology classes, and 193 of the 198 sit in a class with siblings. AL spotted it on /play — "the hexagon
becomes narrower and narrower, but the rest stays the same, same topology".

Why this needed a generalization rather than a fourth copy of the star exporter. Every existing flex model
gives a SPECIES one δ column: a star flexes its point angle (+1 point, −1 dent), a cx isotoxal tile its
corner @0 against @1. A period-p tile has p angles constrained only by their sum, so its own flex space is
(p−1)-dimensional — two free angles for a period-3 hexagon, on ONE tile. That is coupled by construction
and no per-species ±1 column can express it.

The model here is over CORNER CLASSES, not species, which subsumes all three cases:

  variables   one per flexing corner class (regular tiles are rigid and contribute constants)
  constraint  per TILE:   its p class angles sum to a constant (the polygon closes)
              per VERTEX: the angles meeting there sum to a full turn, for every δ
  flex space  the integer null space of those rows

For a period-3 hexagon at a vertex (@2,@1,@0) the vertex row is (1,1,1) and the tile row is (1,1,1) — the
same row — so the null space is 2-dimensional and the family closes for EVERY (α, β). That is the classic
"any hexagon whose angles sum to 360° tiles" result, recovered rather than assumed.

Development, face tracing and the Laurent algebra come from coupled_flex (extracted 2026-08-08 from the
byte-identical copies in the isotoxal and mixed exporters — nothing new is written here for that).

The valid region is EXACT, never sampled: every class angle is affine in δ, and a convex corner needs
0 < angle < 180°, so the region is an intersection of half-planes. Its boundary IS the degeneracy locus —
a corner collapsing to 0 or flattening to 180° — which is what makes the slider endpoints meaningful.

⚑ Mirror twins share a flex space. A chiral tile and its `'` twin are two symbols for one polygon, so the
model keys on SPECIES (trailing apostrophe stripped); keying on the symbol would find every family twice.

Usage:
  python3 export_period_families.py --tables tables/equi3-cx-z24 \
      --catalog 1:tables/_work/rebuild-equi3-cx-z24-k2/out/pruned \
      --out ../../experiments/period-oracle/ctrnact-period-families.cells.json \
      --log ../../experiments/results/period-families-export.log
"""
import argparse
import glob
import json
import math
import os
import re
import sys
import time
from fractions import Fraction

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import family_flex as ff
from coupled_flex import develop_multi, trace_faces_multi, lp_terms_multi, map_key_over_perms

LOG = None


def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    if LOG:
        LOG.write(line + "\n")
        LOG.flush()


def species_of(name):
    """Mirror twins are one polygon: e3-6-… and e3-6-…' share a flex space."""
    return name[:-1] if name.endswith("'") else name


PERIOD_TILE = re.compile(r"^e(\d+)-")


def is_period_tile(name):
    return bool(PERIOD_TILE.match(species_of(name)))


def read_blocks(path, k=None):
    """Blocks from one pruned dir, in the SAME order export_composable_cells.py reads them, so block i
    here is record i there and the two can be joined by index.

    `k` filters to eupruned_0<k>_*.txt — the dir holds every k, and labelling a k=2 block as k=1 silently
    mixes catalogs (it did, on the first run).

    ⚑ Returns a LIST, never a dict keyed on the vertype. A vertype is NOT unique: two tilings can share a
    vertex-type multiset and differ only in how a half-edge is glued — `(3')` against `[3']` in the Conway
    symbol, the direct gluing against the mirrored one. Keying on the vertype dropped 276 of 614 blocks
    (54 of 83 at k=1, 223 of 531 at k=2) before they were ever analyzed, which is why the shelf shipped
    only the alternating member of AL's k2-019 strip pair and not the aligned one.
    """
    out = []
    pat = f"eupruned_{k:02d}_*.txt" if k is not None else "*.txt"
    for f in sorted(glob.glob(os.path.join(path, pat))):
        lines = [l.rstrip("\n") for l in open(f)]
        i = 0
        while i < len(lines):
            if lines[i].startswith("(") and i + 4 < len(lines) and lines[i + 2].startswith("Count type"):
                out.append((lines[i], lines[i + 4]))
                i += 5
            else:
                i += 1
    return out


def flex_model(tab, vt, cls):
    """(classes, qvec_rows) — the constraint matrix over flexing corner classes.

    Rows are the tile-closure and vertex-closure constraints described in the module docstring; the null
    space of the stack is the flex space. Columns are the flexing classes in a fixed order.
    """
    used = sorted(set(cls))
    flex = [c for c in used if is_period_tile(tab.TILE_NAME[tab.CLASS_TILE[c]])]
    if not flex:
        return [], []
    idx = {c: j for j, c in enumerate(flex)}
    rows = []
    # per TILE: the p class angles of each flexing tile sum to a constant
    by_tile = {}
    for c in flex:
        by_tile.setdefault(tab.CLASS_TILE[c], []).append(c)
    for t, cs in sorted(by_tile.items()):
        row = [0] * len(flex)
        for c in cs:
            row[idx[c]] += 1
        rows.append(row)
    # per VERTEX: the corner angles meeting there sum to a full turn
    for corners in ff.vertex_words(vt):
        row = [0] * len(flex)
        hit = False
        for cn in corners:
            for c in flex:
                if tab.CLASS_DISP[c] == cn:
                    row[idx[c]] += 1
                    hit = True
                    break
        if hit:
            rows.append(row)
    return flex, rows


def angle_units(tab, c):
    return tab.CLASS_UNITS[c]


def analyze(tab, vt, conway, D, allow_pinned=False):
    """Develop the full flex space of one block. Returns a family dict, or raises.

    `allow_pinned` keeps a 0-dimensional block instead of rejecting it. A PINNED block is a real tiling
    whose angles are forced — a point, not a curve — and this exporter rejects those because its job is
    the flex space. The quotient search finds 230 of them at k=3, so the caller that wants every tiling
    rather than every family asks for them. Development is unaffected: at P=0 every δ-exponent is the
    empty tuple and the Laurent algebra degenerates to plain ℤ[ζ₂₄] arithmetic."""
    rneig, lneig, mirro, cls, glue = ff.decode(tab, vt, conway)
    flex, rows = flex_model(tab, vt, cls)
    if not flex:
        raise ValueError("no period tile in this block")
    ns = ff.int_nullspace(rows, len(flex))
    P = len(ns)
    if P == 0 and not allow_pinned:
        raise ValueError("PINNED (flex space is 0-dimensional)")
    # Sign-normalize each basis direction (first nonzero component positive). int_nullspace is free to
    # return δ or −δ, and the family key reads the coefficients straight off, so an unnormalized sign
    # would split one family into two shelf entries that flex in opposite directions.
    ns = [v if next((x for x in v if x), 0) > 0 else [-x for x in v] for v in ns]
    qeff = {}
    for c in set(cls):
        if c in flex:
            j = flex.index(c)
            qeff[c] = tuple(ns[p][j] for p in range(P))
        else:
            qeff[c] = (0,) * P
    placed, periods = develop_multi(tab, rneig, cls, glue, qeff, P)
    rank, lat = ff.period_lattice(periods)
    if rank != 2:
        raise ValueError(f"formal period rank {rank} != 2")
    faces = trace_faces_multi(tab, rneig, cls, glue, qeff, placed)
    byshape = {}
    for verts, tile in faces:
        shape, anchor = ff.face_canonical(verts)
        byshape.setdefault((shape, tile), []).append((anchor, verts))
    cell = [(t, v) for (shape, t), lst in byshape.items() for _, v in ff.dedupe_mod_lattice(lst, lat)]
    polys = []
    for t, verts in cell:
        nm = tab.TILE_NAME[t]
        cls0 = next(c for c in range(len(tab.CLASS_TILE)) if tab.CLASS_TILE[c] == t)
        L, p = tab.CLASS_L[cls0], tab.CLASS_P[cls0]
        n = L // 2 if "*" in nm else L
        polys.append({"n": n, "star": "*" in nm, "verts": [lp_terms_multi(v) for v in verts]})
    return dict(
        vt=vt, P=P, flex=flex, ns=ns,
        seed=[angle_units(tab, c) for c in flex],
        names=[tab.CLASS_DISP[c] for c in flex],
        tiles=[species_of(tab.TILE_NAME[tab.CLASS_TILE[c]]) for c in flex],
        polys=polys, bas=[lp_terms_multi(lat[0]), lp_terms_multi(lat[1])],
        # carried for family_key: the dart map, its corner classes and the δ-coefficients
        tab=tab, cls=cls, qeff=qeff, rneig=rneig, lneig=lneig, mirro=mirro, glue=glue,
        face_sig=tuple(sorted(p["n"] for p in polys)),
    )


def region_of(fam, D, limit_units=None):
    """One record per flexing corner class: angle = seed + coef·δ, required in (0, limit).

    Exact, not sampled. Both bounds are real degeneracies — 0 collapses the corner, D/2 (180°) flattens it
    and the tile stops being a convex polygon — so the polytope boundary is exactly where the family dies.
    """
    out = []
    for j, name in enumerate(fam["names"]):
        out.append({
            "species": name,
            "coef": [fam["ns"][p][j] for p in range(fam["P"])],
            "seedUnits": int(fam["seed"][j]),
            # D/2 (180°) is the CONVEXITY cut, not the end of the family: past it the corner turns
            # reflex and the tile changes species, which is a fact about the palette's naming, not about
            # whether it tiles. Callers that carry concave shapes raise this; the concrete convex export
            # leaves it at D/2 and the range plan widens it afterwards.
            "limitUnits": float(limit_units if limit_units is not None else D // 2),
        })
    return out


def half_planes(region):
    rows = []
    for r in region:
        c = r["coef"]
        rows.append(([-x for x in c], float(r["seedUnits"]), r["species"] + ">0"))
        rows.append((list(c), r["limitUnits"] - r["seedUnits"], r["species"] + "<180"))
    return [(a, b, w) for a, b, w in rows if any(a)]


def polytope_verts(region, P, eps=1e-9):
    """Vertices of the P-dimensional valid region: intersect every P-subset of boundary hyperplanes and
    keep the points that satisfy all of them. Exact and complete for the small P and few constraints here
    (a period-3 family has 2·(#flexing corners) half-planes), and it is what makes each axis span end at a
    genuine degeneracy rather than at a sampled guess."""
    import itertools
    rows = half_planes(region)
    verts = []
    for combo in itertools.combinations(range(len(rows)), P):
        A = [rows[i][0] for i in combo]
        b = [rows[i][1] for i in combo]
        sol = _solve(A, b, eps)
        if sol is None:
            continue
        if all(sum(a[t] * sol[t] for t in range(P)) <= bb + 1e-7 for a, bb, _ in rows):
            if not any(all(abs(sol[t] - v[t]) < 1e-7 for t in range(P)) for v in verts):
                verts.append(tuple(sol))
    return verts


def _solve(A, b, eps):
    """Gaussian elimination on a square system; None when singular."""
    n = len(A)
    M = [list(map(float, A[i])) + [float(b[i])] for i in range(n)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(M[r][c]))
        if abs(M[piv][c]) < eps:
            return None
        M[c], M[piv] = M[piv], M[c]
        for r in range(n):
            if r != c and abs(M[r][c]) > 0:
                f = M[r][c] / M[c][c]
                M[r] = [x - f * y for x, y in zip(M[r], M[c])]
    return [M[i][n] / M[i][i] for i in range(n)]


def polytope_2d(region, eps=1e-9):
    """Ordered vertices of the 2-D region (the pad draws this), plus the per-axis bounding box."""
    verts = [tuple(v) for v in polytope_verts(region, 2, eps)]
    if not verts:
        return [], [[0.0, 0.0], [0.0, 0.0]]
    cx = sum(v[0] for v in verts) / len(verts)
    cy = sum(v[1] for v in verts) / len(verts)
    verts.sort(key=lambda v: math.atan2(v[1] - cy, v[0] - cx))
    bbox = [[min(v[0] for v in verts), max(v[0] for v in verts)],
            [min(v[1] for v in verts), max(v[1] for v in verts)]]
    return [[round(x, 9), round(y, 9)] for x, y in verts], bbox


def interval_1d(region):
    """Slider domain for a 1-parameter family: the intersection of the per-class intervals."""
    lo, hi = -1e9, 1e9
    for r in region:
        c = r["coef"][0]
        if c == 0:
            continue
        a = (0 - r["seedUnits"]) / c
        b = (r["limitUnits"] - r["seedUnits"]) / c
        lo, hi = max(lo, min(a, b)), min(hi, max(a, b))
    return lo, hi


SHAPE = re.compile(r"^(e\d+)-(\d+)-[\d.]+'?@(\d+)$")


def family_key(fam):
    """Canonical form of the LABELLED DART MAP — the family invariant.

    Superseded the vertex-word multiset this used to be. That key was blind to the gluing: two tilings can
    carry the identical multiset of vertex words and differ only in whether one half-edge is glued directly
    or mirrored, `(3')` against `[3']` in the Conway symbol. AL found the pair on /play — in k2-019 the
    degenerate hexagons alternate their lean strip by strip, and the tiling where every strip leans the
    same way is its `[3']` twin. A word-multiset key merges them and ships one.

    The map key cannot: it is a complete invariant of the labelled map, so it separates any two gluings.
    What it must NOT see is the deformation itself, so the labels are angle-abstracted:

      flexing period corner  e<p>-<L>#<δ-coefficient vector>   identical at every seed on one curve
      rigid period corner    e<p>-<L>~<units>                  a coef-0 corner is pinned by the vertex
                                                               constraints, so its angle IS invariant
      everything else        CLASS_DISP (regular corners carry no angle)

    The coefficient vector replaces the corner index for exactly the reason the old key had to minimize
    over relabellings: gen_alphabet indexes a tile's corners from the canonical rotation of its angle word,
    so @0 on `e3-6-150.150.60` and @0 on `e3-6-165.135.60` need not be the same physical corner — but the
    coefficient is fixed by the constraint system, which is isomorphic across the family. Sign-normalized
    (first nonzero positive) and minimized over parameter permutations for the same reason the isotoxal
    key is: which null-space direction is called δ₁ is an artifact of the basis order.

    The face signature rides along as a cheap extra split (it is topology, so family-invariant).
    """
    tab, cls = fam["tab"], fam["cls"]
    qeff, P = fam["qeff"], fam["P"]

    def label_of(d, perm):
        c = cls[d]
        disp = tab.CLASS_DISP[c]
        m = SHAPE.match(species_of(disp))
        if not m:
            return disp
        head = f"{m.group(1)}-{m.group(2)}"
        q = qeff[c]
        if any(q):
            return f"{head}#{tuple(q[perm[p]] for p in range(P))}"
        return f"{head}~{tab.CLASS_UNITS[c]}"

    rels = (fam["rneig"], fam["lneig"], fam["mirro"], fam["glue"])
    return (map_key_over_perms(rels, label_of, P), fam["face_sig"], P)


def check_member_ids(args, k, blocks):
    """Verify the index join against the cells file, instead of trusting it.

    `mid` assumes block i here is record i in <cells-dir>/ctrnact-period3-k<k>.cells.json. That holds only
    while export_composable_cells.py develops every block — one develop failure shifts every id after it.
    A silent shift would attach a family to the wrong snapshots, so check the vertype at each index and
    fail the run if any disagrees.
    """
    if not args.cells:
        log(f"  ⚑ k={k}: no --cells given, member ids are UNVERIFIED")
        return
    p = args.cells.replace("{k}", str(k))
    if not os.path.exists(p):
        log(f"  ⚑ k={k}: {p} missing, member ids UNVERIFIED")
        return
    recs = json.load(open(p))
    recs = recs["records"] if isinstance(recs, dict) else recs
    bad = [i for i, (vt, _) in enumerate(blocks) if i >= len(recs) or recs[i]["family"] != vt]
    if len(recs) != len(blocks) or bad:
        raise SystemExit(f"member-id join broken at k={k}: {len(blocks)} blocks vs {len(recs)} cells "
                         f"records, {len(bad)} vertype mismatches (first at index {bad[0] if bad else '-'})")
    log(f"  member ids verified against {os.path.basename(p)}: {len(recs)} records aligned")



def emit_records(groups, D, id_prefix, log, limit_units=None):
    """Turn keyed family groups into shelf records: params, region, symbolic cell, basis.

    Extracted from main() 2026-08-09 so the QUOTIENT exporter emits the identical record shape instead of
    forking it. The two front ends differ only in where a family comes from — a group of grid snapshots, or
    a single abstract block whose angles were solved rather than enumerated — and by this point that
    difference is gone.
    """
    records = []
    for i, (key, fams) in enumerate(sorted(groups.items(), key=lambda kv: (-len(kv[1]), str(kv[0]))), 1):
        rep = min(fams, key=lambda f: (f["k"], f["vt"]))
        P = rep["P"]
        region = region_of(rep, D, limit_units)
        unit_deg = 360.0 / D
        params = []
        if P == 2:
            verts, bbox = polytope_2d(region)
        elif P == 1:
            lo, hi = interval_1d(region)
            verts, bbox = [], [[lo, hi]]
        else:
            pv = polytope_verts(region, P)
            verts = []
            bbox = ([[min(v[t] for v in pv), max(v[t] for v in pv)] for t in range(P)] if pv
                    else [[0.0, 0.0]] * P)
        for p in range(P):
            rng = bbox[p] if p < len(bbox) else [0.0, 0.0]
            # name the axis after a class whose angle IS this axis (unit coefficient, zero elsewhere)
            axis_name = f"δ{p + 1}"
            seed0 = 0.0
            for j, r in enumerate(region):
                col = r["coef"]
                if col[p] == 1 and all(col[q] == 0 for q in range(P) if q != p):
                    axis_name = r["species"]
                    seed0 = r["seedUnits"] * unit_deg
                    break
            params.append({
                "name": axis_name,
                "alpha0Deg": seed0,
                "deltaRangeDeg": [rng[0] * unit_deg, rng[1] * unit_deg],
                "alphaRangeDegOpen": [seed0 + rng[0] * unit_deg, seed0 + rng[1] * unit_deg],
                "defaultAlphaDeg": seed0,
                "tile": rep["tiles"][0] if rep["tiles"] else None,
            })
        rec = {
            "id": f"{id_prefix}-k{rep['k']}-{i:03d}",
            "k": rep["k"],
            "vertype": rep["vt"],
            "P": P,
            "members": len(fams),
            "memberVertypes": [f["vt"] for f in fams],
            "memberIds": [f["mid"] for f in fams],
            "params": params,
            "cellPolygons": [{"n": p["n"], "star": p["star"], "vertices": p["verts"]} for p in rep["polys"]],
            "basis": rep["bas"],
            "region": region,
        }
        if P == 2 and verts:
            rec["regionVertices"] = verts
        records.append(rec)
        spans = ", ".join("%s %.1f..%.1f" % (q["name"], q["alphaRangeDegOpen"][0], q["alphaRangeDegOpen"][1])
                          for q in params)
        log("  %s: P=%d members=%d regionVerts=%s  %s"
            % (rec["id"], P, len(fams), len(verts) or "1-D", spans))

    return records


def main():
    global LOG
    ap = argparse.ArgumentParser()
    ap.add_argument("--tables", required=True)
    ap.add_argument("--catalog", action="append", required=True, help="k:pruned-dir")
    ap.add_argument("--out", required=True)
    ap.add_argument("--log", required=True)
    ap.add_argument("--id-prefix", default="period-family")
    ap.add_argument("--palette", default="equi3-cx-z24", help="palette name — sets the snapshot id prefix")
    ap.add_argument("--cells", default=None,
                    help="cells json to verify the member-id join against; {k} is substituted")
    ap.add_argument("--true-k", action="store_true",
                    help="replace each record's k with the measured vertex-orbit count at a generic "
                         "parameter (vertex_orbits.stamp_records). OFF by default so the shipped export "
                         "stays byte-identical; the shelf's 4 chirally over-counted families need it on.")
    ap.add_argument("--samples", type=int, default=5)
    args = ap.parse_args()
    LOG = open(args.log, "w")
    tab = ff.load_tables(args.tables)
    D = tab.D
    log(f"=== period family export; tables={args.tables} D={D} ===")

    groups = {}
    for spec in args.catalog:
        k, path = spec.split(":", 1)
        k = int(k)
        blocks = read_blocks(path, k)
        withp = [(i, vt, cw) for i, (vt, cw) in enumerate(blocks, 1) if re.search(r"e\d+-", vt)]
        distinct_vt = len({vt for _, vt, _ in withp})
        log(f"k={k}: {len(withp)} period-bearing blocks of {len(blocks)} in {path}"
            f"  ({distinct_vt} distinct vertypes — {len(withp) - distinct_vt} blocks a vertype-keyed"
            f" read would have dropped)")
        pinned = failed = 0
        for bi, vt, conway in withp:
            try:
                fam = analyze(tab, vt, conway, D)
            except ValueError as e:
                if "PINNED" in str(e):
                    pinned += 1
                else:
                    failed += 1
                    log(f"  ⚑ {vt[:60]}: {e}")
                continue
            except Exception as e:                                   # noqa: BLE001
                failed += 1
                log(f"  ⚑ ANALYSIS ERROR {vt[:60]}: {e}")
                continue
            fam["k"] = k
            # export_composable_cells.py walks the same glob in the same order and numbers from 1, so
            # block index IS the snapshot id. Joining on the vertype string cannot work — it is not unique.
            fam["mid"] = f"ctrnact-{args.palette}-k{k}-{bi:02d}"
            groups.setdefault(family_key(fam), []).append(fam)
        log(f"k={k}: {pinned} pinned, {len(withp) - pinned - failed} flexing, {failed} failed"
            f" → {len(groups)} keyed groups so far")
        check_member_ids(args, k, blocks)

    records = emit_records(groups, D, args.id_prefix, log)
    if args.true_k:
        # The engine counts vertex orbits under the ORIENTATION-PRESERVING subgroup, so an achiral tiling
        # whose figures come in mirror pairs is over-counted. build-period-atlas.ts applies the correction
        # to snapshots and never to families, which is why 4 of the 27 shipped k≤2 families claim k=2 and
        # measure k=1 (038, 039, 042, 043 — each two chiral orbits joined by a reflection).
        # reid=False: these ids are the ones already on the shelf and in AL's notes (period-family-k2-019
        # and friends). Renumbering them to follow the corrected k would rename entries he is looking at.
        import vertex_orbits as vo
        vo.stamp_records(records, [], log, args.samples, D, reid=False)
    with open(args.out, "w") as f:
        json.dump({"_meta": {
            "source": "period-p equilateral families, coupled multi-parameter development (coupled_flex)",
            "note": "Each record is a CONTINUOUS family; members lists the fixed-angle snapshots it absorbs.",
        }, "records": records}, f, indent=1)
    log(f"wrote {len(records)} family records → {args.out}")


if __name__ == "__main__":
    main()
