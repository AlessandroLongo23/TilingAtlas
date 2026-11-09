// The full spherical-solid catalogue as generic Polyhedra: the 5 Platonic + 13 Archimedean solids, the
// prisms and antiprisms, the 43 Johnson solids the Čtrnáct engine develops, and the 34 NON-CONVEX
// regular-faced solids develop_euclid found that no catalogue names (lib/render/nonconvexSolids.ts) —
// each resolvable by a stable string id, and the NON-SPHERICAL ones (lib/render/genusSolids.ts),
// whose surface closes at V - E + F != 2 — genus 1 upward — and the nine HEMIPOLYHEDRA
// (lib/render/hemiSolids.ts), the uniform polyhedra whose faces pass through the centre of the solid.
// Those nine are the only ONE-SIDED records here: eight are non-orientable, so V - E + F can be ODD
// (the tetrahemihexahedron closes at 1, a projective plane) and anything iterating this list that
// assumes an orientable map has to say so.
// The spherical renderer and thumbnail key on this id (Archimedean/Johnson solids have no Schläfli symbol
// {p,q}, so id — not [p,q] — is the routing key for the whole shelf).
//
// The non-convex and genus shelves are generated data, about 400 kB gzipped, so they load on first need
// and not with every page that draws a solid: polyhedronForId answers null for one of their ids until
// they land, then useSolidsLoaded() re-renders whoever asked. Scripts and tests that want the whole
// catalogue at once import lib/render/sphericalSolidsAll.ts, which holds them eagerly.

import { useSyncExternalStore } from "react";
import { PLATONIC_SOLIDS, type Polyhedron } from "./platonicSolids";
import { ARCHIMEDEAN_SOLIDS } from "./archimedeanSolids";
import { JOHNSON_SOLIDS } from "./johnsonSolids";
import { PRISM_ANTIPRISM_SOLIDS } from "./prismSolids";
import { HEMI_SOLIDS } from "./hemiSolids";
import { ISOTOXAL_SOLIDS } from "./isotoxalSolids";
import { nobleSolid } from "./nobleSolids";

/** The catalogue before and after the deferred shelves, in catalogue order (sphericalSolidsAll joins them). */
export const SOLIDS_HEAD = [...PLATONIC_SOLIDS, ...ARCHIMEDEAN_SOLIDS, ...PRISM_ANTIPRISM_SOLIDS, ...JOHNSON_SOLIDS];
export const SOLIDS_TAIL = [...HEMI_SOLIDS, ...ISOTOXAL_SOLIDS];
const BY_ID = new Map([...SOLIDS_HEAD, ...SOLIDS_TAIL].map((s) => [s.id, s]));
/** The deferred shelves' ids: "ncx-" non-convex, "tor-" genus 1, "gen<g>-" genus g ≥ 2. */
const DEFERRED = /^(ncx|tor|gen\d+)-/;

let loaded = false;
let loading = false;
const listeners = new Set<() => void>();

/** Called by sphericalSolidsAll when it loads: the deferred shelves become answerable. */
export function registerSolids(list: readonly Polyhedron[]) {
	for (const s of list) BY_ID.set(s.id, s);
	loaded = true;
	for (const f of listeners) f();
}

/** True once the deferred shelves are in; a component that reads polyhedronForId re-renders then. */
export function useSolidsLoaded(): boolean {
	return useSyncExternalStore(
		(f) => (listeners.add(f), () => listeners.delete(f)),
		() => loaded,
		() => false,
	);
}

/**
 * The solid for a stable id ("tetrahedron", "cuboctahedron", …), or null if unknown or not loaded yet.
 *
 * ⚑ The NOBLE polyhedra resolve here and are NOT in the catalogue list. That list is what every
 * regular-faced invariant in the repo iterates, and a noble face is not regular; and a noble solid is
 * not stored at all, it is regenerated from its point group on first request (lib/render/nobleSolids.ts).
 * A parametric family resolves to its member at the default parameters.
 */
export function polyhedronForId(id: string): Polyhedron | null {
	const s = BY_ID.get(id);
	if (s) return s;
	if (DEFERRED.test(id)) {
		if (!loading) {
			loading = true;
			void import("./sphericalSolidsAll");
		}
		return null;
	}
	return id.startsWith("noble-") ? nobleSolid(id) : null;
}

/** polyhedronForId as a hook: the component re-renders when a deferred solid lands. */
export function useSolid(id: string | null | undefined): Polyhedron | null {
	useSolidsLoaded();
	return id ? polyhedronForId(id) : null;
}
