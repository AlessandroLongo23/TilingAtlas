// Pure fold of the three tiling data sources (the selected CatalogueTiling, the live exact symmetry
// analysis, the live vertex-orbit count) into one geometry-tagged spec object for the /play info card.
// No React, no side effects — the presenter (components/tiling-info.tsx) never re-decides which fields
// apply. Geometry-specific facts (orbifold, spherical V/E/F, point group) are derived here from {p,q}.
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import type { SymmetryData } from "@/lib/classes/symmetry/types";
import type { OrbitData } from "@/lib/services/orbitsFromExactSource";
import { ORBIFOLD_SIGNATURE } from "@/lib/classes/symmetry/types";
import { geometryOf, hyperbolicParams } from "@/lib/services/referenceAtlas";
import { analyseFaces, summarise } from "@/lib/freedraw/faces";

// Edge- and tile-orbit extraction does not exist yet (AL owns that logic). Until it does, buildTilingSpec
// leaves both fields null and the card renders a muted "not computed" row. When the extractor lands, fill
// the two fields in buildTilingSpec and flip this to true — one boolean plus one function, no layout change.
export const EDGE_FACE_ORBITS_ENABLED = false;

export interface OrbitCounts {
	/** Vertex orbits (= k for a k-uniform tiling). */
	k: number | null;
	/** Distinct vertex-configuration types among the k orbits (m ≤ k). */
	m: number | null;
	/** Multiplicities of the m types, descending, summing to k (e.g. [5,1,1] at k=7, m=3). */
	partition: number[] | null;
	/** Edge orbits — null until EDGE_FACE_ORBITS_ENABLED and the extractor land. */
	edgeOrbits: number | null;
	/** Tile/face orbits — null until the extractor lands. */
	faceOrbits: number | null;
}

interface BaseSpec extends OrbitCounts {
	/** Headline label: a vertex-config string ("3.4.6.12") or a Schläfli symbol ("{7,3}"). */
	label: string;
}

// Freedraw facts, present ONLY on a freedraw entry. It stays inside EuclideanSpec rather than becoming a
// fourth union member because freedraw IS Euclidean — geometryOf says so, and the geometry toggle groups it
// with the plane. What changes is the vocabulary: `k` counts grid-point orbits (not vertex orbits), and the
// "tiles" are faces of the drawn edge set, which may be unbounded.
export interface FreedrawFacts {
	/** Period lattice in Hermite normal form: (a,0) and (b,d); index a·d. */
	lattice: { a: number; b: number; d: number };
	/** Per-face kind counts (finite polyominoes / strips / unbounded sheets / faces with holes). */
	finite: number;
	strips: number;
	unbounded: number;
	withHoles: number;
}

export interface EuclideanSpec extends BaseSpec {
	geometry: "euclidean";
	wallpaperGroup: string | null; // e.g. "p6m"
	orbifold: string | null; // Conway signature, e.g. "*632"
	latticeShape: string | null; // e.g. "hexagonal"
	// Present iff this is a freedraw pattern. Its presence also RELABELS the orbit section — see
	// components/tiling-info.tsx — because k means grid points there, not vertices.
	freedraw: FreedrawFacts | null;
}

export interface HyperbolicSpec extends BaseSpec {
	geometry: "hyperbolic";
	faces: number[]; // distinct tile face-sizes at the vertex, e.g. [3,4,8]
	valence: number; // tiles meeting at the vertex (the vertex-config length, d)
	edge: number | null; // forced edge length ℓ of the developed patch
	provenance: string | null; // "rendered by" note (the atlas discoverer string, relocated off the card)
	// Rigorous symmetry — REGULAR {p,q} entries ONLY. Deriving a Coxeter symbol from a bare vertex
	// configuration (3.4.8.4, 3.8.3.8, …) is a Wythoff-inverse we do NOT perform, so non-regular configs
	// leave these null and the panel omits the Symmetry section rather than fabricating it.
	schlafli: [number, number] | null; // "{8,3}"
	coxeter: string | null; // "[8,3]"
	orbifold: string | null; // full reflection group, "*832"
}

export interface SphericalSpec extends BaseSpec {
	geometry: "spherical";
	solidName: string; // "Dodecahedron", "Truncated tetrahedron"
	pointGroup: string | null; // Td/Oh/Ih — Platonic {p,q} only
	orbifold: string | null; // "*532" — Platonic only
	counts: { V: number; E: number; F: number } | null; // Platonic only
}

export type TilingSpec = EuclideanSpec | HyperbolicSpec | SphericalSpec;

