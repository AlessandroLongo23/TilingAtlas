# Polyhedra as tilings of the sphere

A polyhedron whose faces are regular polygons is a tiling of the sphere in disguise. Blow it up from its centre until the faces press against a surrounding sphere and each flat face becomes a curved one, while the edges become arcs of great circles; the arrangement of faces around each vertex is unchanged. The spherical half of the [explorer](/play) is built on that reading. It holds 773 solids, sorted the way the plane's tilings are sorted: by which polygons meet at a vertex and by how many kinds of vertex there are.

This page goes through the shelf from the convex solids, whose classification is finished, to the non-convex, star, one-sided and toroidal ones, where it is not. Every figure below can be turned by dragging it, and under each one is the count that ties it to the [previous article](/play/about): the vertices, edges and faces, the Euler characteristic $V - E + F$, and the total angle defect.

## Vertex orbits: the k of a solid

A symmetry of a polyhedron is a rotation or reflection that carries it onto itself. Two vertices are in the same *orbit* when some symmetry takes one to the other, and the number of orbits is the solid's $k$, exactly as for the [k-uniform tilings](/play/about/k-uniform) of the plane. A solid with $k = 1$ is vertex-transitive: from any vertex the solid looks the same.

The number of kinds of vertex configuration is a different thing, and the classic example of the difference is on the shelf. The rhombicuboctahedron has three squares and a triangle at every vertex, 3.4.4.4, and one orbit. Cut it in half across the middle band, turn the top cap by 45° and put it back: every vertex still reads 3.4.4.4, but the vertices near the turned cap can no longer be carried onto the ones near the other cap, and the solid has two orbits. This is the pseudo-rhombicuboctahedron, Johnson's J37, which looks uniform at every vertex and is not.

<geo-solid solids="rhombicuboctahedron,pseudo-rhombicuboctahedron" labels="Rhombicuboctahedron · k = 1|Pseudo-rhombicuboctahedron · k = 2" caption="Two solids with the same vertex everywhere, 3.4.4.4. On the left one orbit; on the right the top cap is turned by 45° and the vertices split into two orbits. Both have 24 vertices, and both have total defect 720°, 30° at each vertex.">
</geo-solid>

## The convex solids with one kind of vertex

The five Platonic solids, with one kind of regular face and one kind of vertex, close Euclid's *Elements*. The tetrahedron, cube and dodecahedron are traditionally credited to the Pythagoreans and the octahedron and icosahedron to Theaetetus, which is how the shelf credits them. The [previous article](/play/about) shows why there are only five: the angle sum at a vertex has to stay below 360°.

Allow several kinds of regular face and keep one kind of vertex, and the convex solids are the thirteen Archimedean solids and two infinite families, the prisms and the antiprisms. Pappus of Alexandria attributes the thirteen to a lost work of Archimedes; Johannes Kepler reconstructed all of them in *Harmonices Mundi* (1619) and also described the prisms and antiprisms as families. The shelf holds all thirteen Archimedean solids and twelve members of the two families: the prisms on 3, 5, 6, 8, 10 and 12 sides and the antiprisms on 4, 5, 6, 8, 10 and 12 sides. The square prism is the cube and the triangular antiprism is the octahedron, so those two appear under their Platonic names.

## Johnson's 92

Drop the condition that all vertices be alike and keep convexity and regular faces. In 1966 Norman Johnson published a list of 92 such solids that are neither Platonic, Archimedean, prisms nor antiprisms, gave them their names and their numbers J1 to J92, and conjectured that the list was complete. Victor Zalgaller proved it: his proof, which leans on a computer search, appeared in Russian in 1967 and in English translation in 1969. The class is finite and closed.

As tilings of the sphere the Johnson solids are the convex part of the shelf with $k \geq 2$. The pyramids, cupolas and their elongations have two or three vertex orbits; the solids made by turning and removing caps of the rhombicosidodecahedron reach far higher, and the metagyrate diminished rhombicosidodecahedron (J78) and the bigyrate diminished rhombicosidodecahedron (J79) have 29 orbits each, the largest $k$ on the shelf.

