"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { RunRow } from "@/lib/services/runsService";
import { cn } from "@/lib/utils/cn";

const STATUS_TONE: Record<string, BadgeTone> = {
	running: "warn",
	finished: "success",
	failed: "danger",
};

function rel(iso: string): string {
	const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	return `${Math.floor(hrs / 24)}d ago`;
}

/** Live list of scout runs (the new run-centric console). Subscribes to public.runs so a run launched
 *  from the terminal (EMIT=1) appears here the moment it starts, and its status/count update live. */
export function RunsSection({ initialRuns }: { initialRuns: RunRow[] }) {
	const [runs, setRuns] = useState<RunRow[]>(initialRuns);

	useEffect(() => {
		const client = createClient();
		const channel = client
			.channel("runs-list")
			.on("postgres_changes", { event: "*", schema: "public", table: "runs" }, (payload) => {
				const row = payload.new as Partial<RunRow>;
				if (!row || typeof row.id !== "string") return;
				setRuns((prev) => {
					const i = prev.findIndex((r) => r.id === row.id);
					if (i >= 0) {
						const next = [...prev];
						next[i] = row as RunRow;
						return next;
					}
					return [row as RunRow, ...prev].slice(0, 12);
				});
			})
			.subscribe();
		return () => {
			client.removeChannel(channel);
		};
	}, []);

	return (
		<div className="shrink-0 border-b border-line-subtle px-6 py-3">
			<div className="flex items-center gap-2 mb-2">
				<Radio size={15} className="text-accent" />
				<h2 className="text-sm font-semibold text-fg">Live runs</h2>
				{runs.length > 0 ? (
					<span className="text-xs text-fg-muted bg-surface-overlay px-2 py-0.5 rounded-full tabular-nums">
						{runs.length}
					</span>
				) : null}
			</div>

			{runs.length === 0 ? (
				<p className="text-xs text-fg-disabled">
					No scout runs yet. Launch one with{" "}
					<code className="font-mono text-fg-muted">EMIT=1 pnpm tsx scripts/scout-parallel.ts …</code> and it appears
					here live.
				</p>
			) : (
				<div className="flex gap-2 overflow-x-auto pb-1">
					{runs.map((run) => (
						<Link
							key={run.id}
							href={`/lab/run/${run.id}`}
							className={cn(
								"shrink-0 w-56 rounded-xl border px-3 py-2.5 transition-colors",
								run.status === "running"
									? "border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10"
									: "border-line bg-surface-overlay/30 hover:bg-surface-overlay/50",
							)}
						>
							<div className="flex items-center justify-between gap-2">
								<span className="text-sm font-medium text-fg-secondary truncate">
									k={run.k} · {run.family}
								</span>
								<Badge tone={STATUS_TONE[run.status] ?? "neutral"} pill>
									{run.status}
								</Badge>
							</div>
							<div className="mt-1 flex items-center gap-2 text-[11px] text-fg-muted font-mono tabular-nums">
								<span>{run.count ?? "—"} tilings</span>
								<span className={run.timeouts ? "text-danger" : ""}>· {run.timeouts} to</span>
								{run.certified ? <Badge tone="success">✓</Badge> : null}
							</div>
							<div className="mt-0.5 text-[10px] text-fg-disabled">{rel(run.started_at)}</div>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