// Conway orbifold of the full reflection group of a regular {p,q}: the (2,p,q) triangle's three orders,
// sorted descending, prefixed with *. {7,3}->"*732", {5,3}->"*532", {4,3}->"*432".
function reflectionOrbifold(p: number, q: number): string {
	return "*" + [p, q, 2].sort((a, b) => b - a).join("");
}

// Named polyhedral point group of a Platonic {p,q}; the five solids fall into three groups.
function platonicPointGroup(p: number, q: number): string | null {
	const key = `${Math.min(p, q)}${Math.max(p, q)}`; // orientation-independent {p,q}
	if (key === "33") return "Td"; // tetrahedron
	if (key === "34") return "Oh"; // cube / octahedron
	if (key === "35") return "Ih"; // dodecahedron / icosahedron
	return null;
}

// V/E/F of a regular polyhedron {p,q}: pF=2E, qV=2E, V-E+F=2 ⇒ E = 2pq/(2p+2q-pq). Returns null unless
// the case is spherical (denom > 0) and the counts come out as positive integers.
function platonicCounts(p: number, q: number): { V: number; E: number; F: number } | null {
	const denom = 2 * p + 2 * q - p * q;
	if (denom <= 0) return null;
	const E = (2 * p * q) / denom;
	const V = (4 * p) / denom;
	const F = (4 * q) / denom;
	if (!Number.isInteger(E) || !Number.isInteger(V) || !Number.isInteger(F)) return null;
	return { V, E, F };
}

// "truncated-tetrahedron" -> "Truncated tetrahedron"; "cube" -> "Cube".
function prettySolid(id: string): string {
	const s = id.replace(/-/g, " ");
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildTilingSpec(
	selected: CatalogueTiling,
	symmetryData: SymmetryData | null,
	orbitData: OrbitData | null,
): TilingSpec {
	const base: OrbitCounts = {
		k: orbitData?.k ?? selected.k ?? null,
		m: selected.m ?? null,
		partition: selected.partition ?? null,
		edgeOrbits: null, // flagged — see EDGE_FACE_ORBITS_ENABLED
		faceOrbits: null,
	};

	const geometry = geometryOf(selected);

	if (geometry === "spherical" && selected.spherical) {
		const { p, q, solid } = selected.spherical;
		const platonic = p != null && q != null;
		return {
			geometry: "spherical",
			label: platonic ? `{${p},${q}}` : selected.family,
			solidName: prettySolid(solid),
			pointGroup: platonic ? platonicPointGroup(p, q) : null,
			orbifold: platonic ? reflectionOrbifold(p, q) : null,
			counts: platonic ? platonicCounts(p, q) : null,
			...base,
		};
	}

	if (geometry === "hyperbolic") {
		// Honest subset only. faces/valence/edge come straight from the data; the Schläfli/Coxeter/orbifold
		// trio is derived ONLY when the config is a single regular face size (schlafli non-null).
		const hp = hyperbolicParams(selected.family);
		const schlafli = selected.schlafli ?? hp?.schlafli ?? null;
		return {
			geometry: "hyperbolic",
			label: selected.family,
			faces: hp?.faces ?? [],
			valence: hp?.valence ?? 0,
			edge: selected.edge ?? null,
			provenance: selected.discoverer ?? null,
			schlafli,
			coxeter: schlafli ? `[${schlafli[0]},${schlafli[1]}]` : null,
			orbifold: schlafli ? reflectionOrbifold(schlafli[0], schlafli[1]) : null,
			...base,
		};
	}

	// Euclidean. Prefer the live exact symmetry analysis; fall back to the build-computed fields; derive
	// the orbifold from whichever group we have if the analysis didn't supply one.
	const wallpaperGroup = symmetryData?.group ?? selected.wallpaperGroup ?? null;
	const orbifold =
		symmetryData?.orbifold ?? (wallpaperGroup ? ORBIFOLD_SIGNATURE[wallpaperGroup] : null);
	const latticeShape = symmetryData?.latticeShape ?? selected.latticeShape ?? null;
	// Freedraw: the face analysis IS the tile data (there is no vertex configuration and no wallpaper
	// classification), so `faceOrbits` gets a real value here instead of the flagged "not computed".
	const p = selected.freedraw;
	const stats = p ? summarise(analyseFaces(p)) : null;
	return {
		geometry: "euclidean",
		label: selected.family,
		wallpaperGroup,
		orbifold,
		latticeShape,
		freedraw:
			p && stats
				? {
						lattice: { a: p.a, b: p.b, d: p.d },
						finite: stats.finite,
						strips: stats.strips,
						unbounded: stats.unbounded,
						withHoles: stats.withHoles,
					}
				: null,
		...base,
		faceOrbits: stats ? stats.faceOrbits : base.faceOrbits,
	};
}
