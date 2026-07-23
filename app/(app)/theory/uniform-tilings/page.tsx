import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractTableOfContents, structureTableOfContents } from "@/lib/utils/tableOfContents";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import { TheoryClient } from "../_theory-client";

export const dynamic = "force-static";

// The 11 uniform (1-uniform) Euclidean tilings, as certified in the reference atlas: 3 regular +
// 8 semiregular. The page embeds their render cells directly (≈8 KB total), so it never pulls the
// ~13 MB atlas the /play browser fetches. (Moved from /theory when that route became the index.)
const UNIFORM_IDS = [
	"t1001", "t1002", "t1003", "t1004", "t1005", "t1006",
	"t1007", "t1008", "t1009", "t1010", "t1011",
] as const;

async function loadTheoryMarkdown(): Promise<string> {
	try {
		const filePath = path.join(process.cwd(), "public", "theory", "uniform-tilings.md");
		const raw = await readFile(filePath, "utf8");
		return raw.replace(/\$\$([\s\S]+?)\$\$/g, (_, body) => `\n\n$$\n${body.trim()}\n$$\n\n`);
	} catch {
		return "";
	}
}

async function loadUniformCells(): Promise<Record<string, TranslationalCellData>> {
	try {
		const filePath = path.join(process.cwd(), "public", "reference-atlas.json");
		const atlas = JSON.parse(await readFile(filePath, "utf8")) as {
			id: string;
			renderCell: TranslationalCellData;
		}[];
		const cells: Record<string, TranslationalCellData> = {};
		for (const t of atlas) {
			if ((UNIFORM_IDS as readonly string[]).includes(t.id)) cells[t.id] = t.renderCell;
		}
		return cells;
	} catch {
		return {};
	}
}

export default async function UniformTilingsPage() {
	const [content, cells] = await Promise.all([loadTheoryMarkdown(), loadUniformCells()]);
	const flatToc = extractTableOfContents(content);
	const sections = structureTableOfContents(flatToc);
	return <TheoryClient content={content} sections={sections} cells={cells} currentSlug="uniform-tilings" />;
}
