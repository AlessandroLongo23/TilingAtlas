# The no-caveats weight theorem — dependency DAG and bottom-up attack plan (2026-07-10, CC+AL)

TARGET (the final assembled claim, no conditions, no oracle):

> **Theorem (global weight law).** For every k-uniform edge-to-edge tiling by unit regular
> polygons ({3,4,6,12} ∪ 4.8.8), W(Λ) ≤ B(k) where B(1..3) = 5, 6, 7 and
> B(k) = 2k + 2⌊(k−1)/3⌋ for k ≥ 4 — and B(k) is attained at every k
> (p6m hexagonal for k ≤ 3, pgg width-2 tubes for k ≥ 4).

Proof shape: case split over (hol(Λ), λ₁). Every case must be closed by exactly one node
below, each node independently refereeable. A node is DONE only when written up + refereed.

## The DAG

```
                 ┌────────────────────────── D0 foundations (DONE) ──────────────────────────┐
                 │  thesis lemmas (wallpaper/quotient/voltage/weight, |P|≤hol, shares)       │
                 │  small-k doc (k≤3 exact 5/6/7, refereed)  ·  Thm B construction (all k≥2) │
                 │  Lemma 3.0 (widths @ norm 4) · width-1 mirror · cmm ≤ 2k ·                │
                 │  certificates §2 · crude crossing (94,136) · E2 (λ₁=1 ≤ 2.31k) ·          │
                 │  E3+T3 (λ₁=√3 ≤ 2k+O(1), constant NOT pinned)                             │
                 └──────┬──────────────┬───────────────┬──────────────┬───────────────┬──────┘
                        │              │               │              │               │
        ┌───────────────▼──┐   ┌───────▼───────┐   ┌───▼────┐   ┌─────▼─────┐   ┌─────▼─────┐
        │ D1 slab/inventory│   │ D3 consolidate│   │ D5 sharp│   │ D8 rigid  │   │ (nothing: │
        │ transfer-graph   │   │ + referee     │   │ crossing│   │ census    │   │ Thm B and │
        │ ENGINE  [tool]   │   │ E2, E3+T3     │   │ constant│   │ per-k     │   │ k≤3 feed  │
        └──┬────┬────┬─────┘   │ (pin the √3   │   │ ⇒ T₀    │   │ k=4..K*   │   │ D10 direct│
           │    │    │         │  constant c)  │   │ pinned  │   │ [compute] │   └───────────┘
           │    │    │         └───────┬───────┘   └──┬───┬──┘   └─────┬─────┘
   ┌───────▼─┐ ┌▼─────────┐  ┌─────────▼┐             │   │            │
   │ D2      │ │ D4       │  │ (c > 2 at│             │   │            │
   │ 3.1(d)  │ │ T2 band  │  │ k=4..6 ⇒ │             │   └──────┐     │
   │ closure │ │ (1,√3)   │  │ D1 sweep)│             │          │     │
   │ ⇒ Thm A │ │ empty or │  └──────────┘             │          │     │
   │ /C UNCON│ │ ≤ pgg law│                  ┌────────▼───┐  ┌───▼─────▼───┐
   └────┬────┘ └────┬─────┘                  │ D7 E5 wide │  │ D9 rigid    │
        │           │                        │ [1+√2,T₀)  │  │ asymptotic  │
        │      ┌────▼───────────────────┐    │ share-avg  │  │ c√k+d,      │
        │      │ D6 E4 snub band        │    │ + rate     │  │ k > K*      │
        │      │ (√3,1+√2)\{2}          │    │ (+ D1 sweep│  │ (rate machi-│
        │      │ structure thm + rate   │    │  k=4..9)   │  │ nery of D5) │
        │      │ (+ D1 sweeps k=4..K_b) │    └──────┬─────┘  └──────┬──────┘
        │      │      ★ HARDEST NODE ★  │           │               │
        │      └──────────┬─────────────┘           │               │
        │                 │                         │               │
        └─────────┬───────┴───────────┬─────────────┴───────┬───────┘
                  ▼                   ▼                     ▼
        ┌─────────────────────────────────────────────────────────────┐
        │ D10 ASSEMBLY + full adversarial round + oracle-independence │
        │ audit: case split (hol, λ₁) → every case cites one node;    │
        │ attainment from Thm B + small-k doc; publish.               │
        └─────────────────────────────────────────────────────────────┘
```

