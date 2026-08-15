#!/usr/bin/env python3
"""Vertex-orbit count (the k of "k-uniform") for a DEVELOPED periodic cell.

Why this exists. `lib/classes/algorithm/composable/canonicalTilingKey.ts:trueVertexOrbitCount` is the
counter the shelf builders use, and on period-family cells it is out of its validated domain: it reported
19 orbits for a 3-tile cell that the covering test confirms tiles the plane exactly. Two reasons, both
structural, not tuning:

  * It canonicalises each vertex's patch over 24 FIXED rotations (multiples of 15°). That is exactly right
    for the concrete grid shelves — every edge direction there is a ζ₂₄ power, so every symmetry rotation
    is a multiple of 15° — and it is wrong the moment angles are solved instead of enumerated. A period-3
    family at α = 103.7° has symmetry rotations at no multiple of 15°, so two vertices in one orbit get
    different fingerprints and the count inflates.
  * It never reduces the vertex set modulo the lattice: `nearVerts` is every vertex within one period of
    the origin, so a cell with V vertices per fundamental domain offers up ~πp²/A candidates and relies
    entirely on the fingerprint to merge the translates back. When the fingerprint is the broken half, the
    answer is not merely wrong, it is unbounded — which is how a 3-tile cell reached 19.

What this does instead. Vertices are reduced modulo the lattice first, so the candidate set is the V of
Euler's V − E + F = 0 on the torus and never larger. Orbits are then merged by an isometry DERIVED from
the geometry (one neighbour pairing fixes the rotation, direct and reflected) rather than searched over a
fixed angle list — the same `congruent_by` that scan-family-ranges.py already uses for the fold test and
the family merge, so the two agree by construction and there is one congruence notion in the project.

Orbits are counted under the FULL symmetry group, mirror images merged, per CLAUDE.md's settled chirality
convention.

Correctness of the patch radius. If an isometry carries the radius-R neighbourhood of vertex v onto that
of w, and R exceeds (one lattice period) + (one tile diameter), the isometry maps a full fundamental
domain and its corona; a tile placement in an edge-to-edge tiling is forced by its corona, so the map
propagates and extends to a symmetry of the whole tiling. R here is |b₀| + |b₁| + 2·maxCircum + 0.5, which
clears that with room, and `--verify-radius` re-runs at R + 2 to show the count does not move.

For a FAMILY the answer is the count at a GENERIC parameter, which is the MAXIMUM over the region: orbits
only ever merge on the coincidence locus (a closed, lower-dimensional subset), never split. So k is read
off several interior samples and the largest is taken, and the count at the shipped default is reported
next to it — when they differ, the default is sitting on a coincidence and needs a generic seed.

Usage:
  python3 vertex_orbits.py <cells.json> [--samples 9] [--verify-radius] [--limit N] [--json out.json]
"""
import argparse
import cmath
import importlib.util
import json
import math
import os
import sys
from collections import defaultdict

TOL = 1e-6            # position identity, in edge-length units (developments are exact to ~1e-12)
TURN_TOL = 1e-3       # a vertex's incident corners must close a full turn to within this, in degrees

_S = None


def S():
    """scripts/scan-family-ranges.py — its `cell_at`, `health` and `congruent_by` are the project's
    single definition of "evaluate this family here" and "are these two the same up to isometry"."""
    global _S
    if _S is None:
        root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
        sp = importlib.util.spec_from_file_location("sfr", os.path.join(root, "scripts", "scan-family-ranges.py"))
        _S = importlib.util.module_from_spec(sp)
        sp.loader.exec_module(_S)
    return _S


# ── the cell, in the one shape everything below wants ─────────────────────────────────────────────────
def float_cell(render_cell):
    """A `renderCell` (plain [x, y] floats) as (polys, basis) in the complex form cell_at returns."""
    polys = [{"n": q.get("n", len(q["vertices"])), "v": [complex(x, y) for x, y in q["vertices"]]}
             for q in render_cell["cellPolygons"]]
    return polys, [complex(*render_cell["basis"][0]), complex(*render_cell["basis"][1])]


