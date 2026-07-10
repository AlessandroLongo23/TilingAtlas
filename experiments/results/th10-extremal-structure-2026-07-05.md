# What the weight-extremal tilings actually are (2026-07-05, CC for AL)

Empirical study of the tilings that sit at the top of the s\* envelope, to understand *why* they
need ~2.5k and *why nothing needs more*. Data: `galebach.json` (geometry, all k) joined to
`weight-tightness.csv` (s\*); 1352 tilings; vertex configurations reconstructed from seed geometry.
Figures: `th10-extremal-envelope.png`, `th10-mutual-exclusion.png`.

## Headline: there is no single extremal structure — there are TWO families, and they cross

The per-k champions are not one family. They are the upper envelope of two structurally opposite
families, and which one is on top flips at k≈3–4:

| k | max s\*/k | who wins | champion | structure |
|---|-----------|----------|----------|-----------|
| 1 | **5.00** | ROUND | t1003 | **4.6.12** — square/hexagon/12-gon, hexagonal lattice |
| 2 | **3.00** | ROUND | t2001 | 12-gon-bearing, hexagonal lattice |
| 3 | **2.33** | ROUND | t3005 | 3-uniform, 12-gon-bearing (12.6.4 + 3.6.3.6 + …) |
| 4 | **2.50** | ELONG | t4125 | **hexagon strip** 3.6.3.6 / 3.3.3.3.6, λ₁=2, no 12-gons |
| 5 | **2.40** | ELONG | t5191/2 | tri/sq/hex strip, λ₁=2, no 12-gons |
| 6 | **2.33** | ELONG | t6301/… | tri/sq/hex strip, λ₁=2, no 12-gons |

Round beats elongated at k≤3; elongated beats round at k≥4 (verified head-to-head, both columns).

## Family A — round, small-k: high weight by AREA

The round champions are the *most symmetric* tilings — 12-gon-bearing, on a **hexagonal lattice**
(det/λ₁² = √3/2 **exactly** for every round champion k=1..6), with the largest point groups
(splitting |V|/k up to 12, hit by 4.6.12). Their weight is high because the fundamental cell is
**big and round**: s\* ≈ 1.06·λ₁, and λ₁ = √(det/(√3/2)) ≈ √(2·ā·|V|/√3) ≈ 4.5·√k.

**Why they can't do better than O(√k):** a point group of order ≥3 triggers the crystallographic
restriction ⇒ the lattice is forced square or hexagonal ⇒ det = c·λ₁² (area is *quadratic* in the
period). Area is bounded linearly (det ≤ ā·|V| ≤ ā·12·k), so λ₁ — and hence s\* — can only grow as
**√(area) = O(√k)**. The very symmetry that inflates the cell forces it round, and a round cell
hides its area in the square of its radius. Fatter tiles (12-gons maximize ā) and bigger point
groups (maximize |V|) are exactly what these champions do; it buys √k, no more.

## Family B — elongated strips, large-k: high weight by ASPECT

The strip champions are the *least* symmetric — frieze symmetry only, **no 12-gons**, λ₁ = 2
exactly, and a long thin cell (aspect λ₂/λ₁ up to ~12) built as ~2k stacked rows of
triangles/squares/hexagons. |V|/(λ₁k) = **2.00 exactly**. Weight is high because the climb vector
must cross all ~2k levels: Im(climb) ≥ height ≈ 2.1k, and wt ≥ |Im|, so s\* ≥ ~2.1k; the 2/√3
inefficiency of √3-directions lifts the rate to ~2.4, and hexagon rows (height √3) push t4125 to
exactly 2.5k.

**Why they can't do better than ~2.5k:** escaping the √k requires long aspect, which requires
*giving up* the ≥3 rotation (an order-≥3 point group forces the round lattice). Without it,
|V(Q)| ≤ 4k (the elongated splitting bound, glide-attained), the gap alphabet forces climb rate
≥ 2/√3, and the area-share is ≤ ~1 — so H = det/λ₁ ≤ ~2k and s\* ≤ (2/√3)·2k ≈ 2.4k.

## Why NOTHING exceeds ~2.5k: the two mechanisms are mutually exclusive

This is the real answer to "why can't it take more." To beat 2.5k you would need a cell that is
**both** long-aspect (to escape √k) **and** high weight-density per vertex (fat tiles + heavy
splitting). Those require opposite symmetry:

- high weight-density ⟸ big point group / fat tiles ⟹ crystallographic restriction ⟹ **round**;
- long aspect ⟹ no order-≥3 rotation ⟹ |V|≤4k, thin tiles, **no fatness to exploit**.

