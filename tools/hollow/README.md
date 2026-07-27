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

**All 14 GMS hollow tilings reproduced**, plus the 11 convex uniform tilings as the regression,
with the 4 species that close to 360 deg but tile nothing (`3.3.4.12`, `3.3.6.6`, `3.4.3.12`,
`3.4.4.6`) still rejected. Every accepted tiling carries a torus certificate and an exact integer
density. See `experiments/results/hollow-export2-2026-07-26.log`.

| GMS | config | kappa | density | GMS | config | kappa | density |
|---|---|---|---|---|---|---|---|
| 1.2  | `4.4.3/2.3/2.3/2` | 1 | +1 | 1.15 | `3/2.12.6.12`        | 1 | +2 |
| 1.4  | `4.3/2.4.3/2.3/2` | 1 | +1 | 1.16 | `4.12.4/3.12/11`     | 2 |  0 |
| 1.6  | `8.4/3.8/5`       | 1 | +1 | 1.17 | `4.3/2.4.6/5`        | 1 | -1 |
| 1.7  | `8/3.8.8/5.8/7`   | 1 |  0 | 1.18 | `12/5.3.12/5.6/5`    | 1 | -2 |
| 1.8  | `4.8/5.8/5`       | 1 | +1 | 1.19 | `12/5.4.12/7.4/3`    | 2 |  0 |
| 1.12 | `12.6/5.12/7`     | 1 | +2 | 1.21 | `12/5.12.12/7.12/11` | 2 |  0 |
| 1.13 | `6.4/3.12/7`      | 1 | +1 | 1.22 | `12/5.12/5.3/2`      | 1 | -1 |

## What the first cut got wrong

The first engine (`hollow.py`, `grow2.py`, `verify2.py`, `discrete.py`, `periodic.py`) found 7 of
these and is superseded by `engine.py`. Four errors, all of which changed results:

**The ground truth was short by two.** GMS table 1 has 25 entries, 11 convex and 14 hollow. The
transcription had 12, missing `1.2` and `1.4` -- both delta=3, m=5, and the sweep only ran delta<=2
with m<=4, so they were never enumerated. What the notes called `x1`/`x2` are `1.7` and `1.21`.

**Multiplicity.** `1.16`, `1.19` and `1.21` are not realisable with one circuit per vertex, and the
rejection was correct rather than a bug -- but the model was too narrow. See kappa above; the proof
for `1.16` is the odd cycle in the square-conflict graph of 3.4.6.4.

**Caps decided verdicts.** `grow_disk` returned its patch when the completion counter ran out, so
the gates judged whatever partial thing happened to exist: `1.22` came out clean at cap 8000 and
degenerate at 9000. Budgets now only ever produce UNKNOWN.

**Face classes were not translation-invariant.** Faces were canonicalised by the corner nearest the
origin, which moves under translation, so every lattice-translate of a face got its own class and
every per-period count came out multiplied by the face size. This is why a sampled density gate was
needed at all; with the class fixed, the density is exact and the sampling, its coverage margin, its
sample count and its RNG seed are all gone. So is the `MIN_SEP` discreteness threshold -- a torus
tiling has finitely many vertices per period and is discrete by construction.

A fifth confusion is worth recording because it is easy to repeat: **reflection reverses the cyclic
order but leaves the tiles alone** (a face occupies its interior sector however you walk it), which
is why `a.b.c` and `c.b.a` are one vertex type. The map that sends `{n/d}` to `{n/(n-d)}` swaps
which side of the boundary the face occupies and changes the total from `24*delta` to
`24*(m-delta)`. Conflating the two either loses tilings or invents them.

## Open

Not yet searched: the full species sweep under the new engine (delta 1..3 with m bounded by the
alphabet's smallest corner angle, which for `{3,4,6,8,12}` gives m <= 12*delta); kappa >= 3;
apeirogons, which take GMS's 25 to 53; the 24-gon/24-gram alphabet; and `{5/2}` and `{10/3}`, which
need Z[zeta_60] at rank 16 rather than Z[zeta_24] at rank 8.
