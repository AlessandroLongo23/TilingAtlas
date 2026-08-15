#!/usr/bin/env python3
"""export_intrinsic_cells.py — turn every shelf entry into an INTRINSIC parametric cell.

The shipped `paramCell` is a Laurent polynomial in δ, which works only because the families it describes
are LINEAR in the angles: closure is free for a period-p tile with n ≥ 2 repeats, the insight the whole
period-p exporter rests on. A tiling's own parameter space is not linear — the closure constraint bites as
soon as a tile is allowed a non-period angle word — so the symbolic form cannot represent it. This emits
the other kind of cell: the combinatorial map, the anchor's angles, and which corners are the sliders.
The client solves for the rest.

What each record carries and why it is the smallest thing that works:

    faceSizes    the darts of face f are a consecutive run; sizes give σ without shipping it
    facePeriods  the period each face's angle word must keep — what holds the tile inside its class
    alpha        the edge involution — the only part of the map that is not implied
    angles0      the anchor, in degrees. Also the slider defaults
    orient       whether the cell's tiles are traced counter-clockwise
    freeDarts    the d corners that ARE the sliders
    tree         face placement order (face, the dart it was glued across), so the client never searches
    basisCombo   the two lattice generators as integer combinations of loop periods

Median 40 darts, so a record is a few hundred bytes against the 2.7 KB median of the Laurent cells it
replaces, and it covers the whole family instead of one linear slice of it.

RANGES. Each axis is walked outward from the anchor with the others held, developing and health-checking
at every step, and bisecting where it breaks. That is a per-axis certificate, not a joint one: the box
they form is NOT proven, and for d = 19 nothing exhaustive is affordable. The client re-runs the area
certificate on the cell it is about to draw, which is a stronger claim than a precomputed box — every
frame is checked at the point being drawn.

Run:
  python3 export_intrinsic_cells.py --out ../../experiments/period-oracle/intrinsic-cells.json \
      --log ../../experiments/results/intrinsic-cells-export.log
"""
import argparse
import glob
import json
import math
import multiprocessing
import os
import sys
import time
from collections import Counter

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import develop_map as DM
import intrinsic_family as IFM
import tiling_key as TK
import vertex_orbits as vo

CAP = 180.0          # never walk an axis further than this past the anchor
STEP = 2.0           # coarse outward step; `walk` halves it down to 1e-3 at the break
MIN_TRAVEL = 0.25    # an axis with less certified travel than this is not a slider
COVER_SAMPLES = 120  # fundamental-domain samples in the endpoint covering test
ANGLE_EPS = 1e-3     # how far every corner angle must stay inside (0°, 360°)
MAX_PATCH = 14       # widest translate grid the patch tests may need; past it the cell is degenerate
MAX_KEY_PATCH = 22   # widest grid the canonical-key test may build; past it the endpoint rests on covering
BUDGET_S = 45.0      # wall clock per entry before the remaining axes fall back to SHORT_CAP
SHORT_CAP = 10.0     # the range still scanned for an axis reached after the budget ran out

POLY_NAME = {3: "triangle", 4: "quadrilateral", 5: "pentagon", 6: "hexagon", 7: "heptagon",
             8: "octagon", 9: "nonagon", 10: "decagon", 12: "dodecagon", 18: "18-gon", 24: "24-gon"}


def poly_name(n):
    return POLY_NAME.get(n, f"{n}-gon")


