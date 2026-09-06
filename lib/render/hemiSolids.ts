// THE NINE HEMIPOLYHEDRA — uniform polyhedra whose "hemi" faces pass through the CENTRE of the solid.
//
// GENERATED FILE. Rebuild with tools/ctrnact-oracle/gen_hemi_shelf.py --emit; do not hand-edit.
//
// WHERE THEY LAND, and they SPLIT (AL, 2026-08-30). The six whose faces are all ordinary regular
// polygons fill the NON-CONVEX shelf's k = 1 row, which was empty because the class was missing and not
// because it belonged elsewhere — k = 1 with regular faces means vertex-transitive means uniform. The
// three carrying a {5/2} or {10/3} face go to the STAR shelf's k = 1 row instead, because face type is
// the split those two headings already make between them. HEMI_STAR_FACED below is that partition,
// measured off the face census. Only the non-convex row is named for the class; the star shelf's k = 1
// holds 52 records that are not hemipolyhedra, so it takes no noun.
//
// This is the only shelf in the atlas that is CONSTRUCTED rather than searched, and the reason is a
// measured fact about the engine and not a shortcut. Every closure mode the solver has keys on the SIGN
// of a vertex's angular defect — "positive-defect" for the sphere, "negative-defect" for the hyperbolic
// plane, "mixed" for the genus shelf — and all three exclude the FLAT vertex, where the face angles sum
// to exactly 360 degrees (alphabets/gen_alphabet.py, enum_configs). The octahemioctahedron's vertex is
// 3.6.3.6: 60 + 120 + 60 + 120 = 360, flat. It is the trihexagonal tiling's vertex closed up into a
// finite map instead of the infinite plane, and no mode the engine has can emit that word at any k.
// The other eight are refused one layer further on: genus_harvest.py rejects a non-orientable record
// rather than mislabel its genus, and eight of the nine are non-orientable. So the class was not missed,
// it was outside the search twice over. It is closed, published and complete at nine, so it is
// constructed from its parent vertex sets and VERIFIED instead — see the generator's docstring.
//
// WHAT IS MEASURED, per record, by the generator and again by tests/hemi-solids.test.ts:
//   * every face regular, every edge one length, every edge in exactly two faces;
//   * one vertex orbit (k = 1) — these are uniform polyhedra;
//   * V - E + F and ORIENTABILITY, which together are why they are here. Not one closes at 2. The
//     octahemioctahedron is the only orientable one (chi = 0, a torus); the other eight are
//     one-sided, the tetrahemihexahedron being a projective plane at chi = 1.
//
// NO SPHERE VIEW, and it is a theorem twice. Every vertex IS on a circumsphere — they are the parent
// quasiregular solid's vertices — so the usual measurement would offer the round view and be wrong: a
// hemi face's plane contains the centre, so its radial projection is a great circle and not a spherical
// polygon, and the map is not a map on a sphere in the first place. sph-inscribed.ts withholds it by id.
//
// These are the 9 of the 57 non-convex uniform polyhedra that are NOT on the star shelf. That shelf
// wants a density — how many times the solid covers its circumsphere — and a face through the centre
// makes that quantity undefined, which is exactly the gap recorded in the star run's open questions
// (experiments/results/star-spherical-k1-2026-08-17.md).

import type { Polyhedron } from "./platonicSolids";

// hemi-tetrahemihexahedron  — Tetrahemihexahedron, 4{3}, 3{4}, chi = 1, non-orientable
export const HEMI_TETRAHEMIHEXAHEDRON: Polyhedron = {
	id: "hemi-tetrahemihexahedron",
	schlafli: [0, 0], // no {p,q} — routing keys on id
	vertexConfig: "3.4.3.4",
	name: "Tetrahemihexahedron",
	vertices: [
		[1.000000000, 0.000000000, 0.000000000],
		[-1.000000000, 0.000000000, 0.000000000],
		[0.000000000, 1.000000000, 0.000000000],
		[0.000000000, -1.000000000, 0.000000000],
		[0.000000000, 0.000000000, 1.000000000],
		[0.000000000, 0.000000000, -1.000000000],
	],
	faces: [
		[4, 0, 2],
		[5, 0, 3],
		[5, 1, 2],
		[4, 1, 3],
		[2, 0, 3, 1],
		[4, 0, 5, 1],
		[4, 2, 5, 3],
	],
};

