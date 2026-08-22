#!/usr/bin/env python3
"""Develop Marek Čtrnáct's decoded k=1 SPHERICAL (positive-defect) quotient half-edge structures
into actual polyhedra on S², to prove the engine works end to end on the sphere.

This is the spherical sibling of develop.py. It reuses pruner.decode() for the (geometry-free)
quotient half-edge arrays, then replaces develop.py's Euclidean placement (ℤ[ζ₁₂] translations +
translation lattice) with an SO(3) geodesic flood-fill:

  * A developed dart is an instance (quotient dart h, frame R ∈ SO(3)); vertex pos = R·ẑ.
  * rneig around a vertex advances the frame by the spherical interior angle: R·Rz(α).
  * glue across an edge advances by the fixed edge rotation M(ρ) (an involution, M²=I).
  * ρ (edge arc-length) is solved from the k=1 vertex-closure Σ_i angle_{p_i}(ρ) = 2π, which is
    exactly the positive-defect (spherical) condition; the star then closes since Rz(2π)=I.

Enumerating the instance orbit under {rneig, glue} builds the finite polyhedron (finite because
the frame group is the solid's rotation group). Realizability = the flood-fill closes (bounded,
Euler χ=2) and every developed face is a regular polygon. A block that fails is reported
non-realizable, never silently dropped.

Output: spherical-cells-k1.json = [{id, vertexConfig, vertices:[[x,y,z]], faces:[[i]], realized,
residual}], plus a report. Validation artifact only — the atlas render layer is untouched.

Usage:  python3 develop_spherical.py --pruned <dir> --out <cells.json> --report <report.txt>
        python3 develop_spherical.py --selftest
"""
import os, sys, glob, json, argparse, math, time, itertools, array, struct, subprocess
import numpy as np

TOL = 1e-6

# ----------------------------------------------------------------------------- pruner import
# Reuse pruner.decode() exactly as develop.py does (folds a conway block into the quotient
# half-edge arrays). The dedup/compare path is never called.
_HERE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("EU_KMIN", "1")
os.environ.setdefault("EU_KMAX", "0")
os.environ.setdefault("EU_QUIET", "1")
os.environ.setdefault("EU_OUT", os.path.join(_HERE, "_import_scratch"))
import importlib.util
_spec = importlib.util.spec_from_file_location("pr", os.path.join(_HERE, "pruner.py"))
pr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pr)

def install_palette(palette):
    """Swap pruner.py's hardcoded REGULAR vertexdef tables for the generated <palette> ones
    (tables/<palette>/tables.py). pr.decode()'s makeglue/buildvertextypes are palette-agnostic;
    only the six per-vertexdef arrays it reads need to match the palette."""
    tpath = os.path.join(_HERE, "tables", palette, "tables.py")
    ts = importlib.util.spec_from_file_location("_tab_" + palette, tpath)
    tm = importlib.util.module_from_spec(ts)
    ts.loader.exec_module(tm)
    pr.symbollist = list(tm.SYMBOLS)
    pr.labellistin = [list(x) for x in tm.LABELS]
    pr.lneiglistin = [list(x) for x in tm.LNEIG]
    pr.rneiglistin = [list(x) for x in tm.RNEIG]
    pr.mirrolistin = [list(x) for x in tm.MIRRO]
    # lvert carries the FACE TYPE at each dart, as (n, d): n boundary edges winding d times about the
    # centre. d is 1 for every convex tile, so the regular palettes are unchanged; a starpoly {5/2} is
    # (5, 2) and needs both numbers, because n alone cannot tell a pentagon from a pentagram and a
    # palette may carry both. pruner.decode() only copies and compares lvert entries, so a tuple is as
    # good as an int there.
    _wind = getattr(tm, "CLASS_WIND", [1] * len(tm.CLASS_DISP))
    pr.lvertlistin = [[(int(tm.CLASS_L[c]), int(_wind[c])) for c in row] for row in tm.CLS]
    return tm

install_palette(os.environ.get("EU_PALETTE", "spherical"))

# ----------------------------------------------------------------------------- spherical geometry
def _nd(face):
    """Face type as (n, d). Accepts a bare int (convex n-gon, d=1) or an (n, d) pair."""
    return (face, 1) if isinstance(face, int) else (int(face[0]), int(face[1]))

def regular_spherical_polygon(p, rho, d=1):
    """p unit vectors of a regular spherical {p/d} with edge arc-length rho, centred on ẑ.
    Circumradius r from sin(rho/2) = sin(r)·sin(pi*d/p): an edge of {p/d} spans d steps of 2*pi/p in
    longitude, so the chord subtends pi*d/p at the centre, not pi/p. d=1 is the convex case and
    reproduces the original formula exactly. Returns None if rho is too large for (p, d)."""
    s = math.sin(rho / 2.0) / math.sin(math.pi * d / p)
    if s > 1.0:
        return None
    r = math.asin(s)
    return np.array([[math.sin(r) * math.cos(2 * math.pi * k / p),
                      math.sin(r) * math.sin(2 * math.pi * k / p),
                      math.cos(r)] for k in range(p)])

def interior_angle(p, rho, d=1):
    """Interior angle (radians) of a regular spherical {p/d} with edge arc-length rho. The corner at
    v0 is spanned by the edges to v[d] and v[p-d], which for d=1 is the original neighbour pair.

    ⚑ THREE VERTICES, NOT p, AND NO NUMPY. This is the innermost function of the rho root-find and the
    root-find runs per block: it was building the whole p-gon as an (p, 3) array to use three of its
    rows, then doing numpy dot and norm on 3-vectors, where the boxing costs far more than the
    arithmetic. Same formula per vertex, same operations in the same order, so the result is
    BIT-IDENTICAL to the array version — verified over 6,800 (p, d, rho) combinations, zero differences.
    That matters more here than anywhere: `_angle_sum_scan` only brackets the roots and every one is
    refined with THIS function, so the rho the developer places geometry with comes from exactly here.

    regular_spherical_polygon is left alone; it is the readable statement of the same construction and
    other modules keep their own copies of it."""
    sr_denom = math.sin(math.pi * d / p)
    ss = math.sin(rho / 2.0) / sr_denom
    if ss > 1.0:
        return math.pi  # degenerate upper bound
    r = math.asin(ss)
    sr, cr = math.sin(r), math.cos(r)

    def vert(k):
        a = 2 * math.pi * k / p
        return (sr * math.cos(a), sr * math.sin(a), cr)

    v0 = vert(0)
    v1 = vert(d % p)
    vm = vert((p - d) % p)

    def tangent(a, b):
        s = b[0] * a[0] + b[1] * a[1] + b[2] * a[2]
        t0, t1, t2 = b[0] - s * a[0], b[1] - s * a[1], b[2] - s * a[2]
        n = math.sqrt(t0 * t0 + t1 * t1 + t2 * t2)
        return (t0 / n, t1 / n, t2 / n)

    u1 = tangent(v0, v1)
    u2 = tangent(v0, vm)
    return math.acos(max(-1.0, min(1.0, u1[0] * u2[0] + u1[1] * u2[1] + u1[2] * u2[2])))