def health_test(fam, combo, ref, patch_limit=None):
    """The predicate the range walk stops at: develops, and is a genuine tiling when it does.

    ⚑ The angle bound is not belt and braces, it is load-bearing, and the four standard health tests miss
    what it catches. Drive a corner to 0° and the two edges meeting there become antiparallel: the tile
    has a zero-width spike, and `is_simple` does not see it because it tests for PROPER crossings and
    deliberately ignores collinear touching, while the area certificate is untouched because a spike has
    no area. `period-k2-046` walked one axis to a configuration with an angle at exactly 0 and every
    other test passing.
    """
    Sm = vo.S()

    def ok(angles):
        if float(np.min(angles)) < ANGLE_EPS or float(np.max(angles)) > 360.0 - ANGLE_EPS:
            return False
        polys, basis, _info = DM.develop(fam, angles, combo)
        if polys is None or patch_rows(polys, basis) > (patch_limit or MAX_PATCH):
            return False
        good, _why = Sm.health(polys, basis, ref)
        if not good:
            return False
        area = sum(abs(Sm.signed_area(p["v"])) for p in polys)
        return abs(area - Sm.det_of(basis)) < 1e-7
    return ok


def covered_once(polys, basis, samples=COVER_SAMPLES, seed=7):
    """Is every point of the fundamental domain under exactly one tile? Spatial-hash version.

    Same question `scan-family-ranges.covering` answers and the same verdict, but it does not scale to
    what this file asks of it: it loops over EVERY translate and EVERY tile for EVERY sample, so a 33-tile
    cell needing a 60-wide translate grid costs ~58 million point-in-polygon tests per call — and the
    endpoint bisection calls it seven times per ray, on 38 rays. One entry sat there for over ten minutes
    and took the whole export with it.

    Placing the tiles ONCE, hashing them by centroid, and testing a sample only against the tiles whose
    centroid is within one circumradius turns that into a few thousand tests. Nothing about the criterion
    changes.
    """
    b0, b1 = basis
    circum = max(abs(z - sum(p["v"]) / len(p["v"])) for p in polys for z in p["v"])
    longest = max(abs(b0), abs(b1))
    h = vo.S().det_of(basis) / longest
    n = int(math.ceil((circum + longest) / max(h, 1e-9))) + 1
    cell_size = max(circum, 1e-6)
    # ⚑ Store (centroid, tile, translate) and translate the sample point instead of the tile. Building
    # the shifted vertex lists eagerly allocates (2n+1)² × tiles × vertices complex objects per call —
    # ~166,000 on a 33-tile cell, tens of megabytes churned per probe, times eight worker processes. The
    # arithmetic is the same; the garbage is not.
    grid = {}
    cents = [sum(p["v"]) / len(p["v"]) for p in polys]
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            t = i * b0 + j * b1
            for pi, p in enumerate(polys):
                c = cents[pi] + t
                grid.setdefault((int(math.floor(c.real / cell_size)), int(math.floor(c.imag / cell_size))),
                                []).append((c, pi, t))
    inside = vo.S().inside
    rng = __import__("random").Random(seed)
    for _ in range(samples):
        pt = rng.random() * b0 + rng.random() * b1
        gx, gy = int(math.floor(pt.real / cell_size)), int(math.floor(pt.imag / cell_size))
        hits = 0
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                for c, pi, t in grid.get((gx + dx, gy + dy), ()):
                    if abs(pt - c) <= circum + 1e-9 and inside(pt - t, polys[pi]["v"]):
                        hits += 1
        if hits != 1:
            return False
    return True


def key_patch(polys, basis):
    """Grid width `tiling_key` would build here. Its radius is bigger than the one `patch_rows` bounds."""
    b0, b1 = basis
    longest = max(abs(b0), abs(b1))
    det = abs(b0.real * b1.imag - b1.real * b0.imag)
    if det < 1e-9 or longest < 1e-9:
        return float("inf")
    circum = vo.max_circum(polys)
    ext = max(abs(z) for p in polys for z in p["v"])
    return (2 * circum + 2.0 + 2 * ext) / (det / longest)