// hemi-octahemioctahedron  — Octahemioctahedron, 8{3}, 4{6}, chi = 0, orientable (torus)
export const HEMI_OCTAHEMIOCTAHEDRON: Polyhedron = {
	id: "hemi-octahemioctahedron",
	schlafli: [0, 0], // no {p,q} — routing keys on id
	vertexConfig: "3.6.3.6",
	name: "Octahemioctahedron",
	vertices: [
		[0.000000000, 0.707106781, 0.707106781],
		[0.707106781, 0.707106781, 0.000000000],
		[0.707106781, 0.000000000, 0.707106781],
		[0.000000000, 0.707106781, -0.707106781],
		[0.707106781, -0.707106781, 0.000000000],
		[-0.707106781, 0.000000000, 0.707106781],
		[0.000000000, -0.707106781, 0.707106781],
		[-0.707106781, 0.707106781, 0.000000000],
		[0.707106781, 0.000000000, -0.707106781],
		[0.000000000, -0.707106781, -0.707106781],
		[-0.707106781, -0.707106781, 0.000000000],
		[-0.707106781, 0.000000000, -0.707106781],
	],
	faces: [
		[1, 0, 2],
		[5, 0, 7],
		[3, 1, 8],
		[4, 2, 6],
		[7, 3, 11],
		[8, 4, 9],
		[6, 5, 10],
		[11, 9, 10],
		[10, 5, 0, 1, 8, 9],
		[11, 7, 0, 2, 4, 9],
		[11, 3, 1, 2, 6, 10],
		[5, 7, 3, 8, 4, 6],
	],
};

// hemi-cubohemioctahedron  — Cubohemioctahedron, 6{4}, 4{6}, chi = -2, non-orientable
export const HEMI_CUBOHEMIOCTAHEDRON: Polyhedron = {
	id: "hemi-cubohemioctahedron",
	schlafli: [0, 0], // no {p,q} — routing keys on id
	vertexConfig: "4.6.4.6",
	name: "Cubohemioctahedron",
	vertices: [
		[0.000000000, 0.707106781, 0.707106781],
		[0.707106781, 0.707106781, 0.000000000],
		[0.707106781, 0.000000000, 0.707106781],
		[0.000000000, 0.707106781, -0.707106781],
		[0.707106781, -0.707106781, 0.000000000],
		[-0.707106781, 0.000000000, 0.707106781],
		[0.000000000, -0.707106781, 0.707106781],
		[-0.707106781, 0.707106781, 0.000000000],
		[0.707106781, 0.000000000, -0.707106781],
		[0.000000000, -0.707106781, -0.707106781],
		[-0.707106781, -0.707106781, 0.000000000],
		[-0.707106781, 0.000000000, -0.707106781],
	],
	faces: [
		[7, 0, 1, 3],
		[2, 0, 5, 6],
		[8, 1, 2, 4],
		[11, 3, 8, 9],
		[9, 4, 6, 10],
		[10, 5, 7, 11],
		[10, 5, 0, 1, 8, 9],
		[11, 7, 0, 2, 4, 9],
		[11, 3, 1, 2, 6, 10],
		[5, 7, 3, 8, 4, 6],
	],
};