def tile_label(v):
    """Rotation- AND reflection-invariant tile identity.

    (vertex count, area) is what `clouds` uses and it is not quite enough here: two period-3 hexagons with
    different angle words can share both. The sorted centroid-distance multiset separates them and stays
    blind to chirality, which it must be — a mirror tile has to carry the SAME label or no reflection
    congruence could ever match, and mirror images are one orbit by project convention.
    """
    c = sum(v) / len(v)
    return (len(v), round(abs(S().signed_area(v)), 6),
            tuple(sorted(round(abs(z - c), 6) for z in v)))


def _frac(z, b0, b1):
    det = b0.real * b1.imag - b1.real * b0.imag
    a = (z.real * b1.imag - b1.real * z.imag) / det
    b = (b0.real * z.imag - z.real * b0.imag) / det
    return a, b


def lattice_reps(polys, basis):
    """One representative per lattice class of tiling vertex, as a point of the fundamental parallelogram.

    Every corner of every cell tile is a vertex of the tiling (edge-to-edge, and a solved seed keeps every
    angle strictly inside (0°, 180°) so no corner is a fake one sitting mid-edge). A vertex is a corner of
    each tile around it, and those tiles may be lattice translates of cell tiles, so the same vertex shows
    up several times at positions differing by a lattice vector — reducing mod the lattice is what collapses
    them, and it is the step the TS counter is missing.
    """
    b0, b1 = basis
    reps = []
    for p in polys:
        for z in p["v"]:
            fa, fb = _frac(z, b0, b1)
            fa -= math.floor(fa)
            fb -= math.floor(fb)
            if fa > 1 - 1e-7:
                fa -= 1
            if fb > 1 - 1e-7:
                fb -= 1
            w = fa * b0 + fb * b1
            # Compare across the parallelogram seam too: the snap above puts fa ≈ 1 back at 0, but a corner
            # sitting exactly on an edge can land either side of it by 1e-13 and must not become two.
            if not any(min(abs(w - u - (i * b0 + j * b1)) for i in (-1, 0, 1) for j in (-1, 0, 1)) < TOL
                       for u in reps):
                reps.append(w)
    return reps


def _translates(basis, polys, radius):
    b0, b1 = basis
    longest = max(abs(b0), abs(b1))
    h = S().det_of(basis) / longest if longest > 0 else 1.0
    extent = max((abs(z) for p in polys for z in p["v"]), default=0.0)
    n = int(math.ceil((radius + 2 * extent) / max(h, 1e-9))) + 1
    return [i * b0 + j * b1 for i in range(-n, n + 1) for j in range(-n, n + 1)]


def max_circum(polys):
    return max(max(abs(z - sum(p["v"]) / len(p["v"])) for z in p["v"]) for p in polys)


def default_radius(polys, basis):
    return abs(basis[0]) + abs(basis[1]) + 2 * max_circum(polys) + 0.5


def vertex_figure(polys, basis, v, circum):
    """Canonical cyclic word of the TILE LABELS around v, up to rotation and reflection, with the angle sum.

    An isometry invariant of the vertex, so partitioning candidates by it before the cloud test can only be
    correct, and it is cheap. The angle sum is separate and is the check that v is a vertex at all: the
    incident corners must close a full turn.

    ⚑ No angle in the key, deliberately. Putting the corner angle in the word makes a sharper prefilter and
    a rounding hazard: two vertices of one orbit have equal angles only up to float error, so a value
    straddling the quantiser's boundary splits an orbit and inflates k. Harmless on a grid shelf, where
    every angle is a multiple of 15°, and exactly the wrong risk to take on a shelf whose angles were
    solved. Labels alone are a coarser partition; the cloud test separates whatever it lets through.
    """
    Sm = S()
    inc = []
    for t in _translates(basis, polys, circum + 1.0):
        for p in polys:
            vs = [z + t for z in p["v"]]
            c = sum(vs) / len(vs)
            if abs(c - v) > circum + TOL:
                continue
            lab = tile_label(p["v"])
            for i, z in enumerate(vs):
                if abs(z - v) < TOL:
                    a, b = vs[(i - 1) % len(vs)], vs[(i + 1) % len(vs)]
                    inc.append((cmath.phase((a + b) / 2 - v), lab, Sm.angle_at(vs, i)))
    inc.sort()
    total = sum(a for _, _, a in inc)
    return _canon_cyclic([str(lab) for _, lab, _ in inc]), total


def _canon_cyclic(seq):
    best = None
    for s in (seq, list(reversed(seq))):
        for i in range(len(s)):
            f = "|".join(s[i:] + s[:i])
            if best is None or f < best:
                best = f
    return best or ""


