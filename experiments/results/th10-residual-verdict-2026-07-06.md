# The residual, run to ground (2026-07-06, CC)

Residual from last turn: "the shortest period of a hexagonal-lattice tiling is a 30°-grid vector,"
which I called "pure lattice arithmetic, no tiling geometry left." I attacked it. It is **not** pure
arithmetic — and locating exactly why is the useful result.

## Clean reformulation (rigorous)

For `v ∈ ℤ[ζ₁₂]`, `wt(v) ≥ house(v) = maxₛ|σ(v)|` (A₂). The relevant conjugate is `σ₅: √3 ↦ −√3`.
Writing a grid-directional real vector as `v = a + b√3`:

- **same-sign (a,b ≥ 0):** `house = |a+b√3| = |v|`, and `wt ≤ a+2b`, giving **stretch ≤ 2/√3**. ✓
- **opposite-sign (cancellation):** `σ₅v = a−b√3` is *longer* than `v`, so `house(v) > |v|` and stretch
  blows up: `2−√3 → 13.9`, `5−2√3 → 5.5`, `7−4√3 → 194` (all rigorous, house is a true lower bound).

So: **stretch(v) ≤ 2/√3 ⟺ v is grid-directional AND conjugate-reduced** (its √3-conjugate is no
longer than it). The residual is exactly: *the shortest period is conjugate-reduced.*

## Correction: NOT pure lattice arithmetic

Counterexample, abstract but rigorous: `w = 5 − 2√3 ∈ ℤ[ζ₁₂]`, `|w| = 1.536 ≥ 1` (a legal period
length), `house(w) = 5 + 2√3 = 8.46 ⟹ wt(w) ≥ 9`. The lattice `Λ = w·ℤ[ζ₆] = ⟨w, ζ₆w⟩` is
**hexagonal**, its shortest vector is `w`, and its stretch is `≥ 5.5 ≫ 2/√3`. So

> "hexagonal Bravais ⟹ shortest-vector stretch ≤ 2/√3" is **FALSE for abstract sublattices of ℤ[ζ₁₂].**

Tilings *avoid* these lattices, but that avoidance is a tiling-geometry fact, not a lattice identity.
My "no tiling geometry left" was wrong.

## Where the difficulty actually lives — and the one promising lead

The corrected residual: *no unit-regular-polygon tiling has a hexagonal period lattice whose shortest
vector is a cancellation direction.* Now the lead: **the bad lattices have forbidden `λ₁`.** The
cancellation vectors that break the bound have small length in a specific window — `w=5−2√3` has
`λ₁ = 1.54 ∈ (1, √3)`, which is **exactly the T2 band that is measured empty**; the next ones
(`7−3√3 = 1.80`, etc.) sit in `(√3, ~2.6)`, also empty for hexagonal tilings in the data. So the
reason tilings dodge the bad lattices is **period quantization** — the achievable `λ₁` for a
hexagonal tiling are `√3·ℤ`-flavored (conjugate-reduced) values, and the cancellation lengths fall in
the gaps that don't occur.

That is a real connection: **the round walk-stretch residual reduces to the same period-quantization
question as T2** (why certain `λ₁` bands are empty). It is not a new isolated lemma; it is T2's family.

## Honest verdict on the whole drill-down

The chain was: prove TH-10 → dichotomy → Bravais split → walk-stretch lemma → this residual. Each
step was real and sharpened the problem. The bottom of the well is: **short periods land on
conjugate-reduced (grid) directions, because the forbidden `λ₁` bands are empty** — i.e., period
quantization. That is the genuine hard crux, and it is *shared* with T2. I did not close it. What I
can hand over is precise:

- **Proven:** (R) is `O(√k)` (bounded dilation); the hexagonal tight constant is `2/√3` and optimal;
  the mechanism (√3-direction periods, `wt=2m` zig-zag) is exact.
- **Reduced:** the tight round bound ⟺ "shortest hexagonal period is conjugate-reduced" ⟺ a
  period-quantization statement in the T2 family.
- **Corrected (twice):** `2/√3` is hexagonal-specific, not universal (square → √2); and this residual
  is tiling-geometric, not pure arithmetic.

## What this means for the goal

For the **thesis**: ship (R) qualitative `O(√k)` + the measured-tight constant, and record the tight
round bound as *"reduces to period quantization (cf. T2)"* — a factored, sharp open obligation, which
is a contribution in itself.

For **k=3 feasibility**: it is *not* close. The k=3 champion is a hexagonal tiling at the wall
(`s*=7` true; provable bound today `~10–14` needing both this residual and the joint-det tightening).
Closing k=3 requires the period-quantization crux **and** the round joint-extremality — each roughly
as hard as T2. The honest status is: the crux is now precisely located and connected to T2, not that
a proof is imminent.

### Evidence
`wt ≥ house` values exact in ℚ(√3); `w=5−2√3` hexagonal lattice `w·ℤ[ζ₆]` shortest-vector stretch
≥ 5.5 (house 8.46 / |w| 1.54); cancellation lengths 1.54, 1.80 fall in the measured-empty
`(1,√3)`/`(√3,2.6)` hexagonal gaps. A₂/A₄ from the M1 toolkit.