<geo-solid solids="snub-disphenoid,sphenocorona,bilunabirotunda,metagyrate-diminished-rhombicosidodecahedron" labels="Snub disphenoid|Sphenocorona|Bilunabirotunda|J78 · k = 29" caption="Four Johnson solids. The first three are among the handful that are not cut from a uniform solid or glued from pieces of one. The fourth is a rhombicosidodecahedron with one cap turned and another removed, which leaves only a mirror of symmetry and 29 vertex orbits. Every one has total defect 720°.">
</geo-solid>

The shelf holds 84 of the 92. The eight it does not yet hold are J47, J48, J60, J61, J68, J70, J71 and J87; all eight have many vertex orbits, and the search that found the other Johnson solids has not reached them. Not every Johnson solid has all its vertices on one sphere, and for those the explorer draws the solid itself: the tiling of the sphere is then the radial projection of its faces, a tiling whose tiles are no longer regular spherical polygons.

Of the 114 convex regular-faced solids on the shelf, 84 are Johnson solids, 13 Archimedean, 12 prisms and antiprisms and 5 Platonic. Beside them sit 16 tilings of the sphere by the halves of the Platonic faces, cut along a diagonal or an altitude, for 130 convex records in all.

## Regular faces, dented inward

Johnson's list and Zalgaller's proof are about convex solids. Without convexity, a closed surface of regular polygons can have vertices where the faces fold inward, faces that pass through each other, or both. The shelf holds 278 such solids with $k$ from 2 to 5, found by a search for closed regular-faced surfaces computed with Marek Čtrnáct's engine. No published list of them exists to check them against, so they carry a signature in place of a name: `ncx-7-15-10` is the non-convex solid with 7 vertices, 15 edges and 10 faces.

The smallest of them is ten equilateral triangles on seven vertices. It is a closed surface with $V - E + F = 7 - 15 + 10 = 2$, like a convex solid, and its total defect is 720° as Descartes' theorem requires, yet some of its faces cross others. The angle sums are measured on the surface, face by face, and crossings do not enter into them.

## Star polyhedra and the uniform ones

A star polygon $\{n/d\}$ joins every $d$-th of $n$ points on a circle: $\{5/2\}$ is the pentagram. Allowing star polygons as faces, or as vertex figures, gives four more regular polyhedra. Kepler found the small and great stellated dodecahedra, $\{5/2, 5\}$ and $\{5/2, 3\}$, in 1619; Louis Poinsot found the great dodecahedron $\{5, 5/2\}$ and the great icosahedron $\{3, 5/2\}$ in 1809; and Augustin Cauchy proved in 1813 that there are no others.

<geo-solid solids="noble-i-2,noble-d-6,noble-i-3,noble-i-4" labels="Small stellated dodecahedron|Great stellated dodecahedron|Great dodecahedron|Great icosahedron" caption="The four Kepler-Poinsot polyhedra. Their faces or their vertex figures are pentagrams, and they wrap around the centre more than once. The total defect reads n/a for the two stellated dodecahedra: a pentagram's corners add up to 180°, not the 540° of a pentagon, so Descartes' bookkeeping does not apply to their faces. The other two have ordinary faces and the count holds: 720° for the great icosahedron, and −2160° = 360° × (−6) for the great dodecahedron, whose surface has V − E + F = −6.">
</geo-solid>

The uniform polyhedra keep one kind of vertex and allow star faces. Harold Coxeter, Michael Longuet-Higgins and J. C. P. Miller listed 75 of them, prisms and antiprisms aside, in 1954; John Skilling proved in 1975 that the list was complete apart from one degenerate figure in which four faces meet at some edges. Of the 75, five are Platonic and thirteen Archimedean, which leaves 57 non-convex ones (counting the Kepler-Poinsot four). The shelf holds 48 of those 57. It files 103 solids under star polyhedra with $\{n/d\}$ faces, 55 of them with one vertex orbit, and 19 more whose faces are isotoxal stars: simple polygons that trace a star's outline, alternating a sharp point with a reflex dent.

## Faces through the centre

Nine of the uniform polyhedra have faces that pass through the centre of the solid. These are the hemipolyhedra. Their central faces lie parallel to the faces of another symmetric polyhedron and are half as many, hence the prefix: the tetrahemihexahedron has three central squares, parallel to the six faces of a cube. They appear in Coxeter, Longuet-Higgins and Miller's list, and the shelf holds all nine.

