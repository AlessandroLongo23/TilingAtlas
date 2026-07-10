# Weight-bound theorem — proof skeleton (combinatorial, no metric estimates)

**Target.** For every k-uniform edge-to-edge tiling by unit regular polygons of the {3,4,6,12}
family, `s*(Λ) ≤ 2k + 3`, with equality only for the 4.6.12 tiling (k=1).
Slope-tight: Lemma L already gives `s* ≥ 2k` (the strip family), so the linear rate `2` is optimal.
**Optional refinement (Part 3):** `s* ≤ 2k + 2` for all tilings except 4.6.12.

The whole argument is combinatorial — vertex orbits, rows, and tile-escape costs. No `√k`, no
metric/dilation estimate anywhere.

---

## Part 0 — Scope and dichotomy — **ESTABLISHED**

- **Scope.** The polygon set is {3,4,6,12} (the 30°-grid ring ℤ[ζ₁₂]). The octagon occurs in
  **exactly one** tiling, 4.8.8 (Grünbaum–Shephard: the only octagon-bearing vertex that extends is
  `4.8.8`, and it forces the whole tiling). It is the single 15°-grid tiling and is handled as a
  base case (`λ₁ = 1+√2`, `s* = 3`). Everything else lives on the 30° grid.
- **Dichotomy.** Every tiling is **ROUND** (hexagonal or square Bravais lattice) or **ELONGATED**
  (rhombic, rectangular, or oblique). *Proof:* crystallographic restriction — a rotation of order
  ≥ 3 forces the lattice to be hexagonal/square; its absence leaves the point group in
  {1, 2, m, 2mm}. Exhaustive and mutually exclusive. Verified on the catalogue with exact arithmetic.

---

## Part 1 — ELONGATED ⟹ `s* ≤ 2k + 2` (row traversal)

`s*` is carried by the **long generator** (the "climb"); its weight is the number of rows the climb
steps through.

- **L1 (splitting).** No order-≥3 rotation ⟹ `|P| ≤ 4` ⟹ `|V(Q)| ≤ 4k`. *(standard)*
- **L2 (row count).** The long period is realized by a walk whose length equals the number of rows,
  and `#rows = |V(Q)| / (classes per row) ≤ 2k`. *Obligations:* ≤ 2 classes per row (the
  one/two-per-level lemma), and adjacent rows are edge-connected (connectivity).
- **L3 (folding).** The factor 2 is precisely the reflection **perpendicular** to the long axis
  (it pairs row `j` with row `−j`); a mirror parallel to the axis, or any in-row symmetry, does not
  lengthen the climb. *Obligation:* isolate this reflection.
- **L4 (additive `+2`).** The `+2` is the extra height of hexagon rows (`√3` vs `1`). *Obligation:*
  bound the row-height contribution.

*Status:* mechanism confirmed on data — `s* = wt(long generator)` exactly for every elongated
tiling; `|V(Q)|/k ≤ 4`; the extremals are the layered strips. This is the **concrete branch —
attack it first.**

---

## Part 2 — ROUND ⟹ `s* ≤ 2k + 3` (escape–traverse)

Decompose a period as **escape → traverse → jump → traverse → enter**.

- **L5 (escape cost).** For any tile `T`, `wt(centroid(T) → vertex(T)) ≤ c`, with `c = 2` for the
  12-gon and `c = 1` for triangle/square/hexagon. *(finite check — DONE)*
- **L6 (decomposition).** Every round period `v` decomposes as
  `v = [escape ≤ c] + [traverse ≤ k−1 orbits] + [jump 1] + [traverse ≤ k−1 orbits] + [enter ≤ c]`,
  in the worst case where the orbit-adjacency graph is a path. Hence
  `wt(v) ≤ 2c + 2(k−1) + 1 = 2k + 2c − 1`. *(main obligation)*
- With `c = 2`: **`s* ≤ 2k + 3`.**

*Status:* L5 done; L6 is exact on the tight case (4.6.12: `2 + 0 + 1 + 0 + 2 = 5`) and consistent
with the data (every round tiling ≤ 2k+3, zero violations). L6 as a **universal** decomposition is
the obligation. Note the softenings observed in practice: `c = 0` when the lattice point is already
a tile vertex, `jump = 0` on a symmetry axis, and the two traversals rarely use all `k−1` — which is
why almost every round tiling sits strictly below `2k+3`.

---

## Part 3 — Unification conjecture (optional, with a fallback)

**Claim.** `s* ≤ 2k + 2` for **every** tiling except 4.6.12.
Equivalently: the *maximal* escape configuration — both endpoints of a period on 12-gon centres,
each paying the full `c = 2`, together with a maximal orbit path — is realized **only** by 4.6.12
(k=1). This is a **combinatorial** statement about how 12-gons can sit in a tiling, not a metric
estimate.

*Status:* data-confirmed — 4.6.12 is the **unique** tiling in the catalogue with `s* > 2k+2`.
Unproven. **Fallback:** if it does not close, the theorem ships as `s* ≤ 2k+3`, which is already
complete and honest.

---

## Division of labour and payoff

| part | statement | status | who |
|---|---|---|---|
| 0 | scope + dichotomy | **done** | — |
| 1 | elongated `2k+2` | L1 standard; L2–L4 tractable | do first |
| 2 | round `2k+3` | L5 done; L6 the obligation | next |
| 3 | unify to `2k+2` (except 4.6.12) | conjecture, data-confirmed, fallback `2k+3` | crux/bonus |

**Feasibility payoff:** either final form makes k=3 runnable — `2k+2 = 8` (`|W(8)|` pair-stage
≈ days) or `2k+3 = 9` (≈ days–weeks). The unification is elegance, not a feasibility requirement.

**Base cases (by inspection):** 4.8.8 octagon (`s* = 3`, out of family); 4.6.12 (`s* = 5`, the unique
tight case of `2k+3`).
