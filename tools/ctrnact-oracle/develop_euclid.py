#!/usr/bin/env python3
"""Realize a Čtrnáct map as a polyhedron in R³ by solving for DIHEDRAL ANGLES.

This is develop_spherical.py with one assumption removed, and the assumption is the important part.

    develop_spherical realizes a map by SO(3) flood-fill on S² with a SINGLE edge arc rho. Everything
    it can express therefore has regular faces, equal edges AND a circumsphere. At k = 1 that costs
    nothing, because vertex-transitive forces a circumsphere: the symmetry group fixes the vertex
    centroid, so every vertex is the same distance from it, and every uniform polyhedron is inscribed.
    At k >= 2 it is a strict subclass. J58, the augmented dodecahedron, has regular faces and two
    vertex orbits and no circumsphere at all (edge 1: its dodecahedral vertices sit at 1.4013 from the
    centre, the pyramid apex at 1.6392), and nothing in the spherical pipeline can express it.

WHAT REPLACES rho. The link of a vertex is a spherical polygon whose SIDES are the face angles and
whose INTERIOR ANGLES are the dihedral angles. Faces are regular, so every side length is known before
the search starts: a {n/d} contributes (n - 2d)*pi/n at each of its corners. The dihedrals are the
unknowns, one per EDGE ORBIT of the quotient, and the equation is that every vertex orbit's link
closes. Walking a link, moving along a side by alpha and turning by the exterior angle pi - theta:

    prod over the vertex cycle of [ Rz(alpha_i) . Rx(pi - theta_i) ]  ==  I                    (*)

checked against six solids whose dihedral angles are published (tetrahedron 70.5288, cube 90,
octahedron 109.4712, dodecahedron 116.5651, icosahedron 138.1897, cuboctahedron 125.2644): residual
below 1e-15 in every case.

The spherical developer is the special case of (*) where one rho closes every link at once, so this
developer strictly contains it.

ONE LEVER FALLS OUT, and it is derived rather than supplied: at a VALENCE-3 vertex the link is a
spherical triangle with three prescribed sides, so its angles are DETERMINED by the spherical law of
cosines. Every dihedral at such a vertex is forced, with no search, and forcing propagates along
shared edges. That is the analogue of rho being forced by a single closure equation, and it is why
this is root-finding on a handful of unknowns instead of a mesh optimisation.

Two stages, exactly as develop_spherical has two: solve the angles, then flood-fill to coordinates and
certify. Closure (*) is local to a vertex; a map can satisfy it at every vertex and still fail to
close globally, which is what the flood-fill catches.

Usage:  python3 develop_euclid.py --pruned <dir> --kmin 1 --kmax 2 --out <cells.json>
        python3 develop_euclid.py --selftest
"""
import argparse, array, itertools, json, math, os, struct, sys, time

import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
import develop_spherical as ds          # palette install, pruner decode, block IO

TOL = 1e-9


# ----------------------------------------------------------------------------- frame algebra
def Rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def Rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]])


def planar_angle(nd, retro=False):
    """Interior angle AT ONE CORNER. A RETROGRADE face is traversed backwards, so the angle the solid
    actually turns through there is the reflex one; same convention the Euclidean hollow palettes pin
    (alphabets/gen_alphabet.py, starpoly reflex lift).

    ⚑ Read off the corner, not computed from (n, d). The old body was (n - 2d)*pi/n, which is right
    only when every corner of the tile is alike — false for an ISOTOXAL star n*a, whose point and dent
    share n, d and tile and differ by up to 200 degrees. install_palette now carries the alphabet's own
    CLASS_UNITS as a third element, and it agrees with the old formula on every class of every regular
    and starpoly palette, so this is a generalization and not a change. The 2-element fallback keeps
    callers that build an (n, d) pair by hand working."""
    a = (2 * math.pi * nd[2] / ds.PALETTE_D) if len(nd) > 2 else \
        (lambda n, d: (n - 2 * d) * math.pi / n)(*ds._nd(nd))
    return (2 * math.pi - a) if retro else a


# ----------------------------------------------------------------------------- map combinatorics
def cycles_of(perm):
    """Cycles of a permutation given as a list, as lists of elements."""
    seen, out = set(), []
    for s in range(len(perm)):
        if s in seen:
            continue
        cyc, x = [], s
        while x not in seen:
            seen.add(x)
            cyc.append(x)
            x = perm[x]
        out.append(cyc)
    return out


def edge_ids(glue):
    """Edge orbit id per dart. glue is the half-edge involution, so an edge is {h, glue[h]}."""
    eid = [-1] * len(glue)
    n = 0
    for h in range(len(glue)):
        if eid[h] >= 0:
            continue
        eid[h] = eid[glue[h]] = n
        n += 1
    return eid, n


def _cyc_eq(a, b):
    """Equal up to rotation, in either direction. The header's vertex word and the quotient's dart
    cycle can disagree on orientation (the truncated cuboctahedron 8.6.4 reads one way round in the
    word and the other in the map), and that is a labelling difference, not a different vertex."""
    if len(a) != len(b):
        return False
    aa = list(a) + list(a)
    rb = list(reversed(b))
    return any(aa[i:i + len(b)] == list(b) or aa[i:i + len(b)] == rb for i in range(len(a)))


def unfold(cycles, lvert, configs, orbit):
    """The TRUE vertex cycles, which are not the quotient's cycles.

    A block is folded by the tiling's own symmetry, so a vertex of valence 5 whose figure has a 5-fold
    rotation shows up as a cycle of ONE dart: `(3,3,3,3,3)S5` decodes to a single dart with rneig[0]=0.
    Walking that cycle once turns through a fifth of the vertex, and the link only closes after five
    passes. The config is the unfolded figure and the cycle is what survived the quotient, so
    f = len(config) / len(cycle).

    WHICH config, though. This used to search every word in the block for one the cycle's face
    sequence tiles, and keep the smallest repeat count. That is a guess, and on an all-triangle
    alphabet every word tiles every other one: the 1-dart cycle of a (3,3,3,3,3)S5 vertex matched the
    OTHER orbit's (3,3,3,3) and came back f=4, so a valence-5 vertex was developed as a valence-4 one.
    The block for the pentagonal bipyramid J13 then closed as the octahedron and J13 was never emitted;
    (3,3,3)A + (3,3,3,3)S4 came back as the tetrahedron the same way. `orbit` is the dart -> vertex
    orbit map from decode_block, which is not a guess: darts are laid out one vertex at a time in the
    header's order. Returns [(dart sequence repeated f times, f)] per cycle."""
    out = []
    for c in cycles:
        w = configs[orbit[c[0]]]
        if len(w) % len(c):
            return None                      # the cycle does not divide its own vertex word
        f = len(w) // len(c)
        if not _cyc_eq([lvert[h] for h in c] * f, list(w)):
            return None
        out.append((c * f, f))
    return out


def structure(dec, retro=frozenset()):
    """(unfolded vertex cycles, edge id per dart, edge count, face angle per dart) for one block.

    The face paired with dart h is lvert[h]: sweeping from rneig^-1(h) to h crosses it, and the fold
    about edge(h) happens on arrival, so (face h, edge h) is the (side, turn) pair the link product
    wants. develop_spherical writes the same step as alpha(h) = lvert[rneig[h]] because it indexes the
    sweep by its STARTING dart; the sequence is identical, shifted by one."""
    rneig, glue, lvert = dec["rneig"], dec["glue"], dec["lvert"]
    eid, ne = edge_ids(glue)
    alpha = [planar_angle(lvert[h], ds._nd(lvert[h]) in retro) for h in range(len(lvert))]
    uf = unfold(cycles_of(rneig), lvert, dec["configs"], dec["orbit"])
    if uf is None:
        return None, eid, ne, alpha
    return [c for c, f in uf], eid, ne, alpha


# ----------------------------------------------------------------------------- closure (*)
def _factor(ca, sa, cb, sb):
    """Rz(alpha) . Rx(beta) written out, as a flat 9-tuple. One link step."""
    return (ca, -sa * cb, sa * sb,
            sa, ca * cb, -ca * sb,
            0.0, sb, cb)


def _mul(A, B):
    return (A[0] * B[0] + A[1] * B[3] + A[2] * B[6], A[0] * B[1] + A[1] * B[4] + A[2] * B[7],
            A[0] * B[2] + A[1] * B[5] + A[2] * B[8],
            A[3] * B[0] + A[4] * B[3] + A[5] * B[6], A[3] * B[1] + A[4] * B[4] + A[5] * B[7],
            A[3] * B[2] + A[4] * B[5] + A[5] * B[8],
            A[6] * B[0] + A[7] * B[3] + A[8] * B[6], A[6] * B[1] + A[7] * B[4] + A[8] * B[7],
            A[6] * B[2] + A[7] * B[5] + A[8] * B[8])


def link_product(csa, thetas):
    """The link product for one vertex, in plain floats. csa is [(cos a, sin a)] per side.

    Not numpy: these are 3x3 matrices and numpy's per-call overhead is larger than the arithmetic, so
    the root finder spends its whole life in dispatch. Explicit floats are ~20x faster here, which is
    the difference between a k=2 sweep in two minutes and one that does not finish."""
    M = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)
    for (ca, sa), th in zip(csa, thetas):
        b = math.pi - th
        M = _mul(M, _factor(ca, sa, math.cos(b), math.sin(b)))
    return M


def link_miss(csa, thetas):
    """Max |M - I| over the link product: 0 exactly when the vertex closes."""
    M = link_product(csa, thetas)
    return max(abs(M[0] - 1.0), abs(M[4] - 1.0), abs(M[8] - 1.0),
               abs(M[1] - M[3]), abs(M[2] - M[6]), abs(M[5] - M[7]))


def link_vec(csa, thetas):
    M = link_product(csa, thetas)
    return np.array([M[1] - M[3], M[2] - M[6], M[5] - M[7],
                     M[0] - 1.0, M[4] - 1.0, M[8] - 1.0])


