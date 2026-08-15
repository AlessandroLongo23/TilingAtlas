# Edge types in the solver, and the 45-45-90 triangle at k = 1, 2, 3 (2026-08-13)

First palette with **edge types**: a tile whose edges are incommensurable, so the scaled-palette trick
of writing a long edge as a run of unit darts separated by 180° corners cannot express it at any scale.
Marek, 2026-08-12: "you need to change the algorithm to implement edge types. Basically, each edge has
limitation to which edges it can be connected to prevent incompatible edges."

## The tile

`alphabets/palettes/tri45.json` — half a square. D = 24 because the 45° corner is 3 units of 15°, an odd
power of ζ₂₄, the same reason the octagon needs 24 directions. Angles [6, 3, 3] in D-units (90, 45, 45),
edges `["S", "H", "S"]`: leg, hypotenuse, leg. Only like types may glue.

## Result

| k | tilings | control, edge types OFF |
|---|---|---|
| 1 | **3** | 62 |
| 2 | **4** | 2,734 |
| 3 | **12** | 94,059 |

The control is the same tile with the `edges` field deleted, so its extra entries are exactly the
assemblies that glue a leg to a hypotenuse. The constraint removes 99.98% of them. Vertex alphabet:
16 types with edge types, 201 without; vertex configurations 6 against 102.

**k = 1 is hand-checkable and checks out.** All three solutions carry the same vertex figure,
45.45.90.45.45.90, and differ only in their gluings: `(0)(1)(2)`, `[0 2](1)`, `(0)(1 4)[2 3](5)`. That
vertex is the one the ordinary square grid produces when every square is cut along the same diagonal:
at a grid vertex, the two squares having it as a diagonal endpoint each contribute 45 + 45, the other
two contribute 90.

## What changed

- `alphabets/palettes/tri45.json`, `tri45noedge.json` (the control).
- `gen_alphabet.py`: composite tiles accept `edges`; the word period is taken over the (angle, edge)
  word; corner classes carry `ein`/`eout`; `edge_type_forbidden_pairs` forbids incompatible adjacency
  at a vertex, applied in every closure mode and independently of `EU_PRUNE_OVERLAP` because it is a
  correctness constraint; `fold` emits a per-dart `etype`; `emit_binary` writes **CTRNTB02**.
- `eu_solver.cpp`: `vertexdef`/`configuration` gain `etype`; the loader accepts CTRNTB01 and 02 and
  sets `EDGE_TYPED`; both glue sites reject a mismatched pair, and the mirror pair with it.
- Untyped edges are id 0 and act as wildcards, so every existing palette is unaffected.
  **`make check-regular` PASS, byte-identical** (20/61/151/332/673).

## Geometry: developed and certified

`develop_tri45.py` develops all 19 into exact ℤ[ζ₂₄] and emits explicit triangles.
**19 of 19 developed, 0 failures, 258 triangles.** Two invariants hold exactly, at 0.00e+00 relative
error, because every coordinate is an exact cyclotomic sum and only the final print is float:

- every triangle is 1 : 1 : √2;
- per tiling, the developed triangles' total area equals |det(T1, T2)|, so they cover the fundamental
  domain exactly, with no gap and no overlap.

Two things the developer had to get right that the ℤ[ζ₁₂] one never faces:

1. **The step depends on the dart.** A leg steps ζ^d, a hypotenuse steps √2·ζ^d = ζ^(d+3) + ζ^(d−3).
2. **An edge's type cannot be read off its flanking classes.** In the folded quotient a dart's
   orientation varies, so "the edge leaving this corner" is not a global function of the class: both
   readings type every dart, and neither types both sides of every half-edge alike — which is what the
   first two attempts hit. What is orientation-free is that the two edges at a corner carry that class's
   {ein, eout} as a SET, and a glued pair is one edge. For this tile the right angle forces both its
   edges to be legs, and propagating outward from the right angles determines everything.

Shipped: `public/tri45/t45-k{1,2,3}.json` + `manifest.json`, written by
`scripts/build-tri45-shelf.mjs`, which re-runs both certifications on the bytes that land in `public/`
and refuses to write if either fails.

## Reflection folding: cleared by a known-answer control

The open risk from the first run was that folding edge-typed words by rotations only would leave
mirror-image vertex figures as separate types and double-count chiral tilings. Settled by running the
regular palette through the same rotations-only path (`GEN_NO_REFLECTIONS=1`, gate bypassed via the
`regnorefl` palette copy): **10 / 20 / 61**, which is exactly right — k=1 is 10 because the
12-direction palette is octagon-blind, and 20 / 61 are the settled k=2 / k=3 targets. So mirror pairs
are merged downstream of the vertex alphabet, and 3 / 4 / 12 are not inflated.

