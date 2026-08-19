# Perfect rectangles from the atlas polyhedra

Running record for the squared-rectangle feature. Started 2026-08-18 (CC), on AL's request after the
[aiyopasta video on squared rectangles](https://www.youtube.com/watch?v=0fH80JF2mDM).

## What this is

The Brooks–Smith–Stone–Tutte correspondence (Brooks, Smith, Stone, Tutte, *The dissection of rectangles
into squares*, Duke Math. J. **7** (1940) 312–340) says a squared rectangle is a planar electrical
network, and a *simple* one's network is 3-connected, hence by Steinitz a convex polyhedron's skeleton.
Every spherical tiling in this atlas is such a polyhedron, so every one of them has squared rectangles
attached to it, one per edge orbit. This feature computes and ships them.

## The construction as implemented

Battery edge `e = (p, n)` removed; unit conductances; two potentials give the two coordinates.

- **y** — potential `V` on vertices, from the reduced Laplacian.
- **x** — stream function `ψ` on faces (the planar dual), from one BFS over the dual with the battery
  edge reinstated carrying the return current. No second linear solve.
- Tile for edge `u→v` is `[ψ_left, ψ_right] × [V(v), V(u)]`, automatically square because the current is
  simultaneously the potential drop and the ψ jump.

**Everything is integer, no rationals anywhere.** Fixing `V(p) = det(A)` instead of 1 makes the solution
`adj(A)·b`, an integer vector, and `det(A)` is the 2-forest count by the all-minors matrix-tree theorem.
Bareiss (fraction-free) elimination keeps the intermediates integral too. This was the single most
useful design decision: the naive rational version has 27-digit numerators on the sp5 records and
spends all its time in gcd.

Invariant used as a test: `W + H = τ(G)` in the τ-normalisation, for every battery edge. Cube: τ = 384,
every rectangle from it has `W + H = 384`.

## Files

| File | Role |
| --- | --- |
| `lib/squaring/linalg.ts` | BigInt Bareiss solve + determinant. No rational type, deliberately. |
| `lib/squaring/planarMap.ts` | `orientFaces` / `buildMap` / `isThreeConnected`. The DCEL the repo lacked. |
| `lib/squaring/smith.ts` | `squaringFrom`, `allSquarings`. The construction. |
| `lib/squaring/classify.ts` | perfect / simple / exact-cover / Bouwkamp code / `smithGraphOf`. |
| `lib/squaring/squaringSvg.ts` | The only place exact sides become floats. |
| `lib/squaring/shelf.ts` | Shipped record types. Sides are decimal strings. |
| `lib/squaring/pipeline.ts` | Shared record builder — the build and the live page both call it. |
| `lib/squaring/tutte.ts` | Barycentric embedding, direct solve + the animation's physics. |
| `lib/squaring/smith.test.ts`, `pipeline.test.ts` | 23 tests. |
| `scripts/build-squaring-shelf.ts` | The build. Refuses to write on any certification failure. |
| `public/squarings/` | 105 shards + manifest, 5.9 MB. |
| `public/theory/perfect-rectangles.md` | The article. |
| `app/(app)/theory/perfect-rectangles/page.tsx` | Server route; scrapes card ids out of the markdown. |
| `components/squaring/` | The four stages, the picker, the article card, the thumbnail. |

Build: `pnpm tsx scripts/build-squaring-shelf.ts`. Takes ~32 s for the whole corpus.

## Results

105 polyhedra (40 named solids, 20 spherical 3.4.n.4, 16 halved-Platonic, 29 star polyhedra),
**667 distinct squarings**, **11 polyhedra with a perfect one**, all 11 of those also simple.

Star polyhedra are gated on Euler characteristic: only 29 of the 54 have χ = 2, and the other 25 are
higher-genus with no planar embedding and so no Smith diagram. All 29 that pass also turn out to be
3-connected. Several share a skeleton with a convex solid — the great icosahedron {3,5/2} has the
icosahedron's 12 vertices and 30 edges — and therefore give the SAME rectangle, which is the
construction correctly reporting that it sees only the graph.

The perfect-and-simple set:

| record | source | |G| | squarings | perfect | best |
| --- | --- | --- | --- | --- | --- |
| `metabidiminished-icosahedron` | solid (J62) | — | 7 | 2 | 1238 × 1102, order 19 |
| `shcube-half-4-00001` | sph-half | 4 | 7 | 3 | 4031 × 3109, order 17 |
| `shcube-half-6-00001` | sph-half | 2 | 11 | 7 | 4313 × 3484, order 17 |
| `shdodec-half-7-00001` | sph-half | 4 | 13 | 11 | order 47 |
| `shdodec-half-13-00001` | sph-half | 2 | 25 | 23 | order 47 |
| `shico-half-6-00001` | sph-half | 4 | 16 | 14 | order 59 |
| `sp5-14-00001` | sph-poly | 4 | 26 | 19 | order 89 |
| `sp5-17-00001` | sph-poly | 4 | 34 | 26 | order 119, sides to 10²⁷ |
| `sp5-27-00001` | sph-poly | 2 | 49 | 41 | order 89 |
| `sp5-29-00001` | sph-poly | 2 | 56 | 49 | order 104 |
| `sp5-29-00002` | sph-poly | 2 | 56 | 49 | order 104 |

### The finding: symmetry is an obstruction, and a graded one

Across the 65 records carrying a measured symmetry order:

- **No record with |G| ≥ 6 has any perfect squaring.** 54 of 54, exceptionless. This is the one claim
  that has survived every expansion of the corpus, and it got stronger each time.
- The shortfall (best squaring's `order − distinct`) rises broadly with |G| but **not monotonically**.
- **The converse is false.** Low symmetry only permits perfection. 10 of the 11 records with |G| ≤ 4
  have a perfect squaring; `shcube-half-2-00005` (|G| = 4, only 4 distinct squarings, best 13 sizes
  across 17 tiles) does not. Too few edge orbits to search is a separate obstruction.

⚑ **Two claims of mine have now been falsified by adding data, both of them over-generalisations from
whatever the corpus happened to hold at the time.** First the biconditional (low symmetry ⟹ perfect),
killed by `shcube-half-2-00005` while the corpus was 36 records. Then monotonicity of the shortfall,
which held across those 36 and broke the moment the star polyhedra arrived: |G| = 14 gives up 7 sizes
where |G| = 16 gives up 3, and |G| = 60 gives up 22 where one |G| = 120 record gives up 20. What decides
the shortfall is not the order of the group but how much of it acts on the EDGES, and two groups of
similar order can differ there. The test now asserts the weaker true statements (|G| ≥ 6 ⟹ at least one
size lost; |G| ≥ 20 ⟹ at least four; mean shortfall higher at the top end than the bottom) and carries a
note not to restore the monotone version.

### Other facts worth keeping

- **Every Platonic solid has exactly one squared rectangle**, because each is edge-transitive, and none
  of the five is perfect. This is why BSST had to look past the regular solids.
- **Dual polyhedra give transposed rectangles.** Cube 10 × 14 against octahedron 14 × 10, identical
  side multisets; icosahedron 38 × 22 against dodecahedron 22 × 38. Pinned as a test.
- **All 20 `public/spherical-poly/` records ship face rings that are NOT consistently oriented** and are
  rejected by the half-edge certificate as written. `orientFaces` repairs all 20. The
  `public/spherical-half/` records and the hand-written solids are already consistent.
- Not new mathematics: SPSRs are exhaustively catalogued to order 21 (31,426 of order 17 alone at
  squaring.net). The claim is the attachment of a specific rectangle to a specific solid.

## The four-stage pipeline page (added 2026-08-18, AL request)

`/theory/perfect-rectangles/pipeline` — one polyhedron becoming one rectangle, in four stages, with a
curated picker. Stages share a hovered EDGE, so pointing at an edge of the solid lights up the same
edge in the flat graph, the same wire in the circuit and the same tile in the rectangle. That link is
the reason the four stages share a page.

1. **The polyhedron** (`components/squaring/polyhedron-wire.tsx`) — rotatable SVG wireframe, battery
   edge dashed, vertices coloured by potential. Hand-rolled projection and NOT the atlas's three.js
   sphere (`lib/render/sphericalScene.ts`), because that renderer draws the tiling procedurally in a
   fragment shader and cannot pick out one edge — and picking out the battery edge is the whole point
   of the stage. Costs no WebGL context either, which matters with four figures on one page.
2. **Flattened by springs** (`tutte-springs.tsx`) — the live relaxation. Starts from the SQUASHED SOLID
   (stage 1's vertices projected flat, fold-overs and all) so the stage visibly continues the previous
   one, then converges to the barycentric embedding. Tutte's theorem is what guarantees the fold-overs
   come out.
3. **The Smith diagram** (`smith-diagram.tsx`) — the circuit as a graph, laid out where the tiling puts
   it and painted in the tiling's colours. Both coordinates come from the squaring: y is the node's
   voltage, x is the CENTRE of the horizontal segment that node stands for, recovered from the squares
   touching it. Each wire is a wedge from the higher node to the lower, as wide as its current and
   filled with its own square's colour from stage 4's ramp (`squareFills`, exported from
   `squaringSvg.ts` so there is one palette and not two that drift).
4. **The squared rectangle** (`squaring-figure.tsx`) — tile sizes printed inside the tiles.

**Clicking an edge in stage 1 or 2 makes it the battery**, and all four stages re-solve for that
choice — including stage 2, which re-pins to whichever face the new battery edge borders and relaxes
again. The recomputation happens **in the browser**, calling the same `lib/squaring/pipeline.ts` the
build script calls, so the live path and the shipped path are one computation and cannot drift. This
is affordable because the curated solids top out at 26 vertices: the exact integer solve is a 24×24
Bareiss elimination and returns in single-digit milliseconds. The alternative, precomputing a record
per edge, would store the same solid's geometry up to 60 times over.

Verified live on J62: its 20 edges reach exactly **7 distinct rectangles**, matching the shelf's
precomputed count, and every one satisfies the matrix-tree identity independently — τ = 28080
throughout, with W + H ∈ {2340, 468, 90, 26}, each dividing it exactly (12, 60, 312, 1080). Edges 8–9
and 0–5 give 16×10 and 10×16, a transposed pair.

Curation: the 73 polyhedra whose best squaring has **order ≤ 60**, a legibility rule and not a quality
one. The cap sat at 26 (the point past which tile sizes stop fitting inside their tiles) until the
picker grew folders and turning thumbnails and a longer list became navigable. `labelFits` decides per
TILE, so the large squares keep their numbers above 26 and the rest read as colour. The cap applies to
the shelf's chosen rectangle; clicking to another edge can exceed it, which is fine for the same reason. Past that the numbers do not fit in the tiles and the graph stages become a
hairball; the order-119 records have 27-digit sides.

Data: `public/squarings/pipeline/{index.json, <id>.json}`, ~190 kB. Each record carries 3D vertices,
faces, edges, the battery, per-vertex potentials, per-edge currents, the Tutte equilibrium, the pinned
outer face and the spanning-tree count. The index loads with the page; records load on selection.

### The picker

Rows are cards with a turning wireframe thumbnail, ordered by what a reader is choosing between:
silhouette, name, the rectangle in the largest type (it is the reason the page exists), perfect /
simple as badges, then the counts. Grouped into folders by family — Platonic 5, Archimedean 2, prisms
and antiprisms 7, Johnson 4, halved Platonic 9, spherical 3.4.n.4 4 — with only the folder holding the
selection open. `SPHERICAL_SOLIDS` is a flat concatenation that keeps no record of which family a solid
came from, so the build recovers membership by id from the four arrays that compose it
(`PIPELINE_CATEGORIES` in `shelf.ts` fixes the display order).

The thumbnails turn because a still wireframe of a 26-vertex solid is a thicket, and motion parallax is
what the eye reads depth from. Thirty-one of them share **one** rAF loop advancing **one** angle, each
row adding a phase offset so the list does not wobble in lockstep, throttled to ~24 fps, and an
IntersectionObserver unsubscribes rows scrolled out of view — the same discipline
`components/tiling-thumbnail.tsx` already uses. Enough index data to draw them (`vertices`, `edges`,
rounded to 4 decimals) rides on the index itself, so the list costs one request instead of 31.

### The article's figures

`<squaring-card solid="…">` now renders the solid beside its rectangle, hover-linked, with a button
through to the pipeline page for that solid (`?solid=<id>`, falling back to the first entry on an
unknown id; the route wraps the explorer in Suspense because `useSearchParams` cannot resolve
statically). The theory route loads pipeline records rather than bare squarings — every solid the
article names is in the curated set, because the article only shows rectangles small enough to print
their numbers, which is the same legibility rule the curation applies.

⚑ The first attempt put the solid and the rectangle side by side inside the card. The article's figures
sit two-across in a prose column, which leaves each under 260 px, and splitting that again squeezed the
wireframe to a sliver with its caption wrapped into a ribbon three words wide. They are stacked now:
the rectangle takes the full width, and the solid rides in the footer at 84 px beside the numbers —
still live, still hover-linked, sized like the supporting evidence it is there. `PolyhedronWire` grew a
`compact` prop that drops the caption row for it.

### Two bugs worth remembering

⚑ **The convergence test was measuring the wrong thing.** `relaxStep` originally returned the largest
per-step MOVEMENT, and the tetrahedron reported "settled" while visibly still swinging. The spring
system is underdamped, so at the turning point of an oscillation every velocity passes through zero
while the vertices are far from equilibrium — a movement threshold fires exactly there. It now returns
the **barycentric residual** (how far the worst vertex is from the mean of its neighbours), which is
Tutte's condition itself and is zero only at the answer. A single free vertex is the worst case, which
is why the tetrahedron caught it and J62 with twelve did not. Verified across tetrahedron, octahedron,
cube, triangular prism, pentagonal prism, icosahedron and dodecahedron.

⚑ **The animation was far too fast** (AL, on first look). It was running four physics steps per frame
and settling in well under a second, so the fold-overs vanished before they could be seen coming out,
which is the part worth watching. Now one step per frame with `dt` 0.08 → 0.04 and `damping` 0.82 →
0.94. The two knobs do different jobs and it matters which one you reach for: `dt` sets how fast the
picture moves and therefore the speed you perceive, since nearly all the travel happens in the first
second, while `damping` sets how fast the motion dies (the iteration matrix's determinant is exactly
`damping`, so the residual contracts by its square root per step) and pushing it toward 1 keeps the
ringing that makes it read as springs. Measured: tangled at 250 ms, opening at 700 ms, settled at
~2.8 s for the dodecahedron.

⚑ **The Smith diagram came out tangled twice before it came out right** (AL, both times).

The first version placed nodes horizontally by their Tutte coordinate. That coordinate is electrically
meaningless, and it showed: crossing edges and current labels piled on top of each other. My own comment
in the file had already conceded the point, saying the honest x was the stream function.

The second attempt over-corrected into a bar chart — nodes as horizontal bars spanning their segments,
wires as vertical lines. Untangled, and it did line up with stage 4 column for column, but it stopped
being a graph, which is the thing a Smith diagram is. AL sent the reference frame from the video to say
so.

What shipped keeps the useful half of each: a real graph of dots and edges, with x taken from the
segment CENTRE rather than the whole span, so the layout still derives from the tiling and cannot
tangle, and with every wire drawn as a wedge in its own square's colour. The colour is what carries the
correspondence — no caption needed, the reader matches the green wedge to the green tile — and it is
also why `squareFills` had to be lifted out of `squaringToSvg` into a shared export.

Falling out of it: dots at segment centres give zero-current wires somewhere to go. In the bar version
the tetrahedron's two equipotential nodes occupied the same bar, so its dashed connector had zero length
and the caption promised a dashed line the picture did not contain. Centres differ even when spans
coincide, so it now draws as a visible dashed horizontal — which is a good look at why that square
vanished.

⚑ **The corpora overlap and the picker showed it as a duplicate.** `sp4-1-00002` IS the octagonal
prism, and so is the named solid `octagonal-prism`; both produce 118×218 and both read "octagonal
prism". Shelf records now always carry their record id in the display name, and a test asserts the
names are distinct.

Tests: `lib/squaring/pipeline.test.ts`, 8 of the 23. Each checks a defining property of the shipped
solve rather than a stored copy of it — potentials harmonic at every free vertex (exact, in integers),
Kirchhoff at every node with the pole current equal to the width, every Tutte vertex inside the pinned
polygon with the pinned ones exactly on the circle, both poles on the outer face, and `W + H` dividing
the spanning-tree count.

## Squared TORI — the genus-1 case (added 2026-08-18, AL question)

AL asked what happens if you feed the construction a periodic plane tiling instead of a polyhedron:
a polyhedron's skeleton lives on a sphere, but a periodic tiling divided by its own translation lattice
lives on a torus. It works, and genus 1 is the last genus where it works as a flat picture.

**What changes.** The battery disappears. On a sphere you have to remove an edge, because a harmonic
function on a finite graph with no boundary is constant; on a torus the potential can be QUASI-periodic
instead, climbing by a fixed amount each time it crosses the cell. So the choice becomes a class in
H^1(T;R) = R^2. That space is 2-dimensional and scaling a class only scales the tiling, so each tiling
carries a whole circle of squared tori where a polyhedron carries one rectangle per edge orbit. The
integral classes (m, n) are the ones with integer sides.

**Why genus 1 and not higher.** Gauss-Bonnet. Cone angles in such a tiling are forced to be 2*pi*k for
integer k >= 1, and sum(2*pi - angle) = 2*pi*chi. At chi = 0 every k must be 1, so there are no cone
points at all. At genus >= 2, chi < 0 forces sum(k_i - 1) = 2g - 2 > 0 cone points, and the result is a
square-tiled translation surface with singularities, not a plane tiling.

**Not new mathematics.** Chien, *Square tilings of surfaces from discrete harmonic 1-chains* (Rutgers
PhD, October 2015, advisor Feng Luo), Theorem 3.3.1, proves exactly this for all g >= 1. Kenyon,
*Tilings and discrete Dirichlet problems*, Israel J. Math. 105 (1998) 61-84, classifies which Euclidean
tori are square-tileable via his J-invariant. squaring.net catalogues the objects: Gambini's 1999
order-24 181x181 simple perfect squared square torus, and Geoffrey Morley's later orders 2 through 11.
The contribution here is the catalogue over the atlas's own tilings, plus the half-turn rule below.

### The half-turn rule (the finding)

Symmetry is again the enemy of perfection, but the mechanism is sharp enough to state as a rule. A
symmetry g acts on H^1, and the harmonic form of class sigma pulls back to the form of class g*sigma,
so g can only force two edges to carry equal current INSIDE one squaring when g*sigma = +/- sigma.

- A **half-turn** acts as -1 on H^1 for every class at once, giving omega(g.e) = -omega(e). The sides
  are therefore forced equal along every edge orbit it moves, at every class, with no exceptions.
- A **3-, 4- or 6-fold rotation** acts as a genuine rotation of R^2 and fixes no non-zero class, so it
  costs nothing generically.
- A **reflection** has eigenvalues +1 and -1, so it bites only on two special lines of classes.

Measured: a half-turn that moves an edge means no perfect squared torus at any class, **58 records out
of 58**. The mechanism itself was checked directly, not just the correlation: |omega(g.e)| = |omega(e)|
held exactly across 216 (record, class) pairs, zero violations.

**Stated one way only, and it must stay that way.** The converse is FALSE: 6 of 63 half-turn-free
records gave perfect squarings and 57 did not. `lib/squaring/torusSquaring.test.ts` carries a comment
forbidding the biconditional. This is the third claim in this feature to be tested for a converse that
does not hold (see the symmetry-order and monotonicity claims above), so the pattern is established.

A consequence worth testing but NOT yet tested: perfect squared tori can only come from the seven
wallpaper groups with no half-turn, p1, pm, pg, cm, p3, p3m1, p31m.

### Files

- `lib/squaring/torusMap.ts` — the quotient map: vertices clustered modulo the lattice, darts keyed on
  reduced midpoints (so parallel edges and loops survive), T-junction splitting, winding normalisation,
  and the chi = 0 check. Also `halfTurn`.
- `lib/squaring/torusSquaring.ts` — the construction. Reduced Laplacian via Bareiss for the potential,
  then the stream function carried across the dual with its two periods as unknowns and fixed by a 2x2
  Cramer. Integer throughout, one gcd at the end.
- `scripts/build-torus-shelf.ts` — writes `public/squarings/torus/`. Refuses to write on any failure,
  and asserts the half-turn rule as a build-time check.
- `components/squaring/torus-{shared,tiling-figure,smith-diagram,stages}.tsx`,
  `components/squaring/squared-torus-figure.tsx` — the four stages.
- `lib/squaring/torusSquaring.test.ts` — 12 property tests.

### What shipped

24 records: 8 uniform tilings and 16 k-uniform ones from the atlas, 1152 certified squarings, 16
records with at least one perfect squaring, 8 carrying a half-turn. They appear in the pipeline page's
sidebar under their own heading, with the homology class (m, n) as the control that replaces the
battery edge; moving it re-runs the exact solve in the browser.

The **uniform tilings are constructed in the build script, not taken from the atlas**, and that split is
deliberate. The atlas does contain them, but mostly as members of parametric families caught at a flexed
position: combinatorially the square tiling, geometrically a rhombus. The construction only reads
combinatorics, so those give correct squarings under a picture that looks wrong. A regularity check
refuses anything whose tiles are not regular polygons of one common edge length. Eight of the eleven
Archimedean tilings are in; snub square, snub hexagonal and 4.6.12 are not yet laid out.

### External cross-check (passed)

The plain square lattice at class (4, 3) returns squares of sides 3 and 4 on a torus of area 25. That is
Morley's order-2 perfect squared torus from squaring.net's catalogue, arriving unprompted; (12, 5) gives
the 13x13. This is the one check in the whole feature that is against an outside source rather than an
internal invariant, and it is pinned in the tests.

### Certification

Every squaring is certified by the area identity `sum(side^2) = covolume of the image lattice`. That is
not a sanity check bolted on afterwards: it is the discrete Riemann bilinear relation
`||omega||^2 = integral of omega ^ *omega`, and it fails the instant the potential or the stream
function is wrong. Tests add an exact no-overlap test modulo the image lattice.

### Known weakness — the extractor, not the mathematics

The quotient builder reads **38.8% of a 4,284-record sample** of the atlas. Every periodic tiling has
chi = 0 by construction, so the ~34% coming back with chi != 0 are extraction bugs, and the ~28% with
unmatched darts are the same story: T-junction handling and vertex-clustering tolerance. This caps the
corpus and is ordinary engineering, not a mathematical obstruction. Raising it is the obvious next step
if this is ever promoted past "some examples".

Measurement log: `experiments/results/squared-tori-2026-08-18.md`.

## Squared CYLINDERS — the hyperbolic case (added 2026-08-18, AL question)

Third geometry, and it splits in two before it can be answered.

**Reading 1, a finite quotient.** A closed hyperbolic surface has genus >= 2, so quotienting a
hyperbolic tiling gives a map with chi < 0. Chien's Theorem 3.3.1 covers every g >= 1, so the
construction runs, but the output stops being a plane picture and Gauss-Bonnet forces that: cone angles
are 2*pi*k and `sum(2*pi - angle) = 2*pi*chi` gives `sum(k_i - 1) = 2g - 2 > 0`. Genus 1 was the last
case that could be drawn flat; above it the answer is a translation surface and has to be presented as
squares plus gluing instructions. NOT BUILT. It needs a corpus of regular maps (Klein quartic and
friends) that the repo does not have, and gluing-instruction output instead of coordinates.

Measured anyway, on the 25 star polyhedra whose face rings close up on genus 3, 4, 5 or 9: computing
the nullity of the raw closed + co-closed conditions with no genus assumed, **25 of 25 give
dim H^1 = 2 - chi = 2g exactly**. So the space of choices runs one-per-edge-orbit on the sphere, a
circle on the torus, and a (2g-1)-dimensional projective family above.

**Reading 2, the infinite tiling as it stands.** This is the one that is built. Cut a ball out of the
tiling, short its whole boundary to a single vertex, and square that. Benjamini and Schramm, *Random
walks and harmonic functions on infinite planar graphs using square tilings*, Ann. Probab. 24 (1996)
1219-1238: for any transient bounded-degree planar graph this converges to a square tiling of a
CYLINDER whose bottom edge is the boundary at infinity. Georgakopoulos (Invent. Math. 203, 2016) then
identified that boundary circle with the Poisson boundary of the random walk.

### Why it is a cylinder and not a rectangle

psi is a potential on faces with `psi(right) - psi(left) = current`. It is single-valued only away from
the source: a loop in the dual encircling the centre picks up the TOTAL current I, so the horizontal
coordinate lives in R/IZ. This is checked, not assumed — every dual-loop discrepancy comes out exactly
0 or +/- I, never anything else.

### Certificates

- **Energy.** `sum(current^2) = I * H`. Dissipated power is current times potential drop.
- **The wrap.** every dual loop closes on a multiple of I.

Both in exact integers, from the matrix-tree normalisation, before anything is rounded.

### The shipped shelf carries FLOATS, deliberately

The sphere and torus shelves ship exact integers because the question they exist to answer is whether
two tiles are the same size. That question does not arise here: a 672-tile q-fold symmetric arrangement
has equal sides everywhere and they carry no meaning. The integers involved count spanning forests of a
few-hundred-vertex graph and run to hundreds of digits. So the solve is exact, both certificates are
checked in integers, and the coordinates are rounded afterwards.

One bug this caused, worth remembering: the BigInt fixed-point divide was truncating at 1e-9, and
adjacent squares in these tilings abut EXACTLY, so their shared edge came out at two values a nanometre
apart and the overlap checker called it an overlap. Fixed by rounding instead of truncating and by
raising the scale to 1e12.

### Transience is the whole mechanism

The circumference is the effective conductance from the centre out to the boundary, and it settles on a
positive limit exactly when the walk escapes to infinity. That makes the hyperbolic/Euclidean divide a
number you can watch, which is why {3,6} is in the corpus: it is the member that FAILS.

| r | {3,7} hyperbolic | {3,6} Euclidean |
|---|------------------|-----------------|
| 1 | 3.500000 | 3.000000 |
| 3 | 4.727432 | 3.170213 |
| 5 | 4.911808 | 2.943940 |
| 11 | — | 2.540474 |

{3,7} climbs to about 4.93 and settles; {3,6} turns over and decays. CAVEAT: recurrence decays like
1/log r, so eleven layers is consistent with the theory, not a demonstration of it. The build script
asserts the direction of travel at the last radius for each record.

### Files

- `lib/squaring/hyperbolicBall.ts` — the combinatorial {3,q} ball with a wired sink, plus an exact
  Poincare-disk layout. The layout unfolds by rotating one equilateral triangle onto the next with the
  repo's own SU(1,1) Mobius helpers, so there is no optimisation and no drift.
- `lib/squaring/cylinderSquaring.ts` — the solve and both certificates.
- `scripts/build-cylinder-shelf.ts` — writes `public/squarings/cylinder/`, 5 records, 22 radii, 7016
  certified squares. Refuses to write on failure.
- `components/squaring/hyperbolic-ball-figure.tsx`, `cylinder-circuit.tsx`,
  `squared-cylinder-figure.tsx`, `cylinder-stages.tsx`.
- `components/squaring/smith-diagram-squares.tsx` — a Smith diagram taking a bare list of placed
  squares. Written for the cylinder, which in the end needed a different layout (see below), so the
  torus stage was moved onto it and `torus-smith-diagram.tsx` deleted. Same picture, one copy.
- `lib/squaring/cylinderSquaring.test.ts` — 10 property tests.

### One layout that did not transfer

Stage 3 was going to reuse the Smith layout the sphere and torus use, which puts each node at the centre
of its own horizontal segment. On a cylinder every horizontal segment is a RING wrapping the full
circumference, so every centre lands at the same x and the whole diagram collapses onto a vertical line.
It was built, tried, and looked exactly that broken. Replaced with `cylinder-circuit.tsx`, which puts
each vertex at its own angle in the disk, unrolled, at the height of its potential: the ball cut along a
ray and laid flat, the same operation stage 4 performs on the tiling.

Measurement log: `experiments/results/hyperbolic-squaring-2026-08-18.md`, scripts in
`experiments/hyperbolic-squaring/`.

## Deferred — the options AL did not pick, kept for a future pass

**Star polyhedra** (`lib/tilings/sph-star.ts`, 54 records). Only **29 have Euler characteristic 2**; the
other 25 are higher-genus, have no planar embedding, and therefore have no Smith diagram at all. Needs
a χ filter before it can be attempted, and the filter is the interesting part: it is a real statement
about which star polyhedra are eligible. `SphStarPattern` already carries an explicit `edges` array and
`stats.verts/edges/faces`, so the filter is a one-liner.

**The `spherical-edges` shelf** (`public/spherical-edges/`, 171 MB, 176 shards). Thousands of
low-symmetry k-uniform edge patterns, so on the |G| finding above this is almost certainly the richest
source of perfect rectangles in the repo. Blocked on two decisions: a sampling policy (shipping all of
them is not viable at 5.9 MB per 105 polyhedra) and whether the result belongs in `public/` at all.

**Promotion to a browsable shelf route.** `/perfect-rectangles` as a filterable grid with facets for
perfect / simple / order / aspect ratio, per the repo's third-shelf promotion rule. The data is already
in the right shape: `public/squarings/manifest.json` carries per-polyhedron summaries so a grid can be
built without loading shards. Would need a `shelfRegistry` entry, facet definitions and a card.

**Tutte's spring embedding** (Tutte, *How to Draw a Graph*, 1963). Draw the Smith diagram itself by
pinning one face as a convex polygon and putting every other vertex at its neighbours' barycentre. This
is the second half of the video and it would let one figure show the polyhedron, its graph and its
rectangle together. It is also the same harmonic condition the potentials already satisfy, so the solver
is largely written: the barycentric solve is the same reduced Laplacian with vector unknowns instead of
scalar ones.

**External cross-check against squaring.net.** Download the exhaustive order-9…17 SPSR Bouwkamp
catalogues (`o17spsr.bkp.zip`, ~1 MB) and confirm the order-17 results appear. If a rectangle we call
simple and perfect is absent from an exhaustive list of simple perfect order-17 rectangles, we are
wrong. Not yet done; the internal certification (exact cover, matrix-tree identity, Bouwkamp round trip)
is what currently stands behind the claims.

## Known state

- `pnpm vitest run lib/squaring/`: 45 tests across 4 files, all passing.
- The pipeline page's only console error is fixed: `polyhedron-thumb.tsx` emitted unrounded projected
  coordinates and stroke widths, and Node and Chromium do not round `Math.cos`/`Math.sin` identically in
  the last bit, so React reported a hydration mismatch on every thumbnail. Rounded before it reaches the
  DOM.
- `pnpm build` currently fails, and **not for anything in this feature**: `lib/tilings/length-families.ts`
  (uncommitted work on `feat/aperiodic-substitution-shelf`) reads `f.ranges` and `f.c0` while the
  generated `EnumeratedFamily` type still has `range` singular and no `c0`. That single line takes down
  18 unrelated test files by import failure as well. `pnpm tsc --noEmit` reports errors only in that
  file. The page was verified against the running dev server instead: all six figures render
  server-side, no placeholders.

## Where else this pushes: a literature survey (added 2026-08-18, AL question)

AL asked how many directions this concept has, whether the sphere can be squared, whether a cuboid can
be cubed, whether the current analogy survives each move, and what tilings the results map back to.
This section is the answer, and it is research only: nothing here was built.

### The knob nobody turns: conductance

Unit resistance is a choice, not part of the theorem. Put conductance c on an edge and its tile is a
rectangle of aspect ratio (width/height) = c, because the width is still the current and the height is
still the potential drop, and Ohm's law now separates them. Squares are the fixed point c = 1. Dutour
Sikirić states it in one line: "rectangles of side length a, b are associated to wires of conductance
a/b" (arXiv:1101.0223, Section 2).

Kenyon 1998 takes the same knob past reversibility. A harmonic function on a finite planar **Markov
chain** realises as a tiling of a rectangle by **trapezoids**, each with two horizontal edges, and every
such tiling arises this way. Squares are the doubly special case: reversible chain, unit conductance.
Prescribing transition probabilities prescribes tile shapes, which is how he gets necessary conditions
for tiling a polygon by squares and by equilateral triangles, classifies the polygons with at most one
non-convex vertex that are square-tileable, and determines which Euclidean tori are square-tileable.

So the honest picture: **the object is a trapezoid tiling; squares are a corner of it.** Everything in
this repo lives at that corner.

### The sphere: yes, and it is already what we ship

Two readings, both affirmative.

Genus 0 has dim H^1 = 0, so there is no free harmonic class and the battery edge is not a convenience,
it is the puncture that makes the problem non-empty. What comes out is a flat structure on the sphere,
visible if you double the squared rectangle across its boundary: 4 cone points at the corners, each of
angle pi, and Gauss-Bonnet closes, 4 x (2pi - pi) = 4pi = 2 pi chi. Our shelf is a shelf of flat cone
spheres presented cut open. (My derivation, not a citation; the arithmetic is the whole proof.)

The second reading is the round one, and it is settled and counted. Engel and Smillie, *The number of
convex tilings of the sphere by triangles, squares, or hexagons* (Geom. Topol. 22 (2018) 2839-2864),
extend Thurston's shapes-of-polyhedra machinery: convex square-tilings of the sphere correspond
bijectively to orbits of positive-norm vectors in a (1+zeta_4)-modular Hermitian lattice of signature
(1,5) over Z[i], the number of squares is the norm, and the weighted count with n squares is
(1/(2^13 * 3^2)) (sigma_5(n) + 8 sigma_5(n/2)), a Fourier coefficient of a weight-6 modular form for
Gamma_1(2). Cone angle at a vertex is (number of squares there) x pi/2; Gauss-Bonnet reads
sum over v of (4 - k_v) = 8. The cube is the smallest case, 8 vertices with k = 3.

Note the containment, which is checkable here: an integer squared rectangle subdivides into unit
squares, so its double is a convex unit-square-tiled sphere with 4 cone points of angle pi. Every
record on our sphere shelf is a point in Engel-Smillie's count.

### The cuboid: no, and it fails three separate times

1. **Perfect cubing is impossible.** Littlewood's descent: the cubes standing on the bottom face induce
   a squared rectangle there; the smallest square of a squared rectangle is interior, so the smallest
   cube on the bottom is walled in, and the alcove above it repeats the argument forever. Formalised in
   Isabelle (AFP, *Impossibility of the Dissection of a Cube*, Wiedijk's theorem #82). The argument only
   needs the bottom face to be a rectangle, so it kills the cuboid too, and iterates to hypercubes.
2. **The machine does not transfer.** Hersonsky built the three-dimensional theory on purpose:
   *Applications of Three Dimensional Extremal Length, I* (Topology Appl. 159 (2012) 2795-2805) gets a
   tiling of a rectangular parallelepiped by cubes from a triangulated topological cube, conditional on
   a "triple intersection property". His follow-up, *Discrete Extremal Length and Cube Tilings in Finite
   Dimensions* (Comput. Methods Funct. Theory, 2014), proves that property is **too strong to realise a
   tiling**. His own summary: discrete conformal mappings are far more limited in dimension three.
3. **The structural reason.** The x-coordinate is the stream function, and the stream function is a
   potential on the planar **dual**. In three dimensions the dual of a graph is a 2-complex, not a
   graph, so there is no scalar conjugate to be had; the parallelism loses exactly the half that makes
   the tile a square. This mirrors Liouville's rigidity, that conformal maps of R^3 are Mobius.

What does survive the dimension jump is arithmetic, not construction. Keleti, Lacina, Liu, Liu and
Tuirán Rangel, *Tiling of rectangles with squares and related problems via Diophantine approximation*
(Discrete Math. 346 (2023)), replace resistor networks with Dirichlet's approximation theorem precisely
because "there is no satisfactory analogue in three dimensions", and get integrality/scaling bounds for
hypercuboid tilings (their Theorem 1.5), equilateral triangles (1.6), isosceles trapezoids and
parallelograms (Cor. 7.6). Perrier (arXiv:2605.01944, May 2026) does the same trick with total
unimodularity and bounds the lcm of denominators by 2^n.

### The surface ladder, and where the analogy breaks

| surface | dim of harmonic space | input the battery is replaced by | built here |
|---|---|---|---|
| sphere, genus 0 | 0 | a battery edge (a puncture) | yes |
| cylinder / infinite planar | 1 | boundary shorted to one node | yes |
| torus, genus 1 | 2 | a class in H^1(T;R) | yes |
| genus g >= 2 | 2g | a class in H^1, cone points forced | no |
| Mobius, Klein, RP^2 | 1 - chi, NOT 2 - chi | see below | no |

Genus >= 2 is Chien, *Square tilings of surfaces from discrete harmonic 1-chains* (Rutgers PhD, 2015),
Thm 3.3.1 for a generic class, Thm 4.1.1 for non-generic ones, which build the metric on a surface of
equal or lower genus. Gauss-Bonnet forces cone points there: sum (k_i - 1) = 2g - 2 > 0. That is why
genus >= 2 stops being a plane picture and needs gluing instructions to display at all.

**The non-orientable row is the interesting one, and it breaks the correspondence.** For a closed
non-orientable surface of non-orientable genus k, H_1 has torsion, so dim H^1(N_k;R) = k - 1 = 1 - chi,
one less than the orientable formula 2 - chi that held on all 25 of our higher-genus star-polyhedron
tests. For RP^2 that gives **zero**. And yet perfect squared projective planes exist: Morley catalogues
them from order 2 upward (squaring.net, FPSPP, 2014). So on a non-orientable surface a squaring is not
the image of a harmonic 1-form, and the machine as we have it cannot produce one.

The visible signature is in Morley's data: most faultfree perfect squared Klein bottles have their tiles
at **45 degrees** to the sides, with sizes like 5 sqrt 2 x 3 sqrt 2, and only five known below order 8
are axis-parallel (*Perfect Squared Klein Bottle Myths*, MathsJam 2013/2014). The natural repair is
twisted coefficients, since an orientation-reversing loop can swap or flip the horizontal and vertical
directions, so the two coordinate forms are sections of a local system, not honest 1-forms. **I have not
verified that the twisted count comes out right, and the 45-degree fact is not derived here.** It is the
cheapest genuinely open question this survey found.

Morley's minimum orders for a perfect faultfree squaring, useful as targets:

    rectangle 9 (square 21) · cylinder 9 (square-cylinder 20) · Mobius band 5 · torus 2 · Klein bottle 4

Finite squared cylinders are a separate classical corpus from our infinite hyperbolic ones: an SPSC has
height equal to circumference, minimum order is 20, Augusteijn and Duijvestijn found two in 1983,
Anderson and Sulanke brought the order-20 count to 18 in 2012. Chapman, *The dissection of rectangles,
cylinders, tori, and Mobius bands into squares* (Duke Math. J. 72 (1993) 467-485), is the unified
treatment. For tori, Gambini's 1999 181x181 order-24 example is still the only known simple perfect
squared **square** torus; Morley catalogues orders 2-11, including noncommensurable sides of the form
a + b sqrt c, and separates deformable from nondeformable squarings.

### Other tile shapes

Tutte 1948 (Proc. Camb. Phil. Soc. 44, 463-482) settled equilateral triangles: **no** dissection of an
equilateral triangle into finitely many equilateral triangles with no two the same size, proved via
networks with modified Kirchhoff laws. The stronger form is that no two tiles may share two vertices
(Chu, arXiv:1412.5431, gives two network-free proofs). What is possible is a dissection into triangles
**and rhombuses** with no two equal sides, and Zak (Australas. J. Combin. 44 (2009) 87-93) shows an
equilateral triangle has a perfect dissection into 7 non-right similar triangles, 7 being minimal.
BSST returned to this in 1975 with *Leaky electricity and triangulated triangles* (Philips Res. Rep. 30,
205-219): triangulated triangles need resistors that leak to ground, which is the modification.

### What I have to report about our own torus shelf

**Dutour Sikirić, *Torus square tilings*, AAECC 23 (2012) 251-261 (arXiv:1101.0223), is the paper we
rebuilt.** I did not find it before building, and it contains:

- Theorem 3(ii): for a periodic plane map, the space of periodic harmonic vectors has dimension 2 and
  is isomorphic to H_1 of the torus. This is our (m,n) control, exactly.
- Proposition 1(i): a symmetry f of the map induces a symmetry of the tiling **iff f_*(w) = +/- w**.
  This is our half-turn rule, published 14 years earlier. His (ii) is the corollary we measured: a p2
  map forces p2 on every one of its tilings.
- Theorem 1(iv): rotating a regular square tiling by 90 degrees replaces the map by its dual. Our
  "dual polyhedra give transposed rectangles" is the genus-0 shadow of this.
- Section 5: 3-, 4- and 6-fold rotation axes are constrained; p1, p2, p4 are the possible rotation
  groups of a square tiling. Consistent with our measurement that 3/4/6-fold rotations cost nothing.

Nothing we shipped is wrong because of this, and the agreement is a strong external cross-check, since
his framework and our BigInt solve were built independently. But the finding is not ours, the log
should say so, and the pipeline page should cite him.

**What he has that we do not: Sq-domains.** Section 4. Each edge e defines a line L(e) in the (alpha_1,
alpha_2) parameter plane where that square's side vanishes; the lines all pass through the origin, so
the plane is cut into **angular sectors** on which the combinatorics is constant. Crossing a line makes
a square shrink to nothing and reappear somewhere else. Our (m,n) slider walks across these sectors
blind. Drawing the sector diagram beside the slider is the single best-grounded addition available to
the pipeline page.

### Ranked, what is actually worth building next

1. **Sq-domain diagram for the torus page.** Cheap, exact, literature-backed, and it explains the
   discontinuities the slider already produces.
2. **Conductance as a slider.** One line of the solve; turns the sphere shelf from squarings into
   rectanglings and makes the "why squares" point by showing what happens when you break it.
3. **The non-orientable experiment.** Quotient a periodic tiling by a glide reflection instead of a
   translation, count the harmonic space, and see whether 1 - chi is what comes out and whether the
   45-degree tilting appears. This is the only direction here where the answer is not already in print.
4. **Genus >= 2 from the hyperbolic shelf.** A finite quotient of a {3,q} tiling is a closed hyperbolic
   surface; Chien says the construction works and Gauss-Bonnet says it acquires cone points. Needs a
   corpus of regular maps and a way to draw a genus-3 surface, which is why it stays deferred.
5. **Trapezoids from a non-reversible chain (Kenyon 1998).** The widest form of the parallelism, and the
   one that shows squares are a special case. Largest build, least visual payoff.

## The Sq-domain figure (added 2026-08-19, AL picked direction 1 from the survey above)

The torus page now carries a fifth figure, beside the class control instead of below it: the parameter
plane, with the walls where the arrangement changes and the ticks where perfection dies.

### Why two solves are enough

`omega`, the current on every edge, is LINEAR in the class. The reduced Laplacian is built from the
darts alone, so its determinant does not see (m, n) at all, and the class enters only through the
right-hand side. Therefore

    side(e) at (m, n)  =  |a_e·m + b_e·n| · (one positive scale shared by every edge)

with a_e and b_e read straight off the solves at (1,0) and (0,1). Two solves give the exact integer
coefficients of every wall in the plane, and nothing else has to be computed or sampled. That is why
`torusCurrents` was split out of `squareTorus`: it is exactly the half that is linear.

The walls are then Dutour Sikirić's Sq-domains, "Torus square tilings", AAECC 23 (2012) 251-261, §4.
Each edge e vanishes on the line L(e) = {a_e·m + b_e·n = 0}; the lines cut the direction circle into
one sector per wall, and the combinatorics is constant on each. Crossing one is what makes the page
jump when the class moves by one step.

### Two things the figure adds on top of §4

**Tie lines.** Two squares come out the same size where |a_e·m + b_e·n| = |a_f·m + b_f·n|, which is
again a pair of lines through the origin, one from the difference of the coefficient vectors and one
from their sum. So a perfect squared torus is a class that misses every one of them. Perfection stops
being luck and becomes a condition on the parameter, which is what the rim ticks say.

**Locked pairs.** When (a_e, b_e) = ±(a_f, b_f) the two sides agree at EVERY class and no line
separates them, so the record is imperfect everywhere. This is the half-turn rule of the previous
section, now mechanical instead of statistical: a half-turn acts as −1 on H¹ at every class at once, so
it locks every orbit it moves. Measured: every one of the 8 half-turn records has locked pairs, and
none of the 16 others does.

### Certified against the solve, not just self-consistent

All four claims were checked by running the exact solve at every class in the shipped sweep and asking
whether the plane predicted it. **1152 (record, class) pairs, zero failures**, on all four:

- side(e) equals the linear form, checked by cross-multiplying so the shared scale never has to be known
- a class sits on a wall exactly when one of its squares has vanished
- **a squaring is perfect exactly when its class misses every tie line and no pair is locked**
- a locked pair stays equal at every class, not just generically

`lib/squaring/torusSqDomains.test.ts` carries all four plus the square lattice worked by hand: 4.4.4.4
has its two walls on the m and n axes, ties on the two diagonals, is imperfect at (1,1) and gives
Morley's order-2 5x5 torus at (4,3).

### Files

- `lib/squaring/torusSqDomains.ts`: coefficients, walls, ties, locked pairs, sectors, and a
  jump-target search. BigInt throughout; the only floats are the angles used for drawing.
- `lib/squaring/torusSquaring.ts`: `torusCurrents` split out, `squareTorus` now calls it.
- `components/squaring/sq-domain-figure.tsx`: the figure.
- `components/squaring/torus-stages.tsx`: two-column header, the facts moved up beside the control,
  the hover caption, and the sector readout.

### Three decisions worth recording

**A full disk, not a half one.** The honest parameter space is the circle of DIRECTIONS, of length π,
because a class and its negative give the same tiling reflected. Drawing only [0, π) is that space
exactly, but it hides the wrap: the sector spanning the largest wall angle round to the smallest is one
sector drawn as two ends of a strip. The full disk with every wall as a diameter and antipodal wedges
filled alike makes the identification visible instead of hiding it, and costs only symmetry.

**The live sector is marked by weight and an outline, never by hue.** `--color-accent` in this theme is
neutral-900 in light and neutral-50 in dark, so a 0.16 accent fill is one more shade of grey and
invisible against the alternating wedges. Colour is reserved for the data here: each wall is drawn in
the colour of the square that dies on it, which is what ties the figure to the four stages.

**Tick weight adapts to count.** `period-k3-218` has 21 walls and 237 tie directions, which at full
weight closes into a solid ring. Above 60 ties the ticks thin, which keeps the comb reading as separate
lines for longer. Above roughly 200 it is a texture, and that is a true statement about the record.

### Not done

- The jump-to-sector control cannot reach every sector: the steppers offer |m| ≤ 6 and 0 ≤ n ≤ 6, so a
  narrow sector may hold no coprime class in range. Those wedges are drawn fainter and are inert.
  Widening the sweep would fix it and costs a shelf rebuild.
- Nothing marks WHICH pair ties on a given tick. The data is there (`SqTie.pairs`); hovering a tick to
  light the two squares would be the obvious next hover, and the walls already prove the wiring works.

### Dark-mode label contrast (fixed 2026-08-19, AL report)

AL reported that the numbers in stages 3 and 4 were unreadable in dark mode. Both had the same cause,
and it is worth stating as a rule because it will recur anywhere data colour meets chrome colour.

**The tile palettes do not flip with the theme; the label colour did.** `squareFills` and `torusFills`
encode SIZE, so they are the same pastels in both themes by design. The labels printed on them took
`--color-fg-muted`, which is `neutral-500` in light and `neutral-400` in dark, so in dark mode a
near-white number sat on a near-white tile. Measured on the sphere shelf: contrast fell to about 1.4:1.

Fixed by making ink follow the surface it sits on. `tileInk(fill)` in `components/squaring/stage-shared.ts`
parses the fill, computes its sRGB relative luminance, and returns a dark or light ink at the crossover
where the two give equal contrast, Y = 0.21. That threshold is not decoration: `torusFills` runs one hue
ramp at a fixed lightness, so its green lands at Y = 0.50 and its blue at Y = 0.09, and no single ink
reads on both. Whichever side a fill falls on, the label now clears roughly 3.7:1 at worst.

Two consequences worth recording:

- **The squared torus labels only its CENTRE copy now.** The surrounding copies draw at 0.62 alpha, so
  what a label would sit on is the tile composited against the PAGE, and that does move with the theme:
  the same tile is pale in light mode and dark in dark mode. No fixed ink can read on both, so those
  labels are gone. The figure already used that alpha to say which domain is the one being read, so the
  labels now agree with it.
- **The Smith diagram keeps its theme-token ink**, because its labels sit on the page background, not on
  a tile. What they needed was a wider punch-out: the halo was 5 units at font 25, thin enough that a
  6-unit wire ran right up against the glyph. Now 8 units at font 28.

### Thumbnails for the genus-1 and hyperbolic rows (added 2026-08-19, AL request)

The two later pickers now match the polyhedron rows: a 54px patch on the left, then name, headline
number, badges, and the small detail line. Both patches travel on the INDEX, not on the shard, because
the sidebar shows two dozen rows at once and a thumbnail that needed its own shard would mean two dozen
fetches to draw a list. The torus index went 5.8 KB to 15.2 KB, the cylinder one 852 B to 6.1 KB.

- `TorusThumb` carries the cell's T-junction-SPLIT polygons, the same ones stage 1 draws, scaled so the
  longer lattice vector is one unit and rounded to three decimals. The component tiles them over a 5x5
  block and frames on the middle cell, so a row shows one cell plus the start of its neighbours.
- `CylinderThumb` carries a ball grown to the largest radius that still fits in 60 vertices, which comes
  out at r = 3 for {3,6} and r = 1 for {3,12}. At 54px the readable signal is how many triangles meet at
  the centre, and a denser ball is a smudge. Chords, no rim, scaled to fill the box: it is a patch of the
  tiling and makes no claim to be the Poincaré disk, which is what the page's own figure is for.

Both hold still. The polyhedron thumbnails turn because a wireframe of a 26-vertex solid needs parallax
to separate front from back; a plane tiling and a disk of triangles have no front and back, so motion
there would be noise.

One trap worth recording: with `vectorEffect="non-scaling-stroke"` the stroke width is in VIEWPORT units,
not user units. The torus viewBox is scaled to the cell, about one unit across, so the first version
passed `2 / size` and drew lines four hundredths of a pixel wide. They rendered as almost nothing, and
the fix is `strokeWidth={1}`.

Tests: every index entry must carry a thumbnail whose face count matches its shard's quotient and whose
normalised basis is non-degenerate; every ball thumbnail's centre vertex must have exactly q neighbours,
since that count is what the picture is for.

### Continuous class, snapping to the integers (added 2026-08-19, AL choice)

AL asked whether m and n have to be integers. They do not: the class lives in H¹(T;ℝ) ≅ ℝ², every real
direction is a genuine squared torus, and the certificate Σ side² = covolume is the Riemann bilinear
relation, which holds over ℝ. Integrality buys arithmetic, not existence. So the ray in the parameter
plane is now draggable, and it sticks to the integral classes.

**Why it costs almost nothing.** Every field of the exact solve is linear in (m, n): the reduced
Laplacian's determinant does not see the class, `delta` comes from the lattice shifts alone, and the
stream periods X₁ and X₂ fall out of a 2x2 Cramer whose matrix is class-independent. So the whole
squaring at a real class is a blend of two exact solves,

    S(m, n) = m·S(1,0) + n·S(0,1)

up to a positive scale. `torusRaw` was split out of `squareTorus` to expose exactly that pre-normalised
solve, and `torusFrame` + `squareTorusAt` do the blend in floats. Dragging is a dot product.

The one thing that is NOT linear is where a square's anchor sits: the corner flips with the sign of the
side. So the blend produces signed sides and the anchor rule is applied afterwards, which is also what
makes a drag across a wall behave correctly: the square shrinks to nothing and comes back on the other
side, and the tiling stays continuous through it.

**What off-lattice costs, and what the page does about it.** The sides become reals in the ℚ-span of
{m, n}, so "these two tiles are the same size" stops being decidable by the machinery here and the
scale is arbitrary. The page therefore stops printing them: no tile labels, `distinct sizes` reads
"off-lattice, not certified", and the area and periods carry a "≈". Landing back on an integer class
brings the exact numbers back, which makes the snap points mean something instead of being a nicety.

**The snap tolerance shrinks with the class.** `SNAP / (|m| + n)`, SNAP = 0.05 rad. A fixed radius does
not work: at limit 6 there are about sixty reachable directions across the half-circle, average spacing
about 3°, so a radius wide enough to catch (1,0) comfortably would leave nothing free. Weighting it
makes the simple classes sticky and the elaborate ones barely there, which is also the order in which
they are worth landing on. Measured over a 2000-point sweep, about a third of the circle snaps.

One implementation trap, recorded because it is silent: the pointer must be captured on the first real
MOVE and never on the press. Capturing on `pointerdown` retargets the `pointerup` to the svg, so the
click event lands on their common ancestor and the wedge under the cursor never sees it, which quietly
kills click-a-wedge-to-jump. The symptom is a control that drags fine and ignores clicks.

Tests: the blend must reproduce the exact solve at every integral class up to one positive scale, on
side, x and y, over 400-plus (record, class) pairs; Σ side² must still equal the torus area off the
lattice; the snap must pull the simple classes from a little to one side and leave between a fifth and
a half of the circle free.

### One screen, no scrolling (redesigned 2026-08-19, AL report)

AL reported the layout was broken for the thing it was built for: the control sat top-right, the four
stages ran past the fold, and watching what a drag DOES meant moving it, scrolling down, and scrolling
back. The whole point of putting four stages on one page is that they answer each other, so they have to
be visible while the control moves.

The page is now a **board**: a control rail beside a 2x2 grid, taking the height it is given and not
scrolling. `components/squaring/stage-board.tsx` holds it, and all three corpora use the same shell, so
the sphere's battery, the torus's homology class and the cylinder's ball radius all sit in the same
place. Measured at 1512x949 and 1280x800: the only scrolling element left on the page is the sidebar
picker.

Three things had to change for the figures to fit a box instead of driving one:

- The stage SVGs were `h-auto w-full`, so their height came from their width. They are now `h-full
  w-full` and `preserveAspectRatio` letterboxes the drawing inside whatever cell it gets. The ones with
  a caption underneath became `min-h-0 w-full flex-1` inside an `h-full` column.
- Stage headers dropped to one clipped line of blurb, with the full text on hover. Two rows of blurb is
  about 40px of a height budget the figures need.
- The main column went `overflow-y-auto` to `lg:overflow-hidden`, with the board as a `flex-1 min-h-0`
  child of an `h-full` flex column. Below `lg` it falls back to the old stacked, scrolling layout.

**The reflow bug this exposed, which is the one that mattered.** The class readout showed a second line,
"off the integer lattice", only when the class was off-lattice. Dragging in and out of a snap therefore
grew and shrank the panel ABOVE the disk, which moved the disk out from under the pointer: the control
fought the hand holding it. AL's word for it was frustrating, and it was. Anything above a drag target
must have a fixed height. That line is now always rendered, one line, `h-3`, with the text swapped for
"exact class · integer sides" on the lattice. A 180° sweep now reports exactly one distinct bounding box
for the disk, which is the test worth keeping in mind for any future drag control.

**Prose moved to the article.** The pipeline page had grown three rail panels of explanation; that is
`/theory/perfect-rectangles`'s job, not the tool's. The genus-1 material, the Sq-domain and tie-line
account, and the hyperbolic cylinder went into the article as three new sections, along with the sources
for Dutour Sikirić, Chien, Kenyon, Benjamini–Schramm and Georgakopoulos. What stayed on the page is what
you cannot read anywhere else: the numbers for the record in front of you. The half-turn note became a
`locked pairs` fact, and the transient/recurrent note a `walk` fact, so the information survived the cut
without a paragraph around it.

### Two more jitter bugs, and the {3,6} removal (2026-08-19, AL reports)

**Captions that changed line count resized the figure above them.** Same defect as the class readout, one
level down: the figure is the flexible part of a stage cell, so a caption flipping between one line and
two grows and shrinks the picture while you work the control. It bit on all three boards, since every
caption reads off the thing the control changes. `FigureCaption` and `FigureControls` in
`stage-board.tsx` now pin every one of them to a fixed two-line height, and the captions that would have
needed a third line were cut back to what the control rail does not already say. Measured: one distinct
figure geometry across a 180° class sweep, a radius sweep, and a run of battery clicks, on all three.

**The snap teleported across the disk in the lower half.** `classes()` lists one representative per
DIRECTION, all with n ≥ 0, because (m, n) and (−m, −n) are the same squared torus. They are not the same
PICTURE: negating the class negates the harmonic form, which point-reflects the tiling. So a drag in the
lower half that landed on a snap got handed the canonical upper-half representative, the marker jumped
to the antipode, and all four stages flipped at once. That is the exact discontinuity a continuous
control exists to avoid.

Fixed by orienting: `snapClass` and `nearestClass` now negate the representative when the pointer is on
the other side, which lets n go negative, and nothing downstream minds. The wedge click needed the same
treatment, since each sector is drawn as two antipodal wedges and the click has to give the class on the
side that was hit. The steppers' n range opened to [−6, 6] to match. Measured over a full 360° drag: the
marker tracks the pointer to within 2.0°, which is snap pull, and there are zero antipodal jumps.

The lesson both share, worth stating once: **anything the pointer drives must be continuous in the
pointer, and anything above it must not move.** Canonical representatives are for storage, not for
controls.

**{3,6} is out of the hyperbolic picker** (AL, 2026-08-19). It shipped as the control, the one member of
the family whose walk is recurrent, so that a reader could watch a circumference decay beside the ones
that climb. The shelf is now four hyperbolic records and 2,084 certified squares. The finding is not
lost, only unshipped: the direct-solve tests in `cylinderSquaring.test.ts` still compute {3,6} at r ≤ 4
and still assert that it turns over while {3,7} climbs, and the article keeps it as the stated control.

### Is the continuous family known? (researched 2026-08-19, AL question)

AL asked whether the literature knows that a torus squaring can be morphed off the integer lattice and
stay a valid tiling with irrational square sizes. It does, and the sharp statements are better than the
question. Both new sections of the article come from this.

**Dehn is why the question is interesting.** Dehn, *Über Zerlegung von Rechtecken in Rechtecke*, Math.
Ann. **57** (1903), 314–332: a rectangle is squarable only if its side ratio is rational, and then every
square is commensurable with every other. So the integer sides in the planar half of this page are not a
scale convention, they are forced. The article had never mentioned this, which left the genus-1 sections
looking like a bigger version of the same thing instead of a break from it.

**Kenyon bounds the drift, exactly.** *Tiling with squares and square-tileable surfaces*, Prépublication
ENS Lyon **119** (1993). Corollary 12: for a square-tiled closed surface of genus g the side lengths span
a ℚ-vector space of dimension ≤ 2g, and the bound is optimal. Torus gets 2 where the rectangle gets 1.
Our construction cannot exceed it by construction, since every side is `|a_e·m + b_e·n|` with a, b
integers, so the sides always lie in the ℚ-span of {m, n}. Kenyon's bound and our linearity result are
the same fact from two sides.

Verified on our own data before writing it up. `uniform-3636` at class (1, √2): 4 of 6 tiles pick up a
non-zero √2 part, the coefficient pairs span exactly 2 dimensions over ℚ, two tiles come out in ratio
√2 − 1 = 0.414213562373, and Σ side² = covolume to 8.3e-9 relative. Incommensurable squares tiling a
surface, at Kenyon's optimal bound.

**Kenyon Theorem 10 is the limit in the other direction**, and it is the part that is easy to miss: the
class does not choose a tiling of a fixed torus, it moves the torus too. Writing a flat torus as ℂ/⟨1, z⟩,
T_z is square-tileable iff z lies on a circle of rational centre and rational radius clear of the real
axis, or a horizontal line at rational height. Dense, and one-dimensional inside a two-dimensional space
of shapes, so almost every flat torus admits no square tiling at all. The equilateral torus
(z = ½ + i√3/2) is not squarable in any direction; the rectangular torus of height 1 − √3/2 is. That is
consistent with our picture: one map contributes one curve of tori as the direction sweeps, and countably
many maps give a countable union of curves.

**Prior art on the parameter plane, restated honestly.** Dutour Sikirić's §4 is our Sq-domain figure
essentially verbatim: H₁(T,ℝ) of dimension 2, the line L(e) where a square vanishes, the plane cut into
angular sectors, and "if one goes towards L(e) then the length w(e) of the corresponding square vanish.
After one passes through L(e), the square reappears but in a different position." He also declines the
integer question outright: "if one imposes that square sizes are integral then we do not have the answer
to the question." Chien (Rutgers, 2015) Theorem 3.3.1 does every genus from a generic class in
H₁(Σ_g,ℝ)\{0}, where generic means no zero coefficient, which is our off-the-walls condition.

⚑ **Citation corrected.** The Sources section had credited the characterisation of square-tileable tori
to Kenyon's *Tilings and discrete Dirichlet problems*, Israel J. Math. **105** (1998). That paper does
state it, but Theorems 9 and 10 and Corollary 12 are read here from the 1993 ENS Lyon preprint, which is
now what the page cites for them. Both are listed.

⚑ **Not done, and a real gate if wanted.** Every torus this repo produces must have its modulus on one of
Kenyon's rational circles or rational horizontal lines. Nothing checks that. It is the strongest available
external test of the lattice construction, since a record landing off those curves would be a proof of a
bug, and it needs no external data.

⚑ **Not modelled.** Chien Theorem 4.1.1 gives the wall case a structure theorem: the tiling lands on a
surface of genus g₀ ≤ g with an explicit formula in |V₀|, |F₀| and the χ(H_j). We treat a wall as "a
square vanished" and move on. Harmless at g = 1, but it is a degeneracy check where the literature has a
theorem.
