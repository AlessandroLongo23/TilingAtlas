"""Corner angles in H² at edge length ℓ, for the regular and isotoxal-star tiles of a negative-defect palette.

A corner is named by what the alphabet already carries for it: L, its tile's boundary edge count, and its
Euclidean angle in units of 2π/D. A regular L-gon's corner is (L-2)·D/(2L) units; anything else on an even
L is a corner of the isotoxal star n* = L/2, a POINT below D/2 and a DENT above.

Convention (AL, 2026-10-22): the search runs with each star's point angle FIXED at its Euclidean value, so
regular corners and dents shrink with ℓ, every vertex sum is decreasing in ℓ and the forced edge length is
a single bisection. A block that closes at no common ℓ that way gets a second chance with the points free
(`solve_free`), and a developed tiling's points are then re-solved as a family (`family_member`).
"""
import functools
import math

import numpy as np


def interior_angle(p, l):
    """Interior angle of a regular p-gon of edge length l in H². p = 0 is the apeirogon sentinel (the
    same one `euclid_sum` reads): cos(π/∞) = 1, the polygon inscribed in a horocycle."""
    r = (1.0 if p == 0 else math.cos(math.pi / p)) / math.cosh(l / 2)
    return 2 * math.asin(min(1.0, max(-1.0, r)))


def star_dent(n, alpha, l):
    """Dent of the isotoxal star n* with point alpha and edge l. Triangle centre-point-dent has angles
    π/n, α/2, β/2 and the edge opposite the centre: cos A = −cos B cos C + sin B sin C cosh ℓ, solved
    for C on the branch that is π − A − B at ℓ = 0."""
    A, B = math.pi / n, alpha / 2
    x, y = math.sin(B) * math.cosh(l), math.cos(B)
    return 2 * (math.atan2(y, x) + math.asin(math.cos(A) / math.hypot(x, y)))


def star_lmax(n, alpha):
    """The edge length at which the dent reaches π (right angle in the triangle): cosh ℓ = cos(π/n)/sin(α/2).
    Past it the star is a convex 2n-gon."""
    return math.acosh(math.cos(math.pi / n) / math.sin(alpha / 2))


