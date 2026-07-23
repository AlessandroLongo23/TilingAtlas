#!/usr/bin/env python3
"""Delaney–Dress symbol of a Čtrnáct block, from its quotient darts.

Why: the ball-code identity in hyperbolic_identity.py answers "are these two tilings different?" with a
radius, and a radius is always a guess. The D-symbol answers it exactly. Its MINIMAL IMAGE is the tiling
under its FULL symmetry group (Delgado-Friedrichs), so

    number of {1,2}-orbits of the minimal image = k, exactly, not a lower bound
    canonical form of the minimal image          = a complete isomorphism invariant

which is what the shelf needs before it can print "k=" on a card. The Euclidean precedent is in
experiments/delaney-dress/FINDINGS.md: 93 naive k=1 candidates collapse to exactly 11 = A068599(1) under
minimal image, all of it combinatorial.

CONSTRUCTION. A block gives darts h with rneig (step round the vertex), glue (cross the edge, an
involution that may fix mirror edges) and lvert. develop_hyperbolic turns h into rneig[h] through the
interior angle of lvert[rneig[h]], so the face swept between h and rneig[h] is

    F(h) = lvert[rneig[h]]

A chamber is a (vertex, edge, face) flag, so each dart carries two — one per side of its edge:

    chamber (h, +) = the flag whose face is F(h)            (between h and rneig[h])
    chamber (h, -) = the flag whose face is F(rneig^-1[h])  (between rneig^-1[h] and h)

    sigma2 (swap face, keep vertex+edge):  (h,+) <-> (h,-)
    sigma1 (swap edge, keep vertex+face):  (h,+) <-> (rneig[h],-)     — the face's other edge at v
    sigma0 (swap vertex, keep edge+face):  (h,+) <-> (glue[h],-)      — the far end of the same edge

m01 is the face's size and m12 the vertex's VALENCE — the valence of the tiling, not the length of the
quotient's rneig cycle. That distinction is the whole point: 6.4.6.4 and 6.4.6.4.6.4 have identical dart
structures and are told apart only by m12 (4 vs 6). The darts alone cannot supply it; the block's forced
edge length can, exactly: the developer realises each face F as a regular F-gon of edge l, so one lap of
the quotient cycle sweeps sum-of-interior-angles radians and the vertex closes after v = 2π/that laps.
That v is a clean integer for every genuine block (the solver picked l to make it so), needs no trust in
the solver's config STRING, and — unlike matching against the config string — is unambiguous when a k>=2
block carries two orbits whose cycles are rotations of each other with different wrap counts. Axiom DS4
(m a positive-integer multiple of the cycle length) is exactly the statement that the quotient wraps the
vertex m/r times.

The result is a valid but generally NON-minimal symbol — a sub-symmetry encoding. minimal_image collapses
it; that collapse is the step this pipeline was missing. Its refinement loop re-indexes the class
signatures to dense integers every round — the naive version nests tuples 4x deeper per round and goes
exponential on symbols that need many rounds (hyp-k2-3-3-3-4-4-4__3-3-3-4-4-4 ran 38 s; this runs ms).
"""
import math
import os
import sys

_DD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "experiments", "delaney-dress")
sys.path.insert(0, os.path.abspath(_DD))

from dsymbol import DSymbol, validate, canonical_form, vertex_orbits, tile_orbits, curvature  # noqa: E402

TWO_PI = 2 * math.pi


def _interior_angle(p, l):
    """Interior angle of a regular p-gon of edge l in H². Local copy so this module stays importable
    without develop_hyperbolic (same formula)."""
    r = math.cos(math.pi / p) / math.cosh(l / 2)
    return 2 * math.asin(min(1.0, max(-1.0, r)))


