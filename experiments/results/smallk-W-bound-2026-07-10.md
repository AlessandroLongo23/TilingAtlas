# Small-k weight bound (k ≤ 3) — architecture + first certified-shape probe (2026-07-10, CC)

Goal (AL): an airtight proven radius R_k for k = 1, 2, 3 so the k=3 count (61) becomes
provably complete. Measured targets (ctrnact, exact): max W = 5, 6, 7 at k = 1, 2, 3,
argmax p6m/hexagonal at all three. Per-lattice-system maxima at k=3: hexagonal 7,
rect/rhombic 6, square 4, oblique 3 (61 = 22 hex + 16 rect + 19 rhom + 2 sq + 2 obl).

Current proven radius: thm:weight's 24k−1 = 71 at k=3 (computationally dead). TH-10's
tightening program has the binding pieces still open in general (R1 round constants,
T2/E4/E5 bands). At k ≤ 3 every open asymptotic lemma can be replaced by a finite
exact computation. Architecture by lattice system (crystallographic restriction, proven):

- **Hexagonal / square (the binding branch).** Λ = u·(ℤ+ωℤ) resp. u·(ℤ+iℤ); W ≤ wt(u),
  and |u|² is PINNED by the cell area: |u|² = (2/√3)A (hex), = A (square). A is a sum of
  ≤ |V(Q)| ≤ k·|P| vertex corner-shares from the finite VC share table, all shares have
  nonnegative (ℤ + ℤ√3)/12 coordinates, so the admissible exact norms (X, Y),
  |u|² = X+Y√3, live in a finite box with X, Y ≥ 0. Each exact shell in ℤ[ζ₁₂] is finite
  (the rational part X = a²+b²+c²+d²+ac+bd is positive definite ⇒ coefficients ≤ √(2X)).
  ⇒ the whole branch is a certified finite computation: enumerate shells, BFS wt exactly.
- **Rect / rhombic / oblique** (|P| ≤ 4 ⇒ |V(Q)| ≤ 4k = 12): quotient-first sweep
  (the ST-6 object: consistent VC-labeled quotient graphs on ≤ 12 nodes, Λ = voltage
  lattice, W computed per lattice). Bypasses Lemma 3.1(d) entirely. Fallback: band
  assembly (width-1 proven, width-2 IP, small-k residual bands as finite checks).
- **k=1 addenda:** 4.8.8 analytic (W = wt(1+√2) = 3, ζ₂₄); the rest via the same engines.
- **Attainment:** dual-certificate lower bounds (§2 machinery) on the three p6m argmaxes.

## Probe (this file's sibling `smallk-hex-shell-probe-2026-07-10.py`, exact integers)

Superset of every possible hex minimal vector at k ≤ 3 under the CRUDE census
(n ≤ 12k = 36, share ≤ (12+7√3)/12 ⇒ |u|² ≤ 36+21√3 ≈ 83.57):

- 466 admissible exact shells, 12,576 ring elements, all weights resolved by BFS ≤ 14.
- Sanity pin: the 4.6.12 shell |u|² = 12+6√3 → wt exactly 5 = measured W(4.6.12). ✓
- **Crude proven-shaped hex bound: W ≤ 14** (vs 71 from thm:weight). Worst shells all sit
  at |u|² ≳ 69, i.e. the census slack (real k≤3 cells are far smaller).

Refinement path 14 → ~7: replace the crude n·share_max by the real census
(per-orbit: ≤ 3 VC types, orbit sizes |P|/|stab|), which caps A by the actual maximal
k≤3 hex cell; then per-shell realizability kills stragglers, or the bound lands at the
surviving shell max (expected R₃ ∈ [7, 10] — any value there is solver-feasible).

Honest gaps to close before "airtight": census (finite, to write down), quotient-sweep
tractability at n ≤ 12 (ST-6 flagged it unproven; probe first), attainment certificates,
adversarial round. The small-k theorem does NOT inherit the pgg proof's 3.1(d) gap if
the sweep route carries the non-rigid branch.

## UPDATE (same day): theorem assembled, referees in flight

Full census run (`smallk-census-shells-2026-07-10.py` + `.csv`; theorem write-up
`docs/SMALLK_W_BOUND.md`): with orbit structure (m_i | |P|), Euler + tile integrality,
five pure-species rigidity lemmas (3⁶, 4⁴, 6³, 3.12.12, 4.6.12 corona-forced) and
co-occurrence connectivity:

| branch | k=1 | k=2 | k=3 |
|---|---|---|---|
| hexagonal (basis pairs) | 6 | 8 | 10 |
| square (basis pairs) | 3 | 6 | 7 |
| hol ≤ 4 (generators + joins, thm:weight) | 7 | 15 | 23 |

Attainment proven exactly: max W = 5, 6, 7 (⌈λ₁⌉ lower bound + shell upper bound;
λ₁² = 12+6√3 / 16+8√3 / 21+12√3 & 28+10√3, hexagonality verified exactly).
Pool sizes (12 dirs): |W(10)| ≈ 1.9e4, |W(15)| ≈ 8.7e4, |W(23)| ≈ 4.6e5.
Consumption gap flagged: tuned k=3 poolSteps = 8 < proven hex 10 — the k=3 recert must
re-run at the proven config before the completeness claim attaches. Three adversarial
referees (orbit/lattice, combinatorial geometry, computation) launched on the doc.
