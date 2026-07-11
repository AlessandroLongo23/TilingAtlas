import type { SupabaseClient } from "@supabase/supabase-js";

// Mirrors public.runs / public.run_seeds (supabase/migrations/0001_lab_runs.sql). These tables are a
// fire-and-forget MIRROR of the local scout — read-only from the web (anon SELECT via RLS).

export interface RunParams {
	maxMs?: number;
	workers?: number;
	mode?: "certified" | "capped" | string;
	resumed?: number;
	total?: number; // total seed count (added at run start) — denominator for the queue panel

	// ctrnact sweep runs (scripts/run-ktarnak.py → emit_run.py): one History row per k=1..maxnum solve.
	engine?: string; // "ctrnact"
	maxnum?: number; // the sweep's k target
	perK?: Record<string, number>; // distinct count per k
	peakMemMB?: number | null;
	wallSec?: number;
	poll?: number;
	directions?: number;
	octblind?: boolean;
}

export interface RunRow {
	id: string;
	started_at: string;
	finished_at: string | null;
	commit: string | null;
	k: number;
	family: string;
	params: RunParams;
	status: "running" | "finished" | "failed" | string;
	count: number | null;
	digest: string | null;
	timeouts: number;
	incomplete: boolean;
	certified: boolean;
}

export interface RunSeedDiag {
	candidateLattices?: number;
	latticesTried?: number;
	rawCells?: number;
	emitted?: number;
	gateRejected?: number;
	fanLattices?: number;
	p0Skipped?: number;
	p1Pruned?: number;
	seedStateDedup?: number;
	obliqueCandidates?: number;
	obliqueTruncated?: string | null;
	timedOut?: boolean;
}

export interface RunSeedRow {
	run_id: string;
	seed_idx: number;
	name: string | null;
	status: "queued" | "active" | "done" | string;
	worker_id: number | null;
	outcome: number | null;
	ms: number | null;
	timed_out: boolean;
	diag: RunSeedDiag | null;
	updated_at: string;
}

export async function fetchRecentRuns(sb: SupabaseClient, limit = 20): Promise<RunRow[]> {
	const { data, error } = await sb
		.from("runs")
		.select("*")
		.order("started_at", { ascending: false })
		.limit(limit);
	if (error) {
		console.error("fetchRecentRuns:", error.message);
		return [];
	}
	return (data ?? []) as RunRow[];
}

export async function fetchRun(sb: SupabaseClient, id: string): Promise<RunRow | null> {
	const { data, error } = await sb.from("runs").select("*").eq("id", id).maybeSingle();
	if (error) {
		console.error("fetchRun:", error.message);
		return null;
	}
	return (data as RunRow) ?? null;
}

// Prior runs of the SAME (k, family) — the digest-history compare set. A digest that differs from a
// certified sibling is a regression signal (or just a different commit); display-only, never a claim.
export async function fetchRunsByKFamily(
	sb: SupabaseClient,
	k: number,
	family: string,
	excludeId: string,
	limit = 12,
): Promise<RunRow[]> {
	const { data, error } = await sb
		.from("runs")
		.select("*")
		.eq("k", k)
		.eq("family", family)
		.neq("id", excludeId)
		.order("started_at", { ascending: false })
		.limit(limit);
	if (error) {
		console.error("fetchRunsByKFamily:", error.message);
		return [];
	}
	return (data ?? []) as RunRow[];
}

export interface FoundTiling {
	run_id: string;
	canonical_key: string;
	render_cell: unknown | null; // float TranslationalCellData (parseBaseCell-ready); null if not yet populated
	k: number;
	seed_idx: number | null;
	first_seen_at: string;
}

// Only the render-relevant columns — NOT cell_codec (large; that's the exact mirror, fetched on demand).
const FOUND_COLS = "run_id,canonical_key,render_cell,k,seed_idx,first_seen_at";

export async function fetchFoundTilings(sb: SupabaseClient, runId: string): Promise<FoundTiling[]> {
	const { data, error } = await sb
		.from("found_tilings")
		.select(FOUND_COLS)
		.eq("run_id", runId)
		.order("first_seen_at", { ascending: true });
	if (error) {
		console.error("fetchFoundTilings:", error.message);
		return [];
	}
	return (data ?? []) as FoundTiling[];
}

export async function fetchRunSeeds(sb: SupabaseClient, runId: string): Promise<RunSeedRow[]> {
	const { data, error } = await sb
		.from("run_seeds")
		.select("*")
		.eq("run_id", runId)
		.order("seed_idx", { ascending: true });
	if (error) {
		console.error("fetchRunSeeds:", error.message);
		return [];
	}
	return (data ?? []) as RunSeedRow[];
}