## `tri45all`: all four shapes, 1,010 tilings on the shelf

The union palette: the 45-45-90 triangle at legs 1 and at legs √2, the unit square and the √2 square.
Three edge types, S = 1, H = √2, D = 2. **H is the hinge of the whole palette** — it is the small
triangle's hypotenuse, the big triangle's leg and the √2 square's side at once, so every tile can meet
every other, which is why the union is far richer than the sum of its parts.

267 vertex types. Solver 38 / 323 / 2,186 = 2,547 solutions; 2,376 develop, 171 fail `lattice rank 4 !=
2` and are excluded. Contributes **434** distinct tilings.

### Shelf total

**1,010 distinct tilings**, k=1: 19, k=2: 157, k=3: 834, over three families that dedupe against each
other so a tiling reachable from two tile sets is one entry:

| family | tilings |
|---|---|
| `45.45.90 + 4 + 4√2` | 329 |
| `45.45.90 at two scales` | 247 |
| `two triangles + two squares` | 434 |

Class **Many edge lengths** in /library and /play. Certified on the shipped bytes: every edge measures
1, √2 or 2, and each entry's tiles cover its period cell exactly (1.15e-9 / 7.78e-10). `pnpm build`
green, `make check-regular` byte-identical.

⚑ The rank-4 develop failures scale with the palette (0 of 624 on `tri45two`, 56 of 927 on `tri45sq`,
171 of 2,547 here) and are still unexplained. Excluded, never counted.

## `tri45two`: the same triangle at two scales, and three edge lengths

Third palette, AL's ask: the 45-45-90 triangle with legs 1 (hypotenuse √2) **and** the same triangle
scaled by √2, legs √2 and hypotenuse 2. Three edge types now — S = 1, H = √2, D = 2 — and the scaling
is what makes it interesting: the big triangle's LEGS are the small one's HYPOTENUSE, so the two tiles
interlock along H and this is not two independent copies of one problem. Both tiles carry the same
angle word, 90.45.45, and differ only in their edges.

102 vertex types; 14 / 88 / 522 = 624 solutions, **all 624 develop, no failures**. Deduplicated across
both palettes: **247 distinct tilings** from this one, 576 on the shelf in total.

Note 2 is commensurable with 1 but not with √2, so the palette needs a genuinely mixed length set. The
developer's step table is now data-driven from the palette's own `edgeLengths` (`"1"`, `"sqrt2"`, `"2"`,
and n·√2 forms), all exact in ℤ[ζ₂₄].

## The shelf holds several palettes at once

`scripts/build-tri45-shelf.mjs` takes `tag=family=cells.json` per palette and merges them, each keeping
its own family string, with the congruence dedupe running ACROSS palettes — so a tiling reachable from
two tile sets is one entry, not two. Currently: `45.45.90 + 4 + 4√2` (329) and `45.45.90 at two scales`
(247), k=1: 16, k=2: 98, k=3: 462.

## The three-tile palette: `tri45sq`, 391 tilings on the shelf

Second palette, and the sharper test of edge types: the 45-45-90 triangle plus **both** squares its
edges generate — the unit square (four legs) and the √2 square (four hypotenuses). The two squares
carry the SAME angle word, 90.90.90.90, and differ only in their edges, so a unit-edge alphabet cannot
tell them apart and cannot express the √2 square at all.

Alphabet 102 vertex types over 5 corner classes. Solver (face filter OFF) 21 / 135 / 771 = 927
solutions; 871 develop, **56 fail with `lattice rank 4 != 2`** and are not shipped. Deduplicated by
geometry: **391 distinct tilings**, k=1: 11, k=2: 63, k=3: 317. Certified on the shipped bytes: every
edge measures 1 or √2, and each entry's faces cover its period cell exactly (1.15e-9 / 7.78e-10).

This supersedes the triangle-only shelf, which it contains. Class **Two edge lengths** in /library and
/play. `pnpm build` green, `make check-regular` byte-identical.

Three generalisations it forced, all of them things the triangle-only run hid:

- `etype_of` compared the shared edge in ONE orientation. A mirrored reading of a vertex figure
  reverses its corner sequence, which swaps every corner's ein and eout, so the forward pairing
  (a.ein, b2.eout) and the mirrored one (a.eout, b2.ein) are both legitimate; asserting the forward one
  rejected every reversed frame the σ-aware fold now generates.
- The developer kept only 3-gons, so squares were silently dropped and the area certificate then failed
  by exactly the missing area.
- The certifier used the triangle area formula and a 3-side shape test. Now shoelace area and a
  per-edge length check against the palette's declared lengths — general over whatever the palette holds.

