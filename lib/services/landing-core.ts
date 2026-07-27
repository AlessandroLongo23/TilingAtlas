import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import type { CataloguePatch } from "@/lib/render/hyperbolicDevelopedDraw";
import {
	type ReferenceTiling,
	compactVertexConfig,
	geometryOf,
} from "@/lib/services/referenceAtlas";

// Pure landing-page logic, shared by the runtime loader (landingData.ts) and the build-time
// generator (scripts/gen-landing-data.ts). Deliberately imports NEITHER node:fs NOR the generated
// payload, so the generator can build the payload without a circular import back onto its own output.

export interface LandingCounts {
	euclidean: number;
	hyperbolic: number;
	spherical: number;
	total: number;
}

export interface LandingSpecimen {
	id: string;
	/** Compact display label (Grünbaum–Shephard superscript form of the family string). */
	label: string;
	k: number;
	cell: TranslationalCellData;
}

export interface LandingData {
	counts: LandingCounts;
	/** Rotation pool for the hero: distinct random Euclidean specimens; the client cycles through
	 *  them with the radial-wave transition. First entry is the one on stage at load. */
	heroPool: LandingSpecimen[];
	/** 3×3 mosaic for the Library card — distinct random Euclidean entries. */
	mosaic: LandingSpecimen[];
	/** The 11 uniform tilings (Galebach k=1 regular shelf), ordered by id — the Theory ring. */
	uniformEleven: LandingSpecimen[];
	/** Cell for the Play card's interactive patch (4.6.12, the truncated trihexagonal). */
	play: LandingSpecimen;
	/** Developed-patch id for the Hyperbolic card. */
	hyperbolicPatch: string | null;
	/** The record for that patch, so the card renders without fetching the 9.9 MB developed catalogue
	 *  to read one 350-byte entry out of it. Null if the payload predates the inlining. */
	hyperbolicPatchData: CataloguePatch | null;
	/** Solid id for the Spherical card. */
	sphericalSolid: string | null;
}

/** The small artifact scripts/gen-landing-data.ts bakes at build time and the runtime loader reads
 *  instead of the ~23 MB atlas. `euclideanPool` is a capped, deterministic sample; the runtime
 *  shuffles it per request into the hero pool and mosaic. */
export interface LandingPayload {
	counts: LandingCounts;
	euclideanPool: LandingSpecimen[];
	uniformEleven: LandingSpecimen[];
	play: LandingSpecimen;
	/** Renderable developed-patch ids the Hyperbolic card picks one from per request (one representative
	 *  per vertex-config family, so successive reloads look different, not two near-identical 7.7.7s). */
	hyperbolicPool: string[];
	/** The developed record for every id in `hyperbolicPool`, inlined by the generator. A record is
	 *  ~350 bytes, so the whole pool is ~20 KB in the function bundle — against a 9.9 MB client fetch
	 *  of public/hyperbolic-developed.json (28,453 records) to read exactly one of them. Absent on a
	 *  payload generated before this existed; the card falls back to the fetch. */
	hyperbolicPatches?: Record<string, CataloguePatch>;
	/** Distinct spherical solid ids the Spherical card picks one from per request. */
	sphericalPool: string[];
	/** Stable fallbacks used only if the pool is empty (kept from the original fixed picks). */
	hyperbolicPatch: string | null;
	sphericalSolid: string | null;
}

export function countsOf(atlas: ReferenceTiling[]): LandingCounts {
	const counts = { euclidean: 0, hyperbolic: 0, spherical: 0, total: atlas.length };
	for (const t of atlas) counts[geometryOf(t)]++;
	return counts;
}

export function toSpecimen(t: ReferenceTiling): LandingSpecimen {
	return { id: t.id, label: compactVertexConfig(t.family), k: t.k, cell: t.renderCell };
}

/** The 11 uniform tilings: the Galebach k=1 regular shelf, ordered by id (t1001…t1011). */
export function pickUniformEleven(atlas: ReferenceTiling[]): ReferenceTiling[] {
	return atlas
		.filter((t) => t.source === "galebach" && t.k === 1 && !t.family.includes("*"))
		.sort((a, b) => a.id.localeCompare(b.id));
}

