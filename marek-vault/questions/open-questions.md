---
type: questions
tags: [questions]
---

# Open questions

Split in two: research problems (his and now ours) and things I still need him to explain. Resolved
items move into the relevant note with the answer and its anchor; the strikethroughs stay here as a
record.

## Research problems

- **Prove the hybrid edge identities exact.** The edge lengths are numeric (≈50 decimals); no proof
  the coincidences are exact. His view: at that precision, a mismatch "would be even stranger," but
  it's open. See [[hybrid-identities]].
- **Formalize the surroundability ("corona") conditions.** Edge-length existence is necessary, not
  sufficient; connection needs ≥2 shared polygons; some multi-edge systems can't even surround one
  polygon. He wants precise conditions. See [[hyperbolic-tilings]].
- **The `(A3^2,Aoo)=(A8,A24)` family:** connectable vertices, yet no hybrid tiling ever found. Why?
  See [[hybrid-identities]].
- **Uniqueness proofs for isolated systems:** `3.3.6.9` is unique (engine evidence); he sketches a
  branching-structure proof and expects it generalizes to all `3.3.6.3n`, n > 2. In the style of the
  4.8.8 argument. See [[dual-search]].
- **≥5-valent periodic hypothesis:** Arun's paper (arXiv:2302.05661) settles 4-valent nonexistence
  cases; Marek believes 5-valent and up always admit a periodic solution. Unproven.
- **Edge-selector optimization:** which heuristic for choosing the unpaired edge is fastest; needs
  experiments. See [[dual-search]], [[roadmap]].
- **Canonization for STS:** a deterministic canonical representative (multithreaded runs currently
  record a random equivalent form). My Soto-Sánchez-matrix approach might apply but needs the tiling
  in matrix form. See [[canonical-form]].
- **3D first target:** are the isohedral tilings of space by 1×1×2 cuboids even classified? He thinks
  not. See [[marek-list-of-ideas]] (1e).
- **Hyperbolic k counts per family:** e.g. in the 5.5.5.3 family the k-uniform count is not
  monotonic in k (k divisible by 5 fits pentagons better). Is there structure to that?
  ![[archive/2026-07-15#^msg-1526871789626462308]]

## To ask / to nail down with Marek

- `encode_corner(a, n, b)`: meaning of the first and third arguments. See [[main_euclidean.cpp]].
- Is the repo pruner's WL/DFA fingerprint the same thing as Eryk's duplicate detection, or does it
  already provide the canonization he says is missing? See [[canonical-form]].
- Where exactly chiral-pair merging happens (search adds both chiralities; counts identify them).
- The full symmetry-suffix parse in the converters (`A`/`D`/`C`/`F` letters in solution vertex lists)
  against the F/A/R/S ladder in [[vertex-configuration]].
- `edgebasicmp.py`: confirm what it computes (the Newton edge solver?). See [[scripts/README]].
- The `famchar` code table for n ≥ 10 in the repo palettes (12 → `c`; star/composite tiles?). See
  [[palette-json-schema]].
- Spherical case: what replaces the divisor-of-360° closure (angle sums exceed 2π; edge resolves to
  an imaginary number in hybrid symbols).
- Access to Griffin's private repo (or at least a snapshot) so the implementation isn't
  single-copy. Related: [[contacts]].
- The "secret tilings mailing list": follow up.

## Resolved this week (answers filed in the linked notes)

- ~~What "Conway symbol" actually is~~ → his own extension of the doily notation; see
  [[conway-symbol]].
- ~~How the search decides what to glue next~~ → partial solutions + edge selector; see
  [[dual-search]].
- ~~Why symmetry variants exist in the alphabet~~ → mandatory, heptomino counterexample; see
  [[dual-search]].
- ~~How hyperbolic enumeration stays finite~~ → it doesn't; lists are per edge length, families are
  parametric, hybrids are the sporadic exceptions; see [[hyperbolic-tilings]].
- ~~What the edge length "is"~~ → forced by the combination, found by Newton iteration; see
  [[edge-length-solver]].
