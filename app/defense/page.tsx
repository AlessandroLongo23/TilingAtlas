import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { parseSlides, referencedTilingIds } from "@/lib/defense/slides";
import { DefenseClient } from "./_defense-client";
import { loadAtlasCells } from "@/lib/about/load";

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
	const { cells, sources } = await loadAtlasCells(referencedTilingIds(talk));
	return (
		<>
			<script dangerouslySetInnerHTML={{ __html: PIN_LIGHT }} />
			<DefenseClient slides={slides} cells={cells} sources={sources} />
		</>
	);
}