A face through the centre makes the surface one-sided. Walk once around the solid along a central face's edge and the faces you pass alternate between pointing up and pointing down, so no consistent inside and outside can be chosen. Eight of the nine are non-orientable in this way; only the octahemioctahedron has two sides. The simplest, the tetrahemihexahedron, has 6 vertices, 12 edges and 7 faces, so $V - E + F = 1$. Its surface is a projective plane, and its total defect is 360°, one full turn, exactly as $360^\circ \cdot (V - E + F)$ predicts.

<geo-solid solids="hemi-tetrahemihexahedron,hemi-octahemioctahedron,hemi-cubohemioctahedron" labels="Tetrahemihexahedron|Octahemioctahedron|Cubohemioctahedron" caption="Three hemipolyhedra. The squares of the tetrahemihexahedron, the hexagons of the other two, each pass through the centre. Compare the totals: 360° for the projective plane, and V − E + F = 0 and −2 for the other two, whose defects add up to 0° and −720°.">
</geo-solid>

## Solids with holes

A closed surface of genus $g$, a sphere with $g$ handles, has $V - E + F = 2 - 2g$, so by the same count its total angle defect is $720^\circ(1 - g)$. A torus totals 0°, and a solid with three handles totals −1440°. To get there some vertices must have negative defect: they are saddles, where the faces around a vertex add up to more than 360° and the surface bends both ways at once. No convex solid can have such a vertex, which is why none of the classical lists contains one.

Bonnie Stewart's *Adventures Among the Toroids* (1970) collected regular-faced polyhedra of higher genus whose faces do not cross. The shelf's 86 solids of this kind, found by the same search as the other non-convex ones, are mostly self-intersecting, so they are a different set from Stewart's: 10 tori and 76 of higher genus (20 of genus 3, 10 of genus 4, 26 of genus 5 and 20 of genus 9).

<geo-solid solids="tor-16-36-20,gen3-32-72-36-a,gen9-120-240-104-a" labels="Genus 1|Genus 3|Genus 9" caption="Regular-faced solids with handles. The readout's V − E + F gives the genus, through V − E + F = 2 − 2g, and its total defect is 720°(1 − g): 0° for the torus, −1440° for genus 3, −5760° for genus 9.">
</geo-solid>

## References

- N. W. Johnson, [Convex polyhedra with regular faces](https://doi.org/10.4153/CJM-1966-021-8), *Canadian Journal of Mathematics* 18 (1966), 169–200.
- V. A. Zalgaller, [*Convex Polyhedra with Regular Faces*](https://link.springer.com/book/9781489956712), Seminars in Mathematics, V. A. Steklov Mathematical Institute, Leningrad, vol. 2, Consultants Bureau, New York, 1969 (Russian original in *Zapiski Nauchnykh Seminarov LOMI* 2, 1967).
- H. S. M. Coxeter, M. S. Longuet-Higgins and J. C. P. Miller, [Uniform polyhedra](https://doi.org/10.1098/rsta.1954.0003), *Philosophical Transactions of the Royal Society A* 246 (1954), 401–450.
- J. Skilling, [The complete set of uniform polyhedra](https://doi.org/10.1098/rsta.1975.0022), *Philosophical Transactions of the Royal Society A* 278 (1975), 111–135.
- B. M. Stewart, *Adventures Among the Toroids: A Study of Orientable Polyhedra with Regular Faces*, self-published, 1970; 2nd ed. 1980. See [Adventures Among the Toroids](https://en.wikipedia.org/wiki/Adventures_Among_the_Toroids).
- [Archimedean solid](https://en.wikipedia.org/wiki/Archimedean_solid): Pappus's account, Kepler's *Harmonices Mundi* (1619), and the pseudo-rhombicuboctahedron.
- [Kepler-Poinsot polyhedron](https://en.wikipedia.org/wiki/Kepler%E2%80%93Poinsot_polyhedron): Kepler (1619), Poinsot (1809), Cauchy (1813).
- [Hemipolyhedron](https://en.wikipedia.org/wiki/Hemipolyhedron): the nine hemipolyhedra and their orientability.
