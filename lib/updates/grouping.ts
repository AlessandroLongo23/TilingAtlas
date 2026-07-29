// Month bucketing for the /updates index. Pure, and out of the client component so the multi-month
// path is testable: every backfilled release so far is July 2026, so the browser only ever exercises
// the single-group case and a regression here would be invisible until a release crossed a month.

import type { UpdateEntry } from "@/lib/updates/entries";

export interface MonthGroup {
	/** "July 2026" — the index divider. */
	month: string;
	items: UpdateEntry[];
}

/** "2026-07-29" → "July 2026". UTC throughout, so a late-evening release cannot slip a month. */
export function formatMonth(iso: string): string {
	return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
}

/**
 * Bucket releases into the month they shipped in, preserving the order given (newest first).
 *
 * Groups CONSECUTIVE runs, not collecting by key: entries are already sorted, and a run-based
 * grouping keeps a month that somehow appears twice as two dividers instead of silently reordering
 * the list to merge them.
 */
export function groupByMonth(entries: UpdateEntry[]): MonthGroup[] {
	const groups: MonthGroup[] = [];
	for (const entry of entries) {
		const month = formatMonth(entry.date);
		const last = groups[groups.length - 1];
		if (last?.month === month) last.items.push(entry);
		else groups.push({ month, items: [entry] });
	}
	return groups;
}