Case-split coverage check (every lattice lands in exactly one closed node):
hol ≥ 8 (square/hex) → D8 (k ≤ K*) / D9 (k > K*); k ≤ 3 → small-k doc (D0).
hol ≤ 4 by λ₁: {1} → E2 (D0/D3) · (1,√3) → D4 · {√3} → D3 · (√3,2)∪(2,1+√2) → D6 ·
{2} → D2 (width-2 IP, all groups) · [1+√2,T₀) → D7 · [T₀,∞) → D5 + crude crossing (D0).

## Node specs (bottom-up order of attack)

**D1 — slab/inventory transfer-graph engine.** [CC, tool, ~2–3 sessions]
For a fixed in-ring width w: enumerate the finite interface states of a width-w cylinder
(tiles have bounded diameter; in-band offsets are sums of boundedly many unit vectors ⇒
finite alphabet), build the transfer graph, extract (i) the tile inventory at w, (ii) all
periodic tubes of bounded height (for per-k sweeps), (iii) extremal steps/vertex ratios
(max-ratio cycle, Karp). Exact arithmetic. ACCEPTANCE: reproduces {T,S,H} and the 8/3 IP
at w=2; independently refereed core. Unlocks D2, D4, the D6/D7 small-k sweeps — and later
the star-family parametrization (same tool). Highest-leverage node; build first.

**D2 — Lemma 3.1(d) closure.** [CC, mechanical after D1; or standalone finite Diophantine
check now] Excluded: sideways triangle + 30°-tilted square at width 2. DISCHARGES the only
conditionality of Theorems A and C ⇒ the width-2 laws (λ₁ = 2 case, ALL groups) become
unconditional. ACCEPTANCE: finite check archived + refereed; Thm A/C status flipped.

**D3 — consolidate & referee the TH-10 band results.** [TA writes, CC referees]
STATUS 2026-07-10: consolidation DONE and REFEREED (two adversarial agents, no fatal;
`resources/research/th10-D3-consolidation-2026-07-10.md`). Post-review constants (honest
c₀ ≈ 50) made the generic Climb route useless at small k; the layered-word exact climbs
bypass c₀: λ₁ = 1 ⟹ W(Λ) ≤ 2k (sharpened by the referee from 2k+2; closed vs pgg law
∀k ≥ 4 with margin); λ₁ = √3 hexagon-bearing ⟹ W(Λ) ≤ 2k (closed ∀k ≥ 1, matches the
measured band max; V5 assert tightened to the sharpened count, 55/55). ONE BLOCKER before
D3 hardens: integrate the E-12 repair as E2-v2 (the on-disk E2 still carries the known
Step-4 circularity; consolidation note §4.0). Fallout absorbed into other
nodes: D2 now gates ALL 378 λ₁ = 2 tilings (E-6: no {3,4}-only λ₁ = 2 exists; E4-A′ ≡
3.1(d)); D6's snub residual is MANDATORY (crude (1+√3)k exceeds the 8/3 slope) and — corrected
2026-07-10 — harder than a rate lemma: weak climbing steps genuinely chain through
adjacent-square (domino) vertices, which the catalogue realizes 829 times across 181
snub-band tilings. The route is an E2/E3-style row classification of the 2cos15°-cylinder
(the band is a two-letter word family, visible in the catalogue ids) + an exact word climb
(same c₀-bypass as the D3 corollaries), with D1 increment 2 (15°-offset frame) as the
discovery/completeness tool. D4's scope grows (extended T2: the (1,√3) band, the {3,4}-only
λ₁ = √3 corner, and the off-grid strata); NEW obligation: per-band λ₁-shell census (which
in-ring norms admit tilings at all) = D1 increment 2.

**D4 — T2 band (1,√3).** [CC, mechanical after D1] Measured empty across the entire
catalogue. Two sufficient outcomes: (a) emptiness — D1's inventory at every in-ring norm in
(1,3) shows no tube closes; or (b) any in-band bound ≤ pgg law. Either closes the node.