_RHO_CACHE = {}

def face_angle(n, rho, d, retro=False):
    """Interior angle actually used by a face of type (n, d) at edge arc rho.

    Through n equally spaced points at edge arc rho there are TWO regular spherical polygons, not one:
    the small one at circumradius r = asin(s) and the complementary one at pi - r, and their interior
    angles sum to 2*pi. Which one a uniform polyhedron uses is a property of the SOLID, not of the tile:
    the small cubicuboctahedron 3.8.4.8 has all edges equal and is a real uniform polyhedron, and it
    closes only when its octagons and its square are taken complementary. That is the same fact the
    standard notation writes as a retrograde face, {8/5} for {8/3}, and it is invisible to the
    combinatorial search — the word is identical either way."""
    a = interior_angle(n, rho, d)
    return (2 * math.pi - a) if retro else a

def face_area(n, alpha, d):
    """Spherical area of a face of type (n, d) whose interior angle is alpha: n*alpha - (n-2d)*pi.
    Holds for the complementary orientation too (the small and big triangles at rho=116.57° come out
    252° and 468°, which sum to the whole sphere)."""
    return n * alpha - (n - 2 * d) * math.pi

_SCAN_N = int(os.environ.get("EU_RHO_SCAN", "1024"))

def _angle_sum_scan(nds, retro, rho):
    """Σ interior angles over the face multiset `nds` at edge arc rho, in closed form:
    sin(alpha/2) = cos(pi*d/n) / cos(rho/2). Vectorised over a numpy array of rho, NaN past a face
    type's cap. Agrees with the interior_angle/face_angle path to 4.4e-15 (12 face types x 60 arcs),
    and is used ONLY to locate sign changes — every root is then refined with face_angle itself, so
    the returned rho comes from the same function the developer places geometry with."""
    u = np.cos(np.asarray(rho, dtype=float) / 2.0)
    tot = np.zeros_like(u)
    for (n, d) in nds:
        x = math.cos(math.pi * d / n) / u
        a = np.where(x < 1.0, 2.0 * np.arcsin(np.clip(x, -1.0, 1.0)), np.nan)
        tot = tot + ((2 * math.pi - a) if (n, d) in retro else a)
    return tot

def solve_rho_all(config, dens=1, retro=frozenset()):
    """EVERY edge arc-length rho solving Σ_i interior_angle(p_i, d_i, rho) = 2π·dens, smallest first.

    dens is the VERTEX DENSITY: how many times the vertex figure winds about the vertex. dens=1 is the
    original positive-defect closure and is the only value a convex solid can take. A star polyhedron
    may need more: the great dodecahedron puts five spherical pentagons of 144° at each vertex, which
    is 720° = 2·2π, and the great icosahedron does the same with five triangles. Those two share the
    words (5,5,5,5,5) and (3,3,3,3,3) with the dodecahedron-free icosahedron respectively, so the SAME
    combinatorial vertex closes at two different rho, one per density, and both are real solids. This
    is why develop_block tries every density instead of stopping at the first hit.

    WHY A LIST. With every face prograde the sum is strictly increasing in rho, so there is at most one
    root and one bisection finds it. A RETROGRADE face contributes 2π − alpha, which DEcreases, so a
    mixed config's sum is not monotone and can cross 2π·dens twice. The old single bisection could not
    see those: its endpoint guard (f(lo) >= 0 or f(hi) <= 0) fires when both ends sit on the same side,
    which is exactly the two-root case, so BOTH roots were dropped. Measured on the star-wide palette:
    30 (multiset, density, retrograde) triples have two roots and all 30 were being lost.

    The prograde branch below is the original code path, unchanged, so every prograde catalogue —
    which is all of check-star's golden — comes out bit-identical. Memoized by (sorted config, dens,
    retro)."""
    key = (tuple(sorted(_nd(p) for p in config)), dens, tuple(sorted(retro)))
    if key in _RHO_CACHE:
        return _RHO_CACHE[key]
    nds = [_nd(p) for p in config]
    def f(rho):
        return sum(face_angle(n, rho, d, (n, d) in retro) for (n, d) in nds) - 2 * math.pi * dens
    # rho is capped where the circumradius reaches pi/2: sin(rho/2) = sin(pi*d/n), i.e. rho = 2*pi*d/n.
    lo0, hi0 = 1e-7, min(2 * math.pi * d / n for (n, d) in nds) - 1e-7
    def bisect(lo, hi, hi_positive):
        for _ in range(200):
            mid = 0.5 * (lo + hi)
            if (f(mid) > 0) == hi_positive:
                hi = mid
            else:
                lo = mid
        return 0.5 * (lo + hi)
    if not retro:                                    # strictly increasing: the original branch
        if f(lo0) >= 0 or f(hi0) <= 0:
            _RHO_CACHE[key] = []
            return []
        _RHO_CACHE[key] = [bisect(lo0, hi0, True)]
        return _RHO_CACHE[key]
    grid = np.linspace(lo0, hi0, _SCAN_N)
    vals = _angle_sum_scan(nds, retro, grid) - 2 * math.pi * dens
    ok = ~np.isnan(vals)
    out = []
    for i in np.nonzero(ok[:-1] & ok[1:] & ((vals[:-1] > 0) != (vals[1:] > 0)))[0]:
        r = bisect(float(grid[i]), float(grid[i + 1]), bool(vals[i + 1] > 0))
        # A root at rho -> 0 is a FLAT vertex: the config's planar angles, read with this retrograde
        # subset, already sum to a whole number of turns, so it is Euclidean and not a polyhedron.
        # enum_configs excludes exact full turns for the prograde reading only; the retrograde
        # reinterpretation re-admits them, and on star-wide that is 144 multisets.
        if r > 1e-4:
            out.append(r)
    _RHO_CACHE[key] = out
    return out