def vertex_cloud(pre, trans, anchor, radius):
    return [(lab, c + t - anchor) for t in trans for lab, c in pre
            if abs(c + t - anchor) <= radius + 1e-6]


GRID = 1e4        # spatial-hash cell, ~10⁵× the 1e-9 development error and ≪ any tile spacing
MATCH = 1e-7


def _index(pts):
    ix = defaultdict(list)
    for lab, z in pts:
        ix[(lab, int(math.floor(z.real * GRID)), int(math.floor(z.imag * GRID)))].append(z)
    return ix


def _lookup(ix, lab, w):
    gx, gy = int(math.floor(w.real * GRID)), int(math.floor(w.imag * GRID))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for z in ix.get((lab, gx + dx, gy + dy), ()):
                if abs(z - w) < MATCH:
                    return z
    return None


def symmetry_between(a_pts, b_pts, radius):
    """The isometry carrying the tiling around vertex A onto the tiling around vertex B, or None.

    Stronger than `congruent_by`, deliberately. That one confirms every point of A's inner disk has SOME
    same-label partner in B, which is a containment, not a bijection: a map that folds two A tiles onto one
    B tile passes it. Here the two inner disks must have equal size and the candidate isometry must be a
    bijection between them, matched point for point. The candidate itself is still derived the same way —
    the nearest labelled neighbour pins the rotation, direct and reflected — because quantising the angle
    is the bug this file exists to avoid.

    Returns "rotation" or "reflection". Reflections merge: orbits are under the FULL symmetry group.
    """
    inner = radius - 1.0
    A = [(lab, z) for lab, z in a_pts if abs(z) <= inner]
    B = [(lab, z) for lab, z in b_pts if abs(z) <= inner]
    if not A or len(A) != len(B):
        return None
    ref = min(((lab, z) for lab, z in A if abs(z) > 1e-9), key=lambda t: abs(t[1]), default=None)
    if ref is None:
        return None
    ix = _index(B)
    cands = []
    for lab, z in B:
        if lab == ref[0] and abs(abs(z) - abs(ref[1])) < 1e-6:
            cands.append(("rotation", z / ref[1]))
            cands.append(("reflection", z / ref[1].conjugate()))
    for kind, rot in cands:
        if abs(abs(rot) - 1) > 1e-9:
            continue
        used, ok = set(), True
        for lab, z in A:
            w = rot * (z.conjugate() if kind == "reflection" else z)
            hit = _lookup(ix, lab, w)
            if hit is None or (lab, hit.real, hit.imag) in used:
                ok = False
                break
            used.add((lab, hit.real, hit.imag))
        if ok:
            return kind
    return None


def orbit_count(polys, basis, radius=None, detail=False):
    """Number of vertex orbits under the full symmetry group. Mirror images merged.

    Returns the count, or (count, info) when `detail`.
    """
    Sm = S()
    ps = [p for p in polys if abs(Sm.signed_area(p["v"])) > Sm.ZERO_AREA]
    if not ps:
        return (0, {"reps": 0, "figures": 0, "radius": 0.0}) if detail else 0
    circum = max_circum(ps)
    R = radius if radius is not None else default_radius(ps, basis)
    reps = lattice_reps(ps, basis)
    figs, bad = {}, []
    for v in reps:
        w, total = vertex_figure(ps, basis, v, circum)
        if abs(total - 360.0) > TURN_TOL:
            bad.append((v, total))
            continue
        figs.setdefault(w, []).append(v)
    pre = [(tile_label(p["v"]), sum(p["v"]) / len(p["v"])) for p in ps]
    trans = _translates(basis, ps, R)
    orbits = 0
    for w, vs in figs.items():
        clouds = [vertex_cloud(pre, trans, v, R) for v in vs]
        parent = list(range(len(vs)))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        for i in range(len(vs)):
            for j in range(i + 1, len(vs)):
                if find(i) == find(j):
                    continue
                if symmetry_between(clouds[i], clouds[j], R):
                    parent[find(i)] = find(j)
        orbits += len({find(i) for i in range(len(vs))})
    if detail:
        return orbits, {"reps": len(reps), "figures": len(figs), "radius": R,
                        "nonVertexCorners": len(bad)}
    return orbits


