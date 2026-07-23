import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractTableOfContents, structureTableOfContents } from "@/lib/utils/tableOfContents";
import { TheoryClient } from "../_theory-client";

export const dynamic = "force-static";

// The freedraw-method background page: Marek Čtrnáct's edge-subset construction, planar grids and the
// five Platonic solids. Pure prose (no embedded tiling cards — the spherical previews live in the
// interactive /freedraw/sphere viewer, linked from the text), so it needs no atlas cells.
async function loadTheoryMarkdown(): Promise<string> {
	try {
		const filePath = path.join(process.cwd(), "public", "theory", "freedraw.md");
		const raw = await readFile(filePath, "utf8");
		// Force $$…$$ fences onto their own lines — micromark's math-flow parser requires this.
		return raw.replace(/\$\$([\s\S]+?)\$\$/g, (_, body) => `\n\n$$\n${body.trim()}\n$$\n\n`);
	} catch {
		return "";
	}
}

export default async function FreedrawTheoryPage() {
	const content = await loadTheoryMarkdown();
	const flatToc = extractTableOfContents(content);
	const sections = structureTableOfContents(flatToc);
	return <TheoryClient content={content} sections={sections} cells={{}} currentSlug="freedraw" />;
}
