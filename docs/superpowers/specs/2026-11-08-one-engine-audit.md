# One engine for the atlas solver and the Tiling Searcher: audit (2026-11-08, CC)

Goal (AL, 2026-11-08): one algorithm and one implementation behind both the atlas pipeline
(`tools/ctrnact-oracle/eu_solver`) and the Tiling Searcher (`tools/searcher/tilesearch`): less code, one
source of truth, one performance baseline.

## Finding: the solver's search reads no palette

`eu_solver.cpp` reads no palette key. Everything a palette says reaches the search through the tables
`alphabets/gen_alphabet.py` compiles:

- the vertex types, each a complete cyclic word whose angle rule the compiler has already checked;
- the corner-class stepping rules for faces (`CLASS_L/P/NEXT/PREV`);
- the edge types (`etype`);
- the symmetry representatives (`reps`).

The search glues whole vertex types, closes faces, matches edges and counts k. It also rejects coverings,
picks a representative per symmetry and, under `EU_ORDERLY`, prunes repeats. It has no curvature: geometry
lives in the compiler (closure modes) and in the developers, plus an optional hyperbolic feasibility prune
(`EU_HYPFEAS`). A palette is a front end.

A Searcher board is the same kind of input written by hand or by the app's editor:

- vertex lines (cyclic words);
- face words, apeirogons included;
- edge types as 180-degree edge corners, with two-corner vertex lines saying which types pair, so bump/bite
  edges are vertex lines like `Eb Eu`;
- colours, required sets and required faces.

So the merge is one search kernel with two compilers in front of it (palette and board) and the developers
behind it.

## The two engines today

**Search rules both engines have:**
- glue whole vertex words;
- face closure with forced closure of faces that have no slack left;
- edge-type matching;
- a k bound, with non-counting two-corner (flat) vertices;
- covering rejection;
- a representative per symmetry orbit;
- orderly generation by replay;
- branching on the face with least slack.

On the regular board the two trees agree within 0.4% (1,247,861 against 1,243,192 internal nodes, the
identical 414,349 closed configurations; `experiments/results/searcher-node-gap-2026-11-06.md`).

| Only in the solver | Only in the Searcher |
|---|---|
| 275 palettes and their compiler (`gen_alphabet.py`, closure modes, `quotientPeriod`, `pruneOverlap`, `lattice`, `maxDensity`) | boards, written by hand or by the app's editor |
| `EU_EDGE_COMPL` (edges match when they differ) as a solver switch | the same through two-corner vertex lines |
| `EU_HYPFEAS` (prunes type sets that cannot close at one hyperbolic edge length) | none |
| `EU_STAR_ROOTS` (roots only at star-bearing types) | required sets, which can say the same |
| the raw output (Conway glue line, face cycles) that every developer reads | Marek's certificates, which the app and `scripts/tilesearch-exact.ts` read |
| forked workers with a dynamic split (IDs collide across workers) | threads with units, resumable runs, merge, checked writes |
| none | colour classes and the colour cut, required faces, apeirogons, chiral and permutation boards |
| none | planner, estimates (`tileestimate`), find mode, the app's progress protocol, the Windows build |

**Cost.** Regular board, k <= 13, one core, instructions end to end:

| Engine | Instructions |
|---|---|
| solver as shipped (`15063414`) | 171.4e9 |
| Searcher rc4.2.1 | 90.6e9 |
| solver with orderly (uncommitted) | 75.5e9 (47.2 search, 28.3 prune) |

The Searcher writes all 200,730 tilings; the solver's run keeps the 103,082 at k = 13 exactly.

## Recommendation: the Searcher's kernel becomes the one engine

- **Front end.** The board format can already express what the solver's search consumes, and palettes are a
  front end. Compiling palettes into boards is a translation of `gen_alphabet.py`'s output, not a new search.
- **Shell.** The Searcher's shell is the larger engine-bound asset: resume, units, merge, threads, planner,
  estimates, checked writes, colours, required sets and the app. Re-building it on the solver's data model
  would be most of the work in the other direction.
- **Import path.** The atlas already imports Searcher output (`scripts/tilesearch-exact.ts`, the regular
  shelf above k = 10).
