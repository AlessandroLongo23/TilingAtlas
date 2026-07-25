#!/usr/bin/env python3
"""
scan-family-joins.py — find where the α-slider families of a shipped shelf are two ends of ONE arc,
and emit the plan that merges them into single catalogue entries.

Motivation (AL observation, 2026-07-25, on ctrnact-mixed-family-k2-58 / -59): a family's α-range is cut
where its flexing isotoxal 2n-gon passes through a STRAIGHT alternating vertex (interior angle 180°). On
one side of that angle the tile is a concave n-pointed star (`nS`), on the other a convex 2n-gon (`cx2n`),
so the exporter files the two sides as different families — but the tiling deforms continuously through
the cut and the two entries share the limit tiling exactly.

Four separate things this distinguishes, because they look alike in an endpoint fingerprint:

  JOIN      shared endpoint where NO tile has zero area. The limit tiling is genuine and shared by every
            branch reaching it. NOTE more than two families can reach it: the limit has straight (180°)
            vertices, and a tiling with straight vertices is a BRANCH POINT of deformation space, one
            branch per way of activating them.
  MERGE     a JOIN whose two branches also share the same RIGID/FLEXING partition of the tile set — the
            same tiles morph, the same tiles stay put. This is the one that continues the same family, and
            it is what gets merged. At the k2-58/59 limit three branches meet and only this test picks the
            right pair (k2-56 reaches the same tiling but flexes its 12-gon star, which 58/59 hold rigid).
  COLLAPSE  shared endpoint where some tile hits zero area. The limit is a *simpler* tiling that unrelated
            families degenerate to. Not a merge — a singular junction.
  DUPLICATE the same family shipped twice under a reversed α. A convex isotoxal 2n-gon's alternating
            angles sum to a constant, so α ↦ (lo+hi) − α swaps its two angle classes = the same tile
            rotated one step. A family invariant under that relabeling gets exported twice.

Candidate detection is a cheap density-normalised tile fingerprint; every candidate is then VERIFIED by
radial patch congruence (lattice-expanded patch, distances from an anchor tile's centroid — invariant
under rotation, reflection and translation), so fingerprint collisions are reported as such and not
counted as joins.

Usage:
  python3 scripts/scan-family-joins.py [atlas.json] [report.log] [--emit-merge-plan <plan.json>]
"""

import itertools
import json
import math
import cmath
import sys
from collections import Counter, defaultdict

ZERO_AREA = 1e-7  # a tile below this at an endpoint counts as collapsed
PATCH_R = 5.0  # radius of the congruence-check patch, in unit-edge lengths
SAMPLES = [0.2, 0.35, 0.5, 0.65, 0.8]  # interior u-values for the duplicate scan
FLEX_SAMPLES = 7  # interior samples used to decide whether a tile flexes


# ── evaluation of the symbolic parametric cell (mirrors lib/utils/paramCell.ts) ────────────────────────
def ev(terms, deltas):
    z = 0j
    for m, re, im in terms:
        a = m * deltas[0] if not isinstance(m, list) else sum(mi * d for mi, d in zip(m, deltas))
        z += complex(re, im) * cmath.exp(1j * a)
    return z


def cell_at(pc, alphas):
    """Evaluate at the EXACT angles given — no ALPHA_EPS nudge, so endpoints land on the limit tiling."""
    ds = [(a - p["alpha0Deg"]) * math.pi / 180 for a, p in zip(alphas, pc["params"])]
    polys = [
        {"n": q["n"], "star": q.get("star", False), "v": [ev(t, ds) for t in q["vertices"]]}
        for q in pc["cellPolygons"]
    ]
    return polys, [ev(pc["basis"][0], ds), ev(pc["basis"][1], ds)]


def signed_area(v):
    s = 0.0
    for i in range(len(v)):
        a, b = v[i], v[(i + 1) % len(v)]
        s += a.real * b.imag - b.real * a.imag
    return s / 2


def centroid(v):
    return sum(v) / len(v)


def angle_at(v, i):
    """Interior angle at vertex i, orientation-corrected (so a reflex star vertex reads > 180°)."""
    ccw = signed_area(v) > 0
    n = len(v)
    p, c, q = v[(i - 1) % n], v[i], v[(i + 1) % n]
    z = (p - c) / (q - c) if ccw else (q - c) / (p - c)
    return math.degrees(cmath.phase(z)) % 360


def interior_angles(v):
    return tuple(sorted(round(angle_at(v, i), 3) for i in range(len(v))))


def tile_fingerprint(polys, basis):
    """Density-normalised: tile counts per unit cell area, so a family whose cell is an n-fold cover of
    another's still matches. Deliberately ignores the `star` flag — concave-vs-convex is what we test."""
    det = abs(basis[0].real * basis[1].imag - basis[1].real * basis[0].imag)
    t = defaultdict(int)
    for p in polys:
        t[(p["n"], round(abs(signed_area(p["v"])), 6), interior_angles(p["v"]))] += 1
    return tuple(sorted((k, round(c / det, 6)) for k, c in t.items()))


