// What a returning visitor has not seen yet, and whether it is worth interrupting them for.
//
// Pure and dependency-free so tests/updates.test.ts can exercise every branch without a DOM. The
// store (lib/stores/updates.ts) supplies `lastSeen` from localStorage; everything else is here.

import { CURRENT_VERSION, UPDATES, type UpdateEntry } from "@/lib/updates/entries";
import { bumpBetween, compareVersions, isVersion } from "@/lib/updates/version";

/**
 * Releases strictly newer than `lastSeen`, newest first.
 *
 * `null` (a first visit) returns nothing on purpose: a stranger's first impression should be the
 * Atlas, not a changelog for something they have never used. The gate marks them current instead.
 * A stored value that is not a version — hand-edited, or written by an older build — is treated the
 * same way instead of throwing.
 */
export function unseenSince(lastSeen: string | null): UpdateEntry[] {
	if (!lastSeen || !isVersion(lastSeen)) return [];
	// A marker at or ahead of this build (a downgrade, or a dev machine) has nothing to show.
	if (compareVersions(lastSeen, CURRENT_VERSION) >= 0) return [];
	return UPDATES.filter((e) => compareVersions(e.version, lastSeen) > 0);
}

/**
 * Whether to open the modal unprompted, as opposed to only lighting the nav dot.
 *
 * Only a MINOR or MAJOR earns the interruption. The Atlas is a reference — people arrive wanting to
 * look something up, and a modal in front of that for a fix or a few more tilings is hostile. Patch
 * work is never lost: the dot stays lit and the same modal opens on click.
 */
export function shouldAutoOpen(lastSeen: string | null): boolean {
	if (unseenSince(lastSeen).length === 0) return false;
	const bump = bumpBetween(lastSeen as string, CURRENT_VERSION);
	return bump === "minor" || bump === "major";
}

/** Every preview id across a set of releases, deduped, in order of appearance. */
export function previewIdsIn(entries: UpdateEntry[]): string[] {
	const ids: string[] = [];
	for (const entry of entries) {
		for (const change of entry.changes) {
			for (const id of change.tilings ?? []) if (!ids.includes(id)) ids.push(id);
		}
	}
	return ids;
}
