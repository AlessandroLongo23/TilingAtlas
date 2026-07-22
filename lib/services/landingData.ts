import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import {
	type ReferenceTiling,
	compactVertexConfig,
	geometryOf,
} from "@/lib/services/referenceAtlas";

// Server-only data loader for the landing page (app/page.tsx). Reads the EAGER atlas files — the
// same set loadReferenceAtlas fetches client-side for /library, minus the lazy k≥8 shards — so the
// landing's headline counts are exactly the library's scope and can never disagree with it.
// Parsed files are cached per server process; the random picks (hero specimen, mosaic) are fresh
// per call, and the page is force-dynamic, so every request gets a new specimen.
//
// NOT re-exported from any barrel: imports node:fs, so it must only be pulled by server code.

const EAGER_ATLAS_FILES = [
	"reference-atlas.json", // required
	"reference-atlas-composable.json",
	"reference-atlas-isotoxal.json",
	"reference-atlas-mixed.json",
	"reference-atlas-scaled.json",
	"reference-atlas-polyomino.json",
	"reference-atlas-islamic.json",
	"reference-atlas-hyperbolic.json",
	"reference-atlas-spherical.json",
];

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
	/** Developed-patch id for the Hyperbolic card thumbnail. */
	hyperbolicPatch: string | null;
	/** Solid id for the Spherical card thumbnail. */
	sphericalSolid: string | null;
}

let atlasCache: ReferenceTiling[] | null = null;

async function loadEagerAtlas(): Promise<ReferenceTiling[]> {
	if (atlasCache) return atlasCache;
	const dir = path.join(process.cwd(), "public");
	const parts = await Promise.all(
		EAGER_ATLAS_FILES.map(async (name, i) => {
			try {
				const raw = await readFile(path.join(dir, name), "utf8");
				return JSON.parse(raw) as ReferenceTiling[];
			} catch (e) {
				// The base atlas is a hard dependency; every shard degrades to an empty merge,
				// mirroring loadReferenceAtlas's best-effort semantics.
				if (i === 0) throw e;
				return [] as ReferenceTiling[];
			}
		}),
	);
	atlasCache = parts.flat();
	return atlasCache;
}

export function countsOf(atlas: ReferenceTiling[]): LandingCounts {
	const counts = { euclidean: 0, hyperbolic: 0, spherical: 0, total: atlas.length };
	for (const t of atlas) counts[geometryOf(t)]++;
	return counts;
}

function toSpecimen(t: ReferenceTiling): LandingSpecimen {
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

export async function loadLandingData(rng: () => number = Math.random): Promise<LandingData> {
	const atlas = await loadEagerAtlas();
	const euclidean = atlas.filter((t) => geometryOf(t) === "euclidean" && t.renderCell);

	const eleven = pickUniformEleven(atlas);
	// Hero pool: every drawable Euclidean entry. The mosaic re-picks independently — a duplicate
	// between the pools is harmless and rare.
	const heroPool = pickDistinct(euclidean, 14, rng);
	const mosaic = pickDistinct(euclidean, 9, rng);

	// 4.6.12 (t1003) is the Play card's demo patch — big dodecagons read well at card size.
	const play = atlas.find((t) => t.id === "t1003") ?? eleven[0] ?? heroPool[0];

	const hypSeven = atlas.find((t) => t.developed && t.family === "7.7.7");
	const hypFirst = atlas.find((t) => t.developed);
	// The truncated icosahedron (the football) is the most instantly readable sphere at card size.
	const sphBall = atlas.find((t) => t.spherical?.solid === "truncated-icosahedron");
	const sphFirst = atlas.find((t) => t.spherical);

	return {
		counts: countsOf(atlas),
		heroPool: heroPool.map(toSpecimen),
		mosaic: mosaic.map(toSpecimen),
		uniformEleven: eleven.map(toSpecimen),
		play: toSpecimen(play),
		hyperbolicPatch: (hypSeven ?? hypFirst)?.developed?.patch ?? null,
		sphericalSolid: (sphBall ?? sphFirst)?.spherical?.solid ?? null,
	};
}
