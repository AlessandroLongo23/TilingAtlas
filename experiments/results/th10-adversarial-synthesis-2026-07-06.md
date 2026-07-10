# Adversarial pass — what survived, what to fix, what to retract (2026-07-06)

Four independent adversarial agents attacked the "proven" list. Data foundation is clean; the
hard bounds are tight; four overclaims were caught. Honest ledger below.

## Data foundation — CLEAN (one scope fact to state)

`galebach.json` is genuinely ℤ[ζ₁₂] (30° grid); verified against known geometry (honeycomb √3,
4.6.12 = 3+√3) and reproduces the CSV λ₁/λ₂ on 1338/1338 non-degenerate tilings. **There are NO
octagon/15°-grid tilings in the dataset** — the polygon set is {3,4,6,12} only (√2 ∉ ℚ(√3), so the
ring literally cannot carry an octagon, and none are present). My ℤ[ζ₁₂] analysis is therefore
uncorrupted. **Scope to state in the thesis: everything here is the {3,4,6,12} regular-polygon set.**
(Also: the memory note calling t1008/t1009 "snub-square" is a misnomer — they're 30°-grid tilings.)

## BULLETPROOF (thesis-ready, verified in exact arithmetic)

1. **Cone Lemma** — proof airtight; the cancellation worry cannot occur (non-negative coefficients ⇒
   axis-projections add). *Fix:* state the hypothesis as a **closed 60° arc (all roots within ±30° of
   the axis)** — not just "a 60° arc."
2. **Area Lemma (core)** — `det = s + t·√3/4` and `det ∈ ½ℤ[√3]`; so `det ∈ ℚ ⟺ t=0 ⟺ square grid ⟺
   λ₁=1`; `t` even. Exactly one catalogue tiling (the 4⁴) has rational area. *Fix:* cite
   Grünbaum–Shephard for "edge-to-edge unit squares ⇒ the grid."
3. **Scope argument (NEW, from the attack, a genuine upgrade):** a unit regular n-gon forces
   `λ₁ ≥ 2·apothem = cot(π/n)` — triangle .58, square 1, **hexagon √3**, octagon 2.41, 12-gon 3.73.
   All non-{3,4} tiles are ≥ √3, so **no tiling with a hexagon/12-gon has λ₁ ∈ (1,√3)** → the {3,4}
   restriction in T2 is justified. *Caveat:* razor-thin — the hexagon sits **exactly** on √3, so the
   interval must be **open** at √3 (closed would admit the honeycomb); assumes regular tiles.
4. **Elongated bounds** — of 934 rhombic/rect/oblique tilings, `s* ≤ 2k+2` (0 violations, **attained
   at slack 0** at t4125/t5191/t6301…), `|V(Q)|/(λ₁k) ≤ 2.1` (0 violations, max 2.07), rhombic
   `s* ≤ 2k`. Exact-arithmetic classification, no boundary flips. *Fixes:* (a) `|V|/(λ₁k) ≤ 2.1` is
   **elongated-only** — three round k=1 tilings exceed it (t1003 2.54, t1010 2.27, t1006 2.20); (b)
   exclude the degenerate **t1002** (T1=T2=0) from the dichotomy explicitly.
5. **T2 on-grid case** — only the tilted 4⁴ vertex survives; forces λ₁=1. *Fix:* write out the
   "λ₁<2 ⇒ one vertex per level" step as a short lemma (currently asserted).
6. **2-edge girth ⟹ λ₁=√2** — airtight.
7. **Stretch ≤ 2/√3 for hexagonal; Type-A/Type-B form; single outlier t6099** — all confirmed
   (0/335 exceed; nothing anywhere exceeds √2, global max 1.296).

## NEEDS CAVEAT / DOWNGRADE

8. **Round O(√k):** NOT established by the data — on 6 points a *linear* fit (R²=0.988) beats the √k
   fit (R²=0.968), exponent 0.576. The *qualitative* `O(√k)` is provable via bounded dilation; the
   tight `5√k` is a k≤6 sample max. State: "O(√k) via dilation; ≤5√k measured to k=6, not proven."
9. **Hex "minimal periods 289/289 on the 30°-grid":** FALSE — **243/289 on-grid, 46 off-grid** (still
   ≤2/√3, but not by the √3-zig-zag mechanism). The *attainers* of exactly 2/√3 are all √3-direction
   (31/31, verified). So: the √3-zig-zag explains the on-grid majority and all attainers; the 46
   off-grid cases are a real coverage gap in that proof route.
10. **"Square stretch climbing toward √2":** OVERCLAIM (cherry-picked even k; per-k maxima
    non-monotonic: 1.03,1.20,1.03,1.26,1.14,1.30). State only "reaches 1.296 by k=6, bounded by √2."

## RETRACT

11. **"The Cone Lemma dissolves c₀≈50 and unifies the round & elongated branches":** OVERCLAIM, do
    not use. The unification was already self-refuted (2/√3 is hex/oblique-specific). And c₀ is not
    dissolved — it is *relocated* into the open no-backtracking/amortization step (the corner-clipping
    pathology that produced c₀ is unresolved). Honest form: "the qualitative round bound is c₀-free;
    the tight constant that would remove c₀ is open."
12. **"43 → 39 residual, full finite enumeration" for T2 off-grid:** RETRACT the finiteness. The
    residual is **unbounded** ([-5,5]→39, [-8,8]→90, [-12,12]→184; ℤ[ζ₁₂] is dense), and the
    norm-classifier double-counts (a norm can have both grid and off-grid reps). This *strengthens*
    the honest verdict: T2 off-grid is a genuine hard open problem, not a finite check.
13. **"√2 killed by the Area Lemma":** HOLE — there exist ℤ[ζ₁₂] lattices with shortest vector √2 and
    *irrational* area (the 2-edge argument pins only one generator; the transverse one can carry √3).
    So √2 is only killed for the rational-area (even-Gaussian) lattice; in general it is
    **empirically absent**, not Area-Lemma-excluded. Fix: prove "2-edge √2 girth ⇒ t=0" or downgrade.

## Net

The scaffolding is real: **Cone Lemma, Area Lemma, the 2·apothem scope argument, the elongated
bounds, on-grid T2, and the hex stretch bound are thesis-grade** (with the small fixes above). The
round `O(√k)` is qualitative-only; the tight constants and the whole off-grid/period-quantization
crux remain open — now honestly so. Two of my prior summary bullets (c₀-dissolution, 39-residual
finiteness) were overclaims and are withdrawn.