def minimal_image(sym, with_proj=False):
    """Coarsest label-respecting congruence, then the quotient by it.

    Partition refinement in the style of DFA minimisation: start from the (m01, m12) labels and refine
    until stable under all three involutions, RE-INDEXING the signatures to dense ints each round so the
    per-round cost stays O(n). Delgado-Friedrichs: the quotient is the unique maximal-symmetry
    representative of the tiling. with_proj=True also returns the chamber -> minimal-chamber map."""
    n = sym.n
    ids = {}
    cls = [0] * n
    for c in range(n):
        key = (sym.m01[c], sym.m12[c])
        if key not in ids:
            ids[key] = len(ids)
        cls[c] = ids[key]
    prev = len(ids)
    while True:
        ids = {}
        nxt = [0] * n
        for c in range(n):
            key = (cls[c], cls[sym.s[0][c]], cls[sym.s[1][c]], cls[sym.s[2][c]])
            if key not in ids:
                ids[key] = len(ids)
            nxt[c] = ids[key]
        cls = nxt
        if len(ids) == prev:      # a refinement with equal class count is the same partition: stable
            break
        prev = len(ids)
    rep = {}
    for c in range(n):
        rep.setdefault(cls[c], c)
    s0, s1, s2, m01, m12 = {}, {}, {}, {}, {}
    for b in range(len(rep)):
        c = rep[b]
        s0[b] = cls[sym.s[0][c]]
        s1[b] = cls[sym.s[1][c]]
        s2[b] = cls[sym.s[2][c]]
        m01[b] = sym.m01[c]
        m12[b] = sym.m12[c]
    mi = DSymbol(s0, s1, s2, m01, m12)
    if with_proj:
        return mi, list(cls)
    return mi


def _cycles(perm, n):
    seen, out = [False] * n, []
    for i in range(n):
        if seen[i]:
            continue
        cyc, j = [], i
        while not seen[j]:
            seen[j] = True
            cyc.append(j)
            j = perm[j]
        out.append(cyc)
    return out


def valences(rneig, lvert, l):
    """valence per dart: the length of the tiling's vertex figure. One lap of the quotient cycle sweeps
    the cycle's interior-angle sum at edge length l; the vertex closes after 2π/that laps, so the wrap
    count comes back from the geometry the developer itself uses. Raises ValueError when a cycle's wrap
    count is not a clean integer — that block is not a tiling at this l."""
    n = len(rneig)
    out = [0] * n
    for cyc in _cycles(rneig, n):
        seq = [lvert[rneig[h]] for h in cyc]          # faces swept, in rotation order
        s = sum(_interior_angle(p, l) for p in seq)
        v = TWO_PI / s
        vi = round(v)
        if vi < 1 or abs(v - vi) > 1e-6:
            raise ValueError("vertex cycle %s does not close at l=%.6f (wraps=%.6f)" % (seq, l, v))
        for h in cyc:
            out[h] = vi * len(seq)
    return out


def seed_component(rneig, glue, seed=0):
    """The darts reachable from the seed under {rneig, glue}.

    A block's arrays can carry darts the seed never reaches — develop_patch floods from dart 0 and so
    only ever realises this component, and a D-symbol built over the whole array fails DS0. Restricting
    here makes the symbol describe the tiling the developer actually draws."""
    n = len(rneig)
    seen, stack = {seed}, [seed]
    while stack:
        h = stack.pop()
        for nxt in (rneig[h], glue[h]):
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return sorted(seen)


def restrict(rneig, glue, lvert, seed=0):
    """Re-index a block down to the seed component. Returns (rneig, glue, lvert)."""
    keep = seed_component(rneig, glue, seed)
    idx = {h: i for i, h in enumerate(keep)}
    return ([idx[rneig[h]] for h in keep],
            [idx[glue[h]] for h in keep],
            [lvert[h] for h in keep])


def dsymbol_from_darts(rneig, glue, lvert, l):
    """Build the (generally non-minimal) D-symbol of a block at edge length l.
    Chamber (h,s) -> 2*h + (0 for +, 1 for -). Input arrays must already be seed-restricted."""
    n = len(rneig)
    rinv = [0] * n
    for i, x in enumerate(rneig):
        rinv[x] = i
    val = valences(rneig, lvert, l)
    plus = lambda h: 2 * h
    minus = lambda h: 2 * h + 1
    s0, s1, s2, m01, m12 = {}, {}, {}, {}, {}
    for h in range(n):
        fplus = lvert[rneig[h]]                        # face between h and rneig[h]
        fminus = lvert[h]                              # face between rneig^-1[h] and h
        s2[plus(h)] = minus(h)
        s2[minus(h)] = plus(h)
        s1[plus(h)] = minus(rneig[h])
        s1[minus(h)] = plus(rinv[h])
        s0[plus(h)] = minus(glue[h])
        s0[minus(h)] = plus(glue[h])
        m01[plus(h)], m01[minus(h)] = fplus, fminus
        m12[plus(h)] = m12[minus(h)] = val[h]
    return DSymbol(s0, s1, s2, m01, m12)


