#!/usr/bin/env python3
"""scan-family-ranges.py — find the TRUE α range of every exported α-slider family, and whether the
exported slider is truncated, folded, or both.

Why this exists (AL, 2026-07-25, from mixed k2-01 on /play). A family's exported α range ends where the
tile SPECIES changes, not where the tiling stops existing. When a flexing isotoxal 2n-gon passes through
a straight (180°) alternating vertex it turns from a convex cx2n into a concave nS — a different alphabet
symbol — so the exporter stops there. The tiling does not stop there: the symbolic cell is analytic in δ
and keeps tiling well past the cut, until a real obstruction (a tile reaching zero area, or tiles
starting to overlap). Everything between the cut and that obstruction is a tiling the atlas does not have
and cannot get from the solver, because the palette does not carry the star species it would need as a
seed (isotoxal-star-z24 has 3*1 and 3*2 but no 3*3, and 15 of ~33 grid-legal star species overall).

So: continue every family outward from both exported bounds and find where it genuinely dies.

Two independent defects come out of one scan:
  TRUNCATED — the true range is strictly wider than the exported one. Missing tilings.
  FOLDED    — two distinct α in the range give the SAME tiling (patch-congruent), so the slider sweeps
              its shapes out and back. Redundant range, and it inflates any "how much deformation
              space" measurement taken off the slider bounds.

Tests used, in order of cost:
  * area certificate  Σ|tile area| == |det basis|  (cheap; the exporter's own tiling proof)
  * tile simplicity   no self-intersecting tile    (cheap; catches a star whose points cross)
  * covering test     sample the fundamental domain, count containing tiles over lattice translates;
                      exactly 1 ⟹ tiles with no gap and no overlap. Run only at the boundary, since the
                      certificate alone cannot separate a tiling from an overlap that a gap cancels.

Run:  python3 scripts/scan-family-ranges.py <cells.json> [<cells.json> …] <out.log>
"""
import cmath
import itertools
import json
import math
import random
import sys
from collections import Counter

AREA_TOL = 1e-9
ZERO_AREA = 1e-9
STEP = 0.5  # coarse outward step, degrees
BISECT = 1e-4  # boundary resolution, degrees
HARD_LIMIT = 360.0  # never continue further than this past an exported bound
PATCH_R = 5.0
COVER_SAMPLES = 300
FOLD_SAMPLES = 9  # interior α values compared pairwise for the fold test


# ── symbolic cell evaluation (mirrors lib/utils/paramCell.ts) ─────────────────────────────────────────
def ev(terms, deltas):
    z = 0j
    for m, re, im in terms:
        a = m * deltas[0] if not isinstance(m, list) else sum(mi * d for mi, d in zip(m, deltas))
        z += complex(re, im) * cmath.exp(1j * a)
    return z


def cell_at(pc, alphas):
    ds = [(a - p["alpha0Deg"]) * math.pi / 180 for a, p in zip(alphas, pc["params"])]
    polys = [{"n": q["n"], "v": [ev(t, ds) for t in q["vertices"]]} for q in pc["cellPolygons"]]
    return polys, [ev(pc["basis"][0], ds), ev(pc["basis"][1], ds)]


def signed_area(v):
    s = 0.0
    for i in range(len(v)):
        a, b = v[i], v[(i + 1) % len(v)]
        s += a.real * b.imag - b.real * a.imag
    return s / 2


def centroid(v):
    return sum(v) / len(v)


def det_of(b):
    return abs(b[0].real * b[1].imag - b[1].real * b[0].imag)


def angle_at(v, i):
    ccw = signed_area(v) > 0
    n = len(v)
    p, c, q = v[(i - 1) % n], v[i], v[(i + 1) % n]
    if abs(p - c) < 1e-12 or abs(q - c) < 1e-12:
        return float("nan")
    z = (p - c) / (q - c) if ccw else (q - c) / (p - c)
    return math.degrees(cmath.phase(z)) % 360


def _seg_cross(a, b, c, d):
    """Do open segments ab and cd properly cross? Shared endpoints and collinear touching don't count —
    adjacent edges of a polygon always share an endpoint."""
    def cr(o, p, q):
        return (p.real - o.real) * (q.imag - o.imag) - (p.imag - o.imag) * (q.real - o.real)
    d1, d2 = cr(c, d, a), cr(c, d, b)
    d3, d4 = cr(a, b, c), cr(a, b, d)
    return ((d1 > 1e-12) != (d2 > 1e-12)) and ((d3 > 1e-12) != (d4 > 1e-12)) \
        and min(abs(d1), abs(d2), abs(d3), abs(d4)) > 1e-12


def is_simple(v):
    n = len(v)
    for i in range(n):
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue
            if _seg_cross(v[i], v[(i + 1) % n], v[j], v[(j + 1) % n]):
                return False
    return True