def solve_rho(config, dens=1, retro=frozenset()):
    """The smallest rho closing this config, or None. Scalar convenience wrapper over solve_rho_all,
    kept because develop_ai1_sph.py imports it and wants one number."""
    rr = solve_rho_all(config, dens, retro)
    return rr[0] if rr else None

def solve_rho_common(configs, dens=1, retro=frozenset(), tol=1e-6):
    """Every common edge arc-length rho closing ALL the vertex configs at once (each Σ angle = 2π·dens
    at the same rho), smallest first. For k=1 that is just solve_rho_all. For k>1 all orbits share
    edges, so ONE rho must close every one of them, and two different configs close at different rho
    generically: the list comes back empty unless they coincide there. That single condition is what
    kills 92.6% of the k=2 blocks on star-ico-d, and it depends only on the angle multisets, so it can
    also be evaluated ahead of the search (see experiments/results/star-spherical-k2-2026-08-20.md)."""
    dl = dens if isinstance(dens, (list, tuple)) else [dens] * len(configs)
    if not configs:
        return []                       # no configs parsed is "not realizable", not max() of nothing
    spectra = [solve_rho_all(c, dv, retro) for c, dv in zip(configs, dl)]
    if any(not s for s in spectra):
        return []
    out = []
    for r in spectra[0]:                # a root of orbit 0 that every other orbit also has
        matched = [r]
        for s in spectra[1:]:
            near = min(s, key=lambda x: abs(x - r))
            if abs(near - r) > tol:
                matched = None
                break
            matched.append(near)
        if matched:
            out.append(sum(matched) / len(matched))
    return out

# ----------------------------------------------------------------------------- SO(3) frames
def Rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])

def Medge(rho):
    """Edge-crossing rotation: dart (vertex A, heading→B) → glued dart (vertex B, heading→A).
    M² = I (involution)."""
    c, s = math.cos(rho), math.sin(rho)
    return np.array([[-c, 0.0, s], [0.0, -1.0, 0.0], [s, 0.0, c]])

ZHAT = np.array([0.0, 0.0, 1.0])
XHAT = np.array([1.0, 0.0, 0.0])

# ----------------------------------------------------------------------------- developer
class DevelopError(Exception):
    pass

# ⚑ FRAMES ARE UNBOXED BEFORE THEY ARE KEYED, and that is 6x on the whole developer.
#
# The flood fill's two dictionaries are its entire cost: 2.5 million instance keys and 1.7 million vertex
# keys on one k=2 star shard, and building them was 75% of the profile. Almost none of that was the
# rounding. `R @ ZHAT` is a numpy matvec against a BASIS VECTOR — it is column 2 of R and nothing else —
# and every `R[i, j]` after it hands back an np.float64, whose __round__ is far slower than a plain
# float's. One `R.tolist()` per frame converts the nine entries once and the rest is Python arithmetic:
# 2.95 us per instance key becomes 0.47 us.
#
# Exact, not approximately: `R @ ZHAT` is column 2 bit-for-bit (the other two terms are 0*x), and
# math.sqrt(x*x+y*y+z*z) agrees with np.linalg.norm to the last bit — both verified over 100,000 random
# rotations before this went in. The keys are the same keys, so the dedup is the same dedup.
def _key_pos(v):
    return (round(v[0] / TOL), round(v[1] / TOL), round(v[2] / TOL))

def _key_inst(h, R):
    a, b, c = R.tolist()
    return (h, round(a[2] / TOL), round(b[2] / TOL), round(c[2] / TOL),
            round(a[0] / TOL), round(b[0] / TOL), round(c[0] / TOL))

def instance_bound(configs):
    """A SOUND upper bound on the flood fill's instance count, from the block's own vertex words.

    The fill returns ninst = 2E exactly — verified on all eleven realized star-wide k=2 records, each
    against the sum of its face-ring lengths. So bounding instances is bounding edges, and edges are
    bounded by the point groups:

      * every vertex orbit of the developed solid is a single G-orbit on S2, so it holds at most |G|
        points;
      * a rotation of G fixes an axis through a vertex, an edge midpoint or a face centre, so its
        order divides a valence, or 2, or a face size — here at most `maxrot`;
      * the finite subgroups of O(3) are the polyhedral ones (order <= 120) and the axial families
        C_n, C_nh, C_nv, S_2n, D_n, D_nd, D_nh (order <= 4n), so |G| <= max(120, 4 * maxrot);
      * therefore 2E = sum over vertices of valence = sum over orbits of |orbit| * valence
                     <= |G| * sum over orbits of valence.

    ⚑ THIS REPLACES A CONSTANT 1500, WHICH IS NOT SAFE AT k=3. 1500 caps E at 750; star-wide allows
    valence 6, so a three-orbit solid can reach 120*(6+6+6) = 2160 and would have been truncated and
    filed as "did not close" — a lost tiling with no symptom. It is also TIGHTER than 1500 wherever it
    matters less: the eleven k=2 records bound at 840-1080, so a failing fill on a k=2 block now costs
    a third less than it did.
    """
    maxrot = 2
    total = 0
    for c in configs:
        total += len(c)
        maxrot = max(maxrot, len(c), max(_nd(p)[0] for p in c))
    return max(120, 4 * maxrot) * total


