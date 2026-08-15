#!/usr/bin/env python3
"""Decide which PERIOD-QUOTIENT solutions are real families, and with how many free parameters.

The quotient alphabet (gen_alphabet.quotient_period) drops the grid angle word, so its corner classes are
(shape, position) with UNKNOWN angles. That makes the dual search a relaxation: it returns every
combinatorial type whose vertices *could* close, and something downstream has to ask whether one angle
assignment closes them ALL at once. That question is a small linear program:

    variables   one per (shape, position) — the angle of that corner, in D-units
    per SHAPE   its p angles sum to S = (D/2)·p − D/n, the polygon-closure identity (n = L/p)
    per VERTEX  the angles meeting there sum to a full turn, D
    bounds      0 < a < D/2 for a convex corner (the concave extension relaxes the upper bound)

Feasible ⟹ a real family; the solution set's DIMENSION is its parameter count P, which is the same
number `export_period_families.flex_model` computes as the null space of the homogeneous rows. Infeasible
⟹ the relaxation's surplus, discarded.

Exact arithmetic throughout (Fraction). A family is an OPEN polytope, so feasibility means the relative
interior is non-empty, not merely that a vertex exists — checked by finding a particular solution and
then a strictly interior point of the null space.

Usage:  python3 quotient_feasible.py <pruned-dir> [--D 24] [--max-angle 12]
"""
import argparse, glob, os, re, sys
from fractions import Fraction

SHAPE = re.compile(r"^(e(\d+))-(\d+)('?)@(\d+)$")


def read_blocks(path, ks=(1, 2, 3, 4)):
    out = []
    for k in ks:
        for f in sorted(glob.glob(os.path.join(path, f"eupruned_{k:02d}_*.txt"))):
            L = [l.rstrip("\n") for l in open(f)]
            i = 0
            while i < len(L):
                if L[i].startswith("(") and i + 4 < len(L) and L[i + 2].startswith("Count type"):
                    out.append((k, L[i], L[i + 4]))
                    i += 5
                else:
                    i += 1
    return out


def vertex_words(vt):
    return [tuple(x.strip() for x in g.split(",")) for g in re.findall(r"\(([^)]*)\)", vt)]


