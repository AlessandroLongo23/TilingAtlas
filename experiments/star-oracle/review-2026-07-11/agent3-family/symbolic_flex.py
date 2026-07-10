#!/usr/bin/env python3
"""Symbolic-alpha development of star-palette solution blocks.

For a pruned block, flex every star species' point angle: species s gets point angle
alpha_s = base_s + delta_s, dent angle = (2pi - 2pi/n) - alpha_s. Regular tiles are rigid.

Step 1 (linear pinning test): every vertex word must have angle sum 2pi for all delta
=> the sum of the delta-coefficients (+1 per point corner of s, -1 per dent corner of s)
must vanish per vertex, per species-direction. The admissible flex space is the integer
null space of that matrix. Dim 0 = PINNED. Dim >= 1: pick an integer basis direction.

Step 2 (formal development): develop the block exactly like render_cells.py, but a
direction is (t, m): angle = t*(pi/12) + m*delta along the chosen flex direction, and a
position is a Laurent polynomial sum_m z_m x^m, z_m in ZZ[zeta_24], x = e^{i delta}.
All equality tests are FORMAL (coefficient-wise). If the development closes formally and
the ZZ-span of all collected period vectors has rank exactly 2, the whole one-parameter
family closes for EVERY delta simultaneously with the same combinatorics: T1(delta),
T2(delta) are explicit finite Laurent expressions. If a vertex walk fails to close
formally, closure holds only at delta = 0 (the grid instance): pinned, confirming step 1.

Step 3 (per-alpha certificates, sympy): det(T1,T2)(alpha) as a function of alpha
(nonvanishing on the valid alpha interval) and the area identity
   N_star*A_star(alpha) + sum_regular N_t*A_t = |det Lambda(alpha)|
which upgrades "immersed development" to "embedded tiling" by the covering-degree
argument (local isometry from the flat combinatorial torus onto C/Lambda, equal areas
=> degree 1 => homeomorphism).
"""
import argparse
import importlib.util
import os
import re
import sys
from collections import deque
from fractions import Fraction

SP = os.path.dirname(os.path.abspath(__file__))
ORACLE = os.path.join(SP, "ctrnact-oracle")

# ---------------- exact ring ZZ[zeta_24] (rank 8, zeta^8 = zeta^4 - 1) ----------------
RANK = 8
ZERO8 = (0,) * RANK
ONE8 = (1,) + (0,) * (RANK - 1)

def zmul_zeta(v):
    c = list(v)
    return (-c[7], c[0], c[1], c[2], c[3] + c[7], c[4], c[5], c[6])

def zadd(u, v): return tuple(a + b for a, b in zip(u, v))
def zsub(u, v): return tuple(a - b for a, b in zip(u, v))

ZK = [ONE8]
for _ in range(23):
    ZK.append(zmul_zeta(ZK[-1]))

# ---------------- Laurent elements: dict m -> zeta24 8-vector ----------------
def lp_norm(p):
    return {m: v for m, v in p.items() if any(v)}

def lp_add(p, q):
    r = dict(p)
    for m, v in q.items():
        r[m] = zadd(r.get(m, ZERO8), v)
    return lp_norm(r)

def lp_sub(p, q):
    r = dict(p)
    for m, v in q.items():
        r[m] = zsub(r.get(m, ZERO8), v)
    return lp_norm(r)

def lp_mono(t, m):
    """zeta24^t * x^m"""
    return {m: ZK[t % 24]}

def lp_key(p):
    return tuple(sorted(lp_norm(p).items()))

LP0 = {}

