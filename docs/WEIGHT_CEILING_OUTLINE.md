# Weight ceiling w(k) = 2k + 2⌊(k−1)/3⌋ — proof outline (2026-07-10, CC + AL)

> SUPERSEDED IN PART by `WEIGHT_CEILING_PROOF.md` (v2, same day), which went through a
> five-referee adversarial round. Known corrections to this outline: the "+1 via two pinned
> orbits" bookkeeping is wrong in detail (the exact mechanism is parity + mirror-exclusion,
> PROOF §6); "squares only dilute" is false (non-jump-k extremals need square slabs); the
> pmg mechanism is mirror hosting, not a mirror index map. The regime architecture and the
> L2/L3 lemmas survive. Read the PROOF document first; this outline remains as the intuition
> companion.

STATUS: proof ARCHITECTURE with two lemmas proved inline (L2 width-2 deletion cap, L3 width-1
automatic mirror), the rest ranked by difficulty. Empirical law exact on all 47,852 weighed
oracle tilings k ≤ 11 (see `experiments/results/weight-slope-8-3-2026-07-10.md`); k = 12/13
confirmation run in flight (`ctrnact-k1213-jump-2026-07-10.log`). This is CC's structural
skeleton for the TA's Route-2; the TA owns the final write-up.

## 0. Setup and the claim

Tilings: edge-to-edge, unit-edge regular polygons over {3,4,6,12} (ζ₁₂ regime; the octagon is the
solved 4.8.8 special case). G = full symmetry group, Λ = translation lattice, P = G/Λ the point
group, k = vertex orbits under G. For a translation T ∈ Λ ⊂ ℤ[ζ₁₂], wt(T) = minimum number of
unit 24th-roots summing to T (the exact step metric; closed form F, `scripts/ctrnact-wtF.ts`).
The measured cost is w = max(wt(u), wt(v)) over the Gauss-reduced basis (u, v) of Λ.

CLAIM (upper bound): for every k-uniform tiling, w ≤ 2k + 2⌊(k−1)/3⌋.
CLAIM (tightness): equality for all k ≥ 2, achieved only by pgg width-2 "hexagon tubes"
(triangular lattice minus an independent set of deleted vertices), the family in AL's 2026-07-10
drawing. Companion laws: pmg = 2k + 2⌊(k−2)/3⌋, pmm/cmm = 2k, p2/pg ≈ (4/3)k, p1 ≈ (2/3)k,
square/hex-lattice groups O(√k).

Two facts do all the work. First, w is a property of Λ alone, so the theorem is really a bound on
how eccentric the period lattice of a k-orbit tiling can be: orbit connectivity never enters the
weight side (this replaces the detour bookkeeping in AL's first derivation; his drawing survives
as the extremal construction and as the orbit-per-row count). Second, the cost decomposes as

    slope = (steps per vertex) × (vertices per orbit),

maximized jointly: hexagon slabs maximize the first factor at 2/3, a freely acting point group of
order 4 maximizes the second at 4, and 2/3 × 4 = 8/3. Every group but pgg loses one factor or
the other. That is the whole theorem; the lemmas below make each factor's cap honest.

## 1. Regime split (why "tube" is the only hard case)

Gauss-reduced bases have angle ∈ [60°, 90°], so λ₁λ₂ ≤ (2/√3)·A where A = |det Λ|. Also
A = Σᵢ (|P|/|stabᵢ|)·aᵢ ≤ a_max·|P|·k, where aᵢ is the corner-area share of orbit i's vertex
figure (a table over the finitely many vertex configurations; a_max ≈ 2.01 at 3.12.12).

- Rigid-lattice groups (p3, p3m1, p31m, p6, p6m force hexagonal; p4, p4m, p4g force square):
  λ₁ = λ₂ = √(A/sin θ), so w ≤ (2/√3)·√(cA) = O(√(|P|·k)). Sublinear; done modulo the aᵢ table.
  Sanity: for hex-heavy p6m this gives w ≤ ≈4.9√k, and the k=11 measured max is 16 vs 16.3
  predicted. Tight, which says the regime analysis is not throwing anything away.
