import { readFile, readdir } from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { UPDATES } from "@/lib/updates/entries";
import { shelfPreviewCell } from "@/lib/updates/preview-cells";
import { previewIdsIn } from "@/lib/updates/unseen";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import { UpdatesClient } from "./_updates-client";

export const dynamic = "force-static";

export const metadata: Metadata = {
	title: "Updates · The Tiling Atlas",
	description: "What has changed in the Atlas, release by release.",
};

// The full history behind the "what's new" modal. Static: lib/updates/entries.ts is the source, and
// the preview cells are read out of the atlas at BUILD time — the same discipline as the theory
// routes, so the browser never fetches a catalogue to show four thumbnails.
//
// Unlike the modal (which lazy-fetches public/updates-cells.json and covers only the newest six
// releases), this page can afford every referenced id, so it reads them all here.

const ATLAS_FILES = [
	"reference-atlas.json",
	"reference-atlas-composable.json",
	"reference-atlas-isotoxal.json",
	"reference-atlas-mixed.json",
	"reference-atlas-scaled.json",
	"reference-atlas-polyomino.json",
	"reference-atlas-islamic.json",
	"reference-atlas-hollow.json",
	// Keep in step with EAGER_ATLAS_FILES in scripts/gen-updates-data.ts: that list feeds the modal,
	// this one feeds the page, and a shelf missing here shows its release with no picture.
	"reference-atlas-euhalf.json",
	"reference-atlas-period.json",
	"reference-atlas-tri45.json",
	"reference-atlas-planigon.json",
	"reference-atlas-penrose.json",
];

async function loadCells(ids: string[]): Promise<Record<string, TranslationalCellData>> {
	if (!ids.length) return {};
	const wanted = new Set(ids);
	const dir = path.join(process.cwd(), "public");
	const out: Record<string, TranslationalCellData> = {};
	// The shelf ids first: they are solved here, not looked up, and no shard will ever answer for one.
	for (const id of wanted) {
		const cell = shelfPreviewCell(id);
		if (cell) out[id] = cell;
	}
	for (const name of ATLAS_FILES) {
		try {
			const all: ReferenceTiling[] = JSON.parse(await readFile(path.join(dir, name), "utf8"));
			for (const t of all) {
				if (wanted.has(t.id) && t.renderCell && !out[t.id]) out[t.id] = t.renderCell;
			}
		} catch {
			// A shard that is absent or unreadable just leaves its ids without a preview.
		}
	}

	// Whatever is left lives in a lazy k-shard, which is where a shelf's deeper tilings are: the scaled
	// shelf ships k=1 and k=2 eagerly and reaches k=7 only here. Smallest shard first, stopping the
	// moment nothing is missing, so the big ones are read only when an id needs them.
	const missing = [...wanted].filter((id) => !out[id]);
	if (missing.length) {
		const left = new Set(missing);
		const shards = (await readdir(dir))
			.filter((f) => /^reference-atlas-.*-k\d+\.json$/.test(f))
			.map((f) => ({ f, size: statSync(path.join(dir, f)).size }))
			.sort((a, b) => a.size - b.size);
		for (const { f } of shards) {
			if (!left.size) break;
			try {
				const all: ReferenceTiling[] = JSON.parse(await readFile(path.join(dir, f), "utf8"));
				for (const t of all) {
					if (left.has(t.id) && t.renderCell) {
						out[t.id] = t.renderCell;
						left.delete(t.id);
					}
				}
			} catch {
				// same as above: an unreadable shard costs a preview, not the page
			}
		}
	}
	return out;
}

export default async function UpdatesPage() {
	const cells = await loadCells(previewIdsIn(UPDATES));
	return <UpdatesClient entries={UPDATES} cells={cells} />;
}