// hemi-small-icosihemidodecahedron  — Small icosihemidodecahedron, 20{3}, 6{10}, chi = -4, non-orientable
export const HEMI_SMALL_ICOSIHEMIDODECAHEDRON: Polyhedron = {
	id: "hemi-small-icosihemidodecahedron",
	schlafli: [0, 0], // no {p,q} — routing keys on id
	vertexConfig: "3.10.3.10",
	name: "Small icosihemidodecahedron",
	vertices: [
		[0.000000000, 0.000000000, 1.000000000],
		[0.000000000, 1.000000000, 0.000000000],
		[1.000000000, 0.000000000, 0.000000000],
		[0.000000000, 0.000000000, -1.000000000],
		[0.000000000, -1.000000000, 0.000000000],
		[-1.000000000, 0.000000000, 0.000000000],
		[0.309016994, 0.500000000, 0.809016994],
		[0.500000000, 0.809016994, 0.309016994],
		[0.809016994, 0.309016994, 0.500000000],
		[0.309016994, 0.500000000, -0.809016994],
		[0.500000000, -0.809016994, 0.309016994],
		[-0.809016994, 0.309016994, 0.500000000],
		[0.309016994, -0.500000000, 0.809016994],
		[-0.500000000, 0.809016994, 0.309016994],
		[0.809016994, 0.309016994, -0.500000000],
		[0.309016994, -0.500000000, -0.809016994],
		[-0.500000000, -0.809016994, 0.309016994],
		[-0.809016994, 0.309016994, -0.500000000],
		[-0.309016994, 0.500000000, 0.809016994],
		[0.500000000, 0.809016994, -0.309016994],
		[0.809016994, -0.309016994, 0.500000000],
		[-0.309016994, 0.500000000, -0.809016994],
		[0.500000000, -0.809016994, -0.309016994],
		[-0.809016994, -0.309016994, 0.500000000],
		[-0.309016994, -0.500000000, 0.809016994],
		[-0.500000000, 0.809016994, -0.309016994],
		[0.809016994, -0.309016994, -0.500000000],
		[-0.309016994, -0.500000000, -0.809016994],
		[-0.500000000, -0.809016994, -0.309016994],
		[-0.809016994, -0.309016994, -0.500000000],
	],
	faces: [
		[18, 0, 6],
		[12, 0, 24],
		[19, 1, 7],
		[13, 1, 25],
		[20, 2, 8],
		[14, 2, 26],
		[9, 3, 21],
		[27, 3, 15],
		[10, 4, 22],
		[28, 4, 16],
		[11, 5, 23],
		[29, 5, 17],
		[7, 6, 8],
		[14, 9, 19],
		[12, 10, 20],
		[13, 11, 18],
		[22, 15, 26],
		[23, 16, 24],
		[21, 17, 25],
		[29, 27, 28],
		[9, 19, 7, 6, 0, 24, 16, 28, 27, 3],
		[15, 22, 10, 12, 0, 18, 13, 25, 21, 3],
		[10, 20, 8, 7, 1, 25, 17, 29, 28, 4],
		[16, 23, 11, 13, 1, 19, 14, 26, 22, 4],
		[11, 18, 6, 8, 2, 26, 15, 27, 29, 5],
		[17, 21, 9, 14, 2, 20, 12, 24, 23, 5],
	],
};

