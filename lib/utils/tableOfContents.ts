/**
 * Pure TOC extraction from markdown source.
 *
 * Ports extractTableOfContents + structureTableOfContents from
 * src/lib/utils/markdown.ts in the source repo. Kept as pure functions
 * (no markdown-it / HTML) so the theory route can call them from RSC.
 */

export interface TableOfContentsItem {
	id: string;
	title: string;
	level: number;
	subsections?: TableOfContentsItem[];
	parent?: string | null;
}

function slugify(title: string): string {
	return title
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^\w-]+/g, "");
}

export function extractTableOfContents(markdown: string): TableOfContentsItem[] {
	if (!markdown) return [];
	const lines = markdown.split(/\r?\n/);
	const toc: TableOfContentsItem[] = [];
	const headerRegex = /^(#{1,6})\s+(.+)$/;
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;
		const match = line.match(headerRegex);
		if (match) {
			// Source offsets level by -1 so H1 → level 1, H2 → level 2, etc.
			const level = match[1].length - 1;
			const title = match[2].trim();
			toc.push({ id: slugify(title), title, level });
		}
	}
	return toc;
}

/**
 * Structures a flat TOC into nested h1 → h2 → h3 sections.
 * Mirrors the source's structureTableOfContents. Items deeper than h3
 * are dropped (same as source).
 */
export function structureTableOfContents(flat: TableOfContentsItem[]): TableOfContentsItem[] {
	const sections: TableOfContentsItem[] = [];
	let currentH1: TableOfContentsItem | null = null;
	let currentH2: TableOfContentsItem | null = null;

	for (const item of flat) {
		if (item.level === 1) {
			currentH1 = { id: item.id, title: item.title, level: 1, subsections: [], parent: null };
			sections.push(currentH1);
			currentH2 = null;
		} else if (item.level === 2) {
			currentH2 = {
				id: item.id,
				title: item.title,
				level: 2,
				subsections: [],
				parent: currentH1?.id ?? null,
			};
			if (currentH1) currentH1.subsections!.push(currentH2);
			else sections.push(currentH2);
		} else if (item.level === 3 && currentH2) {
			currentH2.subsections!.push({ id: item.id, title: item.title, level: 3 });
		}
	}
	return sections;
}