def patch_rows(polys, basis):
    """How wide a translate grid the patch tests would need here. Bounded, or they allocate the machine.

    ⚑ A unit-edge polygon can be simple and still enclose almost no area — fold it into a zigzag — and a
    cell of such tiles has a fundamental domain far smaller than the tiles that fill it. Every patch
    builder in the project sizes its grid as reach / (det / longest side), so as that height goes to zero
    the grid goes to millions of translates: `period-k1-001` took the export to 1.5 GB and a SIGKILL on
    one probe. The area certificate does NOT catch it, because Σ areas = |det| holds perfectly well when
    both sides are tiny. Rejecting here ends the range with a reason instead, which is the honest answer:
    past this point the tiling cannot be certified at a cost worth paying.
    """
    b0, b1 = basis
    longest = max(abs(b0), abs(b1))
    det = abs(b0.real * b1.imag - b1.real * b0.imag)
    if det < 1e-9 or longest < 1e-9:
        return float("inf")
    ext = max(abs(z) for p in polys for z in p["v"])
    return (ext + longest) / (det / longest)


def build(entry, log, cap=CAP, step=STEP):
    fam, why = IFM.from_cell(entry["renderCell"])
    if fam is None:
        return None, f"no system: {why}"
    combo, info = DM.lattice_combo(fam, entry["renderCell"])
    if combo is None:
        return None, f"lattice: {info.get('reason')}"
    polys, basis, _info = DM.develop(fam, fam.angles0, combo)
    if polys is None:
        return None, "anchor does not develop"
    ref = vo.S().orientation(polys)
    # ⚑ The patch bound has to be relative to THIS cell, not absolute. A fixed 14 rejected the anchors of
    # five entries outright (`period-k3-031` needs 16.5), so every ray reported zero travel and five
    # tilings that ship a palette slider came out with none at all — a guard that rejects the tiling it is
    # guarding. Anchored at 1.5× its own requirement it still stops the runaway degeneration it exists for.
    patch_limit = max(MAX_PATCH, 1.5 * patch_rows(polys, basis))

    fam.choose_free()
    swaps = fam.repair_free()
    ok = health_test(fam, combo, ref, patch_limit)
    free = list(fam.free)

    want_key = TK.tiling_key(*vo.float_cell(entry["renderCell"]))

    def endpoint_ok(angles):
        """What the reported endpoint is certified by. Two tests too slow for every step (12 ms and 1 ms,
        against 0.06 ms for develop + health), so the walk keeps its trace and this scans back along it.

        COVERING: sample the fundamental domain and require every point under exactly ONE tile. Σ areas =
        |det| is necessary, not sufficient — an overlap and a gap of equal area pass it.

        THE KEY: the family IS the set of tilings carrying this map, so a point whose map differs is not
        in it. That is what stops a range exactly ON a degeneration instead of just inside one: on
        `period-k2-045` a walk ended with four corners at exactly 180°, where those tiles have a straight
        vertex, the primitive cell changes and the entry is no longer the tiling it claims to be. Every
        cheap test passes there.
        """
        polys, basis, _i = DM.develop(fam, angles, combo)
        if polys is None:
            return False
        if not covered_once(polys, basis):
            return False
        # ⚑ The key test builds its own patch and sizes it from `2·circum + 2 + 2·extent`, which is a
        # LARGER radius than anything `patch_rows` bounds. On a 33-tile cell that is ~1.5 million dict
        # entries, ~500 MB, and with eight workers the machine runs out and the pool loses the task
        # silently — `imap_unordered` then waits forever for a result that will never come. Where it is
        # not affordable the endpoint stands on the covering count alone, which is the test that decides
        # whether it tiles; skipping it can only make a range shorter, never wrong.
        if key_patch(polys, basis) > MAX_KEY_PATCH:
            return True
        return TK.tiling_key(polys, basis) == want_key

    def certified(axis, sign, lim):
        """Walk the axis, then find the furthest point on that walk the expensive tests still pass.

        ⚑ BISECTED, not scanned. The cheap tests hold on a prefix of the ray and the expensive ones cut it
        shorter, so the answer is a boundary and binary search finds it in ~7 probes where a scan back
        from the end takes one per step. That is 12 ms against 2 s per direction, and with 3,600
        directions across the shelf it is the difference between a 15-minute export and one that never
        finishes — the first attempt did not get past its 17th entry.
        """
        r, _a, why, trace = fam.walk(axis, sign, cap=lim, step=step, ok=ok, trace_out=True)
        lo, hi = 0, len(trace) - 1                       # trace[0] is the anchor and always passes
        if hi > 0 and endpoint_ok(trace[hi][1]):
            return trace[hi][0], why
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if endpoint_ok(trace[mid][1]):
                lo = mid
            else:
                hi = mid
        return trace[lo][0], (why if trace[lo][0] >= r - 1e-12 else "endpoint test")

    # ⚑ A wall-clock budget per ENTRY, and it is not a nicety. Cost per axis varies by three orders of
    # magnitude across the shelf — a 3-tile cell walks a ray in milliseconds, a 33-tile one with a long
    # range takes minutes — and with a pool of workers one such entry stalls the whole export while seven
    # cores idle. Past the budget the remaining axes are still scanned, to a short cap: a slider with a
    # ±10° certified range is worth having, and the alternative on offer is no slider at all.
    deadline = time.time() + BUDGET_S
    params, dropped, truncated = [], [], 0
    for j, dart in enumerate(free):
        a0 = float(fam.angles0[dart])
        lim = cap if time.time() < deadline else SHORT_CAP
        if lim != cap:
            truncated += 1
        # an interior angle of a simple polygon lives in (0°, 360°); never walk outside that
        up, why_up = certified(j, +1, min(lim, 360.0 - a0 - 1e-3))
        dn, why_dn = certified(j, -1, min(lim, a0 - 1e-3))
        face = fam.face_of[dart]
        if up + dn < MIN_TRAVEL:
            dropped.append((dart, up + dn))
            continue
        params.append({
            "name": f"d{dart}",
            "dart": int(dart),
            "tile": f"{poly_name(len(fam.faces[face]))} #{face}",
            "alpha0Deg": a0,
            "defaultAlphaDeg": a0,
            "deltaRangeDeg": [-dn, up],
            "alphaRangeDegOpen": [a0 - dn, a0 + up],
            "stops": [why_dn, why_up],
        })
    # A dropped axis is a direction the tiling HAS and cannot travel far enough along to be worth a
    # handle. It leaves `params`, so the UI never shows a slider that does nothing, and it is counted.
    rec = {
        "id": entry["id"],
        "k": entry["k"],
        "kind": "intrinsic",
        "faceSizes": [len(ds) for ds in fam.faces],
        "facePeriods": [int(q) for q in fam.periods],
        "alpha": [int(x) for x in fam.alpha],
        "angles0": [round(float(x), 12) for x in fam.angles0],
        "orient": int(fam.orient),
        "freeDarts": [int(p["dart"]) for p in params],
        "tree": None,
        "basisCombo": [[[int(d), int(c)] for d, c in row] for row in combo],
        "params": params,
        "dimension": len(free),
        "droppedAxes": [[int(d), round(float(t), 4)] for d, t in dropped],
        "truncatedAxes": truncated,
        "swappedAxes": [[int(a), int(b)] for a, b in swaps],
    }
    rec["tree"] = DM.placement_tree(fam)
    # Keyed on the TILING, not on the id. Ids are assigned by `shelf-dedup.py` at the end of every build
    # and move whenever the shelf's contents do, while this file costs ~17 minutes to regenerate; keying
    # on the canonical map means a rebuild re-attaches what it already has instead of re-solving it.
    rec["key"] = want_key
    rec["anchorCell"] = {
        "cellPolygons": [{"n": p["n"], "vertices": [[z.real, z.imag] for z in p["v"]]} for p in polys],
        "basis": [[basis[0].real, basis[0].imag], [basis[1].real, basis[1].imag]],
    }
    return rec, None


