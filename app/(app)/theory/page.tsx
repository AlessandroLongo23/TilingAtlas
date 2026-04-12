import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractTableOfContents, structureTableOfContents } from "@/lib/utils/tableOfContents";
import { TheoryClient } from "./_theory-client";

export const dynamic = "force-static";

async function loadAlgorithmMarkdown(): Promise<string> {
	// The authored theory content lives in public/theory/algorithm.md so it's
	// also served as a static asset. RSC reads it from disk for SSR.
	try {
		const filePath = path.join(process.cwd(), "public", "theory", "algorithm.md");
		const raw = await readFile(filePath, "utf8");
		// Force $$…$$ fences onto their own lines — micromark's math-flow parser
		// requires this, and authored content (Obsidian) often doesn't.
		return raw.replace(/\$\$([\s\S]+?)\$\$/g, (_, body) => `\n\n$$\n${body.trim()}\n$$\n\n`);
	} catch {
		return "";
	}
}

export default async function TheoryPage() {
	const content = await loadAlgorithmMarkdown();
	const flatToc = extractTableOfContents(content);
	const sections = structureTableOfContents(flatToc);
	return <TheoryClient content={content} sections={sections} />;
}
