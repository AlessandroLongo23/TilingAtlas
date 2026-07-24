# Three colors: decoding Marek's 3-colorings of all three grids (2026-07-24)

Hours after the 2-color decode shipped, Marek sent `3colors.zip`: three solvers
(`pt_squares_3_colors`, `pt_triangles_3_colors`, `pt_triangles+squares_3_colors`) and their complete
output. This note records the decode, the one structural surprise in the corpus, and what shipped.
Raw run logs: `colors3-decode-2026-07-24.log` (squares), `colors3-decode-tri-2026-07-24.log`,
`colors3-decode-ts-2026-07-24.log`.

## The corpus re-embeds the 2-color one, and says so in the file names

The file-name token names the tiles used, so the k=1 squares slice reads `A4B4C4`, `A4B4`, `A4C4`,
`B4C4`, `A4`, `B4`, `C4`. Only the first is new: the pair files are the 2-colorings of the square
grid under two of the three letters, and they reproduce the shipped catalogue's counts exactly.

| k | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| `A4B4` (main + `_o_`) | 6 + 2 mono | 51 + 2 | 297 + 12 | 1245 + 47 |
| shipped `squares-2` | 8 | 53 | 309 | 1292 |

Same on triangles (9 / 54 / 556 / 2002, matched). That is a second, independent solver run agreeing
with the first — not a proof of completeness, but the first external check the colored class has had.

So the 3-color catalogues ship the SURJECTIVE solutions only (`--surjective`): the ones using all
three colors. Everything else is already on the shelf as a 2-coloring, and shipping it again would
put each 2-coloring in the atlas three more times (once per pair of letters).

| grid | k=1 | 2 | 3 | 4 | shipped | of blocks |
|---|---|---|---|---|---|---|
| square | 9 | 285 | 3868 | 39549 | 43,711 | 48,694 |
| triangle | 9 | 145 | 6449 | 47028 | 53,631 | 61,491 |
| tri + square | 21 | 814 | 17214 | — | 18,049 | 24,349 |

All 134,534 blocks develop cleanly: 0 failures, 0 disagreeing table variants, 0 cell-color conflicts,
and developed orbit count = certificate k = filename k on every one.

## Conventions: unchanged, re-measured

The four-quotient experiment ran again with the color swap generalized to all of S₃:

| convention | square dups | triangle dups |
|---|---|---|
| rotations | 0 | 0 |
| + mirrors | 0 | 0 |
| + relabel (S₃) | 40,202 | 47,183 |
| + mirrors + relabel | 40,264 | 50,746 |

Same verdict as at 2 colors, now with a wider group: **mirror pairs merge, colors stay labeled**.
Folding relabelings would collapse ~83% of the corpus, so Marek plainly does not. The `_o_` split is
chirality again — 393/393 chiral in the square o-files, 22,873/22,873 on triangles, 0 chiral blocks
anywhere in the main files. The atlas dedup folded nothing on either grid (43,711 and 53,631
distinct), so his dedup and ours agree solution for solution.

## Decoder

`develop_colors.py` took a `--colors n` axis rather than a fork. The letter IS the color index
(`A`=0, `B`=1, `C`=2), so the changes were: alphabets registered per color count (`colors3sq` =
`{A4, B4, C4}`), the binary `1 - c` swap replaced by S_n permutations, `--surjective`, and a
`colors` field on the emitted records. Nothing in the parser, tables, develop or patch quotient
moved — the alphabet was always data. Ceiling is `MAX_COLORS = 4`, so a 4-color drop needs no edit.

## Shipped

`public/colors/{squares,tri,ts}-3-k*.json`, ids `col3-`/`colt3-`/`colts3-`. The class now spans grid
× palette size on all three surfaces: the /colors wall gained a Colors group, /library a Colors facet
(`cocount=`) beside the Grid one, and the /play tree splits "Square grid, 3 colors" from "Square
grid, 2 colors" (`subOf` returns `grid-colors`). The palette control grows a picker per color of the
selected tiling, with a swap between each adjacent pair; the shipped third color is terracotta
(hue 15), picked to stay distinct from the blue under red-green color blindness where a green would
not.

**Size flag.** These add 48.2 MB (`squares-3-k4` 10.2, `tri-3-k4` 14.5, `ts-3-k3` 20.0), taking
`public/colors` to 97 MB and 226,337 colorings. Every file is a single fetch on the page that needs
it, so the browser cost is per-slice, not 97 MB — but the repo cost is real, and one more color or
one more k would double it. Before a 4-color drop lands, this wants either gzipped assets or a
chunked fetch.

## Open

- The certification stays "candidate": the 3-color run agreeing with the 2-color one is the same
  engine twice, not an independent enumeration. The standing offer of a real check is still our own
  `tools/ctrnact-oracle` with a two-squares palette — if it reproduces 8 / 53 / 309 / 1292, the class
  gets an independent count and 3 colors becomes a palette edit there too.
- Marek's ts run stops at k=3 and the cell grids at k=4; the counts are climbing ~8× per k, so k=5
  on squares is plausibly ~300k solutions — past what shipping raw JSON can carry.
