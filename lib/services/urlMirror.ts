// One writer for the address bar of the merged /play + /library page.
//
// Both lenses keep their whole view in the query string: the library its filters, sort and page
// (serializeView), the viewer its tiling and options (serializePlayState). On one page they share one
// URL, and two independent replaceState calls would each overwrite the other's half. Each side hands its
// part here instead; the parts are joined and written once, trailing-debounced for the reason the viewer
// already debounced (WebKit throttles replaceState to 100 calls per 30 s, then disables it).
//
// The key sets are disjoint except `fdgrid`, which the library only ever READS as a legacy alias, so
// joining is enough; nothing has to be merged key by key.

const DEBOUNCE_MS = 400;
const parts = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let lastWritten: string | null = null;

/** The joined query, without the leading "?". */
export function mirroredQuery(): string {
	return [...parts.values()].filter(Boolean).join("&");
}

function write() {
	timer = null;
	if (typeof window === "undefined") return;
	const q = mirroredQuery();
	const href = q ? `${window.location.pathname}?${q}` : window.location.pathname;
	if (href === lastWritten) return;
	lastWritten = href;
	window.history.replaceState(null, "", href);
}

/** Set one side's part of the query; the address bar follows after the debounce. */
export function mirrorQuery(part: string, query: string) {
	parts.set(part, query);
	if (timer) clearTimeout(timer);
	timer = setTimeout(write, DEBOUNCE_MS);
}

/** Write now: a lens switch or a nav link has just changed the path, and the query has to follow it. */
export function flushQuery() {
	if (timer) clearTimeout(timer);
	lastWritten = null;
	write();
}
