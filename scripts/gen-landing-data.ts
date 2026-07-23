// Build-time generator for the landing-page data.
//
// Writes three things, all so the root serverless function never reads NOR traces the multi-hundred-MB
// public/ tree at runtime:
//   1. lib/services/landing-data.generated.json — the small bundled payload (counts, a seed pool for
//      the hero's instant first paint, the fixed uniform/play/thumbnail picks). Imported by
//      landingData.ts, so it rides in the function bundle.
//   2. public/hero-index.json — the ids of EVERY drawable Euclidean tiling (~25 KB gzipped). The hero
//      client fetches it once and picks from the full set, so every tiling can appear in the banner.
//   3. public/hero-cells/<id>.json — one self-contained specimen ({id,label,k,cell}, ~3 KB) per id.
//      The hero lazy-fetches the chosen one. These are static CDN assets, excluded from every function
//      trace by next.config.ts's outputFileTracingExcludes.
//
// Reading by a variable path here is fine: this is a standalone build script, not a function
// entrypoint, so @vercel/nft never traces it. Run automatically by `pnpm build`; by hand with
// `pnpm landing:data` after regenerating the atlas.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildLandingPayload, drawableEuclidean, toSpecimen } from "@/lib/services/landing-core";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

// The same eager set loadReferenceAtlas fetches client-side for /library, minus the lazy k≥8 shards,
// so the landing counts exactly match the library's scope. The base atlas is required; every other
// shard degrades to an empty merge (best-effort), mirroring loadReferenceAtlas's semantics.
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

const PAYLOAD_OUT = path.join(process.cwd(), "lib", "services", "landing-data.generated.json");
const HERO_INDEX_OUT = path.join(process.cwd(), "public", "hero-index.json");
const HERO_CELLS_DIR = path.join(process.cwd(), "public", "hero-cells");

// Ids must be safe both as a filename and a URL path segment. Every real atlas id is [A-Za-z0-9._-]
// (e.g. "t1003", "ctrnact-07_34-5c2_5e_5f3_6f-1"); anything else is skipped defensively.
const SAFE_ID = /^[A-Za-z0-9._-]+$/;

async function loadAtlas(): Promise<ReferenceTiling[]> {
	const dir = path.join(process.cwd(), "public");
	const parts = await Promise.all(
		EAGER_ATLAS_FILES.map(async (name, i) => {
			try {
				return JSON.parse(await readFile(path.join(dir, name), "utf8")) as ReferenceTiling[];
			} catch (e) {
				if (i === 0) throw e;
				return [] as ReferenceTiling[];
			}
		}),
	);
	return parts.flat();
}

async function writeInBatches(entries: [string, string][], batch = 256): Promise<void> {
	for (let i = 0; i < entries.length; i += batch) {
		await Promise.all(
			entries.slice(i, i + batch).map(([file, body]) => writeFile(file, body, "utf8")),
		);
	}
}

async function main(): Promise<void> {
	const atlas = await loadAtlas();

	// 1. Bundled payload.
	const payload = buildLandingPayload(atlas);
	await writeFile(PAYLOAD_OUT, `${JSON.stringify(payload)}\n`, "utf8");

	// 2 + 3. Full hero index + per-cell files.
	const specimens = drawableEuclidean(atlas).map(toSpecimen);
	const safe = specimens.filter((s) => SAFE_ID.test(s.id));
	const skipped = specimens.length - safe.length;

	await rm(HERO_CELLS_DIR, { recursive: true, force: true }); // drop ids that left the atlas
	await mkdir(HERO_CELLS_DIR, { recursive: true });
	await writeFile(HERO_INDEX_OUT, `${JSON.stringify(safe.map((s) => s.id))}\n`, "utf8");
	await writeInBatches(
		safe.map((s) => [path.join(HERO_CELLS_DIR, `${s.id}.json`), JSON.stringify(s)]),
	);

	const { euclidean, hyperbolic, spherical, total } = payload.counts;
	console.log(
		`landing-data.generated.json: ${total} tilings → seed pool ${payload.euclideanPool.length}, ` +
			`counts E${euclidean}/H${hyperbolic}/S${spherical}, play ${payload.play.id}, ` +
			`hyp ${payload.hyperbolicPatch}, sph ${payload.sphericalSolid}`,
	);
	console.log(
		`hero: ${safe.length} per-cell files + index${skipped ? ` (${skipped} ids skipped: unsafe chars)` : ""}`,
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