def min_tile_area(polys):
    return min(abs(signed_area(p["v"])) for p in polys)


# ── pose-independent congruence check ─────────────────────────────────────────────────────────────────
_patch_cache = {}


def patch_translates(basis, polys, radius):
    """How many lattice steps per direction are needed for the patch to COVER a disc of `radius`.

    Derived from the lattice, never a fixed constant. A fixed count silently truncates the patch whenever
    the cell is large relative to the radius, and then two truncated neighbourhoods are compared instead of
    two discs — which both HIDES real differences (a false duplicate) and INVENTS them (a false mismatch,
    since the two families' cells truncate at different places). Both were observed on the isotoxal k4
    shelf before this was derived.

    h is the spacing between adjacent lattice lines in the worst direction (|det| / the longer basis
    vector), so ceil((radius + cell extent) / h) steps reach past the disc in every direction.
    """
    det = abs(basis[0].real * basis[1].imag - basis[1].real * basis[0].imag)
    longest = max(abs(basis[0]), abs(basis[1]))
    h = det / longest if longest > 0 else 1.0
    extent = max((abs(z) for p in polys for z in p["v"]), default=0.0)
    return int(math.ceil((radius + 2 * extent) / max(h, 1e-9))) + 1


def patch_fingerprints(fid, pc, alphas):
    """Set of radial fingerprints, one per choice of anchor tile (the largest-n tile in the cell). Two
    tilings are congruent-with-anchor-matching iff the sets intersect."""
    key = (fid, tuple(alphas))
    if key in _patch_cache:
        return _patch_cache[key]
    polys, basis = cell_at(pc, alphas)
    n = patch_translates(basis, polys, PATCH_R)
    extent = max((abs(z) for p in polys for z in p["v"]), default=0.0)
    reach = PATCH_R + 2 * extent
    # The bounding box that GUARANTEES coverage can be large (N≈23 on some k4 cells), but only the
    # translates whose cell can actually reach the disc matter — a count that depends on the disc and the
    # cell area, not on N. Skipping the rest before touching any polygon is what keeps the corrected,
    # coverage-safe patch as cheap as the old truncated one.
    cells = [t for i in range(-n, n + 1) for j in range(-n, n + 1)
             if abs(t := i * basis[0] + j * basis[1]) <= reach]
    pre = [(p["n"], round(abs(signed_area(p["v"])), 6), centroid(p["v"])) for p in polys]
    pts = [(pn, pa, pc0 + t) for t in cells for pn, pa, pc0 in pre]
    anchor = max(p["n"] for p in polys)
    out = set()
    for p in polys:
        if p["n"] != anchor:
            continue
        c = centroid(p["v"])
        out.add(tuple(sorted((round(abs(cc - c), 5), n, a) for n, a, cc in pts if abs(cc - c) <= PATCH_R)))
    _patch_cache[key] = out
    return out


def _clouds(pc, alphas, radius):
    """Labelled tile-centroid clouds, ONE PER largest-tile anchor, that anchor at the origin.

    `alphas` is the parameter LIST, matching cell_at / patch_fingerprints — not a bare angle.
    All anchors, not just the first: a cell can hold several largest tiles in different orbits (k2-05 has
    9), and a congruence may map one family's anchor onto any of the other's."""
    polys, basis = cell_at(pc, alphas)
    ps = [p for p in polys if abs(signed_area(p["v"])) > ZERO_AREA]
    det = abs(basis[0].real * basis[1].imag - basis[1].real * basis[0].imag)
    h = det / max(abs(basis[0]), abs(basis[1]))
    extent = max(abs(z) for p in ps for z in p["v"])
    n = int(math.ceil((radius + 2 * extent) / max(h, 1e-9))) + 1
    pre = [((p["n"], round(abs(signed_area(p["v"])), 6)), centroid(p["v"])) for p in ps]
    top = max(t[0] for t, _ in pre)
    trans = [i * basis[0] + j * basis[1] for i in range(-n, n + 1) for j in range(-n, n + 1)]
    return [[(lab, z + t - anc) for t in trans for lab, z in pre if abs(z + t - anc) <= radius + 1e-6]
            for lab0, anc in pre if lab0[0] == top]