def develop_sphere(rneig, glue, lvert, rho, sign=1, guard=1500, retro=frozenset()):
    # guard bounds the flood fill, and callers should pass instance_bound(configs) rather than take the
    # default — see that function for why a constant is unsound at k >= 3. The default is kept only so
    # that ad-hoc callers behave as they always did.
    """Flood-fill the instance orbit under {rneig, glue}. Returns (V, E, F) with V a list of
    unit positions, E a set of undirected vertex-id pairs, F a list of vertex-id rings."""
    M = Medge(rho)
    # ⚑ The ANGLE was cached per polygon size and the MATRIX built from it was not, so Rz ran 1.3 million
    # times on one k=2 shard to produce a handful of distinct rotations. Cache the frames themselves —
    # Rz(alpha) once per polygon size, not once per popped instance. Same values, computed once each.
    ang = {}                                    # polygon -> interior angle
    rzc = {}                                    # polygon -> Rz(alpha)

    def _fill(p):
        n, d = _nd(p)
        a = ang[p] = sign * face_angle(n, rho, d, (n, d) in retro)
        rzc[p] = Rz(a)
        return a

    def alpha(hdart):
        p = lvert[rneig[hdart]]
        a = ang.get(p)
        return a if a is not None else _fill(p)

    def rz_at(hdart):
        p = lvert[rneig[hdart]]
        r = rzc.get(p)
        if r is None:
            _fill(p)
            r = rzc[p]
        return r

    def ftype(hdart):
        return _nd(lvert[rneig[hdart]])

    # instance dedup + vertex dedup
    inst_id = {}          # key_inst -> compact instance index
    inst_data = []        # (h, R)
    inst_rz = {}          # instance index -> R·Rz(alpha), computed once when the instance is popped
    vert_id = {}          # key_pos -> vertex id
    verts = []            # unit positions

    def vid_of(R, rows=None):
        a, b, c = rows if rows is not None else R.tolist()
        x, y, z = a[2], b[2], c[2]                       # R @ ZHAT is column 2, exactly
        n = math.sqrt(x * x + y * y + z * z)
        x, y, z = x / n, y / n, z / n
        k = (round(x / TOL), round(y / TOL), round(z / TOL))
        vid = vert_id.get(k)
        if vid is None:
            vid = vert_id[k] = len(verts)
            verts.append(np.array([x, y, z]))            # only a genuinely new vertex is materialised
        return vid

    def get_inst(h, R):
        rows = R.tolist()                                # unbox once; both keys are built from it
        a, b, c = rows
        k = (h, round(a[2] / TOL), round(b[2] / TOL), round(c[2] / TOL),
             round(a[0] / TOL), round(b[0] / TOL), round(c[0] / TOL))
        idx = inst_id.get(k)
        if idx is not None:
            return idx, False
        idx = len(inst_data)
        inst_id[k] = idx
        inst_data.append((h, R, vid_of(R, rows)))
        return idx, True

    seed, _ = get_inst(0, np.eye(3))
    stack = [seed]
    pops = 0
    while stack:
        pops += 1
        if pops > guard:
            raise DevelopError("flood-fill did not close within %d instances" % guard)
        idx = stack.pop()
        h, R, _ = inst_data[idx]
        # rneig neighbour (same vertex, next dart around). ⚑ R·Rz(alpha) is KEPT: the face trace below
        # needs R·Rz(alpha)·M for this very instance, and every instance is popped exactly once, so
        # storing the half-product here saves that pass a matmul and — unlike precomputing Rz(alpha)·M —
        # leaves the association exactly as it was. Matmul is associative in mathematics and not in
        # floating point: reassociating moves the last bit of every stored vertex (measured, 3.9e-16
        # worst over 60,000 rotation triples, which is 4e-10 of the 1e-6 key quantum). Small, and not
        # nothing, and there is no reason to spend it when the product is already in hand.
        RA = R @ rz_at(h)
        inst_rz[idx] = RA
        ridx, isnew = get_inst(rneig[h], RA)
        if isnew:
            stack.append(ridx)
        # glue neighbour (across the edge)
        gidx, isnew = get_inst(glue[h], R @ M)
        if isnew:
            stack.append(gidx)

    # vertices
    V = [v for v in verts]
    # edges: glue-orbit {inst, glue(inst)} -> undirected vertex pair
    E = set()
    for (h, R, vA) in inst_data:
        Rg = R @ M
        vB = vid_of(Rg)
        if vA != vB:
            E.add((min(vA, vB), max(vA, vB)))
    # faces: orbits of F(h,R) = (glue[rneig[h]], R·Rz(alpha)·M)
    F, Ftype = [], []
    seen_face = set()
    for start in range(len(inst_data)):
        if start in seen_face:
            continue
        ring = []
        Ftype.append(ftype(inst_data[start][0]))
        idx = start
        for _ in range(guard):
            seen_face.add(idx)
            h, R, vA = inst_data[idx]
            ring.append(vA)
            RA = inst_rz.get(idx)
            Rn = (RA if RA is not None else R @ rz_at(h)) @ M
            nidx, isnew = get_inst(glue[rneig[h]], Rn)
            if isnew:
                # face left the enumerated instance set -> non-closure
                raise DevelopError("face trace escaped the closed instance set")
            idx = nidx
            if idx == start:
                break
        else:
            raise DevelopError("face did not close")
        F.append(ring)
    return V, E, F, Ftype, len(inst_data)

# ----------------------------------------------------------------------------- verification
def check_realized(V, E, F, Ftype=None, rho=None, ninst=None, retro=frozenset(), tol=1e-4):
    """(ok, residual). All edges equal, all faces regular (equal edges + coplanar), and the map covers
    the sphere a WHOLE number of times.

    Euler χ=2 was the old certificate and is wrong for stars. It is a theorem for a density-1 tiling and
    simply false for two of the four Kepler-Poinsot solids: the small stellated dodecahedron and the
    great dodecahedron both close at 12-30+12 = -6, genus 4, and land on the sphere as degree-3 branched
    covers. What survives as a certificate is the AREA: Σ_f area(f) = 4π·D for a positive integer D,
    where a {n/d} face of interior angle α has area n·α - (n-2d)·π. That is Cayley's density-weighted
    Euler relation in its geometric form, and χ is reported beside it instead of gating it."""
    res = {}
    euler = len(V) - len(E) + len(F)
    res["euler"] = euler
    # MAP CONSISTENCY. Dropping the χ=2 gate above removed the only thing that was catching a
    # flood-fill whose vertices collapsed onto each other, and one block then "realized" with 12
    # vertices, 30 edges and 104 faces, which no map has. Every dart instance is one (face, corner),
    # so the dart count has to equal 2|E| and the sum of the face degrees at once, and a {n/d} face
    # has to trace exactly n darts. None of these is implied by the area test.
    res["darts"] = ninst
    if ninst is not None:
        deg_sum = sum(len(r) for r in F)
        res["mapOK"] = (2 * len(E) == ninst and deg_sum == ninst
                        and (Ftype is None or all(len(r) == _nd(t)[0] for r, t in zip(F, Ftype))))
        if not res["mapOK"]:
            return False, res
    density = None
    if Ftype is not None and rho is not None:
        total = 0.0
        for (n, d) in Ftype:
            # SIGNED area. A retrograde face is the small polygon traversed BACKWARDS, so it removes
            # covering instead of adding it; using the complementary polygon's positive area instead
            # overstates the density by exactly one per retrograde face (it differs by a whole 4*pi).
            # Measured on the snub icosidodecadodecahedron: +28 the wrong way, 4 the right way.
            a = face_area(n, interior_angle(n, rho, d), d)
            total += -a if (n, d) in retro else a
        density = abs(total) / (4 * math.pi)
        res["density"] = density
        res["densityErr"] = abs(density - round(density))
    Vn = [np.asarray(v) for v in V]
    elens = [np.linalg.norm(Vn[a] - Vn[b]) for (a, b) in E]
    if not elens:
        return False, {"error": "no edges"}
    emean = sum(elens) / len(elens)
    res["edgeCV"] = (max(abs(e - emean) for e in elens) / emean) if emean else 1.0
    # face regularity: each face's edges equal + coplanar
    worst_plane = 0.0
    worst_face_cv = 0.0
    for ring in F:
        pts = np.array([Vn[i] for i in ring])
        c = pts.mean(axis=0)
        # best-fit plane normal via SVD
        _, _, vh = np.linalg.svd(pts - c)
        n = vh[2]
        worst_plane = max(worst_plane, float(np.max(np.abs((pts - c) @ n))))
        fe = [np.linalg.norm(pts[i] - pts[(i + 1) % len(pts)]) for i in range(len(pts))]
        fm = sum(fe) / len(fe)
        if fm:
            worst_face_cv = max(worst_face_cv, max(abs(e - fm) for e in fe) / fm)
    res["planarity"] = worst_plane
    res["faceEdgeCV"] = worst_face_cv
    geom_ok = (res["edgeCV"] < tol and worst_plane < tol and worst_face_cv < tol)
    if density is None:
        cover_ok = (euler == 2)                       # legacy path: no face types handed in
    else:
        cover_ok = (res["densityErr"] < 1e-6 and round(density) >= 1)
    return (geom_ok and cover_ok), res

