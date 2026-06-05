"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RunRow, RunSeedRow } from "@/lib/services/runsService";

/**
 * Subscribe a single run to Supabase Realtime. Seeds an initial server snapshot (so a late joiner sees
 * history), then folds `postgres_changes` on public.runs (this run) and public.run_seeds (this run).
 * runs/run_seeds are small enough to ride the change payload directly (found_tilings is poke-then-refetch
 * in M2 — TA note 2). Read-only: this never writes back.
 */
export function useLiveRun(runId: string, initialRun: RunRow, initialSeeds: RunSeedRow[]) {
	const [run, setRun] = useState<RunRow>(initialRun);
	const [seeds, setSeeds] = useState<Map<number, RunSeedRow>>(
		() => new Map(initialSeeds.map((s) => [s.seed_idx, s])),
	);
	const [connected, setConnected] = useState(false);

	useEffect(() => {
		const client = createClient();
		const channel = client
			.channel(`run-${runId}`)
			.on(
				"postgres_changes",
				{ event: "*", schema: "public", table: "runs", filter: `id=eq.${runId}` },
				(payload) => {
					const row = payload.new as Partial<RunRow>;
					if (row && typeof row.id === "string") setRun(row as RunRow);
				},
			)
			.on(
				"postgres_changes",
				{ event: "*", schema: "public", table: "run_seeds", filter: `run_id=eq.${runId}` },
				(payload) => {
					const row = payload.new as Partial<RunSeedRow>;
					if (!row || typeof row.seed_idx !== "number") return;
					setSeeds((prev) => {
						const next = new Map(prev);
						next.set(row.seed_idx as number, row as RunSeedRow);
						return next;
					});
				},
			)
			.subscribe((status) => setConnected(status === "SUBSCRIBED"));

		return () => {
			client.removeChannel(channel);
		};
	}, [runId]);

	return { run, seeds, connected };
}