def _isometry(a_pts, b_pts, radius):
    """The actual isometry carrying a_pts onto b_pts, or None. One neighbour pairing fixes the rotation;
    both orientations are tried. Only points safely inside the radius get to decide, so the ragged patch
    edge cannot."""
    inner = radius - 1.0
    idx = {}
    for lab, z in b_pts:
        idx.setdefault(lab, []).append(z)
    a_inner = [(lab, z) for lab, z in a_pts if abs(z) <= inner]
    if not a_inner:
        return None
    ref = min(((lab, z) for lab, z in a_pts if abs(z) > 1e-9), key=lambda t: abs(t[1]))
    for kind, rot in [(k, z / (ref[1].conjugate() if k == "reflection" else ref[1]))
                      for z in idx.get(ref[0], []) if abs(abs(z) - abs(ref[1])) < 1e-6
                      for k in ("rotation", "reflection")]:
        if abs(abs(rot) - 1) > 1e-9:
            continue
        if all(any(abs(rot * (z.conjugate() if kind == "reflection" else z) - u) < 1e-6
                   for u in idx.get(lab, []))
               for lab, z in a_inner):
            return kind
    return None


def congruent(fa, fb, aa, ab):
    """Are these two evaluated families the SAME tiling?

    The radial patch fingerprint is a multiset of (tile type, distance) from one anchor — NECESSARY for
    congruence, never sufficient, because it is a distance list and distance lists collide. Used alone it
    can absorb a DISTINCT family as a duplicate, which deletes a tiling from the atlas: the worst error
    this census can make. So fingerprint to prefilter (cheap, cached), explicit isometry to decide.
    See docs/DEVELOPMENT_NOTES.md §102.
    """
    if not (patch_fingerprints(fa["id"], fa["paramCell"], aa)
            & patch_fingerprints(fb["id"], fb["paramCell"], ab)):
        return False
    r = PATCH_R + 1.0
    ca, cb = _clouds(fa["paramCell"], aa, r), _clouds(fb["paramCell"], ab, r)
    return any(_isometry(x, y, r) for x in ca for y in cb)


# ── the rigid/flexing partition: WHICH tiles morph and which stay put ─────────────────────────────────
def flex_partition(f):
    """Multiset of (side count, flexes?) over the cell's tiles. The invariant that decides which branch
    continues the same family at a shared limit — congruence of the limit alone is not enough."""
    pc = f["paramCell"]
    lo, hi = pc["params"][0]["alphaRangeDegOpen"]
    shots = []
    for i in range(FLEX_SAMPLES):
        u = (i + 1) / (FLEX_SAMPLES + 1)
        polys, _ = cell_at(pc, [lo + u * (hi - lo)])
        shots.append([(round(abs(signed_area(p["v"])), 9), interior_angles(p["v"])) for p in polys])
    polys, _ = cell_at(pc, [lo + 0.5 * (hi - lo)])
    return tuple(sorted(Counter(
        (polys[t]["n"], len({s[t] for s in shots}) > 1) for t in range(len(polys))
    ).items()))


def straightening(f, join_alpha):
    """The tiles carrying a 180° vertex at the join, and which side each approaches it from. A `theta`
    coordinate needs every one of them on the SAME side, opposite to the partner branch's."""
    pc = f["paramCell"]
    lo, hi = pc["params"][0]["alphaRangeDegOpen"]
    inward = -0.5 if abs(join_alpha - hi) < 1e-9 else 0.5
    at_join, _ = cell_at(pc, [join_alpha])
    inside, _ = cell_at(pc, [join_alpha + inward])
    out = []
    for ti, p in enumerate(at_join):
        idx = [i for i in range(len(p["v"])) if abs(angle_at(p["v"], i) - 180) < 1e-6]
        if not idx:
            continue
        out.append((ti, idx[0], p["n"], "reflex" if angle_at(inside[ti]["v"], idx[0]) > 180 else "convex"))
    return out


def theta_of(f, ti, vi, alpha):
    """The tracked vertex's interior angle at a given α. Index-tracked, NOT nearest-to-180: at a far end
    the other angle class can sit closer to 180° and silently swap which class is being reported."""
    polys, _ = cell_at(f["paramCell"], [alpha])
    return angle_at(polys[ti]["v"], vi)


def short(fid):
    return fid.replace("ctrnact-mixed-family-", "").replace("ctrnact-", "")


# ── the merge plan ────────────────────────────────────────────────────────────────────────────────────
def affine(f_alpha, j_alpha, f_u, j_u):
    """α = c + m·u pinned by (far end, join end) in both coordinates. |m| must be 1: the whole reason the
    two α-spans concatenate at uniform speed is |dθ/dα| = 1."""
    m = (j_alpha - f_alpha) / (j_u - f_u)
    if abs(abs(m) - 1) > 1e-9:
        raise AssertionError(f"|dα/du| = {m}, expected ±1")
    m = round(m)
    return {"m": m, "c": round(f_alpha - m * f_u, 9)}