def _canon_cycle(seq):
    m = len(seq)
    if m == 0:
        return ()
    cands = [tuple(s[i:] + s[:i]) for s in (list(seq), list(seq)[::-1]) for i in range(m)]
    return min(cands)


def analyse(rneig, glue, lvert, l):
    """Full identity of a block at edge length l.

    Returns a dict:
      valid   bool; when False, `reason` says why and nothing else is set
      key     canonical_form of the minimal image — THE identity, hashable, no radius anywhere
      k       #{1,2}-orbits of the minimal image = the true orbit count
      n       size of the minimal image
      orbits  sorted canonical vertex figures, one per {1,2}-orbit of the minimal image (int tuples),
              read back through the quotient projection so each orbit reports the figure of an actual
              vertex in its class
      sym     the minimal DSymbol itself
    """
    try:
        rr, gg, ll = restrict(rneig, glue, lvert)
        sym = dsymbol_from_darts(rr, gg, ll, l)
    except ValueError as e:
        return {"valid": False, "reason": str(e)}
    ok, reason = validate(sym)
    if not ok:
        return {"valid": False, "reason": reason}
    mi, proj = minimal_image(sym, with_proj=True)
    okm, reasonm = validate(mi)
    if not okm:
        return {"valid": False, "reason": "minimal image invalid: %s" % reasonm}

    # Vertex figure per minimal {1,2}-orbit: pull any pre-image chamber back to its dart, take that
    # dart's quotient cycle's face sequence, and repeat it wrap-count times to the full figure.
    n = len(rr)
    val = valences(rr, ll, l)
    cyc_of = {}
    for cyc in _cycles(rr, n):
        for h in cyc:
            cyc_of[h] = cyc
    orbit_fig = {}
    for orb in vertex_orbits(mi):
        b = min(orb)
        c = proj.index(b)                              # any chamber mapping onto this orbit's rep
        h = c // 2
        cyc = cyc_of[h]
        seq = [ll[rr[x]] for x in cyc]
        fig = seq * (val[h] // len(seq))
        orbit_fig[b] = _canon_cycle(fig)
    return {"valid": True, "key": canonical_form(mi), "k": len(orbit_fig), "n": mi.n,
            "orbits": sorted(orbit_fig.values()), "sym": mi}


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from develop_hyperbolic import solve_edge_length

    print("== regular {p,q}: minimal symbol must be a single chamber, k=1, curvature < 0 ==")
    # The REAL block for {p,q} is ONE self-glued dart (rneig=[0], glue=[0], lvert=[p]) — the maximal
    # quotient. The q-dart "one dart per edge at the vertex" version is NOT a valid block (fails DS4);
    # that mistake is on record in NOTES §80.
    for (p, q) in [(8, 3), (7, 3), (5, 4), (4, 6), (3, 7), (3, 8), (6, 4)]:
        l = solve_edge_length([p] * q)
        r = analyse([0], [0], [p], l)
        if not r["valid"]:
            print(f"  {{{p},{q}}}: INVALID {r['reason']}")
            continue
        print(f"  {{{p},{q}}}: minimal n={r['n']} k={r['k']} K={curvature(r['sym'])} "
              f"tiles={len(tile_orbits(r['sym']))} orbits={['.'.join(map(str, o)) for o in r['orbits']]}")

    print("== wrap count from geometry: {6,4} vs 6.4.6.4 vs 6.4.6.4.6.4 must all differ ==")
    # 6.4.6.4 and 6.4.6.4.6.4 share the dart structure rneig=[1,0], glue=[1,0], lvert=[4,6]; only the
    # edge length differs. The valence (and so the D-symbol) must come back different.
    for cfg in ([6, 4, 6, 4], [6, 4, 6, 4, 6, 4]):
        l = solve_edge_length(cfg)
        r = analyse([1, 0], [1, 0], [4, 6], l)
        fig = ".".join(map(str, r["orbits"][0])) if r["valid"] else "-"
        print(f"  cfg={'.'.join(map(str, cfg))}: l={l:.4f} valid={r['valid']} "
              f"minimal n={r.get('n')} k={r.get('k')} figure={fig}")
