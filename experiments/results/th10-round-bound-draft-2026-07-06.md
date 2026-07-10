# Draft — the round-case weight bound via shape crossings (2026-07-06)

Goal: prove `s*(Λ) = O(√k)` for tilings whose period lattice is round (hexagonal or square
Bravais), by bounding the weight of the shortest period through the *actual* tile shapes. Written
with the assembly step stated honestly, not glossed.

## Lemma 1 (single-tile crossing — rigorous, machine-checked table)

Let P be a unit-edge regular n-gon, n ∈ {3,4,6,12}, and a,b two of its vertices, `k` apart along the
boundary. Then:

- the boundary edge-walk from a to b has length `min(k, n−k)`, and
- `min(k,n−k) ≤ 1.56·|a−b|`  (worst case: the 12-gon "diameter", `6 / 3.863 = 1.553`);
- the vector `b−a` has weight `wt(b−a) ≤ √2·|a−b|`  (worst case: the **square diagonal**, `√2`).

Every crossing except the square diagonal is `≤ 2/√3 = 1.1547`. (Table:
triangle 1.000 · square edge 1.000 / **diagonal 1.414** · hexagon 1.000 / 1.155 / 1.000 ·
12-gon 1.000 / 1.035 / 1.098 / 1.195 / 1.072 / 1.035.) Proof: finite check, `th10-per-shape`.

## Lemma 2 (walk bound — this is A₁ from the toolkit)

For any two vertices x, y of the tiling, `wt(y−x) ≤ graph-distance(x,y)` — because an edge-walk is a
sum of unit-direction edges, and its length is an admissible weight-witness.

## The assembly (the crux — where the constant is spent, stated plainly)

To pass from Lemma 1 (one tile) to a bound on `wt(v)` for a period `v`, route the straight segment
`S = [x, x+v]`, snap each of its tile-edge crossings to a nearby vertex, and chain the per-tile
boundary walks (Lemma 1). This is valid and gives a *linear* bound `wt(v) ≤ C·|v| + O(1)` for a
bounded `C` — hence `O(√k)`. **But `C` is NOT the per-tile `√2`:** each snap displaces the path up to
one edge-length sideways, and over the `O(|v|)` tiles a long period crosses, these displacements
accumulate, inflating the constant. This inflation is exactly the corner-clipping / `c₀` phenomenon.
Controlling it to recover `√2` (let alone `2/√3`) globally is **open**. So Lemma 1's `√2` is the true
*local* cost; the honest *global* constant from naive assembly is larger.

## Proposition (qualitative round bound — provable now)

There is an absolute constant `C` with `graph-distance(x, x+v) ≤ C·|v| + O(1)` (the tiling 1-skeleton
is quasi-isometric to the plane; `C` bounded via Lemmas 1–2 + snapping). Hence for a **round**
lattice, where `λ₁ = λ₂` and `det Λ = c·λ₁²` with `det ≤ ā·|V(Q)| ≤ ā·12k`, we get
`λ₁ = O(√k)` and therefore

  **`s* ≤ wt(a) + wt(b) ≤ 2C·λ₁ + O(1) = O(√k)`   for hexagonal/square Bravais lattices.**

This is the round branch of the dichotomy, rigorous, with an explicit (if not yet sharp) constant.

## Remark (the sharp constant is a *different* argument)

The measured stretch is `2/√3` for hexagonal tilings, well below the assembly's crude `C`. That sharp
value does **not** come from the assembly — it comes from the *algebraic form* of a round tiling's
shortest period. Empirically (243/289 on-grid + the Eisenstein cases) that period is a
`√3`-direction / integer-direction / Eisenstein vector, each with an explicit `±30°` (60°-cone)
decomposition whose weight is read off directly by the Cone Lemma, no routing involved. Example:
t1003 (4.6.12) has shortest period `3 + √3` = three unit steps + one `√3`-zig-zag = weight 5,
stretch `5/4.732 = 1.057`. **Two independent routes:** shape-assembly → qualitative `O(√k)` (all
round tilings, crude constant); period's algebraic form → sharp `2/√3` (round tilings, via the
Cone Lemma), open only in that "the shortest round period has this form" is proven for the on-grid
majority but not the 46 off-grid cases.

## What is and isn't ready for the thesis

- **Ready:** Lemma 1 (single-tile table), Lemma 2 (A₁), the Proposition (`s* = O(√k)` for round,
  crude constant). This is a complete, honest proof of the round branch's *shape*.
- **Open:** the sharp constant — either by controlling the assembly wiggle (hard, = corner-clipping),
  or by proving the shortest round period always has the `√3`/Eisenstein form (the 46 off-grid cases).
