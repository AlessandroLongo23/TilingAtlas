"""
dsymbol.py  --  Delaney-Dress symbol foundation library (E1).

2D edge-to-edge tilings. Pure exact arithmetic via fractions.Fraction.
Python 3.9 compatible (NO match, NO "X | Y" type unions).

A Delaney-Dress symbol is the sextuple (n, s0, s1, s2, m01, m12) with m02 == 2
implicit. Chambers are 0..n-1 barycentric flags (vertex, edge, tile). The
involutions s_i have the fixed neighbour roles:
  s0 : keep edge & tile, move to the OTHER endpoint of the edge   (changes vertex)
  s1 : keep vertex & tile, move to the OTHER edge of the tile at v (changes edge)
  s2 : keep vertex & edge, move to the OTHER tile across the edge  (changes tile)

AXIOMS (Delgado-Friedrichs TCS-I Def 2 / Huson 1993):
  DS0 connected      : <s0,s1,s2> transitive on D.
  DS1 involutions    : s_i(s_i(c))==c. Fixed points ALLOWED (mirror chambers).
  DS2 s0 s2 commute  : s0(s2(c))==s2(s0(c)) for all c  (m02==2, r02==2).
  DS3 m constancy    : m01 constant on <s0,s1>-orbits, m12 on <s1,s2>-orbits.
  DS4 m a multiple   : m_ij(c) is a POSITIVE-INTEGER multiple of the (s_i s_j)-
                       cycle length r_ij(c); v_ij = m_ij / r_ij is a positive int.

READ-OFF (Tegula): {0,1}-orbits = tiles, {1,2}-orbits = vertices (= k),
{0,2}-orbits = edges. Curvature K = sum_c (1/m01[c] + 1/m12[c] - 1/2).
K<0 hyperbolic, K=0 Euclidean (orbifold flat), K>0 sphere.
"""

from fractions import Fraction


# ---------------------------------------------------------------------------
# Representation
# ---------------------------------------------------------------------------

class DSymbol(object):
    """A Delaney-Dress symbol. Stores n and the maps s0,s1,s2,m01,m12.

    s0,s1,s2 : dict chamber->chamber (involutions, fixed points allowed).
    m01,m12  : dict chamber->int (m02==2 implicit).
    Chambers are exactly the integers 0..n-1.
    """

    __slots__ = ("n", "s", "m01", "m12")

    def __init__(self, s0, s1, s2, m01, m12):
        # accept dicts keyed by chamber; derive n from the union of keys.
        chambers = set(s0.keys()) | set(s1.keys()) | set(s2.keys())
        chambers |= set(m01.keys()) | set(m12.keys())
        if chambers != set(range(len(chambers))):
            raise ValueError(
                "chambers must be exactly 0..n-1; got %s" % sorted(chambers))
        self.n = len(chambers)
        self.s = (dict(s0), dict(s1), dict(s2))
        self.m01 = dict(m01)
        self.m12 = dict(m12)

    # -- convenience accessors -------------------------------------------
    def s0(self, c):
        return self.s[0][c]

    def s1(self, c):
        return self.s[1][c]

    def s2(self, c):
        return self.s[2][c]

    def sigma(self, i, c):
        return self.s[i][c]

    def m(self, i, j, c):
        """m_ij(c) for {i,j} in {{0,1},{1,2},{0,2}}; m02==2 implicit."""
        pair = frozenset((i, j))
        if pair == frozenset((0, 1)):
            return self.m01[c]
        if pair == frozenset((1, 2)):
            return self.m12[c]
        if pair == frozenset((0, 2)):
            return 2
        raise ValueError("bad index pair %r,%r" % (i, j))

    @classmethod
    def from_dict(cls, d):
        """Build from a ground-truth-style dict (keys s0,s1,s2,m01,m12)."""
        return cls(d["s0"], d["s1"], d["s2"], d["m01"], d["m12"])

    def as_tuple(self):
        """A canonical-ish serialization for the CURRENT labeling.

        (n, s0-list, s1-list, s2-list, m01-list, m12-list) with each list
        indexed by chamber 0..n-1. This is NOT the isomorphism-canonical
        form (see canonical_form); it just reflects the present labels.
        """
        rng = range(self.n)
        return (
            self.n,
            tuple(self.s[0][c] for c in rng),
            tuple(self.s[1][c] for c in rng),
            tuple(self.s[2][c] for c in rng),
            tuple(self.m01[c] for c in rng),
            tuple(self.m12[c] for c in rng),
        )

    def __repr__(self):
        return "DSymbol(n=%d, %r)" % (self.n, self.as_tuple())