- Free-aspect groups (p1, p2, pm, pg, cm, pmm, pmg, pgg, cmm): λ₁ can stay O(1) while λ₂ grows.
  The extremal shape is a "tube": a strip of width λ₁ = c, height H = A/(c·sin θ), and
  w ≈ wt(T₂) with T₂ crossing the full height. All the content lives here.
- Crossover (λ₁ ~ √k): interpolation between the two, gap G2 below.

## 2. The tube ledger: steps per vertex, per width

Slice a width-c tube by the horizontal rows of tiles a monotone path realizing T₂ crosses (the
no-backtrack machinery, thesis-figs 7/8, supplies the monotone path; wt ≤ its length). Slab
inventory over unit {3,4,6,12} tiles, per width-2 cell:

| slab | height | crossing steps | surviving vertices | steps/vertex |
|------|--------|----------------|--------------------|--------------|
| triangle row | √3/2 | 1 | 2 | 1/2 |
| square row | 1 | 1 | 2 | 1/2 |
| hexagon double-row (one deletion) | √3 | 2 | 3 | **2/3** |
| dodecagon | does not fit: circumdiameter 3.86 > 2 | — | — | — |

Hexagon slabs are the unique maximizer, and only at width 2. That is Lemma L2:

LEMMA L2 (width-2 deletion cap — proved). In a width-2 tube over the triangular lattice
(vertex rows at heights j·√3/2, two vertices per row, x-offsets {0,1} or {1/2,3/2} mod 2), a
deleted vertex at row j forbids every other deletion in rows j−1, j, j+1.
Proof. Same row: the other vertex is at x-distance 1, adjacent; deletions are independent
(hexagons cannot share a vertex). Adjacent row: its two vertices sit at x ± 1/2 and
x ± 3/2 ≡ x ∓ 1/2 (mod width 2), i.e. displacement (±1/2, ±√3/2), distance exactly 1: adjacent. ∎
COROLLARY. Deletions occupy pairwise non-adjacent rows: ≤ p per vertical period p√3 (2p rows),
so n ≥ 4p − p = 3p vertices per cell, and wt(T₂) = 2p ≤ (2/3)·n. AL's "you must step outside the
fundamental domain in the deletion-dense half" is this cascade seen from inside the FD.

