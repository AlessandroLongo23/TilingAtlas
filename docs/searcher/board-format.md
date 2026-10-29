# Board files for the unified tiling searcher (draft 1, 2026-10-23)

A board file describes one search: the corners, the faces, the vertices allowed, and the range of k.
The searcher reads it at startup, so a new search is a new text file and never a new build. Every
field below is one of the arguments `find_and_write_tilings` takes today, written as text.

## A complete example

`squares_edges`, as compiled into `pt_squares_edges.exe`:

```
# squares_edges: marked edges on the square grid, as digons
name    squares_edges
k       1 7

angle   A2
angle   A4   90

face    A2 x 2
face    A4 x 4

vertex  A4 A4 A4 A4
vertex  A2 A4 A2 A4 A4 A4
vertex  A2 A4 A4 A2 A4 A4
vertex  A2 A4 A2 A4 A2 A4 A4
vertex  A2 A4 A2 A4 A2 A4 A2 A4

permutations  no
```

`hybrid_2_9830`, with permutations on, so each vertex line is a multiset:

```
name    hybrid_2_9830
k       1 4

angle   A3
angle   A4
angle   A30

face    A3  x 3
face    A4  x 4
face    A30 x 24

vertex  A3 A3 A3 A3 A3 A4 A30 A30 A30 A30
vertex  A3 A3 A3 A3 A3 A3 A4 A4 A4 A4 A4 A4

permutations  yes
```

## Syntax

One statement per line. Tokens are separated by spaces or tabs. `#` starts a comment that runs to the
end of the line. Blank lines are ignored. Keywords are lower case; symbols are case-sensitive.

A symbol is any token that is not a keyword, not `x`, and contains no `#`. `A4`, `S3`, `Loo`, `a`,
`t60` and `dent` are all symbols. The labels the solvers use today keep their meaning and print as
before: `Pi` is the 180° corner, and an optional letter from `SMLABCDEFG` followed by a number or `oo`
(`A4`, `M5`, `Loo`, `12`) is the label your `encode_corner` builds from them. Any other symbol prints as
`X1`, `X2`, ... in certificates, and `symbols.txt` in the output folder maps those back. Two symbols
that encode to the same label are refused; a bare `oo` and `Pi` are both 0, for instance.

## Statements

| statement | required | meaning |
|---|---|---|
| `name <text>` | yes | names the output folder and files |
| `k <kmin> <kmax>` | yes | range of k, the number of vertex orbits where three or more faces meet (face orbits in a face-first search); see below |
| `angle <symbol> [value]` | yes, one per symbol | declares a corner; the value is optional |
| `edge <symbol> [length <L>] [drawn\|hidden\|bump\|bite]` | no | declares an edge type: a 180° corner at the middle of every side of that type |
| `face <symbols...> x <m>` | yes | a face: the symbols in cyclic order, repeated m times |
| `vertex <symbols...>` | yes | an allowed vertex: its corners in cyclic order |
| `permutations yes\|no` | no, default `no` | expand each vertex line to all its distinct cyclic orders |
| `initial <vertices>` | no, default `all` | output only tilings that use at least one of these vertices |
| `require <vertices>` | no, any number up to 16 | output only tilings that use at least one of these vertices, for every such line |
| `require face <corners> [x m] [\| face …]` | no, any number | output only tilings that hold at least one of these faces, for every such line |
| `colors labeled\|unlabeled` | no, default `unlabeled` | on a coloured board (`A4@B` corners): whether tilings that differ only by permuting colours count once |
| `search vertices\|faces` | no, default `vertices` | vertex-first or face-first |
| `geometry none\|euclidean\|spherical\|hyperbolic` | no, default `none` | optional realisability check after the search |

### k

k counts the vertex orbits where at least three faces meet, the atlas's rule. A vertex of two corners is
not counted: `Pi Pi`, a point along a straight side (the midpoints of `B4 Pi x 4`, so the grid of those
squares is 1-uniform), or a corner filling a notch (`90` against `270`). The search keeps such vertices
on a budget of their own, large enough to lose no tiling up to `kmax` (`flat_budget` in tilesearch.cpp
says why), and file names, `census.txt` and the progress lines all report k without them. A
certificate's "Number of vertices" line still counts every orbit it lists.

### angle

`angle A4` declares a symbol with no value; the search never needs one. `angle A4 90` gives it a value
in degrees, which only a geometry check reads. A value can be a fraction of degrees (`360/7`) so that
angles of odd polygons stay exact, or `free` for a corner whose angle a geometry check should solve for
(the points of a hyperbolic star). Using a symbol that has no `angle` line is an error, which catches
typos.

### edge

