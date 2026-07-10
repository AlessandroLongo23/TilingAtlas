# The size bound: λ₁ ≤ (2√2+√6)·√k — PROVEN (2026-07-06, CC for AL)

**Theorem (short-axis / size bound).** For every k-uniform edge-to-edge tiling by unit regular
polygons from {3,4,6,12}, the shortest period satisfies

>  **λ₁ ≤ (2√2 + √6)·√k ≈ 5.278·√k.**

For **round** tilings (hexagonal or square Bravais lattice) λ₁ = λ₂, so this bounds the *whole*
fundamental cell — i.e. `s*_length = O(√k)` for round. For **elongated** tilings it bounds only the
short axis (the long axis λ₂ is Θ(k) — that is the separate, elongated branch).

This is a **length** statement, fully elementary. It does *not* by itself bound `s*` (the step-weight);
turning length into weight still needs the dilation constant (open). But it is exactly the intrinsic,
basis-independent quantity you prune round candidates with.

---

## Proof — three lemmas, each standard, each verified tight

Notation: reduce the period lattice to a Gauss-reduced basis (v₁,v₂), |v₁|=λ₁≤|v₂|=λ₂, angle θ.
`det` = area of the fundamental domain (= area of the torus ℝ²/Λ). **Hypothesis:** Λ is the full (primitive) translation lattice of the tiling — a non-primitive super-cell keeps the bound valid but loose (it inflates det and |V(Q)| together), so pruning stays sound; only a *tightness* claim would care.

**Lemma 1 (short axis vs area).** A Gauss-reduced basis has |cos θ| ≤ ½, i.e. θ ∈ [60°,120°], so sin θ ≥ √3/2 (sin is symmetric about 90°). Hence
`λ₁² ≤ λ₁λ₂ = det / sin θ ≤ (2/√3)·det`.
*(For round, θ = 60° or 90° and λ₁=λ₂, so this is the identity det = (√3/2 or 1)·λ₁².)*

**Lemma 2 (area vs vertices).** Split each tile's area equally among its corners: a p-gon gives
`area/p = (1/4)cot(π/p)` to each corner. Summing over the torus,
`det = Σ_tiles area = Σ_vertices charge(v)`, where `charge(v) = Σ_{tiles at v} (1/4)cot(π/p)`.
At any edge-to-edge vertex the tile angles sum to 360°, so charge(v) is at most the maximum over all
{3,4,6,12} vertex configurations. Enumerating them, that maximum is the **3.12.12** vertex:
`ā = 1/(4√3)·… = 1 + 7√3/12 ≈ 2.0104`. Hence `det ≤ ā·|V(Q)|`. (Edge-to-edge is used only here, and only so that every geometric vertex of the cell is a genuine tiling vertex — no edge-midpoint / T-junction incidences — so the `|V(Q)|` summed here is exactly the count bounded in Lemma 3.)

**Lemma 3 (vertices vs k).** k-uniform = k vertex-orbits under the symmetry group. Each orbit meets one
translational cell in ≤ |point group| vertices, and a 2D crystallographic point group has order ≤ 12
(D₆). Hence `|V(Q)| ≤ 12k`.

**Chain.** `λ₁² ≤ (2/√3)·det ≤ (2/√3)·ā·12k = (2/√3)(1+7√3/12)(12)·k = (14 + 8√3)·k`.
Since `14 + 8√3 = (2√2+√6)²`, we get **λ₁ ≤ (2√2+√6)·√k**. ∎

---

## Numerical verification (`experiments/th10-size-verify.py`, exact-form constants; 1247 catalogue tilings)

| step | statement | violations | tightness (saturated by) |
|---|---|---|---|
| L1 | det ≥ (√3/2)·λ₁²  (reduced angle ≥ 60°) | **0** | min det/λ₁² = 0.86603 = √3/2 (every round tiling; min angle = 60.000°) |
| L2 | det ≤ ā·|V(Q)| | **0** | max det/|V(Q)| = 2.01036 = ā (a 3.12.12 tiling) |
| L3 | |V(Q)| ≤ 12k | **0** | max |V(Q)|/k = 12.000 (4.6.12) |
| ⇒ | λ₁ ≤ 5.278·√k | **0** | max λ₁/√k = **4.7321** at t1003 = 4.6.12 (k=1) |

Every lemma is individually tight, and the final bound holds with zero counterexamples.