At width 1 hexagons are impossible (the deleted vertex's own translate is adjacent), and:

LEMMA L3 (width-1 automatic mirror — proved). Every width-1 strip of {3,4} rows has a vertical
reflection fixing all vertices. Proof. Unit edges force consecutive rows to differ by
Δx ∈ {0, ±1/2} (square/triangle rows), so all vertices lie in one coset {x₀, x₀ + 1/2} mod 1.
The reflection x → 2x₀ − x fixes both values mod 1, maps each (individually symmetric) row type
to itself, hence is a symmetry of the whole strip. ∎
COROLLARY. Width-1 vertices are all mirror-pinned (|stab| ≥ 2): n ≤ 2k, w ≤ n·1 = 2k.
This is the pmm/cmm strip law, and it is why no group beats 2k at width 1 despite the better
1 step/vertex there. pgg width-1 tubes do not exist: the automatic mirror contradicts pgg.

At width c ≥ 3 the cascade relaxes (staircase deletions in every row become legal) but vertices
per row grow like c while crossing steps stay ~2 per √3: steps/vertex ≤ ~3/(2c), so
steps/orbit ≤ ~6/c ≤ 2. Width 2 is the unique optimum. (Formalizing this decay is gap G2.)

## 3. The orbit multiplier: why pgg, exactly

steps/orbit = (steps/vertex) × (orbit size in the cell), and orbit size = |P|/|stab|. So the
group must (a) keep the lattice free-aspect, (b) have |P| = 4 (the max among free-aspect groups:
anything higher forces square/hex), and (c) act with trivial vertex stabilizers on the tube.

Run the 17 groups through (a)-(c):

| groups | lose | economy cap | measured max @ k=11 |
|--------|------|-------------|---------------------|
| p3, p3m1, p31m, p6, p6m, p4, p4m, p4g | (a): rigid lattice | O(√k) | 7–16 |
| p1 | |P| = 1 | (2/3)k | 7 = ⌊22/3⌋ ✓ |
| p2, pg | |P| = 2 | (4/3)k | 14 = ⌊44/3⌋ ✓ |
| pm, cm | |P| = 2 and mirrors pin | ≤ (4/3)k | 13 ✓ |
| pmm, cmm | (c): mirrors both directions; width-2 tube pinned, best is width-1 strip | 2k | 22 = 2k ✓ |
| pmg | one mirror family ⊥ axis: pays exactly one deletion slot | 2k + 2⌊(k−2)/3⌋ | 28 ✓ |
| **pgg** | loses nothing | **2k + 2⌊(k−1)/3⌋** | **28 ✓** |

The conceptual answer to "why pgg/pmg": glide reflections are the only wallpaper operations that
simultaneously leave the lattice free-aspect, act freely on vertices (mirrors pin, and 3/4/6-fold
rotations rigidify the lattice), and pair up to point-group order 4 (lone 2-folds or a lone glide
family only reach order 2, halving the multiplier: the p2/pg lines sit at half of pgg's). pgg is
the unique mirror-free order-4 free-aspect group. pmg keeps one glide family and swaps the other
for mirrors; putting the mirrors perpendicular to the tube axis pins only isolated rows, costing
exactly one deletion slot, hence the same slope one phase behind. The data confirms the phase
structure point-for-point (pgg jumps at k ≡ 1 mod 3, pmg at k ≡ 2 mod 3).

## 4. Exact constants

- The "+1" in min-k(p) = ⌊3p/4⌋ + 1 (equivalently the −2/3 intercept): pgg's four 2-fold-center
  classes cannot all hide at hexagon centers or edge midpoints; at least two land on vertices,
  each pinning an orbit to size 2 (AL's "1 shared" points at the FD boundary are exactly these).
  Bookkeeping: n = 4(k−1) with two pinned orbits reproduces k = 3p/4 + 1. Needs the finite
  center-placement argument (gap G3); verified computationally for p = 2..14, 13/13.
- Floors: integrality of rows plus the parity of the deletion word.
- Achievability for every p: explicit deletion word, alternate rows with one glide-compatible
  defect to break vertical sub-periods (primitivity). Catalogue realizes p = 2..14; general-p
  construction is gap G4.

## 5. Gap list (difficulty-ranked)

- G1 (routine): exhaustive slab inventory: non-horizontal row directions (finitely many in ζ₁₂),
  mixed {3,4} words at width 2, the aᵢ corner-area table for the rigid regime.
- G2 (medium): the width ≥ 3 decay and the tube↔Hermite crossover, one monotone bound covering
  λ₁ from 3 to √k. The naive chain w ≤ (2/√3)λ₂ ≤ (2/√3)(2/√3)A/λ₁ overshoots (gives ~3.1k at
  λ₁ = 3 with a_max); the slab LP, not the area bound, must carry this range.
- G3 (small): 2-fold-center placement forcing two pinned orbits (the +1), pmg's one-slot penalty,
  pm/cm exact constants.
- G4 (small-medium): general-p primitive deletion word (upper-bound family for all k).
- G5 (routine): wt arithmetic for skewed T₂ = (q, p√3): wt ≤ 2p + O(λ₁) absorbs into constants.

## 6. Consequences

- Enumeration completeness: any 2k + const weight budget in the solver is falsified at k ≥ 10;
  the completeness-safe radius is 2k + 2⌊(k−1)/3⌋ (or any proven bound above it). Cross-ref
  CLAUDE.md "completeness knobs are not speed dials".
- The bound is group-aware: if the enumerator ever branches per wallpaper group, the per-group
  ledger above gives much tighter budgets everywhere except pgg/pmg.
- Falsifiable next: k=12 max = 30 for both pgg and pmg (⌊47/3⌋ = ⌊46/3⌋ = 15); k=13 splits them:
  pgg 34, pmg 32. The in-flight run tests exactly this.