# ---------------------------------------------------------------------------
# Cycle / orbit helpers
# ---------------------------------------------------------------------------

def _cycle_length_ij(sym, i, j, c):
    """r_ij(c): smallest r>0 with (s_i s_j)^r (c) == c.

    The (s_i s_j) cycle map f(c) = s_i(s_j(c)). Always terminates because the
    permutation group is finite. Handles the degenerate fixed-point cases
    (f(c)==c => r==1)."""
    f = lambda x: sym.s[i][sym.s[j][x]]
    r = 0
    x = c
    while True:
        x = f(x)
        r += 1
        if x == c:
            return r
        if r > 4 * sym.n + 4:  # safety; r_ij <= n always for a valid symbol
            raise RuntimeError("cycle did not close (invalid involutions?)")


def components(sym, i, j):
    """Orbits of the group <s_i, s_j> on the chambers.

    Returns a list of frozensets (each an orbit), order-stable by the minimum
    chamber in each orbit. Uses BFS closure under s_i and s_j."""
    seen = set()
    orbits = []
    for start in range(sym.n):
        if start in seen:
            continue
        orbit = set()
        stack = [start]
        while stack:
            c = stack.pop()
            if c in orbit:
                continue
            orbit.add(c)
            seen.add(c)
            for g in (i, j):
                nxt = sym.s[g][c]
                if nxt not in orbit:
                    stack.append(nxt)
        orbits.append(frozenset(orbit))
    orbits.sort(key=lambda o: min(o))
    return orbits


def tile_orbits(sym):
    """{0,1}-components = tile orbits."""
    return components(sym, 0, 1)


def vertex_orbits(sym):
    """{1,2}-components = vertex orbits (their count = k, the uniformity)."""
    return components(sym, 1, 2)


def edge_orbits(sym):
    """{0,2}-components = edge orbits."""
    return components(sym, 0, 2)


def k_uniformity(sym):
    """k = number of {1,2}-components (vertex orbits)."""
    return len(vertex_orbits(sym))


# ---------------------------------------------------------------------------
# Axiom validation
# ---------------------------------------------------------------------------

def validate(sym):
    """Check all Delaney-Dress axioms DS0..DS4.

    Returns (ok, reason). reason == "" iff ok is True.
    """
    n = sym.n
    chambers = set(range(n))

    # domains
    for idx, name in ((0, "s0"), (1, "s1"), (2, "s2")):
        if set(sym.s[idx].keys()) != chambers:
            return (False, "%s domain != 0..n-1" % name)
    if set(sym.m01.keys()) != chambers:
        return (False, "m01 domain != 0..n-1")
    if set(sym.m12.keys()) != chambers:
        return (False, "m12 domain != 0..n-1")

    # values in range
    for idx, name in ((0, "s0"), (1, "s1"), (2, "s2")):
        for c in chambers:
            if sym.s[idx][c] not in chambers:
                return (False, "%s(%d) out of range" % (name, c))

    # DS1 involutions (fixed points allowed)
    for idx, name in ((0, "s0"), (1, "s1"), (2, "s2")):
        s = sym.s[idx]
        for c in chambers:
            if s[s[c]] != c:
                return (False, "DS1: %s is not an involution at %d" % (name, c))

    # DS2 s0 and s2 commute (m02==2)
    for c in chambers:
        if sym.s[0][sym.s[2][c]] != sym.s[2][sym.s[0][c]]:
            return (False, "DS2: s0,s2 do not commute at %d" % c)

    # DS0 connectivity: <s0,s1,s2> transitive
    seen = set()
    stack = [0]
    while stack:
        c = stack.pop()
        if c in seen:
            continue
        seen.add(c)
        for idx in (0, 1, 2):
            stack.append(sym.s[idx][c])
    if seen != chambers:
        return (False, "DS0: not connected (reached %d of %d)" % (len(seen), n))

    # DS3 m-constancy on the relevant components
    for orbit in components(sym, 0, 1):
        vals = set(sym.m01[c] for c in orbit)
        if len(vals) != 1:
            return (False, "DS3: m01 not constant on a {0,1}-orbit: %s"
                    % sorted(vals))
    for orbit in components(sym, 1, 2):
        vals = set(sym.m12[c] for c in orbit)
        if len(vals) != 1:
            return (False, "DS3: m12 not constant on a {1,2}-orbit: %s"
                    % sorted(vals))

    # DS4 m_ij is a positive-integer multiple of the cycle length r_ij,
    # i.e. v_ij = m_ij / r_ij is a positive integer.
    for c in chambers:
        # {0,1}
        r01 = _cycle_length_ij(sym, 0, 1, c)
        m = sym.m01[c]
        if not isinstance(m, int) or m <= 0:
            return (False, "DS4: m01(%d) not a positive int" % c)
        if m % r01 != 0:
            return (False,
                    "DS4: m01(%d)=%d not a multiple of r01=%d" % (c, m, r01))
        # {1,2}
        r12 = _cycle_length_ij(sym, 1, 2, c)
        m = sym.m12[c]
        if not isinstance(m, int) or m <= 0:
            return (False, "DS4: m12(%d) not a positive int" % c)
        if m % r12 != 0:
            return (False,
                    "DS4: m12(%d)=%d not a multiple of r12=%d" % (c, m, r12))
        # {0,2}: m02==2 implicit, and r02 MUST be 2 by DS2 (4-cycle of s0 s2),
        # EXCEPT degenerate fixed-point folds where r02 in {1,2}.
        r02 = _cycle_length_ij(sym, 0, 2, c)
        if 2 % r02 != 0:
            return (False, "DS4: m02=2 not a multiple of r02=%d" % r02)

    return (True, "")


