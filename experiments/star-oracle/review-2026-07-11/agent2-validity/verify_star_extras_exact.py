#!/usr/bin/env python3
"""Zero-float certification of the two remaining float checks in verify_star_extras.py:

  (1) face simplicity  - pairwise-distinct vertices, adjacent edges meeting only in the
      shared vertex, and non-adjacent edges pairwise disjoint, for every face of the
      fundamental cell (exact segment-disjointness predicates, CCW-style);
  (2) face orientation - certified sign of every face's signed area, consistency across
      the cell, and the exact area identity  sigma * sum(2A_f) == 2 * delta * det
      with BOTH signs certified (the old harness read them off floats).

Candidates: E1..E4 (run-star-k2b6/extras4.txt) and the a=3 sibling
  (3*d13,3,3*p3,3)A, (3*d13,3*p3,3,3)F   [A3]
from agent3-family/run-a3-k2b6/.../out/pruned/eupruned_02_3sP.txt.

Method. Vertices live in ZZ[zeta_24] (integer 8-tuples, basis 1..zeta^7,
zeta = e^{i pi/12}, zeta^8 = zeta^4 - 1). For v = sum c_k zeta^k:

    Re(v) = sum c_k cos(k pi/12),   Im(v) = sum c_k sin(k pi/12),

and cos/sin(k pi/12) for k = 0..7 are exact elements of Q(sqrt2, sqrt3) with basis
{1, sqrt2, sqrt3, sqrt6}: e.g. cos(pi/12) = (sqrt6 + sqrt2)/4. So Re(v), Im(v) are
"quads" (a, b, c, d) of Fractions meaning a + b*sqrt2 + c*sqrt3 + d*sqrt6.

  * ZERO TEST is algebraic and trivial: {1, sqrt2, sqrt3, sqrt6} is a Q-basis of the
    degree-4 field Q(sqrt2, sqrt3), so a quad is 0 iff all four coordinates are 0.
    (Likewise a ring element is 0 iff its integer 8-tuple is zero: the coordinates
    ARE the canonical representation in the free Z-module Z[zeta_24].)
  * NONZERO SIGN is certified by interval arithmetic with rational endpoints:
    n = isqrt(m * 4^p) gives  n/2^p <= sqrt(m) < (n+1)/2^p  (integer square root,
    no float), the quad is evaluated over these intervals in exact Fraction
    arithmetic, and if the interval excludes 0 the sign is certified. Otherwise p
    doubles. Termination: the input is a FIXED nonzero real (nonzero checked first,
    algebraically), so some finite p separates it from 0.

Cross products / orientation predicates: cross(u, w) = Im(conj(u) * w) and
dot(u, w) = Re(conj(u) * w) computed by exact ring multiplication + conjugation,
then certified quad sign. Segment-segment disjointness is the classic complete
predicate (proper crossing via four orientation signs, plus collinear/endpoint
cases via exact on-segment tests). No float appears anywhere in any decision.
Float occurs ONLY inside the self-test as an independent cross-check of the exact
machinery, never in a verdict.

Audited non-decision float upstream: develop()'s Lagrange-Gauss reduction uses a
float dot product, but only to CHOOSE among bases; its update steps are integer
unimodular operations on an exactly-computed integer basis, so the returned (T1, T2)
generate the period lattice exactly regardless of that choice. Lattice membership
here is re-decided exactly (rational 2x2 solve + all-coordinate integer check).

Deliberately NOT modified: verify_star_extras.py (the prior harness); its already
exact checks (cone angles, Euler/2-sided edges, ring-element area identity,
symmetry/k) are not repeated here except the area identity, which is re-proved with
certified signs.

Usage:  python3 verify_star_extras_exact.py
Env:    CTRNACT_A3_TABLES=<dir>  cache/generation dir for the a=3 tables
        (default: a fresh temp dir; generated from agent3-family's palette JSON via
        the oracle's alphabets/gen_alphabet.py --certify).
"""
import os
import sys
import math
import random
import subprocess
import tempfile
import importlib.util
from fractions import Fraction
from math import isqrt
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# .../<repo>/experiments/star-oracle/review-2026-07-11/agent2-validity -> <repo>
REPO = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", "..", ".."))
ORACLE = os.path.join(REPO, "tools", "ctrnact-oracle")
A3_DIR = os.path.join(SCRIPT_DIR, "..", "agent3-family")
A3_PRUNED = os.path.abspath(os.path.join(
    A3_DIR, "run-a3-k2b6", "run-a3-k2b6", "out", "pruned", "eupruned_02_3sP.txt"))
