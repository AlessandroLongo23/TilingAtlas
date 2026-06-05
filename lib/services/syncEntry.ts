import type { RunRow } from "./runsService";

// Pure run-summary formatting for the /lab UI. Kept out of the React tree so the §0-sensitive
// invariant — the copied SYNC line mirrors DB state and never manufactures a certification claim —
// is unit-testable in isolation. See tests/syncEntry.test.ts.

export function shortId(id: string): string {
	return id.slice(0, 8);
}

export function dateOf(run: Pick<RunRow, "started_at" | "finished_at">): string {
	return (run.finished_at ?? run.started_at).slice(0, 10);
}

/**
 * A paste-ready, CC-signed SYNC.md line built ENTIRELY from this run's recorded fields. It mirrors
 * DB state (including the human-set `certified` flag) — it never asserts a claim the row doesn't
 * carry. `incomplete` dominates: an incomplete run is explicitly flagged as NOT a completeness claim
 * even if some stale `certified=true` slipped through.
 */
export function buildSyncEntry(run: RunRow): string {
	const status = run.incomplete
		? "INCOMPLETE (timeouts/truncation) — NOT a completeness claim"
		: run.certified
			? "CERTIFIED (human-verified)"
			: "not yet certified";
	return (
		`**${dateOf(run)} — CC** — **k=${run.k} {${run.family}} scout sweep mirrored** ` +
		`(run ${shortId(run.id)}). ${run.count ?? "?"} distinct, digest \`${run.digest ?? "—"}\`, ` +
		`${run.timeouts} timeouts; ${status}. commit ${run.commit ?? "—"}.`
	);
}
