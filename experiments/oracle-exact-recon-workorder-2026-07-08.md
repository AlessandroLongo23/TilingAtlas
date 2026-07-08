# Oracle reconstruction — exact cloud-probe vs float — CC work order (2026-07-08)

**Owner: CC. Requested by AL. Status: DONE.** Spike B of the Soto-Sánchez 2021 review.

**One-liner:** prototype the paper's pure-integer cloud reconstruction of an oracle cell, benchmark
it against the current float reconstruction in `scripts/oracle-match.ts`, and report the
speed/accuracy trade-off. **Evaluation only — the certified script is untouched.**

## Question

`reconstructOracleCell` rebuilds each oracle tiling from its integer `[a,b,c,d]` seeds using a float
grid broadphase (`0.98..1.02` distance band), an atan2 face-walk, "untrusted rim" heuristics, and a
`1e-6` float area check. The paper's method needs no float: seeds ⊕ lattice window into a hash
cloud, then per interior vertex probe the 24 unit directions `ζ^k` and hash-look-up `(v+ζ^k)` — the
ζ-exponent is the angular order, and the face on each wedge follows from the integer angle gap. Is
it a win?

## Method

`scripts/oracleReconstructExact.ts` implements the exact method: `faceFromGap` maps the five valid
interior-angle gaps `g ∈ {4,6,8,9,10}` to tiles `{3,4,6,8,12}` (explicit guard — the bare
`(12−g)|24` test would also admit `g=11 → n=24`; closed); `reducedClassKey` for exact
class-canonical dedup; a `Surd` area certificate. `scripts/oracle-match-exact-proto.ts` runs both
over all k≤3 oracle entries and measures accuracy (mutual `cellsCongruent` — transitive with the
snapshot match), robustness, negative-fixture rejection, and speed. Unit tests in
`tests/oracle-reconstruct-exact.test.ts`.

## Result (see `results/oracle-exact-recon-2026-07-08.md`)

- **Accuracy: 92/92** congruent (or both-error on t1002, the ℤ[ζ₁₂]-degenerate 4.8.8). By
  transitivity of ≅, the exact method would produce a byte-identical oracle map.
- **Robustness: parity** (91/92 clean each; only t1002 refused, correctly, by both).
- **Negative fixtures: 3/3 rejected loudly** (degenerate basis; doubled basis → no faces; stray
  seed → area mismatch), plus the `g=11` guard unit-tested. It is a real verifier, not a happy-path
  acceptor.
- **Speed: exact is ~5.8× slower** (≈1300 ms vs ≈225 ms per k≤3 pass) — BigInt cyclotomic probing +
  exact reduction vs a float grid.

## Recommendation

Keep the current float script (the plan's decision). The exact reconstruction reproduces it exactly
and is strictly more faithful to the "no float on a decisive path" mandate, but it is ~6× slower for
no accuracy or robustness gain on the present oracle, so there is no reason to swap it into the
certification path now. It stands as a validated drop-in if the float rim/area heuristics ever cause
trouble (e.g. a future oracle with pathological bases). No proven-path change.
