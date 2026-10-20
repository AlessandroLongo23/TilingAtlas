# Noble polyhedra

A polyhedron is *noble* when all its faces are alike and all its vertices are alike: some symmetry of the solid carries any face onto any other, and some symmetry carries any vertex onto any other. The five Platonic solids are noble, and so are the four Kepler-Poinsot star polyhedra. Nothing in the definition asks for regular faces, though, and once that requirement is gone the faces may be irregular, non-convex, or even crossed polygons whose sides pass through each other. The class that results was studied for a century and a half before it was finally classified in 2026, and the noble shelf of the [explorer](/play) holds the whole of it.

<geo-solid solids="noble-c-1,noble-d-2,noble-id-1,noble-sc-5-1,noble-rd-1-1,noble-gd-1-1" labels="Cube|Hess|Brückner|Webb|Mikloweit|Hill" caption="Six noble polyhedra, one per discoverer, from antiquity to 2026: the cube; Hess's D-2; Brückner's faceting of the icosidodecahedron ID-1; Robert Webb's faceting of the snub cube sC-5.1; Ulrich Mikloweit's rD-1.1; and gD-1.1 from Connor Hill's enumeration. Drag to turn each. Every face of each solid is congruent to every other, and so is every vertex.">
</geo-solid>

## Faces alike and vertices alike

Each half of the definition has its own name. A polyhedron whose symmetries act transitively on its faces is *isohedral*; one whose symmetries act transitively on its vertices is *isogonal*. Noble means both at once. The edges are left free: a noble polyhedron may have edges of two different kinds, and many do.

Isohedral solids on their own are plentiful, because every isogonal solid has an isohedral dual, and the same goes the other way round: the Catalan solids, for instance, are isohedral and not isogonal. The two conditions together are much more restrictive. They force the vertices to be a single orbit of the symmetry group, a set of points that the group permutes among themselves, and they force the faces to be a single orbit too. A noble polyhedron is therefore a choice of one orbit of points and one polygon on those points, such that the copies of that polygon under the group close up into a surface. Dualising swaps the roles of faces and vertices, so the dual of a noble polyhedron, whenever it is a polyhedron at all, is noble too.

Among convex solids the class is small. Besides the five Platonic solids there are only the *disphenoids*: tetrahedra with four congruent acute triangles as faces, which are what remains of a rectangular box when four of its eight corners are cut away along the diagonals of its faces. Every box gives one, so the disphenoids are a continuous family in two parameters, and a cube gives the regular tetrahedron.

<geo-noble-family caption="The two infinite families. The disphenoid is cut from a box whose proportions you set; at width and depth 1 it is the regular tetrahedron. The stephanoids, or crown polyhedra, have 2n crossed quadrilaterals on the vertices of an n-gonal prism or antiprism; n, the member, and the height are all free. Every stephanoid has V − E + F = 0.">
</geo-noble-family>

The other infinite family is non-convex. The *stephanoids*, or crown polyhedra, place $2n$ crossed quadrilaterals on the $2n$ vertices of an $n$-gonal prism or antiprism, each quadrilateral zigzagging between the top and the bottom ring. For a given $n$ there are several ways to choose the zigzag, written PC$(n,p,q)$ on a prism and AC$(n,p,q)$ on an antiprism, and the height of the prism is free. Each closes into a surface with $V - E + F = 0$, which is the Euler characteristic of a torus.

## Hess, Brückner and the long gap

The systematic study of noble polyhedra begins with Edmund Hess, whose paper *Über die zugleich gleicheckigen und gleichflächigen Polyeder* (1876) asked for exactly this: polyhedra that are at once equal-cornered and equal-faced. Over a series of papers from 1875 onward he found 16 noble polyhedra that are not regular, together with the prismatic stephanoids, all of them non-convex and self-intersecting. Max Brückner, who documented the field in *Vielecke und Vielflache* (1900), added ten more between 1900 and 1907.

Then the subject went quiet. Branko Grünbaum, who gave the class its name, took it up again near the end of the twentieth century, and observed that Hess and Brückner had often been vague about what they counted as a polyhedron, which left their lists hard to check. In 2008 Robert Webb found a new noble polyhedron as a faceting of the snub cube, using his program Stella: the first new one since Brückner, a century earlier. A run of discoveries followed in 2020, by Ulrich Mikloweit and a user of the Stella forums, which added 33 more. Ben Klein independently found two others.

None of this settled how many noble polyhedra there are. Each discovery was a faceting found by hand or by software search inside one particular symmetric solid, and nothing ruled out others hiding in orbits nobody had tried.

## Hill's classification

Connor Hill's paper *The complete set of noble polyhedra* (arXiv, July 2026) closes the question. Its two main results are that the only noble polyhedra with prismatic symmetry, the symmetry of a prism or antiprism, are the stephanoids and the disphenoids, and that apart from those two families there are exactly 146 noble polyhedra up to similarity.