# ---------------------------------------------------------------------------
# Curvature (exact)
# ---------------------------------------------------------------------------

def _chamber_curvature(sym, c):
    """(1/m01[c] + 1/m12[c] - 1/2) as an exact Fraction."""
    return (Fraction(1, sym.m01[c]) + Fraction(1, sym.m12[c]) - Fraction(1, 2))


def curvature(sym):
    """Exact global curvature K = sum over ALL chambers (Fraction)."""
    return sum((_chamber_curvature(sym, c) for c in range(sym.n)), Fraction(0))


def curvature_by_vertex_component(sym):
    """List of (orbit, sub_K) for each {1,2}-component (vertex orbit).

    sub_K = sum of chamber-curvatures over that component, exact Fraction.
    A component sub_K==0 <=> that vertex orbit's regular-polygon interior
    angles sum to exactly 360 deg (LOCAL flatness)."""
    out = []
    for orbit in vertex_orbits(sym):
        subK = sum((_chamber_curvature(sym, c) for c in orbit), Fraction(0))
        out.append((orbit, subK))
    return out


def is_euclidean(sym):
    """Global topological flatness: K == 0 (necessary, NOT sufficient)."""
    return curvature(sym) == 0


def per_component_flat(sym):
    """Every {1,2}-component sub-sum == 0 (per-vertex angle closure).

    Strictly stronger than is_euclidean: global K==0 admits 'mixed-sign
    ghosts' (one vertex orbit spherical, another hyperbolic). KEPT SEPARATE
    from is_euclidean on purpose -- their difference is a key finding."""
    for _orbit, subK in curvature_by_vertex_component(sym):
        if subK != 0:
            return False
    return True


# ---------------------------------------------------------------------------
# Canonical form  (Delgado-Friedrichs Algorithm 8)
# ---------------------------------------------------------------------------

