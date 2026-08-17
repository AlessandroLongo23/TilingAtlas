// Build-time generator for the update-notes preview cells.
//
// The /updates page loads its cells server-side at build time (literal paths, force-static) — it
// does not need this. The MODAL does: it lives in the app shell, is opened rarely, and must not
// pull 13 releases' worth of geometry into the client bundle to render three thumbnails.
//
// So this writes ONE static asset, public/updates-cells.json — {id: LandingSpecimen} for the ids
// referenced by the RECENT_RELEASES most recent entries only. ~3 KB a specimen, ~4 ids a release,
// so ~70 KB, fetched once when the modal is about to open and never on a visit that shows nothing.
// Older releases' previews exist only on the page, which has them for free.
//
// Reading by a variable path here is fine: this is a standalone build script, not a function
// entrypoint, so @vercel/nft never traces it (same reasoning as gen-landing-data.ts). Run
// automatically by `pnpm build`; by hand with `pnpm updates:data`.
//
// Coverage: previews are Euclidean-drawable only, the same test the hero pool uses — a non-empty
// render cell on a Euclidean tiling. Hyperbolic, spherical, freedraw, Schwarz and hollow ids have
// no flat render path, so they are skipped here (named in the output) and the entry degrades to a
// text link. Extending previews to those means wiring the curved renderers into a card, which is
// its own piece of work.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";
import { drawableEuclidean, toSpecimen, type LandingSpecimen } from "@/lib/services/landing-core";
import { UPDATES } from "@/lib/updates/entries";
import { shelfPreviewCell } from "@/lib/updates/preview-cells";
import { previewLabel } from "@/lib/updates/preview-ids";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { hydrateRenderCells } from "@/lib/services/renderCellDerive";

/** How many of the newest releases the modal can show previews for. The modal never reaches past
 *  this — a visitor that far behind gets the text and the "see all updates" link. */
const RECENT_RELEASES = 6;

// The same eager set loadReferenceAtlas fetches client-side, minus the lazy k≥8 shards. The base
// atlas is required; every other shard degrades to an empty merge, mirroring the loader.
const EAGER_ATLAS_FILES = [
	"reference-atlas.json", // required
	"reference-atlas-composable.json",
	"reference-atlas-isotoxal.json",
	"reference-atlas-mixed.json",
	"reference-atlas-scaled.json",
	"reference-atlas-polyomino.json",
	"reference-atlas-islamic.json",
	"reference-atlas-hollow.json",
	// The 2026-08 shelves. Eager files only, same as the rest of this list: their lazy k-shards hold
	// most of the entries, so a preview id taken from one of those degrades to a text chip.
	"reference-atlas-euhalf.json",
	"reference-atlas-period.json",
	"reference-atlas-tri45.json",
	"reference-atlas-planigon.json",
	"reference-atlas-penrose.json",
];

const OUT = path.join(process.cwd(), "public", "updates-cells.json");

// Ids must be safe in a URL and a JSON key; every real atlas id is [A-Za-z0-9._-].
const SAFE_ID = /^[A-Za-z0-9._-]+$/;

async function loadAtlas(): Promise<ReferenceTiling[]> {
	const dir = path.join(process.cwd(), "public");
	const parts = await Promise.all(
		EAGER_ATLAS_FILES.map(async (name, i) => {
			try {
				return hydrateRenderCells(decodeAtlas<ReferenceTiling>(JSON.parse(await readFile(path.join(dir, name), "utf8"))));
			} catch (e) {
				if (i === 0) throw e;
				return [] as ReferenceTiling[];
			}
		}),
	);
	return parts.flat();
}

/**
 * Cells for ids the eager set cannot answer, read out of the lazy k-shards.
 *
 * A shelf's most interesting tilings are usually the deep ones, and those live only in a lazy shard:
 * the scaled shelf ships k=1 and k=2 eagerly and everything up to k=7 behind reference-atlas-scaled-k*.
 * Without this, previewing what a release is actually about would be impossible for exactly the
 * releases that most need a picture.
 *
 * Shards are read smallest first and the walk stops as soon as every missing id is found, so the 95 MB
 * k=7 shard is only ever parsed when an id genuinely needs it.
 */