/** Distinct random picks (Fisher–Yates prefix) — rng injectable for tests. */
export function pickDistinct<T>(pool: T[], n: number, rng: () => number = Math.random): T[] {
	const arr = [...pool];
	const take = Math.min(n, arr.length);
	for (let i = 0; i < take; i++) {
		const j = i + Math.floor(rng() * (arr.length - i));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr.slice(0, take);
}

/** A render cell is drawable iff it carries at least one polygon — the hero and mosaic must never
 *  pick an empty throwaway cell (hyperbolic/spherical entries carry one; Euclidean ones don't). */
function isDrawable(cell: TranslationalCellData | undefined): boolean {
	const polys = (cell?.p ?? cell?.cellPolygons ?? []) as unknown[];
	return polys.length > 0;
}

/** Every Euclidean tiling with a non-empty render cell — the full set the hero banner may show and
 *  the source both for the baked seed pool and the on-demand per-cell hero files. */
export function drawableEuclidean(atlas: ReferenceTiling[]): ReferenceTiling[] {
	return atlas.filter(
		(t) => geometryOf(t) === "euclidean" && t.renderCell && isDrawable(t.renderCell),
	);
}

/** Deterministic PRNG so the committed pool is stable across rebuilds (only the atlas changing it). */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Deterministic seed-pool sample the runtime shuffles per request into the 14-slot hero pool and
 *  9-slot mosaic. Only the *instant* first-paint set — the hero then lazy-fetches from the full
 *  per-cell hero files (scripts/gen-landing-data.ts) so every Euclidean tiling can appear. Kept small
 *  since the long tail no longer rides in the bundled payload. */
const POOL_SIZE = 24;
const POOL_SEED = 0x7ee1a71a;

// The Hyperbolic card rotates through one representative patch per family, capped and shuffled
// deterministically so the committed pool is stable across rebuilds.
const HYP_POOL_SIZE = 64;
const HYP_POOL_SEED = 0x3c6ef372;

/** Build the runtime payload from the full atlas — counts over every geometry, a capped drawable
 *  Euclidean pool, the fixed uniform/play/thumbnail picks. Pure; used by the build-time generator. */
export function buildLandingPayload(
	atlas: ReferenceTiling[],
	poolSize: number = POOL_SIZE,
): LandingPayload {
	const euclideanDrawable = drawableEuclidean(atlas);
	const euclideanPool = pickDistinct(euclideanDrawable, poolSize, mulberry32(POOL_SEED)).map(
		toSpecimen,
	);

	const eleven = pickUniformEleven(atlas);
	// 4.6.12 (t1003) is the Play card's fallback patch — big dodecagons read well at card size. The
	// runtime re-picks the Play specimen from euclideanPool per request, so this is only the seed.
	const play = atlas.find((t) => t.id === "t1003") ?? eleven[0] ?? euclideanDrawable[0];

	// Hyperbolic pool: one representative patch per vertex-config family (7.7.7, 3.3.3.3.7, 4.4.4.5, …),
	// so the card shows a genuinely different tiling each reload instead of near-identical siblings.
	const hypByFamily = new Map<string, string>();
	for (const t of atlas) {
		const patch = t.developed?.patch;
		if (patch && !hypByFamily.has(t.family)) hypByFamily.set(t.family, patch);
	}
	const hyperbolicPool = pickDistinct([...hypByFamily.values()], HYP_POOL_SIZE, mulberry32(HYP_POOL_SEED));
	// The truncated icosahedron (the football) is the most instantly readable sphere at card size — the
	// fallback if the pool is empty.
	const hypSeven = atlas.find((t) => t.developed && t.family === "7.7.7");
	const hypFirst = atlas.find((t) => t.developed);

	// Spherical pool: every distinct solid the catalogue carries (Platonic, Archimedean, prisms,
	// Johnson), in first-appearance order — all 40 render from their id alone.
	const sphBySolid = new Set<string>();
	for (const t of atlas) {
		const solid = t.spherical?.solid;
		if (solid) sphBySolid.add(solid);
	}
	const sphericalPool = [...sphBySolid];
	const sphBall = atlas.find((t) => t.spherical?.solid === "truncated-icosahedron");
	const sphFirst = atlas.find((t) => t.spherical);

	return {
		counts: countsOf(atlas),
		euclideanPool,
		uniformEleven: eleven.map(toSpecimen),
		play: toSpecimen(play),
		hyperbolicPool,
		sphericalPool,
		hyperbolicPatch: (hypSeven ?? hypFirst)?.developed?.patch ?? null,
		sphericalSolid: (sphBall ?? sphFirst)?.spherical?.solid ?? null,
	};
}