def _relabel_from_seed(sym, seed):
    """Index-priority BFS relabeling from `seed` -> new tuple, or None.

    Assign seed -> new label 0. Repeatedly take the LOWEST-numbered
    already-labeled chamber and apply s0, s1, s2 in that fixed order; each
    newly-seen chamber gets the next new integer. Returns the rebuilt
    serialization tuple under the relabeling. Returns None only if the symbol
    is disconnected (some chamber never gets a label) -- canonical_form is
    defined for connected symbols.
    """
    n = sym.n
    new_of = {seed: 0}          # old chamber -> new label
    old_of = [seed]             # new label -> old chamber
    next_label = 1
    # process new labels in increasing order; this is the index-priority queue.
    head = 0
    while head < len(old_of):
        old_c = old_of[head]
        head += 1
        for idx in (0, 1, 2):
            nb = sym.s[idx][old_c]
            if nb not in new_of:
                new_of[nb] = next_label
                old_of.append(nb)
                next_label += 1
    if len(new_of) != n:
        return None  # disconnected

    # rebuild s0,s1,s2,m01,m12 indexed by NEW labels
    s0 = [0] * n
    s1 = [0] * n
    s2 = [0] * n
    mm01 = [0] * n
    mm12 = [0] * n
    for new_lab in range(n):
        old_c = old_of[new_lab]
        s0[new_lab] = new_of[sym.s[0][old_c]]
        s1[new_lab] = new_of[sym.s[1][old_c]]
        s2[new_lab] = new_of[sym.s[2][old_c]]
        mm01[new_lab] = sym.m01[old_c]
        mm12[new_lab] = sym.m12[old_c]
    return (n, tuple(s0), tuple(s1), tuple(s2), tuple(mm01), tuple(mm12))


def canonical_form(sym):
    """Delgado-Friedrichs Algorithm 8: lexicographically smallest relabeling.

    Try EVERY chamber as the BFS seed (index-priority relabel), serialize, and
    return the lex-min tuple. Isomorphic symbols -> identical canonical form;
    isomorphism test = equality of canonical forms. Brute-force over all seeds
    => independent of the input labeling (no homemade prune that could drop a
    class).
    """
    best = None
    for seed in range(sym.n):
        t = _relabel_from_seed(sym, seed)
        if t is None:
            continue
        if best is None or t < best:
            best = t
    if best is None:
        raise ValueError("canonical_form: symbol is disconnected/empty")
    return best


def from_canonical(t):
    """Inverse helper: build a DSymbol from a canonical_form tuple."""
    n, s0, s1, s2, mm01, mm12 = t
    return DSymbol(
        {c: s0[c] for c in range(n)},
        {c: s1[c] for c in range(n)},
        {c: s2[c] for c in range(n)},
        {c: mm01[c] for c in range(n)},
        {c: mm12[c] for c in range(n)},
    )


def relabel(sym, perm):
    """Apply a chamber relabeling. perm: dict old->new (a bijection of 0..n-1).

    Returns a NEW DSymbol with chambers renamed by perm. Used for testing
    relabeling-invariance of canonical_form.
    """
    n = sym.n
    if sorted(perm.keys()) != list(range(n)) or sorted(perm.values()) != list(range(n)):
        raise ValueError("perm must be a bijection of 0..n-1")
    inv = {v: kk for kk, v in perm.items()}

    def newmap(oldmap):
        return {perm[c]: perm[oldmap[c]] for c in range(n)}

    def newm(oldm):
        return {perm[c]: oldm[c] for c in range(n)}

    return DSymbol(
        newmap(sym.s[0]),
        newmap(sym.s[1]),
        newmap(sym.s[2]),
        newm(sym.m01),
        newm(sym.m12),
    )


# ---------------------------------------------------------------------------
# __main__  : full validation table against ground_truth + canonical tests
# ---------------------------------------------------------------------------

def _fmt_frac(x):
    """Print a Fraction compactly (e.g. 0, -1/12)."""
    if x.denominator == 1:
        return str(x.numerator)
    return "%d/%d" % (x.numerator, x.denominator)