The data shows the collision zone is **empty**: of 808 elongated tilings (aspect > 1.5), **zero**
have |V|/(λ₁k) > 2.1 (max 2.07); the ratio only exceeds 2.1 for round tilings, and only 3 do, all
at k=1. Only **5 tilings in 1352** have s\*/k > 2.5 — all round, all k≤2 (the 4.6.12 bump). See
`th10-mutual-exclusion.png`: the upper-right corner (long AND heavy) is vacant. That vacancy *is*
the compensation law.

## The duality this reveals (useful for stating the theorem)

The two families each pin one parameter of s\* ≤ 2.5k + c:

- the **linear coefficient 2.5 is set by the strips** (asymptotic, elongated, layered);
- the **additive constant is set by the round small-k champions** — the 4.6.12 sticks 2.5 above
  the 2.5k line at k=1, so any true bound needs c ≥ ~2.5.

So the "+c" in the conjecture is not slack — it is the 4.6.12 tiling. This is why the target is
2.5k + ~2.5 and not just 2.5k.

## Correction to my k=3 feasibility audit (`th10-k3-feasibility-audit`)

That memo called band-4 / E4 "the extremal band" and implied it was the k=3 crux. **The data says
otherwise and I was wrong: the k=3 champions are ROUND (t3005/t3007/t3008, s\* = 7, 12-gon-bearing);
the strips do not overtake until k=4.** Corrected consequences for the k=3-feasible bound:

1. **The binding linear piece at k=3 is the round/wide bound (R1 + E5), not E4/band-4 and not T2.**
   The crux-frame calls R1 "cosmetic for the theorem, one pool-order at k=1–2." That is wrong for
   k=3: the crude round bound (λ₁ ≤ 5.3√k ⇒ s\* ≤ ~10.7 at k=3) sits *above* the s(3)≤10 cliff,
   while the truth is 7. R1 is load-bearing, and its content is exactly the Family-A argument above
   (crystallographic restriction ⇒ det = c·λ₁² ⇒ λ₁ = O(√k)) — which needs its constant sharpened
   from 5.3 to ~4.5, not just an asymptotic shape.
2. **The additive-constant fix still binds at k=3**, but via the *elongated* k=3 tilings (true
   s\* ≤ 6): if bounded through the generic Climb Theorem they carry c₀≈50 → ~56, so the pool would
   be W(56). They must be bounded by explicit ring-walks (additive 0), per the first memo.
3. **T2 and E4-linear are not the k=3 levers.** T2 is a rigor obligation (prove (1,√3) empty
   without citing the catalogue) but tightens no actual champion; E4's linear coefficient (2.73k →
   ~8 at k=3) is already under the cliff.

Net: k=3 feasibility needs (a) a sharp round/wide constant (R1/E5, the k=3 champions) **and**
(b) explicit-walk additive for the elongated k=3 tilings. Both are "finish it the tight way,"
neither is E4 or T2.

## What to actually prove (the theorem this suggests)

State the compensation law as the **dichotomy it really is**, not as a uniform |V|≤2.1λ₁k:

> Every k-uniform tiling is either (R) round — point group with an order-≥3 rotation ⇒ hexagonal/
> square lattice ⇒ s\* = O(√k); or (E) elongated — no order-≥3 rotation ⇒ |V(Q)| ≤ 4k and climb
> rate ≥ 2/√3 ⇒ s\* ≤ ~2.5k. Hence s\* ≤ max(O(√k), 2.5k) + c.

The single hard lemma is the **exclusion**: an order-≥3 rotation forces the round lattice (standard
crystallography) — that is what makes (R) and (E) exhaustive and non-overlapping. Everything else
is per-family arithmetic you already have. The empty corner in Fig-2 is the evidence it holds.

### Evidence (reproducible)
- Crossover head-to-head: round max s\* = 5/6/7/9/10/11, elong = 2/4/6/10/12/14 (k=1..6).
- det/λ₁² = √3/2 exactly for all round champions (hexagonal lattice).
- Mutual exclusion: aspect>1.5 ⇒ n=808, |V|/λ₁k ≤ 2.07 (0 above 2.1); s\*/k>2.5 only for 5 round k≤2 tilings.
- Vertex configs: round champions carry 12-gons (12.6.4, 12.12.3, 12.3.3.4); strip champions never do (3.6.3.6, 3.3.3.3.6, 4.4.4.4).