NOTE = (
    "Its parameters are the TILING's own, not a palette's: the sliders are corner angles of the cell, and "
    "the rest of the geometry is solved at render time from the combinatorial map (tile angle sums, "
    "unit-edge closure, vertex sums). The shipped palette could only report the freedom it had symbols "
    "for, which is why entries like this one used to read as rigid. Each slider's range is walked with "
    "the others held at the anchor and certified at its endpoint by a covering count and by the tiling's "
    "canonical map; combinations of sliders are certified in the browser, on the cell being drawn."
)


def align(entry_a, entry_b):
    """B's corner angles renumbered into A's darts, or None. Both must carry the same canonical map.

    Two entries over one map are only comparable coordinate by coordinate once their darts are lined up,
    and the canonical labelling is what lines them up: if A's labelling and B's both achieve the same
    canonical string, then A's dart `la[i]` plays the part of B's `lb[i]`. Same alignment `tiling_key.relate`
    uses for the subspace test, applied to a single point instead of a whole family.
    """
    ma = TK.build_map(*vo.float_cell(entry_a["renderCell"]))
    mb = TK.build_map(*vo.float_cell(entry_b["renderCell"]))
    if ma is None or mb is None:
        return None
    ka, la = TK.canonical(ma[0], ma[1], ma[2])
    kb, lb = TK.canonical(mb[0], mb[1], mb[2])
    if ka != kb or len(ma[5]) != len(mb[5]):
        return None
    ang_b = TK.corner_angles(mb)
    out = [0.0] * len(ang_b)
    for i, d in enumerate(la[0]):
        out[d] = ang_b[lb[0][i]]
    return out


