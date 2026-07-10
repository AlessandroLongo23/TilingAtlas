# TH-10 (R) round branch — hex/square lattices: skeleton, constants, the one gap (2026-07-05, CC)

Goal of (R): prove `hex/square Bravais ⟹ s* ≤ c₁·√k`. This note gives the proof skeleton, the
constants each step must hit (measured on the 313 hex/square-lattice tilings), and isolates the
single gap — which turns out to be the *same* lemma the elongated branch needs.

## Skeleton (each step rigorous unless flagged GAP)

1. **`s* = max(wt(a), wt(b))`**, a,b the two shortest lattice vectors. For hex/square lattices the
   minimal vectors generate Λ, so weight-≤`max(wt a,wt b)` vectors already generate. *Verified:
   `s* = max(wtU,wtV)` on 313/313 hex/square tilings.* So bounding two vector weights bounds s\*.
2. **`|a| = |b| = λ₁`** (hex/square are well-rounded: λ₁ = λ₂). [exact]
3. **`det = c·λ₁²`**, `c = √3/2` (hex) or `1` (square). [exact — this is why round hides its area
   in a *square*, giving √k]
4. **`det ≤ ā·|V(Q)| ≤ 2.01·12k = 24.2k`**: area-share census gives max per-vertex share
   `ā = 2.01` (the 3.12.12 vertex); `|V(Q)| ≤ 12k` (per-orbit splitting ≤ 12). [rigorous]
5. **`λ₁ ≤ √(24.2k / c) ≤ 5.29·√k`** (hex). [rigorous]
6. **GAP — walk-stretch:** `wt(a) ≤ (2/√3)·λ₁ + O(1)`. ⟹ `s* ≤ (2/√3)·5.29√k ≈ 6.1√k = O(√k)`.

Steps 1–5 are solid. Everything hangs on step 6.

## Measured constants (313 hex/square tilings — what the proof must achieve)

| quantity | hex | square | note |
|---|---|---|---|
| max `wt/λ₁` (stretch) | **1.1547 = 2/√3** | 1.296 | never √2 — minimal vectors dodge bad directions |
| max `λ₁/√k` | 4.73 | 3.60 | crude bound 5.29 |
| max `det/|V|` | 2.01 | 1.86 | census max (3.12.12) |
| max `|V|/k` | 12.0 | 7.0 | splitting |
| max `s*/√k` | **5.00** | 4.00 | the round envelope |

Two facts make step 6 sharp and its target unambiguous:

- **The optimal stretch is exactly 2/√3, and it's pinned from below.** The L₂ dual certificate
  (M1 A₃) gives `wt(v) ≥ (2/√3)|v|` for √3-direction vectors, and A₄ attains it (`wt(m√3)=2m`). So
  no round bound can beat `(2/√3)λ₁` — and the data sits exactly there (hex stretch = 1.1547).
  The gap is *only* the upper bound: proving minimal periods **achieve** their optimal weight.
- **The `√2` catastrophe does not occur for minimal vectors.** Lemma A is false in general
  (`wt(n(1+i)) = √2·|v|`), but `n(1+i)` is a *diagonal* (non-minimal) — Gauss reduction never
  selects it. Max stretch over all 313 round tilings is 1.30 < √2. So the lemma is true precisely
  when restricted to reduced generators, which is all step 1 needs.

## Constant accounting — why k=3 forces the sharp version

| version of step 6 | stretch used | `s*` bound | k=3 value | feasible? |
|---|---|---|---|---|
| crude greedy walk | `1/cos75° = 3.86` | `20√k` | 35 | no |
| qualitative (tile-boundary routing, dilation ≤ ~1.6) | 1.6 | `8.5√k` | 15 | no — but **proves O(√k)** |
| optimal (stretch 2/√3 + joint det ≈19.4k) | 1.155 | `~5√k` | **9** | yes |

So a *qualitative* (R) — `s* = O(√k)` — is provable now with a crude dilation bound (route around
each crossed tile; worst face is the 12-gon at ratio 6/3.73 ≈ 1.6). That's a real thesis result.
But it lands k=3 at 15, still over the wall. **k=3 feasibility requires step 6 at the optimal 2/√3**,
plus tightening step 4's `det ≤ 24.2k` to the observed `≈19.4k` (the 3.12.12 share and 12-fold
splitting don't co-occur — a round-case joint-extremality, sibling to the elongated one).

## The payoff: (R) and (E) are the SAME lemma

The elongated branch needs `wt(climb) ≤ (2/√3)·H + O(1)` (the Climb Theorem, whose honest additive
was the c₀≈50 problem). The round branch needs `wt(minimal period) ≤ (2/√3)·λ₁ + O(1)`. **Both are
one statement:**

> **Walk-stretch lemma.** For a Gauss-reduced generating vector v of a tiling's period lattice,
> `wt(v) ≤ (2/√3)|v| + O(1)`.

- False for general v (diagonals reach √2); true — and optimal — for reduced generators (data: ≤2/√3 hex).
- Proving it closes (R) at ~5.5√k *and* kills the elongated additive constant *simultaneously*.
- The constant 2/√3 is fixed from below by the certificate; the entire task is the upper bound =
  showing short periods are realized by efficient √3-grid walks (no long detours, cancellation counted).

The Bravais stratification did its job: it told us the round case bites on *minimal periods* and the
elongated case on *climb vectors*, but the core estimate is shared. **Write the walk-stretch lemma
once; it is the k=3 gate in both branches.** There is no crude shortcut for k=3 — every loose version
of step 6 lands above the wall.

### Evidence
- 313/313 hex/square: `s* = max(wtU,wtV)`; max stretch hex = 1.1547 (=2/√3), square = 1.296, none ≥ √2.
- crude det ≤ 24.2k vs actual max det/k = 19.4 (joint gap); λ₁/√k ≤ 4.73 actual vs 5.29 crude.
- source: `weight-tightness.csv` + `galebach.json`, Bravais classification from `T1,T2`.