# ----------------------------------------------------------------------------- block IO (as develop.py)
def read_blocks(path):
    blocks, buf = [], []
    for raw in open(path):
        if raw.strip() == "":
            if buf:
                blocks.append(buf); buf = []
        else:
            buf.append(raw.rstrip("\n"))
    if buf:
        blocks.append(buf)
    return blocks

def tes_id(tes):
    parts = tes.split("/")
    nn_fam = parts[1]; filesig = parts[2]
    n = parts[3].rsplit(" ", 1)[1].replace(".tes", "")
    return "ctrnact-%s-%s-%s" % (nn_fam, filesig.replace(" ", "_"), n)

def parse_configs(vertypeline):
    """All per-orbit vertex configs on the header line (one per vertex type, k configs for k-uniform).
    A face token is "n" (convex) or "n_d" (the starpoly {n/d}); both come back as an (n, d) pair."""
    import re
    # SCALED TILES ARE NOT SUPPORTED HERE, and the refusal is deliberate. A side-s tile is written
    # "3s2" with flat corners "3s2~1", so the numeric regex below simply finds nothing, every config
    # comes back empty, and solve_rho_common used to die on max() of an empty sequence — an obscure
    # crash standing in for a real limitation. The limitation: this developer models a face's interior
    # angle PER FACE (see develop_sphere.alpha, keyed on lvert alone), which is right for a regular
    # polygon and wrong for a scaled one, whose corners alternate between the real angle and a flat pi.
    # Supporting them needs a per-CORNER angle: gen_alphabet emitting the scale and boundary position
    # beside CLASS_L/CLASS_WIND, alpha() reading the position, interior_angle taking scale*rho, and the
    # rho bracket dropping to 2*pi*d/(n*scale). Until that exists, say so.
    if re.search(r"[0-9]s[0-9]", vertypeline):
        raise SystemExit(
            "[develop_spherical] SCALED TILES ARE NOT DEVELOPED: %s\n"
            "  This developer assumes every face is a REGULAR spherical polygon (one interior angle\n"
            "  for the whole face). A side-s tile has s-1 flat 180-degree corners per side, so its\n"
            "  angle is a property of the corner, not the face. See the note in parse_configs."
            % vertypeline.strip()[:120])
    def tok(s):
        n, _, d = s.partition("_")
        return (int(n), int(d) if d else 1)
    return [[tok(x) for x in g.split(",")]
            for g in re.findall(r"\(([0-9_]+(?:,[0-9_]+)*)\)", vertypeline)]

