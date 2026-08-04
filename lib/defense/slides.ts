// Slide parsing for the /defense presentation route.
//
// The talk is authored as ONE markdown file (public/defense/talk.md) so wording can be fixed
// during rehearsal without touching code. Slides are separated by a `---` fence on its own line,
// the reveal.js/Marp convention. Consequence, and it is the only authoring rule that bites:
// a horizontal rule inside a slide is not available. Use spacing or a heading instead.
//
// There are no per-slide directives: an HTML comment in the source is just a comment, invisible in
// the deck as in any other markdown renderer.

export interface Slide {
	/** 0-based index across ALL slides, main and backup. */
	index: number;
	/** 1-based slide number. */
	number: number;
	/** Markdown body. */
	content: string;
	/** First heading text, used as the label in overview mode. */
	title: string;
}

import { partSlideLabel } from "./parts";

const SLIDE_FENCE = /^\s*---\s*$/;

/** First ATX heading in the body, stripped of markup, for the overview grid. */
function firstHeading(body: string): string {
	// An act divider carries no heading — it names itself from the parts list instead, or the
	// overview grid labels five of its cards "(untitled)".
	const part = partSlideLabel(body);
	if (part) return part;

	for (const line of body.split("\n")) {
		const m = line.match(/^#{1,4}\s+(.*)$/);
		if (m) {
			return m[1]
				.replace(/[*_`]/g, "")
				.replace(/\$([^$]*)\$/g, "$1")
				.trim();
		}
	}
	const firstProse = body
		.split("\n")
		.map((l) => l.trim())
		.find((l) => l.length > 0 && !l.startsWith("<"));
	return firstProse ? firstProse.replace(/[*_`]/g, "").slice(0, 60) : "(untitled)";
}

export function parseSlides(markdown: string): Slide[] {
	// Split on the fence, not on /^---$/m, so that a `---` inside a fenced code block or an
	// HTML block is not treated as a slide break by accident.
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const chunks: string[] = [];
	let current: string[] = [];
	let inCodeFence = false;

	for (const line of lines) {
		if (/^\s*(```|~~~)/.test(line)) inCodeFence = !inCodeFence;
		if (!inCodeFence && SLIDE_FENCE.test(line)) {
			chunks.push(current.join("\n"));
			current = [];
			continue;
		}
		current.push(line);
	}
	chunks.push(current.join("\n"));

	const slides: Slide[] = [];
	let count = 0;

	for (const raw of chunks) {
		if (!raw.trim()) continue;

		const content = raw.trim();
		if (!content) continue;

		count += 1;

		slides.push({
			index: slides.length,
			number: count,
			content,
			title: firstHeading(content),
		});
	}

	return slides;
}

/** Atlas ids referenced by `<tiling-card tiling="…">`, so the page loads only those render cells. */
export function referencedTilingIds(markdown: string): string[] {
	const ids = new Set<string>();
	// Every tag that names a tiling has to appear here, or the page ships the deck without that
	// tiling's cell and the slide renders "Unknown tiling id".
	const re = /<(?:tiling-card|orbit-card|seed-card)[^>]*\btiling=["']([^"']+)["']/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(markdown)) !== null) ids.add(m[1]);
	return [...ids];
}