# ----------------------------------------------------------------------------- the same link, batched
# WHY THIS EXISTS. A block that stalls propagation falls back to solve_joint, which runs a 3000-start
# multistart Newton PER BRANCH, and every Newton step evaluates the link product for every vertex. On a
# k=4 shard that is 11 million calls to _mul for ONE block, and 12 blocks out of 88 were 94% of the
# shard's 449 s. The arithmetic is trivial; the cost is Python dispatch, three million times over.
#
# The starts are independent, so they are one array, not a loop. Each candidate's link product is a
# chain of 3x3s and the chain is the same length for every candidate, so the whole multistart is a
# handful of matmuls per link and 3000 candidates cost barely more than one.
#
# ⚑ `b = pi - theta` is computed the long way ON PURPOSE, here and in _link_kernel. cos(pi - theta) is
# -cos(theta) in exact arithmetic and NOT bit-identical in floating point, and this path has to agree
# with the scalar link_vec it replaces to the last ulp, or a root sitting at the tolerance boundary is
# found by one and missed by the other. It does: measured at 2.2e-16 over random links. Matching the
# operations is cheaper than arguing about which answer is right.
#
# ⚑ ONE VERTEX AT A TIME, and batching the vertices together was tried and REVERTED. Stacking a block's
# five links into (V,3,3,nmax) buffers cuts the numpy call count fivefold, which is the right instinct
# for a dispatch-bound loop — and it measured 5.1 s against 3.9 s on an 88-block shard, because it also
# multiplies the working set by V. One vertex's buffers are about 3.5 MB and stay in L2 across the whole
# Newton run; five vertices' are 30 MB and do not. Dispatch was not the binding constraint. Cache was.
# How wide the candidate set has to be before writing the 3x3 product out by hand beats numpy's stacked
# matmul. The (3, 3, N) layout makes every matrix ENTRY a contiguous vector, so the product becomes nine
# fused multiply-accumulates over long arrays instead of N tiny 3x3 GEMMs: measured in isolation at
# N=3000, 103.6us for (N,3,3) `A @ B` against 31.7us written out. The advantage inverts for a narrow
# candidate set, where nine numpy calls cost more than one BLAS dispatch, and the tail of a Newton run is
# exactly that — three or four candidates limping to step 80.
#
# ⚑ The crossover in ISOLATION is a few hundred; in the real loop it is nearer a thousand, and the
# microbenchmark would have set this three times too low. Measured end to end on an 88-block shard, three
# runs each: 4.70s at 128, 4.57s at 512, 4.47s at 1024 and 1536, 4.50s at 2048, 4.57s at 2900 (always
# explicit), 4.90s with the explicit path off altogether. Cache pressure from the real buffers is the
# difference, which is the usual reason a kernel benchmark disagrees with the program it lives in.
_EXPLICIT_MIN = int(os.environ.get("EU_EXPLICIT_MIN", "1024"))


def _mm(A, B, C, n, T, kcols=(0, 1, 2), urows=(0, 1, 2)):
    """C = A B over the first n candidates, for (3, 3, nmax) stacks.

    `kcols` and `urows` restrict which result columns are computed and which inner index actually
    contributes — that is where the sparsity of these particular factors is spent. dG/dtheta has a zero
    first COLUMN, so P.dG needs only columns 1 and 2 (its column 0 is zero and is filled in by the
    caller), and anything left-multiplied by that product needs only u in {1, 2}. Nine multiply-adds
    become six."""
    if n >= _EXPLICIT_MIN:
        for i in range(3):
            for k in kcols:
                c = C[i, k, :n]
                first = True
                for u in urows:
                    if first:
                        np.multiply(A[i, u, :n], B[u, k, :n], out=c)
                        first = False
                    else:
                        np.multiply(A[i, u, :n], B[u, k, :n], out=T[:n])
                        c += T[:n]
    else:
        C[:, :, :n] = (A[:, :, :n].transpose(2, 0, 1) @ B[:, :, :n].transpose(2, 0, 1)).transpose(1, 2, 0)


def _link_kernel(csa, cols, nmax):
    """Prepare one vertex's link and return a closure that fills its residual and Jacobian rows.

    The link is a chain M = G_0 G_1 ... G_{L-1} with G_j = Rz(a_j) Rx(pi - theta_j), and the residual is
    six entries of M - I. Differentiating a chain in ONE slot needs nothing new:

        dM/dtheta_j  =  (G_0..G_{j-1}) . dG_j/dtheta_j . (G_{j+1}..G_{L-1})  =  P_j . D_j . S_j

    so with the prefixes and suffixes accumulated once — 2L matmuls — every column of the Jacobian is
    two more. About 4L matmuls for the whole thing, against the (nx+1)L a forward-difference Jacobian
    costs, and nx is ten or eleven here: the chain was being walked twelve times per Newton step to
    learn what one walk already knows.

    Writing Rz(a)Rx(b) out, dG/dtheta = -dG/db is

        [ 0  -sa.sb  -sa.cb ]        against        [ ca  -sa.cb   sa.sb ]
        [ 0   ca.sb   ca.cb ]              G   =    [ sa   ca.cb  -ca.sb ]
        [ 0    -cb      sb  ]                       [ 0     sb      cb   ]

    and that zero first column is worth having: it makes two of the three derivative products two-thirds
    the work, and it means dM's own first column is zero for free at the end of the chain.

    WHY A CLOSURE. Everything above is fixed for the life of one solve_joint — the chain length, which
    slots are unknown, and the first column of every factor, which holds no theta at all. Only six
    entries per factor vary between Newton steps. The buffers are therefore allocated once, at the widest
    the candidate set will ever be, in the (3, 3, nmax) layout _mm wants, and every product writes
    through `out=`.

    ⚑ An unknown may occupy MORE THAN ONE slot of the same link, so the Jacobian columns accumulate with
    += and are not assigned. Getting that wrong would silently halve a derivative."""
    L = len(cols)
    G = [np.zeros((3, 3, nmax)) for _ in range(L)]
    for j, (src, cbc, sbc) in enumerate(cols):
        ca, sa = csa[j]
        G[j][0, 0] = ca                          # column 0 carries no theta: written once, never again
        G[j][1, 0] = sa
        if src < 0:                              # a fixed dihedral: the whole factor is constant
            G[j][0, 1] = -sa * cbc
            G[j][0, 2] = sa * sbc
            G[j][1, 1] = ca * cbc
            G[j][1, 2] = -ca * sbc
            G[j][2, 1] = sbc
            G[j][2, 2] = cbc
    Pb = [np.empty((3, 3, nmax)) for _ in range(L)]
    Sb = [np.empty((3, 3, nmax)) for _ in range(L)]
    Mb = np.empty((3, 3, nmax))
    Db = np.zeros((3, 3, nmax))                  # its first column stays zero for good
    T1 = np.empty((3, 3, nmax))
    T2 = np.empty((3, 3, nmax))
    T = np.empty(nmax)                           # scratch for one multiply-accumulate term
    live = [(j, src) for j, (src, _c, _s) in enumerate(cols) if src >= 0]

    def run(cb_all, sb_all, R, J, row, n):
        for j, src in live:
            ca, sa = csa[j]
            cb, sb = cb_all[src, :n], sb_all[src, :n]
            g = G[j]
            np.multiply(cb, -sa, out=g[0, 1, :n])
            np.multiply(sb, sa, out=g[0, 2, :n])
            np.multiply(cb, ca, out=g[1, 1, :n])
            np.multiply(sb, -ca, out=g[1, 2, :n])
            g[2, 1, :n] = sb
            g[2, 2, :n] = cb

        # P[j] = G_0..G_{j-1}, S[j] = G_{j+1}..G_{L-1}, with both ends left implicitly the identity —
        # P[0] and S[L-1] are never read and the multiplies that would have used them are skipped.
        P, S = list(Pb), list(Sb)
        if L > 1:
            P[1] = G[0]
            for j in range(2, L):
                _mm(P[j - 1], G[j - 1], Pb[j], n, T)
                P[j] = Pb[j]
            S[L - 2] = G[L - 1]
            for j in range(L - 3, -1, -1):
                _mm(G[j + 1], S[j + 1], Sb[j], n, T)
                S[j] = Sb[j]
            _mm(P[L - 1], G[L - 1], Mb, n, T)
            M = Mb
        else:
            M = G[0]

        R[:, row + 0] = M[0, 1, :n] - M[1, 0, :n]
        R[:, row + 1] = M[0, 2, :n] - M[2, 0, :n]
        R[:, row + 2] = M[1, 2, :n] - M[2, 1, :n]
        R[:, row + 3] = M[0, 0, :n] - 1.0
        R[:, row + 4] = M[1, 1, :n] - 1.0
        R[:, row + 5] = M[2, 2, :n] - 1.0

        for j, src in live:
            ca, sa = csa[j]
            cb, sb = cb_all[src, :n], sb_all[src, :n]
            np.multiply(sb, -sa, out=Db[0, 1, :n])
            np.multiply(cb, -sa, out=Db[0, 2, :n])
            np.multiply(sb, ca, out=Db[1, 1, :n])
            np.multiply(cb, ca, out=Db[1, 2, :n])
            np.negative(cb, out=Db[2, 1, :n])
            Db[2, 2, :n] = sb
            if L == 1:
                dM = Db
            elif j == 0:
                _mm(Db, S[0], T1, n, T, urows=(1, 2))       # Db's column 0 is zero: skip u = 0
                dM = T1
            elif j == L - 1:
                _mm(P[j], Db, T1, n, T, kcols=(1, 2))       # so is the product's, and it is needed
                T1[:, 0, :n] = 0.0
                dM = T1
            else:
                _mm(P[j], Db, T1, n, T, kcols=(1, 2))
                _mm(T1, S[j], T2, n, T, urows=(1, 2))       # T1's column 0 is zero: never read
                dM = T2
            J[:, row + 0, src] += dM[0, 1, :n] - dM[1, 0, :n]
            J[:, row + 1, src] += dM[0, 2, :n] - dM[2, 0, :n]
            J[:, row + 2, src] += dM[1, 2, :n] - dM[2, 1, :n]
            J[:, row + 3, src] += dM[0, 0, :n]
            J[:, row + 4, src] += dM[1, 1, :n]
            J[:, row + 5, src] += dM[2, 2, :n]

    return run