async function fillFromLazyShards(missing: Set<string>): Promise<Map<string, ReferenceTiling>> {
	const found = new Map<string, ReferenceTiling>();
	if (!missing.size) return found;
	const dir = path.join(process.cwd(), "public");
	const shards = (await readdir(dir))
		.filter((f) => /^reference-atlas-.*-k\d+\.json$/.test(f))
		.map((f) => ({ f, size: statSync(path.join(dir, f)).size }))
		.sort((a, b) => a.size - b.size);

	for (const { f } of shards) {
		if (!missing.size) break;
		let records: ReferenceTiling[];
		try {
			records = hydrateRenderCells(decodeAtlas<ReferenceTiling>(JSON.parse(await readFile(path.join(dir, f), "utf8"))));
		} catch {
			continue; // an unreadable shard just leaves its ids without a preview
		}
		for (const t of drawableEuclidean(records)) {
			if (!missing.has(t.id)) continue;
			found.set(t.id, t);
			missing.delete(t.id);
		}
	}
	return found;
}

async function main(): Promise<void> {
	const recent = UPDATES.slice(0, RECENT_RELEASES);
	const wanted: string[] = [];
	for (const entry of recent) {
		for (const change of entry.changes) {
			for (const id of change.tilings ?? []) {
				if (!SAFE_ID.test(id)) {
					console.warn(`updates: skipping unsafe id ${JSON.stringify(id)}`);
					continue;
				}
				if (!wanted.includes(id)) wanted.push(id);
			}
		}
	}

	if (wanted.length === 0) {
		await writeFile(OUT, "{}\n", "utf8");
		console.log(`updates: no preview ids in the newest ${recent.length} releases → {}`);
		return;
	}

	const atlas = await loadAtlas();
	const renderable = new Map(drawableEuclidean(atlas).map((t) => [t.id, t]));

	// Anything the eager set could not answer and that is not a shelf id: look in the lazy shards.
	const stillMissing = new Set(wanted.filter((id) => !renderable.has(id) && !shelfPreviewCell(id)));
	for (const [id, t] of await fillFromLazyShards(stillMissing)) renderable.set(id, t);

	const out: Record<string, LandingSpecimen> = {};
	const skipped: string[] = [];
	for (const id of wanted) {
		const tiling = renderable.get(id);
		if (tiling) {
			out[id] = toSpecimen(tiling);
			continue;
		}
		// A shelf id (lib/updates/preview-ids.ts): built from its type number instead of looked up,
		// because /isohedral and /pentagons solve their geometry and ship no shard. `k` counts vertex
		// orbits in the atlas and is not measured for these; nothing reads it off this asset.
		const shelf = shelfPreviewCell(id);
		if (shelf) out[id] = { id, label: previewLabel(id), k: 0, cell: shelf };
		else skipped.push(id);
	}

	await writeFile(OUT, `${JSON.stringify(out)}\n`, "utf8");

	const kb = Math.round(JSON.stringify(out).length / 1024);
	console.log(
		`updates: ${Object.keys(out).length}/${wanted.length} preview cells (${kb} KB) from the newest ${recent.length} releases`,
	);
	// Not an error: an entry may deliberately point at a hyperbolic or spherical tiling, which has no
	// flat cell. Named so a typo'd id is visible here instead of silently rendering as bare text.
	if (skipped.length) {
		console.warn(`updates: no flat cell for ${skipped.length} id(s) — they render as text links:`);
		for (const id of skipped) console.warn(`  · ${id}`);
	}
}

main().catch((e) => {
	console.error(`updates: ${(e as Error).message}`);
	process.exit(1);
});