# ── families: the generic count ───────────────────────────────────────────────────────────────────────
GENERIC_TS = [0.1123, 0.2371, 0.3617, 0.4409, 0.5091, 0.6473, 0.7719, 0.8237, 0.8867]


def _inside(region, delta_units, margin=1e-6):
    for r in region:
        x = r["seedUnits"] + sum(c * d for c, d in zip(r["coef"], delta_units))
        if not (margin < x < r.get("limitUnits", 12.0) - margin):
            return False
    return True


def sample_alphas(rec, n, D=24):
    """Generic interior points of the family's region, as α tuples.

    Deliberately at irrational-looking fractions of each axis: the whole failure being measured is a seed
    landing on a coincidence, and sampling at halves and thirds walks straight back onto them.
    """
    unit = 360.0 / D
    P = rec["P"]
    box = [p["deltaRangeDeg"] for p in rec["params"]]
    region = rec.get("region") or []
    ts = GENERIC_TS[:n] if n <= len(GENERIC_TS) else \
        [(i + 0.5) / n + 0.0113 for i in range(n)]
    out = []
    if P == 1:
        for t in ts:
            d = box[0][0] + (box[0][1] - box[0][0]) * t
            if not region or _inside(region, [d / unit]):
                out.append([rec["params"][0]["alpha0Deg"] + d])
    else:
        # Halton-ish deterministic sweep of the bounding box, kept only where the exact half-planes hold.
        def radical(i, b):
            f, r, x = 1.0, 0.0, i
            while x > 0:
                f /= b
                r += f * (x % b)
                x //= b
            return r
        bases = [2, 3, 5, 7][:P]
        i = 1
        while len(out) < n and i < 4000:
            d = [box[p][0] + (box[p][1] - box[p][0]) * (0.03 + 0.94 * radical(i, bases[p]))
                 for p in range(P)]
            if not region or _inside(region, [x / unit for x in d]):
                out.append([rec["params"][p]["alpha0Deg"] + d[p] for p in range(P)])
            i += 1
    return out


def as_family(rec):
    """The exporter's record and the shipped shelf entry, in one shape.

    The shelf (`public/reference-atlas-period.json`) nests the symbolic cell under `paramCell` and keeps
    its own widened `region`; the exporter emits the same fields flat. Reading both is what lets the 27
    verified k≤2 entries act as the regression gate for this counter.
    """
    if "paramCell" in rec and rec["paramCell"].get("params"):
        pc = rec["paramCell"]
        return {"id": rec.get("id"), "k": rec.get("k"), "P": len(pc["params"]), "params": pc["params"],
                "cellPolygons": pc["cellPolygons"], "basis": pc["basis"], "region": pc.get("region")}
    if rec.get("params") and rec.get("P", len(rec.get("params", []))) > 0:
        return {"id": rec.get("id"), "k": rec.get("k"), "P": rec["P"], "params": rec["params"],
                "cellPolygons": rec["cellPolygons"], "basis": rec["basis"], "region": rec.get("region")}
    return None


def family_k(rec, samples=9, radius=None):
    """(k_generic, k_default, n_ok) — the family's true k, and the count at the shipped default."""
    Sm = S()
    pc = {"params": rec["params"], "cellPolygons": rec["cellPolygons"], "basis": rec["basis"]}
    a0 = [p["defaultAlphaDeg"] for p in rec["params"]]
    polys, basis = Sm.cell_at(pc, a0)
    ok, _ = Sm.health(polys, basis)
    k0 = orbit_count(polys, basis, radius) if ok else None
    ref = Sm.orientation(polys) if ok else None
    best, n_ok = 0, 0
    for a in sample_alphas(rec, samples):
        polys, basis = Sm.cell_at(pc, a)
        ok, _ = Sm.health(polys, basis, ref)
        if not ok:
            continue
        n_ok += 1
        best = max(best, orbit_count(polys, basis, radius))
    return (best or k0), k0, n_ok


# ── stamping a measured k onto exporter records ───────────────────────────────────────────────────────
ID_RE = __import__("re").compile(r"^(.*?)(?:-rigid)?-k\d+-\d+$")


def region_slack(region, delta_units):
    """Distance from a point to the nearest wall of the region, in D-units."""
    m = float("inf")
    for r in region or []:
        x = r["seedUnits"] + sum(c * d for c, d in zip(r["coef"], delta_units))
        m = min(m, x, r.get("limitUnits", 12.0) - x)
    return m