⚑ The 56 rank-4 failures are unexplained. Either those combinatorial solutions are not realizable in
the plane (the search is combinatorial, so this is possible and would be the analogue of develop_any's
rank-3 refusal on unit edges), or the developer mishandles them. They are excluded, not counted.

## RESOLVED: the face filter was unsound, and 67 tilings are on the shelf

**The bug was the face filter, not the fold and not the developer.** `EU_NOFILTER=1` changes the
counts from 3 / 4 / 12 to **5 / 21 / 102**, and every tiling it had been discarding is a
mixed-diagonal one. That prune decides which vertex types can occur in a tiling by reasoning about
face closure under the unit-edge assumption, so on an edge-typed palette it throws away valid types.
By the project's own settled rule — a completeness knob that can lose a tiling means the fast regime
is the incomplete regime — the filter must stay OFF for edge-typed palettes until it is taught about
edge lengths.

Developed and deduplicated by geometry: **67 distinct tilings**, k=1: 2, k=2: 11, k=3: 54, every one
exactly certified (triangles 1 : 1 : √2, tile area equal to |det(T1,T2)|, both at 0.00e+00).

**k = 1 is an exact independent check.** Hand-derivation: legs meet legs and hypotenuses pair into
unit squares, so every tiling is the square grid with one diagonal per square; the vertex word
45.45.90.45.45.90 forces all squares to the same diagonal (one tiling, all-`/` and all-`\` being
mirror images that merge), and the checkerboard cutting makes every vertex 45×8 (a second). **Exactly
two**, which is what the unfiltered enumeration produces. The filtered run found only the first — the
checkerboard was the tiling it was throwing away.

Shipped: `public/tri45/` + `public/reference-atlas-tri45.json`, class **Half-square** in /library and
/play, 67 entries. `pnpm build` green, `make check-regular` byte-identical.

### Two things fixed along the way

- **σ-aware reflection folding.** `word_symmetries` tested reflections by literal corner-class
  equality, so the axis through the right angle — which SWAPS the two 45° corners — was rejected, and
  no axial (S/A) marking was ever generated for a word containing a 45. Reflections now test through
  the tile's mirror map σ, and `fold` accepts an orbit whose classes agree up to σ. The alphabet goes
  16 → 27 vertex types. This did NOT change the tiling counts, so it was not the over-count, but it is
  correct and the regular tables stay byte-identical (σ is the identity for equilateral palettes).
- **The decoder.** Was going through `pruner.py`, whose module-level alphabet is the hardcoded regular
  one, with the TES-path line passed where the Conway line belongs. Now `family_flex.decode`.

### Still over-counted, and it is now a small residue

128 solver solutions deduplicate to 67 tilings; the all-parallel one alone accounts for 19. Those are
markings of one tiling that the pipeline does not merge. The shelf ships the deduplicated set, so the
catalogue is right, but the raw enumeration is not yet a count anyone should quote.

## What is still open

1. **No literature cross-check** of 3 / 4 / 12 for the isosceles right triangle. Both internal checks
   passed (the hand-derived k = 1 vertex, and the 10 / 20 / 61 control on a known catalogue), but
   nothing external confirms the numbers.
2. **The shelf is not wired**, see above: the data ships and is certified, the UI does not show it yet.
3. **Reflection folding is bypassed, not fixed.** Rotations-only is sound here because the control
   proves mirror pairs merge downstream, but `fold` / `automorphisms` / `certify` still assume a
   reflection fixes each corner class, so a CHIRAL edged tile (one whose reversed (angle, edge) word
   differs) cannot be folded at all yet. `load_palette` refuses those loudly instead of guessing.

## Side finding, unrelated to this tile

`word_symmetries` tests reflections by literal corner-class equality, and reflection maps boundary
position j to −j. For a `scaled` tile of side s ≥ 3 the flat positions 1…s−1 are distinct class ids that
reflection permutes, so some genuine reflections are likely being missed on `regular-scaled-123`. That
under-folds instead of over-counting, and the pruner should absorb it, but it is worth a look.

## Reproduce

```sh
cd tools/ctrnact-oracle
python3 alphabets/gen_alphabet.py --palette alphabets/palettes/tri45.json --out tables/tri45
make eu_solver_rt MAXNUM=3 && make eu_pruner.tri45 PALETTE=tri45 MAXNUM=3
mkdir -p run/out && cd run
EU_TABLES=../tables/tri45/tables.bin ../eu_solver_rt >/dev/null 2>solver.log
EU_OUT=$PWD/out EU_KMIN=1 EU_KMAX=3 ../eu_pruner.tri45
```