# ── the four health tests ─────────────────────────────────────────────────────────────────────────────
def orientation(polys):
    """+1/−1 if every tile is traced the same way, 0 if they disagree (or a tile is degenerate)."""
    signs = {1 if signed_area(p["v"]) > 0 else -1 for p in polys if abs(signed_area(p["v"])) >= ZERO_AREA}
    return signs.pop() if len(signs) == 1 else 0


def health(polys, basis, ref=None):
    """(ok, reason) — why this α is not a tiling, cheaply. reason is None when healthy.

    `ref` is the cell's orientation at the family's certified default. Without it the continuation walks
    straight THROUGH a total collapse and keeps going: at the collapse every area is 0 and |det| is 0, and
    one step later every tile has flipped sign — the cell has turned inside out and is now the mirror image
    reflected back through zero. Both the area certificate and the simplicity test pass on that, happily,
    which is how the 2-parameter sweep first reported rays surviving a full 360°. Orientation is what
    separates a continuation from a reflection-through-nothing, so the caller passes the anchor's sign and
    any step that does not match it is out.
    """
    areas = [abs(signed_area(p["v"])) for p in polys]
    if min(areas) < ZERO_AREA:
        return False, "collapse"
    if abs(sum(areas) - det_of(basis)) > AREA_TOL:
        return False, "area-certificate"
    o = orientation(polys)
    if o == 0:
        return False, "orientation split"
    if ref is not None and o != ref:
        return False, "orientation flip"
    for p in polys:
        if not is_simple(p["v"]):
            return False, "self-intersecting tile"
    return True, None


def inside(pt, v):
    x, y = pt.real, pt.imag
    c = False
    n = len(v)
    for i in range(n):
        a, b = v[i], v[(i - 1) % n]
        if (a.imag > y) != (b.imag > y):
            if x < (b.real - a.real) * (y - a.imag) / (b.imag - a.imag) + a.real:
                c = not c
    return c


def covering(polys, basis, seed=7, samples=COVER_SAMPLES):
    rng = random.Random(seed)
    reach = max(abs(z) for p in polys for z in p["v"]) + max(abs(basis[0]), abs(basis[1]))
    h = det_of(basis) / max(abs(basis[0]), abs(basis[1]))
    n = int(math.ceil(reach / max(h, 1e-9))) + 2
    trans = [i * basis[0] + j * basis[1] for i in range(-n, n + 1) for j in range(-n, n + 1)]
    cents = [(centroid(p["v"]), p["v"]) for p in polys]
    counts = Counter()
    for _ in range(samples):
        pt = rng.random() * basis[0] + rng.random() * basis[1]
        c = 0
        for t in trans:
            q = pt - t
            for cen, v in cents:
                if abs(q - cen) < reach and inside(q, v):
                    c += 1
        counts[c] += 1
    return dict(sorted(counts.items()))


# ── outward continuation ──────────────────────────────────────────────────────────────────────────────
def extend(pc, start, direction):
    """Walk α outward from `start` in `direction` (±1) while the cell still tiles. Returns
    (last_good_alpha, reason_it_stopped)."""
    ref = orientation(cell_at(pc, [start])[0])
    good = start
    a = start
    reason = "hard-limit"
    while abs(a - start) < HARD_LIMIT:
        a += direction * STEP
        ok, why = health(*cell_at(pc, [a]), ref=ref)
        if not ok:
            reason = why
            lo, hi = good, a  # bisect between the last good and the first bad
            for _ in range(int(math.log2(STEP / BISECT)) + 2):
                mid = (lo + hi) / 2
                if health(*cell_at(pc, [mid]), ref=ref)[0]:
                    lo = mid
                else:
                    hi = mid
            return lo, reason
        good = a
    return good, reason


# ── outward continuation, P ≥ 2 ───────────────────────────────────────────────────────────────────────
# One parameter has an interval to widen; P of them have a REGION, and the region the exporters ship is the
# convex polytope where every corner stays under 180°. Past that a corner goes reflex and the tile turns
# concave, which is a species change and not a tiling failure — the same cut scan-family-ranges was written
# to undo in 1-D. Generalizing means walking outward in every direction of δ-space, not just two.
#
# The measured region is a STAR-SHAPED inner approximation about the family's default: each ray is bisected
# to its own last-good point, so every reported point is a verified tiling, and a lobe the rays cannot see
# around a concave corner is under-reported, never over-reported. That direction is the safe one — the
# region governs what the UI will let you drag to.

def ray_limit(pc, anchor_deg, direction, cap=360.0):
    """Largest t with anchor + t·direction still a tiling, bisected. `direction` is in degrees per unit t."""
    ref = orientation(cell_at(pc, anchor_deg)[0])
    good = 0.0
    t = 0.0
    reason = "hard-limit"
    while t < cap:
        t += STEP
        alphas = [a + t * d for a, d in zip(anchor_deg, direction)]
        ok, why = health(*cell_at(pc, alphas), ref=ref)
        if not ok:
            reason = why
            lo, hi = good, t
            for _ in range(int(math.log2(STEP / BISECT)) + 2):
                mid = (lo + hi) / 2
                pt = [a + mid * d for a, d in zip(anchor_deg, direction)]
                if health(*cell_at(pc, pt), ref=ref)[0]:
                    lo = mid
                else:
                    hi = mid
            return lo, reason
        good = t
    return good, reason