// hemi-small-dodecahemidodecahedron  — Small dodecahemidodecahedron, 12{5}, 6{10}, chi = -12, non-orientable
export const HEMI_SMALL_DODECAHEMIDODECAHEDRON: Polyhedron = {
	id: "hemi-small-dodecahemidodecahedron",
	schlafli: [0, 0], // no {p,q} — routing keys on id
	vertexConfig: "5.10.5.10",
	name: "Small dodecahemidodecahedron",
	vertices: [
		[0.000000000, 0.000000000, 1.000000000],
		[0.000000000, 1.000000000, 0.000000000],
		[1.000000000, 0.000000000, 0.000000000],
		[0.000000000, 0.000000000, -1.000000000],
		[0.000000000, -1.000000000, 0.000000000],
		[-1.000000000, 0.000000000, 0.000000000],
		[0.309016994, 0.500000000, 0.809016994],
		[0.500000000, 0.809016994, 0.309016994],
		[0.809016994, 0.309016994, 0.500000000],
		[0.309016994, 0.500000000, -0.809016994],
		[0.500000000, -0.809016994, 0.309016994],
		[-0.809016994, 0.309016994, 0.500000000],
		[0.309016994, -0.500000000, 0.809016994],
		[-0.500000000, 0.809016994, 0.309016994],
		[0.809016994, 0.309016994, -0.500000000],
		[0.309016994, -0.500000000, -0.809016994],
		[-0.500000000, -0.809016994, 0.309016994],
		[-0.809016994, 0.309016994, -0.500000000],
		[-0.309016994, 0.500000000, 0.809016994],
		[0.500000000, 0.809016994, -0.309016994],
		[0.809016994, -0.309016994, 0.500000000],
		[-0.309016994, 0.500000000, -0.809016994],
		[0.500000000, -0.809016994, -0.309016994],
		[-0.809016994, -0.309016994, 0.500000000],
		[-0.309016994, -0.500000000, 0.809016994],
		[-0.500000000, 0.809016994, -0.309016994],
		[0.809016994, -0.309016994, -0.500000000],
		[-0.309016994, -0.500000000, -0.809016994],
		[-0.500000000, -0.809016994, -0.309016994],
		[-0.809016994, -0.309016994, -0.500000000],
	],
	faces: [
		[8, 6, 0, 12, 20],
		[23, 24, 0, 18, 11],
		[6, 7, 1, 13, 18],
		[21, 25, 1, 19, 9],
		[7, 8, 2, 14, 19],
		[22, 26, 2, 20, 10],
		[26, 15, 3, 9, 14],
		[17, 21, 3, 27, 29],
		[24, 16, 4, 10, 12],
		[15, 22, 4, 28, 27],
		[25, 17, 5, 11, 13],
		[16, 23, 5, 29, 28],
		[9, 19, 7, 6, 0, 24, 16, 28, 27, 3],
		[15, 22, 10, 12, 0, 18, 13, 25, 21, 3],
		[10, 20, 8, 7, 1, 25, 17, 29, 28, 4],
		[16, 23, 11, 13, 1, 19, 14, 26, 22, 4],
		[11, 18, 6, 8, 2, 26, 15, 27, 29, 5],
		[17, 21, 9, 14, 2, 20, 12, 24, 23, 5],
	],
};

// hemi-small-dodecahemicosahedron  — Small dodecahemicosahedron, 12{5/2}, 10{6}, chi = -8, non-orientable
export const HEMI_SMALL_DODECAHEMICOSAHEDRON: Polyhedron = {
	id: "hemi-small-dodecahemicosahedron",
	schlafli: [0, 0], // no {p,q} — routing keys on id
	vertexConfig: "5/2.6.5/2.6",
	name: "Small dodecahemicosahedron",
	vertices: [
		[0.000000000, 0.000000000, 1.000000000],
		[0.000000000, 1.000000000, 0.000000000],
		[1.000000000, 0.000000000, 0.000000000],
		[0.000000000, 0.000000000, -1.000000000],
		[0.000000000, -1.000000000, 0.000000000],
		[-1.000000000, 0.000000000, 0.000000000],
		[0.309016994, 0.500000000, 0.809016994],
		[0.500000000, 0.809016994, 0.309016994],
		[0.809016994, 0.309016994, 0.500000000],
		[0.309016994, 0.500000000, -0.809016994],
		[0.500000000, -0.809016994, 0.309016994],
		[-0.809016994, 0.309016994, 0.500000000],
		[0.309016994, -0.500000000, 0.809016994],
		[-0.500000000, 0.809016994, 0.309016994],
		[0.809016994, 0.309016994, -0.500000000],
		[0.309016994, -0.500000000, -0.809016994],
		[-0.500000000, -0.809016994, 0.309016994],
		[-0.809016994, 0.309016994, -0.500000000],
		[-0.309016994, 0.500000000, 0.809016994],
		[0.500000000, 0.809016994, -0.309016994],
		[0.809016994, -0.309016994, 0.500000000],
		[-0.309016994, 0.500000000, -0.809016994],
		[0.500000000, -0.809016994, -0.309016994],
		[-0.809016994, -0.309016994, 0.500000000],
		[-0.309016994, -0.500000000, 0.809016994],
		[-0.500000000, 0.809016994, -0.309016994],
		[0.809016994, -0.309016994, -0.500000000],
		[-0.309016994, -0.500000000, -0.809016994],
		[-0.500000000, -0.809016994, -0.309016994],
		[-0.809016994, -0.309016994, -0.500000000],
	],
	faces: [
		[8, 0, 20, 6, 12],
		[23, 0, 11, 24, 18],
		[6, 1, 18, 7, 13],
		[21, 1, 9, 25, 19],
		[7, 2, 19, 8, 14],
		[22, 2, 10, 26, 20],
		[26, 3, 14, 15, 9],
		[17, 3, 29, 21, 27],
		[24, 4, 12, 16, 10],
		[15, 4, 27, 22, 28],
		[25, 5, 13, 17, 11],
		[16, 5, 28, 23, 29],
		[14, 8, 0, 23, 29, 3],
		[17, 11, 0, 20, 26, 3],
		[12, 6, 1, 21, 27, 4],
		[15, 9, 1, 18, 24, 4],
		[13, 7, 2, 22, 28, 5],
		[16, 10, 2, 19, 25, 5],
		[27, 22, 20, 6, 13, 17],
		[28, 23, 18, 7, 14, 15],
		[21, 19, 8, 12, 16, 29],
		[24, 10, 26, 9, 25, 11],
	],
};