**Scope.** The catalogue here is the {3,4,6,12} / 30°-grid family only: the octagon tiling 4.8.8 and the rest of the ζ₂₄ family are out of scope, so the k=1 set is 10 real uniform tilings plus one degenerate placeholder (t1002, T1=T2=0), *not* the full A068599 count of 11. The {3,4,6,12} restriction enters only through ā's vertex enumeration in Lemma 2; Lemma 3 is tile-agnostic and already covers e.g. 4.8.8 (point group D₄, λ₁ = 1+√2, |V| = 8k, λ₁/√k ≈ 2.41 ≪ 5.278). To reclaim the octagon family, re-enumerate ā over {3,4,6,8,12}; nothing else changes.

---

## The constant gap — honest

- **Proven:** C = 2√2+√6 ≈ **5.278**.
- **True (measured max):** **4.732**, at 4.6.12.

The gap is because the three lemmas **cannot co-saturate**. L3 (|V|=12k) needs a 12-fold point group;
the 12-fold tilings (4.6.12) have vertex-charge **1.616**, not the maximum ā = 2.010 (the 3.12.12
vertex, which only occurs in low-|V|/k tilings). Feeding each tiling's *actual* charge instead of the
global ā gives `max_round(det/k) = 19.392`, hence `C = √((2/√3)·19.392) = 4.732` exactly. Proving that
— i.e. that high point-group symmetry forces lower per-vertex charge — is the **joint-extremality**
optimization. It is finite (a bounded search over round vertex-configuration combinations) but genuinely
more delicate than the three one-line lemmas above. It is *not* needed for a working √k bound.

Note also: 5.278 vs 4.732 is a length bump of ~12%; both are O(√k), so for **feasibility / pruning
soundness** the crude 5.278 already suffices (it discards fewer candidates, never a valid one).

---

## What this gives you, and what it does not

- **Immediately usable:** any candidate hexagonal/square lattice with λ₁ > 5.278√k cannot be a valid
  tiling → discard. Length is basis-independent, so this soundly discards the **lattice**, not just one
  pair-presentation. And it is *proven*, so it may go in the certified run (unlike the measured
  λ-spectrum / quantization pruning, which may not).
- **Not yet:** this bounds **length**, not **weight** `s*`. The pool is sized by weight, so to size the
  round pool from this you still need `wt(λ₁) ≤ C_stretch·λ₁` (the dilation step — corner-clipping,
  currently open). The size bound is the provable half; the weight half remains.

---

## Adversarial review (2026-07-06, 4 disjoint agents)

Four independent agents attacked L1 / L2 / L3 / (composition+verification+relevance), instructed to treat the catalogue as non-evidence and to construct counterexamples. **No lemma was broken; two independent re-derivations (one at 40-digit precision) reproduced 0/1247 with each lemma saturated.**

- **L1 (geometry) — SURVIVES.** The angle floor is a theorem (`|cos θ| ≤ ½ ⇒ θ ≥ 60°`); λ₁ is the true first minimum (2D Lagrange reduction is optimal); det is basis-independent. *Fixed:* the reduced angle is [60°,120°] (sin symmetric), not [60°,90°].
- **L2 (area-charge) — SURVIVES.** `det = Σ charge(v)` is an exact torus identity (no boundary, so no double-count); `ā = 3.12.12 = 1+7√3/12` is the global max by independent enumeration; the charge cap doesn't even need edge-to-edge. *Fixed:* stated the vertex-count hinge (e2e ⇒ geometric vertices = tiling vertices = |V(Q)|).
- **L3 (symmetry / k) — SOUND; scope was a write-up gap.** k = vertex orbits (confirmed in `KUniformityChecker.ts`); |point group| ≤ 12 (crystallographic restriction); `len(Seed)` is the right count, saturated = 12k at 4.6.12. *Fixed:* scope stated ({3,4,6,12} only, not full A068599; restriction inherited from L2, not L3).
- **Composition / verification — SURVIVES.** `14+8√3 = (2√2+√6)²` confirmed; an upper bound needs no simultaneous saturation; no lemma depends on the catalogue; no float-tie risk (loosest margin 0.55, exact algebraic equalities).
- **Shared fragility (L1 & L3): primitivity** — now a stated hypothesis.
- **Open objection (severity: high) — RELEVANCE.** The search cost is governed by step-**weight** `s* = Θ(k)`; this bounds **length** λ₁ (and, for elongated tilings, only the short axis). So on its own it is inert for feasibility until the open length→weight (dilation) step lands — and even then only for the round branch. A real, proven theorem, but the down-payment half, on the length axis.

*Theory artifact — for TA to adapt into the thesis (round-branch lemma). Reproducer: `experiments/th10-size-verify.py`.*
