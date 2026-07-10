#!/usr/bin/env python3
"""Independent verifier for the 4 candidate 2-uniform star tilings (E1..E4).

Re-derives everything from the pruned blocks (extras4.txt) using render_cells.py's
decode/develop machinery, then applies its OWN exact checks:
  - vertex cone angle == 24 units exactly (unreduced accumulation, first closure)
  - strict face tracing (error on non-closure), one tile species per face
  - torus cell complex: V - E + F == 0, every edge has exactly 2 sides with
    opposite orientations, all faces consistently oriented
  - EXACT area check in ZZ[zeta_24]: 2*sum(face areas) == 2*|det| as ring elements
  - face simplicity per species (float, with reported margins)
  - full symmetry group Gamma/Lambda by exhaustive candidate search
    (linear parts zeta^j and zeta^j*conj, translations from anchor-face matching),
    then orbit count of counted (>=3-corner) vertices => k
  - finer-translation-lattice detection (pure translations not in Lambda)
  - orbit-word equivalence analysis (cyclic rotation + reversal)
  - tile-corner accounting identities (local-to-global closure)
"""
import os, sys, math, cmath, json, importlib.util
from collections import defaultdict

ORACLE = os.path.expanduser("~/.config/superpowers/worktrees/TilingAtlas/ctrnact-star/tools/ctrnact-oracle")
SCRATCH = os.path.dirname(os.path.abspath(__file__))

spec = importlib.util.spec_from_file_location("rc", os.path.join(ORACLE, "render_cells.py"))
rc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rc)

tab = rc.load_tables(os.path.join(ORACLE, "tables", "star24"))
D = tab.D
UNITS = tab.CLASS_UNITS
CTILE = tab.CLASS_TILE
CL = tab.CLASS_L
CP = tab.CLASS_P

ZERO = rc.ZERO
zadd, zsub, zscale, zfloat, ZK = rc.zadd, rc.zsub, rc.zscale, rc.zfloat, rc.ZK

# ---------------- exact ring extensions (mult, conj, imag) ----------------
def zmulpow(u, k):
    v = u
    for _ in range(k % 24):
        v = rc.zmul_zeta(v)
    return v

def zconj(v):
    out = zscale(ZK[0], v[0])
    for k in range(1, 8):
        out = zadd(out, zscale(ZK[(24 - k) % 24], v[k]))
    return out

def zmul(u, v):
    out = ZERO
    for k in range(8):
        if v[k]:
            out = zadd(out, zscale(zmulpow(u, k), v[k]))
    return out

def imag2(z):          # 2i * Im(z) as ring element, then rotate by -i => 2*Im(z) real elt
    w = zsub(z, zconj(z))          # = 2i Im(z)
    return zmulpow(w, 18)          # * zeta^18 = -i  => 2 Im(z)

# self-tests
import random
random.seed(1)
for _ in range(200):
    a = tuple(random.randint(-3, 3) for _ in range(8))
    b = tuple(random.randint(-3, 3) for _ in range(8))
    fa, fb = zfloat(a), zfloat(b)
    assert abs(zfloat(zmul(a, b)) - fa * fb) < 1e-9
    assert abs(zfloat(zconj(a)) - fa.conjugate()) < 1e-9
    assert abs(zfloat(imag2(a)) - 2 * fa.imag) < 1e-9
    assert abs(zfloat(imag2(a)).imag) < 1e-9

# ---------------- helpers ----------------
def tok_of_cls(c):
    t, L, P, u = CTILE[c], CL[c], CP[c], UNITS[c]
    if P == 1:
        return str(L)
    n = L // 2
    return "%d*%s%d" % (n, "p" if u < 12 else "d", u)

