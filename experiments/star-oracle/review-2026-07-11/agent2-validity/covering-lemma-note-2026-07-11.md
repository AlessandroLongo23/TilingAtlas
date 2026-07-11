# The covering-degree lemma: from machine certificates to an embedded tiling

Note for TA, 2026-07-11 (CC). This is the one paper-argument step in the validity
certification of the candidate star tilings (E1..E4 from `run-star-k2b6/extras4.txt`
and the a=3 sibling A3). Everything upstream is machine-checked in exact arithmetic:
`verify_star_extras.py` (torus complex, cone angles, ring-element area identity) and
`verify_star_extras_exact.py` (certified-sign simplicity and orientation, 2026-07-11,
zero float in any decision). This note states the lemma whose hypotheses are exactly
those certificates, proves it, and flags the single input that remains topology
rather than machine-checked arithmetic.

## Certified data and hypotheses

The development produces faces `F_1, ..., F_m` in the plane, each given by its cyclic
vertex list with coordinates in `Z[zeta_24]` (exact integer 8-tuples), and a period
lattice `Lambda = Z T_1 + Z T_2` with `T_1, T_2` in `Z[zeta_24]` and
`det = Im(conj(T_1) T_2) != 0` (sign certified). Working modulo `Lambda`, the faces
form a finite polygonal cell complex on the flat torus `T^2 = R^2 / Lambda`. The
machine certifies, with every decisive comparison exact:

- (H1) **Simplicity.** Each `F_i` is a simple closed polygon: vertices pairwise
  distinct, adjacent edges meet exactly in their shared vertex, non-adjacent edges
  are disjoint. (Exact orientation/on-segment predicates on ring elements;
  `verify_star_extras_exact.py`.)
- (H2) **Consistent orientation.** The signed area of every `F_i` has the same
  certified nonzero sign. (Same file.)
- (H3) **Closed complex.** Modulo `Lambda`, every geometric edge lies in exactly two
  face boundaries, traversed in opposite directions, and `V - E + F = 0`. (Integer
  checks; `verify_star_extras.py`.)
- (H4) **Cone angle `2 pi`.** At every vertex modulo `Lambda`, the interior angles of
  the incident face corners, accumulated by the vertex-star walk *without* modular
  reduction, sum to exactly 24 units, i.e. `2 pi`. (Integer check; the unreduced
  accumulation is what rules out total angle `4 pi`, `6 pi`, ..., which reduction
  mod 24 could not distinguish from `2 pi`.)
- (H5) **Area identity.** `sum_i area(F_i) = |det| = area(T^2)` as an exact identity
  in `Q(sqrt2, sqrt3)`, each face area positive in the common orientation, and both
  occurring signs certified. (Ring-element version in `verify_star_extras.py`;
  certified-sign version in `verify_star_extras_exact.py`.)

Glued edges carry identical endpoint positions as exact ring elements modulo
`Lambda`, because the complex is read off a single developed placement; this is part
of the construction, not a separate check.

## Lemma

Assume (H1)-(H5). Let `S` be the space obtained from the disjoint union of the
closed faces `F_i` by gluing along the edge pairing of (H3), and let
`Phi : S -> T^2` be the map induced by the planar positions of the faces. Then `Phi`
is an isometric homeomorphism. Consequently the `Lambda`-translates of `F_1, ..., F_m`
tile the plane edge-to-edge with disjoint interiors, and the developed object is a
genuine periodic tiling with period lattice containing `Lambda`.

## Proof

**Step 0: each face is an embedded closed disk.** By (H1) the boundary walk of `F_i`
is a simple closed polygon; by the polygonal Jordan curve theorem it bounds a closed
disk embedded in `R^2`. This is an elementary PL fact with constructive proofs
(e.g. C. Thomassen, "The Jordan-Schoenflies theorem and the classification of
surfaces", Amer. Math. Monthly 99 (1992), 116-130, which handles the polygonal case
first). Convexity is never used; the star faces are nonconvex.

**Step 1: `S` is a closed oriented surface and `Phi` is well defined.** Gluing
finitely many closed disks along a complete pairing of boundary edges yields a
compact surface without boundary; pairing with opposite boundary orientations, given
(H2), makes it oriented. This is the classical polygon-gluing construction (W. S.
Massey, *Algebraic Topology: An Introduction*, Springer GTM 56, 1977, ch. 1; A.
Hatcher, *Algebraic Topology*, CUP 2002, sec. 1.2 for the CW description). Since
paired edges have exactly equal positions mod `Lambda`, the face embeddings descend
to a continuous `Phi : S -> T^2` that is isometric on each closed face. By (H3),
`chi(S) = V - E + F = 0`, so `S` is a torus, though the proof below only needs
compactness.

