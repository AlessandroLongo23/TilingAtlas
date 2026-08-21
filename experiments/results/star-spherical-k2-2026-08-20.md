# Is an exhaustive k=2 star-polyhedron search possible?

Question (AL, 2026-08-20): the spherical star shelf carries all the k=1 uniform polyhedra and exactly
three k=2 records, all pyramids. Can k=2 be run exhaustively?

Nothing was searched here. This is geometry only: a closed-form angle law, the pyramid family it
produces, and a measured pre-filter over the `star-wide` config space. Scripts live in the session
scratchpad (`rho_join2.py`, `buckets.py`, `multiroot.py`); the numbers below are reproducible from the
palettes in `tools/ctrnact-oracle/alphabets/palettes/`.

## The angle law, in closed form

`develop_spherical.interior_angle` builds the polygon and measures. The same quantity is

    sin(alpha/2) = cos(pi*d/n) / cos(rho/2)

for a regular spherical {n/d} at edge arc rho. Checked against the shipped numeric routine over 12
face types and 60 arcs each: max discrepancy **4.4e-15**. It is monotone increasing in rho, defined up
to the cap rho = 2*pi*d/n the developer already uses, and it makes the whole analysis below cheap
enough to run over 53,330 configs.

## Answer to the literal question: NO, and it is not a cost problem

**For every {n/d} with 2 < n/d < 4 there is a spherical pyramid**, and there are infinitely many such
{n/d}. Put the apex on the axis; requiring lateral arc = base arc gives

    cos(rho) = c / (1 - c),   c = cos(2*pi*d/n)

which has a solution iff n/d < 6. At that rho the triangle angle is exactly 2*pi*d/n and the {n/d}
angle is exactly 2*pi - 4*pi*d/n, so

- apex 3^n sums to exactly **2*pi*d**, i.e. vertex density d,
- base (n/d).3.3 sums to exactly **2*pi**, one turn, always,

whenever 2*pi*d/n > pi/2, i.e. **n/d < 4**. Between 4 and 6 the base sum is 8*pi*d/n, not a multiple of
a turn, and the pyramid does not exist. Total area n*(3*alpha - pi) + (n*beta - (n-2d)*pi) = **4*pi*d**
exactly, so the solid density is d, no numerics involved.

    {n/d} pyramid:  V = n+1,  E = 2n,  F = n+1 (n triangles + one {n/d}),  density d

Verified against the shipped records: {5/2} rho=116.5651 d=2, {7/2} rho=100.4873 d=2, {7/3}
rho=118.2912 d=3. Those are the three k=2 files on the shelf, reproduced to the digit by the formula.

The family has 121 members up to n = 40 (120 of them star) and never stops; {3/1} is the tetrahedron (k=1, the extra
symmetry fuses the two orbits) and every d >= 2 member is k=2. The first one missing from the shelf is
**{8/3}, rho=114.4698, density 3, V=9 E=16 F=9**, then {9/4}, {10/3}, {11/3}, {11/4}, {11/5}, {12/5}…

This is the same shape of answer as k=1, where the catalogue is "75 uniform solids **plus two infinite
prismatic families**". At k=2 the pyramids are that infinite family. So "exhaustive at k=2" is only a
well-posed question once the face set and the valence are bounded, and the engine can never
reach the family anyway: the {n/d} pyramid needs maxValence >= n, which is why `star-hept-pyr` exists
at valence 7 and why {8/3} would need a valence-8 palette. The closed form gives every member for free.

## Bounded question: exhaustive over `star-wide` (faces {3,4,5,6,8,10,5/2,8/3,10/3}, valence <= 6, density <= 3)

That is finite, well-posed, and it is the honest analogue of the k=1 shelf. Measured cost profile:

| | count |
|---|---|
| config words the solver would carry | 53,330 |
| distinct angle multisets among them | 4,871 |
| multisets that close at ANY rho (density <= 3, any retrograde subset) | 3,943 |
| pairs of DISTINCT multisets sharing a common rho | **445** |
| of those, all-prograde | 185 |
| config words appearing in at least one surviving pair | 1,077 of 53,330 |
| multiset pairs total | 7,771,653 |
| survival rate | **0.0057%** |

At k > 1 every orbit closes at the same edge arc (`solve_rho_common`), and that condition depends only
on the angle MULTISETS, not on the gluing. So it can be decided before the search runs, once per pair,
by intersecting rho spectra: a hash join, not a product. Three minutes of Python for the whole table.

**Validation on real blocks.** The 3,636 pruned k=2 blocks of the `star-ico-d` run (`check-star-run2`)
carry 586 distinct config pairs. The join keeps 38 of them (14 same-config, 24 distinct-config),
holding 270 of 3,636 blocks, a **92.6% cut**, and the pentagrammic pyramid's pair
`(3,3,3,3,3) + (5/2,3,3)` is among the survivors. The known answer is not lost.

