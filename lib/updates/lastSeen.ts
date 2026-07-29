// Browser-only localStorage helper for "which update did this visitor last see".
//
// Same shape as lib/utils/authorIdentity.ts — the established convention here for persisted browser
// values, try/catch on every access so private browsing with storage blocked degrades to "first
// visit" instead of throwing. zustand/middleware persist is used nowhere in this repo; don't
// introduce it for one string.

const LAST_SEEN_KEY = "tilingatlas.lastSeenUpdate";

/** The last version this browser was shown, or null on a first visit (or blocked storage). */
export function getLastSeenUpdate(): string | null {
	try {
		return localStorage.getItem(LAST_SEEN_KEY);
	} catch {
		return null;
	}
}

export function setLastSeenUpdate(version: string): void {
	try {
		localStorage.setItem(LAST_SEEN_KEY, version);
	} catch {
		// ignore (e.g. private browsing with storage blocked)
	}
}