def region_polygon(pc, rays=72):
    """The measured 2-parameter region as an ordered polygon in δ-UNITS (1 unit = 15°), plus the stop
    reasons seen. Rays are cast from the family's default, which the exporter developed and certified, so
    t=0 is known good on every one of them."""
    anchor = [p["defaultAlphaDeg"] for p in pc["params"]]
    verts, stops = [], Counter()
    for i in range(rays):
        th = 2 * math.pi * i / rays
        d = (math.cos(th), math.sin(th))
        t, why = ray_limit(pc, anchor, d)
        stops[why] += 1
        verts.append(((anchor[0] + t * d[0] - pc["params"][0]["alpha0Deg"]) / 15.0,
                      (anchor[1] + t * d[1] - pc["params"][1]["alpha0Deg"]) / 15.0))
    return verts, stops


def axis_limits(pc, cap=360.0):
    """Per-axis true interval, each measured with the OTHER axes held at their default.

    This is the honest per-axis span for a P ≥ 3 family, where there is no pad to draw a region on and the
    UI drives one slider at a time. It is a slice through the region, not its bounding box: a box would
    promise corners that are the product of two independent maxima, and nothing here has verified those.
    """
    anchor = [p["defaultAlphaDeg"] for p in pc["params"]]
    out = []
    for j in range(len(pc["params"])):
        d = [0.0] * len(pc["params"])
        d[j] = 1.0
        hi, rhi = ray_limit(pc, anchor, d, cap)
        d[j] = -1.0
        lo, rlo = ray_limit(pc, anchor, d, cap)
        out.append((anchor[j] - lo, anchor[j] + hi, rlo, rhi))
    return out


def _region_at(region, limit_units):
    return [dict(r, limitUnits=limit_units) for r in region]


def limit_units_max(pc, region, cap=48.0, samples=220):
    """Largest UPPER bound (in δ-units, 1 unit = 15°) the corner half-planes may be raised to with the
    whole polytope still a tiling. The exporters ship D/2 = 12 units = 180°.

    Only the upper bounds move, and that asymmetry is the whole point. A corner angle reaching 0 is a real
    degeneracy — the tile collapses and there is nothing on the far side. A corner reaching 180° is a
    SPECIES change: the tile goes concave and keeps tiling. Inflating the polytope uniformly, which is what
    I tried first, pushes through both and dies at ×1.001 on the angle-0 corners while never testing the
    180° ones at all.

    Verified on the enlarged polytope's own extreme points, the midpoints of every pair of them, and a
    deterministic interior sample — a convex hull can straddle a hole once its boundary stops being
    straight, so corners alone are not enough.
    """
    P = len(pc["params"])
    if not region:
        return None
    ref = orientation(cell_at(pc, [p["defaultAlphaDeg"] for p in pc["params"]])[0])
    base = region[0]["limitUnits"]

    def ok(L):
        verts = polytope_verts_units(_region_at(region, L), P)
        if len(verts) < P + 1:
            return False
        anchor = [sum(v[t] for v in verts) / len(verts) for t in range(P)]
        probes = []
        for i, v in enumerate(verts):
            probes.append([anchor[t] + 0.999 * (v[t] - anchor[t]) for t in range(P)])
            for w in verts[i + 1:]:
                probes.append([anchor[t] + 0.999 * ((v[t] + w[t]) / 2 - anchor[t]) for t in range(P)])
        rng = random.Random(19)
        for _ in range(samples):
            ws = [rng.random() for _ in verts]
            s = sum(ws) or 1.0
            probes.append([sum(w * v[t] for w, v in zip(ws, verts)) / s for t in range(P)])
        for pt in probes:
            alphas = [pc["params"][t]["alpha0Deg"] + pt[t] * 15.0 for t in range(P)]
            if not health(*cell_at(pc, alphas), ref=ref)[0]:
                return False
        return True

    if not ok(base):
        return base
    lo, hi = base, base
    while hi < cap and ok(hi + 4):
        lo, hi = hi + 4, hi + 4
    hi = min(hi + 4, cap)
    for _ in range(14):
        mid = (lo + hi) / 2
        if ok(mid):
            lo = mid
        else:
            hi = mid
    return lo


def polytope_verts_units(region, P, eps=1e-9):
    """Extreme points of the shipped convex polytope, in δ-units. Mirrors export_period_families.polytope_verts;
    kept here so the scan does not need to import an exporter."""
    rows = []
    for r in region:
        c = r["coef"]
        if any(c):
            rows.append(([-x for x in c], float(r["seedUnits"])))
            rows.append((list(c), r["limitUnits"] - r["seedUnits"]))
    verts = []
    for combo in itertools.combinations(range(len(rows)), P):
        A = [rows[i][0] for i in combo]
        b = [rows[i][1] for i in combo]
        sol = _gauss(A, b, eps)
        if sol is None:
            continue
        if all(sum(a[t] * sol[t] for t in range(P)) <= bb + 1e-7 for a, bb in rows):
            if not any(all(abs(sol[t] - v[t]) < 1e-7 for t in range(P)) for v in verts):
                verts.append(tuple(sol))
    return verts