def _lstsq_batch(J, R):
    """The damped-Newton step for a whole batch: argmin |J x + R| for each (m, n) system, stacked.

    ⚑ NOT pinv. pinv is an SVD per system, and with 3000 candidates alive that was 42% of the whole
    profile — an enormous price for a 30x10 least-squares solve. The normal equations give the same
    answer whenever J has full column rank, which it does here: the system is overdetermined (six
    equations per vertex against ten or eleven unknowns overall) and a rank drop means a genuinely
    degenerate configuration, not a numerical accident.

    So: solve JᵀJ x = -Jᵀr, and fall back to pinv for the whole batch if LAPACK reports a singular
    matrix. The fallback is what keeps this from being a behaviour change — when the normal equations
    are valid they agree with pinv, and when they are not, pinv still runs."""
    # ⚑ matmul, not einsum. einsum builds its own loop nest and does not reach BLAS here; the same two
    # contractions written as stacked matmuls were 30% of the profile and became 4%.
    Jt = J.transpose(0, 2, 1)
    # ⚑ errstate, and it is NOT papering over a real overflow. Apple's Accelerate BLAS raises FP flags
    # from masked SIMD lanes, so a stacked matmul reports "divide by zero / overflow / invalid" on input
    # that cannot produce any of them: measured over a k=4 shard, 240 calls, every J finite and bounded
    # by 2, max|JᵀJ| = 17.35, zero non-finite results. The scalar path never saw this because it never
    # called BLAS. Clearing the flag register first does not help — Accelerate sets it inside the call.
    #
    # The suppression is narrow (these two contractions) and it is not the safety net: the non-finite
    # check below inspects the actual numbers, so a genuine blow-up is still caught and still falls back.
    with np.errstate(divide="ignore", over="ignore", invalid="ignore"):
        A = Jt @ J
        b = -(Jt @ R[..., None])[..., 0]
    # JᵀJ is symmetric POSITIVE DEFINITE wherever J has full column rank, so the LU factorisation
    # np.linalg.solve performs is twice the arithmetic needed. numpy stacks cholesky but not the
    # triangular solves, so those are written out — nx² vectorised passes over the candidate axis, which
    # beats LAPACK's per-matrix dispatch at every size this solver produces (measured at k=2000:
    # 475us/233us at nx=4, 1566/990 at nx=11, 4018/3310 at nx=22 — cholesky wins throughout).
    #
    # Positive definiteness is the assumption and the fallback is the check: cholesky raises on a batch
    # containing a non-PD matrix, and then this drops to solve, and then to pinv. Measured over an
    # 88-block k=4 shard, 1825 calls, it never had to.
    try:
        with np.errstate(divide="ignore", over="ignore", invalid="ignore"):
            L = np.linalg.cholesky(A)
        step = _chol_solve(L, b)
    except np.linalg.LinAlgError:
        try:
            # The trailing axis is not decoration: numpy 2 reads a stacked solve's (N, n) right-hand
            # side as ONE (m, n) matrix, not N vectors, and raises on the dimension mismatch.
            step = np.linalg.solve(A, b[..., None])[..., 0]
        except np.linalg.LinAlgError:
            return _pinv_step(J, R)

    # ⚑ WHERE THE NORMAL EQUATIONS ARE NOT ALLOWED TO STAND. JᵀJ squares the condition number, so a
    # rank-deficient Jacobian — a genuinely degenerate configuration, and they do occur — gives an
    # enormous or non-finite step where lstsq's minimum-norm solution stays small and sensible. The
    # trust radius does not save it either: a nan step has a nan norm, `sn > 0.5` is False, the cap
    # never fires, and the candidate walks off to nan instead of converging.
    #
    # That is a real behaviour change, not a rounding one, and it announced itself as overflow warnings
    # the scalar path never produced. So the fast path is kept for the candidates it is valid for and
    # the rest fall back to pinv, which is what they would have had all along.
    bad = ~np.isfinite(step).all(axis=1)
    if bad.any():
        step[bad] = _pinv_step(J[bad], R[bad])
    return step


def _chol_solve(L, b):
    """Solve L Lᵀ x = b for a stack of lower-triangular L. Forward then back substitution, written out
    because numpy stacks the factorisation but not the triangular solves."""
    n = L.shape[-1]
    y = np.empty_like(b)
    for i in range(n):
        acc = b[:, i].copy()
        for j in range(i):
            acc -= L[:, i, j] * y[:, j]
        y[:, i] = acc / L[:, i, i]
    x = np.empty_like(b)
    for i in range(n - 1, -1, -1):
        acc = y[:, i].copy()
        for j in range(i + 1, n):
            acc -= L[:, j, i] * x[:, j]
        x[:, i] = acc / L[:, i, i]
    return x


def _pinv_step(J, R):
    """The minimum-norm least-squares step, via SVD. Correct for a rank-deficient J and slow."""
    return -(np.linalg.pinv(J) @ R[..., None])[..., 0]


def _newton_batch(Fb, X0, tol, steps=80):
    """_newton, run on every start at once. Returns (X, ok) with ok true where a root was found.

    Step for step the same damped Gauss-Newton as the scalar version — same 0.999 improvement rule, same
    8-stall bail, same 0.5 trust radius, same final tolerance check — with each candidate's control flow
    carried in a mask instead of a return statement. Candidates drop out as they converge or stall, so
    only the survivors are ever evaluated.

    `Fb(X)` returns (residuals, JACOBIAN) together. The scalar version built its Jacobian by forward
    difference, which costs one extra residual evaluation per unknown, and these systems have ten or
    eleven — so twelve full link products per step where one will do. The link product is a chain of
    3x3s and its derivative in any one slot is prefix · dG · suffix, so all eleven columns come out of
    two extra passes over the chain. See _link_res_jac.

    The least-squares step is pinv rather than lstsq because pinv is the one numpy stacks. Both give the
    minimum-norm least-squares solution; on these systems (six equations, one to four unknowns, full
    rank away from a degeneracy) they agree, and the benchmark's record hashes are what checks that."""
    N, nx = X0.shape
    X = X0.copy()
    best = np.full(N, np.inf)
    stall = np.zeros(N, np.int32)
    ok = np.zeros(N, bool)
    live = np.ones(N, bool)
    for _ in range(steps):
        idx = np.nonzero(live)[0]
        if idx.size == 0:
            break
        Xi = X[idx]
        R, Jm = Fb(Xi)
        nrm = np.max(np.abs(R), axis=1)

        # A candidate that has run off to inf or nan is dead. The scalar version reached the same
        # verdict the slow way — nan fails `< tol`, then fails `< best*0.999`, so it stalls out over
        # eight more steps — and killing it here is the same answer without the eight steps, or the
        # overflow warnings its Jacobian throws on the way.
        gone = ~np.isfinite(nrm)
        if gone.any():
            live[idx[gone]] = False

        conv = np.logical_and(nrm < tol, ~gone)
        if conv.any():                       # converged: keep x as it stands, stop working on it
            ok[idx[conv]] = True
            live[idx[conv]] = False

        run = ~np.logical_or(conv, gone)
        if not run.any():
            continue
        j = idx[run]
        nr = nrm[run]
        better = nr < best[j] * 0.999
        best[j] = np.where(better, nr, best[j])
        stall[j] = np.where(better, 0, stall[j] + 1)
        dead = stall[j] >= 8
        if dead.any():                       # stalled: the scalar version returns None here
            live[j[dead]] = False
        j = j[~dead]
        if j.size == 0:
            continue

        Xj, Rj, Jj = X[j], R[run][~dead], Jm[run][~dead]
        step = _lstsq_batch(Jj, Rj)
        sn = np.linalg.norm(step, axis=1)
        big = sn > 0.5
        if big.any():
            step[big] *= (0.5 / sn[big])[:, None]
        X[j] = Xj + step

    # The scalar version's tail: a candidate that used all its steps without converging is still a root
    # if it happens to satisfy the tolerance now.
    idx = np.nonzero(live)[0]
    if idx.size:
        fin = np.max(np.abs(Fb(X[idx])[0]), axis=1) < tol
        ok[idx[fin]] = True
    return X, ok


def link_residual(cycle, eid, alpha, theta):
    """How far this vertex's link is from closing, as the 3 independent entries of M - I."""
    M = np.eye(3)
    for h in cycle:
        M = M @ Rz(alpha[h]) @ Rx(math.pi - theta[eid[h]])
    return np.array([M[0, 1] - M[1, 0], M[0, 2] - M[2, 0], M[1, 2] - M[2, 1],
                     M[0, 0] - 1.0, M[1, 1] - 1.0, M[2, 2] - 1.0])


def residual(cycles, eid, alpha, theta):
    return np.concatenate([link_residual(c, eid, alpha, theta) for c in cycles])


def forced_by_valence3(cycles, eid, alpha, ne):
    """Dihedrals that no search has to find. A valence-3 link is a spherical TRIANGLE with three known
    sides, so the spherical law of cosines gives its angles outright:

        cos(A) = (cos a - cos b cos c) / (sin b sin c)

    Returns {edge id: theta} for every valence-3 vertex, or None if two of them disagree about a
    shared edge (which means the map has no realization at all and no search is needed either)."""
    out = {}
    for cyc in cycles:
        if len(cyc) != 3:
            continue
        a = [alpha[h] for h in cyc]
        for i in range(3):
            # In the link product the turn at edge(h_i) comes right after side a_i, so it sits between
            # sides a_i and a_{i+1} and is therefore OPPOSITE side a_{i+2}. Spherical law of cosines
            # with that pairing. (Off by one here is invisible on an equilateral vertex, where every
            # side is the same, and wrong on every other one.)
            sa, sb, sc = a[i], a[(i + 1) % 3], a[(i + 2) % 3]
            den = math.sin(sa) * math.sin(sb)
            if abs(den) < 1e-12:
                return None
            c = (math.cos(sc) - math.cos(sa) * math.cos(sb)) / den
            if not -1.0 - 1e-12 <= c <= 1.0 + 1e-12:
                return None                     # the three faces cannot fold to meet
            th = math.acos(max(-1.0, min(1.0, c)))
            e = eid[cyc[i]]
            if e in out and abs(out[e] - th) > 1e-7:
                return None                     # two valence-3 vertices disagree on one edge
            out[e] = th
    return out


# ----------------------------------------------------------------------------- one corner at a time
I9 = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)


def _T(A):
    return (A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8])


def _Rx9(t):
    c, s = math.cos(t), math.sin(t)
    return (1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c)


def _col0(A):
    return (A[0], A[3], A[6])


def _apply(A, v):
    return (A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
            A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
            A[6] * v[0] + A[7] * v[1] + A[8] * v[2])


def _rot_about_x(w, q, eps=1e-9):
    """The angle x with Rx(x) w = q, or None if w and q are not related by one (or if x is free)."""
    if abs(w[0] - q[0]) > 1e-7:
        return None
    n = w[1] * w[1] + w[2] * w[2]
    if n < eps:                                  # w is along the axis: every x works, so x is FREE
        return "free"
    c = (q[1] * w[1] + q[2] * w[2]) / n
    s = (q[2] * w[1] - q[1] * w[2]) / n
    if abs(c * c + s * s - 1.0) > 1e-6:
        return None
    return math.atan2(s, c)


def _extract_x(N, eps=1e-6):
    """x with Rx(x) == N, or None if N is not a rotation about the x-axis."""
    if abs(N[0] - 1.0) > eps or abs(N[1]) > eps or abs(N[2]) > eps or abs(N[3]) > eps or abs(N[6]) > eps:
        return None
    return math.atan2(N[7], N[4])


