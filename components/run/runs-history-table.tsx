"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { RunRow, RunParams } from "@/lib/services/runsService";
import { cn } from "@/lib/utils/cn";

const STATUS_TONE: Record<string, BadgeTone> = {
	running: "warn",
	finished: "success",
	failed: "danger",
};

// Human duration between start and end (or now, for a still-running row).
function fmtDuration(startedIso: string, finishedIso: string | null, now: number): string {
	const start = new Date(startedIso).getTime();
	const end = finishedIso ? new Date(finishedIso).getTime() : now;
	let s = Math.max(0, Math.round((end - start) / 1000));
	const h = Math.floor(s / 3600); s -= h * 3600;
	const m = Math.floor(s / 60); s -= m * 60;
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m ${s}s`;
	return `${s}s`;
}

// The budget picture from a run's params. ctrnact sweeps report a k target + peak memory; the legacy
// TS scout reports a time cap + worker count + mode.
function fmtBudget(params: RunParams | null | undefined): string {
	const p = params ?? {};
	const parts: string[] = [];
	if (p.engine === "ctrnact" || p.maxnum != null) {
		if (p.maxnum != null) parts.push(`k≤${p.maxnum}`);
		if (p.peakMemMB != null) parts.push(`${Math.round(p.peakMemMB)}MB`);
		return parts.length ? parts.join(" · ") : "—";
	}
	if (p.maxMs != null) {
		const min = p.maxMs / 60000;
		parts.push(min >= 1 ? `${Math.round(min)}m` : `${Math.round(p.maxMs / 1000)}s`);
	}
	if (p.workers != null) parts.push(`${p.workers}w`);
	if (p.mode) parts.push(p.mode);
	return parts.length ? parts.join(" · ") : "—";
}

function fmtStarted(iso: string): string {
	return new Date(iso).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** The full run history as one live table (traceability + performance). Subscribes to public.runs so a
 *  run launched from the terminal appears and updates in place; each row links to its detail view. */
export function RunsHistoryTable({ initialRuns }: { initialRuns: RunRow[] }) {
	const [runs, setRuns] = useState<RunRow[]>(initialRuns);
	const [now, setNow] = useState(() => Date.now());

	// Live upserts from the runs table, kept sorted newest-first.
	useEffect(() => {
		const client = createClient();
		const channel = client
			.channel("runs-history")
			.on("postgres_changes", { event: "*", schema: "public", table: "runs" }, (payload) => {
				const row = payload.new as Partial<RunRow>;
				if (!row || typeof row.id !== "string") return;
				setRuns((prev) => {
					const rest = prev.filter((r) => r.id !== row.id);
					return [row as RunRow, ...rest].sort(
						(a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
					);
				});
			})
			.subscribe();
		return () => {
			client.removeChannel(channel);
		};
	}, []);

	// Tick once a second only while something is running, so live durations advance.
	const anyRunning = runs.some((r) => r.status === "running");
	useEffect(() => {
		if (!anyRunning) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [anyRunning]);

	return (
		<div className="p-6">
			<div className="mb-4 flex items-center gap-2">
				<Radio size={16} className="text-accent" />
				<h1 className="text-base font-semibold text-fg">Run history</h1>
				<span className="rounded-full bg-surface-overlay px-2 py-0.5 text-xs tabular-nums text-fg-muted">
					{runs.length}
				</span>
			</div>

			{runs.length === 0 ? (
				<p className="text-sm text-fg-disabled">
					No runs yet. Launch one with{" "}
					<code className="font-mono text-fg-muted">EMIT=1 pnpm tsx scripts/scout-parallel.ts …</code> and it appears
					here live.
				</p>
			) : (
				<div className="overflow-x-auto rounded-lg border border-line">
					<table className="w-full min-w-[720px] border-collapse text-sm">
						<thead>
							<tr className="border-b border-line bg-surface-overlay/40 text-left text-xs text-fg-muted">
								<th className="px-3 py-2 font-medium">Status</th>
								<th className="px-3 py-2 font-medium">k</th>
								<th className="px-3 py-2 font-medium">Family</th>
								<th className="px-3 py-2 font-medium">Started</th>
								<th className="px-3 py-2 font-medium">Duration</th>
								<th className="px-3 py-2 font-medium">Results</th>
								<th className="px-3 py-2 font-medium">Budget</th>
								<th className="px-3 py-2 font-medium">Digest</th>
							</tr>
						</thead>
						<tbody>
							{runs.map((run) => (
								<tr key={run.id} className="group border-b border-line-subtle last:border-0 hover:bg-surface-overlay/30">
									<td className="px-3 py-2">
										<Link href={`/history/run/${run.id}`} className="flex flex-wrap items-center gap-1">
											<Badge tone={STATUS_TONE[run.status] ?? "neutral"} pill>
												{run.status}
											</Badge>
											{run.certified ? <Badge tone="success" pill>certified</Badge> : null}
											{run.incomplete ? <Badge tone="warn" pill>incomplete</Badge> : null}
											{run.timeouts > 0 ? (
												<Badge tone="danger" pill>{run.timeouts} timeout{run.timeouts === 1 ? "" : "s"}</Badge>
											) : null}
										</Link>
									</td>
									<td className="px-3 py-2 tabular-nums text-fg">
										<Link href={`/history/run/${run.id}`} className="block">{run.k}</Link>
									</td>
									<td className="px-3 py-2 font-mono text-xs text-fg-secondary">
										<Link href={`/history/run/${run.id}`} className="block">{run.family}</Link>
									</td>
									<td className="px-3 py-2 whitespace-nowrap text-fg-muted">
										<Link href={`/history/run/${run.id}`} className="block">{fmtStarted(run.started_at)}</Link>
									</td>
									<td className="px-3 py-2 whitespace-nowrap tabular-nums text-fg-secondary">
										<Link href={`/history/run/${run.id}`} className="block">
											{fmtDuration(run.started_at, run.finished_at, now)}
										</Link>
									</td>
									<td className="px-3 py-2 tabular-nums text-fg">
										<Link href={`/history/run/${run.id}`} className="block">{run.count ?? "—"}</Link>
									</td>
									<td className="px-3 py-2 whitespace-nowrap text-fg-muted">
										<Link href={`/history/run/${run.id}`} className="block">{fmtBudget(run.params)}</Link>
									</td>
									<td className="px-3 py-2">
										<Link href={`/history/run/${run.id}`} className="block font-mono text-xs text-fg-disabled">
											{run.digest ? run.digest.slice(0, 8) : "—"}
										</Link>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
