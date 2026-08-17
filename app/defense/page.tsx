import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import { parseSlides, referencedTilingIds } from "@/lib/defense/slides";
import { DefenseClient } from "./_defense-client";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { hydrateRenderCells } from "@/lib/services/renderCellDerive";

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
			const atlas = hydrateRenderCells(decodeAtlas<{
				id: string;
				renderCell: TranslationalCellData;
				exactSource?: ExactCellSource;
			}>(JSON.parse(raw)));
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

/**
 * The deck is always light, whatever the machine it is presented from is set to.
 *
 * The root layout picks the theme from `localStorage.theme`, falling back to the OS setting, so a
 * laptop in dark appearance with no stored preference opens /defense in dark — and every figure in
 * the deck is drawn in fixed inks on fixed pastel fills (`lib/render/figureGlyphs.ts` hardcodes
 * rgba(20,20,20,…), the tile colours come from the atlas's own hues). On a dark surface the strokes
 * disappear: measured on slide 30, the mirror-break panel goes blank and the false-closure hexagons
 * vanish, leaving their marker dots floating. That is every canvas figure in the deck, not one slide,
 * and it would happen on the day without warning.
 *
 * The script runs during parse, before the deck paints, so there is no flash. It is scoped to this
 * route; nothing else in the atlas changes.
 */
const PIN_LIGHT = `document.documentElement.classList.remove('dark');`;

export default async function DefensePage() {
	const talk = await loadTalk();
	const slides = parseSlides(talk);
	const { cells, sources } = await loadCells(referencedTilingIds(talk));
	return (
		<>
			<script dangerouslySetInnerHTML={{ __html: PIN_LIGHT }} />
			<DefenseClient slides={slides} cells={cells} sources={sources} />
		</>
	);
}
