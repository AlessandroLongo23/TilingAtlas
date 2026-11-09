// Every solid at once, for scripts and tests that iterate the whole catalogue. The app does not import
// this: lib/render/sphericalSolids.ts loads it the first time a non-convex or genus solid is asked for.

import { NONCONVEX_SOLIDS } from "./nonconvexSolids";
import { GENUS_SOLIDS } from "./genusSolids";
import { SOLIDS_HEAD, SOLIDS_TAIL, registerSolids } from "./sphericalSolids";

registerSolids([...NONCONVEX_SOLIDS, ...GENUS_SOLIDS]);

/** The catalogue in order: Platonic, Archimedean, prisms, Johnson, non-convex, genus, hemi, isotoxal. */
export const SPHERICAL_SOLIDS = [...SOLIDS_HEAD, ...NONCONVEX_SOLIDS, ...GENUS_SOLIDS, ...SOLIDS_TAIL];
export { polyhedronForId } from "./sphericalSolids";