def _gauss(A, b, eps):
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


def straight_vertices(polys):
    """Tiles with an alternating vertex at 180° — the concavity cut that made the exporter stop."""
    out = []
    for i, p in enumerate(polys):
        for j in range(len(p["v"])):
            if abs(angle_at(p["v"], j) - 180) < 1e-6:
                out.append((i, p["n"]))
                break
    return out


# ── fold detection ────────────────────────────────────────────────────────────────────────────────────
_fp_cache = {}


def patch_translates(basis, polys, radius):
    longest = max(abs(basis[0]), abs(basis[1]))
    h = det_of(basis) / longest if longest > 0 else 1.0
    extent = max((abs(z) for p in polys for z in p["v"]), default=0.0)
    return int(math.ceil((radius + 2 * extent) / max(h, 1e-9))) + 1


def fingerprints(fid, pc, alpha):
    key = (fid, round(alpha, 6))
    if key in _fp_cache:
        return _fp_cache[key]
    polys, basis = cell_at(pc, [alpha])
    ps = [p for p in polys if abs(signed_area(p["v"])) > ZERO_AREA]
    n = patch_translates(basis, ps, PATCH_R)
    reach = PATCH_R + max(abs(z) for p in ps for z in p["v"])
    cells = [t for i in range(-n, n + 1) for j in range(-n, n + 1)
             if abs(t := i * basis[0] + j * basis[1]) <= reach]
    # key on VERTEX COUNT, not the shelf's `n` (mixed stores a 12-star as n=24, star as n=12)
    pre = [(len(p["v"]), round(abs(signed_area(p["v"])), 6), centroid(p["v"])) for p in ps]
    pts = [(pn, pa, pc0 + t) for t in cells for pn, pa, pc0 in pre]
    top = max(pn for pn, _, _ in pre)
    out = set()
    for an, aa, ac in pre:
        if an != top:
            continue
        f = Counter()
        for pn, pa, pcz in pts:
            d = abs(pcz - ac)
            if d <= PATCH_R:
                f[(pn, pa, round(d, 5))] += 1
        out.add(tuple(sorted(f.items())))
    _fp_cache[key] = out
    return out


def clouds(polys, basis, radius):
    """Labelled tile-centroid clouds, ONE PER CHOICE of largest-tile anchor (anchor at the origin).

    All anchors, not just the first: a cell can hold several largest tiles in different orbits, and a
    congruence is free to map one family's anchor onto any of the other's. Anchoring both sides on "the
    first largest tile in the cell" silently reports non-congruent for such a pair — it produced a false
    BRANCH SWITCH verdict on the k2-05/k2-06 merge before this was fixed.
    """
    ps = [p for p in polys if abs(signed_area(p["v"])) > ZERO_AREA]
    longest = max(abs(basis[0]), abs(basis[1]))
    h = det_of(basis) / longest
    extent = max(abs(z) for p in ps for z in p["v"])
    n = int(math.ceil((radius + 2 * extent) / max(h, 1e-9))) + 1
    pre = [((len(p["v"]), round(abs(signed_area(p["v"])), 6)), centroid(p["v"])) for p in ps]
    top = max(t[0] for t, _ in pre)
    trans = [i * basis[0] + j * basis[1] for i in range(-n, n + 1) for j in range(-n, n + 1)]
    out = []
    for lab0, anchor in pre:
        if lab0[0] != top:
            continue
        out.append([(lab, z + t - anchor) for t in trans for lab, z in pre
                    if abs(z + t - anchor) <= radius + 1e-6])
    return out


def cloud(polys, basis, radius):
    return clouds(polys, basis, radius)[0]


def congruent_by(a_pts, b_pts, radius=PATCH_R + 1.0):
    """The actual isometry carrying a_pts onto b_pts, or None.

    The radial fingerprint (a multiset of type/distance pairs from one anchor) is only NECESSARY for
    congruence — it is a distance list, and distance lists collide. Every fingerprint hit gets confirmed
    here before it is called a fold. Anchor→anchor is no loss: any congruence composes with a lattice
    translation to take one largest tile to another. One neighbour pairing then fixes the rotation,
    twice over (direct and reflected).
    """
    inner = radius - 1.0
    b_index = {}
    for lab, z in b_pts:
        b_index.setdefault(lab, []).append(z)
    a_inner = [(lab, z) for lab, z in a_pts if abs(z) <= inner]
    if not a_inner:
        return None
    ref = min(((lab, z) for lab, z in a_pts if abs(z) > 1e-9), key=lambda t: abs(t[1]))
    cands = []
    for z in b_index.get(ref[0], []):
        if abs(abs(z) - abs(ref[1])) < 1e-6:
            cands.append(("rotation", z / ref[1]))
            cands.append(("reflection", z / ref[1].conjugate()))
    for kind, rot in cands:
        if abs(abs(rot) - 1) > 1e-9:
            continue
        if all(any(abs(rot * (z.conjugate() if kind == "reflection" else z) - u) < 1e-6
                   for u in b_index.get(lab, []))
               for lab, z in a_inner):
            return kind
    return None