def stamp_records(records, rigid, log, samples=5, D=24, reid=True):
    """Measure every entry's k, and move each family's DEFAULT onto a generic point.

    Two separate repairs that have to happen together:

    * The k label. The search reports how many abstract vertex orbits a block has, and that is not the k
      of the tiling on screen — distinct abstract classes can realise to one figure, and on the k=3
      quotient tier 7 of 103 families and 25 of 62 pinned entries do exactly that. `orbit_count` measures
      it from the geometry. A family's k is the count at a GENERIC parameter, i.e. the maximum over the
      region, because orbits merge on the coincidence locus and never split.
    * The default parameter. Generic seeding fixes where a family is ANCHORED and cannot help a family
      whose only integer grid points are coincident, nor a PINNED entry, which has one point and no
      freedom at all. The default is not confined to the grid though — the cell is a Laurent polynomial
      in δ and evaluates anywhere — so when the default renders a less-generic tiling than the family
      has, it is moved here, to the sampled generic point furthest from the region's walls.
    """
    unit = 360.0 / D
    moved = relabelled = 0
    for r in records:
        pc = {"params": r["params"], "cellPolygons": r["cellPolygons"], "basis": r["basis"]}
        a0 = [p["defaultAlphaDeg"] for p in r["params"]]
        polys, basis = S().cell_at(pc, a0)
        ok, _ = S().health(polys, basis)
        ref = S().orientation(polys) if ok else None
        k_default = orbit_count(polys, basis) if ok else None
        best = None
        for a in sample_alphas(r, samples, D):
            p2, b2 = S().cell_at(pc, a)
            good, _ = S().health(p2, b2, ref)
            if not good:
                continue
            kk = orbit_count(p2, b2)
            sl = region_slack(r.get("region"),
                              [(a[i] - r["params"][i]["alpha0Deg"]) / unit for i in range(len(a))])
            if best is None or (kk, sl) > (best[0], best[1]):
                best = (kk, sl, a)
        if best is None:
            log(f"  ⚑ {r['id']}: no healthy generic sample; k left at engine {r['k']}")
            continue
        k, _sl, a = best
        r["engineK"] = r["k"]
        if k != r["k"]:
            relabelled += 1
        r["k"] = k
        if k_default != k:
            moved += 1
            for p, av in zip(r["params"], a):
                p["defaultAlphaDeg"] = av
        r["kAtOldDefault"] = k_default
    rmoved = 0
    for t in rigid:
        polys, basis = float_cell(t["renderCell"])
        k = orbit_count(polys, basis)
        t["engineK"] = t["k"]
        if k != t["k"]:
            rmoved += 1
        t["k"] = k
    log(f"true-k stamp: {relabelled} of {len(records)} families relabelled, {moved} defaults moved off a "
        f"coincidence; {rmoved} of {len(rigid)} pinned tilings relabelled")
    if reid:
        for group, mid in ((records, ""), (rigid, "-rigid")):
            byk = {}
            for r in sorted(group, key=lambda x: x["id"]):
                byk.setdefault(r["k"], []).append(r)
            for kk, lst in byk.items():
                for i, r in enumerate(lst, 1):
                    m = ID_RE.match(r["id"])
                    r["id"] = f"{m.group(1) if m else r['id']}{mid}-k{kk}-{i:03d}"
    return records, rigid


# ── the regression gate ───────────────────────────────────────────────────────────────────────────────
def galebach_gate(max_k=6, atlas=None):
    """Reproduce Galebach's k on the classical k-uniform catalogue. The counter's licence to operate.

    `public/reference-atlas.json` carries Brian Galebach's enumeration under `source: "galebach"` with the
    published counts — 11, 20, 61, 151, 332, 673 for k = 1..6 — and those k values come from outside this
    project entirely. A counter that reproduces all 1,248 of them is measuring k-uniformity; one that does
    not is measuring something else, whatever its output looks like on a shelf with no ground truth.

    Runs in ~17 min at k ≤ 6 and ~2 s at k ≤ 3, so the k ≤ 3 form is the one to run after touching this file.
    """
    root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
    path = atlas or os.path.join(root, "public", "reference-atlas.json")
    entries = [x for x in json.load(open(path))
               if x.get("source") == "galebach" and x["k"] <= max_k]
    from collections import Counter
    print(f"galebach gate: {len(entries)} tilings, k≤{max_k}  {dict(sorted(Counter(x['k'] for x in entries).items()))}")
    bad = []
    for i, x in enumerate(entries, 1):
        polys, basis = float_cell(x["renderCell"])
        k = orbit_count(polys, basis)
        if k != x["k"]:
            bad.append((x["id"], x["k"], k))
        if i % 200 == 0:
            print(f"  {i}/{len(entries)}  mismatches {len(bad)}", flush=True)
    for b in bad[:20]:
        print(f"  ⚑ {b[0]}: published k={b[1]}, counted {b[2]}")
    print(f"galebach gate: {'PASS' if not bad else f'FAIL — {len(bad)} of {len(entries)} disagree'}")
    return not bad