`edge Ed drawn` declares an edge type. Its symbol is a 180° corner that sits at the middle of every side
of that type, so a square with one drawn side is `face A4 Ed A4 Eu A4 Eu A4 Eu`. Two sides glue where
their middle corners meet, which makes the gluing rule a vertex line: `vertex Ed Ed` and `vertex Eu Eu`
glue like to like (edge patterns, and edge lengths), `vertex EB EI` glues a bump to a bite (bubble tiles).
A vertex of two corners does not count toward k (see k), so the middles add nothing to k.

A vertex line made of plain corners (`vertex A4 A4 A4 A4`) cannot see the types of its sides. To rule on
the pattern round a vertex (no loose ends: never exactly one drawn side), name each corner with the types
of its two sides, sorted: `A4.Ed.Eu`. The square with one drawn side is then
`face A4.Ed.Eu Ed A4.Ed.Eu Eu A4.Eu.Eu Eu A4.Eu.Eu Eu`, each vertex line spells out its edge pattern, and
leaving a pattern's line out forbids it. Quick setup's edge-type presets write boards this way.

To the search an edge line is the same as `angle <symbol> 180`. The rest is for drawing: `length` is the
side's length (a number, `3/2`, `sqrt(2)`, `2sqrt(3)`; 1 when absent), and the style says how the side is
drawn. A hidden side is not drawn and the faces either side of it merge into one tile; a bump bulges out
of its face into the bite of the face it glues to. Checked against the atlas engine's edge types
(`experiments/results/tilesearch-edge-types-2026-10-29.log`): the square grid with drawn and hidden
sides 18 / 271 / 2,754 / 21,967, bubble squares 11 / 102, and 45-45-90 triangles with squares by length
16 / 161 / 1,132.

### face

`face a b c x 2` is the face whose corners, read round it, are `a b c a b c`. `x 1` may be omitted.
`x inf` makes an apeirogon: the word `a b c` repeats forever along it. A digon is `face A2 x 2`, which
is how marked edges are written today, and that stays the encoding.

A face and its mirror image are the same face, so `a b c` also allows `c b a`. The same symbol may
appear in more than one face; a corner with that symbol may then belong to any of them.

### vertex

`vertex a b c d` lists the corners met going round a vertex. Rotations and the mirror image of the
word are the same vertex, so the order in which a word starts does not matter. With `permutations yes`
every vertex line is read as a multiset and expanded to all its distinct cyclic orders, the same
expansion the engine does today when its flag is set.

Vertices are numbered 1, 2, 3, ... in the order of their lines. The number is how `initial` refers
to them. With `permutations yes`, number n means every order produced from line n.

### initial

`initial` describes the output, not the search order: `initial 1 3` outputs exactly the tilings in
which vertex 1 or vertex 3 occurs.

Today's "first n vertices as initials" is `initial 1 2 ... n`, and it means the same thing: a run that
seeds only from the first n and never adds a lower-numbered vertex finds exactly the tilings containing
one of those n. The searcher puts the listed vertices first internally, so `initial 3 7` is just as
exact. The trap this avoids: seeding from vertices 3 and 7 while keeping the original numbering finds
only the tilings whose lowest-numbered vertex is 3 or 7, and loses every tiling that also contains
vertex 1 or 2.

### colours

A colouring is a board whose faces of one shape carry different letters. Quick setup's Colorings mode
names a corner with its face's colour, `A4@B` (corner A4 of a colour-B face), so each vertex line spells
the colours round it. Leaving a vertex out forbids that colour pattern: no vertex with two neighbouring
corners of one colour is exactly a proper colouring. Colours are labelled (all-A and all-B are two
tilings), as on the atlas's Colors shelf, only with `colors labeled`. By default (`colors unlabeled`)
tilings that differ only by permuting the colours count once, on top of translations, rotations and
mirrors: of each class the engine writes the tiling whose canonical form is least over the recolourings
that map the board onto itself (faces, vertices, initial and required sets). Checked against the Colors
shelf's own records grouped independently: squares with two colours 5 / 30 / 166 (labeled 8 / 53 / 309),
with three colours, all used, 3 / 58 (labeled 9 / 285).

### require

`require 3 7 9` is a vertex set: every tiling found holds one of those vertices, and every `require` line
must be met. The search prunes on it (a partial tiling stops once the vertex orbits it has left cannot
hold the sets it still misses), so a targeted search is faster too.