def merge_by_map(entries, log):
    """One appearance per tiling, decided by the map — the rule AL set, applied to intrinsic families.

    `shelf-dedup.py` enforces it against the PALETTE families, where a family is an affine subspace and
    two entries can be genuinely different subspaces of one map. Intrinsic families have no such freedom:
    the constraint variety depends on the map and nothing else, so two entries carrying the same map are
    two points of ONE family and only one of them is a tiling in its own right.

    Measured before any of this was built: 470 entries carry 427 distinct maps, so this merges 43. The
    absorbed anchors are not discarded — each is recorded on the survivor as the exact slider tuple that
    reaches it, verified by solving there and comparing the developed tiling.

    ⚑ A recorded anchor can sit OUTSIDE the survivor's slider ranges, and that is not a contradiction.
    Ranges are walked one axis at a time with the others held, so they describe a cross of certified
    intervals, not the whole family; a point needing two axes to move together is in the family and off
    that cross. It is recorded with the flag, and reaching it is a UI question, not a geometry one.
    """
    by_key = {}
    for e in entries:
        k = e.get("_key")
        if k:
            by_key.setdefault(k, []).append(e)
    dropped, groups = set(), 0
    for key, lst in by_key.items():
        if len(lst) < 2:
            continue
        groups += 1
        # keep the entry with the most sliders, then the widest total travel — the most useful handle on
        # a family that is the same family whichever of its points is shown
        def rank(e):
            ps = (e.get("paramCell") or {}).get("params") or []
            return (len(ps), sum(p["alphaRangeDegOpen"][1] - p["alphaRangeDegOpen"][0] for p in ps), e["id"])
        lst = sorted(lst, key=rank, reverse=True)
        keep, rest = lst[0], lst[1:]
        anchors = keep.setdefault("anchors", [])
        for b in rest:
            vals = align(keep, b)
            ps = (keep.get("paramCell") or {}).get("params") or []
            rec = {"id": b["id"], "k": b.get("k")}
            if vals is not None and ps:
                rec["values"] = [round(vals[p["dart"]], 6) for p in ps]
                rec["inRange"] = all(p["alphaRangeDegOpen"][0] - 1e-6 <= v <= p["alphaRangeDegOpen"][1] + 1e-6
                                     for p, v in zip(ps, rec["values"]))
            anchors.append(rec)
            dropped.add(b["id"])
            log(f"  {b['id']} is a point of {keep['id']} (same map)"
                + ("" if "values" not in rec else
                   f" at {', '.join(f'{v:.1f}°' for v in rec['values'])}"
                   + ("" if rec["inRange"] else " — outside the per-axis ranges")))
        keep["note"] = (keep.get("note", "") + " Absorbs " + ", ".join(a["id"] for a in anchors)
                        + ": the same tiling family, seen at a different point of it.").strip()
    log(f"merge by map: {groups} maps carried more than one entry, {len(dropped)} entries absorbed")
    return dropped