def _run_validation():
    import random
    try:
        from ground_truth import GROUND_TRUTH
    except ImportError:
        import sys
        sys.path.insert(0, "/tmp/dd-experiments")
        from ground_truth import GROUND_TRUTH

    rows = []
    all_passed = True

    print("=" * 110)
    print("DELANEY-DRESS GROUND-TRUTH VALIDATION")
    print("=" * 110)
    header = ("%-26s %5s %8s %5s %5s %5s %4s %9s %6s %7s %5s" %
              ("name", "size", "K", "tile", "vert", "edge", "k",
               "valid", "eucl", "pcflat", "ok"))
    print(header)
    print("-" * 110)

    for name, S in GROUND_TRUTH.items():
        sym = DSymbol.from_dict(S)
        exp = S["expect"]

        ok_valid, reason = validate(sym)
        size = sym.n
        K = curvature(sym)
        nt = len(tile_orbits(sym))
        nv = len(vertex_orbits(sym))
        ne = len(edge_orbits(sym))
        kk = k_uniformity(sym)
        eucl = is_euclidean(sym)
        pcflat = per_component_flat(sym)

        # expected K may be float (the hyperbolic entry uses -1.0/12.0)
        expK = exp["K"]
        K_match = (K == Fraction(expK).limit_denominator(10 ** 6)
                   if isinstance(expK, float) else K == expK)

        match = (
            size == exp["size"] and K_match and
            nt == exp["tile_orbits"] and nv == exp["vertex_orbits"] and
            ne == exp["edge_orbits"] and kk == exp["k"] and
            eucl == exp["euclidean"] and pcflat == exp["all_components_flat"] and
            ok_valid
        )
        all_passed = all_passed and match

        rows.append(dict(
            name=name, size=size, K=_fmt_frac(K),
            tile_orbits=nt, vertex_orbits=nv, edge_orbits=ne, k=kk,
            valid=ok_valid, euclidean=eucl, per_component_flat=pcflat,
            matches_expected=match, reason=reason,
        ))

        print("%-26s %5d %8s %5d %5d %5d %4d %9s %6s %7s %5s" %
              (name, size, _fmt_frac(K), nt, nv, ne, kk,
               ("YES" if ok_valid else "NO:" + reason),
               eucl, pcflat, ("PASS" if match else "FAIL")))

    print("-" * 110)

    # ---- canonical_form tests -------------------------------------------
    print()
    print("=" * 110)
    print("CANONICAL FORM TESTS (Delgado-Friedrichs Algorithm 8)")
    print("=" * 110)

    random.seed(12345)

    # (a) idempotence: canon(canon(x)) == canon(x)
    idem_ok = True
    for name, S in GROUND_TRUTH.items():
        sym = DSymbol.from_dict(S)
        c1 = canonical_form(sym)
        c2 = canonical_form(from_canonical(c1))
        if c1 != c2:
            idem_ok = False
            print("  IDEMPOTENCE FAIL on %s" % name)
    print("(a) idempotence            canon(canon(x))==canon(x) : %s"
          % ("PASS" if idem_ok else "FAIL"))

    # (b) relabeling-invariance: canon(relabel(x)) == canon(x)
    relabel_ok = True
    for name, S in GROUND_TRUTH.items():
        sym = DSymbol.from_dict(S)
        base = canonical_form(sym)
        for _trial in range(20):
            ids = list(range(sym.n))
            shuffled = ids[:]
            random.shuffle(shuffled)
            perm = {old: new for old, new in zip(ids, shuffled)}
            relabeled = relabel(sym, perm)
            # the relabeled symbol must still validate and canonicalize equal
            okv, rsn = validate(relabeled)
            if not okv:
                relabel_ok = False
                print("  RELABEL-INVALID on %s: %s" % (name, rsn))
            if canonical_form(relabeled) != base:
                relabel_ok = False
                print("  RELABEL-INVARIANCE FAIL on %s" % name)
    print("(b) relabeling-invariance  canon(relabel(x))==canon(x): %s"
          % ("PASS" if relabel_ok else "FAIL"))

    # (c) the three regular symbols have pairwise-distinct canonical forms
    reg_names = ["hex_{6,3}", "square_{4,4}", "triangular_{3,6}"]
    reg_canon = {nm: canonical_form(DSymbol.from_dict(GROUND_TRUTH[nm]))
                 for nm in reg_names}
    distinct_ok = (len(set(reg_canon.values())) == len(reg_names))
    print("(c) regular-pairwise-distinct (hex/square/triangular) : %s"
          % ("PASS" if distinct_ok else "FAIL"))
    for nm in reg_names:
        print("      %-18s canon = %s" % (nm, reg_canon[nm]))

    canon_all = idem_ok and relabel_ok and distinct_ok
    all_passed = all_passed and canon_all

    print()
    print("=" * 110)
    print("ALL PASSED: %s" % all_passed)
    print("=" * 110)

    return rows, all_passed, dict(idempotence=idem_ok,
                                  relabeling_invariance=relabel_ok,
                                  regular_distinct=distinct_ok)


if __name__ == "__main__":
    _run_validation()