The proof starts from the observation in the section above. A noble polyhedron's vertices are one orbit of its symmetry group, and outside the prismatic case that group is one of seven point groups with tetrahedral, octahedral or icosahedral rotations (written 332, \*332, 3\*2, 432, \*432, 532 and \*532 in orbifold notation). Hill parametrises the orbits of each group by one or two real numbers. Moving the parameters slides the points around, and a face can only exist where certain points happen to be coplanar, which turns the existence of a noble polyhedron into a question about the roots of particular polynomials, cubic in the parameters. He defines when an orbit is *critical* for this purpose and an equivalence relation on orbits under which equivalent orbits carry the same noble facetings; there are finitely many classes, and a computer checks each one. The vertex positions that come out are algebraic numbers, roots of the polynomials his appendix lists.

The shelf rebuilds every one of the 146 from that data, its symmetry group, its orbit parameters and a single face, and checks each against Hill's models. Its credits account for all of them: the 5 Platonic solids, the 4 Kepler-Poinsot polyhedra, Hess's 16, Brückner's 10, Webb's 1, the 33 from 2020 (20 credited to Mikloweit, 11 to the Stella forum user Senkoquartz and 2 unattributed), Klein's 2, and 75 that appear for the first time in Hill's enumeration. The shelf names them by Hill's symbols, such as sD-19.1, which name the kind of orbit the vertices lie on and number the solids found on it.

<geo-solid solids="noble-id-1,noble-ti-5-1,noble-sc-5-1" labels="ID-1|Its dual, tI-5.1|sC-5.1, self-dual" caption="Duality inside the class. Brückner's ID-1 has 60 quadrilateral faces on the 30 vertices of an icosidodecahedron; its dual tI-5.1 swaps the counts, with 30 faces on 60 vertices. Webb's sC-5.1 is its own dual: 24 pentagons, 24 vertices, and five of each at every vertex and face.">
</geo-solid>

The shelf also holds two figures Hill does not count among the 146. They are the duals of noble polyhedra with two coplanar faces meeting at an edge; dualising such a solid makes two of its vertices coincide, so each of these figures has 60 points that each carry two vertices, with ten pentagons meeting at every point. They are polyhedra only if coinciding vertices are allowed, and the shelf labels them that way. Hill's definition rules them out, which is why the count stays at 146. Two more figures of the same kind are not on the shelf yet: their faces pass through one point twice, and no model of them exists for the shelf to draw.

<geo-solid solids="noble-ti-f" caption="tI-F: 120 pentagons on 60 points, each point carrying two coinciding vertices. It is the dual of a noble polyhedron with coplanar faces, a polyhedron only if coinciding vertices are allowed, and it is not among Hill's 146.">
</geo-solid>

## What the shelf holds

The noble shelf has 151 records. 146 are Hill's noble polyhedra, 2 are the figures with coinciding vertices, and 3 are the families: the disphenoids, drawn from their two box proportions, and the prismatic and antiprismatic stephanoids, drawn for every admissible zigzag with $n$ up to 30. The slider stops at 30 and the families do not. All the listed records have a single vertex orbit, $k = 1$, as the definition requires.

## Credits

**Connor Hill** classified the noble polyhedra, and his enumeration supplies every listed solid on the shelf, its orbit parameters and its faces. The discoverer credited on each record follows the history above: Edmund Hess, Max Brückner, Robert Webb, Ulrich Mikloweit, the Stella forum user Senkoquartz, Ben Klein, and Hill himself.

## References

- C. Hill, [The complete set of noble polyhedra](https://arxiv.org/abs/2607.28711), arXiv:2607.28711, July 2026.
- E. Hess, Über die zugleich gleicheckigen und gleichflächigen Polyeder, *Schriften der Gesellschaft zur Beförderung der gesammten Naturwissenschaften zu Marburg*, 1876. See [Edmund Hess](https://en.wikipedia.org/wiki/Edmund_Hess).
- M. Brückner, *Vielecke und Vielflache: Theorie und Geschichte*, Teubner, Leipzig, 1900. See [Max Brückner](https://en.wikipedia.org/wiki/Max_Br%C3%BCckner).
- B. Grünbaum, [Polyhedra with hollow faces](https://faculty.washington.edu/moishe/Hollow-faced%20final), in *Polytopes: Abstract, Convex and Computational*, NATO ASI Series C 440, Kluwer, 1994, 43–70.
- R. Webb, [Faceted snub cube](https://software3d.com/Forums/viewtopic.php?p=184), Stella forums, 2008.
- [Noble polyhedron](https://en.wikipedia.org/wiki/Noble_polyhedron): definition, known classes and recent history.