def species_name(t):
    for c in range(len(CTILE)):
        if CTILE[c] == t:
            L, P = CL[c], CP[c]
            if P == 1:
                return "{%d}" % L
            us = sorted(UNITS[c2] for c2 in range(len(CTILE)) if CTILE[c2] == t)
            return "%d*{p%d/d%d}" % (L // 2, us[0], us[1])
    return "?%d" % t

def cyc_variants(seq):
    n = len(seq); out = set()
    for s in (list(seq), list(reversed(seq))):
        for r in range(n):
            out.add(tuple(s[r:] + s[:r]))
    return out

def parse_word(sym):    # "(12*p6,6,12*p6,3)A" -> ("A", ("12*p6","6","12*p6","3"))
    flag = sym[sym.index(")") + 1:]
    return flag, tuple(sym[1:sym.index(")")].split(","))

# ---------------- per-candidate verification ----------------
def verify(name, vertype, conway, report):
    P = lambda *a: report.append(" ".join(str(x) for x in a))
    P("=" * 100)
    P("CANDIDATE %s: %s" % (name, vertype))
    P("conway: %s" % conway)

    rneig, lneig, mirro, cls, glue = rc.decode(tab, vertype, conway)
    nstub = len(rneig)
    # glue sanity: involution, no fixed points, total
    assert all(0 <= glue[i] < nstub for i in range(nstub)), "glue not total"
    assert all(glue[glue[i]] == i for i in range(nstub)), "glue not involution"
    nfix = sum(1 for i in range(nstub) if glue[i] == i)
    P("[quotient] %d stubs; glue is a total involution (%d self-glued stubs = C2-folded edges): OK"
      % (nstub, nfix))

    placed, T1, T2 = rc.develop(tab, rneig, cls, glue, sign=1)
    detelem = imag2(zmul(zconj(T1), T2))           # 2*det (signed), exact real elt
    detf = zfloat(detelem).real / 2.0
    P("[lattice] rank 2. T1=%s  T2=%s" % (T1, T2))
    P("[lattice] T1=%.9f%+.9fi  T2=%.9f%+.9fi  det=%.9f" %
      (zfloat(T1).real, zfloat(T1).imag, zfloat(T2).real, zfloat(T2).imag, detf))

    # ---- lattice membership (exact residual) ----
    f1, f2 = zfloat(T1), zfloat(T2)
    dd = f1.real * f2.imag - f1.imag * f2.real
    def lat_coords(p):
        pf = zfloat(p)
        return ((pf.real * f2.imag - pf.imag * f2.real) / dd,
                (f1.real * pf.imag - f1.imag * pf.real) / dd)
    def is_lat(v):
        a, b = lat_coords(v)
        m, n = round(a), round(b)
        return zsub(v, zadd(zscale(T1, m), zscale(T2, n))) == ZERO
    def lam_eq(p, q):
        return is_lat(zsub(p, q))
    def reduce_mod(p):
        a, b = lat_coords(p)
        m, n = math.floor(a + 1e-9), math.floor(b + 1e-9)
        return zsub(zsub(p, zscale(T1, m)), zscale(T2, n))

    # ---- vertex star walk (independent reimplementation, unreduced angle) ----
    def vertex_word(h0, d0):
        seq, cur, d, total = [], h0, d0 % D, 0
        for _ in range(4 * D):
            r = rneig[cur]
            u = UNITS[cls[r]]
            seq.append(cls[r])
            total += u
            d = (d + u) % D
            cur = r
            if cur == h0 and d == d0 % D:
                return seq, total
        raise RuntimeError("vertex star did not close")

    # ---- strict face tracing ----
    def trace_all_faces():
        faces = {}
        for key, pos in placed.items():
            h, d = key // D, key % D
            verts, corner_cls = [], []
            cur_h, cur_d, cur_pos = h, d, pos
            closed = False
            for _ in range(2 * tab.MAXL + 8):
                verts.append(cur_pos)
                g = glue[cur_h]
                npos = zadd(cur_pos, ZK[cur_d % D])
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
                faces[fkey] = (verts, t, corner_cls)
        return list(faces.values())

    faces = trace_all_faces()
    P("[faces] %d developed face instances traced; every walk closed; single species per face: OK"
      % len(faces))

    # ---- reduce faces mod Lambda, with exact pairwise inequivalence ----
    def face_key(verts):
        lm = min(verts)
        rel = tuple(sorted(zsub(v, lm) for v in verts))
        return lm, rel
    classes = {}
    for verts, t, cc in faces:
        lm, rel = face_key(verts)
        lst = classes.setdefault((t, rel), [])
        if not any(lam_eq(lm, lm2) for (lm2, _, _) in lst):
            lst.append((lm, verts, cc))
    cell_faces = []
    for (t, rel), lst in classes.items():
        for (lm, verts, cc) in lst:
            shift = zsub(reduce_mod(lm), lm)
            cell_faces.append(([zadd(v, shift) for v in verts], t, cc))
    Fcnt = len(cell_faces)
    from collections import Counter
    fspec = Counter(species_name(t) for _, t, _ in cell_faces)
    P("[cell] F = %d faces / cell: %s" % (Fcnt, dict(fspec)))

    # ---- exact area: 2*sum(face areas) vs 2*|det| ----
    two_area_total = ZERO
    orients = []
    for verts, t, _ in cell_faces:
        s = ZERO
        for i in range(len(verts)):
            s = zadd(s, zmul(zconj(verts[i]), verts[(i + 1) % len(verts)]))
        a2 = imag2(s)                     # = 2*2*A? no: sum Im(conj v_i v_{i+1}) = 2A; imag2 = 2*Im => 4A
        orients.append(zfloat(a2).real)
        two_area_total = zadd(two_area_total, a2)   # accumulates 4A per face
    assert all(o > 1e-6 for o in orients) or all(o < -1e-6 for o in orients), \
        "faces not consistently oriented"
    sgn = 1 if orients[0] > 0 else -1
    # exact identity: sum over faces of 4A_f == 4*|det| = 2*|2 det| = |2*imag2(det)|
    lhs = two_area_total if sgn > 0 else zscale(two_area_total, -1)
    det_sign = 1 if zfloat(detelem).real > 0 else -1
    rhs = zscale(detelem, 2 * det_sign)
    area_ok = (lhs == rhs)
    P("[area-EXACT] sum(4*A_f) coeffs = %s" % (lhs,))
    P("[area-EXACT] 4*|det|  coeffs = %s" % (rhs,))
    P("[area-EXACT] sum(face areas) == |det| exactly in ZZ[zeta24]: %s   (float: %.9f vs %.9f)"
      % ("OK" if area_ok else "FAIL", zfloat(lhs).real / 4, abs(detf)))
    P("[orient] all %d cell faces consistently %s oriented (min |4A| = %.6f)"
      % (Fcnt, "CCW" if sgn > 0 else "CW", min(abs(o) for o in orients)))

    # ---- vertices of the cell complex ----
    vreps = []          # exact reduced positions
    def vfind(p):
        pr_ = reduce_mod(p)
        for i, q in enumerate(vreps):
            if lam_eq(pr_, q):
                return i
        vreps.append(pr_)
        return len(vreps) - 1
    face_vidx = []
    for verts, t, _ in cell_faces:
        face_vidx.append([vfind(v) for v in verts])
    V = len(vreps)

    # directed edges mod Lambda: (vi, vj, exact direction tuple)
    dir_edges = Counter()
    for (verts, t, _), vidx in zip(cell_faces, face_vidx):
        L = len(verts)
        for i in range(L):
            a, b = verts[i], verts[(i + 1) % L]
            e = zsub(b, a)
            assert abs(abs(zfloat(e)) - 1.0) < 1e-9, "non-unit edge"
            dir_edges[(vidx[i], vidx[(i + 1) % L], e)] += 1
    ok_edges = True
    und = set()
    for (i, j, e), c in dir_edges.items():
        if c != 1 or dir_edges.get((j, i, zscale(e, -1)), 0) != 1:
            ok_edges = False
        und.add(frozenset([(i, j, e), (j, i, zscale(e, -1))]))
    E = len(und)
    euler = V - E + Fcnt
    P("[complex] V=%d E=%d F=%d  V-E+F=%d %s" % (V, E, Fcnt, euler,
      "OK (torus)" if euler == 0 else "FAIL"))
    P("[edges] every edge has exactly 2 sides with opposite orientations: %s"
      % ("OK" if ok_edges else "FAIL"))

    # ---- vertex words: match placed frames to cell vertices ----
    pos_by_v = defaultdict(list)
    for key, pos in placed.items():
        pos_by_v[key] = pos
    vert_word = {}
    for key, pos in placed.items():
        pr_ = reduce_mod(pos)
        for i, q in enumerate(vreps):
            if lam_eq(pr_, q):
                if i not in vert_word:
                    h, d = key // D, key % D
                    seq, total = vertex_word(h, d)
                    assert total == D, "cone angle %d units != 24 at vertex %d" % (total, i)
                    vert_word[i] = tuple(tok_of_cls(c) for c in seq)
                break
    missing = [i for i in range(V) if i not in vert_word]
    assert not missing, "cell vertices with no placed frame: %s" % missing
    P("[angles] all %d cell vertices have cone angle EXACTLY 24 units (first-closure, unreduced): OK" % V)

    counted = [i for i in range(V) if len(vert_word[i]) >= 3]
    fills = [i for i in range(V) if len(vert_word[i]) == 2]
    assert not [i for i in range(V) if len(vert_word[i]) < 2]
    for i in fills:
        us = sorted(UNITS[c] for c in []) # placeholder
    # dent-fill structure check
    for i in fills:
        toks = vert_word[i]
        kinds = sorted(("d" in t and "*" in t and t.split("*")[1][0] == "d") for t in toks)
        dcount = sum(1 for t in toks if "*" in t and t.split("*")[1][0] == "d")
        assert dcount == 1, "2-corner vertex %s is not dent+convex" % (toks,)
    wc = Counter()
    for i in range(V):
        wc[(vert_word[i], len(vert_word[i]) >= 3)] += 1
    P("[vertices/cell] %d total: %d counted (>=3 corners), %d dent-fills (=2 corners, each = 1 dent + 1 convex)"
      % (V, len(counted), len(fills)))
    for (w, isc), c in sorted(wc.items(), key=lambda x: (-x[0][1], x[0][0])):
        P("    %-38s x%-3d %s" % ("(" + ",".join(w) + ")", c, "COUNTED" if isc else "dent-fill"))

    # ---- claimed words vs developed words ----
    claimed = [parse_word(s) for s in vertype.split(", ")]
    claimed_counted = [w for f, w in claimed if len(w) >= 3]
    dev_words = set()
    for i in counted:
        dev_words.add(frozenset(cyc_variants(vert_word[i])))
    ok_claim = True
    for w in claimed_counted:
        if frozenset(cyc_variants(w)) not in dev_words:
            ok_claim = False
            P("    CLAIMED counted word %s NOT FOUND in development!" % (w,))
    P("[claim-match] every claimed counted orbit word realized in the developed cell: %s"
      % ("OK" if ok_claim else "FAIL"))

    # ---- word equivalence analysis among claimed counted words ----
    P("[word-equivalence] counted orbit words, pairwise cyclic-rotation+reversal comparison:")
    for a in range(len(claimed_counted)):
        wa = claimed_counted[a]
        rots = {tuple(list(wa)[r:] + list(wa)[:r]) for r in range(len(wa))}
        chir = "achiral (reversal is a rotation of the word)" \
            if tuple(reversed(wa)) in rots else "CHIRAL word (reversal is NOT a rotation)"
        P("    W%d = %s : %s" % (a + 1, wa, chir))
    for a in range(len(claimed_counted)):
        for b in range(a + 1, len(claimed_counted)):
            eq = tuple(claimed_counted[b]) in cyc_variants(claimed_counted[a])
            P("    W%d vs W%d equivalent under rotation+reversal: %s %s"
              % (a + 1, b + 1, eq,
                 "(=> could merge under a symmetry!)" if eq else "(=> NO isometry can identify them)"))

    # ---- tile-corner accounting (local-to-global closure) ----
    P("[accounting] tile-corner incidence identities:")
    role_from_vertices = Counter()
    for i in range(V):
        for t in vert_word[i]:
            role_from_vertices[t] += 1
    role_from_faces = Counter()
    for verts, t, cc in cell_faces:
        for c in cc:
            role_from_faces[tok_of_cls(c)] += 1
    acc_ok = role_from_vertices == role_from_faces
    for t in sorted(set(role_from_vertices) | set(role_from_faces)):
        P("    corner role %-8s demanded at vertices: %3d   supplied by faces: %3d  %s"
          % (t, role_from_vertices[t], role_from_faces[t],
             "OK" if role_from_vertices[t] == role_from_faces[t] else "MISMATCH"))
    P("[accounting] closure: %s" % ("OK" if acc_ok else "FAIL"))

    # ---- face simplicity per species (float, margins) ----
    def seg_dist(p, q, r, s):
        # min distance between segments pq and rs (float complex)
        def d_ps(a, b, c):
            ab = b - a
            t = 0.0 if abs(ab) < 1e-15 else max(0.0, min(1.0, ((c - a).real * ab.real + (c - a).imag * ab.imag) / (abs(ab) ** 2)))
            return abs(c - (a + t * ab))
        def inter(a, b, c, dd_):
            def cross(u, v): return u.real * v.imag - u.imag * v.real
            d1 = cross(b - a, c - a); d2 = cross(b - a, dd_ - a)
            d3 = cross(dd_ - c, a - c); d4 = cross(dd_ - c, b - c)
            return d1 * d2 < 0 and d3 * d4 < 0
        if inter(p, q, r, s):
            return -1.0
        return min(d_ps(p, q, r), d_ps(p, q, s), d_ps(r, s, p), d_ps(r, s, q))
    simp = {}
    for verts, t, _ in cell_faces:
        sn = species_name(t)
        if sn in simp:
            continue
        pts = [zfloat(v) for v in verts]
        L = len(pts)
        mind = math.inf
        for i in range(L):
            for j in range(i + 1, L):
                if j == i or (j == (i + 1) % L) or (i == (j + 1) % L) or (i == 0 and j == L - 1):
                    continue
                dq = seg_dist(pts[i], pts[(i + 1) % L], pts[j], pts[(j + 1) % L])
                mind = min(mind, dq)
        simp[sn] = mind
    for sn, mind in sorted(simp.items()):
        P("[simplicity] species %-14s min non-adjacent edge separation = %.6f  %s"
          % (sn, mind, "OK (simple)" if mind > 1e-6 else "SELF-INTERSECTING!"))

    # ---- symmetry group Gamma/Lambda + vertex orbits ----
    facedict = defaultdict(list)
    for (verts, t, _), vidx in zip(cell_faces, face_vidx):
        lm, rel = face_key(verts)
        facedict[(t, rel)].append(lm)
    def face_in_tiling(t, verts):
        lm, rel = face_key(verts)
        for lm2 in facedict.get((t, rel), []):
            if lam_eq(lm, lm2):
                return True
        return False
    def apply_op(j, refl, tvec, p):
        q = zconj(p) if refl else p
        return zadd(zmulpow(q, j), tvec)

    # anchor: species with fewest faces
    t_anchor = min(fspec, key=lambda s: fspec[s])
    anchors = [(verts, t) for verts, t, _ in cell_faces if species_name(t) == t_anchor]
    F0verts, F0t = anchors[0]
    syms = []
    def sym_known(j, refl, tvec):
        for (j2, r2, t2) in syms:
            if j2 == j and r2 == refl and lam_eq(tvec, t2):
                return True
        return False
    for refl in (False, True):
        for j in range(24):
            # linear part must normalize Lambda
            RT1 = apply_op(j, refl, ZERO, T1)
            RT2 = apply_op(j, refl, ZERO, T2)
            if not (is_lat(RT1) and is_lat(RT2)):
                continue
            RF0 = [apply_op(j, refl, ZERO, v) for v in F0verts]
            cand_ts = []
            for verts, t, _ in cell_faces:
                if t != F0t:
                    continue
                for w in verts:
                    for u in RF0:
                        tv = zsub(w, u)
                        cand_ts.append(tv)
            for tv in cand_ts:
                if not face_in_tiling(F0t, [zadd(v, tv) for v in RF0]):
                    continue
                if sym_known(j, refl, tv):
                    continue
                good = all(face_in_tiling(t, [apply_op(j, refl, tv, v) for v in verts])
                           for verts, t, _ in cell_faces)
                if good:
                    syms.append((j, refl, reduce_mod(tv)))
    n_rot = sum(1 for j, r, t in syms if not r)
    n_ref = len(syms) - n_rot
    extra_trans = [(j, r, t) for (j, r, t) in syms if j == 0 and not r and not is_lat(t)]
    P("[symmetry] |Gamma/Lambda| = %d  (%d orientation-preserving, %d orientation-reversing)"
      % (len(syms), n_rot, n_ref))
    P("[symmetry] rotation orders present: %s" %
      sorted(set((24 // math.gcd(24, j)) for j, r, t in syms if not r)))
    if extra_trans:
        P("[symmetry] WARNING: pure translations OUTSIDE Lambda found: %d -> develop's lattice was NOT maximal"
          % len(extra_trans))
    else:
        P("[symmetry] no pure translation outside Lambda: develop's period lattice is the full translation group: OK")

    # orbits of counted vertices under Gamma/Lambda
    parent = list(range(V))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    for (j, refl, tv) in syms:
        for i in range(V):
            q = apply_op(j, refl, tv, vreps[i])
            qr = reduce_mod(q)
            tgt = None
            for i2, rep in enumerate(vreps):
                if lam_eq(qr, rep):
                    tgt = i2
                    break
            assert tgt is not None, "symmetry does not permute vertex set!"
            union(i, tgt)
    orb = defaultdict(list)
    for i in range(V):
        orb[find(i)].append(i)
    corbs = [o for o in orb.values() if len(vert_word[o[0]]) >= 3]
    # a mixed orbit (counted + fill) would be a bug:
    for o in orb.values():
        kinds = set(len(vert_word[i]) >= 3 for i in o)
        assert len(kinds) == 1, "orbit mixes counted and dent-fill vertices!"
    P("[k-check] orbits of COUNTED vertices under full symmetry group: %d" % len(corbs))
    for o in corbs:
        P("    orbit size %2d, word %s" % (len(o), "(" + ",".join(vert_word[o[0]]) + ")"))
    fill_orbs = [o for o in orb.values() if len(vert_word[o[0]]) == 2]
    P("[k-check] dent-fill vertex orbits (not counted, Myers convention): %d" % len(fill_orbs))
    k = len(corbs)
    P("[k-check] k = %d  => %s" % (k, "PASS (2-uniform)" if k == 2 else "FAIL (claim was k=2)"))
    P("")
    return {
        "area_exact": area_ok, "euler": euler, "edges2sided": ok_edges,
        "k": k, "V": V, "E": E, "F": Fcnt, "det": abs(detf),
        "group_order": len(syms), "claim_match": ok_claim,
        "accounting": acc_ok, "simplicity": {k2: v for k2, v in simp.items()},
    }

def main():
    extras = os.path.join(ORACLE, "run-star-k2b6", "extras4.txt")
    blocks = list(rc.read_blocks(extras))
    # read_blocks yields (vertype, conway) but also picks up line 1 of each block?
    # It jumps i+=5 from the vertype line, so line1 is skipped. Verify count:
    print("blocks read: %d" % len(blocks), file=sys.stderr)
    report = []
    results = {}
    names = ["E1", "E2", "E3", "E4"]
    for name, (vertype, conway) in zip(names, blocks):
        results[name] = verify(name, vertype, conway, report)
    out = os.path.join(SCRATCH, "verify_report.txt")
    with open(out, "w") as f:
        f.write("\n".join(report) + "\n")
    print("\n".join(report))
    print(json.dumps({k: {kk: (vv if not isinstance(vv, dict) else vv) for kk, vv in v.items()} for k, v in results.items()}, indent=1, default=str))

if __name__ == "__main__":
    main()