**D5 — sharp crossing constant (Appendix B of the pgg doc).** [TA, analytic, medium]
Replace (c₁,c₂) = (94,136) by the fine climb-rate version (target rate ~0.75 ⇒ c₁ ≈ 1.33).
Pins T₀ (currently ∈ {7..~330}); shrinks D7's range and powers D9. WATCHPOINT: every
downstream constant assumes D5's output; freeze its statement early even if the constant
improves later.

**D6 — E4 snub band (√3, 1+√2) minus {2}. ★ the hardest node, the true extremals live
here (t4125 family, measured slope 2.5).** [TA structure + CC sweeps]
Two parts: (i) band structure theorem (unwrapped-hexagon-row classification, extending the
M1/F1F2 notes) + in-band rate ⇒ asymptotic bound ≤ 2.5k + c < pgg law for k ≥ K_b;
(ii) D1-based finite sweeps for k = 4..K_b (bounded height at fixed k ⇒ finite tube words).
WATCHPOINT: 2.5k + c vs pgg 10 at k = 4 leaves NO slack (c ≤ 0 needed asymptotically-only
form) — the small-k range will almost certainly need the sweeps, plan for them.

**D7 — E5 wide band [1+√2, T₀).** [TA+CC, medium] Average-share argument (12-gon spreads
its area over corners with small companions; det/|V| ≤ ~1.45, provable from the finite VC
census) + rate ⇒ ≤ ~1.9k + c ≤ pgg law for k ≥ 4 modulo constant control; D1 sweep for any
residual small-k window.

**D8 — rigid per-k census, k = 4..K*.** [CC, pure compute, existing engine]
The small-k census+shells engine at larger k (shells to |u|² ≤ 27.9k). Delivers certified
rigid ceilings pointwise. Needed range: up to K* where D9 takes over. ACCEPTANCE per k:
census bound ≤ pgg law (expected true from ~k=5–6; k=4 may need census refinement —
if census(4) > 10, refine or accept the pointwise gap and close it via refinement lemmas).

**D9 — rigid asymptotic bound.** [TA, medium; shares D5's rate machinery]
W_rigid ≤ c√k + d with c ≈ 5–7 ⇒ ≤ pgg law for all k > K* (c = 7, d = 5 ⇒ K* ≈ 12).
Kills the "could p6m come back at k = 50" question with a theorem (√k vs linear:
once below, below forever).

**D10 — assembly + adversarial round + oracle-independence audit.** [CC drafts, referees
attack, TA owns thesis text] The case-split theorem; every case cites one node; attainment
from Thm B (k ≥ 4) and the small-k doc (k ≤ 3); audit that no node cites catalogue data;
full referee round on the assembled document.

## Ordering rationale & critical path

Build D1 first: it is a tool, not a lemma, and FOUR nodes (D2, D4, D6-sweeps, D7-sweeps)
plus the star-family program consume it. Then D2 (flips Thm A/C unconditional — biggest
status jump per unit work) and D3/D4 (cheap closures). D5 next because D6, D7, D9 all
consume its machinery. D6 is the long pole — start its structure theorem early (TA) while
CC builds D1/D2. D8 is embarrassingly parallel compute; run it anytime. D10 last.

Critical path: **D1 → D6 → D10**. Everything else parallelizes around it.

## Sharpness watchpoints (where "no caveats" can silently fail)

1. k = 4..9 is the danger zone for every band node: asymptotic bounds with slack constants
   (2.5k + c, 2k + c, 1.9k + c) can exceed the pgg law exactly there. The uniform fix is
   the D1 finite sweep at fixed k — bake it into each band node's acceptance.
2. D8 at k = 4: the census may land above 10; that is a census-refinement task
   (snub-uniqueness lemma, triangle-region argument), not a hole in the plan.
3. Constants must be FROZEN per node before assembly; an improved constant later is a new
   version, not an in-place edit (referee hygiene).

## What this plan does NOT gate

The k ≤ 3 completeness claim (the thesis deliverable) is already independent of every node
here — it needs only the solver re-run at the proven small-k config. This DAG is the
program for the STRUCTURAL claim (pgg law global for k ≥ 4, no caveats), which the thesis
currently words honestly as measured + partially proven.