def _frac(z, basis):
    """Lattice coordinates of z mod 1 — the fundamental-domain address, so a tile listed as a different
    lattice translate compares equal."""
    a, b = basis[0].real, basis[1].real
    c, d = basis[0].imag, basis[1].imag
    det = a * d - b * c
    x = (d * z.real - b * z.imag) / det
    y = (-c * z.real + a * z.imag) / det
    return (round(x % 1.0, 5) % 1.0, round(y % 1.0, 5) % 1.0)


def _same_lattice(b0, b1):
    """b1 generates the same lattice as b0: b1 = b0·U with U integral and |det U| = 1."""
    a, b = b0[0].real, b0[1].real
    c, d = b0[0].imag, b0[1].imag
    det = a * d - b * c
    U = []
    for v in b1:
        U.append(((d * v.real - b * v.imag) / det, (-c * v.real + a * v.imag) / det))
    if not all(abs(x - round(x)) < 1e-6 and abs(y - round(y)) < 1e-6 for x, y in U):
        return False
    return abs(abs(U[0][0] * U[1][1] - U[1][0] * U[0][1]) - 1) < 1e-6


def register_pose(ref, ref_join, mov, mov_join):
    """The isometry that carries `mov`'s join tiling onto `ref`'s.

    The two halves develop the SAME tiling at the join — that is what makes them one family — but each was
    exported in its own frame, so without this the pattern jumps as the slider crosses the seam. Searches
    the 24 ζ₂₄ rotations × reflection, keeps only candidates whose lattice matches (so the fundamental cells
    are interchangeable), then pins the translation by trying every vertex correspondence. Compares vertex
    sets reduced mod the lattice, so a differently-chosen tile representative or basis pair still matches.

    A constant isometry commutes with the deformation, so aligning at the seam aligns the whole half.
    """
    pr, br = cell_at(ref["paramCell"], [ref_join])
    target = {_frac(z, br) for p in pr for z in p["v"]}
    pm, bm = cell_at(mov["paramCell"], [mov_join])
    for conj in (False, True):
        for r in range(24):
            rot = cmath.exp(1j * 2 * math.pi * r / 24)
            xf = (lambda z: rot * z.conjugate()) if conj else (lambda z: rot * z)
            bt = [xf(bm[0]), xf(bm[1])]
            if not _same_lattice(br, bt):
                continue
            v0 = xf(pm[0]["v"][0])
            for p in pr:
                for z in p["v"]:
                    tr = z - v0
                    if {_frac(xf(w) + tr, br) for q in pm for w in q["v"]} == target:
                        return {"rot": [rot.real, rot.imag], "rotDeg": r * 15, "conj": conj,
                                "translate": [tr.real, tr.imag]}
    raise AssertionError(f"no isometry aligns {mov['id']} onto {ref['id']} at their join")


IDENTITY_POSE = {"rot": [1.0, 0.0], "rotDeg": 0, "conj": False, "translate": [0.0, 0.0]}


def apply_pose(z, pose):
    rot = complex(pose["rot"][0], pose["rot"][1])
    tr = complex(pose["translate"][0], pose["translate"][1])
    return rot * (z.conjugate() if pose["conj"] else z) + tr


def unify_star_flags(ref, ref_join, ref_pose, mov, mov_join, mov_pose):
    """Star flags that agree across the seam, per tile, keyed by position.

    The flexing tile is a concave star on one side of the straight-vertex limit and convex on the other, and
    the renderer picks its hue from that flag: the star ramp (violet→red, nudged by the tip angle) or the
    by-side-count ramp. Left alone, the tile changes COLOUR at the join even though its shape is continuous,
    which is exactly the discontinuity the merge exists to remove. So a tile that is a star anywhere on the
    arc is flagged a star everywhere on it — one tile, one identity, and the star ramp's tip nudge keeps
    tracking the deformation where the regular ramp saturates.

    Matching is by centroid reduced mod the lattice, NOT by side count: at some joins three different tile
    orbits straighten at once and swap star-ness with each other (k1-04), and at others one half holds both
    star and convex hexagons (k2-05), so any by-n rule over-marks. Both halves are the same tiling in the
    same pose at the seam, which is what makes the positional match exact.
    """
    pr, br = cell_at(ref["paramCell"], [ref_join])
    pm, _ = cell_at(mov["paramCell"], [mov_join])
    ref_cells = [(_frac(apply_pose(centroid(p["v"]), ref_pose), br), i, p) for i, p in enumerate(pr)]
    mov_cells = [(_frac(apply_pose(centroid(p["v"]), mov_pose), br), i, p) for i, p in enumerate(pm)]
    if len(ref_cells) != len(mov_cells):
        raise AssertionError(f"{ref['id']} / {mov['id']}: {len(ref_cells)} vs {len(mov_cells)} tiles at the seam")
    by_key = defaultdict(list)
    for key, i, p in ref_cells + mov_cells:
        by_key[key].append(p)
    if len(by_key) != len(ref_cells):
        raise AssertionError(f"{ref['id']} / {mov['id']}: tile centroids do not pair 1:1 at the seam")
    star_at = {k: any(bool(p["star"]) for p in v) for k, v in by_key.items()}
    return (
        [star_at[key] for key, _, _ in sorted(ref_cells, key=lambda t: t[1])],
        [star_at[key] for key, _, _ in sorted(mov_cells, key=lambda t: t[1])],
    )


