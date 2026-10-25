// Server side of an article page: the markdown, and the few records its figures embed. Every record
// an article needs is named in the markdown itself (a tag's attribute), so prose and data cannot
// drift, and a page ships kilobytes of the catalogue, never the catalogue.

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { readDataJson } from "@/scripts/atlas/io.mjs";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import type { CataloguePatch } from "@/lib/tilings/hyp-developed";
import type { PipelineRecord } from "@/lib/squaring/shelf";
import { referencedTilingIds } from "@/lib/defense/slides";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { hydrateRenderCells } from "@/lib/services/renderCellDerive";

const PUBLIC = path.join(process.cwd(), "public");

export interface AboutData {
	content: string;
	/** Atlas id → render cell and exact cell, for `<tiling-card tiling="…">` and its kin. */
	cells: Record<string, TranslationalCellData>;
	sources: Record<string, ExactCellSource>;
	/** Patch id → developed record, for `<hyperbolic-card patch="…">`. */
	patches: Record<string, CataloguePatch>;
	/** Solid id → pipeline record, for `<squaring-card solid="…">`. */
	squarings: Record<string, PipelineRecord>;
}

/**
 * Render and exact cells for these atlas ids. The atlases are read smallest first and the scan stops
 * once every id is found, so an article of eleven uniform tilings never opens the k = 10 file.
 */
export async function loadAtlasCells(ids: string[]) {
	const cells: Record<string, TranslationalCellData> = {};
	const sources: Record<string, ExactCellSource> = {};
	const wanted = new Set(ids);
	if (!wanted.size) return { cells, sources };
	const files = (await readdir(PUBLIC)).filter((f) => /^reference-atlas.*\.json(\.gz)?$/.test(f));
	const sized = await Promise.all(files.map(async (f) => ({ f, size: (await stat(path.join(PUBLIC, f))).size })));
	for (const { f } of sized.sort((a, b) => a.size - b.size)) {
		const atlas = hydrateRenderCells(
			decodeAtlas<{ id: string; renderCell: TranslationalCellData; exactSource?: ExactCellSource }>(
				readDataJson(path.join(PUBLIC, f)),
			),
		);
		for (const t of atlas) {
			if (!wanted.delete(t.id)) continue;
			cells[t.id] = t.renderCell;
			if (t.exactSource) sources[t.id] = t.exactSource;
		}
		if (!wanted.size) break;
	}
	return { cells, sources };
}

const attrs = (md: string, tag: string, attr: string) =>
	[...md.matchAll(new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]+)"`, "g"))].map((m) => m[1]);

async function loadPatches(ids: string[]): Promise<Record<string, CataloguePatch>> {
	if (!ids.length) return {};
	const all: CataloguePatch[] = ["hyperbolic-developed.json", "hyperbolic-developed-stars.json"].flatMap((f) =>
		readDataJson(path.join(PUBLIC, f)),
	);
	const wanted = new Set(ids);
	return Object.fromEntries(all.filter((p) => wanted.has(p.id)).map((p) => [p.id, p]));
}

async function loadSquarings(ids: string[]): Promise<Record<string, PipelineRecord>> {
	const out: Record<string, PipelineRecord> = {};
	for (const id of new Set(ids))
		out[id] = readDataJson(path.join(PUBLIC, "squarings", "pipeline", `${id}.json`));
	return out;
}

export async function loadAbout(file: string): Promise<AboutData> {
	const raw = await readFile(path.join(PUBLIC, "theory", `${file}.md`), "utf8");
	// Display math on lines of its own, which remark-math needs to see a block.
	const content = raw.replace(/\$\$([\s\S]+?)\$\$/g, (_, body) => `\n\n$$\n${body.trim()}\n$$\n\n`);
	const [{ cells, sources }, patches, squarings] = await Promise.all([
		loadAtlasCells(referencedTilingIds(content)),
		loadPatches(attrs(content, "hyperbolic-card", "patch")),
		loadSquarings(attrs(content, "squaring-card", "solid")),
	]);
	return { content, cells, sources, patches, squarings };
}
