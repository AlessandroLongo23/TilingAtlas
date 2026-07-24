import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractTableOfContents, structureTableOfContents } from "@/lib/utils/tableOfContents";
import type { CataloguePatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { TheoryClient } from "../_theory-client";

export const dynamic = "force-static";

// Why the hyperbolic catalogue is bounded the way it is: the infinitude of {p,q}, the (k, p, v) box
// that makes the question finite, why a vertex configuration does not name a hyperbolic tiling, the
// Delaney-Dress symbol as the identity that does, and where the enumeration currently runs out.
//
// The figures are engine-developed Poincaré patches, so this route reads public/hyperbolic-developed
// .json (11.6 MB) at BUILD time and hands the client only the handful of patches the markdown embeds.
// Same discipline as the uniform-tilings route with its cells: the page is static, so the big read
// costs nothing at runtime, and the browser never sees the catalogue it isn't showing.

async function loadTheoryMarkdown(): Promise<string> {
	try {
		const filePath = path.join(process.cwd(), "public", "theory", "hyperbolic-enumeration.md");
		const raw = await readFile(filePath, "utf8");
		// Force $$…$$ fences onto their own lines — micromark's math-flow parser requires this.
		return raw.replace(/\$\$([\s\S]+?)\$\$/g, (_, body) => `\n\n$$\n${body.trim()}\n$$\n\n`);
	} catch {
		return "";
	}
}

/** The patch ids the markdown embeds, read out of the markdown itself so the two can never drift. */
function embeddedPatchIds(markdown: string): string[] {
	return [...markdown.matchAll(/<hyperbolic-card[^>]*\bpatch="([^"]+)"/g)].map((m) => m[1]);
}

async function loadPatches(ids: string[]): Promise<Record<string, CataloguePatch>> {
	if (!ids.length) return {};
	try {
		const filePath = path.join(process.cwd(), "public", "hyperbolic-developed.json");
		const all: CataloguePatch[] = JSON.parse(await readFile(filePath, "utf8"));
		const wanted = new Set(ids);
		return Object.fromEntries(all.filter((p) => wanted.has(p.id)).map((p) => [p.id, p]));
	} catch {
		return {};
	}
}

export default async function HyperbolicTheoryPage() {
	const content = await loadTheoryMarkdown();
	const patches = await loadPatches(embeddedPatchIds(content));
	const flatToc = extractTableOfContents(content);
	const sections = structureTableOfContents(flatToc);
	return (
		<TheoryClient
			content={content}
			sections={sections}
			cells={{}}
			patches={patches}
			currentSlug="hyperbolic"
		/>
	);
}