def build_merge(a, ea, b, eb, D):
    """One merged arc from a verified merge edge. Returns the plan record."""
    prim, sec = sorted([a, b])  # lowest id wins
    ends = {a: ea, b: eb}
    seg = []
    # coordinate kind: `theta` iff one tile orbit straightens and it is reflex on one branch, convex on
    # the other — then the tracked angle crosses 180° monotonically and is a global coordinate.
    sides = {}
    tracks = {}
    for fid in (prim, sec):
        st = straightening(D[fid], ends[fid])
        sides[fid] = {s for _, _, _, s in st}
        tracks[fid] = st[0][:2] if st else None
    use_theta = (
        len(sides[prim]) == 1 and len(sides[sec]) == 1 and sides[prim] != sides[sec] and all(tracks.values())
    )
    spans = {fid: abs(D[fid]["paramCell"]["params"][0]["alphaRangeDegOpen"][1]
                      - D[fid]["paramCell"]["params"][0]["alphaRangeDegOpen"][0]) for fid in (prim, sec)}
    pose = {prim: IDENTITY_POSE, sec: register_pose(D[prim], ends[prim], D[sec], ends[sec])}
    stars = dict(zip((prim, sec), unify_star_flags(D[prim], ends[prim], pose[prim], D[sec], ends[sec], pose[sec])))
    for fid in (prim, sec):
        lo, hi = D[fid]["paramCell"]["params"][0]["alphaRangeDegOpen"]
        j = ends[fid]
        far = lo if abs(j - hi) < 1e-9 else hi
        if use_theta:
            ti, vi = tracks[fid]
            u_far, u_join = round(theta_of(D[fid], ti, vi, far), 6), 180.0
        elif fid == prim:
            u_far, u_join = 0.0, spans[prim]
        else:
            u_far, u_join = spans[prim] + spans[sec], spans[prim]
        seg.append({
            "sourceId": fid,
            "range": [min(u_far, u_join), max(u_far, u_join)],
            "alphaOf": affine(far, j, u_far, u_join),
            "alpha0Deg": D[fid]["paramCell"]["params"][0]["alpha0Deg"],
            "alphaRangeDegOpen": [lo, hi],
            # The primary defines the frame; the other half is rotated/translated into it so the pattern
            # does not jump as the slider crosses the seam.
            "pose": pose[fid],
            # Per-tile star flags unified across the seam, so no tile changes colour at the join.
            "starFlags": stars[fid],
        })
    seg.sort(key=lambda s: s["range"][0])
    rng = [seg[0]["range"][0], seg[-1]["range"][1]]
    join_u = seg[0]["range"][1]
    # keep the primary's own default α, expressed in the merged coordinate, so the thumbnail is unchanged
    pd = D[prim]["paramCell"]["params"][0]["defaultAlphaDeg"]
    ps = next(s for s in seg if s["sourceId"] == prim)
    default_u = round((pd - ps["alphaOf"]["c"]) / ps["alphaOf"]["m"], 6)
    return {
        "id": prim,
        "aliases": [sec],
        "coordinate": "theta" if use_theta else "sweep",
        "range": [round(rng[0], 6), round(rng[1], 6)],
        "joinAt": round(join_u, 6),
        "defaultDeg": default_u,
        "segments": seg,
    }


