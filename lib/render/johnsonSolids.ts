// The k=2 spherical tilings the Čtrnáct engine develops (tools/ctrnact-oracle/develop_spherical.py):
// the two "gyro-twin" Johnson solids of the Archimedean cupola solids. Each is a generic Polyhedron —
// same shape as the Platonic/Archimedean records — so the spherical mesh builder, thumbnail and edge-arc
// code (lib/render/sphericalGeometry.ts) consume them with no renderer change. Coordinates are the
// developer's exact unit-sphere output (all |v| = 1, all edges equal, all faces regular); regenerate
// tests/fixtures/spherical-cells-k2.json and this file together if the developer changes.

import type { Polyhedron } from "./platonicSolids";

export const TRIANGULAR_ORTHOBICUPOLA: Polyhedron = {
	id: "triangular-orthobicupola",
	schlafli: [0, 0], // Johnson solid, no {p,q} — routing keys on id (as the Archimedean records do)
	vertexConfig: "3.4.3.4 / 3.3.4.4",
	name: "Triangular orthobicupola (J27)",
	vertices: [
		[0.000000000, 0.000000000, 1.000000000],
		[0.866025404, 0.000000000, 0.500000000],
		[0.288675135, -0.816496581, 0.500000000],
		[-0.577350269, -0.816496581, 0.000000000],
		[-0.866025404, 0.000000000, 0.500000000],
		[-0.288675135, 0.816496581, 0.500000000],
		[0.577350269, 0.816496581, -0.000000000],
		[0.481125224, 0.272165527, -0.833333333],
		[0.769800359, -0.544331054, -0.333333333],
		[-0.096225045, -0.544331054, -0.833333333],
		[-0.866025404, 0.000000000, -0.500000000],
		[-0.288675135, 0.816496581, -0.500000000],
	],
	faces: [
		[0, 5, 6, 1],
		[0, 4, 5],
		[1, 2, 0],
		[1, 8, 2],
		[1, 6, 7, 8],
		[2, 3, 4, 0],
		[2, 8, 9, 3],
		[3, 10, 4],
		[3, 9, 10],
		[4, 10, 11, 5],
		[5, 11, 6],
		[6, 11, 7],
		[7, 9, 8],
		[7, 11, 10, 9],
	],
};

export const PSEUDO_RHOMBICUBOCTAHEDRON: Polyhedron = {
	id: "pseudo-rhombicuboctahedron",
	schlafli: [0, 0], // Johnson solid, no {p,q} — routing keys on id (as the Archimedean records do)
	vertexConfig: "3.4.4.4 (two orbits)",
	name: "Pseudo-rhombicuboctahedron (J37)",
	vertices: [
		[0.000000000, 0.000000000, 1.000000000],
		[0.667599222, 0.000000000, 0.744520838],
		[0.284915790, -0.603748055, 0.744520838],
		[-0.354047953, -0.797175191, 0.489041676],
		[-0.638963743, -0.193427136, 0.744520838],
		[-0.736731385, 0.466974416, 0.489041676],
		[-0.097767643, 0.660401552, 0.744520838],
		[0.569831580, 0.660401552, 0.489041676],
		[0.874995711, 0.466974416, -0.127739581],
		[0.972763354, -0.193427136, 0.127739581],
		[0.590079921, -0.797175191, 0.127739581],
		[-0.048883821, -0.990602328, -0.127739581],
		[-0.569831580, -0.660401552, -0.489041676],
		[-0.874995711, -0.466974416, 0.127739581],
		[-0.972763354, 0.193427136, -0.127739581],
		[-0.590079921, 0.797175191, -0.127739581],
		[0.048883821, 0.990602328, 0.127739581],
		[0.354047953, 0.797175191, -0.489041676],
		[0.299233530, 0.233487208, -0.925171886],
		[0.820181288, -0.096713568, -0.563869790],
		[0.437497856, -0.700461623, -0.563869790],
		[-0.083449903, -0.370260847, -0.925171886],
		[-0.667599222, 0.000000000, -0.744520838],
		[-0.284915790, 0.603748055, -0.744520838],
	],
	faces: [
		[0, 6, 7, 1],
		[0, 4, 5, 6],
		[1, 2, 0],
		[1, 9, 10, 2],
		[1, 7, 8, 9],
		[2, 3, 4, 0],
		[2, 10, 11, 3],
		[3, 13, 4],
		[3, 11, 12, 13],
		[4, 13, 14, 5],
		[5, 15, 16, 6],
		[5, 14, 15],
		[6, 16, 7],
		[7, 16, 17, 8],
		[8, 19, 9],
		[8, 17, 18, 19],
		[9, 19, 20, 10],
		[10, 20, 11],
		[11, 20, 21, 12],
		[12, 22, 14, 13],
		[12, 21, 22],
		[14, 22, 23, 15],
		[15, 23, 17, 16],
		[17, 23, 18],
		[18, 21, 20, 19],
		[18, 23, 22, 21],
	],
};

export const JOHNSON_SOLIDS: Polyhedron[] = [TRIANGULAR_ORTHOBICUPOLA, PSEUDO_RHOMBICUBOCTAHEDRON];
