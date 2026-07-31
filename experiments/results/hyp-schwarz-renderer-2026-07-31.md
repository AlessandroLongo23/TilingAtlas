# Finishing the hyperbolic freedraw renderer — the two measurements (2026-07-31, CC)

Roadmap item: *"Finish the hyperbolic freedraw renderer (the fully-drawn Schwarz triangle and others
still missing)"*, from Marek's 2026-07-29 look at `/freedraw?geo=hyperbolic&board=245&hk=3`.

The missing tiling itself was his solver typo, since fixed — `hs245-3-00010` (6 of 6 edge orbits drawn,
two 1-triangle tiles) has been in the shipped shard since commit `ca3168c`. What was left is that the
hyperbolic Schwarz shelf drew through the 2D fallback, which fills only to a ragged sub-pixel rim and
cannot pan without drift.

## 1. Can a scalene board take the per-pixel path at all?

The shelf passed `force2d` on the stated grounds that "the per-pixel reducer rebuilds side pairings from
ONE edge length, which a scalene board does not have." That is not what the code does.
`buildDirichletDomain` takes its side pairings from `HyperbolicDeveloper.deckFrames()`, and the
developer already reads the per-dart turn (`darts.alpha`) and per-dart length (`darts.elen`). The scalar
`edge` entered in exactly one place: the flood-fill connectivity margin `rMaxTile`, the circumradius of
a regular p-gon at that length.

Ran `buildDirichletDomain` on all 27 shipped hyperbolic Schwarz patterns, once with the shortest edge
class (what the shelf passes) and once with the longest:

| board | patterns | certificate | domain | cost |
|---|---|---|---|---|
| (2,3,7) k=3 | 4 | all OK, both ways | 12 sides, R_D 0.545, r_PEu 0.2661 | 5–18 ms |
| (2,4,5) k=3 | 10 | all OK, both ways | 10 sides, R_D 0.627, r_PEu 0.3036 | 3–6 ms |
| (2,4,5) k=4 | 13 | all OK, both ways | 10 sides, R_D 0.627, r_PEu 0.3036 | 3–7 ms |

The domain is identical either way; only the develop instance count moves, which is what the margin
controls. Nothing about a scalene board obstructs the certificate. The real defect was that a Schwarz
record passes `edges[0]`, the *shortest* of three, which understates the margin — so `maxTileRadius()`
now takes the longest class in `darts.elen` when present. The generator count varies with the
decoration (18 or 20 on the same board), not with the board, as it should: the deck group of a
decorated tiling is the board group only when every edge orbit is drawn.

## 2. The pinhole at every vertex, and what fixing it costs

Switching the shelf to the per-pixel path exposed a defect in `prepareEdgeShaderTiling` that is not
Schwarz-specific: each texel's distance to the nearest drawn edge was minimised over the sides of *its
own face*. In the plain field that is right — from inside a convex tile the nearest point of the edge
set is always on that tile's own boundary — but here the drawn edges are a *subset* of the sides, so at
a vertex where a bold run passes straight through, the faces wedged either side have no drawn side of
their own there and the stroke drops out. One white pinhole per such vertex, on every hyperbolic edge
shelf, not just this one.

Fixed by measuring against the face's **vertex star** (every edge incident to one of its vertices), with
a per-edge bounding-box reject and own sides scanned first so the running best is tight before the
foreign edges are reached.

Cost and correctness, against HEAD's own-sides bake, both fed the same patch so only the star varies:

| shelf | records | new vs old | drawn/scaffold texels moved | raised | orbit channel |
|---|---|---|---|---|---|
| schwarz-hyp (2,3,7) k=3 | 4 | 1.17–1.27× | 0–1.2% | 0 | unchanged |
| schwarz-hyp (2,4,5) k=3 | 10 | 1.03× total | 0–24% | 0 | unchanged |
| schwarz-hyp (2,4,5) k=4 | 13 | 1.22× total | 6–25% | 0 | unchanged |
| hyperbolic-edges e37-k2 | 3 | 1.20× | 10–18% | 0 | unchanged |
| hyperbolic-edges e73-k5 | 3 | 1.06× | 3–12% | 0 | unchanged |
| hyperbolic-colors | 9 | 1.14× | **0.00%** | 0 | unchanged |

Two things worth keeping. *Raised is 0 everywhere*: the star can only ever shorten a distance, and it
does — the moved texels drop by up to 254 bytes, which is the pinhole closing. And the colorings move
**nothing at all**, exactly as predicted: in a coloring every edge is drawn, so own-sides was already
the true distance there and the star is provably a no-op. That is the check that the change does what
it claims and only that.

The cost is a wash (0.94–1.33×, inside run-to-run noise) because the bbox reject kills the star for the
texels that are not near a vertex. Without it the star cost 3–5× — measured, and rejected.

### A trap for anyone re-running this

Comparing the star bake against HEAD *without* also feeding HEAD the longest edge class makes ~2% of
(2,3,7) texels look "raised" by 1–5 bytes. That is not the star. The `maxTileRadius` fix enlarges the
bake patch, and a bigger patch hands a boundary texel to a different — equally valid — adjacent face.
Align the two patches and the raised count is 0. Chasing this cost an hour; it also cost a first round
of numbers, because a killed `vitest` worker kept appending to the log and inflated every timing by 3×.
Check `ps aux | grep vitest` before trusting a measurement here.