def shape_sum(p, L, D):
    """One period's angle sum, in D-units: S = (D/2)·p − D/n with n = L/p."""
    n = L // p
    assert L % p == 0 and D % n == 0, (p, L, D)
    return Fraction((D // 2) * p - D // n)


def rref(rows, ncol):
    """Reduced row echelon form over ℚ. Returns (rows, pivot columns)."""
    rows = [r[:] for r in rows]
    piv, r = [], 0
    for c in range(ncol):
        sel = next((i for i in range(r, len(rows)) if rows[i][c] != 0), None)
        if sel is None:
            continue
        rows[r], rows[sel] = rows[sel], rows[r]
        inv = Fraction(1) / rows[r][c]
        rows[r] = [x * inv for x in rows[r]]
        for i in range(len(rows)):
            if i != r and rows[i][c] != 0:
                f = rows[i][c]
                rows[i] = [a - f * b for a, b in zip(rows[i], rows[r])]
        piv.append(c)
        r += 1
        if r == len(rows):
            break
    return rows, piv


def fm_feasible(ineqs, P, cap=200000):
    """Is {t : a·t < c for every (a, c)} non-empty? Exact Fourier–Motzkin, strict throughout.

    P is 0..3 here and the system has ~2·(corner count) rows, so the classic FM blow-up never arrives;
    `cap` is a tripwire rather than a policy, and it fails LOUD instead of returning a wrong answer.
    """
    rows = [(list(a), c) for a, c in ineqs]
    for k in range(P - 1, -1, -1):
        pos = [(a, c) for a, c in rows if a[k] > 0]
        neg = [(a, c) for a, c in rows if a[k] < 0]
        zero = [(a[:k] + a[k + 1:], c) for a, c in rows if a[k] == 0]
        out = list(zero)
        for ap, cp in pos:
            for an, cn in neg:
                s, t = ap[k], -an[k]
                a = [t * x + s * y for x, y in zip(ap[:k] + ap[k + 1:], an[:k] + an[k + 1:])]
                out.append((a, t * cp + s * cn))
        if len(out) > cap:
            raise RuntimeError(f"Fourier–Motzkin blew past {cap} rows eliminating parameter {k}")
        rows = out
    return all(c > 0 for _, c in rows)


def build_system(vt, D):
    """(var, shapes, rows, rigid_angles) — the angle system of one quotient block.

    Extracted 2026-08-09 so the exporter's seed search solves the SAME system `analyse` decides, instead
    of a second hand-copied build of it. `rigid_angles` is the multiset of fixed corner angles the regular
    tiles contribute, in D-units — the seed search needs them because a period corner landing exactly on
    one is a coincidence like any other.
    """
    words = vertex_words(vt)
    var = {}          # (shape, pos) -> column
    shapes = {}       # shape -> (p, L)
    rigid_angles = set()
    for w in words:
        for tok in w:
            m = SHAPE.match(tok)
            if not m:
                rigid_angles.add(Fraction(D, 2) - Fraction(D, int(tok)))
                continue
            # ⚑ the key MUST carry L. Using only the period conflated e3-9 with e3-6, whose closure
            # sums differ (28 vs 24 units), and the merged system reported impossible types as families.
            sh = f"{m.group(1)}-{m.group(3)}{m.group(4)}"      # e3-6, e3-9, e3-6'
            p, L, pos = int(m.group(2)), int(m.group(3)), int(m.group(5))
            shapes[sh] = (p, L)
            var.setdefault((sh, pos), len(var))
    for sh, (p, L) in shapes.items():             # every corner of a used shape is a variable
        for pos in range(p):
            var.setdefault((sh, pos), len(var))
    if not var:
        return var, shapes, None, rigid_angles
    N = len(var)
    rows = []
    for sh, (p, L) in sorted(shapes.items()):     # polygon closure
        row = [Fraction(0)] * (N + 1)
        for pos in range(p):
            row[var[(sh, pos)]] += 1
        row[N] = shape_sum(p, L, D)
        rows.append(row)
    for w in words:                               # vertex closure
        row = [Fraction(0)] * (N + 1)
        rigid = Fraction(0)
        for tok in w:
            m = SHAPE.match(tok)
            if m:
                row[var[(f"{m.group(1)}-{m.group(3)}{m.group(4)}", int(m.group(5)))]] += 1
            else:
                n = int(tok)
                rigid += Fraction(D, 2) - Fraction(D, n)
        row[N] = Fraction(D) - rigid
        rows.append(row)
    return var, shapes, rows, rigid_angles


def analyse(vt, D, ub):
    """(status, P) — 'infeasible' | 'pinned' | 'family', and the free-parameter count."""
    var, shapes, rows, _ = build_system(vt, D)
    if not var:
        return "no-period", 0
    N = len(var)
    R, piv = rref(rows, N)
    for r in R:                                   # 0 = nonzero ⇒ inconsistent
        if all(x == 0 for x in r[:N]) and r[N] != 0:
            return "infeasible", 0
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
    # Strict feasibility of {0 < part + Σ t_j·b_j < ub} by exact Fourier–Motzkin on the free parameters.
    # A nudge heuristic is not enough and was wrong here: the particular solution sets every free variable
    # to 0, which for a two-corner vertex puts one angle at its whole 300° budget and the other at 0, and
    # the interior point needs a step of 10 units, not a fraction of one.
    ineqs = []          # each (coeffs over free params, rhs) meaning coeffs·t < rhs
    for i in range(N):
        ineqs.append(([-b[i] for b in basis], part[i]))          # 0 < x_i
        ineqs.append(([b[i] for b in basis], ub - part[i]))      # x_i < ub
    if not fm_feasible(ineqs, len(basis)):
        return "infeasible", len(basis)
    return ("family" if basis else "pinned"), len(basis)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pruned")
    ap.add_argument("--D", type=int, default=24)
    ap.add_argument("--max-angle", type=float, default=None,
                    help="upper bound per corner in D-units (default D/2 = convex; raise for concave)")
    args = ap.parse_args()
    ub = Fraction(args.max_angle) if args.max_angle else Fraction(args.D, 2)
    blocks = read_blocks(args.pruned)
    from collections import Counter
    tally, byP = Counter(), Counter()
    fams = []
    for k, vt, cw in blocks:
        st, P = analyse(vt, args.D, ub)
        tally[st] += 1
        if st == "family":
            byP[P] += 1
            fams.append((k, P, vt))
        elif st == "pinned":
            fams.append((k, 0, vt))
    print(f"{len(blocks)} quotient blocks in {args.pruned}")
    for s, n in tally.most_common():
        print(f"  {s:<12} {n:>6}")
    if byP:
        print("  families by free-parameter count P: " + ", ".join(f"P={p}: {n}" for p, n in sorted(byP.items())))
    print(f"\nREAL (feasible) blocks: {tally['family'] + tally['pinned']} of {len(blocks)}")


if __name__ == "__main__":
    main()
