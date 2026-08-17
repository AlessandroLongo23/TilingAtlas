import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractTableOfContents, structureTableOfContents } from "@/lib/utils/tableOfContents";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import { TheoryClient } from "../_theory-client";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { hydrateRenderCells } from "@/lib/services/renderCellDerive";

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

// The exact cells ride along with the render cells: 1.3 KB for all eleven, and they are what the
// three card overlays (vertex orbits, symmetry elements, fundamental domain) are derived from in the
// browser. Without them those keys would be dead on this page.
async function loadUniformCells(): Promise<{
	cells: Record<string, TranslationalCellData>;
	sources: Record<string, ExactCellSource>;
}> {
	const cells: Record<string, TranslationalCellData> = {};
	const sources: Record<string, ExactCellSource> = {};
	try {
		const filePath = path.join(process.cwd(), "public", "reference-atlas.json");
		const atlas = hydrateRenderCells(decodeAtlas<{
			id: string;
			renderCell: TranslationalCellData;
			exactSource?: ExactCellSource;
		}>(JSON.parse(await readFile(filePath, "utf8"))));
		for (const t of atlas) {
			if (!(UNIFORM_IDS as readonly string[]).includes(t.id)) continue;
			cells[t.id] = t.renderCell;
			if (t.exactSource) sources[t.id] = t.exactSource;
		}
	} catch {
		// A missing atlas just means the cards render as "unknown tiling id".
	}
	return { cells, sources };
}

export default async function UniformTilingsPage() {
	const [content, { cells, sources }] = await Promise.all([loadTheoryMarkdown(), loadUniformCells()]);
	const flatToc = extractTableOfContents(content);
	const sections = structureTableOfContents(flatToc);
	return (
		<TheoryClient
			content={content}
			sections={sections}
			cells={cells}
			sources={sources}
			currentSlug="uniform-tilings"
		/>
	);
}