**What the join cannot touch: same-config pairs.** Two orbits with the SAME vertex figure share a rho
for free. On `star-ico-d` those are 14 pairs / 218 blocks (6% of the k=2 blocks) and they yielded
nothing, but they cannot be dismissed: the pseudo-rhombicuboctahedron J37 has all vertices 3.4.4.4 in
two orbits and a circumsphere, so the star analogue of J37 lives in exactly this branch. It has to be
searched combinatorially.

## The plan that makes it affordable: partition the alphabet by rho

Rather than one search over 53,330 configs, bucket every (multiset, density, retrograde) record by its
rho and run one k=2 search per bucket. Any k=2 solid has both orbits in the same bucket, so the union
is exhaustive; cross-bucket pairs are geometrically dead and never enumerated. Measured on `star-wide`:

- **6,684 buckets**, of which **6,588 hold a single multiset** (only the same-config branch is live there)
- largest live bucket: 22 multisets / 77 config words; largest by words: 14 multisets / **134 words**
- so the worst single sub-search carries a 134-word alphabet against 53,330 for the palette

Since solve cost grows at least quadratically in the alphabet, that is a cut of order 10^2–10^3 on the
dominant term, and every bucket is independent, so it parallelises with no coordination.

⚑ One artifact found and excluded: the largest raw bucket (144 multisets, 2,110 words) sits at
rho -> 0. Those are configs whose PLANAR angles, read with a retrograde face, already sum to an exact
multiple of a full turn, so they are flat Euclidean vertices, not spherical ones. `enum_configs` excludes exact
full turns for the prograde reading only; the retrograde reinterpretation re-admits them. Roots below
1e-4 rad are dropped throughout the table above.

## Bug found on the way: `solve_rho` cannot see a two-root config

`solve_rho` bisects, on the stated grounds that the angle sum is monotone in rho. That is true for
prograde faces and **false with a retrograde one**, whose contribution 2*pi - alpha decreases. A mixed
config can therefore cross 2*pi*D twice, and the guard `if f(lo) >= 0 or f(hi) <= 0: return None` then
fires because both endpoints sit on the same side.

Measured on `star-wide`: **30 (multiset, density, retrograde) triples have two roots, and in all 30 the
endpoint test bails, so BOTH roots are invisible.** Examples: 5.5/2.8.8.8.10 at D=3 retro {5, 8};
4.4.4.4.8.10 at D=2 retro {10}; 3.5/2.6.8.8.10 at D=2 retro {10}.

This is not a k=2 issue. It is in the shipped k=1 path, so the retrograde half of the current 54-solid
shelf is not provably complete. Fix is small and local: scan the interval, bisect each sign change,
return every root; `develop_block` already loops over what `solve_rho` hands it. `make check-star`
gates the change: prograde configs are monotone, so the golden digest must not move.

## Recommendation

1. Fix the multi-root gap and re-run k=1 on `star-wide`. Cheap, and it is a completeness claim on
   already-shipped data.
2. Ship the pyramid family from the closed form, the way the prisms and antiprisms are shipped: it
   costs no search, and the first missing member is {8/3}. Decide how far to go (n <= 20 is 31 star members, 28 of them not on the shelf).
3. Only then run the bounded k=2, bucket by bucket. Expect a low yield, since the star analogue of the
   Johnson solids is thin, but the claim at the end is a real one: exhaustive over the uniform-polyhedron
   face set at valence <= 6 and density <= 3.

---

# Execution log (same day, after AL approved the three steps)

## Step 1: the solid the multi-root fix recovered

`solve_rho` now returns a LIST (`solve_rho_all`), and `solve_rho_common` returns every rho that closes
all orbits. The prograde branch is the original code, untouched, so every prograde catalogue comes out
bit-identical; only a config with a retrograde face takes the new path, which scans 1024 points for
sign changes and bisects each one with `face_angle` itself.

Scan resolution, checked rather than assumed: over a random sample of 600 multisets from `star-wide`,
**26,406 (multiset, density, retrograde) triples, zero disagreements** with a 40,000-point reference
grid.

`make check-star` immediately caught what the fix changes, which is the point of having it:

    +5/2.5.5/2.5.5/2.5   D=4  k=1  V=20  E=60  F=24  rho=1.230959417  12x{5/1} 12x{5/2}

That is the **ditrigonal dodecadodecahedron U41**: V=20, E=60, F=24 (12 pentagons, 12 pentagrams),
chi = -16, density 4, vertex figure (5.5/3)^3, Wythoff 3 | 5/3 5. It was **missing from the shipped
54-solid shelf**, and it is the middle member of the ditrigonal trio whose other two were already
there: U30 at density 2 (`ss-20-60-32-d2`) and U47 at density 6 (`ss-20-60-32-d6`). The record carries
retrograde={5} at rho = arccos(1/3) with vertex density 2, and its certificate is exact: density
4 to 4.4e-15, edge CV 2.1e-15, planarity 1.2e-15, map consistent.