def _alphas(a):
    """Accept a scalar (single-parameter caller) or a full tuple (multi-parameter caller)."""
    return list(a) if isinstance(a, (list, tuple)) else [a]


def isometry_between(pa, aa, pb, bb, radius=PATCH_R + 1.0):
    """Congruence of two evaluated cells, trying every anchor pairing. Returns the kind or None."""
    ca = clouds(*cell_at(pa, _alphas(aa)), radius)
    cb = clouds(*cell_at(pb, _alphas(bb)), radius)
    for x in ca:
        for y in cb:
            k = congruent_by(x, y, radius)
            if k:
                return k
    return None


def same_tiling(fid, pc, a, b):
    """Fingerprint prefilter, then an explicit isometry. Returns the isometry kind or None."""
    if not (fingerprints(fid, pc, a) & fingerprints(fid, pc, b)):
        return None
    return isometry_between(pc, a, pc, b)


def find_fold(fid, pc, lo, hi):
    """Is the slider non-injective on (lo,hi)? Returns (a, b, kind, centre|None) or None.

    Checked over the TRUE range, not the exported one: an extended arc is exactly where a replay is most
    likely to hide, and a fold measured on the old bounds would overstate how much new deformation the
    extension really buys. First the natural candidate — reflection about the range midpoint, the shape
    a flexing family takes when it passes through a maximally symmetric member and comes back — then an
    all-pairs sweep for anything off-centre.
    """
    c = lo + hi
    pairs = [(lo + (hi - lo) * f, c - (lo + (hi - lo) * f)) for f in (0.2, 0.35, 0.45)]
    kinds = [same_tiling(fid, pc, a, b) for a, b in pairs if b - a > 1e-6]
    if kinds and all(kinds):
        return pairs[0][0], pairs[0][1], kinds[0], c / 2
    xs = [lo + (hi - lo) * (i + 1) / (FOLD_SAMPLES + 1) for i in range(FOLD_SAMPLES)]
    for i in range(len(xs)):
        for j in range(i + 1, len(xs)):
            k = same_tiling(fid, pc, xs[i], xs[j])
            if k:
                return xs[i], xs[j], k, None
    return None


# ── novelty: is a newly-opened arc reachable by the solver at all? ─────────────────────────────────────
def palette_species(path):
    d = json.load(open(path))
    u = 360 / d["D"]  # degrees per angle unit
    names = set()
    for t in d["tiles"]:
        if t["kind"] == "regular":
            names.add(f"regular-{t['n']}")
        elif t["kind"] == "star":
            names.add(f"{t['n']}*{round(t['alphaU'] * u)}")
        else:  # composite: name carries the angles already
            names.add(t["name"])
    return names, u


def _period_name(angs):
    """`e<p>-<L>-<word>` if the angle word has a proper period p ≥ 3, else None.

    The period-p shelf's tiles are named this way by alphabets/enum_period_tiles.py, and without this every
    period tile fell through to `irregular-6` — a name no palette carries, so arc_reachable reported EVERY
    newly-opened arc unreachable. That is the conservative direction, but it is still a wrong answer, and it
    is the one that decides whether an arc is "provably absent from the atlas" or just filed elsewhere.

    The word is written from its lexicographically largest rotation, which is the convention gen_alphabet
    canonicalizes to, so the name matches the palette entry when the configuration really is on the grid.
    """
    L = len(angs)
    for p in range(3, L):
        if L % p:
            continue
        if not all(abs(angs[i] - angs[i % p]) < 1e-6 for i in range(L)):
            continue
        head = [round(a, 6) for a in angs[:p]]
        rots = [tuple(head[i:] + head[:i]) for i in range(p)]
        return f"e{p}-{L}-" + ".".join(f"{a:g}" for a in max(rots))
    return None


def tile_species(polys):
    """Name each cell tile the way the palette would: regular-n, cx2n-g.b, n*g (g = point angle°), or the
    period-p form e<p>-<L>-<word>."""
    out = []
    for p in polys:
        v = p["v"]
        if abs(signed_area(v)) < ZERO_AREA:
            continue
        angs = [angle_at(v, i) for i in range(len(v))]
        even, odd = angs[0::2], angs[1::2]
        g, b = round(min(even + odd), 6), round(max(even + odd), 6)
        if max(angs) - min(angs) < 1e-6:
            out.append(f"regular-{len(v)}")
        elif len(v) % 2 == 0 and max(max(even) - min(even), max(odd) - min(odd)) < 1e-6:
            n = len(v) // 2
            out.append(f"{n}*{g:g}" if b > 180 + 1e-9 else f"cx{len(v)}-{g:g}.{b:g}")
        else:
            out.append(_period_name(angs) or f"irregular-{len(v)}")
    return out


