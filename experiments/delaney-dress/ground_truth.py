"""
Hand-derived, fully verified ground-truth Delaney-Dress symbols for known
edge-to-edge tilings of the plane (and one hyperbolic symbol for contrast).

Convention (0-indexed chambers):
  A symbol is (D, s, m) where
    D    = list of chamber ids 0..n-1  (n = size delta)
    s[i] = dict mapping chamber -> chamber, the involution sigma_i (i in 0,1,2).
           Involutions MAY have fixed points (s[i][c]==c) = mirror chambers.
    m01  = dict chamber -> int, tile degree (number of sides of containing tile),
           constant on <s0,s1>-orbits ({0,1}-components).
    m12  = dict chamber -> int, vertex degree (tiles meeting at the vertex),
           constant on <s1,s2>-orbits ({1,2}-components).
    m02  = 2 for every chamber (forced for tilings); not stored.

  sigma_i side convention (corner 0=vertex, 1=edge-midpoint, 2=tile-center):
    s0 : keep edge & tile, move to the OTHER endpoint of the edge   (changes vertex)
    s1 : keep vertex & tile, move to the OTHER edge of the tile at v (changes edge)
    s2 : keep vertex & edge, move to the OTHER tile across the edge  (changes tile)

  Read-off invariants (verify against the 'expect' fields):
    {0,1}-components = tile orbits;  {1,2}-components = vertex orbits = k (uniformity);
    {0,2}-components = edge orbits;
    Global curvature K = sum over chambers (1/m01 + 1/m12 - 1/2);  K=0 Euclidean.
    Per-component curvature (sum over chambers IN one {1,2}-component) = 0
      <=>  that vertex orbit's regular-polygon angles sum to 360 deg (LOCAL flatness).
"""

# Each entry: name -> dict(s0,s1,s2,m01,m12, expect=...)

GROUND_TRUTH = {
    # --- the three regular tilings: size 1, single self-mapped chamber ---
    "hex_{6,3}": dict(
        s0={0: 0}, s1={0: 0}, s2={0: 0},
        m01={0: 6}, m12={0: 3},
        expect=dict(size=1, K=0, tile_orbits=1, vertex_orbits=1, edge_orbits=1,
                    k=1, euclidean=True, all_components_flat=True),
    ),
    "square_{4,4}": dict(
        s0={0: 0}, s1={0: 0}, s2={0: 0},
        m01={0: 4}, m12={0: 4},
        expect=dict(size=1, K=0, tile_orbits=1, vertex_orbits=1, edge_orbits=1,
                    k=1, euclidean=True, all_components_flat=True),
    ),
    "triangular_{3,6}": dict(
        s0={0: 0}, s1={0: 0}, s2={0: 0},
        m01={0: 3}, m12={0: 6},
        expect=dict(size=1, K=0, tile_orbits=1, vertex_orbits=1, edge_orbits=1,
                    k=1, euclidean=True, all_components_flat=True),
    ),

    # --- 4.8.8 truncated-square (Archimedean, 1-uniform), size 3 ---
    # derived from 6 barycentric flags at the degree-3 vertex folded by the
    # single mirror through the square (swaps the two octagons).
    # orbits: A=0 (square flags), B=1 (oct flags on square-oct edges),
    #         C=2 (oct flags on oct-oct edge).
    "trunc_square_4.8.8": dict(
        s0={0: 0, 1: 1, 2: 2},          # 2-fold at edge midpoints -> all fixed
        s1={0: 0, 1: 2, 2: 1},          # (0)(1 2)
        s2={0: 1, 1: 0, 2: 2},          # (0 1)(2)
        m01={0: 4, 1: 8, 2: 8},
        m12={0: 3, 1: 3, 2: 3},
        expect=dict(size=3, K=0, tile_orbits=2, vertex_orbits=1, edge_orbits=2,
                    k=1, euclidean=True, all_components_flat=True),
    ),

    # --- hexagon-square HYPERBOLIC contrast symbol (EPINET worked example) ---
    # <2: 1 2, 1 2, 2 : 4 6, 4>  -> K = -1/12, NOT a Euclidean tiling.
    "hex_square_HYPERBOLIC": dict(
        s0={0: 0, 1: 1}, s1={0: 0, 1: 1}, s2={0: 1, 1: 0},
        m01={0: 4, 1: 6}, m12={0: 4, 1: 4},
        expect=dict(size=2, K=-1.0 / 12.0, tile_orbits=2, vertex_orbits=1,
                    edge_orbits=1, k=1, euclidean=False, all_components_flat=False),
    ),
}

if __name__ == "__main__":
    # tiny self-check that the data is at least involutive & m-consistent
    from fractions import Fraction
    for name, S in GROUND_TRUTH.items():
        n = len(S["s0"])
        for i in ("s0", "s1", "s2"):
            s = S[i]
            assert set(s.keys()) == set(range(n)), (name, i, "domain")
            for c in s:
                assert s[s[c]] == c, (name, i, c, "not involution")
        K = sum(Fraction(1, S["m01"][c]) + Fraction(1, S["m12"][c]) - Fraction(1, 2)
                for c in range(n))
        print(f"{name:28s} size={n} K={K}  (expect {S['expect']['K']})")
