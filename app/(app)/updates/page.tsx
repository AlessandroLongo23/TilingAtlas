import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { UPDATES } from "@/lib/updates/entries";
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
];

async function loadCells(ids: string[]): Promise<Record<string, TranslationalCellData>> {
	if (!ids.length) return {};
	const wanted = new Set(ids);
	const dir = path.join(process.cwd(), "public");
	const out: Record<string, TranslationalCellData> = {};
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
	return out;
}

export default async function UpdatesPage() {
	const cells = await loadCells(previewIdsIn(UPDATES));
	return <UpdatesClient entries={UPDATES} cells={cells} />;
}
