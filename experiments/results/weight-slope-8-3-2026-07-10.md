# Weight-ceiling slope is exactly 8/3 — AL's pgg fundamental-domain theory, tested (2026-07-10, AL + CC)

Question (AL): the max reduced-basis weight isn't 2k+c with a fixed c — from the pgg k=7 example
(rectangular tube, FD triangle base 2 × height 9 rows, orbits split 6↑/2↓ with 1 shared) it should
grow as ~(8/3)k, with the pgg lattice steps at k=4,7,10(,13) on one line of slope 8/3.

Data: `ctrnact-weights-exact-k1-13.csv` + `ctrnact-symclass-k1-13.csv` (k=1..11 oracle, 47,852
tilings — the "k1-13" name is aspirational, k=12/13 weights not computed yet).

## Result — theory CONFIRMED, and sharper: an exact closed form

- **pgg max weight = 2·⌊(4k−1)/3⌋ = 2k + 2·⌊(k−1)/3⌋** — exact for all k=2..11 (10/10).
- **pmg max weight = 2·⌊(4k−2)/3⌋ = 2k + 2·⌊(k−2)/3⌋** — exact for all k=3..11 (9/9). Same slope,
  one phase behind pgg.
- **Overall max = the pgg law for every k ≥ 4**; argmax is always pgg × rectangular (k≤3 is the
  small-k p6m regime: 5,6,7 = 2k+3, 2k+2, 2k+1).
- Increment pattern +2,+2,+4 repeating (jumps at k ≡ 1 mod 3) → **slope exactly 8/3**. Through the
  jump points the line is w = (8k−2)/3: slope 8/3, intercept −2/3 (not 0 as first conjectured).
- Tube relation both ways: extremal weight is always w = 2p (tube height p·√3), and
  **min-k(p) = ⌊3p/4⌋+1, exact for p=2..14 (13/13)** on pgg-rectangular. Slope 8/3 = 2 ÷ (3/4):
  2 steps per √3-row of cell height, 3/4 orbit per row in the optimal arrangement. AL's k=7 drawing
  (p=9, k=⌊27/4⌋+1=7, w=18) is the p=9 member.

## What this kills (from ceiling-family-2026-07-09.md's open band 2.33–2.5)

- 2.5k: already dead at k=10 (predicts ≤25, actual 26).
- 2.33k+2.7: dies at k=13 if the law holds (predicts ≤33.0, law says 34).
- 2.4k+3: dies at k=16 (41.4 vs 42).
- Yesterday's "#verts/p ≈ 3.2" was small-p bias: the ratio k/p runs 0.8, 0.778, 0.769 at p=5,9,13 →
  3/4 asymptotically (verts/p → 3, i.e. h → p hexagons removed per cell).

## Falsifiable predictions (next data points)

- k=12 → 30 (= 2k+6, no jump); k=13 → 34 (= 2k+8, jump — as AL predicted); k=16 → 42 (= 2k+10).
- Run: ctrnact weights on the k=12/13 oracle batches.

## Caveats / what is NOT yet proven

- All of this is empirical (k≤11, p≤14). The lower bound "a primitive pgg tube of height p has
  ≥ ⌊3p/4⌋+1 orbits" is exactly the TA Route-2 min-orbit sub-lemma — AL's drawing gives the
  extremal construction (upper bound); the connectivity/detour story is a mechanism hypothesis for
  the lower bound, not a proof. AL's "2/3 top / 1/3 bottom" fractions don't match his own example
  (6 of 7 = 86% top); the clean invariant is 3/4 orbit per row + w = 2p, nothing about detours.
- Evenness is an extremal artifact (w=2p), not a pgg/pmg property: 2,845 of 8,161 pgg/pmg tilings
  have odd weight.
- **Enumeration-completeness implication: any weight budget of the form 2k + const is falsified at
  k ≥ 10.** A complete search radius must grow like 2k + 2⌊(k−1)/3⌋ (or a proven bound above it).

## Artifacts

Analysis inline (this file); data as above; figure `thesis-figs/ctrnact-weight-by-group.png`.

## UPDATE (same day): k=12/13 predictions CONFIRMED

Ran the C++ oracle out to k=13 (`ctrnact-k1213-jump-2026-07-10.log`): k=12 max = **30** = 2k+6
(no jump) and k=13 max = **34** = 2k+8 (jump), exactly as predicted above. At k=13, the first k
where the two formulas differ, all 8 weight-34 tilings are pgg rectangular pure {3,6} tubes and
pmg caps at 32 = 2⌊50/3⌋. The law now stands exact on 12/12 points (k=2..13, 200k+ tilings).
The recovered k=8/9 tilings weigh 7 and 8 (maxima unchanged). Proof architecture in
`docs/WEIGHT_CEILING_OUTLINE.md`.