def solve_corner_scan(csa, edges, known, unk, tol=1e-10):
    """Corner solutions when an unknown edge repeats: scan, then polish.

    Complete to the grid resolution and no further, which is weaker than solve_corner's closed form and
    much stronger than a blind multistart over the whole block: the space is one, two or three angles
    with everything else already pinned, so the grid is fine enough to bracket every root that is not
    pathologically narrow. Runs are told which corners took this path so a report can separate what was
    proved from what was searched."""
    res = {1: 2880, 2: 144, 3: 44}[len(unk)]
    step = 2 * math.pi / res

    def miss(xs):
        th = dict(known)
        th.update(zip(unk, xs))
        return link_miss(csa, [th[e] for e in edges])

    def vec(xs):
        th = dict(known)
        th.update(zip(unk, xs))
        return link_vec(csa, [th[e] for e in edges])

    cand = []
    if len(unk) == 1:
        vals = [miss((i * step,)) for i in range(res)]
        for i in range(res):
            if vals[i] <= vals[i - 1] and vals[i] <= vals[(i + 1) % res] and vals[i] < 0.6:
                cand.append((i * step,))
    else:
        for idx in itertools.product(range(res), repeat=len(unk)):
            xs = tuple(i * step for i in idx)
            if miss(xs) < 0.35:
                cand.append(xs)
    out = []
    for st in cand:
        x = _newton(vec, st, tol)
        if x is None:
            continue
        x = np.mod(x, 2 * math.pi)
        if any(np.max(np.abs(np.mod(x - y + math.pi, 2 * math.pi) - math.pi)) < 1e-7 for y in out):
            continue
        out.append(x)
    solve_corner_scan.used = getattr(solve_corner_scan, "used", 0) + 1
    return [dict(zip(unk, x)) for x in out]