# ── CLI ───────────────────────────────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cells", nargs="*")
    ap.add_argument("--gate", type=int, default=0, metavar="MAXK",
                    help="run the Galebach regression gate up to this k and exit (3 is the quick form)")
    ap.add_argument("--samples", type=int, default=9)
    ap.add_argument("--verify-radius", action="store_true",
                    help="re-run every count at R+2 and report any that move")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--json", default=None)
    args = ap.parse_args()
    if args.gate:
        sys.exit(0 if galebach_gate(args.gate) else 1)
    Sm = S()
    rows = []
    for path in args.cells:
        d = json.load(open(path))
        recs = d["records"] if isinstance(d, dict) and "records" in d else (d if isinstance(d, list) else [])
        rigid = d.get("rigid", []) if isinstance(d, dict) else []
        if args.limit:
            recs, rigid = recs[:args.limit], rigid[:args.limit]
        print(f"=== {os.path.basename(path)}: {len(recs)} families, {len(rigid)} rigid ===", flush=True)
        for r0 in recs:
            r = as_family(r0)
            if r:
                kg, k0, n = family_k(r, args.samples)
                extra = ""
                if args.verify_radius:
                    pc = {"params": r["params"], "cellPolygons": r["cellPolygons"], "basis": r["basis"]}
                    a = sample_alphas(r, 1)
                    if a:
                        polys, basis = Sm.cell_at(pc, a[0])
                        big = orbit_count(polys, basis, default_radius(polys, basis) + 2.0)
                        small = orbit_count(polys, basis)
                        extra = "  radius-stable" if big == small else f"  ⚑ RADIUS {small}→{big}"
                rows.append({"id": r["id"], "file": path, "engineK": r.get("k"),
                             "trueK": kg, "kAtDefault": k0, "P": r.get("P"), "samples": n})
                flag = "" if kg == r.get("k") else "  ⚑"
                dflt = "" if k0 == kg else f" (default sits at k={k0})"
                print(f"  {r['id']:<28} P={r.get('P')} engine k={r.get('k')} → true k={kg}"
                      f"{dflt}{flag}{extra}", flush=True)
            else:
                r = r0
                cell = r.get("renderCell")
                if not cell:
                    continue
                polys, basis = float_cell(cell)
                kk = orbit_count(polys, basis)
                rows.append({"id": r["id"], "file": path, "engineK": r.get("k"), "trueK": kk,
                             "kAtDefault": kk, "P": 0, "samples": 1})
                print(f"  {r['id']:<28} P=0 engine k={r.get('k')} → true k={kk}"
                      f"{'' if kk == r.get('k') else '  ⚑'}", flush=True)
        for r in rigid:
            polys, basis = float_cell(r["renderCell"])
            kk = orbit_count(polys, basis)
            rows.append({"id": r["id"], "file": path, "engineK": r.get("k"), "trueK": kk,
                         "kAtDefault": kk, "P": 0, "samples": 1})
            print(f"  {r['id']:<28} P=0 engine k={r.get('k')} → true k={kk}"
                  f"{'' if kk == r.get('k') else '  ⚑'}", flush=True)
    bad = [x for x in rows if x["engineK"] is not None and x["trueK"] != x["engineK"]]
    print(f"\n{len(rows)} entries; {len(bad)} disagree with the engine k")
    from collections import Counter
    print("  engine k → true k: " + ", ".join(
        f"{a}→{b}: {n}" for (a, b), n in sorted(Counter((x["engineK"], x["trueK"]) for x in rows).items())))
    if args.json:
        json.dump(rows, open(args.json, "w"), indent=1)
        print(f"wrote {args.json}")


if __name__ == "__main__":
    main()