**Step 2: `Phi` is a local isometry.** Three cases.

*Face interiors:* `Phi` restricts to the planar embedding of Step 0.

*Edge interiors:* by (H3) exactly two faces meet along the edge, inducing opposite
directions on it. For a simple polygon, the interior lies locally to a fixed side of
each directed boundary edge, the same side for all edges once the signed-area sign
is fixed (Jordan again, plus (H2)). Opposite traversal directions and equal
signed-area signs therefore put the two face germs on opposite sides of the edge, so
a neighborhood of an interior edge point in `S` (two half-disks glued along their
diameters) maps isometrically onto a disk in `T^2`.

*Vertices:* a neighborhood of a vertex `v` in `S` is the cyclic fan of incident
corners (the link is a circle because `S` is a surface, Step 1, and the vertex-star
walk certifies the cyclic order with consecutive corners sharing an edge and
matching positions). The corner angles are laid out consecutively around `Phi(v)`
and by (H4) sum to exactly `2 pi`, so the fan wraps around `Phi(v)` exactly once:
the neighborhood maps isometrically onto a disk. Total angle `2 pi k` with `k >= 2`
would instead produce a `k`-fold branch point here; this is precisely what (H4)
excludes, and why the angle sum is accumulated unreduced. In the language of flat
cone metrics: `S` carries a flat metric whose only candidate singularities are cone
points at vertices, and cone angle `2 pi` means the point is smooth (M. Troyanov,
"Les surfaces euclidiennes a singularites coniques", L'Enseignement Math. 32 (1986),
79-94).

**Step 3: `Phi` is a covering map.** `S` is compact (a finite union of closed
faces); `T^2` is connected, Hausdorff, locally compact. A continuous map from a
compact space to a Hausdorff space is closed and proper, and a proper local
homeomorphism onto a connected, locally compact Hausdorff space is a covering map
(J. M. Lee, *Introduction to Topological Manifolds*, 2nd ed., Springer GTM 202,
2011, ch. 11 on covering maps). The Riemannian formulation says the same thing: `S`
compact is complete, and a local isometry from a complete Riemannian manifold onto a
connected manifold is a Riemannian covering (S. Kobayashi and K. Nomizu,
*Foundations of Differential Geometry* I, Wiley 1963, Thm. IV.4.6; M. do Carmo,
*Riemannian Geometry*, Birkhauser 1992, ch. 7). The metric-geometry version, which
also covers surfaces with genuine cone points, is in D. Burago, Y. Burago, S.
Ivanov, *A Course in Metric Geometry*, AMS GSM 33, 2001, sec. 3.4; with (H4) there
are no cone points and the smooth statement suffices.

⚑ **This properness/completeness step is the lemma's only unformalized input.** It
is classical topology, but it is the one place where the argument leaves
machine-checkable arithmetic: no certificate inspects it, and it is where a
hypothetical formalization effort would have to spend its work. Steps 0 and 1 also
quote textbook facts (polygonal Jordan, polygon gluing), but those are statements
about the explicit finite PL objects the machine has already pinned down
coordinate-by-coordinate; Step 3 is the genuinely global one.

**Step 4: degree 1, hence embedding.** A covering of compact surfaces has a finite
degree `d >= 1`, and a local isometry multiplies area by the degree:
`area(S) = d * area(T^2)` (count preimages of a regular value; Hatcher sec. 1.3 for
degree and sheets). By (H5), `area(S) = sum_i area(F_i) = area(T^2)`, so `d = 1`. A
degree-1 covering is a homeomorphism, and a bijective local isometry is an isometry.
So the faces embed in `T^2` with disjoint interiors and cover it. This is the whole
point of proving the area identity exactly rather than numerically: `d = 1` versus
`d = 2` is a gap of an entire torus area, but certifying it requires the two areas
to be *equal*, not approximately equal.

**Step 5: from the torus to the plane.** Pull back along the universal covering
`R^2 -> T^2`. The `Lambda`-translates of the faces cover `R^2`, have pairwise
disjoint interiors (injectivity of `Phi`), and meet along full shared edges (H3).
That is an edge-to-edge tiling of the plane, periodic under `Lambda`. Whether
`Lambda` is the *full* translation group is a separate, also-certified question
(the symmetry search in `verify_star_extras.py` found no pure translation outside
`Lambda`); the lemma does not need it.

QED.

## What the lemma does not assume

No convexity of faces, no global injectivity input, no bound on the combinatorics,
and no float anywhere. Every hypothesis is one of the listed machine certificates.
The division of labor: the machine proves the local statements ((H1)-(H5), all
exact), and the lemma converts local-isometry-plus-equal-area into global embedding,
with Step 3 as the single trusted classical ingredient.
