/**
 * C7 star-spike break-list instrumentation. Fires ONLY when `SPIKE_TRACE=1`, so it is completely inert
 * (no output, no behaviour change, digest-safe) on the regular decisive path. Each distinct `site` is
 * logged once — a structured `⚑BREAK` line that becomes one row of the spike's break-list deliverable:
 * every convex/`n`-keyed assumption a non-convex star tile reaches and silently mis-computes.
 */
const SEEN = new Map<string, string>();

export function spikeBreak(site: string, assumption: string, wrong: string, ctx = ''): void {
	if (process.env.SPIKE_TRACE !== '1') return;
	if (SEEN.has(site)) return;
	const line = `⚑BREAK ${site} | ${assumption} | ${wrong}${ctx ? ` | ${ctx}` : ''}`;
	SEEN.set(site, line);
	process.stderr.write(line + '\n');
}

/** All distinct break lines logged so far (for a harness to print the aggregated list). */
export function spikeBreaksSeen(): string[] {
	return [...SEEN.values()];
}
