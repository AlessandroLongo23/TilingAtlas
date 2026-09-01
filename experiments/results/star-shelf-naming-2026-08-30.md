# Naming the star shelf against the published catalogue, and one correction

Task: read the Wikipedia uniform-polyhedron pages, work out how the catalogue is constructed, check
what we are missing, and replace census labels with proper names wherever one exists.

## How they are constructed

Wythoff construction on SCHWARZ TRIANGLES. A Schwarz triangle (p q r) with 1/p + 1/q + 1/r < 1 is a
spherical triangle whose three sides are mirrors; reflecting in them tiles the sphere. Place a seed
point in the triangle, reflect it in every mirror, and the orbit is the vertex set. The Wythoff symbol
records where the seed sits relative to the bar: `p | q r` puts it on a corner, `p q | r` on an edge,
`p q r |` at the incentre, `| p q r` is the snub (alternate reflections only, so the result is chiral).
Four families of triangle: (3 3 2) order 24, (4 3 2) order 48, (5 3 2) order 120, and (n 2 2) order 4n
for the prisms and antiprisms. Exactly one uniform polyhedron falls outside this: U75, the great
dirhombicosidodecahedron.

That construction is not the one this repo uses — the engine glues vertex figures combinatorially and
solves for the edge arc — which is why the correspondence has to be checked and not assumed.

## Naming: 14 records named, 1 corrected

The shelf carried 71 names and 29 census labels. Fourteen of the 29 were k = 1 and therefore
vertex-transitive and therefore uniform, so a published name had to exist for each.

Method, following the shelf's existing discipline that a U-number is a claim about a published
enumeration and must never be inferred from V/E/F:

* **Eleven settled on FACE CENSUS.** Read off each solid's own Wikipedia article, one fetch per solid,
  and matched against our measured `faceType` tally. At each signature the census was unique among the
  published solids sharing that V/E/F, so the match is forced.
* **Three could not be.** At (60,150,92) the census 80{3}+12{5/2} belongs to U57, U69 and U74 alike; at
  (60,180,112), 100{3}+12{5/2} belongs to U32 and U72. These were settled on **circumradius**, computed
  from our own developed geometry as 1/(2 sin(ρ/2)) — the vertices are unit, so the edge chord is
  2 sin(ρ/2) — against the published decimal:

  | record | D | measured R/edge | published | solid |
  |---|---|---|---|---|
  | ss-60-150-92-d7 | 7 | 0.816080675 | 0.8160806747999234 | U57 great snub icosidodecahedron (already named — calibration) |
  | ss-60-150-92-d13 | 13 | 0.645020237 | 0.6450202372957795 | U69 great inverted snub icosidodecahedron |
  | ss-60-150-92-d37 | 37 | 0.580001505 | 0.5800015046400155 | U74 great retrosnub icosidodecahedron |
  | ss-60-180-112-d38 | 38 | 0.580694800 | 0.5806948001339209 | U72 small retrosnub icosicosidodecahedron |

  Nine significant figures each. U74 and U72 differ only in the fourth decimal, so this test
  discriminates rather than merely agreeing — which is the whole point of using it.
* **One named structurally.** `ss-16-32-18-d5`, 16{3}+2{8/3} at density 5, is the **octagrammic crossed
  antiprism**: the shelf already names the density-3 record of that census the octagrammic antiprism,
  and the higher density of such a pair is the retrograde one, exactly as it already does for {5/2}
  (D=2 / D=3) and {7/3} (D=3 / D=4).

⚑ **A shipped name was wrong.** `ss-60-120-44-d4` read "small ditrigonal dodecicosidodecahedron (U43)".
Its census is 20{3}+12{5}+12{10/3}, which is **U42, the GREAT ditrigonal dodecicosidodecahedron**; U43 is
20{3}+12{5/2}+12{10}, and that record — `ss-60-120-44-d4-r5894` — was sitting unnamed two rows down. Both
are (60,120,44) at density 4 with one orbit, so V/E/F/density/k cannot separate them and only the census
can. Confirmed against the two Wikipedia articles fetched separately. Both rows are now right.

**Result: 85 of 100 named, and no k = 1 record is unnamed any more.** The remaining 15 are all k ≥ 2 —
the star analogues of the Johnson solids, a space with no published enumeration at all, so they keep
their census labels by the same discipline.

## What is still missing: exactly nine of the 57

The count now cross-checks two ways — 35 U-numbered star records + 4 Kepler–Poinsot named by Schläfli
symbol + 9 hemipolyhedra = **48 of 57** — and agrees with the independent V/E/F shortfall diff.

Missing: **U18** small rhombihexahedron, **U21** great rhombihexahedron, **U39** small rhombidodecahedron,
**U73** great rhombidodecahedron, **U50** small dodecicosahedron, **U63** great dodecicosahedron,
**U56** rhombicosahedron, **U64** great snub dodecicosidodecahedron, **U75** great dirhombicosidodecahedron.

⚑ The U46/U64 ambiguity in the earlier pass is resolved: `ss-60-180-104-d4` is named U46 and its census
is U46's, so the missing member of that pair is U64.

### How to reach them, and what does NOT work

A hypothesis I tested and had to discard: that the seven share a failing closure test. Computing Σ of
flat interior angles per vertex figure gives 450°, 270°, 468°, 324°, 528°, 384°, 420° — none a whole
number of turns — but the CONTROLS fail identically (U13 is 420°, U57 is 276°, the great dodecahedron
540°), and those the engine found. On a sphere the closure test is on the spherical angles at the solved
arc ρ, not on the flat ones, so flat angle sums say nothing. Recorded so nobody re-derives it.

What does work, demonstrated rather than argued: **the constructive route, the same one
`gen_hemi_shelf.py` uses.** The seven are facetings of convex uniform solids, so their faces already
live in the parent's vertex set. Enumerating every regular {n/d} polygon in the small
rhombicuboctahedron's 24 points gives 8{3} + 18{4} + 6{8} at one edge length, and choosing the 12
squares that complete the 6 octagons to a closed surface yields, in one pass:

    V = 24, E = 48, F = 18, chi = -6, faces 12{4}+6{8}, every edge in exactly two faces

which is U18, the small rhombihexahedron. So the route to all seven is a bounded generalization of the
hemipolyhedra generator — take the parent vertex set and the target face census as parameters, solve the
edge-cover — not a deeper search, not a new palette, and not a higher k. None of those would help: the
star pipeline's developer needs a density, and these have none.

⚑ **U75 is different in kind and no route reaches it.** It is the only non-Wythoffian uniform polyhedron,
and its edges carry FOUR faces each, not two. Every shelf here — star, non-convex, genus, hemi — asserts
"every edge in exactly two faces" as a correctness gate. U75 cannot be represented in the data model at
all, let alone found by a search. Shipping it would mean changing what a face ring means.

⚑ **U64 looks like plain coverage.** It is an ordinary snub with a defined density and a vertex figure
the palette already carries; nothing structural excludes it. A re-run of the star palette at k = 1 with
the snub words is the thing to try.

## Names elsewhere in the atlas: nothing to replace

Checked and negative, which is worth writing down so it is not re-checked. The 278 `ncx-` records and
the 86 genus records carry face censuses as labels, and there is no catalogue to match them against:
Johnson's 92 and Zalgaller's completeness proof are for CONVEX regular-faced solids, Zalgaller's
extension is still convex, and Klitzing's survey puts non-convexity out of scope. The only nameable
population on these shelves was the uniform one, and it is now named.