def main(atlas_path, plan_path):
    full = json.load(open(atlas_path))
    out = []

    def say(s=""):
        print(s)
        out.append(s)

    say(f"scan-family-joins.py — {atlas_path}")
    say(f"{len(full)} families; param-count histogram: "
        f"{dict(Counter(len(f['paramCell']['params']) for f in full))}")

    # SINGLE-parameter families only. Every routine here evaluates a family from one angle, so a 2-parameter
    # cell would silently mis-evaluate: `cell_at` zips alphas against params, and a 1-long alpha list against
    # 2 params truncates the second δ to nothing instead of erroring. Beyond that the whole notion needs
    # restating for them — a validity region is a BOX, so a shared boundary is a face, not a point, and
    # "endpoint" means a corner. The mixed shelf is 100% single-parameter, which is why this never bit there.
    atlas = [f for f in full if len(f["paramCell"]["params"]) == 1]
    skipped_multi = [f["id"] for f in full if len(f["paramCell"]["params"]) != 1]
    if skipped_multi:
        say(f"⚑ {len(skipped_multi)} multi-parameter families NOT scanned (a join between them is a shared "
            f"face of a validity box, which this scanner does not model)")
    by_id = {f["id"]: f for f in atlas}
    say(f"scanning {len(atlas)} single-parameter families")
    say(f"patch congruence: R={PATCH_R}, translate count derived per family from its lattice")
    say()

    # ── duplicates first. A family and its α-reversal share both endpoints, so quotienting them is a
    #    prerequisite: rewriting an id WITHOUT mapping the endpoint angle through the reversal invents
    #    phantom joins (it reported a false loop for k1-05/k1-15 until the angle map was added).
    dups, dup_edges = [], defaultdict(list)
    for f, g in itertools.combinations(atlas, 2):
        lf = f["paramCell"]["params"][0]["alphaRangeDegOpen"]
        lg = g["paramCell"]["params"][0]["alphaRangeDegOpen"]
        at = lambda rng, u: [rng[0] + u * (rng[1] - rng[0])]
        # No label prefilter, and no equal-length prefilter. Both were wrong once ranges run to their true
        # limits (NOTES §102): the SAME family carries a different label on each side of a concavity cut
        # (`4.4α.6α.6*` vs `4.4α.3*.6*`, since the flexing hexagon is convex on one side and a 3-pointed
        # star on the other), and the two exports can walk the arc at different angular speeds, so their
        # ranges differ in length while still being affinely the same sweep. Comparing by FRACTION of the
        # range is speed-independent; what replaces the prefilter is the midpoint, which both the forward
        # and the reversed map fix, so a same-family pair must agree there. One cached fingerprint per
        # family kills the O(n²) sweep. (A folded family can miss here — its midpoint is the fold centre —
        # which loses a duplicate rather than inventing one.)
        if not congruent(f, g, at(lf, 0.5), at(lg, 0.5)):
            continue
        fwd = all(congruent(f, g, at(lf, u), at(lg, u)) for u in SAMPLES)
        rev = all(congruent(f, g, at(lf, u), at(lg, 1 - u)) for u in SAMPLES)
        if fwd or rev:
            kind = "forward" if fwd else "reversed"
            dups.append((f, g, lf, lg, kind))
            # α in the OTHER family's coordinate, both directions, as the general affine map that carries
            # one range onto the other — |m| is the speed ratio, not necessarily 1.
            sf, sg = lf[1] - lf[0], lg[1] - lg[0]
            r = sg / sf if sf else 1.0
            f2g = ({"m": r, "c": round(lg[0] - lf[0] * r, 9)} if fwd
                   else {"m": -r, "c": round(lg[1] + lf[0] * r, 9)})
            g2f = ({"m": 1 / r, "c": round(lf[0] - lg[0] / r, 9)} if fwd
                   else {"m": -1 / r, "c": round(lf[1] + lg[0] / r, 9)})
            dup_edges[g["id"]].append((f["id"], g2f))
            dup_edges[f["id"]].append((g["id"], f2g))

    # Duplicates come in CLUSTERS, not disjoint pairs — on the isotoxal k4 shelf 465 congruent pairs are only
    # 392 absorbable ids. Rewriting pairwise made an alias point at an id that was itself absorbed (45 of
    # them there), so a link resolved to an entry that does not ship. Resolve each cluster transitively
    # instead: lowest id is the representative, and every member's map to it is composed along the BFS tree.
    def compose(inner, outer):
        """u = outer(inner(α)) for two maps of the form β = c + m·α."""
        return {"m": outer["m"] * inner["m"], "c": round(outer["c"] + outer["m"] * inner["c"], 9)}

    dup_to_rep = {}
    seen_dup = set()
    for start in sorted(dup_edges):
        if start in seen_dup:
            continue
        comp, stack = {start}, [start]
        while stack:
            x = stack.pop()
            for y, _ in dup_edges[x]:
                if y not in comp:
                    comp.add(y)
                    stack.append(y)
        seen_dup |= comp
        root = min(comp)
        maps = {root: {"m": 1, "c": 0}}
        frontier = [root]
        while frontier:
            x = frontier.pop()
            for y, y2x in dup_edges[x]:
                if y not in maps:
                    maps[y] = compose(y2x, maps[x])  # y → x → … → root
                    frontier.append(y)
        for member, m in maps.items():
            if member != root:
                dup_to_rep[member] = (root, m)

    def canon(fid, e):
        """Map an (id, endpoint α) onto the surviving duplicate representative — angle included."""
        if fid not in dup_to_rep:
            return fid, e
        tgt, m = dup_to_rep[fid]
        return tgt, m["c"] + m["m"] * e

    # ── endpoint fingerprints. One parameter driven to each end, the others left at their default, so
    #    for a multi-parameter family this samples corners of the validity box, not its whole boundary.
    ends = defaultdict(list)
    for f in atlas:
        params = f["paramCell"]["params"]
        for j, p in enumerate(params):
            for e in p["alphaRangeDegOpen"]:
                al = [q["defaultAlphaDeg"] for q in params]
                al[j] = e
                polys, basis = cell_at(f["paramCell"], al)
                ends[tile_fingerprint(polys, basis)].append(
                    (f["id"], f["family"], j, e, tuple(al), min_tile_area(polys))
                )

    joins, collapses = [], []
    for members in ends.values():
        if len({m[0] for m in members}) < 2:
            continue
        (collapses if any(m[5] < ZERO_AREA for m in members) else joins).append(members)

    say(f"shared endpoints: {len(joins)} JOIN candidate group(s), {len(collapses)} COLLAPSE group(s)")
    say()
    say("=== JOINs — no tile vanishes, so the limit tiling is real and shared ===")
    merge_edges = set()
    n_real, n_fake, n_art = 0, 0, 0
    for members in joins:
        uniq = sorted({(m[0], m[1], m[2], m[3], m[4]) for m in members})
        ok = all(
            congruent(by_id[a[0]], by_id[b[0]], list(a[4]), list(b[4]))
            for a, b in itertools.combinations(uniq, 2)
        )
        reps = {canon(m[0], m[3]) for m in uniq}
        distinct = len({r[0] for r in reps})
        if not ok:
            verdict = "FINGERPRINT COLLISION — NOT congruent, not a join"
            n_fake += 1
        elif distinct < 2:
            verdict = "DUPLICATE ARTIFACT — the entries are one family (see DUPLICATES), not a join"
            n_art += 1
        else:
            verdict = f"CONGRUENT — one arc through the limit ({distinct} distinct branches)"
            n_real += 1
        say(f"  [{len(uniq)} entries] {verdict}")
        for fid, sym, j, e, _ in uniq:
            part = flex_partition(by_id[fid])
            desc = " ".join(f"{c}x{n}{'*' if v else ''}" for (n, v), c in part)
            say(f"      {short(fid):10s} {sym:16s} param{j} @ {e:g}°   range {by_id[fid]['alphaRange']}   {desc}")
        if not ok or distinct < 2:
            continue
        # MERGE gate: congruent limit AND the same rigid/flexing partition.
        for a, b in itertools.combinations(uniq, 2):
            if flex_partition(by_id[a[0]]) != flex_partition(by_id[b[0]]):
                continue
            ca, cea = canon(a[0], a[3])
            cb, ceb = canon(b[0], b[3])
            # A merge needs two DISTINCT families meeting at a limit. If both branches collapse to the same
            # duplicate representative they are one family, and "merging" them splices it to a reversed copy
            # of ITSELF — a slider of twice the true range that sweeps out and back. That shipped for three
            # isotoxal families while the congruence patch was still truncated (so the duplicate went
            # undetected), and the seam tests could not catch it: the halves ARE congruent at the join,
            # trivially, because they are the same family. See §101.
            if ca == cb:
                continue
            merge_edges.add(tuple(sorted([(ca, cea), (cb, ceb)])))
        picked = sorted({p for e_ in merge_edges for p in e_} & {canon(m[0], m[3]) for m in uniq})
        if picked:
            say(f"      -> MERGE: {' + '.join(short(i) for i, _ in picked)}"
                f"   (excluded: {[short(m[0]) for m in uniq if canon(m[0], m[3]) not in picked] or 'none'})")
    say(f"  -> {n_real} verified join(s); {n_fake} collision(s) rejected; {n_art} duplicate artifact(s)")
    say()
    say("=== COLLAPSEs — a tile hits zero area; the limit is a SIMPLER tiling, shared by unrelated arcs ===")
    for members in collapses:
        uniq = sorted({(m[0], m[1], m[3]) for m in members})
        say("  " + " | ".join(f"{short(i)}[{s}]@{e:g}°" for i, s, e in uniq))
    say()
    say("=== DUPLICATES — same family shipped twice (forward, or with α reversed) ===")
    for f, g, lf, lg, kind in dups:
        say(f"  α-{kind}: {short(f['id'])} {lf} == {short(g['id'])} {lg}   [{f['family']}]")
    say(f"  -> {len(dups)} duplicate pair(s) among the {len(atlas)} single-parameter families")
    say()

    # ── merge plan ────────────────────────────────────────────────────────────────────────────────────
    adj = defaultdict(set)
    for (a, _), (b, _) in merge_edges:
        adj[a].add(b)
        adj[b].add(a)
    branching = {k: v for k, v in adj.items() if len(v) > 1}
    say("=== MERGE PLAN — a JOIN whose branches share the rigid/flexing partition ===")
    if branching:
        say(f"  ⚑ NOT all 2-paths: {[(short(k), [short(x) for x in v]) for k, v in branching.items()]}")
        say("    a chain of 3+ or a loop needs an ordering pass this script does not implement — refusing to plan")
        merges = []
    else:
        merges = [build_merge(a, ea, b, eb, by_id) for (a, ea), (b, eb) in sorted(merge_edges)]
        for m in merges:
            say(f"  {short(m['id'])} + {short(m['aliases'][0])}  →  {m['coordinate']} "
                f"∈ ({m['range'][0]:g}°, {m['range'][1]:g}°), join at {m['joinAt']:g}°, default {m['defaultDeg']:g}°")
            for s in m["segments"]:
                ao = s["alphaOf"]
                say(f"      {short(s['sourceId']):10s} u∈[{s['range'][0]:g},{s['range'][1]:g}]  "
                    f"α = {ao['c']:g} {'+' if ao['m'] > 0 else '−'} u   (α-range {s['alphaRangeDegOpen']})")
    say(f"  -> {len(merges)} merge(s)")
    say()

    # ── absorbed ids and their alias maps. An absorbed entry does not ship; a link to it resolves to the
    #    survivor, and its α is carried onto the survivor's coordinate by u = c + m·α.
    #
    #    Only ABSORBED ids get an α remap. A link to a surviving id whose coordinate changed (a merge
    #    primary: α → θ/sweep) is left to the ordinary range clamp, because α=45 and u=45 are
    #    indistinguishable once the id is the same — guessing there would silently move the view.
    seg_inverse, merge_of = {}, {}
    for m in merges:
        for s in m["segments"]:
            ao = s["alphaOf"]  # α = c + m·u  ⟹  u = m·α − m·c   (m = ±1)
            seg_inverse[s["sourceId"]] = {"m": ao["m"], "c": round(-ao["m"] * ao["c"], 9)}
            merge_of[s["sourceId"]] = m["id"]

    aliases = {}
    for m in merges:
        for sec in m["aliases"]:
            aliases[sec] = {"to": m["id"], "uOf": seg_inverse[sec]}
    # Every non-representative member of a duplicate cluster, mapped straight to its representative (never
    # to another absorbed id), and on through the merge that absorbed the representative if there was one.
    for member, (root, to_root) in sorted(dup_to_rep.items()):
        if root in merge_of:
            aliases[member] = {"to": merge_of[root], "uOf": compose(to_root, seg_inverse[root])}
        else:
            aliases[member] = {"to": root, "uOf": to_root}
    absorbed = sorted(aliases)
    dangling = [a for a, v in aliases.items() if v["to"] in aliases]
    if dangling:
        raise AssertionError(f"{len(dangling)} alias(es) point at an absorbed id, e.g. {dangling[:3]}")

    say("=== ABSORBED — ids that no longer ship, and where a link to them lands ===")
    for a in absorbed:
        al = aliases[a]
        say(f"  {short(a):10s} → {short(al['to']):10s}   u = {al['uOf']['c']:g} "
            f"{'+' if al['uOf']['m'] > 0 else '−'} α")
    say(f"  -> {len(absorbed)} absorbed, {len(full) - len(absorbed)} entries ship")
    say()
    # Counted from the absorbed SET, not the pair count: clusters make pairs over-count the reduction
    # (465 congruent pairs on isotoxal k4 are only 392 absorbable ids).
    say(f"SUMMARY: {len(full)} shipped entries = {len(full) - len(dup_to_rep)} distinct families "
        f"= {len(full) - len(absorbed)} arcs after merging")

    if plan_path:
        plan = {
            "_meta": {
                "generated_from": atlas_path,
                "families": len(full),
                "scanned": len(atlas),
                "skippedMultiParam": skipped_multi,
                "duplicates": len(dups),
                "merges": len(merges),
                "ships": len(full) - len(absorbed),
                "note": "consumed by scripts/build-mixed-atlas.ts; spec docs/superpowers/specs/"
                        "2026-07-25-mixed-family-merge-design.md",
            },
            "duplicates": [
                {"absorbed": g["id"], "into": f["id"], "kind": kind} for f, g, lf, lg, kind in dups
            ],
            "merges": merges,
            "aliases": aliases,
        }
        json.dump(plan, open(plan_path, "w"), indent=1)
        say(f"wrote merge plan → {plan_path}")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    plan = None
    if "--emit-merge-plan" in sys.argv:
        plan = sys.argv[sys.argv.index("--emit-merge-plan") + 1]
        args = [a for a in args if a != plan]
    atlas = args[0] if args else "public/reference-atlas-mixed.json"
    report = args[1] if len(args) > 1 else None
    text = main(atlas, plan)
    if report:
        open(report, "w").write(text)