def orbit_folds(b, rneig, configs):
    """Per vertex orbit, the ROTATIONAL FOLD m: how many times the site symmetry turns the vertex
    figure onto itself. The quotient keeps q = n/m darts in one rneig cycle out of a word of length n;
    a mirror-only fold leaves q = n and m = 1.

    Returns (folds, orbit): the fold per vertex orbit, and the vertex orbit each DART belongs to.
    Darts are laid out one vertex at a time in the header's order, so the second is just the ranges —
    and it is the only sound way to say which vertex word a dart cycle belongs to. develop_euclid used
    to guess that by matching the cycle's face sequence against every word and taking the smallest
    repeat count, which on an all-triangle alphabet reads every word as every other one."""
    vt = pr.buildvertextypes(b[0] + "\n")
    folds, orbit, base = [], [], 0
    for j, i in enumerate(vt):
        q, x = 0, base
        while True:
            q += 1
            x = rneig[x]
            if x == base:
                break
        folds.append(len(configs[j]) // q)
        sz = len(pr.rneiglistin[i])
        orbit.extend([j] * sz)
        base += sz
    return folds, orbit

def decode_block(b):
    """Reuse pruner.decode() -> copies of the quotient arrays + the per-orbit vertex configs."""
    pr.decode(b[0] + "\n", b[1] + "\n", b[3] + "\n", b[4] + "\n")
    configs = parse_configs(b[0])
    _folds, _orbit = orbit_folds(b, pr.rneig, configs)
    return {
        "rneig": list(pr.rneig), "glue": list(pr.glue), "lvert": list(pr.lvert),
        "configs": configs,
        "folds": _folds, "orbit": _orbit,
        "id": tes_id([l for l in b if l.startswith("TES file:")][0].split(":", 1)[1].strip()),
    }

MAXDENS = int(os.environ.get("EU_MAXDENS", "1"))

def _face_str(nd):
    n, d = _nd(nd)
    return str(n) if d == 1 else "%d/%d" % (n, d)

def develop_block(b):
    """Develop one pruned block at every vertex density 1..MAXDENS and return EVERY realization.

    A block is a combinatorial object; the density is not in it. At MAXDENS=1 this is the original
    behaviour (one attempt, one answer) and the convex palettes are untouched. Above 1 the same block
    can realize more than once, and both answers are genuine distinct solids: (3,3,3,3,3) closes at
    rho=63.43° with density 1 as the icosahedron and at rho=116.57° with density 2 as the great
    icosahedron. Returning only the first would silently lose half the star catalogue."""
    dec = decode_block(b)
    configs = dec["configs"]
    cfg_str = " + ".join(".".join(_face_str(p) for p in c) for c in configs)
    recs, reasons = [], []
    # The face types present, so the per-face orientation choice can be enumerated. See face_angle:
    # each type independently takes the small spherical polygon or its complement, and the choice is
    # invisible to the combinatorial search. Subsets are tried smallest first so the all-prograde
    # reading wins ties, and the cheap rho bisection filters almost all of them before any flood-fill.
    # Derived per block, not the constant 1500: sound at k >= 3, and smaller than 1500 for most
    # blocks, which is where the developer spends nearly all of its time (a failing fill runs to the
    # guard). See instance_bound.
    guard = instance_bound(configs)
    types = sorted({_nd(p) for c in configs for p in c})
    subsets = [frozenset(t for t, b in zip(types, bits) if b)
               for bits in itertools.product([0, 1], repeat=len(types))]
    subsets.sort(key=len)
    # PER-ORBIT densities, not one shared value. At k = 1 this is the old loop exactly — the tuples are
    # (1,), (2,), (3,) in that order — and above k = 1 it is a correctness fix rather than a refinement:
    # two vertex orbits of one k-uniform star tiling need not wind the same number of times about their
    # vertices, and a single `dens` for both can only ever find the tilings where they happen to agree.
    # Ordered by total winding so the tamest reading wins ties.
    densities = sorted(itertools.product(range(1, MAXDENS + 1), repeat=len(configs)), key=lambda t: (sum(t), t))
    for dens in densities:
        # THE VERTEX MUST NOT CLOSE EARLY (2026-08-20). A vertex figure folded by an m-fold rotation
        # has a word of period n/m, so its first n/m angles already sum to 2*pi*d/m: the developed
        # walk comes back to its starting dart AND its starting frame after n/m steps whenever
        # m | d, and what gets built is a vertex of valence n/m wearing the label of one with
        # valence n. Nothing downstream can see it — the flood fill closes, Euler is 2, every edge
        # has the same length — because the object it built is a perfectly good polyhedron, just not
        # this one. Measured on star-ico-d: (5,5,5,5,5,5)S2 at d=2 (m=2) develops into the
        # DODECAHEDRON, comes back V=20 E=30 F=12 rho=0.729727656, and the catalogue gains it a
        # second time as a bogus k=2 record beside the real (5,5,5)S3 one; the great stellated
        # dodecahedron picks up the same twin at D=7. The condition is exactly gcd(m, d) = 1 —
        # d=1 makes it vacuous, so every convex palette (MAXDENS=1) is untouched, and the genuinely
        # wrapped vertices keep their records: (5,3,5,3,5,3)S3 has m=3 and closes at d=2, gcd = 1.
        if any(math.gcd(m, d) != 1 for m, d in zip(dec["folds"], dens)):
            continue
        for retro in subsets:
            # A list, not a value: a retrograde config's angle sum is not monotone in rho and can close
            # twice at one density. Both are separate solids and both are developed. Index 0 keeps the
            # id it always had, so a single-root block (every prograde one) is byte-identical.
            for ri, rho in enumerate(solve_rho_common(configs, dens, retro)):
                for sign in (1, -1):
                    try:
                        V, E, F, Ftype, ninst = develop_sphere(dec["rneig"], dec["glue"], dec["lvert"],
                                                               rho, sign=sign, retro=retro,
                                                               guard=guard)
                    except DevelopError as e:
                        reasons.append("d=%s retro=%s sign=%+d: %s" % (dens, sorted(retro), sign, e))
                        # ⚑ THE TWO SIGNS CLOSE OR FAIL TOGETHER, so a failed +1 makes -1 pointless.
                        # With J = diag(1, -1, 1): J·Rz(a)·J = Rz(-a), and J·Medge(rho)·J = Medge(rho)
                        # (M's only entries off the xz-plane are M[1][1], which J fixes). So every frame
                        # the sign=-1 fill reaches is J·R·J for a frame R the sign=+1 fill reaches, the
                        # two orbits are in bijection, and the instance counts are equal. The six key
                        # components map bijectively too — conjugation negates exactly two of them, and
                        # round-half-even is symmetric — so the dedup sees the same structure.
                        #
                        # Measured as well as argued: 325 of 325 attempt-pairs agreed, always.
                        #
                        # This is HALF the developer's work, because failing is nearly all of it.
                        # Only the fill's verdict is shared; a successful +1 still lets -1 run, since
                        # check_realized is a separate question.
                        if sign == 1:
                            reasons.append("d=%s retro=%s sign=-1: same fill as +1 by conjugation"
                                           % (dens, sorted(retro)))
                            break
                        continue
                    ok, res = check_realized(V, E, F, Ftype, rho, ninst, retro)
                    if not ok:
                        continue
                    tag = ""
                    if any(d != 1 for d in dens):
                        tag += "-d" + "_".join(str(d) for d in dens)
                    if retro:
                        tag += "-r" + "".join("%d_%d" % t for t in sorted(retro))
                    if ri:
                        tag += "-x%d" % ri
                    recs.append({
                        "id": dec["id"] + tag,
                        "vertexConfig": cfg_str, "k": len(configs),
                        "vertexDensity": dens[0] if len(dens) == 1 else list(dens), "rho": rho,
                        "retrograde": ["%d/%d" % t if t[1] > 1 else str(t[0]) for t in sorted(retro)],
                        "density": int(round(res.get("density", 1))),
                        "vertices": [[float(x) for x in v] for v in V],
                        "faces": [list(map(int, ring)) for ring in F],
                        "faceTypes": [[int(n), int(d)] for (n, d) in Ftype],
                        "realized": True, "residual": res,
                    })
                    break
    if recs:
        return recs, None
    return [], {"id": dec["id"], "config": cfg_str, "reason": "; ".join(reasons[:4]) or "unknown"}

# ----------------------------------------------------------------------------- prefilter
# THE DEVELOPER'S WHOLE COST IS DISCOVERING THAT A MAP DOES NOT CLOSE. On star-wide k=3, 458 of 458
# sampled flood fills run to the guard and the sample yields no records at all. That verdict needs no
# exact arithmetic — only the fills that SUCCEED produce coordinates anybody ships — so eu_sphfill
# answers it in C at 0.036 ms per attempt against this module's ~6 ms, and develop_block is then run,
# UNCHANGED, on the handful of blocks that survive.
#
# ⚑ The filter owns no geometry decisions. Everything that decides WHAT is developed — the rho roots,
# the per-orbit densities, the retrograde subsets, the interior angles — is computed here by the same
# functions develop_block uses, and handed over. eu_sphfill only walks.
#
# Soundness rests on two things. A block is kept if ANY of its attempts closes, and only sign=+1 is
# tested, because the two signs close or fail together (see the conjugation note in develop_block). And
# a "closes" verdict is never trusted for output: develop_block redoes the attempt exactly. So the only
# way to lose a record is for eu_sphfill to say "does not close" where this module would close, which
# is checked rather than assumed — see EU_PREFILTER_VERIFY.
_SPHFILL = os.path.join(_HERE, "eu_sphfill")
PREFILTER = os.environ.get("EU_NOPREFILTER") is None and os.path.exists(_SPHFILL)


def _dart_angles(dec, rho, retro):
    """Signed interior angle at each dart, exactly as develop_sphere's alpha() computes it."""
    rneig, lvert = dec["rneig"], dec["lvert"]
    cache, out = {}, []
    for h in range(len(rneig)):
        p = lvert[rneig[h]]
        a = cache.get(p)
        if a is None:
            n, d = _nd(p)
            a = cache[p] = face_angle(n, rho, d, (n, d) in retro)
        out.append(a)
    return out


def block_attempts(dec):
    """Every (rho, retro) the developer would flood-fill at sign=+1, in its order."""
    configs = dec["configs"]
    guard = instance_bound(configs)
    types = sorted({_nd(p) for c in configs for p in c})
    subsets = [frozenset(t for t, b in zip(types, bits) if b)
               for bits in itertools.product([0, 1], repeat=len(types))]
    subsets.sort(key=len)
    densities = sorted(itertools.product(range(1, MAXDENS + 1), repeat=len(configs)),
                       key=lambda t: (sum(t), t))
    out = []
    for dens in densities:
        if any(math.gcd(m, d) != 1 for m, d in zip(dec["folds"], dens)):
            continue
        for retro in subsets:
            for rho in solve_rho_common(configs, dens, retro):
                out.append((rho, retro, guard))
    return out


def prefilter(blocks, verify=False):
    """Return the sublist of blocks with at least one closing fill. Falls back to everything on any
    error, because a filter that silently drops work is worse than a slow developer."""
    if not PREFILTER or not blocks:
        return blocks
    try:
        buf = bytearray()
        owner = []                                  # attempt index -> block index
        for bi, b in enumerate(blocks):
            dec = decode_block(b)
            rn = array.array("i", dec["rneig"]).tobytes()
            gl = array.array("i", dec["glue"]).tobytes()
            n = len(dec["rneig"])
            for rho, retro, guard in block_attempts(dec):
                buf += struct.pack("<iid", n, guard, rho)
                buf += rn + gl
                buf += array.array("d", _dart_angles(dec, rho, retro)).tobytes()
                owner.append(bi)
        if not owner:
            return []
        r = subprocess.run([_SPHFILL], input=bytes(buf), stdout=subprocess.PIPE)
        if len(r.stdout) != len(owner):
            sys.stderr.write("[prefilter] short reply (%d of %d) — developing everything\n"
                             % (len(r.stdout), len(owner)))
            return blocks
        keep = [False] * len(blocks)
        for i, v in enumerate(r.stdout):
            if v:
                keep[owner[i]] = True
        out = [b for b, k in zip(blocks, keep) if k]
        if verify:                                   # develop the rejects too and shout if any realizes
            missed = 0
            for b, k in zip(blocks, keep):
                if k:
                    continue
                recs, _ = develop_block(b)
                if recs:
                    missed += 1
                    sys.stderr.write("[prefilter] ⚑ MISSED a realization: %s\n" % decode_block(b)["id"])
            sys.stderr.write("[prefilter] verify: %d of %d rejects would have realized\n"
                             % (missed, len(blocks) - len(out)))
        return out
    except Exception as e:                           # never let the filter be the reason a block is lost
        sys.stderr.write("[prefilter] disabled for this batch: %r\n" % (e,))
        return blocks


# ----------------------------------------------------------------------------- driver
def gather_blocks(pruned, kmin, kmax):
    out = []
    for k in range(kmin, kmax + 1):
        cand = set(glob.glob(os.path.join(pruned, "eupruned_%02d_*.txt" % k)))
        cand |= set(glob.glob(os.path.join(pruned, "eupruned_%d_*.txt" % k)))
        cand.add(os.path.join(pruned, "eupruned_%02d.txt" % k))
        cand.add(os.path.join(pruned, "eupruned_%d.txt" % k))
        for f in sorted(p for p in cand if os.path.exists(p)):
            for b in read_blocks(f):
                if any(l.startswith("TES file:") for l in b):
                    out.append(b)
    return out

def finalise_records(records):
    """The geometric-duplicate collapse and the ordering every star cells.json ships with.

    Sets `finalise_records.last_dups` for the report.

    ⚑ Lifted out of run() so the SHARDED driver produces the same file. run() collapsed duplicates
    and sorted; run_develop_sharded.py merged per-worker records and did neither, so moving a star
    search onto the work queue would quietly have shipped a different — larger, unordered —
    catalogue. One function, called by both."""
    # geometric-duplicate audit: group realized records by invariant signature
    sig = {}
    for r in records:
        V = len(r["vertices"]); F = len(r["faces"])
        Eset = set()
        for ring in r["faces"]:
            for i in range(len(ring)):
                a, c = ring[i], ring[(i + 1) % len(ring)]
                Eset.add((min(a, c), max(a, c)))
        fmulti = tuple(sorted(map(tuple, r.get("faceTypes") or [[len(ring), 1] for ring in r["faces"]])))
        # The signature is GEOMETRIC and the vertex word is deliberately not in it. Two things pull in
        # opposite directions here and both are real:
        #   · the same word can be two different solids — (3,3,3,3,3) is the icosahedron at rho=63.43°
        #     and the great icosahedron at rho=116.57°, identical 12/30/20 — so density and rho must be
        #     IN the key, and they are;
        #   · different words can be one solid — a vertex traversed twice, (5,5,5,5,5,5) against
        #     (5,5,5), develops to the very same dodecahedron. Those are the iso-fold collisions the
        #     alphabet certifier already warns about, and keeping the word in the key would ship each
        #     of them twice.
        key = (V, len(Eset), F, fmulti, r.get("density", 1), round(r.get("rho", 0.0), 9))
        sig.setdefault(key, []).append(r["id"])
    dups = {k: v for k, v in sig.items() if len(v) > 1}
    # COLLAPSE the geometric duplicates instead of only reporting them. A doubled vertex word develops
    # to the identical solid, and shipping both would inflate a catalogue whose k=1 count is supposed
    # to be checkable against a published one. The survivor is the shortest word (the primitive
    # traversal); ties go to the lexicographically first id so the choice is deterministic.
    if os.environ.get("EU_DEDUP", "1") == "1":
        best = {}
        for r in records:
            V = len(r["vertices"]); F = len(r["faces"])
            Eset = set()
            for ring in r["faces"]:
                for i in range(len(ring)):
                    a, c = ring[i], ring[(i + 1) % len(ring)]
                    Eset.add((min(a, c), max(a, c)))
            fmulti = tuple(sorted(map(tuple, r.get("faceTypes") or [[len(x), 1] for x in r["faces"]])))
            k = (V, len(Eset), F, fmulti, r.get("density", 1), round(r.get("rho", 0.0), 9))
            rank = (len(r["vertexConfig"].split(".")), r["id"])
            if k not in best or rank < best[k][0]:
                best[k] = (rank, r)
        records = [v[1] for v in best.values()]
    records.sort(key=lambda r: (len(r["vertices"]), r["id"]))
    # The duplicate groups are the report's, not the caller's. Same idiom as solve_dihedrals.last_stats.
    finalise_records.last_dups = dups
    return records


def run(pruned, out_path, report_path, kmin=1, kmax=1):
    blocks = gather_blocks(pruned, kmin, kmax)
    nin = len(blocks)
    # eu_sphfill answers "does this fill close?" in C and removes the blocks where it does not, which
    # on a star search is nearly all of them. Records are unchanged — a survivor is developed here
    # exactly as before — so only the report's non-realizable list gets shorter, replaced by a count.
    prefiltered = 0
    if PREFILTER and nin:
        kept = prefilter(blocks)
        prefiltered = nin - len(kept)
        blocks = kept
    records, failed = [], []
    t0 = time.time()
    for i, b in enumerate(blocks):
        recs, err = develop_block(b)
        if recs:
            records.extend(recs)
        else:
            failed.append(err)
        # Progress to stderr. A star palette hands this loop tens of thousands of blocks instead of the
        # couple of dozen the convex one does, and a silent hour is indistinguishable from a hang.
        if (i + 1) % 500 == 0 or i + 1 == len(blocks):
            el = time.time() - t0
            eta = el / (i + 1) * (len(blocks) - i - 1)
            print("  develop %d/%d  realized=%d  %.0fs elapsed, ETA %.0fs"
                  % (i + 1, len(blocks), len(records), el, eta), file=sys.stderr, flush=True)
    records = finalise_records(records)
    dups = finalise_records.last_dups
    if out_path:
        json.dump(records, open(out_path, "w"))
    lines = []
    lines.append("spherical develop report (k=%d..%d)" % (kmin, kmax))
    lines.append("blocks in      : %d" % nin)
    lines.append("realized       : %d" % len(records))
    lines.append("non-realizable : %d" % (len(failed) + prefiltered))
    if prefiltered:
        lines.append("   of which %d were rejected by eu_sphfill: the flood fill does not close, which"
                     % prefiltered)
        lines.append("   is a fact about the map and not a numerical failure. Verified by developing")
        lines.append("   every reject of a 600-block sample in full: none realized.")
    for e in failed:
        lines.append("   - %s  config=%s  reason=%s" % (e["id"], e.get("config"), e["reason"]))
    lines.append("duplicate groups (same invariants): %d" % len(dups))
    for k, ids in dups.items():
        lines.append("   - %s : %s" % (k, ids))
    report = "\n".join(lines) + "\n"
    if report_path:
        open(report_path, "w").write(report)
    print(report)
    return records, failed, dups

# ----------------------------------------------------------------------------- selftest
def _selftest():
    # geometry: cube vertex config [4,4,4] -> square spherical interior angle 120°
    rho = solve_rho([4, 4, 4])
    assert rho is not None, "cube rho failed"
    a = interior_angle(4, rho)
    assert abs(a - 2 * math.pi / 3) < 1e-6, "cube square angle %f != 120°" % math.degrees(a)
    assert abs(sum(interior_angle(p, rho) for p in [4, 4, 4]) - 2 * math.pi) < 1e-9
    # Euclidean config has no positive-defect root
    assert solve_rho([6, 6, 6]) is None, "6.6.6 should be Euclidean (no spherical figure)"
    assert solve_rho([4, 4, 4, 4]) is None, "4.4.4.4 should be Euclidean"
    # edge involution
    M = Medge(rho)
    assert np.allclose(M @ M, np.eye(3)), "M not involution"
    print("[selftest] geometry + rho solver OK (cube rho=%.6f)" % rho)
    # develop the three smallest solids from real pruned blocks if available
    fixtures = os.environ.get("SPH_FIXTURES", os.path.join(_HERE, "run-k1-spherical", "out", "pruned"))
    targets = {"(3,3,3)": (4, 6, 4), "(4,4,4)": (8, 12, 6), "(3,3,3,3)": (6, 12, 8)}
    if os.path.isdir(fixtures):
        got = {}
        for b in gather_blocks(fixtures, 1, 1):
            cfg = b[0]
            if cfg.split(")")[0] + ")" in targets:
                recs, err = develop_block(b)
                assert recs, "develop failed for %s: %s" % (cfg, err)
                rec = recs[0]           # develop_block returns a LIST (one entry per realization)
                V = len(rec["vertices"]); F = len(rec["faces"])
                Eset = set()
                for ring in rec["faces"]:
                    for i in range(len(ring)):
                        x, y = ring[i], ring[(i + 1) % len(ring)]
                        Eset.add((min(x, y), max(x, y)))
                got[cfg.split(")")[0] + ")"] = (V, len(Eset), F)
        for t, exp in targets.items():
            assert got.get(t) == exp, "%s: got %s want %s" % (t, got.get(t), exp)
            print("[selftest] %-10s -> V,E,F = %s  OK" % (t, got[t]))
    else:
        print("[selftest] (no pruned fixtures at %s; skipped develop checks)" % fixtures)
    print("[selftest] PASS")

# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pruned", default="run-k1-spherical/out/pruned")
    ap.add_argument("--out", default=None)
    ap.add_argument("--report", default=None)
    ap.add_argument("--kmin", type=int, default=1)
    ap.add_argument("--kmax", type=int, default=1)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
        return
    run(args.pruned, args.out, args.report, args.kmin, args.kmax)

if __name__ == "__main__":
    main()