# ---------------- tables + decode (verbatim decode logic from render_cells.py) --------
def load_tables(path):
    spec = importlib.util.spec_from_file_location("tables", os.path.join(path, "tables.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def edgelabel(edge, tile):
    return edge + ("@" + str(tile) if tile > 3 else "'" * tile)

def decipher(tok):
    m = re.match(r"(\*?)(\d+)('*)(?:@(\d+))?$", tok)
    til = len(m.group(3)) if not m.group(4) else int(m.group(4))
    return bool(m.group(1)), int(m.group(2)), til

def makeglue(conway, mirro, label):
    lidx = {l: i for i, l in enumerate(label)}
    glue = [-1] * len(mirro)
    for sym in re.findall(r"[\(\[][^\)\]]*[\)\]]", conway):
        mirror = sym[0] == "["
        toks = sym[1:-1].split(" ")
        if len(toks) == 1:
            toks = [toks[0], toks[0]]
        if mirror:
            toks[1] = "*" + toks[1]
        k = []
        for t in toks:
            mi = t.startswith("*")
            base = t[1:] if mi else t
            _, num, til = decipher(base)
            st = ("*" if mi else "") + edgelabel(str(num), til)
            k.append(lidx[st])
        glue[k[0]] = k[1]
        glue[k[1]] = k[0]
        glue[mirro[k[0]]] = mirro[k[1]]
        glue[mirro[k[1]]] = mirro[k[0]]
    return glue

def decode(tab, vertypeline, conwayline):
    syms = vertypeline.split(", ")
    idx = {s: i for i, s in enumerate(tab.SYMBOLS)}
    rneig, lneig, mirro, cls, label = [], [], [], [], []
    for j, s in enumerate(syms):
        i = idx[s]
        l = len(rneig)
        rneig += [l + x for x in tab.RNEIG[i]]
        lneig += [l + x for x in tab.LNEIG[i]]
        mirro += [l + x for x in tab.MIRRO[i]]
        cls += tab.CLS[i]
        label += [edgelabel(x, j) for x in tab.LABELS[i]]
    glue = makeglue(conwayline, mirro, label)
    return rneig, lneig, mirro, cls, glue

# ---------------- step 1: pinning test ----------------
def species_and_q(tab, cls_used):
    """star species present among used corner classes; qvec[class] = signed unit per species."""
    species = []          # tile ids of star species present
    for c in sorted(set(cls_used)):
        disp = tab.CLASS_DISP[c]
        if "*" in disp:
            t = tab.CLASS_TILE[c]
            if t not in species:
                species.append(t)
    qvec = {}
    for c in sorted(set(cls_used)):
        disp = tab.CLASS_DISP[c]
        q = [0] * len(species)
        if "*p" in disp:
            q[species.index(tab.CLASS_TILE[c])] = 1
        elif "*d" in disp:
            q[species.index(tab.CLASS_TILE[c])] = -1
        qvec[c] = tuple(q)
    return species, qvec

def vertex_words(vertypeline):
    return [re.match(r"\(([^)]*)\)", w).group(1).split(",") for w in vertypeline.split(", ")]

def vertex_qsums(tab, vertypeline, species):
    """delta-coefficient sum per vertex word, per species (from corner names)."""
    name_by_tile = {n: i for i, n in enumerate(tab.TILE_NAME)}
    rows = []
    for corners in vertex_words(vertypeline):
        row = [0] * len(species)
        for cn in corners:
            m = re.match(r"(\d+)\*([pd])(\d+)$", cn)
            if not m:
                continue
            n, pd, u = int(m.group(1)), m.group(2), int(m.group(3))
            a = u if pd == "p" else (24 - 24 // n - u)
            tile = name_by_tile[f"{n}*{a}"]
            if tile in species:
                row[species.index(tile)] += 1 if pd == "p" else -1
        rows.append(row)
    return rows

def int_nullspace(rows, n):
    """integer null space basis of the (len(rows) x n) matrix, via sympy."""
    from sympy import Matrix
    if not rows:
        return [tuple(1 if j == i else 0 for j in range(n)) for i in range(n)]
    M = Matrix(rows)
    ns = M.nullspace()
    basis = []
    for v in ns:
        denlcm = 1
        for e in v:
            denlcm = denlcm * Fraction(str(e)).denominator // __import__("math").gcd(denlcm, Fraction(str(e)).denominator)
        vv = tuple(int(e * denlcm) for e in v)
        g = 0
        for e in vv:
            g = __import__("math").gcd(g, e)
        basis.append(tuple(e // max(g, 1) for e in vv))
    return basis

# ---------------- step 2: formal development ----------------
def develop_formal(tab, rneig, cls, glue, qeff, sign=1, guard=400000):
    """Directions are (t mod 24, m); positions are Laurent elements. Returns
    (placed, periods) or raises with a formal-closure failure."""
    D = tab.D
    units = tab.CLASS_UNITS

    def star(h0, t0, m0):
        seq, cur, t, m = [], h0, t0, m0
        for _ in range(8 * D):
            seq.append((cur, t, m))
            r = rneig[cur]
            t = (t + sign * units[cls[r]]) % D
            m = m + sign * qeff[cls[r]]
            cur = r
            if cur == h0 and t == t0 and m == m0:
                return seq
            if cur == h0 and t == t0 and m != m0:
                raise FormalPin(f"vertex walk at stub {h0} returns with m={m}!=m0={m0}: "
                                f"angle sum depends on delta => closure only at delta=0")
        return None

    placed, periods = {}, []
    def reg(key, pos):
        if key in placed:
            if lp_key(placed[key]) != lp_key(pos):
                periods.append(lp_sub(pos, placed[key]))
            return False
        placed[key] = pos
        return True

    start = (0, 0, 0)
    reg(start, LP0)
    q = deque([(start, LP0)])
    expanded = set()
    g = 0
    while q:
        g += 1
        if g > guard:
            raise RuntimeError("BFS did not terminate")
        (h0, t0, m0), pos = q.popleft()
        pk = lp_key(pos)
        if pk in expanded:
            continue
        expanded.add(pk)
        seq = star(h0, t0, m0)
        if seq is None:
            raise RuntimeError("vertex star did not close (non-pin failure)")
        for h, t, m in seq:
            reg((h, t, m), pos)
            gg, gt, gm = glue[h], (t + D // 2) % D, m
            npos = lp_add(pos, lp_mono(t, m))
            if reg((gg, gt, gm), npos):
                q.append(((gg, gt, gm), npos))
    return placed, periods

class FormalPin(Exception):
    pass

# ---------------- period lattice over ZZ (formal) ----------------
def flatten_basis(elems):
    keys = sorted({(m, k) for p in elems for m, v in p.items() for k in range(RANK) if v[k]})
    kidx = {k: i for i, k in enumerate(keys)}
    vecs = []
    for p in elems:
        v = [0] * len(keys)
        for m, z in p.items():
            for k in range(RANK):
                if z[k]:
                    v[kidx[(m, k)]] = z[k]
        vecs.append(v)
    return keys, vecs

def period_lattice(periods):
    """ZZ-basis of the span of the formal period vectors; returns (rank, basis_elems)."""
    from sympy import Matrix
    from sympy.matrices.normalforms import hermite_normal_form
    uniq = {}
    for p in periods:
        uniq[lp_key(p)] = p
    elems = list(uniq.values())
    if not elems:
        return 0, []
    keys, vecs = flatten_basis(elems)
    M = Matrix(vecs)
    H = hermite_normal_form(M.T).T  # row-style HNF of the row span
    rows = [list(H.row(i)) for i in range(H.rows) if any(H.row(i))]
    basis = []
    for r in rows:
        p = {}
        for (m, k), c in zip(keys, r):
            if c:
                z = list(p.get(m, ZERO8))
                z[k] = int(c)
                p[m] = tuple(z)
        basis.append(lp_norm(p))
    return len(rows), basis

def in_lattice(p, basis):
    """is formal element p an integer combination of basis elements?"""
    from sympy import Matrix, linsolve, symbols
    if not any(lp_norm(p) for _ in [0]):
        return True
    elems = basis + [p]
    keys, vecs = flatten_basis(elems)
    A = Matrix(vecs[:-1]).T
    b = Matrix(vecs[-1])
    try:
        x, params = A.gauss_jordan_solve(b)
    except ValueError:
        return False
    if params.rows:
        x = x.subs({pp: 0 for pp in params})
    return all(e.is_integer for e in x)

# ---------------- step 3: sympy evaluation ----------------
def lp_to_sympy(p, delta):
    import sympy as sp
    z = sp.exp(sp.I * sp.pi / 12)
    e = 0
    for m, v in p.items():
        ze = sum(c * z ** k for k, c in enumerate(v))
        e += ze * sp.exp(sp.I * m * delta)
    return sp.simplify(e)

def face_walk(tab, rneig, cls, glue, qeff, start_key, placed, sign=1):
    D = tab.D
    units = tab.CLASS_UNITS
    h, t, m = start_key
    pos = placed[start_key]
    verts, corner_cls = [], []
    cur_h, cur_t, cur_m, cur_pos = h, t, m, pos
    for _ in range(128):
        verts.append(cur_pos)
        g = glue[cur_h]
        npos = lp_add(cur_pos, lp_mono(cur_t, cur_m))
        nh = rneig[g]
        corner = cls[nh]
        corner_cls.append(corner)
        nt = ((cur_t + D // 2) + sign * units[corner]) % D
        nm = cur_m + sign * qeff[corner]
        cur_h, cur_t, cur_m, cur_pos = nh, nt, nm, npos
        if cur_h == h and cur_t == t and cur_m == m:
            closed = lp_key(cur_pos) == lp_key(pos)
            return verts, corner_cls, closed
    return None, None, False

def trace_faces_formal(tab, rneig, cls, glue, qeff, placed, sign=1):
    faces = {}
    for key in placed:
        verts, ccls, closed = face_walk(tab, rneig, cls, glue, qeff, key, placed, sign)
        if verts is None:
            continue
        if not closed:
            raise RuntimeError("face walk failed to close FORMALLY")
        tiles = {tab.CLASS_TILE[c] for c in ccls}
        if len(tiles) != 1:
            continue
        fkey = frozenset(lp_key(v) for v in verts)
        if fkey not in faces:
            faces[fkey] = (verts, tiles.pop())
    return list(faces.values())

def dedupe_mod_lattice(items, basis):
    """items: list of (anchor_lp, payload). Returns representatives mod ZZ-span(basis)."""
    reps = []
    for anchor, payload in items:
        for ranchor, _ in reps:
            if in_lattice(lp_sub(anchor, ranchor), basis):
                break
        else:
            reps.append((anchor, payload))
    return reps

def face_canonical(verts):
    """translation-canonical form + anchor for a face."""
    best = None
    for v in verts:
        shape = tuple(sorted(lp_key(lp_sub(w, v)) for w in verts))
        if best is None or shape < best[0]:
            best = (shape, v)
    return best  # (shape, anchor)

# ---------------- analysis driver ----------------
def analyze(tab, name, vertype, conway, do_certs=True):
    print(f"\n=== {name} ===")
    print(f"    {vertype}")
    rneig, lneig, mirro, cls, glue = decode(tab, vertype, conway)
    species, qvec = species_and_q(tab, cls)
    sp_names = [tab.TILE_NAME[t] for t in species]
    rows = vertex_qsums(tab, vertype, species)
    print(f"    star species: {sp_names}; vertex delta-coefficient rows: {rows}")
    ns = int_nullspace(rows, len(species))
    print(f"    flex space dim = {len(ns)}" + (f", basis {ns}" if ns else "  => PINNED (alpha isolated)"))
    if not ns:
        # confirm mechanically that the symbolic development refuses to close
        qeff = {c: sum(qvec.get(c, (0,) * len(species))) for c in set(cls)}
        # use the first species direction to exhibit the failure
        qeff = {c: qvec.get(c, tuple([0] * len(species)))[0] for c in set(cls)}
        try:
            develop_formal(tab, rneig, cls, glue, qeff)
            print("    !! development unexpectedly closed — check by hand")
        except FormalPin as e:
            print(f"    formal development: {e}")
        return None
    if len(ns) > 1:
        print("    (multi-dim flex space; analyzing first basis direction only)")
    direction = ns[0]
    qeff = {c: sum(d * q for d, q in zip(direction, qvec.get(c, tuple([0] * len(species)))))
            for c in set(cls)}
    placed, periods = develop_formal(tab, rneig, cls, glue, qeff)
    rank, basis = period_lattice(periods)
    print(f"    formal development closed: {len(placed)} frames, {len(periods)} period hits, "
          f"formal period-lattice rank = {rank}")
    if rank != 2:
        print("    => rank != 2: closure does NOT hold identically in alpha; family not free")
        return None
    T1, T2 = basis
    # verify every period is an integer combination of T1,T2 (formal)
    bad = sum(0 if in_lattice(p, basis) else 1 for p in periods)
    print(f"    all {len(periods)} periods in ZZ*T1+ZZ*T2 formally: {'YES' if bad == 0 else f'NO ({bad} fail)'}")

    faces = trace_faces_formal(tab, rneig, cls, glue, qeff, placed)
    face_items = []
    for verts, tile in faces:
        shape, anchor = face_canonical(verts)
        face_items.append((anchor, (shape, tile, verts)))
    # group by shape first to cut pairwise lattice tests
    byshape = {}
    for anchor, (shape, tile, verts) in face_items:
        byshape.setdefault((shape, tile), []).append((anchor, verts))
    fcounts = {}
    all_reps = []
    for (shape, tile), lst in byshape.items():
        reps = dedupe_mod_lattice([(a, v) for a, v in lst], basis)
        fcounts[tile] = fcounts.get(tile, 0) + len(reps)
        all_reps += [(tile, v) for _, v in reps]
    print(f"    faces per fundamental domain: "
          + ", ".join(f"{tab.TILE_NAME[t]} x{c}" for t, c in sorted(fcounts.items())))
    # vertices per fundamental domain
    vitems = dedupe_mod_lattice([(pos, None) for pos in {lp_key(p): p for p in placed.values()}.values()], basis)
    V = len(vitems)
    E = sum(len(v) for _, v in all_reps) // 2
    F = sum(fcounts.values())
    print(f"    quotient counts: V={V} E={E} F={F}  (Euler on torus: V-E+F = {V - E + F}, expect 0)")

    if not do_certs:
        return direction, basis, fcounts
    import sympy as sp
    u = sp.symbols("u")     # u = exp(I*delta/2), delta = flex of the family parameter
    z = sp.symbols("zsym")  # z = exp(I*pi/24), primitive 48th root of unity
    cyc48 = sp.cyclotomic_poly(48, z)
    Iz = z ** 12            # imaginary unit

    def lp_to_u(p):
        e = 0
        for m, v in p.items():
            ze = sum(c * z ** (2 * k) for k, c in enumerate(v) if c)  # zeta24^k = z^(2k)
            e += ze * u ** (2 * m)
        return sp.expand(e)

    def conj_u(e):
        """conjugate on |u|=|z|=1: u -> 1/u, z -> 1/z."""
        return sp.expand(e.subs({u: 1 / u, z: 1 / z}, simultaneous=True))

    t1u, t2u = lp_to_u(T1), lp_to_u(T2)
    detu = sp.cancel((conj_u(t1u) * t2u - conj_u(t2u) * t1u) / (2 * Iz))

    def tan_z(n):
        w = z ** (24 // n)
        return sp.cancel((w - 1 / w) / (Iz * (w + 1 / w)))

    def sin_u(a_units, k):
        """sin(a_units*pi/24 + k*delta/2) as Laurent in u, z."""
        return (z ** a_units * u ** k - z ** (-a_units) * u ** (-k)) / (2 * Iz)

    area = 0
    sp_idx = {t: i for i, t in enumerate(species)}
    for t, c in fcounts.items():
        nm = tab.TILE_NAME[t]
        if "*" in nm:
            n, a = map(int, nm.split("*"))
            d_s = direction[sp_idx[t]]
            s_half = sin_u(a, d_s)          # sin(alpha/2), alpha0 = a*pi/12
            s_full = sin_u(2 * a, 2 * d_s)  # sin(alpha)
            ngon = sp.Rational(n, 4) * (2 * s_half) ** 2 / tan_z(n)
            area += c * (ngon + sp.Rational(n, 2) * s_full)
        else:
            n = int(nm)
            area += c * sp.Rational(n, 4) / tan_z(n)
    area = sp.cancel(sp.together(area))

    def is_zero_laurent(e):
        """exact zero test for a Laurent polynomial in u, z modulo Phi_48(z)."""
        num, den = sp.fraction(sp.cancel(sp.together(sp.expand(e))))
        # denominator must not be divisible by Phi_48 (it is a product of cyclotomic
        # units times powers of u/z, so this holds; assert anyway)
        num = sp.expand(num)
        if num == 0:
            return True
        try:
            poly = sp.Poly(num, u)
        except sp.PolynomialError:
            return sp.simplify(num) == 0
        for cf in poly.all_coeffs():
            cfn, cfd = sp.fraction(sp.cancel(sp.together(cf)))
            if sp.expand(sp.rem(sp.expand(cfn), cyc48, z)) != 0:
                return False
        return True

    minus_ok = is_zero_laurent(area - detu)
    plus_ok = is_zero_laurent(area + detu)
    print(f"    area certificate: sum(tile areas) == |det(T1,T2)| identically? "
          f"{'YES' if (minus_ok or plus_ok) else 'NO'} "
          f"(area-det==0: {minus_ok}, area+det==0: {plus_ok})")

    # det as real trig function of delta, closed form + positivity on the alpha-interval
    delta = sp.symbols("delta", real=True)
    fdet = detu.subs({z: sp.exp(sp.I * sp.pi / 24), u: sp.exp(sp.I * delta / 2)})
    fdet = sp.simplify(sp.expand_complex(sp.expand(fdet)))
    fdet = sp.trigsimp(sp.expand_trig(fdet))
    print(f"    det(delta) = {fdet}")
    # valid delta interval: intersection over species of 0 < a_s*pi/12 + dir_s*delta < pi - 2*pi/n_s
    lo, hi = -sp.oo, sp.oo
    for t in species:
        nm = tab.TILE_NAME[t]
        n, a = map(int, nm.split("*"))
        d_s = direction[sp_idx[t]]
        if d_s == 0:
            continue
        b1 = -sp.Rational(a, 12) * sp.pi / d_s
        b2 = (sp.pi - 2 * sp.pi / n - sp.Rational(a, 12) * sp.pi) / d_s
        l, h = (b1, b2) if d_s > 0 else (b2, b1)
        lo, hi = sp.Max(lo, l), sp.Min(hi, h)
    print(f"    valid delta interval: ({lo}, {hi})  [alpha over full species range]")
    # rigorous positivity: grid + Lipschitz bound on the closed interval
    dP = sp.diff(fdet, delta)
    import mpmath
    f = sp.lambdify(delta, fdet, "mpmath")
    df = sp.lambdify(delta, dP, "mpmath")
    a_, b_ = float(lo), float(hi)
    N = 4001
    hstep = (b_ - a_) / (N - 1)
    vals = [f(a_ + i * hstep) for i in range(N)]
    vmin = min(abs(v) if isinstance(v, complex) else v for v in vals)
    dmax = max(abs(df(a_ + i * hstep)) for i in range(N))
    margin = float(vmin) - float(dmax) * hstep  # crude Lipschitz-style bound
    sgn = 1 if vals[N // 2] > 0 else -1
    print(f"    |det| on closed interval: min sampled {float(vmin):.6f}, max|det'| {float(dmax):.4f}, "
          f"grid step {hstep:.6f} => rigorous min > {margin:.6f} "
          f"({'NONVANISHING: rank 2 on the whole interval' if margin > 0 else 'INCONCLUSIVE'})")
    return direction, basis, fcounts

def read_blocks(path):
    lines = [l.rstrip("\n") for l in open(path)]
    i = 0
    while i < len(lines):
        if lines[i].startswith("("):
            yield lines[i], lines[i + 4]
            i += 5
        else:
            i += 1

def main():
    tab = load_tables(os.path.join(ORACLE, "tables", "star24"))
    targets = []
    cat_orig = os.path.join(ORACLE, "run-star-k2b6", "pruned", "eupruned_02.txt")
    catalogs = {"orig-k2": cat_orig}
    import glob as _g
    newfiles = sorted(_g.glob(os.path.join(ORACLE, "run-a3-k2b6", "out", "pruned", "eupruned_02_*.txt")))
    k1files = sorted(_g.glob(os.path.join(ORACLE, "run-a3-k2b6", "out", "pruned", "eupruned_01_*.txt")))
    want = [
        ("E4 (a=1)", "(3*d15,3,3*p1,3)A, (3*d15,3*p1,3,3)F"),
        ("E3 (a=2)", "(3*d14,3,3*p2,3)A, (3*d14,3*p2,3,3)F"),
        ("N1 (a=3, predicted sibling)", "(3*d13,3,3*p3,3)A, (3*d13,3*p3,3,3)F"),
        ("Myers family, same tiles (a=2) [positive control]", "(3*d14,3*p2,3,3)F, (3,3,3,3,3,3)R6"),
        ("N2 = Myers family at a=3", "(3*d13,3*p3,3,3)F, (3,3,3,3,3,3)R6"),
        ("E1 [expect PINNED]", "(12*d16,6)A, (12*p6,6,12*p6,3)A, (12*d16,3,3)A"),
        ("E2 [expect PINNED]", "(12*d18,4)A, (12*p4,4,12*p4,3,12*p2,3)A, (12*d18,12*p2,3)F, (12*d20,3)F, (12*p4,12*d20)A"),
        ("N3 (6-star family a=3,b=5)", "(6*d15,3*p3,4)F, (6*p5,3*d13,4)F"),
        ("N3 sibling (a=2,b=4) already in catalog", "(6*d16,3*p2,4)F, (6*p4,3*d14,4)F"),
        ("k=1 uniform G&S family at a=3", "(3*d13,3,3*p3,3)A"),
    ]
    blocks = {}
    for f in [cat_orig] + newfiles + k1files:
        for vt, cw in read_blocks(f):
            blocks[vt] = cw
    for name, vt in want:
        if vt not in blocks:
            print(f"\n=== {name} ===\n    BLOCK NOT FOUND: {vt}")
            continue
        try:
            analyze(tab, name, vt, blocks[vt])
        except Exception as e:
            import traceback
            print(f"    ERROR: {e}")
            traceback.print_exc()

if __name__ == "__main__":
    main()