def attach(shelf_paths, cells_path, log, write=False):
    """Write the intrinsic cells onto a BUILT shelf, matched by tiling key.

    Runs downstream of `shelf-dedup.py` for the same reason that does: what ships is what the build
    wrote, and a check or an attachment that lives after every producer cannot be skipped by adding one.
    """
    recs = json.load(open(cells_path))
    by_key = {r["key"]: r for r in recs if r.get("key")}
    log(f"attach: {len(by_key)} intrinsic cells from {os.path.basename(cells_path)}")
    hit = miss = rigid = 0
    loaded = {p: json.load(open(p)) for p in shelf_paths}
    for path, entries in loaded.items():
        for e in entries:
            key = TK.tiling_key(*vo.float_cell(e["renderCell"]))
            r = by_key.get(key)
            if r is None:
                miss += 1
                log(f"  ⚑ {e['id']}: no intrinsic cell for its map — left as it was")
                continue
            hit += 1
            e["_key"] = key
            e["renderCell"] = r["anchorCell"]
            e["note"] = (e.get("note", "") + " " + NOTE).strip()
            e["intrinsicDim"] = r["dimension"]
            if not r["params"]:
                rigid += 1
                e.pop("paramCell", None)
                e.pop("alphaRange", None)
                continue
            e["paramCell"] = {
                "params": [{k: v for k, v in p.items() if k != "stops"} for p in r["params"]],
                # Constant Laurent terms of the anchor: a consumer that has never heard of `intrinsic`
                # still renders a real tiling, the entry's default, instead of nothing.
                "cellPolygons": [{"n": p["n"], "vertices": [[[0, x, y]] for x, y in p["vertices"]]}
                                 for p in r["anchorCell"]["cellPolygons"]],
                "basis": [[[0, r["anchorCell"]["basis"][0][0], r["anchorCell"]["basis"][0][1]]],
                          [[0, r["anchorCell"]["basis"][1][0], r["anchorCell"]["basis"][1][1]]]],
                "intrinsic": {k: r[k] for k in ("kind", "faceSizes", "facePeriods", "alpha", "angles0",
                                                "orient", "tree", "basisCombo")},
            }
            e["alphaRange"] = r["params"][0]["alphaRangeDegOpen"]
    log(f"attach: {hit} matched ({rigid} with no slider), {miss} unmatched")

    dropped = merge_by_map([e for es in loaded.values() for e in es], log)
    total = 0
    for path, entries in loaded.items():
        keep = [e for e in entries if e["id"] not in dropped]
        for e in keep:
            e.pop("_key", None)
        total += len(keep)
        if write:
            with open(path, "w") as fh:
                json.dump(keep, fh, separators=(",", ":"))
                fh.write("\n")
            log(f"  rewrote {os.path.basename(path)}: {len(keep)} entries, "
                f"{os.path.getsize(path) / 1024:.0f} KB")
    log(f"shelf: {hit + miss} → {total} entries")
    return miss


def _build_one(arg):
    """Pool worker: one entry in, one record out. Errors come back as a message instead of a traceback in
    a child process, where nothing would ever read it."""
    entry, cap = arg
    try:
        rec, why = build(entry, lambda _m: None, cap=cap)
        return rec, (None if rec is not None else f"{entry['id']}: {why}")
    except Exception as exc:                                            # noqa: BLE001
        return None, f"{entry['id']}: {type(exc).__name__}: {exc}"


