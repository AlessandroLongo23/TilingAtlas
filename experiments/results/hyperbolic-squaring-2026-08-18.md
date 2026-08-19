# Squaring a hyperbolic tiling (2026-08-18)

AL asked whether the Brooks-Smith-Stone-Tutte construction leads anywhere when the input
is hyperbolic. It splits into two questions with different answers. Scripts:
`experiments/hyperbolic-squaring/`.

## 1. The infinite tiling itself -> a square tiling of a CYLINDER

Benjamini and Schramm, *Random walks and harmonic functions on infinite planar graphs
using square tilings*, Ann. Probab. 24 (1996) 1219-1238: every transient bounded-degree
planar graph has a square tiling of a cylinder, and for many graphs the geometric
boundary is a circle. Georgakopoulos (Invent. Math. 2016) then identified that boundary
with the Poisson boundary of the random walk.

Built here: the ball of radius r in the 7-regular hyperbolic triangulation {3,7}, with
its boundary wired to one sink and the centre as source. Exact rational solve.

| r | V | E | F | squares | I (circumference) | Sigma i^2 | I*H | overlaps mod I |
|---|---|---|---|---------|-------------------|-----------|-----|----------------|
| 1 | 9 | 21 | 14 | 14 | 7/2 | 7/2 | 7/2 | 0 |
| 2 | 30 | 84 | 56 | 70 | 22/5 | 22/5 | 22/5 | 0 |
| 3 | 86 | 252 | 168 | 238 | 8117/1717 | 8117/1717 | 8117/1717 | 0 |

Two certificates, both exact:

- **Energy.** `Sigma i^2 = I*H`. Dissipated power equals current times potential drop.
- **The cylinder itself.** psi is a potential on faces with `psi(right) - psi(left) = i`.
  A dual loop that encircles the source picks up the TOTAL current, so psi is
  single-valued only modulo I. Measured: every dual-loop discrepancy is exactly 0 or
  +/- I, never anything else. That is what makes it a cylinder rather than a rectangle.

## 2. Transience is what makes the cylinder non-degenerate

Effective conductance from the centre to a wired boundary at radius r. It converges to a
positive limit iff the walk escapes to infinity, and that limit IS the circumference.

| r | {3,7} hyperbolic | V | {3,6} Euclidean | V |
|---|------------------|---|-----------------|---|
| 1 | 3.500000 | 9 | 3.000000 | 8 |
| 2 | 4.400000 | 30 | 3.257143 | 20 |
| 3 | 4.727432 | 86 | 3.170213 | 38 |
| 4 | 4.859338 | 233 | 3.051958 | 62 |
| 5 | 4.911808 | 618 | 2.943940 | 92 |
| 6 | (too big) | - | 2.850717 | 128 |

{3,7} climbs to about 4.93 and settles: transient, so the cylinder has a real
circumference and the square tiling has a boundary circle. {3,6} turns over and decays:
recurrent, so the cylinder degenerates. CAVEAT: recurrence decays like 1/log r, so six
layers is consistent with the theory, not a demonstration of it.

## 3. A finite quotient (closed hyperbolic surface) -> genus >= 2

A closed hyperbolic surface has genus >= 2, so "a hyperbolic tiling, quotiented" means a
map with chi < 0. Chien's Theorem 3.3.1 covers every g >= 1, so the construction still
runs — but the output is a square-tiled flat CONE metric, a translation surface, and NOT
a plane tiling. Gauss-Bonnet forces it: cone angles are 2*pi*k, and
`sum(2*pi - angle) = 2*pi*chi` gives `sum(k_i - 1) = 2g - 2 > 0`. Genus 1 was the last
case where the answer was a picture in the plane.

The repo has no finite quotients of hyperbolic tilings — the hyperbolic shelves are
patches in the Poincare disk, and their `renderCell` is a placeholder `[[1,0],[0,1]]`.
But it does ship 25 higher-genus maps already: the star polyhedra whose face rings close
up on a surface of genus 3, 4, 5 or 9. Measured on all of them, computing the nullity of
the raw closed + co-closed conditions with no genus assumed anywhere:

| genus | records | chi | dim H^1 measured | expected 2g |
|-------|---------|-----|------------------|-------------|
| 3 | 3 | -4 | 6 | 6 |
| 4 | 9 | -6 | 8 | 8 |
| 5 | 6 | -8 | 10 | 10 |
| 9 | 7 | -16 | 18 | 18 |

25 of 25 agree. So the space of choices grows from the sphere's one-per-edge-orbit, to
the torus's circle, to a (2g-1)-dimensional projective family.

## Verdict for the Atlas

Question 1 is buildable and question 2 is not, yet. The cylinder reuses the existing
planar machinery almost unchanged, produces a picture, and makes the hyperbolic/Euclidean
divide visible as a number that converges or does not. Question 2 needs gluing-instruction
output instead of coordinates, plus a corpus of regular maps (Klein quartic and friends)
that does not exist in the repo.

Neither is new mathematics. The 7-regular picture appears in Hutchcroft-Peres,
*Boundaries of planar graphs: a unified approach* (EJP 2017). The contribution would be
the catalogue over the atlas's 28,453 hyperbolic records, and that needs the ball
generator extended past {3,q}.