`require face A6.EB.EB EB A6.EB.EI EI … | face …` asks for a face: every tiling found holds one of the
faces listed, each written as on a face line and read up to turning and mirroring. A vertex set cannot
say this when faces share their corners: the 13 bubble hexagons all have corner `A6` (or share their
typed corners), so the vertices holding one of them hold all of them, and requiring "this hexagon" by
vertices required nothing. A face line is checked on each finished tiling, before it is written, so it
is exact; it does not prune the search. Checked: one line per shape (every variant listed) on bubble
triangles, squares and hexagons gives 6 / 123 / 1,436 at k ≤ 3, the same as the vertex sets that say
the same thing, and one hexagon alone gives 5 / 78 / 398, the same as filtering the unrestricted run by
its faces. A face orbit holds at least one corner orbit, so k vertex orbits of c corners hold at most
c·k face orbits: thirteen hexagon variants with three corners a vertex need k ≥ 5.

### search

`search faces` runs the same board face-first: k counts face orbits and the certificates describe
faces. Internally it is the vertex-first search on the dual board, so a face-first board cannot contain
an `x inf` face (its dual would be a vertex of infinite degree). Not built yet: the searcher refuses
`search faces` for now.

### geometry

`none` is today's behaviour: a purely combinatorial search, and every corner symbol may be valueless.
The other values run a check after the search and report, per tiling, whether it is realisable in that
geometry with the given angles (solving for any `free` angle). A failed check marks a tiling and never
deletes it. Every angle must have a value, or be `free`, when a geometry is named. Not built yet: the searcher
refuses any value but `none` for now.

## Running

```
tilesearch board.txt [--k <kmin> <kmax>] [--threads <n>] [--nice <n>] [--resume] [--gzip]
```

`--k` overrides the board's range for one run. Threads never change the result, so they live on the
command line and not in the board. `--nice 10` runs the search at low priority. `--gzip` writes the
certificate files as `.txt.gz`, about 14 times smaller at no measurable cost in time; `zcat` reads them.

A stopped run continues with `--resume` in the same folder. The search is split by root vertex (the
first vertex placed; a tiling is found only under its lowest-numbered vertex type), and the output of
a root reaches the certificate files only when that root has finished. A stop therefore loses at most
the roots that were running, and `--resume` runs exactly those again. The board must not change
between the two runs.

## Output

The searcher creates the folder `solver_<name>/` itself; a missing folder is no longer a silent empty
run. The certificate files keep today's format and file names, so existing readers keep working. Two
files are added next to them:

- `board.txt`: the board exactly as run, after `--k` is applied.
- `census.txt`: one line `k=<k> -- <count>` per k, then `MAX` when the run finished.
- `symbols.txt`: how each symbol that does not print as itself appears in the certificates.

`board.txt` has comments and blank lines removed and runs of spaces collapsed; line order is kept,
because vertex numbers depend on it. Its SHA-256 identifies the search. The atlas links every tiling to
that hash, so anyone can rerun the search that found it.

The output folder must be empty or absent, unless `--resume` is given; a run never mixes its files with
an earlier run's. While a run is unfinished the folder also holds `roots.done` (the finished roots
and their counts) and, for a moment after each root, `merge.pending`.

## Not in this draft

- Deriving the vertex lines from angle values (all words whose angles sum to 360°, or to less or more
  for the other geometries). This is how the atlas palettes work today and the natural next step, but a
  board with explicit vertex lines covers every search run so far.
- (Edge types now have the `edge` line above.) Corner symbols that do not count toward k (the 180° corners of
  subdivided tiles).

## Questions for Marek

Answered by the source (`planar_tilings.zip`, 2026-10-23):

- The third list passed to `find_and_write_tilings` holds the apeirogons, so `face ... x inf` maps onto
  it directly.
- An apeirogon face closes in the quotient when its cycle length is a multiple of the word length
  (`cyclic_word_lookuptable::find_quotient`, where an infinite word has size 0). That is the rule this
  spec assumes.
- `tiling_search::set_specifications` already implements `must_contain_one_of_these` by moving those
  vertices to the front, which is how `initial` is defined above.

Still open:

1. Faces and vertices are read up to reflection. Is there any search where a face or vertex must not
   be mirrored (a chiral board)?
2. With `k` starting above 1, both engines assume a state that covers a smaller quotient reappears at
   lower k. Do you have an argument for that, or a run that tests it?
3. In `main_A12.cpp` and `main_A25.cpp`, `Soo = encode_corner(0, 0, 0)` is 0, the same code as
   `PI_ANGLE`, so the apeirogon corner and the 180° corner are one label; and `S3` is
   `encode_corner(4, 0, 0)`. Slips, or intended? (Also, `main_123_2_4161`, `main_B2` and `main_C1` do
   not compile as shipped.)
4. May we publish the source with the searcher, and under which license? The 2021 repository was MIT;
   this zip carries no license file.