// hemi-great-dodecahemicosahedron  — Great dodecahemicosahedron, 12{5}, 10{6}, chi = -8, non-orientable
export const HEMI_GREAT_DODECAHEMICOSAHEDRON: Polyhedron = {
	id: "hemi-great-dodecahemicosahedron",
	schlafli: [0, 0], // no {p,q} — routing keys on id
	vertexConfig: "5.6.5.6",
	name: "Great dodecahemicosahedron",
	vertices: [
		[0.000000000, 0.000000000, 1.000000000],
		[0.000000000, 1.000000000, 0.000000000],
		[1.000000000, 0.000000000, 0.000000000],
		[0.000000000, 0.000000000, -1.000000000],
		[0.000000000, -1.000000000, 0.000000000],
		[-1.000000000, 0.000000000, 0.000000000],
		[0.309016994, 0.500000000, 0.809016994],
		[0.500000000, 0.809016994, 0.309016994],
		[0.809016994, 0.309016994, 0.500000000],
		[0.309016994, 0.500000000, -0.809016994],
		[0.500000000, -0.809016994, 0.309016994],
		[-0.809016994, 0.309016994, 0.500000000],
		[0.309016994, -0.500000000, 0.809016994],
		[-0.500000000, 0.809016994, 0.309016994],
		[0.809016994, 0.309016994, -0.500000000],
		[0.309016994, -0.500000000, -0.809016994],
		[-0.500000000, -0.809016994, 0.309016994],
		[-0.809016994, 0.309016994, -0.500000000],
		[-0.309016994, 0.500000000, 0.809016994],
		[0.500000000, 0.809016994, -0.309016994],
		[0.809016994, -0.309016994, 0.500000000],
		[-0.309016994, 0.500000000, -0.809016994],
		[0.500000000, -0.809016994, -0.309016994],
		[-0.809016994, -0.309016994, 0.500000000],
		[-0.309016994, -0.500000000, 0.809016994],
		[-0.500000000, 0.809016994, -0.309016994],
		[0.809016994, -0.309016994, -0.500000000],
		[-0.309016994, -0.500000000, -0.809016994],
		[-0.500000000, -0.809016994, -0.309016994],
		[-0.809016994, -0.309016994, -0.500000000],
	],
	faces: [
		[25, 11, 0, 8, 19],
		[22, 20, 0, 23, 28],
		[26, 9, 1, 6, 20],
		[23, 18, 1, 21, 29],
		[24, 10, 2, 7, 18],
		[21, 19, 2, 22, 27],
		[7, 14, 3, 17, 13],
		[16, 29, 3, 26, 10],
		[8, 12, 4, 15, 14],
		[17, 27, 4, 24, 11],
		[6, 13, 5, 16, 12],
		[15, 28, 5, 25, 9],
		[14, 8, 0, 23, 29, 3],
		[17, 11, 0, 20, 26, 3],
		[12, 6, 1, 21, 27, 4],
		[15, 9, 1, 18, 24, 4],
		[13, 7, 2, 22, 28, 5],
		[16, 10, 2, 19, 25, 5],
		[27, 22, 20, 6, 13, 17],
		[28, 23, 18, 7, 14, 15],
		[21, 19, 8, 12, 16, 29],
		[24, 10, 26, 9, 25, 11],
	],
};

