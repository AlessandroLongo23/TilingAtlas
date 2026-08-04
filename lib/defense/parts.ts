// The five acts of the talk, in one place.
//
// Two readers share this list, which is why it is not literal in either of them: `<part-slide>`
// draws the divider (components/part-slide.tsx), and the slide parser labels those dividers in the
// overview grid (lib/defense/slides.ts), where a slide with no heading would otherwise read
// "(untitled)".

export interface TalkPart {
	/** What `<part-slide part="…">` names. */
	key: string;
	/** Left rail. Empty for the backup deck, which is a door but not an act. */
	numeral: string;
	title: string;
}

export const TALK_PARTS: TalkPart[] = [
	{ key: "1", numeral: "I", title: "Definitions and counts" },
	{ key: "2", numeral: "II", title: "Four failed architectures" },
	{ key: "3", numeral: "III", title: "Čtrnáct's STS method" },
	{ key: "4", numeral: "IV", title: "The completeness proof" },
	{ key: "5", numeral: "V", title: "Results, the Atlas and future work" },
];

/**
 * The backup deck. Not a sixth act — it is appended to the list only on its own divider, so that
 * an arrow press past the last slide of the talk is visibly past the last slide of the talk.
 */
export const BACKUP_PART: TalkPart = { key: "backup", numeral: "", title: "Backup" };

export function talkPart(key?: string): TalkPart | undefined {
	const k = key === undefined ? "" : String(key);
	if (k === BACKUP_PART.key) return BACKUP_PART;
	return TALK_PARTS.find((p) => p.key === k);
}

/**
 * How a divider names itself where there is no heading to read: the overview grid, and anywhere
 * else that wants one line for a slide. Null when the content is not a divider.
 */
export function partSlideLabel(content: string): string | null {
	const m = content.match(/<part-slide[^>]*\bpart=["']([^"']+)["']/i);
	if (!m) return null;
	const part = talkPart(m[1]);
	if (!part) return "Part";
	return part.numeral ? `${part.numeral}. ${part.title}` : part.title;
}