Sources for the identification: [Wikipedia,
Ditrigonal dodecadodecahedron](https://en.wikipedia.org/wiki/Ditrigonal_dodecadodecahedron) (V/E/F,
face composition, chi, vertex figure, Wythoff symbol, U41);
[MathWorld](https://mathworld.wolfram.com/DitrigonalDodecadodecahedron.html) and
[mathconsult.ch uniform polyhedron 41](https://www.mathconsult.ch/static/unipoly/41.html) (density 4).

The k=2 golden did not move. The `star-ico-d` k=1 golden gained exactly that one line.

⚑ Also fixed on the way: `_selftest`'s develop check had been indexing `develop_block`'s return value
as a dict since it started returning a list, so it raised TypeError whenever the fixtures directory
existed. Pre-existing, unrelated to this work, one line.

## Step 3: the rho partition, measured end to end

Built: `rho_buckets.py` (group configs by the arc they close at, using `solve_rho_all` itself so the
grouping and the developer cannot disagree), `slice_tables.py` (cut a `tables.bin` down to one group's
vertex types), `run_k2_buckets.py` (drive solver + pruner per group and merge), `run_develop_sharded.py`
(develop a large pruned tree across workers).

⚑ One real trap in the slicer: a vertex type's `cls` array is the QUOTIENT of its vertex under the
word's own symmetry, so `(3,3,3,3,3)S5` carries ONE corner and `(5_2,3,3,5_2,3,3)S2` carries three.
Filtering on `cls` keeps the wrong types and drops the ones a real block needs, since the pentagrammic
pyramid uses exactly the S5 fold. The face multiset has to be read off the SYMBOL.

`star-ico-d` regression, now a fourth claim in `make check-star`: the bucketed k=2 path returns the
k=2 golden **exactly** (50 buckets, 390 pruned blocks against 3,636 from the full search, under a
second end to end).

`star-wide` k=2, the run the feasibility study said was ~40 hours:

| | |
|---|---|
| buckets (distinct config groups sharing a rho) | 3,902 |
| singleton buckets | 3,754 |
| largest bucket | 22 multisets; worst by alphabet 14 multisets / 134 config words |
| solve + prune, all 3,902 buckets | **134 seconds** |
| pruned k=2 blocks | 422,206 |

The whole combinatorial half of the exhaustive k=2 search is two minutes. What is left is the develop,
measured at ~23 blocks/s single-threaded, so ~5 hours on one core and ~1-2 hours across 8 workers.

## Landed: the exhaustive k=2 result

422,206 blocks, 2.6 hours of develop across 8 workers, **9 distinct solids**. The set is exactly what
the partial read at 85% showed, so the tail added nothing.

| V | E | F | D | faces | \|G\| | axes of order >= 3 | identification |
|---|---|---|---|---|---|---|---|
| 6 | 10 | 6 | 2 | 5{3}+1{5/2} | 10 | 1 | pentagrammic pyramid (already shipped) |
| 12 | 24 | 14 | 1 | 8{3}+6{4} | 12 | 1 | J27 triangular orthobicupola |
| 12 | 20 | 10 | 1 | 4{3}+5{4}+1{8/3} | 8 | 1 | crossed square cupola |
| 15 | 25 | 12 | 3 | 5{3}+5{4}+1{5/2}+1{10/3} | 10 | 1 | crossed pentagrammic cupola |
| 18 | 42 | 18 | 3 | 6{4}+6{5}+6{5/2} | 12 | 1 | unidentified |
| 24 | 48 | 26 | 1 | 8{3}+18{4} | 16 | 1 | J37 pseudo-rhombicuboctahedron |
| 24 | 48 | 26 | 5 | 8{3}+18{4} | 16 | 1 | gyrate partner of `ss-24-48-26-d5` |
| 32 | 72 | 30 | 3 | 16{3}+4{4}+10{8} | 32 | 1 | unidentified |
| 32 | 72 | 30 | 5 | 16{3}+4{4}+10{8/3} | 32 | 1 | unidentified |

Six ship (the two convex Johnson solids are filtered: density 1, no star face), taking the shelf to 89.

**One axis of order >= 3 in every case.** Nothing tetrahedral, octahedral or icosahedral, and that is a
property of the METHOD: `develop_spherical` realizes maps on S2 with one edge arc, so it can only ever
produce INSCRIBED solids. Free at k=1 (vertex-transitive forces a circumsphere), a strict subclass at
k >= 2. J58, the augmented dodecahedron, has regular faces, two vertex orbits and vertices at 1.4013 and
1.6392 from its centre; nothing here can express it.

Next: replace the single edge arc with per-edge-orbit DIHEDRAL angles, gated blind against Zalgaller's
92. See docs/DEVELOPMENT_NOTES.md 2026-08-20 (third).