A3_PALETTE = os.path.abspath(os.path.join(A3_DIR, "star24-with-3x3.palette.json"))
A3_VERTYPE = "(3*d13,3,3*p3,3)A, (3*d13,3*p3,3,3)F"

spec = importlib.util.spec_from_file_location("rc", os.path.join(ORACLE, "render_cells.py"))
rc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rc)

RANK = rc.RANK
ZERO, ONE, ZK = rc.ZERO, rc.ONE, rc.ZK
zadd, zsub, zscale, zfloat = rc.zadd, rc.zsub, rc.zscale, rc.zfloat


# ---------------- exact ring extensions (as in the prior harness) ----------------
def zmulpow(u, k):
    v = u
    for _ in range(k % 24):
        v = rc.zmul_zeta(v)
    return v


def zconj(v):
    out = zscale(ZK[0], v[0])
    for k in range(1, RANK):
        out = zadd(out, zscale(ZK[(24 - k) % 24], v[k]))
    return out


def zmul(u, v):
    out = ZERO
    for k in range(RANK):
        if v[k]:
            out = zadd(out, zscale(zmulpow(u, k), v[k]))
    return out


# ---------------- Q(sqrt2, sqrt3) quads ----------------
# quad (a, b, c, d) of Fractions  =  a + b*sqrt2 + c*sqrt3 + d*sqrt6
F0, F1 = Fraction(0), Fraction(1)
H, Q = Fraction(1, 2), Fraction(1, 4)
Q_ZERO = (F0, F0, F0, F0)

# exact values of cos/sin(k*pi/12), k = 0..7   (cos(pi/12) = (sqrt6+sqrt2)/4, etc.)
COS = [
    (F1, F0, F0, F0),      # k=0: 1
    (F0, Q, F0, Q),        # k=1: (sqrt6+sqrt2)/4
    (F0, F0, H, F0),       # k=2: sqrt3/2
    (F0, H, F0, F0),       # k=3: sqrt2/2
    (H, F0, F0, F0),       # k=4: 1/2
    (F0, -Q, F0, Q),       # k=5: (sqrt6-sqrt2)/4
    (F0, F0, F0, F0),      # k=6: 0
    (F0, Q, F0, -Q),       # k=7: (sqrt2-sqrt6)/4
]
SIN = [
    (F0, F0, F0, F0),      # k=0: 0
    (F0, -Q, F0, Q),       # k=1: (sqrt6-sqrt2)/4
    (H, F0, F0, F0),       # k=2: 1/2
    (F0, H, F0, F0),       # k=3: sqrt2/2
    (F0, F0, H, F0),       # k=4: sqrt3/2
    (F0, Q, F0, Q),        # k=5: (sqrt6+sqrt2)/4
    (F1, F0, F0, F0),      # k=6: 1
    (F0, Q, F0, Q),        # k=7: (sqrt6+sqrt2)/4
]


def qadd(u, v):
    return tuple(a + b for a, b in zip(u, v))


def qsub(u, v):
    return tuple(a - b for a, b in zip(u, v))


def qscale(u, m):
    return tuple(a * m for a in u)


def qfloat(u):
    return float(u[0]) + float(u[1]) * math.sqrt(2) + float(u[2]) * math.sqrt(3) \
        + float(u[3]) * math.sqrt(6)


def re_quad(v):
    out = Q_ZERO
    for k in range(RANK):
        if v[k]:
            out = qadd(out, qscale(COS[k], v[k]))
    return out


def im_quad(v):
    out = Q_ZERO
    for k in range(RANK):
        if v[k]:
            out = qadd(out, qscale(SIN[k], v[k]))
    return out


# ---------------- certified sign ----------------
P_START, P_MAX = 32, 8192
_SQ_CACHE = {}


def _sqrt_bounds(m, p):
    """Rational lo <= sqrt(m) <= hi with hi - lo = 2^-p, via integer isqrt only."""
    key = (m, p)
    if key not in _SQ_CACHE:
        n = isqrt(m << (2 * p))            # n^2 <= m*4^p < (n+1)^2
        _SQ_CACHE[key] = (Fraction(n, 1 << p), Fraction(n + 1, 1 << p))
    return _SQ_CACHE[key]


