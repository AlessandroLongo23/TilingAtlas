// The full spherical-tiling catalogue as generic Polyhedra: the 5 Platonic + 13 Archimedean solids,
// plus the 2 k=2 Johnson twins the Čtrnáct engine develops (J27, J37), resolvable by a stable string id.
// The spherical renderer and thumbnail key on this id (Archimedean/Johnson solids have no Schläfli symbol
// {p,q}, so id — not [p,q] — is the routing key for the whole shelf).

import { PLATONIC_SOLIDS, type Polyhedron } from "./platonicSolids";
import { ARCHIMEDEAN_SOLIDS } from "./archimedeanSolids";
import { JOHNSON_SOLIDS } from "./johnsonSolids";
import { PRISM_ANTIPRISM_SOLIDS } from "./prismSolids";

export const SPHERICAL_SOLIDS: Polyhedron[] = [
	...PLATONIC_SOLIDS,
	...ARCHIMEDEAN_SOLIDS,
	...PRISM_ANTIPRISM_SOLIDS,
	...JOHNSON_SOLIDS,
];

const BY_ID = new Map(SPHERICAL_SOLIDS.map((s) => [s.id, s]));

/** The solid for a stable id ("tetrahedron", "cuboctahedron", …), or null if unknown. */
export function polyhedronForId(id: string): Polyhedron | null {
	return BY_ID.get(id) ?? null;
}