def arc_reachable(pc, lo, hi, pal, unit):
    """Could the solver find any configuration inside the arc (lo,hi)?

    It seeds from GRID configurations — every tile angle a whole number of D-units — and flexes outward,
    so an arc with no on-palette grid configuration inside it cannot be reached from its own seed. That
    is the difference between "the exporter truncated this arc" and "the arc is elsewhere in the atlas
    under another id": if nothing in it is seedable, no other shelf entry can be this family.

    Returns (reachable, off_palette_species_at_the_grid_alphas).
    """
    offs, a = set(), math.ceil((lo + 1e-6) / 0.5) * 0.5
    while a < hi - 1e-6:
        polys, _ = cell_at(pc, [a])
        angs = [angle_at(p["v"], i) for p in polys for i in range(len(p["v"]))
                if abs(signed_area(p["v"])) > ZERO_AREA]
        if all(abs(x / unit - round(x / unit)) < 1e-6 for x in angs):  # a grid configuration
            sp = set(tile_species(polys))
            if sp <= pal:
                return True, set()
            offs |= sp - pal
        a += 0.5
    return False, offs


def snap(x, grid=0.5, tol=0.01):
    """Snap a bisected boundary to the angle grid the exporters use.

    Bisection returns the last α that still tiled, so it sits strictly INSIDE the valid region — the right
    side to err on, but 1e-4 shy of the exact endpoint. Every real boundary here is a collapse at a rational
    angle, and `alphaRangeDegOpen` is by contract the OPEN interval (evaluation is nudged ALPHA_EPS_DEG
    inside it), so the exact value is what belongs in the plan. Returns (value, snapped?) and refuses to
    move further than `tol`, so a boundary that is genuinely off-grid is kept as measured, not invented.
    """
    s = round(x / grid) * grid
    return (s, True) if abs(s - x) <= tol else (x, False)


def scan_multi(recs, log):
    """True region of every P ≥ 2 family, and the plan entries to widen it.

    P = 2 gets a measured polygon (the pad draws exactly this, and `nearestInRegionDeg` projects onto it),
    plus the per-axis slices for the readout. P ≥ 3 has no pad, so it gets the inflation factor for its
    half-planes instead — `clampToRegion` enforces those at runtime and nothing else would be honoured.
    """
    out = []
    multi = [r for r in recs if len(r["params"]) >= 2 and r.get("allChecksPass", True)]
    if not multi:
        return out
    log("")
    log(f"=== {len(multi)} multi-parameter families ===")
    for r in multi:
        pc = {"params": r["params"], "cellPolygons": r["cellPolygons"], "basis": r["basis"]}
        P = len(r["params"])
        region = r.get("region") or []
        axes = axis_limits(pc)
        exported = [tuple(p["alphaRangeDegOpen"]) for p in r["params"]]
        gain = sum(max(0.0, e[0] - a[0]) + max(0.0, a[1] - e[1]) for a, e in zip(axes, exported))
        entry = {
            "id": r["id"], "P": P,
            "exportedAxes": [list(e) for e in exported],
            "axes": [[round(a[0], 4), round(a[1], 4)] for a in axes],
            "axisStops": [[a[2], a[3]] for a in axes],
            "gainDeg": round(gain, 6),
        }
        base = region[0]["limitUnits"] if region else 12.0
        if P == 2:
            verts, stops = region_polygon(pc)
            entry["regionVertices"] = [[round(x, 6), round(y, 6)] for x, y in verts]
            entry["regionStops"] = dict(stops)
            # `clampToRegion` runs AFTER the pad projects onto the polygon, so its half-planes must not cut
            # the polygon back to 180°. Raise them to just clear the measured region — the polygon, not the
            # box, is what governs, and this only stops the box from clipping it.
            need = base
            for r0 in region:
                for v in verts:
                    a = r0["seedUnits"] + sum(c * v[t] for t, c in enumerate(r0["coef"]))
                    need = max(need, a)
            entry["limitUnits"] = round(need + 1e-6, 6)
            log(f"  {r['id']}  P=2  axes {entry['exportedAxes']} → {entry['axes']}  "
                f"+{gain:.2f}°  region {len(verts)} rays, limit {base:g}→{entry['limitUnits']:.3f} units, "
                f"stops {dict(stops)}")
        else:
            L = limit_units_max(pc, region) if region else None
            entry["limitUnits"] = None if L is None else round(L, 6)
            shown = "n/a" if L is None else f"{base:g}→{L:.3f} units ({L * 15:.1f}°)"
            log(f"  {r['id']}  P={P}  axes {entry['exportedAxes']} → {entry['axes']}  "
                f"+{gain:.2f}°  corner limit {shown}")
        out.append(entry)
    return out


