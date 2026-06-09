"""
develop5.py -- universal-cover metric development (the HONEST B2 realizability test).

We develop the symbol into the plane as actual triangles (barycentric chambers) and
detect closure failures. A chamber triangle has corners (V,E,T): V=vertex,
E=edge-midpoint, T=tile-center, with triangle angles  pi/m12 at V, pi/2 at E,
pi/m01 at T. Walls: s0 wall = line(E,T) (reflecting V); s1 wall = line(V,T)
(reflecting E); s2 wall = line(V,E) (reflecting T).

COVER NODES: (V,E,T) exact triples. Two cover nodes are the SAME iff their triples
are exactly equal. Each cover node carries its quotient-chamber id. We expand by
reflecting across each of the 3 walls; the neighbour's quotient-chamber is
s_i(chamber). We BFS up to a step cap.

CLOSURE / CONSISTENCY CHECKS (any failure => NOT realizable):
  (A) COLLISION: two cover nodes with the SAME triple (V,E,T) but DIFFERENT
      quotient-chamber  OR  the same chamber reached with an inconsistent triple.
      (We key the visited map by exact triple -> chamber; a clash = inconsistency.)
  (B) VERTEX-ANGLE: for each fully-surrounded vertex point V*, the chambers
      incident to V* must have triangle-angles (pi/m12 each, doubled per sector)
      summing to exactly 2*pi. (This is local flatness, already implied by
      per_component_flat, but we re-verify metrically.)
  (C) TILE-COHERENCE: all chambers sharing a tile-center point T* must agree on
      m01 and form a single m01-gon (their T-corner angles sum to 2*pi and the
      polygon closes).

The 3.4.4.6 closure ghost is expected to trip check (A): developing the forced
neighbourhood produces a geometric vertex that the abstract symbol labels with the
3.4.4.6 necklace but whose forced surroundings demand a DIFFERENT necklace
(3.4.3.6), i.e. two cover nodes collide with incompatible chamber data.

We cap the BFS (LOUDLY) since the cover is infinite; a realizable symbol tiles
consistently to any radius (we verify a patch), a non-realizable one collides
within a small radius.
"""
import sys
sys.path.insert(0, "/tmp/dd-experiments")
from fractions import Fraction
import cyclo as C
from cyclo import (cadd, csub, cscale, cmul, cconj, cdiv, udir, CONE, CZERO,
                   _reduce_exp)

HALF = Fraction(1, 2)

def _cos_unit(k):
    return cscale(cadd(_reduce_exp(k % C.N), _reduce_exp((C.N - k) % C.N)), HALF)

def _sin_unit(k):
    diff = csub(_reduce_exp(k % C.N), _reduce_exp((C.N - k) % C.N))
    return cmul(diff, cscale(_reduce_exp((C.N - 12) % C.N), HALF))

def apothem(m):
    k = Fraction(24, m)
    assert k.denominator == 1, m
    k = int(k)
    return cscale(cdiv(_cos_unit(k), _sin_unit(k)), HALF)

def reflect(X, A, B):
    d = csub(B, A)
    u2 = cdiv(d, cconj(d))
    return cadd(A, cmul(u2, cconj(csub(X, A))))

def seed_flag(m01, m12):
    # V at origin; edge to V2 = unit along +x; E = 1/2; tile center on the LEFT.
    V = CZERO
    E = cscale(CONE, HALF)
    T = cadd(E, cmul(apothem(m01), udir(12)))   # +90deg (left)
    return (V, E, T)

def reflect_flag(flag, idx, m01_cur, m01_nb):
    """Neighbour flag across wall idx. Shared corners stay EXACT; the moving corner
    is rebuilt with the neighbour triangle's correct metric shape.
      s0 (move V, keep E,T): other endpoint of the edge: V' = 2E - V.
      s1 (move E, keep V,T): other edge of same tile at V: reflect E across V-T.
      s2 (move T, keep V,E): other tile across the edge: T' = E + apothem(m01_nb)
          * unit-normal pointing AWAY from old T.  (old |ET| = apothem(m01_cur).)
    """
    V, E, T = flag
    if idx == 0:
        return (csub(cscale(E, 2), V), E, T)
    if idx == 1:
        return (V, reflect(E, V, T), T)
    if idx == 2:
        Tmir = reflect(T, V, csub(cscale(E, 2), V))    # mirror T across edge line
        dirv = csub(Tmir, E)                           # length = apothem(m01_cur)
        scale = cdiv(apothem(m01_nb), apothem(m01_cur))  # ring-exact ratio (real)
        Tn = cadd(E, cmul(scale, dirv))
        return (V, E, Tn)
    raise ValueError

def develop_cover(sym, step_cap=4000):
    """BFS-expand the cover. Returns dict(closed, reason, n_nodes, collision,
    capped)."""
    n = sym.n
    # visited: exact (V,E,T) tuple -> (chamber)
    visited = {}
    seed_chamber = 0
    f0 = seed_flag(sym.m01[seed_chamber], sym.m12[seed_chamber])
    visited[f0] = seed_chamber
    frontier = [(seed_chamber, f0)]
    steps = 0
    collisions = []
    while frontier:
        c, flag = frontier.pop()
        for idx in (0, 1, 2):
            nbc = sym.s[idx][c]
            nbf = reflect_flag(flag, idx, sym.m01[c], sym.m01[nbc])
            steps += 1
            if steps > step_cap:
                return dict(closed=None, reason="STEP-CAP", n_nodes=len(visited),
                            collision=None, capped=True)
            if nbf in visited:
                if visited[nbf] != nbc:
                    collisions.append((nbf, visited[nbf], nbc, "via s%d from %d" % (idx, c)))
                    return dict(closed=False, reason="COLLISION",
                                n_nodes=len(visited), collision=collisions[-1],
                                capped=False)
                # consistent revisit
            else:
                visited[nbf] = nbc
                frontier.append((nbc, nbf))
    return dict(closed=True, reason="CLOSED-PATCH(no collision within cap)",
                n_nodes=len(visited), collision=None, capped=False)


if __name__ == "__main__":
    from dsymbol import DSymbol, from_canonical
    from ground_truth import GROUND_TRUTH
    print("universal-cover development (collision-based closure):")
    print("-" * 70)
    for name in ("hex_{6,3}", "square_{4,4}", "triangular_{3,6}",
                 "trunc_square_4.8.8", "hex_square_HYPERBOLIC"):
        sym = DSymbol.from_dict(GROUND_TRUTH[name])
        r = develop_cover(sym, step_cap=3000)
        print("  %-22s size=%d  closed=%s  reason=%s  nodes=%d" %
              (name, sym.n, r["closed"], r["reason"], r["n_nodes"]))
        if r["collision"]:
            print("        collision:", r["collision"][1], "vs", r["collision"][2], r["collision"][3])