class SignStats:
    def __init__(self):
        self.calls = 0
        self.zeros = 0
        self.hist = Counter()
        self.max_p = 0

    def record(self, p, zero=False):
        self.calls += 1
        if zero:
            self.zeros += 1
        else:
            self.hist[p] += 1
            self.max_p = max(self.max_p, p)

    def merge(self, other):
        self.calls += other.calls
        self.zeros += other.zeros
        self.hist.update(other.hist)
        self.max_p = max(self.max_p, other.max_p)


def qsign(q, stats):
    """Certified sign of a + b*sqrt2 + c*sqrt3 + d*sqrt6. Exact, no float.

    q == 0 iff (a,b,c,d) == 0 ({1,sqrt2,sqrt3,sqrt6} is a Q-basis of Q(sqrt2,sqrt3)).
    Nonzero: interval evaluation at doubling precision; terminates because the value
    is a fixed nonzero real, hence bounded away from 0.
    """
    a, b, c, d = q
    if not (a or b or c or d):
        stats.record(0, zero=True)
        return 0
    p = P_START
    while p <= P_MAX:
        lo = hi = a
        for coef, m in ((b, 2), (c, 3), (d, 6)):
            if coef:
                l, h = _sqrt_bounds(m, p)
                if coef > 0:
                    lo, hi = lo + coef * l, hi + coef * h
                else:
                    lo, hi = lo + coef * h, hi + coef * l
        if lo > 0:
            stats.record(p)
            return 1
        if hi < 0:
            stats.record(p)
            return -1
        p *= 2
    raise RuntimeError("certified sign unresolved at p<=%d bits for quad %s" % (P_MAX, (q,)))


# ---------------- exact geometric predicates ----------------
def sign_re(v, stats):
    return qsign(re_quad(v), stats)


def sign_im(v, stats):
    return qsign(im_quad(v), stats)


def cross_sign(u, w, stats):
    """sign of u x w = Im(conj(u) * w), certified."""
    return sign_im(zmul(zconj(u), w), stats)


def dot_sign(u, w, stats):
    """sign of u . w = Re(conj(u) * w), certified."""
    return sign_re(zmul(zconj(u), w), stats)


def orient(a, b, c, stats):
    """Certified CCW predicate: sign of (b-a) x (c-a)."""
    return cross_sign(zsub(b, a), zsub(c, a), stats)


def on_seg(a, b, c, stats):
    """PRECONDITION: a, b, c collinear. True iff c lies on the CLOSED segment [a, b],
    i.e. (a-c).(b-c) <= 0."""
    return dot_sign(zsub(a, c), zsub(b, c), stats) <= 0


def segments_disjoint(p, q, r, s, stats):
    """True iff closed segments [p,q] and [r,s] have EMPTY intersection. Complete
    predicate: proper crossing, or an endpoint of one on the other (this covers all
    collinear-overlap and touch cases)."""
    d1 = orient(r, s, p, stats)
    d2 = orient(r, s, q, stats)
    d3 = orient(p, q, r, stats)
    d4 = orient(p, q, s, stats)
    if d1 * d2 < 0 and d3 * d4 < 0:
        return False
    if d1 == 0 and on_seg(r, s, p, stats):
        return False
    if d2 == 0 and on_seg(r, s, q, stats):
        return False
    if d3 == 0 and on_seg(p, q, r, stats):
        return False
    if d4 == 0 and on_seg(p, q, s, stats):
        return False
    return True


def certify_face_simple(verts, stats):
    """Certify that the closed polygon verts[0..n-1] is simple.
    Returns (issues, n_nonadj_pairs, n_straight_corners)."""
    n = len(verts)
    issues = []
    for i in range(n):
        for j in range(i + 1, n):
            if zsub(verts[i], verts[j]) == ZERO:
                issues.append("vertices %d and %d coincide" % (i, j))
    straight = 0
    for i in range(n):
        A, B, C = verts[i - 1], verts[i], verts[(i + 1) % n]
        if orient(A, B, C, stats) == 0:
            # collinear corner: edges overlap iff A and C are on the same side of B
            if dot_sign(zsub(A, B), zsub(C, B), stats) > 0:
                issues.append("adjacent edges fold back at vertex %d" % i)
            else:
                straight += 1  # 180-degree corner: degenerate but still simple
    pairs = 0
    for i in range(n):
        for j in range(i + 1, n):
            if j == i + 1 or (i == 0 and j == n - 1):
                continue  # adjacent (handled above)
            pairs += 1
            if not segments_disjoint(verts[i], verts[(i + 1) % n],
                                     verts[j], verts[(j + 1) % n], stats):
                issues.append("non-adjacent edges (%d,%d) and (%d,%d) intersect"
                              % (i, (i + 1) % n, j, (j + 1) % n))
    return issues, pairs, straight


