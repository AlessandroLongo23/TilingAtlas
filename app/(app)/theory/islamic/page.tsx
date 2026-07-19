import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractTableOfContents, structureTableOfContents } from "@/lib/utils/tableOfContents";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import { TheoryClient } from "../_theory-client";

export const dynamic = "force-static";

// The Islamic geometric systems background page: Bonner's design systems (the underlying tessellations)
// with interactive previews of the curated Islamic-category tilings. The cells come from the same
// public/reference-atlas-islamic.json the /library and /play shelves read, embedded directly (a few KB)
// so the page never pulls the multi-MB base atlas.
async function loadTheoryMarkdown(): Promise<string> {
	try {
		const filePath = path.join(process.cwd(), "public", "theory", "islamic-patterns.md");
		const raw = await readFile(filePath, "utf8");
		// Force $$…$$ fences onto their own lines — micromark's math-flow parser requires this.
		return raw.replace(/\$\$([\s\S]+?)\$\$/g, (_, body) => `\n\n$$\n${body.trim()}\n$$\n\n`);
	} catch {
		return "";
	}
}

async function loadIslamicCells(): Promise<Record<string, TranslationalCellData>> {
	try {
		const filePath = path.join(process.cwd(), "public", "reference-atlas-islamic.json");
		const atlas = JSON.parse(await readFile(filePath, "utf8")) as {
			id: string;
			renderCell: TranslationalCellData;
		}[];
		const cells: Record<string, TranslationalCellData> = {};
		// Only the curated entries are embedded as theory cards; the ~90 engine-developed girih tilings
		// (isl-girih-*) live in the /library and /play shelves, not on this page — skip them to keep the
		// page payload small.
		for (const t of atlas) if (!t.id.startsWith("isl-girih-")) cells[t.id] = t.renderCell;
		return cells;
	} catch {
		return {};
	}
}

export default async function IslamicTheoryPage() {
	const [content, cells] = await Promise.all([loadTheoryMarkdown(), loadIslamicCells()]);
	const flatToc = extractTableOfContents(content);
	const sections = structureTableOfContents(flatToc);
	return <TheoryClient content={content} sections={sections} cells={cells} />;
}
