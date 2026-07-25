# Hollow tilings — self-intersecting star polygons `{n/d}`

Search for uniform tilings whose tiles are **regular star polygons in the modern sense**:
`{5/2}` is a 5-vertex, 5-edge self-intersecting closed path, and the crossings are *not*
vertices. This is a different object from the concave isotoxal `|n/d|` 2n-gon that the rest
of the Atlas ships (`star*`, `isotoxal-*` palettes); see `docs/TILE_TAXONOMY.md` §2.1.

The established name for the space is **hollow tilings** (Grünbaum, Miller & Shephard,
*Uniform Tilings with Hollow Tiles*, The Geometric Vein — The Coxeter Festschrift, Springer
1981, 17–64; restated as *Tilings and Patterns* §12.3). Myers, *Tiling with Regular Star
Polygons* (Eureka 56, 2004) enumerates the **other** kind and points here for this one.

## Why overlaps are forced

Along one chord of `{n/d}` the star's own interior lies on side A for ~76% of the length and
side B for ~24% (measured: `{5/2}` 0.761/0.235, `{8/3}` 0.756/0.245, `{12/5}` 0.722/0.283,
`{7/3}` 0.822/0.178, summing to 1). The star straddles its own edge, so anything glued
edge-to-edge along the full chord necessarily double-covers a point tip. Overlap-free is
ruled out by the tile, not by the search — which is exactly why GMS strip the interior and
make the tiling condition combinatorial.

## The vertex-closure rule

Corner angle of `{n/d}` in 15° units is `a = 12(n-2d)/n` lifted into `(0,24)`. Retrograde
faces (`d > n/2`) get the **reflex** lift, so every angle is positive and the vertex-figure
density δ is a genuine positive integer.

Closure is `sum(a_i) ≡ 0 (mod 24)`, i.e. `= 24δ` — **not** `= 24`. Pinned empirically in
`conv.py` against the 19 published GMS configurations:

| convention | GMS 19 | convex 11 |
|---|---|---|
| signed angle, sum = 360 | 8/19 | 11/11 |
| unsigned magnitude, sum = 360 | 6/19 | 11/11 |
| **reflex lift, sum ≡ 0 mod 360** | **19/19** | 11/11 |

Every published config lands on exactly 360 or 720, so δ ∈ {1,2}. One extra structural
condition: each edge carries exactly 2 faces, so the partial sums (the edge directions) must
be **distinct** mod 24.

Reversing every face's orientation maps `{n/d} → {n/(n-d)}`, reverses the cyclic order and
sends `δ → m-δ`. Both members describe the same tiling, so results are quotiented by it.

## Files

| file | role |
|---|---|
| `conv.py` | pins the closure convention against published configs |
| `cfg.py` | vertex-configuration enumerator (closure + distinct directions) |
| `hollow.py` | exact ℤ[ζ₂₄] ring, face walks, incidence patch with mutation trail |
| `grow2.py` | nearest-first disk growth, bounded by a completion count |
| `verify2.py` | coverage-safe areal-density gate |
| `discrete.py` | minimum vertex separation gate |
| `periodic.py` | translation-lattice certificate |
| `search.py` | driver |
| `match.py`, `quotient.py` | reversal quotient and GMS comparison |

Run: `python3 search.py <delta> <maxm> <cap> <time_cap> <logfile>`

## Two traps, both load-bearing

**ℤ[ζ₂₄] is dense in ℂ.** A radius cutoff is not a finiteness argument (the Atlas already
knows this — CLAUDE.md settled decisions). Growth is bounded by a **count of vertex
completions**, never by a radius. Separately, corona *depth* is finite but does not fill a
Euclidean neighbourhood: a vertex can sit at graph distance 20 and distance 0.4. Since both
verification gates need a filled disk, growth must run nearest-first with a count bound.

**Discreteness is not automatic.** A uniform tiling's vertices are a crystallographic orbit,
so minimum separation is positive; density of the ring means nothing enforces this. Measured
separations are sharply bimodal — `4.8/3.8/7` gives 0.41421 (= √2−1), a degenerate branch of
`4.6/5.12/5` gives 0.019 with 729 vertices inside r<3. `discrete.py` rejects the latter.

## Status

Validated: reproduces the **11 convex uniform tilings** through every gate, and rejects the
four species (`3.3.4.12`, `3.3.6.6`, `3.4.3.12`, `3.4.4.6`) that close to 360° but yield no
1-uniform tiling.

Searched δ=1 (304 species) and δ=2, m≤4 (133). Result: **18 distinct tilings** after the
reversal quotient, containing **7 of 12** transcribed GMS configurations (1.6, 1.8, 1.12, 1.15,
1.17, 1.18, x1), most found as *both* members of their reversal pair, with **zero false
positives** — every non-convex tiling accepted is a published one.

⚑ **18 is a lower bound, not a count.** δ=1 left 74 of 304 species unresolved (55 capped, 19
timeout); δ=2/m≤4 left 27 of 133. Capped and timeout mean UNKNOWN, never rejected, and both
are listed verbatim in the logs. No completeness claim is available until they are resolved.

⚑ **Known gap — coinciding edges.** `1.16` (`4.12.4/3.12/11`), `1.19` and `x2` are rejected
outright. Each pairs a face with its own retrograde, so two distinct edges of the map share
one endpoint pair. Edges here are keyed by endpoint pair with exactly 2 faces, which forbids
that. This is Myers' warning that "a single drawing can represent multiple distinct tilings":
the map is not recoverable from the geometry. Fixing it means keying edges combinatorially
rather than geometrically.

⚑ Also open: `1.13` and `1.22` reach a judgeable disk only at some completion caps (1.22
confirmed clean at cap 8000, density −1) — the branch taken depends on the budget, so the
result is cap-sensitive and needs the search made deterministic before any count is claimed.