def corner_kind(L, units, D):
    """('regular', L, None) | ('point', n, alpha) | ('dent', n, alpha), alpha the star's point in radians."""
    if L == 0 or 2 * L * units == (L - 2) * D:
        return "regular", L, None
    n = L // 2
    if 2 * units < D:
        return "point", n, 2 * math.pi * units / D
    return "dent", n, 2 * math.pi * (D - D // n - units) / D


def corner_angle(L, units, D, l, points=None):
    """`points` maps a star type (n, nominal point) to the point it takes instead (solve_free)."""
    kind, n, alpha = corner_kind(L, units, D)
    if kind == "regular":
        return interior_angle(n, l)
    alpha = points[(n, alpha)] if points else alpha
    return alpha if kind == "point" else star_dent(n, alpha, l)


def star_types(configs, D):
    """The star types (n, nominal point) of a block's corners, in a fixed order: `starParam` indexes it."""
    return sorted({corner_kind(c[0], c[2], D)[1:] for cfg in configs for c in cfg
                   if not isinstance(c, int) and corner_kind(c[0], c[2], D)[0] != "regular"})


def solve_free(configs, D):
    """A block with no star realization at the palette's points, with the points FREED: unknowns ℓ and one
    point per star type, every orbit config closing to 2π with every dent reflex. (ℓ, {type: point}) or None.

    Every corner but a point shrinks with ℓ, so at each point tuple each config closes at most once, below
    L = the smallest l_max of the block's stars. A grid over the points (all of them at once, numpy) finds
    where every config closes below L, bisects each config's ℓ there, and seeds a least-squares polish
    from the tuples where those ℓ agree best (see the spread cut below); a block with no grid tuple closing every config is rejected
    without a solve, which is most of them. A returned solution is verified to 1e-10; a miss is "not
    found", never a proof (a feasible set thinner than the grid can slip through). Memoised on the configs'
    corner multisets."""
    return _solve_free(tuple(sorted(tuple(sorted(c, key=str)) for c in configs)), D)


def _np_regular(n, l):
    return 2 * np.arcsin(np.minimum(1.0, (1.0 if n == 0 else math.cos(math.pi / n)) / np.cosh(l / 2)))


def _np_dent(n, a, l):
    x, y = np.sin(a / 2) * np.cosh(l), np.cos(a / 2)
    return 2 * (np.arctan2(y, x) + np.arcsin(np.minimum(1.0, math.cos(math.pi / n) / np.hypot(x, y))))


@functools.lru_cache(maxsize=1 << 18)
def _solve_free(configs, D):
    from scipy.optimize import least_squares
    types = star_types(configs, D)
    S = len(types)
    if not S:
        return None
    ti = {t: i for i, t in enumerate(types)}
    top = np.array([math.pi - 2 * math.pi / n for n, _ in types])
    # each config as [(kind, n, star index)]: kind 0 regular, 1 point, 2 dent
    cfs = []
    for cfg in configs:
        row = []
        for c in cfg:
            k = ("regular", c, None) if isinstance(c, int) else corner_kind(c[0], c[2], D)
            row.append((0, k[1], None) if k[0] == "regular" else (1 if k[0] == "point" else 2, k[1], ti[k[1:]]))
        cfs.append(row)

    def F(row, l, A):   # A: (..., S) points; l broadcast against A[..., 0]
        return sum(_np_regular(n, l) if kd == 0 else A[..., j] + 0 * l if kd == 1 else _np_dent(n, A[..., j], l)
                   for kd, n, j in row)

    m = (0, 512, 72, 18, 9)[S] if S < 5 else 6           # ~5k tuples, finer per axis when there are few
    axes = [(np.arange(m) + 0.5) / m * t for t in top]
    A = np.stack(np.meshgrid(*axes, indexing="ij"), -1).reshape(-1, S)
    L = np.min(np.arccosh(np.cos(math.pi / np.array([n for n, _ in types])) / np.sin(A / 2)), axis=1)
    ok = np.ones(len(A), bool)
    for row in cfs:
        ok &= (F(row, np.zeros(len(A)), A) > 2 * math.pi) & (F(row, L, A) < 2 * math.pi)
    if not ok.any():
        return None
    A, L = A[ok], L[ok]
    roots = []
    for row in cfs:                                   # each config's closing edge, bisected everywhere at once
        lo, hi = np.zeros(len(A)), L.copy()
        for _ in range(50):
            mid = (lo + hi) / 2
            above = F(row, mid, A) > 2 * math.pi
            lo, hi = np.where(above, mid, lo), np.where(above, hi, mid)
        roots.append((lo + hi) / 2)
    R = np.array(roots)
    spread = R.max(0) - R.min(0)
    res = lambda v: np.array([F(row, np.array(v[0]), np.array(v[1:])) - 2 * math.pi for row in cfs])
    # Polish only where the configs' edges nearly agree. A speed knob, measured (2026-10-22, 3,000 k=2
    # blocks): every solution found had a best spread <= 0.17, the median miss 0.95.
    # On a family the whole zero-spread curve solves; a short edge keeps the member well conditioned (a
    # point of 0.06 degrees at edge 2.5 develops with 6e-3 edge error).
    for i in [i for i in np.argsort(spread + 0.05 * R.mean(0))[:4] if spread[i] < 0.5]:
        x0 = np.concatenate([[R[:, i].mean()], A[i]])
        r = least_squares(res, x0, bounds=([1e-9] + [1e-9] * S, [50] + list(top - 1e-9)),
                          xtol=1e-15, ftol=1e-15, gtol=1e-15)
        l, pts = r.x[0], r.x[1:]
        # A dent AT π is a straight corner: the "star" is then a convex n-gon with doubled edges.
        if np.max(np.abs(r.fun)) < 1e-10 and all(star_dent(n, a, l) > math.pi + 1e-6 for (n, _), a in zip(types, pts)):
            return float(l), {t: float(a) for t, a in zip(types, pts)}
    return None


# ---------------------------------------------------------------- star families (AL, 2026-10-22)
# A star's point angle is free in H²; only the plane pins it. A tiling's unknowns are its edge ℓ and one
# point per star type, its equations one closure per quotient vertex cycle, and its solution set has
# dimension DOF = unknowns − rank. A one-star record with a single vertex type has DOF 1 (α free, ℓ forced:
# in the plane only when the rest of the vertex fills exactly 2π/n, as 3.6* and 4.4*); a second vertex type
# usually pins α as well (DOF 0, a rigid tiling at a non-grid point); two star types under two vertex types
# leave DOF 1 with the two points moving together. The darts say which corner each turn is (`starKind`:
# 0 regular, 1 point, 2 dent), which star type (`starParam`, absent when there is one), and
# lvert[rneig[h]] is that face's side count, so nothing else is needed to re-solve a member.

def _param(d):
    return d.get("starParam") or [0] * len(d["rneig"])


def star_points(d):
    """([point per star type], [n per star type]) as the shipped turns have them."""
    P, kd, rn, lv = _param(d), d["starKind"], d["rneig"], d["lvert"]
    S = 1 + max(P[h] for h in range(len(kd)) if kd[h])
    a, n = [0.0] * S, [0] * S
    for h, k in enumerate(kd):
        if k == 1:
            a[P[h]] = d["alpha"][h]
        if k:
            n[P[h]] = lv[rn[h]] // 2
    return a, n


def family_turns(d, alphas, l):
    rn, lv, kd, P = d["rneig"], d["lvert"], d["starKind"], _param(d)
    return [interior_angle(lv[rn[h]], l) if kd[h] == 0 else alphas[P[h]] if kd[h] == 1
            else star_dent(lv[rn[h]] // 2, alphas[P[h]], l) for h in range(len(rn))]


def _cycles(rn):
    seen, out = set(), []
    for h0 in range(len(rn)):
        c, h = [], h0
        while h not in seen:
            seen.add(h)
            c.append(h)
            h = rn[h]
        if c:
            out.append(c)
    return out


def _closure(d):
    """r(ℓ, points): one residual per quotient cycle. Each cycle wraps its vertex a fixed number of times,
    read off the shipped turns; that does not change along a family."""
    cyc = _cycles(d["rneig"])
    wraps = [round(2 * math.pi / sum(d["alpha"][h] for h in c)) for c in cyc]

    def r(l, alphas):
        t = family_turns(d, alphas, l)
        return np.array([w * sum(t[h] for h in c) - 2 * math.pi for c, w in zip(cyc, wraps)])
    return r


def _jac(f, x, h=1e-7):
    x = np.asarray(x, float)
    return np.column_stack([(f(x + e) - f(x - e)) / (2 * h) for e in np.eye(len(x)) * h])


def is_star_tiling(ns, alphas, l):
    """Every point in (0, π − 2π/n), where the star would turn convex in the plane, and every dent reflex."""
    return l > 0 and all(0 < a < math.pi - 2 * math.pi / n and l < star_lmax(n, a) for n, a in zip(ns, alphas))


def family_dof(d, l):
    """(DOF, slider) at the shipped member. The slider is a star whose point can be held while Newton solves
    the rest (its column is not needed for the rank); None unless DOF is exactly 1."""
    a = star_points(d)[0]
    r = _closure(d)
    J = _jac(lambda x: r(x[0], x[1:]), [l] + a)
    rank = np.linalg.matrix_rank(J, tol=1e-6)
    dof = len(a) + 1 - rank
    if dof != 1:
        return dof, None
    return 1, next((j for j in range(len(a)) if np.linalg.matrix_rank(np.delete(J, 1 + j, 1), tol=1e-6) == rank), None)


def family_member(d, l, alpha, j=0, start=None, step=math.radians(0.25)):
    """The member whose star j has point `alpha`: (points, ℓ), the other points and the edge solved by
    damped Gauss–Newton, continued from `start` (default the shipped member, at edge l) in steps of at most
    `step` so it stays on the shipped branch. None when it stops converging or stops being a tiling by
    stars."""
    a, ns = star_points(d)
    a, l = start if start else (a, l)
    r = _closure(d)
    full = lambda x, aj: list(x[1:j + 1]) + [aj] + list(x[j + 1:])
    x = np.array([l] + a[:j] + a[j + 1:], float)
    steps = max(1, math.ceil(abs(alpha - a[j]) / step))
    for s in range(1, steps + 1):
        aj = a[j] + (alpha - a[j]) * s / steps
        f = lambda x: r(x[0], full(x, aj))
        try:
            for _ in range(50):
                res = f(x)
                if np.max(np.abs(res)) < 1e-12:
                    break
                dx = np.linalg.lstsq(_jac(f, x), res, rcond=None)[0]
                dx *= min(1.0, 0.5 / max(1e-300, np.max(np.abs(dx))))   # never jump more than 0.5 at once
                x = x - dx
            else:
                return None
            if not is_star_tiling(ns, full(x, aj), x[0]):
                return None
        except (OverflowError, ValueError):     # a step into the region where cosh or acosh is undefined
            return None
    return full(x, alpha), float(x[0])


def family_range(d, l, j=0, grid=math.radians(0.25)):
    """(lo, hi) in degrees: the open interval of star j's point over which the family stays a tiling by
    stars, walked out from the shipped member in `grid` steps and bisected at each end."""
    a0 = star_points(d)[0][j]
    ends = []
    for sgn in (-1, 1):
        m, a = (star_points(d)[0], l), a0
        while (nxt := family_member(d, l, a + sgn * grid, j, start=m)) is not None:
            m, a = nxt, a + sgn * grid
        lo, hi = a, a + sgn * grid
        for _ in range(40):
            mid = (lo + hi) / 2
            got = family_member(d, l, mid, j, start=m)
            lo, hi, m = (mid, hi, got) if got else (lo, mid, m)
        ends.append(math.degrees(lo))
    return ends[0], ends[1]
