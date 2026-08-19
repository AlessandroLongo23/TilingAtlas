import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractTableOfContents, structureTableOfContents } from "@/lib/utils/tableOfContents";
import { TheoryClient } from "../_theory-client";

export const dynamic = "force-static";

// The background for /automata: what is known about Life on non-square tilings, the reading of a B/S
// string that a mixed-degree tiling leaves undetermined, why the board is the plane and not a torus, and
// what the periodicity of a tiling buys the simulator. Prose only — the tool is the route, this is the
// argument behind its controls.

async function loadTheoryMarkdown(): Promise<string> {
	try {
		const filePath = path.join(process.cwd(), "public", "theory", "automata.md");
		const raw = await readFile(filePath, "utf8");
		// Force $$…$$ fences onto their own lines — micromark's math-flow parser requires this.
		return raw.replace(/\$\$([\s\S]+?)\$\$/g, (_, body) => `\n\n$$\n${body.trim()}\n$$\n\n`);
	} catch {
		return "";
	}
}

export default async function AutomataTheoryPage() {
	const content = await loadTheoryMarkdown();
	const flatToc = extractTableOfContents(content);
	const sections = structureTableOfContents(flatToc);
	return <TheoryClient content={content} sections={sections} cells={{}} patches={{}} currentSlug="automata" />;
}
