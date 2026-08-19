import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractTableOfContents, structureTableOfContents } from "@/lib/utils/tableOfContents";
import type { PipelineRecord } from "@/lib/squaring/shelf";
import { TheoryClient } from "../_theory-client";

export const dynamic = "force-static";

// The Brooks-Smith-Stone-Tutte correspondence, run over the atlas's own polyhedra: every convex solid
// in the catalogue yields squared rectangles, one per edge orbit, and the low-symmetry ones yield
// perfect ones.
//
// The figures come from public/squarings/pipeline/, which scripts/build-squaring-shelf.ts writes. The
// route is force-static, so those records are read at BUILD time and the browser is handed only the six
// the markdown names — the same discipline as the hyperbolic route with its 11.6 MB catalogue.

async function loadTheoryMarkdown(): Promise<string> {
	try {
		const filePath = path.join(process.cwd(), "public", "theory", "perfect-rectangles.md");
		const raw = await readFile(filePath, "utf8");
		// Force $$…$$ fences onto their own lines — micromark's math-flow parser requires this.
		return raw.replace(/\$\$([\s\S]+?)\$\$/g, (_, body) => `\n\n$$\n${body.trim()}\n$$\n\n`);
	} catch {
		return "";
	}
}

/**
 * The solids the markdown embeds, read out of the markdown itself so the prose and the data cannot
 * drift apart. Adding a card to the article is a markdown edit and nothing else.
 */
function embeddedSolids(markdown: string): string[] {
	return [...markdown.matchAll(/<squaring-card\b[^>]*>/g)].flatMap(
		(m) => m[0].match(/\bsolid="([^"]+)"/)?.[1] ?? [],
	);
}

/**
 * Load one pipeline record per embedded solid.
 *
 * The article's figures now show the solid beside its rectangle and link into the four-stage page, so
 * they need the same record that page uses: 3D geometry, the battery, the solve. Those live in
 * public/squarings/pipeline/, which is the curated set — every solid the article names is in it,
 * because the article only shows rectangles small enough to print their numbers, which is the same
 * legibility rule the curation applies.
 */
async function loadRecords(ids: string[]): Promise<Record<string, PipelineRecord>> {
	const out: Record<string, PipelineRecord> = {};
	for (const id of new Set(ids)) {
		try {
			const filePath = path.join(process.cwd(), "public", "squarings", "pipeline", `${id}.json`);
			out[id] = JSON.parse(await readFile(filePath, "utf8")) as PipelineRecord;
		} catch {
			// Leave it out; the client renders a visible placeholder naming the id it could not find.
		}
	}
	return out;
}

export default async function PerfectRectanglesTheoryPage() {
	const content = await loadTheoryMarkdown();
	const squarings = await loadRecords(embeddedSolids(content));
	const flatToc = extractTableOfContents(content);
	const sections = structureTableOfContents(flatToc);
	return (
		<TheoryClient
			content={content}
			sections={sections}
			cells={{}}
			squarings={squarings}
			currentSlug="perfect-rectangles"
		/>
	);
}