// hemi-great-icosihemidodecahedron  — Great icosihemidodecahedron, 20{3}, 6{10/3}, chi = -4, non-orientable
export const HEMI_GREAT_ICOSIHEMIDODECAHEDRON: Polyhedron = {
	id: "hemi-great-icosihemidodecahedron",
	schlafli: [0, 0], // no {p,q} — routing keys on id
	vertexConfig: "3.10/3.3.10/3",
	name: "Great icosihemidodecahedron",
	vertices: [
		[0.000000000, 0.000000000, 1.000000000],
		[0.000000000, 1.000000000, 0.000000000],
		[1.000000000, 0.000000000, 0.000000000],
		[0.000000000, 0.000000000, -1.000000000],
		[0.000000000, -1.000000000, 0.000000000],
		[-1.000000000, 0.000000000, 0.000000000],
		[0.309016994, 0.500000000, 0.809016994],
		[0.500000000, 0.809016994, 0.309016994],
		[0.809016994, 0.309016994, 0.500000000],
		[0.309016994, 0.500000000, -0.809016994],
		[0.500000000, -0.809016994, 0.309016994],
		[-0.809016994, 0.309016994, 0.500000000],
		[0.309016994, -0.500000000, 0.809016994],
		[-0.500000000, 0.809016994, 0.309016994],
		[0.809016994, 0.309016994, -0.500000000],
		[0.309016994, -0.500000000, -0.809016994],
		[-0.500000000, -0.809016994, 0.309016994],
		[-0.809016994, 0.309016994, -0.500000000],
		[-0.309016994, 0.500000000, 0.809016994],
		[0.500000000, 0.809016994, -0.309016994],
		[0.809016994, -0.309016994, 0.500000000],
		[-0.309016994, 0.500000000, -0.809016994],
		[0.500000000, -0.809016994, -0.309016994],
		[-0.809016994, -0.309016994, 0.500000000],
		[-0.309016994, -0.500000000, 0.809016994],
		[-0.500000000, 0.809016994, -0.309016994],
		[0.809016994, -0.309016994, -0.500000000],
		[-0.309016994, -0.500000000, -0.809016994],
		[-0.500000000, -0.809016994, -0.309016994],
		[-0.809016994, -0.309016994, -0.500000000],
	],
	faces: [
		[19, 0, 22],
		[28, 0, 25],
		[20, 1, 23],
		[29, 1, 26],
		[18, 2, 21],
		[27, 2, 24],
		[10, 3, 7],
		[13, 3, 16],
		[11, 4, 8],
		[14, 4, 17],
		[9, 5, 6],
		[12, 5, 15],
		[26, 6, 16],
		[24, 7, 17],
		[25, 8, 15],
		[28, 9, 20],
		[29, 10, 18],
		[27, 11, 19],
		[13, 12, 14],
		[23, 21, 22],
		[9, 6, 16, 3, 7, 24, 27, 19, 0, 28],
		[15, 12, 13, 3, 10, 18, 21, 22, 0, 25],
		[10, 7, 17, 4, 8, 25, 28, 20, 1, 29],
		[16, 13, 14, 4, 11, 19, 22, 23, 1, 26],
		[11, 8, 15, 5, 6, 26, 29, 18, 2, 27],
		[17, 14, 12, 5, 9, 20, 23, 21, 2, 24],
	],
};