def periods(dec, retro=frozenset()):
    """[(period dart cycle, fold f)] per vertex orbit, plus the same eid/alpha structure().

    The quotient stores a vertex FOLDED: `(3,3,3,3,3)S5` is one dart, walked five times. structure()
    hands back the unfolded walk because the link equations are written on it, but for SOLVING the fold
    is worth keeping, because it turns three equations into one. See solve_corner_fold."""
    rneig, glue, lvert = dec["rneig"], dec["glue"], dec["lvert"]
    eid, ne = edge_ids(glue)
    alpha = [planar_angle(lvert[h], ds._nd(lvert[h]) in retro) for h in range(len(lvert))]
    uf = unfold(cycles_of(rneig), lvert, dec["configs"], dec["orbit"])
    if uf is None:
        return None, eid, ne, alpha
    return [(c[:len(c) // f], f) for c, f in uf], eid, ne, alpha


def _pow(M, f):
    out = I9
    for _ in range(f):
        out = _mul(out, M)
    return out


def solve_corner_fold(csa, edges, known, f, tol=1e-9):
    """A FOLDED corner with one unknown in its period, solved exactly.

    Closure on a folded vertex is M^f = I, where M is the product over ONE period. For a rotation that
    says nothing about the axis: M^f = I exactly when M turns through 2*pi*j/f for some integer j. So
    three equations collapse to ONE, on the trace, and with a single unknown x in the period

        tr(M) = tr(Rx(x) . Q . P) = R00 + cos(x) (R11 + R22) + sin(x) (R12 - R21)

    which is a + b cos x + c sin x = 1 + 2 cos(2 pi j / f): at most two roots per j, in closed form.

    This is what reaches the repeats. An edge appears several times in a folded vertex BECAUSE of the
    fold, so the unfolded walk repeats it while the period does not, and the period is where the
    equation is simple. The tetrahedron is the smallest case: period Rz(60 deg), f = 3, target trace 0,
    so 0.5 + 1.5 cos x = 0 gives x = 109.4712 and theta = 70.5288, with no search at all."""
    slots = [i for i, e in enumerate(edges) if e not in known]
    if len(slots) != 1 or f < 2:
        return None
    u = slots[0]
    n = len(edges)

    def known_factor(i):
        ca, sa = csa[i]
        b = math.pi - known[edges[i]]
        return _factor(ca, sa, math.cos(b), math.sin(b))

    P = I9
    for i in range(u):
        P = _mul(P, known_factor(i))
    ca, sa = csa[u]
    P = _mul(P, (ca, -sa, 0.0, sa, ca, 0.0, 0.0, 0.0, 1.0))
    Q = I9
    for i in range(u + 1, n):
        Q = _mul(Q, known_factor(i))
    R = _mul(Q, P)
    a, b, c = R[0], R[4] + R[8], R[5] - R[7]
    amp = math.hypot(b, c)
    out = []
    for j in range(f):
        target = 1.0 + 2.0 * math.cos(2 * math.pi * j / f)
        rhs = target - a
        if amp < 1e-12:
            continue
        if abs(rhs) > amp + 1e-9:
            continue
        phi = math.atan2(c, b)
        base = math.acos(max(-1.0, min(1.0, rhs / amp)))
        for x in (phi + base, phi - base):
            M = _mul(_mul(P, _Rx9(x)), Q)
            if max(abs(v - w) for v, w in zip(_pow(M, f), I9)) > 1e-7:
                continue
            th = (math.pi - x) % (2 * math.pi)
            if not any(abs((th - o[edges[u]] + math.pi) % (2 * math.pi) - math.pi) < 1e-9 for o in out):
                out.append({edges[u]: th})
    return out


def solve_corner(csa, edges, known):
    """EVERY fold assignment closing this one corner, in closed form. No grid and no Newton.

    The link product is  Rz(a_0)Rx(t_0) Rz(a_1)Rx(t_1) ... = I  with t = pi - theta. Group the factors
    around the unknown slots and it reads

        A_1 . Rx(x_1) . A_2 . Rx(x_2) . A_3 . Rx(x_3) . A_4  =  I

    with every A known. That is the closure of a three-joint spherical linkage, and it is solvable the
    way inverse kinematics solves a wrist. Push both sides onto e_1, which Rx(x_3) fixes:

        Rx(x_1) . A_2 . Rx(x_2) . (A_3 e_1)  =  M e_1

    Rx(x_1) cannot change a vector's first component, so matching that component alone gives ONE scalar
    equation in x_2 of the form C + K cos x_2 + S sin x_2 = q_1: at most TWO roots, in closed form.
    Each fixes x_1 by a rotation-about-the-axis solve and then x_3 by division.

    So a corner with three or fewer unknowns is decided exactly, and 89 percent of blocks have such a
    corner as soon as the valence-3 readings are fixed (measured over 1,600 blocks at k=3..6). This is
    what the first attempt at solving corner by corner was missing: it went looking for those roots with
    Newton from a grid of starts, which finds most of them and quietly loses the rest.

    Returns a list of {edge: theta} (possibly empty, which is a definite rejection), or None meaning
    "this corner cannot be decided here" — a repeated unknown edge, or a genuinely free angle — in which
    case the caller must fall back."""
    unk_slots = [i for i, e in enumerate(edges) if e not in known]
    unk_edges = {edges[i] for i in unk_slots}
    if len(unk_edges) > 3:
        return None                              # too many unknowns: not this corner's turn
    if len(unk_edges) != len(unk_slots):
        # The same unknown edge occupies two or more slots of this corner, which the closed form does
        # not cover: it assumes each unknown turns up once, so the product reads A.Rx(x).A.Rx(y).A.
        # This is the COMMONEST obstacle, not a corner case — 216 blocks against 203 that solve in
        # closed form, over k=2..5 — so it gets a solver of its own rather than a fallback.
        # Only the ONE-unknown case is safe to scan: 2,880 points over a single angle brackets every
        # root that is not pathologically narrow, and local minima are unambiguous in 1-D. Scanning two
        # or three angles on a grid coarse enough to be affordable LOSES roots — measured, 76 solutions
        # against 88 at k=2 — so those corners stall to the validated search instead of quietly
        # dropping solids. Solving them exactly needs the fold trace; see solve_dihedrals.
        # Only the ONE-unknown case is safe to scan: 2,880 points over a single angle brackets every
        # root that is not pathologically narrow, and in 1-D a local minimum is unambiguous. Scanning
        # two or three angles on a grid coarse enough to afford LOSES roots (measured: 76 solutions
        # against 88 at k=2, 16 against 22 at k=3), so those corners stall to the validated search
        # instead of quietly dropping solids. The exact way to reach them is the fold trace below.
        return solve_corner_scan(csa, edges, known, sorted(unk_edges)) if len(unk_edges) == 1 else None if len(unk_edges) == 1 else None
    n = len(edges)

    def chain(lo, hi):
        """Product of the known factors for slots lo..hi-1, plus the leading Rz of slot hi (mod n)."""
        M = I9
        for i in range(lo, hi):
            j = i % n
            ca, sa = csa[j]
            b = math.pi - known[edges[j]]
            M = _mul(M, _factor(ca, sa, math.cos(b), math.sin(b)))
        j = hi % n
        ca, sa = csa[j]
        return _mul(M, (ca, -sa, 0.0, sa, ca, 0.0, 0.0, 0.0, 1.0))

    if not unk_slots:
        M = I9
        for i in range(n):
            ca, sa = csa[i]
            b = math.pi - known[edges[i]]
            M = _mul(M, _factor(ca, sa, math.cos(b), math.sin(b)))
        return [{}] if max(abs(M[0] - 1), abs(M[4] - 1), abs(M[8] - 1),
                          abs(M[1] - M[3]), abs(M[2] - M[6]), abs(M[5] - M[7])) < 1e-7 else []

    # A_1 runs from slot 0 up to and including the leading Rz of the first unknown slot; each later A
    # runs from just after one unknown slot to the leading Rz of the next; the last wraps to the end.
    u = unk_slots
    A = [chain(0, u[0])]
    for i in range(len(u) - 1):
        A.append(chain(u[i] + 1, u[i + 1]))
    tail = I9
    for i in range(u[-1] + 1, n):
        ca, sa = csa[i]
        b = math.pi - known[edges[i]]
        tail = _mul(tail, _factor(ca, sa, math.cos(b), math.sin(b)))
    A.append(tail)

    def emit(xs):
        out = {}
        for slot, x in zip(u, xs):
            out[edges[slot]] = (math.pi - x) % (2 * math.pi)
        return out

    if len(u) == 1:
        N = _mul(_T(A[0]), _T(A[1]))             # A1 Rx(x) A2 = I  =>  Rx(x) = A1^T A2^T
        x = _extract_x(N)
        return [] if x is None else [emit([x])]

    M = _mul(_T(A[0]), _T(A[-1]))                # Rx(x1) A2 [Rx(x2) A3] = A1^T Alast^T
    if len(u) == 2:
        w = _col0(A[1])
        q = _col0(M)
        x1 = _rot_about_x(w, q)
        if x1 is None:
            return []
        if x1 == "free":
            return None
        N = _mul(_T(_mul(_Rx9(x1), A[1])), M)
        x2 = _extract_x(N)
        return [] if x2 is None else [emit([x1, x2])]

    # three unknowns: one scalar equation in x2, at most two roots
    p = _col0(A[2])
    q = _col0(M)
    A2 = A[1]
    C = A2[0] * p[0]
    K = A2[1] * p[1] + A2[2] * p[2]
    S = A2[2] * p[1] - A2[1] * p[2]
    R = math.hypot(K, S)
    rhs = q[0] - C
    if R < 1e-12:
        return None if abs(rhs) < 1e-9 else []   # x2 is free, or nothing works
    if abs(rhs) > R + 1e-9:
        return []
    phi = math.atan2(S, K)
    base = math.acos(max(-1.0, min(1.0, rhs / R)))
    out = []
    for x2 in (phi + base, phi - base):
        w = _apply(_mul(A2, _Rx9(x2)), p)
        x1 = _rot_about_x(w, q)
        if x1 is None:
            continue
        if x1 == "free":
            return None
        L = _mul(_mul(_mul(_Rx9(x1), A2), _Rx9(x2)), A[2])
        x3 = _extract_x(_mul(_T(L), M))
        if x3 is None:
            continue
        sol = emit([x1, x2, x3])
        if not any(all(abs((sol[e] - o[e] + math.pi) % (2 * math.pi) - math.pi) < 1e-9 for e in sol)
                   for o in out):
            out.append(sol)
    return out


# ----------------------------------------------------------------------------- solving
def _newton(F, x0, tol, steps=80):
    """Damped Newton with a numerical Jacobian. Returns the root or None."""
    x = np.array(x0, float)
    best, stall = None, 0
    for _ in range(steps):
        r = F(x)
        n = np.max(np.abs(r))
        if n < tol:
            return x
        # Abandon only on a genuine stall. ⚑ An earlier rule bailed as soon as one step improved by
        # less than 5%, which is normal early behaviour for Gauss-Newton on an OVERDETERMINED vertex
        # (two unknowns against six equations) and threw away real roots: the 4.4.3 + 4.3.4.3 block
        # closes at (90, 60, 90, 150) degrees and was being reported as having no realization.
        if best is None or n < best * 0.999:
            best, stall = n, 0
        else:
            stall += 1
            if stall >= 8:
                return None
        J = np.zeros((len(r), len(x)))
        for i in range(len(x)):
            dx = np.zeros(len(x)); dx[i] = 1e-7
            J[:, i] = (F(x + dx) - r) / 1e-7
        step, *_ = np.linalg.lstsq(J, -r, rcond=None)
        sn = np.linalg.norm(step)
        if sn > 0.5:
            step *= 0.5 / sn
        x = x + step
    return x if np.max(np.abs(F(x))) < tol else None


def solve_vertex(alphas, edges, known, tol=1e-11, seeds=13):
    # 13 starts per unknown; a 3-unknown vertex is a square system so its roots are isolated.
    """Every assignment to THIS vertex's unknown dihedrals that closes its link.

    One vertex at a time is the whole idea. Its link is 3 equations, so once all but three of its
    dihedrals are known the remaining ones are isolated roots of a square system, and when all but zero
    are known it is a pure consistency test that costs nothing and rejects. Solving the map vertex by
    vertex, always taking the most constrained one first, is what replaces a blind multistart over every
    edge orbit at once (which on a 12-orbit block means 7^12 starts, i.e. never)."""
    unk = sorted({e for e in edges if e not in known})
    csa = [(math.cos(a), math.sin(a)) for a in alphas]

    def F(x):
        th = dict(known)
        th.update(zip(unk, x))
        return link_vec(csa, [th[e] for e in edges])

    if not unk:
        return [{}] if np.max(np.abs(F(np.zeros(0)))) < 1e-7 else []
    grid = np.linspace(0.2, 2 * math.pi - 0.2, seeds)
    out = []
    for start in itertools.product(grid, repeat=len(unk)):
        x = _newton(F, start, tol)
        if x is None:
            continue
        x = np.mod(x, 2 * math.pi)
        if any(np.max(np.abs(np.mod(x - y + math.pi, 2 * math.pi) - math.pi)) < 1e-6 for y in out):
            continue
        out.append(x)
    return [dict(zip(unk, x)) for x in out]


# 1024, not 3000. The multistart's cost is linear in its start count and its ANSWER saturates long
# before the budget does: the two blocks that need the most starts in the whole k=1 corpus return
# 3, 10, 13, 15, 16 roots as the budget doubles 64 -> 1024, and 16 is also what 3000 returns.
# Verified end to end, not by that argument alone — k=1 gives the same 35 solids at 1024 as at 3000,
# none lost — and it is 2.3x on the k=2 shards, 2.9x on the k=1 run. 512 is another 1.4x and is NOT
# taken: those two blocks return 15 of their 16 roots there, so it is the first budget that measurably
# loses something. (EU_JOINT_BUDGET overrides.)
_JOINT_BUDGET = int(os.environ.get("EU_JOINT_BUDGET", "1024"))


def solve_joint(verts, known, rest, tol=1e-11, seeds=7, budget=None):
    """Roots of ALL the link equations at once over the still-unknown edges. Multistart, so what it
    finds is certain and what it misses is not provable; propagation runs first precisely to make this
    space as small as possible."""
    budget = _JOINT_BUDGET if budget is None else budget
    csas = [[(math.cos(a), math.sin(a)) for a in al] for al, es in verts]

    # Every start at once. `rest` are the unknown edge orbits; `known` is fixed, so each vertex reads a
    # (N, L) slab of dihedrals whose columns are either a constant or one of the unknowns, and its link
    # residual is six columns of that. The per-vertex column maps are built once, outside the iteration.
    # Per vertex, per side: which unknown column feeds this slot (or the constant cos/sin of a slot
    # whose dihedral is already fixed). Built once — inside the iteration it is pure indexing.
    pos = {e: i for i, e in enumerate(rest)}
    nx = len(rest)
    plan = []
    for csa, (al, es) in zip(csas, verts):
        cols = []
        for e in es:
            if e in pos:
                cols.append((pos[e], 0.0, 0.0))
            else:
                b = math.pi - known[e]
                cols.append((-1, math.cos(b), math.sin(b)))
        plan.append((csa, cols))

    nmax = budget if seeds ** len(rest) > budget else seeds ** len(rest)
    kernels = [_link_kernel(csa, cols, nmax) for csa, cols in plan]

    def Fb(X):
        """(N, nx) dihedrals -> (residuals, Jacobian) for every vertex at once."""
        n = X.shape[0]
        # (nx, n), not (n, nx): the kernel reads one unknown's whole column at a time, eight or so times
        # per Newton step, and a strided gather each time costs more than the one transpose here.
        b = math.pi - np.ascontiguousarray(X.T)
        cb_all, sb_all = np.cos(b), np.sin(b)
        R = np.empty((n, 6 * len(plan)))
        J = np.zeros((n, 6 * len(plan), nx))
        for vi, run in enumerate(kernels):
            run(cb_all, sb_all, R, J, 6 * vi, n)
        return R, J

    if seeds ** len(rest) <= budget:
        starts = list(itertools.product(np.linspace(0.35, 2 * math.pi - 0.35, seeds), repeat=len(rest)))
    else:
        rng = np.random.default_rng(20260820)
        starts = [tuple(rng.uniform(0.15, 2 * math.pi - 0.15, len(rest))) for _ in range(budget)]
    X, ok = _newton_batch(Fb, np.array(starts, float), tol)

    # Dedup in the ORIGINAL start order. It decides which of several near-identical roots is kept, and
    # keeping a different one would move a shipped solid's coordinates by a hair for no reason.
    out = []
    for i in np.nonzero(ok)[0]:
        x = np.mod(X[i], 2 * math.pi)
        if any(np.max(np.abs(np.mod(x - y + math.pi, 2 * math.pi) - math.pi)) < 1e-6 for y in out):
            continue
        out.append(x)
    return [dict(zip(rest, x)) for x in out]


class _Stalled(Exception):
    pass


_NE_CAP = int(os.environ.get("EU_NE_CAP", "6"))
_PROBE_STARTS = int(os.environ.get("EU_PROBE_STARTS", "64"))
_PROBE_GROWTH = float(os.environ.get("EU_PROBE_GROWTH", "1.8"))
# An absolute floor as well as a ratio: the two genuine blocks the ratio alone misread sat at
# p128 = 8 and 10, while the varieties that cost seconds sit at 49 and 67.
_PROBE_FLOOR = int(os.environ.get("EU_PROBE_FLOOR", "40"))


def solve_dihedrals(dec, retro=frozenset(), maxbranch=200000):
    """Every dihedral assignment closing all the links, as theta vectors over the edge orbits.

    ONE CORNER AT A TIME, with a fallback. Take the corner with the fewest unknown folds; if it has
    three or fewer, solve_corner decides it EXACTLY and in closed form, at most two branches, no
    root-finding; recurse, and the shared edges carry the answer to its neighbours. A corner that
    admits nothing kills the branch at once instead of after a search.

    Measured over 1,600 blocks at k=3..6: 89% have a corner with three or fewer unknowns once the
    valence-3 corners are read off, so most blocks are decided this way and their "no solution" is a
    proof rather than a failure to find one.

    If propagation ever STALLS — every corner has four or more unknowns, or the most constrained one
    repeats an unknown edge, or one of its angles comes out free — the whole block reverts to the
    validated path: enumerate the two readings of each valence-3 corner, then joint multistart Newton
    over what is left. Reverting the whole block rather than patching the branch matters for cost: the
    fallback used to be called from inside the recursion, once per branch, which made the propagating
    version SLOWER than the thing it was meant to replace (4m44 against 2m37 at k=2).

    `last_stats` records which path each block took, so a report can say how much of a run is proved
    and how much is searched."""
    cycles, eid, ne, alpha = structure(dec, retro)
    if cycles is None:
        return []
    # ⚑ REJECTED BEFORE ANY SOLVING, on a dimension count. Each vertex link is a closure in SO(3) and
    # contributes 3 independent equations, so ne > 3*V leaves a POSITIVE-DIMENSIONAL variety of link
    # solutions. A realization needs the map to close as well, which is extra equations, so on that
    # variety the realizations are isolated — measure zero — and the multistart samples it, never hits
    # one, and charges for 1024 starts to say so.
    # Measured on the whole k=1 corpus: 1,892 of 4,998 blocks (37.9%) fail this, and the 35 realized
    # solids ALL have ne <= 3*V (realized ne is 1, 2, 3 or 6 against a rejected spread reaching 8).
    # This test used to live in the stall path, where it fired on 2 blocks of 120 because a block can
    # burn its whole budget without ever stalling. At the front it is free and it is the cut.
    #
    # AND A SECOND REJECT, on the multistart's own reach. Its starts are a `seeds`-per-axis grid, so
    # ne unknowns want 7**ne points and it takes 1024: full coverage at ne <= 3 (343), 43% at ne = 4,
    # 0.9% at ne = 6, and 0.1% at ne = 7. Past that it is not enumerating, it is guessing — and paying
    # 200 ms a block to do it. Measured on 456 solved k=2 blocks, ne >= 7 is 85% of all remaining time.
    # The cap is 6 because that is what the corpus says: all 35 realized k=1 solids have ne in
    # {1, 2, 3, 6}, against a rejected spread reaching 8 and beyond.
    # ⚑ A DECLARED CAP, NOT A PROOF. These blocks are UNRESOLVED and the report counts them as such.
    # Raising EU_NE_CAP re-opens them; deciding them properly wants a solver that does not sample.
    if ne > 3 * len(cycles) or ne > _NE_CAP:
        solve_dihedrals.last_degenerate = getattr(solve_dihedrals, "last_degenerate", 0) + 1
        return []
    verts = [([alpha[h] for h in c], [eid[h] for h in c]) for c in cycles]
    csas = [[(math.cos(a), math.sin(a)) for a in al] for al, es in verts]
    pers, _, _, _ = periods(dec, retro)
    pcsa = [[(math.cos(alpha[h]), math.sin(alpha[h])) for h in c] for c, f in pers]
    pedge = [[eid[h] for h in c] for c, f in pers]
    folds = [f for c, f in pers]

    def try_corner(i, known):
        """The folded form first: one equation instead of three, so a period with a single unknown is
        decided outright. Then the unfolded closed form, then the one-angle scan."""
        if folds[i] > 1:
            r = solve_corner_fold(pcsa[i], pedge[i], known, folds[i])
            if r is not None:
                return r
        return solve_corner(csas[i], verts[i][1], known)

    def finish(known, out):
        if len(known) < ne:                      # an edge no corner constrains: not a closed map
            return
        for csa, (al, es) in zip(csas, verts):
            if link_miss(csa, [known[e] for e in es]) > 1e-6:
                return
        th = np.array([known[e] for e in range(ne)])
        if not any(np.max(np.abs(np.mod(th - w + math.pi, 2 * math.pi) - math.pi)) < 1e-6 for w in out):
            out.append(th)

    solve_dihedrals.last_degenerate = getattr(solve_dihedrals, "last_degenerate", 0)
    out, budget = [], [maxbranch]

    def rec(known):
        if budget[0] <= 0:
            raise _Stalled()
        budget[0] -= 1
        pend = [(u, i) for i in range(len(verts))
                for u in [len({e for e in verts[i][1] if e not in known})] if u]
        if not pend:
            finish(known, out)
            return
        u, i = min(pend)
        sols = try_corner(i, known) if u <= 3 else None
        if sols is None:
            raise _Stalled()
        # ⚑ Sweeping the stalled corner's own freedom was tried here and REVERTED: fix u-3 of its
        # unknowns on a grid and let the closed form finish each point. It reads well and it loses
        # roots, 80 solutions against 88 at k=2 on a 720-point line, because an isolated root does not
        # have to sit near a grid line. That is the third time a grid over a continuous angle has cost
        # solids in this file (48-point sweep, 144^2 corner scan, this). The rule that survives: grid a
        # continuum only where a local minimum is unambiguous, which in practice means one dimension.
        for sol in sols:
            nk = dict(known)
            nk.update(sol)
            rec(nk)

    # ---- the valence-3 corners first, BOTH readings, exactly. This is where propagation has to start:
    # from nothing, a corner of valence 4 or more has four or more unknowns and there is nothing to
    # solve, and starting from {} made every k=2 block stall and pay for both paths.
    # ⚑ solve_corner AND NOT forced_by_valence3 + a global flip (2026-08-31). The old seeding read the
    # link as a spherical triangle, took acos of each angle — so every theta came back <= pi — and
    # offered the mirror as one bit flipping ALL THREE at once. That is complete only while the true
    # solid has no reflex dihedral, which holds for every convex-cornered palette and fails the moment
    # a face has a reflex CORNER: AL's isotoxal analogue of U30 folds at (142.62, 142.62, 221.81), two
    # edges under pi and one over, and neither the unflipped (142.62, 142.62, 138.19) nor the flipped
    # (217.38, 217.38, 221.81) is that. The mixed reading was unreachable, so the block seeded wrong,
    # propagated to a full assignment and died in finish() on link_miss. solve_corner is the same
    # closed form the recursion already uses and returns both readings with a per-edge sign.
    v3 = [i for i, c in enumerate(cycles) if len(c) == 3]
    branches = [{}]
    if v3:
        branches = []
        for bits in itertools.product((0, 1), repeat=len(v3)):
            fixed, ok = {}, True
            for i, pick in zip(v3, bits):
                sols = solve_corner(csas[i], verts[i][1], {})
                if not sols or pick >= len(sols):
                    ok = False
                    break
                for e, t in sols[pick].items():
                    if e in fixed and abs(fixed[e] - t) > 1e-7:
                        ok = False
                        break
                    fixed[e] = t
                if not ok:
                    break
            if ok:
                branches.append(fixed)
    npropagated = 0
    for fixed in branches:
        try:
            rec(dict(fixed))                     # exact: corner by corner, closed form
            npropagated += 1
            continue
        except _Stalled:
            pass
        rest = [e for e in range(ne) if e not in fixed]
        if not rest:
            finish(fixed, out)
            continue
        # ⚑ A DEGENERATE BLOCK IS NOT ENUMERABLE THIS WAY, and running the full multistart on one is
        # both the whole cost and a fiction: its link variety is POSITIVE-DIMENSIONAL, so the 3000
        # starts converge to 3000 different points ON A CURVE and it reports them as roots. Measured on
        # 120 k=2 blocks, the ten worst are 67% of all time and each returns 1,200-2,600 of them.
        #
        # The sample cannot contain what we want anyway. A realization needs the map to CLOSE, which is
        # extra equations beyond the links, so on a curve of link solutions the closing points are
        # isolated — measure zero — and a finite sample essentially never lands on one. Ground truth:
        # of 4,998 k=1 blocks, 1,892 have more unknowns than link equations and NOT ONE of the 35
        # realized solids came from any of them.
        #
        # COUNTING UNKNOWNS DOES NOT DETECT IT. The worst block measured has ne=5 against 2 vertices —
        # overdetermined on paper, 2,032 solutions in fact — because the link equations are DEPENDENT
        # and the rank is what matters. So probe the behaviour instead: 64 starts cost 2% of the full
        # multistart, and the two regimes separate cleanly (a real block returns 0, 4, 16, 48; a curve
        # returns 43 of 64). Over the cap the block is UNRESOLVED, not empty, and the report says so
        # rather than counting it as searched. Deciding these needs the link and closure systems solved
        # together, which is a different developer, not a bigger budget.
        # The test is SATURATION, not a count. Double the start budget: an isolated root set stops
        # growing, a curve keeps returning new points on it. Measured on shard _34 —
        #     genuine   4/4   8/8   6/8   7/8       ratio 1.0 - 1.3
        #     curve    22/49 26/67 2/4  6/16        ratio 2.0 - 2.7   (full runs return 1016, 189, 64, 48)
        # — which separates cleanly at 1.8, and the two probes together cost 6% of one full multistart.
        p1 = solve_joint(verts, fixed, rest, budget=_PROBE_STARTS)
        p2 = solve_joint(verts, fixed, rest, budget=2 * _PROBE_STARTS)
        if len(p2) >= _PROBE_FLOOR and len(p1) and len(p2) >= _PROBE_GROWTH * len(p1):
            solve_dihedrals.last_degenerate += 1
            continue
        # ⚑ AND THEN THE FULL RUN ANYWAY. Returning p2 here — "it saturated, so this is the answer" —
        # was tried and REVERTED: it lost 2 of the 35 k=1 solids. Both survivors need ~512 starts to
        # find all 16 of their roots (3, 10, 13, 15, 16 as the budget doubles from 64), so a 128-start
        # probe reads as saturated long before it is complete. The probe is sound as a REJECTOR of
        # runaway varieties and worthless as an enumerator; only the first use survives.
        for sol in solve_joint(verts, fixed, rest):
            nk = dict(fixed)
            nk.update(sol)
            finish(nk, out)
    solve_dihedrals.last_stats = {"path": "corner" if npropagated == len(branches) else "search",
                                  "branches": len(branches), "propagated": npropagated}
    return out


# ----------------------------------------------------------------------------- developing to R³
class DevelopError(Exception):
    pass


def develop(dec, theta, retro=frozenset(), guard=None):
    """Flood-fill the dart instances in SE(3) and return (V, E, F, Ftype).

    A dart instance is (quotient dart h, position t, frame R) with the frame's first column along the
    dart's edge and the third along the normal of the face it sweeps. rneig turns within that face by
    its angle and then folds about the new edge by its dihedral; glue steps to the far end of the edge
    and reverses. Whether the whole thing closes is not guaranteed by the link equations, which are
    local, so this is where a map that satisfies every vertex and still does not close is caught."""
    rneig, glue, lvert = dec["rneig"], dec["glue"], dec["lvert"]
    eid, _ = edge_ids(glue)
    alpha = [planar_angle(lvert[h], ds._nd(lvert[h]) in retro) for h in range(len(lvert))]
    def cross_edge(th):
        """Local frame change for stepping across an edge to its other half.

        The new dart sits at the far end pointing back, so e1 -> -e1, and it belongs to the edge's
        OTHER face, so the normal swings by the exterior angle phi = pi - theta about e1. Writing the
        new basis in the old one and completing with e2 = e3 x e1:

            e1' = (-1, 0, 0),  e3' = (0, sin phi, cos phi),  e2' = (0, -cos phi, sin phi)

        At theta = pi (a flat edge) this is diag(-1, -1, 1), which is the only case where "reverse the
        edge and keep the normal" is right; assuming it in general is what stopped every k=1 block from
        closing on the first attempt. The SIGN of phi is not fixed by the link equations, which are
        invariant under flipping it together with the sweep, and is pinned here by the tetrahedron: this
        one closes on 12 dart instances over 4 vertices at mutual distance 1, the other spirals."""
        c, sn = math.cos(math.pi - th), math.sin(math.pi - th)
        return np.array([[-1.0, 0.0, 0.0], [0.0, -c, sn], [0.0, sn, c]])

    def key(h, t, R):
        return (h,) + tuple(np.round(t / 1e-6).astype(np.int64)) + \
               tuple(np.round(R[:, 0] / 1e-6).astype(np.int64)) + \
               tuple(np.round(R[:, 2] / 1e-6).astype(np.int64))

    # ⚑ NOT A CONSTANT. guard was a hardcoded 2000, which caps E at 1000 and silently files anything
    # larger as "did not close" — a lost solid with no symptom, and star palettes reach further than
    # the convex one ever did. develop_spherical.instance_bound derives it: 2E = sum over orbits of
    # |orbit| * valence <= |G| * sum of valences, and a finite subgroup of O(3) has order at most
    # max(120, 4 * maxrot). The argument is about the point group, so it transfers to a Euclidean
    # realization unchanged.
    if guard is None:
        guard = max(2000, ds.instance_bound(dec["configs"]))

    inst_id, inst = {}, []
    vert_id, verts = {}, []
    rn_pairs = []                    # (instance, its rneig neighbour) — the same-vertex relation

    def vid(t):
        k = tuple(np.round(t / 1e-6).astype(np.int64))
        if k not in vert_id:
            vert_id[k] = len(verts)
            verts.append(t.copy())
        return vert_id[k]

    def get(h, t, R):
        k = key(h, t, R)
        if k in inst_id:
            return inst_id[k], False
        i = len(inst)
        inst_id[k] = i
        inst.append((h, t, R, vid(t)))
        return i, True

    seed, _ = get(0, np.zeros(3), np.eye(3))
    stack = [seed]
    pops = 0
    while stack:
        pops += 1
        if pops > guard:
            raise DevelopError("flood-fill did not close within %d instances" % guard)
        i = stack.pop()
        h, t, R, _ = inst[i]
        # around the vertex: turn by this face's angle, then fold about the new edge
        hn = rneig[h]
        Rn = R @ Rz(alpha[hn]) @ Rx(math.pi - theta[eid[hn]])
        j, new = get(hn, t, Rn)
        rn_pairs.append((i, j))      # both sit at the SAME map vertex, by construction
        if new:
            stack.append(j)
        # across the edge: step to the far end and reverse
        hg = glue[h]
        tg = t + R[:, 0]
        Rg = R @ cross_edge(theta[eid[h]])
        j, new = get(hg, tg, Rg)
        if new:
            stack.append(j)

    E = set()
    for (h, t, R, va) in inst:
        vb = vid(t + R[:, 0])
        if va != vb:
            E.add((min(va, vb), max(va, vb)))
    F, Ftype, Fang = [], [], []
    seen = set()
    for start in range(len(inst)):
        if start in seen:
            continue
        ring, idx, want = [], start, []
        Ftype.append(ds._nd(lvert[rneig[inst[start][0]]]))
        for _ in range(guard):
            seen.add(idx)
            h, t, R, va = inst[idx]
            ring.append(va)
            hn = rneig[h]
            want.append(alpha[hn])          # the angle this corner is SUPPOSED to have
            Rn = R @ Rz(alpha[hn]) @ Rx(math.pi - theta[eid[hn]])
            nxt = key(glue[hn], t + Rn[:, 0], Rn @ cross_edge(theta[eid[hn]]))
            if nxt not in inst_id:
                raise DevelopError("face trace escaped the closed instance set")
            idx = inst_id[nxt]
            if idx == start:
                break
        else:
            raise DevelopError("face did not close")
        F.append(ring)
        Fang.append(want)
    # The MAP's vertex count: orbits of the instance set under the rneig step, which never moves the
    # translation t, so every instance in an orbit sits at one map vertex. Compare it with len(verts),
    # the number of DISTINCT POINTS the fill produced, and a pinch is the difference.
    parent = list(range(len(inst)))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for a, b in rn_pairs:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    nvmap = len({find(x) for x in range(len(inst))})
    return verts, E, F, Ftype, len(inst), nvmap, Fang


def convexity(V, F):
    """(is convex, worst violation). Every face plane must have the whole solid on one side of it.

    Johnson's 92 are CONVEX, and this developer emits non-convex realizations too (the great icosahedron
    falls out of the plain 3^5 block), so a comparison against the 92 has to compare like with like.
    Also flags COPLANAR neighbours, which are why the fully augmented dodecahedron is not a Johnson
    solid: adjacent triangles merge into rhombi and the faces stop being the faces."""
    P = np.array(V, float)
    worst, coplanar = 0.0, False
    for ring in F:
        pts = P[list(ring)]
        c = pts.mean(axis=0)
        _, _, vh = np.linalg.svd(pts - c)
        nrm = vh[2]
        d = (P - c) @ nrm
        lo, hi = float(d.min()), float(d.max())
        if lo < -1e-7 and hi > 1e-7:
            worst = max(worst, min(-lo, hi))
        off = d[np.abs(d) > 1e-7]
        if len(off) < len(P) - len(ring):
            coplanar = True                  # a vertex outside this face still lies in its plane
    return worst < 1e-7, worst, coplanar


def vertex_orbit_proxy(V, F):
    """Upper bound on vertex-transitivity, cheaply. Two vertices in one orbit have identical sorted
    distance multisets, so counting distinct multisets counts orbits from below; equal fingerprints do
    not prove one orbit, which is why this is a PROXY and is labelled as one."""
    P = np.array(V, float)
    D = np.linalg.norm(P[:, None, :] - P[None, :, :], axis=2)
    fp = {tuple(sorted(np.round(row / 1e-6).astype(np.int64).tolist())) for row in D}
    return len(fp)


def check_realized(V, E, F, Ftype, ninst, tol=1e-6, nvmap=None, Fang=None):
    """(ok, residual). Every edge unit, every face a regular planar {n/d}, the map consistent.

    No area or density certificate here: those are spherical statements. What replaces them is that
    the developing map closed at all, which for a Euclidean realization is the whole content."""
    res = {"euler": len(V) - len(E) + len(F), "darts": ninst}
    deg = sum(len(r) for r in F)
    res["mapOK"] = (2 * len(E) == ninst and deg == ninst
                    and all(len(r) == ds._nd(t)[0] for r, t in zip(F, Ftype)))
    # ⚑ TEST THE PINCH DIRECTLY, do not infer it from chi. The dart and ring checks above are about
    # the map's combinatorics, which survive a bad realization untouched: if the flood fill sends two
    # distinct vertices of the MAP to the same POINT it merges them, V drops by one, and every count in
    # mapOK still balances because no edge or face changed. The solid touches itself there and is not a
    # polyhedron. One k=3 record did exactly this (ctrnact-03_34-4af_4ap_5ae-1, second realization: 14
    # map vertices onto 13 points, chi = 1) and shipped as far as lib/squaring/smith.test.ts.
    #
    # That was caught with `euler == 2`, which worked because every other record across k=1..k=3 has
    # chi = 2. It is the wrong invariant. A star polyhedron need not: two of the four Kepler-Poinsot
    # solids close at chi = -6, and lib/tilings/sph-star.ts explains at length why chi is not the
    # certificate on that shelf. develop_euclid realizes the small stellated dodecahedron to machine
    # precision today and throws it away on this line alone. So count the map's vertices and require
    # the fill to have produced that many distinct points, which is what "pinched" actually means, and
    # report chi instead of gating on it.
    res["vmap"] = nvmap
    if nvmap is not None:
        res["pinched"] = (nvmap != len(V))
        res["mapOK"] = res["mapOK"] and not res["pinched"]
    else:
        res["mapOK"] = res["mapOK"] and res["euler"] == 2      # callers that cannot supply it
    # ⚑ AND THE OTHER HALF OF THE SAME PINCH, which `pinched` above cannot see. That test compares the
    # map's vertex count against the number of entries the fill EMITTED, so it catches a fill whose own
    # dedup merged two map vertices. It says nothing about two entries the fill kept apart landing on
    # one point: len(V) still equals nvmap and the record passes. Four solids reached the shelf that
    # way and shipped for weeks — ncx-7-15-10-a claims seven vertices and has four distinct points,
    # ncx-8-18-12-a claims eight and has five (Marek Ctrnact, 2026-08-24, who saw it as "an extra
    # triangle in the middle cutting it in half that is not visible from the outside"). Measure the
    # POSITIONS. Tolerance is relative to the edge and the gap in the corpus is three orders of
    # magnitude: the four sit at ~1e-6 of an edge, the closest clean record at 5.1e-3.
    if res["mapOK"] and len(V) > 1:
        P = np.asarray(V, float)
        sep = np.linalg.norm(P[:, None, :] - P[None, :, :], axis=2)[np.triu_indices(len(P), 1)].min()
        # E is a SET of pairs, so take any member for the scale — every edge is the same length here by
        # construction, and edgeCV below is what checks that claim.
        a, b = next(iter(E)) if E else (0, 0)
        ref = float(np.linalg.norm(P[a] - P[b])) if E else 1.0
        res["minVertexSep"] = float(sep / (ref or 1.0))
        res["coincident"] = bool(res["minVertexSep"] < 1e-4)
        res["mapOK"] = res["mapOK"] and not res["coincident"]
    if not res["mapOK"]:
        return False, res
    Vn = [np.asarray(v) for v in V]
    el = [float(np.linalg.norm(Vn[a] - Vn[b])) for (a, b) in E]
    if not el:
        return False, {"error": "no edges"}
    m = sum(el) / len(el)
    res["edgeLen"] = m
    res["edgeCV"] = max(abs(e - m) for e in el) / m
    worst_plane = worst_shape = 0.0
    for fi, (ring, (n, d)) in enumerate(zip(F, Ftype)):
        pts = np.array([Vn[i] for i in ring])
        c = pts.mean(axis=0)
        _, _, vh = np.linalg.svd(pts - c)
        worst_plane = max(worst_plane, float(np.max(np.abs((pts - c) @ vh[2]))))
        # ⚑ THE FACE IS ITS ANGLES, not its chord table. This was the regular-{n/d} chord identity
        # |v_i - v_j| = sin(pi*s*d/n)/sin(pi*d/n), which is a statement about a tile whose corners are
        # all alike and is simply false for an ISOTOXAL star n*a — two radii, two angles — so it
        # rejected every such face on sight. Every edge already has to be unit (edgeCV above) and the
        # ring already has to be planar, and an equilateral planar polygon is pinned by its corner
        # angles, so comparing the MEASURED angles with the ones the alphabet asked for is the same
        # test for a regular face and the right one for any other. It is also O(n) instead of O(n^2).
        expect = Fang[fi] if Fang is not None else [(n - 2 * d) * math.pi / n] * len(ring)
        for i in range(len(ring)):
            u = pts[i - 1] - pts[i]
            w = pts[(i + 1) % len(ring)] - pts[i]
            cs = float(np.dot(u, w) / ((np.linalg.norm(u) * np.linalg.norm(w)) or 1.0))
            got = math.acos(max(-1.0, min(1.0, cs)))
            # the measured angle is the unsigned one, so a reflex corner reads as its explement
            want = expect[i] if expect[i] <= math.pi else 2 * math.pi - expect[i]
            worst_shape = max(worst_shape, abs(got - want))
    res["planarity"] = worst_plane
    res["faceShape"] = worst_shape
    conv, cworst, coplanar = convexity(V, F)
    res["convex"] = bool(conv)
    res["concavity"] = cworst
    res["coplanarNeighbour"] = bool(coplanar)
    res["vertexFingerprints"] = vertex_orbit_proxy(V, F)
    return (res["edgeCV"] < tol and worst_plane < tol and worst_shape < tol), res


# ----------------------------------------------------------------------------- prefilter
# THE FLOOD FILL IS THREE QUARTERS OF THIS DEVELOPER. Measured on 350 star-wide k=2 blocks (2026-08-24,
# experiments/results/star-ncx-k2-euclid-cost-2026-08-24.log): 4.7 s per block, of which solve_dihedrals
# is 22%, `develop` 78% and check_realized 0%. A failing fill runs the full 2,000-instance guard at
# ~1.85 ms per pop, because every pop builds three 3x3 numpy arrays and rounds two of them into a key.
# 355,207 blocks at that rate is 464 core-hours.
#
# eu_sphfill's EU_FILL_EUCLID mode walks the same fill in C and answers close / consistent / usable,
# and develop_block is then run UNCHANGED on the survivors. Same division of labour the spherical
# prefilter has, and the same soundness argument:
#
#   * Python still owns every geometry decision. solve_dihedrals runs HERE and its thetas are handed
#     over; C only walks and counts.
#   * A "usable" verdict is never trusted for output — develop_block redoes the attempt in full, so
#     the coordinates the shelf ships are this module's, to the last bit.
#   * So the only way to lose a record is a verdict of "no" where develop_block would have said yes,
#     which is CHECKED and not assumed: EU_PREFILTER_VERIFY develops the rejects too and shouts.
#
# ⚑ THE FILTER MUST ENUMERATE WHAT develop_block WILL. develop_block takes `maxretro` as an argument
# and the sharded driver passes 0; at any other value the retrograde subsets it would try are not the
# ones asked about here, so the filter steps aside rather than answer a different question.
MAXRETRO = int(os.environ.get("EU_MAXRETRO", "0"))
PREFILTER = ds.PREFILTER and MAXRETRO == 0
_GUARD_MIN = 2000                  # develop()'s floor, kept in one place


def _euclid_record(dec, theta, eid, guard, rn, gl, al, ns):
    """One EU_FILL_EUCLID record: the per-dart dihedral is all that varies across a block's thetas."""
    n = len(dec["rneig"])
    return (struct.pack("<ii", n, guard) + rn + gl + al +
            array.array("d", [theta[eid[h]] for h in range(n)]).tobytes() + ns)


def prefilter(blocks, verify=False):
    """The sublist of blocks with at least one theta whose fill closes into a consistent map.

    Falls back to the whole list on any error, because a filter that silently drops work is worse
    than a slow developer."""
    if not PREFILTER or not blocks:
        return blocks
    try:
        buf, owner = bytearray(), []                 # attempt index -> block index
        for bi, b in enumerate(blocks):
            dec = ds.decode_block(b)
            rneig, glue, lvert = dec["rneig"], dec["glue"], dec["lvert"]
            n = len(rneig)
            eid, _ = edge_ids(glue)
            rn = array.array("i", rneig).tobytes()
            gl = array.array("i", glue).tobytes()
            # the same three expressions develop() uses, so the two cannot drift
            al = array.array("d", [planar_angle(lvert[h]) for h in range(n)]).tobytes()
            ns = array.array("i", [ds._nd(lvert[rneig[h]])[0] for h in range(n)]).tobytes()
            guard = max(_GUARD_MIN, ds.instance_bound(dec["configs"]))
            for theta in solve_dihedrals(dec, frozenset()):
                buf += _euclid_record(dec, theta, eid, guard, rn, gl, al, ns)
                owner.append(bi)
        if not owner:
            return []                                # no block has a dihedral solution at all
        reply = ds._sphfill_ask(len(owner), buf, width=4, mode="euclid")
        if reply is None or len(reply) != len(owner) * 4:
            sys.stderr.write("[prefilter] short reply — developing everything\n")
            return blocks
        keep = [False] * len(blocks)
        for i, v in enumerate(struct.unpack("<%di" % len(owner), reply)):
            if v > 0:                     # 1 usable, 0 closed but inconsistent, -1 did not close
                keep[owner[i]] = True
        out = [b for b, k in zip(blocks, keep) if k]
        if verify:
            missed = 0
            for b, k in zip(blocks, keep):
                if k:
                    continue
                recs, _ = develop_block(b)
                if recs:
                    missed += 1
                    sys.stderr.write("[prefilter] ⚑ MISSED a realization: %s\n" % ds.decode_block(b)["id"])
            sys.stderr.write("[prefilter] verify: %d of %d rejects would have realized\n"
                             % (missed, len(blocks) - len(out)))
        return out
    except Exception as e:                           # never let the filter be the reason a block is lost
        sys.stderr.write("[prefilter] disabled for this batch: %r\n" % (e,))
        return blocks


# ----------------------------------------------------------------------------- driver
def develop_block(b, maxretro=0):
    """Every realization of one pruned block, as cell records."""
    dec = ds.decode_block(b)
    cfg = " + ".join(".".join(ds._face_str(p) for p in c) for c in dec["configs"])
    types = sorted({ds._nd(p) for c in dec["configs"] for p in c})
    subsets = [frozenset()]
    if maxretro:
        subsets = [frozenset(s) for r in range(min(maxretro, len(types)) + 1)
                   for s in itertools.combinations(types, r)]
    recs, why = [], []
    for retro in subsets:
        for theta in solve_dihedrals(dec, retro):
            try:
                V, E, F, Ftype, ninst, nvmap, Fang = develop(dec, theta, retro)
            except DevelopError as e:
                why.append("retro=%s: %s" % (sorted(retro), e))
                continue
            # A dihedral of 0 or a full turn folds two faces flat onto each other: the developing map
            # still closes and every face is still regular, so the certificate passes and the figure is
            # not a polyhedron. The root finder does produce these, so they are rejected explicitly.
            if any(min(abs(t % (2 * math.pi)), abs(2 * math.pi - (t % (2 * math.pi)))) < 1e-6
                   for t in theta):
                why.append("retro=%s: degenerate dihedral (a flat edge)" % sorted(retro))
                continue
            ok, res = check_realized(V, E, F, Ftype, ninst, nvmap=nvmap, Fang=Fang)
            if not ok:
                why.append("retro=%s: certificate failed %s" % (sorted(retro), res))
                continue
            recs.append({
                "id": dec["id"] + ("-r" + "".join("%d_%d" % t for t in sorted(retro)) if retro else ""),
                "vertexConfig": cfg, "k": len(dec["configs"]),
                "dihedrals": [float(t) for t in sorted(set(np.round(theta, 9)))],
                "retrograde": ["%d/%d" % t if t[1] > 1 else str(t[0]) for t in sorted(retro)],
                "vertices": [[float(x) for x in v] for v in V],
                "faces": [list(map(int, r)) for r in F],
                "faceTypes": [[int(n), int(d)] for (n, d) in Ftype],
                "realized": True, "residual": res,
            })
    return recs, (None if recs else {"id": dec["id"], "config": cfg,
                                     "reason": "; ".join(why[:4]) or "no dihedral solution"})


def congruence_key(rec, q=1e-6):
    """A key that is equal exactly when two records are congruent solids.

    The multiset of all pairwise vertex distances. It identifies mirror images, which is deliberate and
    matches the repo's standing convention that mirror pairs count once (CLAUDE.md). It is what catches
    the REFLEX duplicate every block produces: theta and 2*pi - theta develop the same solid read the
    other way round, and comparing dihedral lists would keep both."""
    V = np.array(rec["vertices"], float)
    d = np.linalg.norm(V[:, None, :] - V[None, :, :], axis=2)
    return (len(V), len(rec["faces"]),
            tuple(sorted(tuple(t) for t in rec["faceTypes"])),
            tuple(sorted(np.round(d[np.triu_indices(len(V), 1)] / q).astype(np.int64).tolist())))


def run(pruned, out_path, report_path, kmin=1, kmax=1, maxretro=0):
    blocks = ds.gather_blocks(pruned, kmin, kmax)
    records, failed = [], []
    t0 = time.time()
    for i, b in enumerate(blocks):
        recs, err = develop_block(b, maxretro)
        records.extend(recs) if recs else failed.append(err)
        if (i + 1) % max(1, len(blocks) // 50) == 0 or i + 1 == len(blocks):
            el = time.time() - t0
            print("  develop %d/%d  realized=%d  %.0fs elapsed, ETA %.0fs"
                  % (i + 1, len(blocks), len(records), el,
                     el / (i + 1) * (len(blocks) - i - 1)), file=sys.stderr, flush=True)
    seen, uniq = set(), []
    for r in records:
        k = congruence_key(r)
        if k in seen:
            continue
        seen.add(k)
        uniq.append(r)
    if len(uniq) != len(records):
        print("  %d records -> %d congruence classes" % (len(records), len(uniq)), file=sys.stderr)
    records = uniq
    if out_path:
        json.dump(records, open(out_path, "w"))
    if report_path:
        with open(report_path, "w") as fh:
            fh.write("euclidean develop report (k=%d..%d)\nblocks in      : %d\nrealized       : %d\n"
                     "non-realizable : %d\n" % (kmin, kmax, len(blocks), len(records), len(failed)))
            for e in failed:
                fh.write("   - %s  config=%s  reason=%s\n" % (e["id"], e["config"], e["reason"]))
    return records, failed


def _selftest():
    """The convention check that pins (*), on solids whose dihedral angles are published."""
    cases = [("tetrahedron 3.3.3", [math.pi / 3] * 3, math.acos(1 / 3.)),
             ("cube 4.4.4", [math.pi / 2] * 3, math.pi / 2),
             ("octahedron 3.3.3.3", [math.pi / 3] * 4, math.acos(-1 / 3.)),
             ("dodecahedron 5.5.5", [3 * math.pi / 5] * 3, math.acos(-1 / math.sqrt(5))),
             ("icosahedron 3^5", [math.pi / 3] * 5, math.acos(-math.sqrt(5) / 3)),
             ("cuboctahedron 3.4.3.4", [math.pi / 3, math.pi / 2] * 2, math.acos(-1 / math.sqrt(3)))]
    for name, alpha, th in cases:
        cyc = list(range(len(alpha)))
        r = link_residual(cyc, list(range(len(alpha))), alpha, [th] * len(alpha))
        assert np.max(np.abs(r)) < 1e-9, "%s: link does not close (%.2e)" % (name, np.max(np.abs(r)))
        print("[selftest] %-24s link closes at dihedral %.4f deg" % (name, math.degrees(th)))
    # and the law-of-cosines forcing must reproduce those same angles from the sides alone
    for name, alpha, th in cases:
        if len(alpha) != 3:
            continue
        got = forced_by_valence3([[0, 1, 2]], [0, 1, 2], alpha, 3)
        assert got is not None and all(abs(v - th) < 1e-12 for v in got.values()), name
        print("[selftest] %-24s valence-3 forcing gives %.4f deg with no search"
              % (name, math.degrees(list(got.values())[0])))
    print("[selftest] PASS")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pruned")
    ap.add_argument("--out")
    ap.add_argument("--report")
    ap.add_argument("--kmin", type=int, default=1)
    ap.add_argument("--kmax", type=int, default=1)
    ap.add_argument("--maxretro", type=int, default=0)
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        _selftest()
        return
    if not a.pruned:
        ap.error("--pruned is required")
    recs, failed = run(a.pruned, a.out, a.report, a.kmin, a.kmax, a.maxretro)
    print("realized %d records from %d blocks (%d non-realizable)"
          % (len(recs), len(recs) + len(failed), len(failed)))


if __name__ == "__main__":
    main()