def emit_range_plan(rows, path, multi=None):
    plan = {"ranges": []}
    if multi:
        plan["regions"] = multi
    for x in rows:
        lo, hi = x["exported"]
        tlo, thi = x["true"]
        slo, ok_lo = snap(tlo)
        shi, ok_hi = snap(thi)
        if x["gain"] <= 0.01 and not x["fold"]:
            continue
        plan["ranges"].append({
            "id": x["r"]["id"],
            "exported": [lo, hi],
            "range": [slo, shi],
            "snapped": [ok_lo, ok_hi],
            "measured": [round(tlo, 6), round(thi, 6)],
            "stops": list(x["stops"]),
            "defaultDeg": x["r"]["params"][0]["defaultAlphaDeg"],
            "gainDeg": round(x["gain"], 6),
            "fold": ({"centreDeg": x["fold"][3], "kind": x["fold"][2],
                      "witness": [round(x["fold"][0], 4), round(x["fold"][1], 4)]}
                     if x["fold"] else None),
            "newArcReachable": [None if x["new_lo"] is None else x["new_lo"][0],
                                None if x["new_hi"] is None else x["new_hi"][0]],
            "offPalette": sorted({s for arc in (x["new_lo"], x["new_hi"]) if arc for s in arc[1]}),
        })
    with open(path, "w") as f:
        json.dump(plan, f, indent=1)
        f.write("\n")
    return plan


