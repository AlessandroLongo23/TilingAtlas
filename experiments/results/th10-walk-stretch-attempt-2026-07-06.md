# Walk-stretch lemma — a real run (2026-07-06, CC)

Target: `wt(v) ≤ (2/√3)|v| + O(1)` for Gauss-reduced generators v of a tiling's period lattice —
claimed last turn to be the single lemma unifying (R) and (E). Outcome: one part proved, one
mechanism pinned, one claim (mine) refuted.

## PART A — proved: the round branch is O(√k)

`wt(v) ≤ walk-length` (A₁), and the tiling 1-skeleton is a periodic geometric graph
quasi-isometric to ℝ², so its **asymptotic dilation** `C = limsup d_graph(x,y)/|x−y|` is a finite
constant. The worst face is the 12-gon (opposite vertices: 6 edges vs Euclidean 3.86 ⟹ 1.55), so
`C ≤ ~1.6`. Hence `wt(v) ≤ C·|v| + o(|v|)`, and with `λ₁ ≤ 5.29√k` (round det bound):

  **hex/square ⟹ s* ≤ C·λ₁ ≤ ~8.5√k = O(√k).  The (R) branch is qualitatively CLOSED.**

*Honest caveat on A.* The naïve proof — replace S's chord in each crossed tile by a boundary arc —
**fails on corner-clipping**: S can barely clip a 12-gon yet pay a big boundary detour, so the
per-tile ratio is unbounded. This is the *same* pathology that made the review's local constant
c₀ ≈ 50 (E-3). The fix is amortization (skip tiles you clip; charge to the bulk), which gives the
finite bulk dilation but is standard-nontrivial, not one line. So A is "true and provable," not
"trivially proved." For the thesis's qualitative round bound it suffices; for a tight constant it
does not.

## PART B — pinned: the tight hexagonal constant is exactly 2/√3, and I know why

Data: over 289 hexagonal-lattice tilings, `max wt(shortest)/λ₁ = 1.15470 = 2/√3`, **0 exceed it**,
and every attainer has `λ₁² = 3m²` — the minimal period is a **√3-direction vector** `m√3·ζʲ`.

Mechanism (rigorous, = A₄): `√3·ζʲ = ζ^{j+2} + ζ^{j−2}` (two unit edges at ±30° about the target).
So `m√3·ζʲ` is a ±30° zig-zag of exactly `2m` unit edges, `wt = 2m`, length `m√3`, ratio `2/√3` —
no 12-gon detour, no cancellation, and the L₂ certificate makes `2m` optimal (both bounds closed).

**So for a hexagonal tiling, IF the minimal period lies on the 30° grid, then `wt ≤ (2/√3)λ₁`
exactly.** That is the whole tight constant.

**Residual gap (open):** prove the minimal period of a hexagonal-lattice tiling is a 30°-grid
direction vector. Empirically 289/289; the edges are on the 30° grid (Lemma R2-G) so *every* period
is a ℤ-combination of grid units — the claim is that the *shortest* one doesn't drift off-grid
through cancellation. This is the "reduced generators avoid bad directions" statement, restricted to
hexagonal lattices. Not closed, but now it's a sharp, self-contained lattice-arithmetic question.

## PART C — refuted (my own claim): 2/√3 is NOT the uniform constant

Last turn I said (R) and (E) reduce to one `2/√3` lemma. **False**, and the data shows it:

| class | max wt(shortest)/λ₁ | vs 2/√3 = 1.1547 |
|---|---|---|
| hexagonal | 1.1547 | = (tight, 0/289 over) |
| oblique | 1.1547 | = |
| rectangular | 1.1954 | **over** (1/437) |
| rhombic | 1.2323 | **over** (6/442) |
| square | **1.2957** | **over** (3/24) |

And the square class **climbs with k**: 1.195 (k=2) → 1.260 (k=4) → 1.296 (k=6) — heading, I believe,
toward the ambient ceiling **√2** (`wt(n(1+i)) = √2·|v|`, A₄; the even-sublattice reduced generator).
So the reduced-generator stretch is `2/√3` only for hexagonal (and oblique); for square/rhombic/
rectangular it is a larger, k-growing number bounded above by √2.

**Why this doesn't sink (R), and why k=3 is still fine.** Even at the √2 ceiling, `s* ≤ √2·λ₁ =
O(√k)` — Part A is unharmed, only the constant moves (~6 → ~7). And the *round champion is
hexagonal at every k* (t1003, t3005, …, all hex), so the k=3 bound rides the clean `2/√3` case; the
square/rhombic excess governs non-champion tilings and the asymptotic thesis constant, not the k=3
number. (E)'s climb vector is a separate estimate — it shares the √3 *geometry* but enters through
the height, not the minimal-period direction; do not conflate them, as I did.

## Net honest state

- (R) qualitative — `s* = O(√k)` for round — **provable now** (bounded dilation; Part A).
- (R) tight, hexagonal (the k=3 champion class) — reduces to **one** residual: *the minimal
  hexagonal period is 30°-grid-directional.* Mechanism understood, constant provably optimal (2/√3),
  proof of the residual open.
- The clean cross-branch unification I asserted is wrong: `2/√3` is hexagonal-specific; square/
  rhombic run higher (→ √2). Corrected in memory.
- I did **not** close the walk-stretch lemma. I closed the qualitative round bound, pinned the
  hexagonal mechanism to an optimal explicit constant, and reduced the k=3-relevant case to a single
  sharp lattice-arithmetic claim.

### Evidence
Stretch maxima per class and the k-climb of the square class are from `weight-tightness.csv` +
Bravais classification of `galebach.json`; √3-direction attainers verified `λ₁²=3m², wt=2m`
(t1001, t3004/43/58, t4007/14). A₄ (`wt(m√3)=2m`, `wt(n(1+i))=√2 n`) is the M1 machine-checked toolkit.