def main():
    ap = argparse.ArgumentParser()
    # ⚑ Default 1, deliberately. The pool version is correct and roughly 6× faster on a short run, and on
    # the full shelf it repeatedly went quiet after 60-odd entries with every worker idle — the tasks were
    # dispatched and no result ever came back. Not diagnosed; numpy's Accelerate backend across a fork on
    # this machine is the suspect. Single-threaded takes about 70 minutes and always finishes, and this
    # file runs when the shelf changes, not on every build.
    ap.add_argument("--jobs", type=int, default=1)
    ap.add_argument("--shelf", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--log", required=True)
    ap.add_argument("--attach", action="store_true",
                    help="do not solve: write the cells in --out onto the built shelf, matched by key")
    ap.add_argument("--write", action="store_true", help="with --attach, rewrite the shelf files")
    ap.add_argument("--id", action="append", default=[])
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--cap", type=float, default=CAP)
    args = ap.parse_args()
    out = open(args.log, "w")

    def log(m):
        print(m, flush=True)
        out.write(m + "\n")
        out.flush()

    if args.attach:
        root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
        main = args.shelf or os.path.join(root, "public", "reference-atlas-period.json")
        paths = [main] + sorted(glob.glob(main.replace(".json", "-k*.json")))
        miss = attach(paths, args.out, log, write=args.write)
        sys.exit(0 if miss == 0 else 1)

    entries = IFM.shelf_entries(args.shelf)
    if args.id:
        entries = [e for e in entries if e["id"] in args.id or e.get("legacyId") in args.id]
    if args.limit:
        entries = entries[:args.limit]
    log(f"# intrinsic cell export — {len(entries)} entries, axes walked to ±{args.cap}°, "
        f"{args.jobs} worker(s)")
    recs, fails, t0 = [], Counter(), time.time()
    travel, dropped, rigid, truncated = [], 0, 0, 0
    # Entries share nothing, so this is embarrassingly parallel and needs to be: single-threaded it was
    # heading for 2.4 hours, because a wide entry walks 2·d rays and the widest has 19 of them.
    results = (map(_build_one, [(e, args.cap) for e in entries]) if args.jobs <= 1 else
               multiprocessing.Pool(args.jobs, maxtasksperchild=8).imap_unordered(_build_one, [(e, args.cap) for e in entries]))
    for i, (rec, why) in enumerate(results, 1):
        if rec is None:
            fails[why.split(":")[0]] += 1
            log(f"  ⚑ {why}")
            continue
        recs.append(rec)
        dropped += len(rec["droppedAxes"])
        truncated += rec.get("truncatedAxes", 0)
        if not rec["params"]:
            rigid += 1
        for p in rec["params"]:
            travel.append(p["alphaRangeDegOpen"][1] - p["alphaRangeDegOpen"][0])
        if i % 5 == 0:
            el = time.time() - t0
            log(f"  ... {i}/{len(entries)}  elapsed {el:.0f}s  ETA {el / i * (len(entries) - i):.0f}s")
    json.dump(recs, open(args.out, "w"), separators=(",", ":"))
    log("")
    log(f"{len(recs)} of {len(entries)} exported → {args.out}")
    if fails:
        log("  failures: " + ", ".join(f"{k}: {v}" for k, v in fails.most_common()))
    log(f"  {sum(len(r['params']) for r in recs)} sliders; {dropped} axes dropped for travel < {MIN_TRAVEL}°; "
        f"{rigid} entries end up with no slider at all; {truncated} axes scanned only to ±{SHORT_CAP}° "
        f"because their entry ran out of its {BUDGET_S:.0f}s budget")
    if travel:
        t = np.array(travel)
        log(f"  slider span: median {np.median(t):.1f}°, mean {t.mean():.1f}°, "
            f"min {t.min():.2f}°, max {t.max():.1f}°")
    log("  sliders per entry: " + ", ".join(
        f"{k}: {v}" for k, v in sorted(Counter(len(r["params"]) for r in recs).items())))
    log(f"  wrote {os.path.getsize(args.out) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
