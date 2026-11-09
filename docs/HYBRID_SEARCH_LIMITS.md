# Hyperbolic hybrid studies: what "complete" means

Every completeness statement about the hyperbolic hybrid studies (the Tiling Searcher's
`results/hyperbolic/tilings/`, and anything shipped from them) holds within the limits below and no further.
Cite this file. The limits were set by the face audit of 2026-11-05 (`experiments/hybrid-exact/audit_faces.py`,
results in `experiments/results/hybrid-exact/audit-faces*.jsonl`).

## An edge

An edge is a length s at which some combination of regular polygons and apeirogons, with sides that are whole
multiples of s, closes a vertex. The edges come from Marek Čtrnáct's annotated output (5,258 edges, every vertex
line re-solved and certified exactly in phase 3a). Each study board records its edge and the minimal polynomial
of cosh s over the rationals in a `# minpoly <s> <polynomial in x = cosh s>` line (one per edge in a family).

## Faces: which tiles can occur at s

A tile is a regular n-gon or an apeirogon whose sides are k edges (n-gon `A<n>` for k = 1, `B<n>` for k = 2, …;
`∞` for an apeirogon). A tile can occur at s only if its angle lies in the rational span of pi and the angles of
tiles already known there. The audit tests every tile with

- n = 3 … 200, and apeirogons;
- k = 1 … K, with K = min(200, max(50, ⌊20/s⌋ + 1)): sides at least 20 long (K·s ≥ 20) at every edge with
  s ≥ 0.1, which takes in all 377 study edges; below s = 0.1, sides to 200·s;
- an integer relation of coefficients below 10⁴ (LLL at 40 digits, confirmed to 10⁻¹⁶⁰ at 200 digits).

Known tiles: Marek's at the edge, and those of every vertex certified at it. New tiles are tested one at a time.

**Not covered:** a tile past those n and k; a relation with a coefficient of 10⁴ or more; two new tiles that
close a vertex only together, neither in the span alone. On the 377 study edges nothing joined past n = 100 and
k = 25, the box of the earlier search; the largest k found anywhere is 21 (an apeirogon at 0.8314429). On the
4,878 other annotated edges (the face audit of 2026-11-05) apeirogons joined past k = 25 on 551 edges, up to
k = 106; with no letter left after Y they are written `[0,k]` (`hyb.label`).

## Vertices: which combinations close at s

Every multiset of the tiles whose angles add up to 2π, found exactly: each angle gets rational coordinates in a
basis of their span (LLL at 200 digits, relations of coefficients below 10⁶, each verified to 10⁻¹⁶⁰), and the
combinations are enumerated in those coordinates. At most 120 polygons a vertex, except where the smallest
angle allows more: those 11 study edges were enumerated again to their angle bound, and nothing was added. Every
vertex is certified exactly: Marek's in phase 3a, the others as affine combinations of certified ones or in the
number field of the edge (`exact.py`).

## Boards

`board.py` adds the points on long sides (every multiset of at most 120 corners adding up to π, found as the
vertices are and each checked to 10⁻⁴⁰, and `Pi Pi`), leaves out the combinations no cyclic order of corners
can realise (`usable`: a shorter side's end must sit in a 180° multiset), and the board leaves out every face no
remaining line holds: such a face is in no tiling. Until 2026-11-05 the π multisets came from a float search
with no corner bound; on the 377 study edges and 2,510 of the others the two give the same boards line for
line, and the float search never finished on edges with corners under a degree.

## Rows

Every non-empty set of the optional faces is a row. The Searcher refuses studies past 10,000 rows, so a study
of 14 faces is split in two: rows of 1 to 7 faces and rows of 8 to 14 (`subsets`). A row is ruled out before
any search only by checks that hold for every k.

## Searches

A row's outcome holds within its study's options (`study.json`): k from 1 to 5, k raised one at a time until a
tiling is found, each search under its time limit. A row that stopped at a limit says so. "No tiling" means
none up to k = 5; only a row ruled out before the search is a proof of absence at every k.

## Vertex lines with too many orders

The engine lists every cyclic order of every vertex line (`permutations yes`) before it checks or searches a
row. Until 2026-11-05 the Searcher gave that check 120 s and counted a row whose check failed as settled, so
studies showed "done" with rows never searched. Since then (`app/electron/studies.ts`) the check has an hour;
a row whose lines have more than 5·10⁵ orders (`MAX_ORDERS`, app/src/study.ts) is not handed to the engine and
says so; a study with such a row is paused, not done; and Resume checks failed rows again.

On 2026-11-05, 24 rows had never been searched (`experiments/results/hybrid-exact/failed-rows-2026-11-05.json`):

- 9 rows with 2.6·10⁴ to 1.4·10⁵ orders (1.6446509, 2.0231901, 2.212766 twice, 3.079392, 1.0870701 four
  times) are within reach: run alone, each check took 1 to 12 minutes on a busy machine. Resume searches them.
- 15 rows with 5.8·10⁵ to 2·10²⁸ orders (3.6080407, 3.7026705, 3.7460033, 3.9639405, 4.516565 three times,
  4.7138774 three times, 2.4693138 twice, and A3,A3n,A5n at n = 8, the edge 7.2733788, three times: a line of
  40 triangles and 40 24-gons there) are past the engine. **Not covered:** these rows, until the engine builds
  orders as it goes. They are not empty: the uniform tilings (3.24)⁴⁰ and (24.40)³⁰ (Wythoff 40 | 3 24 and
  30 | 24 40) lie in two of them.