// hemi-great-dodecahemidodecahedron  — Great dodecahemidodecahedron, 12{5/2}, 6{10/3}, chi = -12, non-orientable
export const HEMI_GREAT_DODECAHEMIDODECAHEDRON: Polyhedron = {
	id: "hemi-great-dodecahemidodecahedron",
	schlafli: [0, 0], // no {p,q} — routing keys on id
	vertexConfig: "5/2.10/3.5/2.10/3",
	name: "Great dodecahemidodecahedron",
	vertices: [
		[0.000000000, 0.000000000, 1.000000000],
		[0.000000000, 1.000000000, 0.000000000],
		[1.000000000, 0.000000000, 0.000000000],
		[0.000000000, 0.000000000, -1.000000000],
		[0.000000000, -1.000000000, 0.000000000],
		[-1.000000000, 0.000000000, 0.000000000],
		[0.309016994, 0.500000000, 0.809016994],
		[0.500000000, 0.809016994, 0.309016994],
		[0.809016994, 0.309016994, 0.500000000],
		[0.309016994, 0.500000000, -0.809016994],
		[0.500000000, -0.809016994, 0.309016994],
		[-0.809016994, 0.309016994, 0.500000000],
		[0.309016994, -0.500000000, 0.809016994],
		[-0.500000000, 0.809016994, 0.309016994],
		[0.809016994, 0.309016994, -0.500000000],
		[0.309016994, -0.500000000, -0.809016994],
		[-0.500000000, -0.809016994, 0.309016994],
		[-0.809016994, 0.309016994, -0.500000000],
		[-0.309016994, 0.500000000, 0.809016994],
		[0.500000000, 0.809016994, -0.309016994],
		[0.809016994, -0.309016994, 0.500000000],
		[-0.309016994, 0.500000000, -0.809016994],
		[0.500000000, -0.809016994, -0.309016994],
		[-0.809016994, -0.309016994, 0.500000000],
		[-0.309016994, -0.500000000, 0.809016994],
		[-0.500000000, 0.809016994, -0.309016994],
		[0.809016994, -0.309016994, -0.500000000],
		[-0.309016994, -0.500000000, -0.809016994],
		[-0.500000000, -0.809016994, -0.309016994],
		[-0.809016994, -0.309016994, -0.500000000],
	],
	faces: [
		[25, 0, 19, 11, 8],
		[22, 0, 28, 20, 23],
		[26, 1, 20, 9, 6],
		[23, 1, 29, 18, 21],
		[24, 2, 18, 10, 7],
		[21, 2, 27, 19, 22],
		[7, 3, 13, 14, 17],
		[16, 3, 10, 29, 26],
		[8, 4, 14, 12, 15],
		[17, 4, 11, 27, 24],
		[6, 5, 12, 13, 16],
		[15, 5, 9, 28, 25],
		[9, 6, 16, 3, 7, 24, 27, 19, 0, 28],
		[15, 12, 13, 3, 10, 18, 21, 22, 0, 25],
		[10, 7, 17, 4, 8, 25, 28, 20, 1, 29],
		[16, 13, 14, 4, 11, 19, 22, 23, 1, 26],
		[11, 8, 15, 5, 6, 26, 29, 18, 2, 27],
		[17, 14, 12, 5, 9, 20, 23, 21, 2, 24],
	],
};

export const HEMI_SOLIDS: Polyhedron[] = [
	HEMI_TETRAHEMIHEXAHEDRON,
	HEMI_OCTAHEMIOCTAHEDRON,
	HEMI_CUBOHEMIOCTAHEDRON,
	HEMI_SMALL_ICOSIHEMIDODECAHEDRON,
	HEMI_SMALL_DODECAHEMIDODECAHEDRON,
	HEMI_SMALL_DODECAHEMICOSAHEDRON,
	HEMI_GREAT_DODECAHEMICOSAHEDRON,
	HEMI_GREAT_ICOSIHEMIDODECAHEDRON,
	HEMI_GREAT_DODECAHEMIDODECAHEDRON,
];

/**
 * The hemipolyhedra with a {n/d} face — 3 of the nine.
 *
 * These file under the STAR shelf, not the non-convex one: that shelf's split against the
 * star shelf is the FACE TYPE, and a {5/2} is not a regular polygon in the sense that
 * heading means. Measured off the face census by the generator, never hand-listed.
 */
export const HEMI_STAR_FACED: ReadonlySet<string> = new Set([
	"hemi-small-dodecahemicosahedron",
	"hemi-great-icosihemidodecahedron",
	"hemi-great-dodecahemidodecahedron",
]);