def main(paths, out_path, palette_path, plan_path=None):
    recs = []
    for p in paths:
        recs += json.load(open(p))["records"]
    single = [r for r in recs if len(r["params"]) == 1 and r.get("allChecksPass", True)]
    pal, unit = palette_species(palette_path)
    log_lines = []

    def log(s=""):
        log_lines.append(s)
        print(s, flush=True)
        with open(out_path, "w") as f:
            f.write("\n".join(log_lines) + "\n")

    log("=== scan-family-ranges: true α ranges vs exported ===")
    log(f"input: {', '.join(paths)}")
    log(f"palette: {palette_path} — {len(pal)} species, {unit:g}° per angle unit")
    log(f"{len(recs)} families, {len(single)} single-parameter (the rest need the 2-param sweep)")
    log("")
    rows, stats = [], Counter()
    for idx, r in enumerate(single):
        pc = {"params": r["params"], "cellPolygons": r["cellPolygons"], "basis": r["basis"]}
        lo, hi = r["params"][0]["alphaRangeDegOpen"]
        mid = (lo + hi) / 2
        tlo, rlo = extend(pc, mid, -1)
        thi, rhi = extend(pc, mid, +1)
        cut_lo = [n for _, n in straight_vertices(cell_at(pc, [lo])[0])]
        cut_hi = [n for _, n in straight_vertices(cell_at(pc, [hi])[0])]
        gain = (lo - tlo) + (thi - hi)
        fold = find_fold(r["id"], pc, tlo, thi)
        # a fold about the range centre halves the distinct sweep; the exported half may already cover it
        distinct = (thi - tlo) / 2 if (fold and fold[3] is not None) else (thi - tlo)
        new_lo = arc_reachable(pc, tlo, lo, pal, unit) if lo - tlo > 0.01 else None
        new_hi = arc_reachable(pc, hi, thi, pal, unit) if thi - hi > 0.01 else None
        stats[f"low:{rlo}"] += 1
        stats[f"high:{rhi}"] += 1
        flag = []
        if gain > 0.01:
            flag.append(f"TRUNCATED +{gain:.2f}°")
        if fold:
            flag.append(f"FOLDED {fold[2]} @ {fold[0]:.1f}°≡{fold[1]:.1f}°"
                        + (f" (centre {fold[3]:g}°)" if fold[3] is not None else " (off-centre)"))
        rows.append(dict(r=r, exported=(lo, hi), true=(tlo, thi), stops=(rlo, rhi), gain=gain,
                         fold=fold, distinct=distinct, cuts=(cut_lo, cut_hi),
                         new_lo=new_lo, new_hi=new_hi))
        log(f"[{idx + 1}/{len(single)}] {r['id']}")
        log(f"    exported ({lo:g}, {hi:g})  true ({tlo:.4f}, {thi:.4f})  stops: low={rlo} high={rhi}"
            f"  distinct sweep {distinct:.2f}°")
        log(f"    exported bounds concavity cuts? low={bool(cut_lo)}{cut_lo} high={bool(cut_hi)}{cut_hi}"
            + (f"   {'; '.join(flag)}" if flag else ""))
        for name, arc in (("low", new_lo), ("high", new_hi)):
            if arc:
                log(f"    new {name} arc: solver-reachable={arc[0]}"
                    + (f"  off-palette species {sorted(arc[1])}" if arc[1] else ""))
    log("")
    log("=== summary ===")
    trunc = [x for x in rows if x["gain"] > 0.01]
    folded = [x for x in rows if x["fold"]]
    log(f"single-parameter families scanned: {len(single)}")
    log(f"TRUNCATED (true range wider than exported): {len(trunc)}")
    log(f"FOLDED (slider not injective, isometry-confirmed): {len(folded)}"
        f"  [{Counter(x['fold'][2] for x in folded)}]")
    log(f"stop reasons: {dict(stats)}")
    if trunc:
        tot = sum(x["gain"] for x in trunc)
        # honest accounting: on a folded family the two halves of the sweep are the same tilings, so only
        # the part of the new arc that is NOT a replay of already-exported α counts as newly reachable
        net = 0.0
        for x in trunc:
            tlo, thi = x["true"]
            lo, hi = x["exported"]
            if x["fold"] and x["fold"][3] is not None:
                # α and 2c−α are the same tiling, so distinct tilings are indexed by t = |α−c|. Measure
                # both intervals in t and take the difference; anything the exported range already
                # reaches on the other side of the centre is a replay, not a gain.
                c = x["fold"][3]
                t_true = max(abs(tlo - c), abs(thi - c))
                t_exp = max(abs(lo - c), abs(hi - c))
                t_exp_lo = 0.0 if lo < c < hi else min(abs(lo - c), abs(hi - c))
                net += max(0.0, t_true - t_exp) + t_exp_lo
            else:
                net += x["gain"]
        log(f"unshipped α-arc: {tot:.2f}° gross across {len(trunc)} families "
            f"(mean {tot / len(trunc):.2f}°); {net:.2f}° after discounting folded replay")
        unreachable = [x for x in trunc
                       if (x["new_lo"] and not x["new_lo"][0]) or (x["new_hi"] and not x["new_hi"][0])]
        log(f"families whose new arc has NO on-palette grid configuration (so the solver cannot supply "
            f"it under another id — provably absent from the atlas): {len(unreachable)}/{len(trunc)}")
        offs = Counter()
        for x in trunc:
            for arc in (x["new_lo"], x["new_hi"]):
                if arc:
                    for s in arc[1]:
                        offs[s] += 1
        log(f"off-palette species blocking those arcs: {dict(offs.most_common(20))}")
        log("")
        log("  widest truncations:")
        for x in sorted(trunc, key=lambda t: -t["gain"])[:20]:
            lo, hi = x["exported"]
            tlo, thi = x["true"]
            log(f"    {x['r']['id']:<34} ({lo:g},{hi:g}) → ({tlo:.3f},{thi:.3f})  +{x['gain']:.2f}°  "
                f"[{x['stops'][0]} | {x['stops'][1]}]"
                + ("  FOLDED" if x["fold"] else ""))
    if folded:
        log("")
        log("  folded sliders:")
        for x in folded:
            a, b, kind, c = x["fold"]
            lo, hi = x["exported"]
            log(f"    {x['r']['id']:<34} exported ({lo:g},{hi:g})  α={a:.2f}° ≡ α={b:.2f}° by {kind}"
                + (f", centre {c:g}°" if c is not None else ", off-centre"))
    log("")
    log("=== covering confirmation at the widest truncations (1 = tiles exactly) ===")
    for x in sorted(trunc, key=lambda t: -t["gain"])[:6]:
        pc = {"params": x["r"]["params"], "cellPolygons": x["r"]["cellPolygons"], "basis": x["r"]["basis"]}
        lo, hi = x["exported"]
        tlo, thi = x["true"]
        for label, a in [("inside new low arc", (tlo + lo) / 2), ("inside new high arc", (hi + thi) / 2),
                         ("just past true low", tlo - 0.5), ("just past true high", thi + 0.5)]:
            if abs(a - (lo + hi) / 2) < 1e-9:
                continue
            try:
                c = covering(*cell_at(pc, [a]))
            except Exception as e:  # a degenerate cell can make the sampler blow up; report, never hide
                c = f"error {e}"
            log(f"  {x['r']['id']:<34} {label:<20} α={a:8.3f}  {c}")
    multi = scan_multi(recs, log)
    if plan_path:
        plan = emit_range_plan(rows, plan_path, multi)
        off = [r for r in plan["ranges"] if not all(s for s, m in zip(r["snapped"], r["measured"]))]
        log("")
        log(f"=== range plan → {plan_path} ===")
        log(f"  {len(plan['ranges'])} single-parameter entries ({len(trunc)} truncated, {len(folded)} folded)"
            f"; {len(multi)} multi-parameter regions")
        if off:
            log(f"  ⚑ {len(off)} boundary/ies did not snap to the 0.5° grid — kept as measured: "
                f"{[r['id'] for r in off]}")
    log("")
    log("done")


if __name__ == "__main__":
    argv = [a for a in sys.argv[1:] if a != "--emit-range-plan"]
    plan = None
    if "--emit-range-plan" in sys.argv:
        plan = argv.pop()
    if len(argv) < 3:
        sys.exit(__doc__)
    main(argv[:-2], argv[-2], argv[-1], plan)
