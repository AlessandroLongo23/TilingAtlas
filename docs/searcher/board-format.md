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
| `k <kmin> <kmax>` | yes | range of k, the number of vertex orbits (face orbits in a face-first search) |
| `angle <symbol> [value]` | yes, one per symbol | declares a corner; the value is optional |
| `face <symbols...> x <m>` | yes | a face: the symbols in cyclic order, repeated m times |
| `vertex <symbols...>` | yes | an allowed vertex: its corners in cyclic order |
| `permutations yes\|no` | no, default `no` | expand each vertex line to all its distinct cyclic orders |
| `initial <vertices>` | no, default `all` | output only tilings that use at least one of these vertices |
| `search vertices\|faces` | no, default `vertices` | vertex-first or face-first |
| `geometry none\|euclidean\|spherical\|hyperbolic` | no, default `none` | optional realisability check after the search |

### angle

`angle A4` declares a symbol with no value; the search never needs one. `angle A4 90` gives it a value
in degrees, which only a geometry check reads. A value can be a fraction of degrees (`360/7`) so that
angles of odd polygons stay exact, or `free` for a corner whose angle a geometry check should solve for
(the points of a hyperbolic star). Using a symbol that has no `angle` line is an error, which catches
typos.

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
tilesearch board.txt [--k <kmin> <kmax>] [--threads <n>] [--nice <n>] [--resume]
```

`--k` overrides the board's range for one run. Threads never change the result, so they live on the
command line and not in the board. `--nice 10` runs the search at low priority.

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
- Edge types other than digons, and corner symbols that do not count toward k (the 180° corners of
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