- **Cost.** Per node the Searcher is about 1.2x behind the solver with orderly. Closing that is the first
  work on the single baseline.

## Unknowns to settle before porting

- **Corners with a mirror twin (found 2026-11-09, the largest one).** The two engines disagree on what
  reflecting a corner means:
  - eu_solver gives a corner class a mirror twin (`CLASS_SIGMA`; on a dihex the two 120-degree corners beside
    the 240-degree one are twins), and reflects a vertex by reversing its word and taking each corner's twin.
  - The Searcher reverses the word only. Marek's corner code (angle number, angle letter, edge byte) has no
    mirror flag.

  Palettes whose classes are their own twins convert as they are and agree (regular, stars, diamond,
  composite-convex at k <= 2). On those with twins nothing tried reproduces eu_solver's counts:

  | dihex, k = 1, 2 | Tilings |
  |---|---|
  | eu_solver | 8, 18 |
  | board as converted | 0, 0 |
  | both orientations as their own lines | 0, 0 |
  | words through the twin map | 0, 0 |
  | one symbol per twin pair | 4, 4 |

  (domino: 15, 131 against at best 11, 44.) Either the Searcher learns twin corners (a twin map on corner
  symbols, applied wherever it reflects a vertex or a face, a kernel change), or the right board encoding
  exists and is not yet understood. `board_of_tables.py` refuses these palettes until it is settled.

- **Compiler-only features.** Whether every compiler feature survives as a board:
  - `quotientPeriod` makes the search a relaxation;
  - the `mixed` closure mode is explicitly not a complete census;
  - the curved half-tile palettes.
- **Edge pairing.** Whether the solver's two-corner non-counting vertices and the Searcher's flat vertices
  count k the same way on every edge-typed palette.
- **`EU_HYPFEAS`.** It has to be ported (it prunes, so the result is the same without it, only slower), or
  shown not to matter.
- **Developers.** Each developer (`eu_develop`, `develop_*.py`) reads the solver's raw format. Either they
  read certificates, or one converter writes the raw format from certificates.

## Plan

1. **Cross-engine check.** Same input to both engines, tiling sets compared by canonical Delaney-Dress
   symbol: `experiments/cross-engine/regular.ts`, case 1 the regular palette (results below). Next cases:
   the palettes that already have a Searcher board (stars, isotoxal, freedraw, mixed), then each palette as
   it is compiled.
2. **Palette compiler.** Have `gen_alphabet.py` emit boards, and check every palette through step 1 (same
   symbols, same counts per k).
3. **Solver-only rules.** Port them into the Searcher: hyperbolic feasibility, and star roots as a required
   set.
4. **Developers.** Feed them from certificates and rebuild one shelf end to end. Its canonical IDs (see
   `2026-11-08-canonical-tiling-ids-design.md`) must come out the same.
5. **Switch over.** Move each atlas build to the Searcher, shelf by shelf, each gated by step 1 and the ID
   checks.
6. **Delete.** Remove `eu_solver.cpp`, `eu_pruner.cpp` and the raw format once no build uses them.

## Cross-engine check, case 1: the regular palette

The shipped regular shelf (Galebach to k = 6, the solver above) against a fresh Searcher rc4.2.1 run of the
regulars board, compared by canonical symbol:

- **k = 1..10:** the same 23,395 symbols on both sides, one per tiling, with no symbol shared by two records
  of one side. So the plain symbol keeps every regular tiling apart.
- **k = 1:** the shelf also has t1002 (4.8.8), the octagon tiling the 12-direction board leaves out by
  design.

Log: `experiments/results/cross-engine-regular-2026-11-08.log`.

## Cross-engine check, case 2: every palette at k <= 2 (2026-11-09)

Script: `experiments/cross-engine/palette.sh`, with each palette's compiled tables turned into a board by
`tools/ctrnact-oracle/alphabets/board_of_tables.py`. Log: `experiments/results/cross-engine-palettes-2026-11-09.log`.

**It found a completeness bug in the Searcher**, present in every version up to rc4.2.1. On hyp-k2 at k = 2 the
solver finds 52,450 tilings and the Searcher 51,131. The Searcher misses every two-orbit tiling by one polygon at
vertices of two degrees:

| Tilings, k = 2 | Census | Solver | Searcher rc4.2.1 | Searcher with the fix |
|---|---|---|---|---|
| hexagons, degrees 5 and 6 | 584 | 584 | 0 | 584 |
| hexagons, degrees 4 and 6 | 273 | 273 | 0 | |
| hexagons, degrees 4 and 5 | 103 | 103 | 0 | |
| squares, degrees 5 and 6 | 103 | 103 | 0 | |
| hexagons, degrees 4, 5 and 6 (one board) | | 960 | 0 | 960 |
| all of hyp-k2 | | 52,450 | 51,131 | 52,450 |

The census counts minimal Delaney-Dress symbols in `DSymGenerator`'s published Delgado-Friedrichs order, extended
to any curvature (`experiments/cross-engine/dsym-census.ts`, log `cross-engine-dsym-census-2026-11-09.log`).

- **Cause.** The Searcher's minimality test seeds its colour refinement with the corner label alone. With one
  label everywhere, the refinement stays one class and every such tiling reads as a covering. The solver run
  with `EU_WL_ONLY=1`, its old seed, also gives 0. The solver fixed this on 2026-08-20 by adding the vertex figure
  to the seed.
- **Second effect.** The stored half-edges are folded by each vertex's rotations, so the structure can't tell a
  degree-5 all-hexagon vertex from a degree-6 one. Two different tilings could therefore even share a key.
- **Fix:** `experiments/searcher-engine/minfix/`.
  - The vertex figure (the type's word, colours read away, up to rotation and reflection) seeds the
    refinement only when the label seed leaves a class that holds two figures.
  - The figure is appended to the canonical form, and `covers_quotient` never merges two figures.
  - Engine mark 5; earlier runs resume on the old rule.
- **Gate.** `gate_mark5.sh`: the 20 bench boards are byte-identical to rc4.2.1. Instructions are +0.5% to
  +2%, about the noise between runs.
- **The overlapping-star palettes had the same cause.** Rerun on the fixed build, hollow-eu-mid, hollow-eu-oct
  and hollow-eu-sq agree with the solver exactly at k <= 2 (1,657,876 tilings at k = 2 on hollow-eu-oct). They
  differed by 20, 81 and 811 on rc4.2.1.
- **Left after the fix:** the mirror-twin palettes, refused by the converter (dihex, domino). Also girih and
  composite-decomp, whose tables predate `CLASS_SIGMA`, so the converter cannot see their twins.
- **Shipped as rc4.2.2** (86ee5faf).
- **The whole sweep on the fixed build**, 275 palettes at k <= 2, 120 s a step:

  | Outcome | Palettes |
  |---|---|
  | same tilings per k | 84 |
  | different: composite-decomp, girih (twin corners the converter cannot see) | 2 |
  | not compared: no edge types on boards yet | 59 |
  | not compared: alphabet compile or solve past 120 s | 61 + 51 |
  | not compared: mirror twins (8), conversion past 120 s (2) | 10 |
  | empty alphabet at k <= 2 | 8 |

  Every palette both engines finished agrees, except the two with twin corners.

### No shelf lost tilings to it

A refinement class fixes the labels met going round its vertex forever. So the bug can drop only a tiling with
two vertex figures that are different powers of one word (u^a and u^b, a != b). On hyp-k2 without its four such
vertex lines, rc4.2.1 and rc4.2.2 write identical files. Where every corner class has one angle and every vertex
turns once round, u^a and u^b would both sum to 360 degrees. That rules the pair out on every Euclidean,
spherical and one-edge-length hyperbolic tiling shelf, decorated or not, and on the parametric families.

- **Solids** can hold the pair (bipyramid: 3.3.3 and 3.3.3.3). Their shelf was rebuilt on eu_solver after its own
  fix of this bug (2026-08-20; re-pruned 2026-08-22).
- **Overlapping tilings** can too. The hollow shelf comes from a separate engine (`tools/hollow`).
- **Boards:** the 296 shipped Searcher boards, every board in the repo and Marek's 94 solver sources list no such
  pair (`experiments/cross-engine/repeated-words.ts`).

Detail: `experiments/results/searcher-shelf-audit-2026-11-09.md`.
