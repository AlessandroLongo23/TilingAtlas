import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import { parseSlides, referencedTilingIds } from "@/lib/defense/slides";
import { DefenseClient } from "./_defense-client";

export const dynamic = "force-static";

// Deployed but unlisted: reachable by direct URL, absent from every navigation, and told not to
// be indexed. Deliberately OUTSIDE the (app) route group so it renders on the bare root layout
// with no Nav and no app chrome — a presentation owns the whole viewport.
export const metadata: Metadata = {
	title: "Defense",
	robots: { index: false, follow: false, nocache: true },
};

async function loadTalk(): Promise<string> {
	try {
		const filePath = path.join(process.cwd(), "public", "defense", "talk.md");
		return await readFile(filePath, "utf8");
	} catch {
		return "";
	}
}

// Only what the talk actually embeds. The full atlas is ~13 MB; a deck referencing a handful of
// tilings should ship kilobytes, the same discipline /theory/uniform-tilings follows. Two atlases are
// read: the regular catalogue, and the mixed one, which is where the star-polygon tilings live (the
// "not every tile is regular" slide needs a counterexample the regular atlas cannot supply).
// `exactSource` rides along because the orbit card recomputes the vertex partition from it.
async function loadCells(
	ids: string[],
): Promise<{
	cells: Record<string, TranslationalCellData>;
	sources: Record<string, ExactCellSource>;
}> {
	const cells: Record<string, TranslationalCellData> = {};
	const sources: Record<string, ExactCellSource> = {};
	if (ids.length === 0) return { cells, sources };
	const wanted = new Set(ids);
	for (const file of [
		"reference-atlas.json",
		"reference-atlas-mixed.json",
		"reference-atlas-polyomino.json",
		"reference-atlas-scaled.json",
	]) {
		try {
			const raw = await readFile(path.join(process.cwd(), "public", file), "utf8");
			const atlas = JSON.parse(raw) as {
				id: string;
				renderCell: TranslationalCellData;
				exactSource?: ExactCellSource;
			}[];
			for (const t of atlas) {
				if (!wanted.has(t.id)) continue;
				cells[t.id] = t.renderCell;
				if (t.exactSource) sources[t.id] = t.exactSource;
			}
		} catch {
			// A missing atlas just means those ids render as "unknown tiling id" on the slide.
		}
	}
	return { cells, sources };
}

export default async function DefensePage() {
	const talk = await loadTalk();
	const slides = parseSlides(talk);
	const { cells, sources } = await loadCells(referencedTilingIds(talk));
	return <DefenseClient slides={slides} cells={cells} sources={sources} />;
}
