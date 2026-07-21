// Server-only loader for the Atlas Wall landing page. Reads the static atlas JSONs from public/
// with node:fs (same pattern as the old landing page) and serves the wall's inputs: the t1003
// stage cell, the eleven uniform tilings, live shelf counts, and per-request specimen picks.
// NOT re-exported from any barrel — importing this in a client component breaks the build.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TranslationalCellData } from "@/classes/algorithm/types";

interface AtlasEntry {
	id: string;
	k?: number;
	family?: string;
	renderCell?: TranslationalCellData | null;
	developed?: { patch?: string };
	spherical?: { solid?: string };
}

export interface LandingData {
	wallCell: TranslationalCellData;
	uniform11: { id: string; family: string; cell: TranslationalCellData }[];
	euclideanCount: number;
	hyperbolicCount: number;
	sphericalCount: number;
	dailyEntry: { id: string; k: number; kCount: number; cell: TranslationalCellData };
	specimenEntries: { id: string; cell: TranslationalCellData }[];
	libraryMosaic: TranslationalCellData[];
	playPatch: { id: string; cell: TranslationalCellData };
	capHyperbolicPatch: string;
	capHyperbolicId: string;
	capSphericalSolid: string;
	capSphericalId: string;
	dateSeed: number;
}

// The eager Euclidean shelf files merged by the /library view (lib/services/referenceAtlas.ts) —
// the masthead count must match what the library actually shows.
const EUCLIDEAN_FILES = [
	"reference-atlas.json",
	"reference-atlas-composable.json",
	"reference-atlas-isotoxal.json",
	"reference-atlas-mixed.json",
	"reference-atlas-scaled.json",
	"reference-atlas-polyomino.json",
	"reference-atlas-islamic.json",
];

let cache: {
	base: AtlasEntry[];
	euclideanCount: number;
	hyperbolic: AtlasEntry[];
	spherical: AtlasEntry[];
} | null = null;

async function readAtlas(file: string): Promise<AtlasEntry[]> {
	try {
		const raw = await readFile(path.join(process.cwd(), "public", file), "utf8");
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as AtlasEntry[]) : [];
	} catch (e) {
		console.warn(`landingData: ${file} unavailable —`, e);
		return [];
	}
}

async function loadFiles() {
	if (cache) return cache;
	const [base, ...rest] = await Promise.all(EUCLIDEAN_FILES.map(readAtlas));
	const hyperbolic = await readAtlas("reference-atlas-hyperbolic.json");
	const spherical = await readAtlas("reference-atlas-spherical.json");
	cache = {
		base,
		euclideanCount: base.length + rest.reduce((sum, a) => sum + a.length, 0),
		hyperbolic,
		spherical,
	};
	return cache;
}

function pick<T>(arr: T[], rand: () => number): T {
	return arr[Math.floor(rand() * arr.length)];
}

export async function loadLandingData(): Promise<LandingData> {
	const { base, euclideanCount, hyperbolic, spherical } = await loadFiles();

	const withCell = base.filter((e): e is AtlasEntry & { renderCell: TranslationalCellData } => !!e.renderCell);
	const t1003 = withCell.find((e) => e.id === "t1003");
	if (!t1003) throw new Error("landingData: t1003 (4.6.12) missing from reference-atlas.json");

	const uniform11 = withCell
		.filter((e) => /^t10(0[1-9]|1[01])$/.test(e.id))
		.map((e) => ({ id: e.id, family: e.family ?? "", cell: e.renderCell }));

	// Daily specimen: date-seeded from the legible pool (small unit cells render honestly inside
	// one hexagon). Shared by everyone that UTC day, so it has a citable identity.
	const now = new Date();
	const dateSeed =
		now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
	const legible = withCell.filter((e) => {
		const polys = e.renderCell.p ?? e.renderCell.cellPolygons ?? [];
		return polys.length > 0 && polys.length <= 12;
	});
	const daily = legible[dateSeed % legible.length];
	const dailyK = daily.k ?? 1;
	const kCount = base.filter((e) => e.k === dailyK).length;

	// Per-request picks (Math.random is fine here: the page is force-dynamic and variety is a feature).
	const rand = Math.random;
	const specimenEntries = Array.from({ length: 80 }, () => {
		const e = pick(legible, rand);
		return { id: e.id, cell: e.renderCell };
	});
	const libraryMosaic = Array.from({ length: 9 }, () => pick(legible, rand).renderCell);

	const stars = legible.filter((e) => (e.family ?? "").includes("*"));
	const playSource = stars.length > 0 ? pick(stars, rand) : pick(legible, rand);

	const capHypEntry = hyperbolic.find((e) => !!e.developed?.patch);
	const capSphEntry =
		spherical.find((e) => e.spherical?.solid === "truncated-icosahedron") ??
		spherical.find((e) => !!e.spherical?.solid);

	return {
		wallCell: t1003.renderCell,
		uniform11,
		euclideanCount,
		hyperbolicCount: hyperbolic.length,
		sphericalCount: spherical.length,
		dailyEntry: { id: daily.id, k: dailyK, kCount, cell: daily.renderCell },
		specimenEntries,
		libraryMosaic,
		playPatch: { id: playSource.id, cell: playSource.renderCell },
		capHyperbolicPatch: capHypEntry?.developed?.patch ?? "",
		capHyperbolicId: capHypEntry?.id ?? "",
		capSphericalSolid: capSphEntry?.spherical?.solid ?? "",
		capSphericalId: capSphEntry?.id ?? "",
		dateSeed,
	};
}