# ---------------- exact lattice membership ----------------
def make_in_lattice(T1, T2):
    """Exact membership in Z*T1 + Z*T2 (T1, T2 integer 8-tuples): rational solve of a
    nonsingular 2x2 row subsystem, then integrality + all-8-coordinate check."""
    pivot = None
    for i in range(RANK):
        for j in range(i + 1, RANK):
            det = T1[i] * T2[j] - T1[j] * T2[i]
            if det:
                pivot = (i, j, det)
                break
        if pivot:
            break
    assert pivot is not None, "period lattice rank < 2"
    pi_, pj_, det = pivot

    def in_lattice(v):
        mn = v[pi_] * T2[pj_] - v[pj_] * T2[pi_]
        nn = T1[pi_] * v[pj_] - T1[pj_] * v[pi_]
        if mn % det or nn % det:
            return False
        m, n = mn // det, nn // det
        return all(m * T1[k] + n * T2[k] == v[k] for k in range(RANK))

    assert in_lattice(ZERO) and in_lattice(T1) and in_lattice(T2) \
        and in_lattice(zsub(T1, T2))
    return in_lattice


# ---------------- face tracing (strict, exact; as in the prior harness) ----------------
def trace_all_faces(tab, rneig, cls, glue, placed):
    D = tab.D
    UNITS, CTILE, CL = tab.CLASS_UNITS, tab.CLASS_TILE, tab.CLASS_L
    faces = {}
    for key, pos in placed.items():
        h, d = key // D, key % D
        verts, corner_cls = [], []
        cur_h, cur_d, cur_pos = h, d, pos
        closed = False
        for _ in range(2 * tab.MAXL + 8):
            verts.append(cur_pos)
            g = glue[cur_h]
            npos = zadd(cur_pos, ZK[cur_d % D])   # edge vector is exactly zeta^d
            nh = rneig[g]
            corner_cls.append(cls[nh])
            nd = ((cur_d + D // 2) + UNITS[cls[nh]]) % D
            cur_h, cur_d, cur_pos = nh, nd, npos
            if cur_h == h and cur_d == d and cur_pos == pos:
                closed = True
                break
        if not closed:
            raise RuntimeError("face walk did not close at stub %d" % h)
        tiles = set(CTILE[c] for c in corner_cls)
        assert len(tiles) == 1, "face crosses tile species"
        t = tiles.pop()
        assert len(verts) == CL[[c for c in range(len(CTILE)) if CTILE[c] == t][0]], \
            "face length %d != CLASS_L for tile %d" % (len(verts), t)
        fkey = (t, frozenset(verts))
        if fkey not in faces:
            faces[fkey] = (verts, t)
    return list(faces.values())


def species_name(tab, t):
    CTILE, CL, CP, UNITS = tab.CLASS_TILE, tab.CLASS_L, tab.CLASS_P, tab.CLASS_UNITS
    for c in range(len(CTILE)):
        if CTILE[c] == t:
            L, Pn = CL[c], CP[c]
            if Pn == 1:
                return "{%d}" % L
            us = sorted(UNITS[c2] for c2 in range(len(CTILE)) if CTILE[c2] == t)
            return "%d*{p%d/d%d}" % (L // 2, us[0], us[1])
    return "?%d" % t


# ---------------- per-candidate verification ----------------
def verify(name, vertype, conway, tab, report, expected_F=None):
    P = lambda *a: report.append(" ".join(str(x) for x in a))
    stats = SignStats()
    ok_all = True
    P("=" * 100)
    P("CANDIDATE %s: %s" % (name, vertype))
    P("conway: %s" % conway)

    rneig, lneig, mirro, cls, glue = rc.decode(tab, vertype, conway)
    placed, T1, T2 = rc.develop(tab, rneig, cls, glue, sign=1)
    P("[lattice] T1=%s  T2=%s" % (T1, T2))

    in_lattice = make_in_lattice(T1, T2)
    lam_eq = lambda p, q: in_lattice(zsub(p, q))

    faces = trace_all_faces(tab, rneig, cls, glue, placed)

    # cell faces: dedup developed instances modulo Lambda, all decisions exact
    classes = {}
    for verts, t in faces:
        lm = min(verts)
        rel = tuple(sorted(zsub(v, lm) for v in verts))
        lst = classes.setdefault((t, rel), [])
        if not any(lam_eq(lm, lm2) for lm2 in lst):
            lst.append(lm)
    cell_faces = []
    for verts, t in faces:
        lm = min(verts)
        rel = tuple(sorted(zsub(v, lm) for v in verts))
        if lm in classes[(t, rel)]:
            cell_faces.append((verts, t))
            classes[(t, rel)].remove(lm)   # keep exactly one instance per class
    Fcnt = len(cell_faces)
    fspec = Counter(species_name(tab, t) for _, t in cell_faces)
    P("[cell] F = %d faces / cell: %s%s" % (Fcnt, dict(fspec),
      "" if expected_F is None else
      ("   (matches prior report)" if Fcnt == expected_F else
       "   MISMATCH vs prior report F=%d" % expected_F)))
    if expected_F is not None and Fcnt != expected_F:
        ok_all = False

    # ---- (2) certified face orientation signs + area identity with certified signs ----
    two_area_sum = Q_ZERO
    sigs = []
    for verts, t in cell_faces:
        s = ZERO
        n = len(verts)
        for i in range(n):
            s = zadd(s, zmul(zconj(verts[i]), verts[(i + 1) % n]))
        q2A = im_quad(s)                     # exact signed 2*Area of the face
        sigs.append(qsign(q2A, stats))
        two_area_sum = qadd(two_area_sum, q2A)
    orient_ok = all(sg == sigs[0] and sg != 0 for sg in sigs)
    sigma = sigs[0] if sigs else 0
    P("[orient-EXACT] all %d faces certified nonzero signed area with common sign %+d (%s): %s"
      % (Fcnt, sigma, "CCW" if sigma > 0 else "CW", "PASS" if orient_ok else "FAIL"))
    ok_all &= orient_ok

    det_q = im_quad(zmul(zconj(T1), T2))     # exact det of the period basis
    delta = qsign(det_q, stats)
    assert delta != 0, "degenerate period lattice"
    area_ok = qscale(two_area_sum, sigma) == qscale(det_q, 2 * delta)
    P("[area-EXACT-signed] sigma*sum(2A_f) == 2*delta*det in Q(sqrt2,sqrt3), "
      "both signs certified: %s" % ("PASS" if area_ok else "FAIL"))
    ok_all &= area_ok

    # ---- (1) certified face simplicity ----
    simp_ok = True
    tot_pairs = tot_straight = 0
    for idx, (verts, t) in enumerate(cell_faces):
        issues, pairs, straight = certify_face_simple(verts, stats)
        tot_pairs += pairs
        tot_straight += straight
        if issues:
            simp_ok = False
            for msg in issues:
                P("    face %d (%s): %s" % (idx, species_name(tab, t), msg))
    P("[simplicity-EXACT] %d faces; %d non-adjacent edge pairs certified disjoint; "
      "distinct-vertex + adjacent-edge checks pass; straight corners: %d: %s"
      % (Fcnt, tot_pairs, tot_straight, "PASS" if simp_ok else "FAIL"))
    ok_all &= simp_ok

    P("[precision] certified sign calls: %d (exact zeros: %d), interval bits used: %s, max p = %d"
      % (stats.calls, stats.zeros, dict(sorted(stats.hist.items())),
         stats.max_p if stats.hist else 0))
    P("VERDICT %s: %s" % (name, "PASS (all checks certified exact)" if ok_all else "FAIL"))
    P("")
    return ok_all, stats


# ---------------- self-tests ----------------
def selftest(report):
    P = lambda *a: report.append(" ".join(str(x) for x in a))
    st = SignStats()
    rng = random.Random(20260711)

    # ring: zeta^8 - zeta^4 + 1 == 0 exactly, as tuples
    assert ZK[8] == zsub(ZK[4], ONE)
    # ring ops vs float (cross-check of exact machinery, not a decision)
    for _ in range(200):
        a = tuple(rng.randint(-3, 3) for _ in range(RANK))
        b = tuple(rng.randint(-3, 3) for _ in range(RANK))
        fa, fb = zfloat(a), zfloat(b)
        assert abs(zfloat(zmul(a, b)) - fa * fb) < 1e-9
        assert abs(zfloat(zconj(a)) - fa.conjugate()) < 1e-9

    # quad tables vs float
    for k in range(RANK):
        assert abs(qfloat(COS[k]) - math.cos(k * math.pi / 12)) < 1e-14
        assert abs(qfloat(SIN[k]) - math.sin(k * math.pi / 12)) < 1e-14

    # known identities, exact
    assert qsign(qsub(COS[1], COS[2]), st) == 1        # cos(pi/12) > cos(pi/6)
    assert qsign(qsub(SIN[1], SIN[2]), st) == -1       # sin(pi/12) < sin(pi/6)
    assert qsign((F0, F1, F1, -F1), st) == 1           # sqrt2 + sqrt3 - sqrt6 > 0
    assert re_quad(ZK[6]) == Q_ZERO                    # Re(i) = 0, algebraic zero test
    assert im_quad(ZK[6]) == (F1, F0, F0, F0)          # Im(i) = 1
    assert qsub(qscale(COS[1], 4), (F0, F1, F0, F1)) == Q_ZERO   # 4cos(pi/12)=sqrt2+sqrt6

    # randomized: certified Re/Im sign vs float sign (200 elements)
    for _ in range(200):
        v = tuple(rng.randint(-5, 5) for _ in range(RANK))
        fv = zfloat(v)
        if abs(fv.real) > 1e-6:
            assert qsign(re_quad(v), st) == (1 if fv.real > 0 else -1)
        if abs(fv.imag) > 1e-6:
            assert qsign(im_quad(v), st) == (1 if fv.imag > 0 else -1)

    # randomized: certified cross/dot sign vs float (200 pairs); exact-zero paths
    for _ in range(200):
        u = tuple(rng.randint(-5, 5) for _ in range(RANK))
        w = tuple(rng.randint(-5, 5) for _ in range(RANK))
        fu, fw = zfloat(u), zfloat(w)
        cr = fu.real * fw.imag - fu.imag * fw.real
        dt = fu.real * fw.real + fu.imag * fw.imag
        if abs(cr) > 1e-6:
            assert cross_sign(u, w, st) == (1 if cr > 0 else -1)
        if abs(dt) > 1e-6:
            assert dot_sign(u, w, st) == (1 if dt > 0 else -1)
        assert im_quad(zmul(u, zconj(u))) == Q_ZERO    # Im(|u|^2) = 0 exactly
        assert cross_sign(u, u, st) == 0               # u x u = 0 exactly

    # precision stress: Pell convergents give tiny nonzero values with KNOWN sign
    # sign(q*sqrt2 - p) = sign(2q^2 - p^2)  (denominator q*sqrt2 + p > 0)
    max_p_seen = 0
    p_, q_ = 1, 1
    for _ in range(40):
        p_, q_ = p_ + 2 * q_, p_ + q_
        want = 1 if 2 * q_ * q_ - p_ * p_ > 0 else -1
        s1 = SignStats()
        assert qsign((Fraction(-p_), Fraction(q_), F0, F0), s1) == want
        max_p_seen = max(max_p_seen, s1.max_p)
        st.merge(s1)
    x_, y_ = 2, 1
    for _ in range(30):
        x_, y_ = 2 * x_ + 3 * y_, x_ + 2 * y_       # x^2 - 3y^2 = 1
        s1 = SignStats()
        assert qsign((Fraction(-x_), F0, Fraction(y_), F0), s1) == -1
        max_p_seen = max(max_p_seen, s1.max_p)
        st.merge(s1)
    x_, y_ = 5, 2
    for _ in range(25):
        x_, y_ = 5 * x_ + 12 * y_, 2 * x_ + 5 * y_  # x^2 - 6y^2 = 1
        s1 = SignStats()
        assert qsign((Fraction(-x_), F0, F0, Fraction(y_)), s1) == -1
        max_p_seen = max(max_p_seen, s1.max_p)
        st.merge(s1)

    # segment predicate: known configurations (coordinates in the ring)
    O, U, I = ZERO, ONE, ZK[6]
    two_u, three_u = zscale(ONE, 2), zscale(ONE, 3)
    one_pi, one_mi = zadd(ONE, I), zsub(ONE, I)
    assert not segments_disjoint(O, two_u, one_mi, one_pi, st)   # proper crossing at 1
    assert not segments_disjoint(O, U, U, one_pi, st)            # endpoint touch at 1
    assert not segments_disjoint(O, two_u, U, one_pi, st)        # T-touch: 1 interior to [0,2]
    assert not segments_disjoint(O, two_u, U, three_u, st)       # collinear overlap [1,2]
    assert segments_disjoint(O, U, two_u, three_u, st)           # collinear disjoint
    assert segments_disjoint(O, U, I, one_pi, st)                # parallel disjoint

    # face simplicity: unit square simple, bowtie not
    square = [O, U, one_pi, I]
    issues, pairs, straight = certify_face_simple(square, st)
    assert not issues and pairs == 2 and straight == 0
    bowtie = [O, U, I, one_pi]
    issues, _, _ = certify_face_simple(bowtie, st)
    assert issues, "bowtie must be flagged non-simple"

    P("[selftest] ring identities, quad tables, 200-element randomized float cross-checks")
    P("[selftest] (Re/Im, cross, dot), exact-zero paths, 95 Pell-convergent precision")
    P("[selftest] stress cases (max interval bits needed: %d), segment predicates," % max_p_seen)
    P("[selftest] square/bowtie simplicity: ALL PASS  (%d certified sign calls)" % st.calls)
    P("")
    return st


# ---------------- a=3 tables ----------------
def resolve_a3_tab(main_tab, report):
    if A3_VERTYPE.split(", ")[0] in main_tab.SYMBOLS:
        return main_tab
    d = os.environ.get("CTRNACT_A3_TABLES") or tempfile.mkdtemp(prefix="a3-tables-")
    tp = os.path.join(d, "tables.py")
    if not os.path.exists(tp):
        gen = os.path.join(ORACLE, "alphabets", "gen_alphabet.py")
        subprocess.run([sys.executable, gen, "--palette", A3_PALETTE, "--out", d,
                        "--certify"], check=True, cwd=ORACLE,
                       stdout=subprocess.DEVNULL)
        report.append("[a3-tables] generated from %s -> %s (gen_alphabet.py --certify)"
                      % (os.path.basename(A3_PALETTE), d))
    else:
        report.append("[a3-tables] loaded cached tables from %s" % d)
    return rc.load_tables(d)


# ---------------- driver ----------------
def main():
    report = []
    P = report.append
    P("Exact (zero-float) sign certification: face simplicity + face orientation")
    P("Harness: verify_star_extras_exact.py   Date: 2026-07-11")
    P("Companion to verify_star_extras.py (cone angles, Euler/2-sided edges, ring-element")
    P("area identity, symmetry/k: already exact there; simplicity and orientation were")
    P("float there and are certified exact here; the area identity is re-proved here")
    P("with certified signs on both sides).")
    P("")

    total = SignStats()
    total.merge(selftest(report))

    tab_main = rc.load_tables(os.path.join(ORACLE, "tables", "star24"))
    extras = os.path.join(ORACLE, "run-star-k2b6", "extras4.txt")
    blocks = list(rc.read_blocks(extras))
    assert len(blocks) == 4, "expected 4 blocks in extras4.txt, got %d" % len(blocks)
    expected_F = {"E1": 9, "E2": 12, "E3": 6, "E4": 6}   # from verify_report.txt

    all_ok = True
    for name, (vertype, conway) in zip(["E1", "E2", "E3", "E4"], blocks):
        ok, st = verify(name, vertype, conway, tab_main, report, expected_F[name])
        all_ok &= ok
        total.merge(st)

    a3_blocks = [(v, c) for v, c in rc.read_blocks(A3_PRUNED) if v == A3_VERTYPE]
    assert a3_blocks, "a=3 sibling block not found in %s" % A3_PRUNED
    tab_a3 = resolve_a3_tab(tab_main, report)
    ok, st = verify("A3", a3_blocks[0][0], a3_blocks[0][1], tab_a3, report)
    all_ok &= ok
    total.merge(st)

    P("=" * 100)
    P("GLOBAL: %d certified sign evaluations (%d exact zeros); max interval precision"
      % (total.calls, total.zeros))
    P("needed anywhere (including the selftest precision stress): %d bits." % total.max_p)
    P("Overall: %s" % ("ALL CANDIDATES PASS" if all_ok else "AT LEAST ONE FAILURE"))

    out = os.path.join(SCRIPT_DIR, "exact_sign_report.txt")
    with open(out, "w") as f:
        f.write("\n".join(report) + "\n")
    print("\n".join(report))
    print("\nwrote %s" % out, file=sys.stderr)
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
