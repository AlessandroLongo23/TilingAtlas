"use client";

import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Cpu, LayoutGrid, Gauge, BadgeCheck, Wifi, WifiOff } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { useLiveRun } from "@/lib/hooks/useLiveRun";
import type { RunRow, RunSeedRow } from "@/lib/services/runsService";
import { cn } from "@/lib/utils/cn";

// ── format helpers ───────────────────────────────────────────────────────────────────────────
function fmtDuration(ms: number): string {
	if (ms < 0) ms = 0;
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
	const h = Math.floor(m / 60);
	return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}
function fmtClock(iso: string): string {
	return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// `now` is null until mount → avoids SSR/client hydration mismatch on elapsed text.
function useNow(enabled: boolean): number | null {
	const [now, setNow] = useState<number | null>(null);
	useEffect(() => {
		setNow(Date.now());
		if (!enabled) return;
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, [enabled]);
	return now;
}

const STATUS_TONE: Record<string, BadgeTone> = {
	running: "warn",
	finished: "success",
	failed: "danger",
};

// ── panel shell ──────────────────────────────────────────────────────────────────────────────
function Panel({
	icon: Icon,
	title,
	right,
	children,
	className,
}: {
	icon: React.ComponentType<{ size?: number; className?: string }>;
	title: string;
	right?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("rounded-xl border border-line bg-surface-overlay/20 overflow-hidden", className)}>
			<header className="flex items-center gap-2 px-4 py-2.5 border-b border-line-subtle">
				<Icon size={15} className="text-fg-muted" />
				<h2 className="text-sm font-medium text-fg">{title}</h2>
				<div className="flex-1" />
				{right}
			</header>
			<div className="p-4">{children}</div>
		</section>
	);
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "muted" | "fg" }) {
	return (
		<div className="rounded-lg border border-line-subtle bg-surface-raised/50 px-3 py-2.5">
			<div className="text-[11px] text-fg-muted">{label}</div>
			<div className={cn("text-lg font-mono tabular-nums", tone === "muted" ? "text-fg-muted" : "text-fg")}>{value}</div>
		</div>
	);
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────
export function RunView({
	runId,
	initialRun,
	initialSeeds,
}: {
	runId: string;
	initialRun: RunRow;
	initialSeeds: RunSeedRow[];
}) {
	const { run, seeds, connected } = useLiveRun(runId, initialRun, initialSeeds);
	const isRunning = run.status === "running";
	const now = useNow(isRunning);

	const seedsArr = useMemo(() => [...seeds.values()], [seeds]);
	const done = seedsArr.filter((s) => s.status === "done").length;
	const active = seedsArr.filter((s) => s.status === "active");
	const total = run.params.total ?? done + active.length;
	const queued = Math.max(0, total - done - active.length);
	const incompleteSeeds = seedsArr.filter((s) => s.timed_out).length;
	const pct = total > 0 ? (done / total) * 100 : 0;

	const agg = useMemo(() => {
		let gateRejected = 0,
			p0 = 0,
			p1 = 0,
			obl = 0,
			raw = 0;
		for (const s of seedsArr) {
			const d = s.diag;
			if (!d) continue;
			gateRejected += d.gateRejected ?? 0;
			p0 += d.p0Skipped ?? 0;
			p1 += d.p1Pruned ?? 0;
			obl += d.obliqueCandidates ?? 0;
			raw += d.rawCells ?? 0;
		}
		return { gateRejected, p0, p1, obl, raw };
	}, [seedsArr]);

	const elapsedMs = run.finished_at
		? Date.parse(run.finished_at) - Date.parse(run.started_at)
		: now != null
			? now - Date.parse(run.started_at)
			: null;

	return (
		<div className="flex-1 min-h-0 overflow-y-auto">
			<div className="mx-auto max-w-5xl px-6 py-6 flex flex-col gap-5">
				{/* ── header ─────────────────────────────────────────────────────── */}
				<header className="rounded-xl border border-line bg-surface-overlay/30 px-5 py-4 flex items-start gap-4">
					<FlaskConical size={20} className="text-accent mt-0.5 shrink-0" />
					<div className="min-w-0 flex-1">
						<h1 className="text-lg font-semibold text-fg truncate">
							k={run.k} · family {"{"}
							{run.family}
							{"}"} · {run.params.mode ?? "scout"} sweep
						</h1>
						<p className="mt-0.5 text-xs text-fg-muted font-mono truncate">
							run · commit {run.commit ?? "—"} · {run.params.workers ?? "?"} workers · maxMs=
							{run.params.maxMs ?? "?"} · started {fmtClock(run.started_at)}
						</p>
					</div>
					<div className="flex flex-col items-end gap-1.5 shrink-0">
						<Badge tone={STATUS_TONE[run.status] ?? "neutral"} pill className="text-[11px] px-2 py-1">
							{run.status}
							{elapsedMs != null ? ` · ${fmtDuration(elapsedMs)}` : ""}
						</Badge>
						<span
							className={cn("inline-flex items-center gap-1 text-[10px]", connected ? "text-emerald-400" : "text-fg-disabled")}
							title={connected ? "Realtime connected" : "Connecting…"}
						>
							{connected ? <Wifi size={11} /> : <WifiOff size={11} />}
							{connected ? "live" : "…"}
						</span>
					</div>
				</header>

				{/* ── seed queue + workers (M1) ──────────────────────────────────── */}
				<Panel
					icon={Cpu}
					title="Seed queue"
					right={
						<span className="text-xs text-fg-muted font-mono tabular-nums">
							<span className="text-fg">{done}</span> / {total} done · <span className="text-fg">{active.length}</span> active ·{" "}
							{queued} queued · <span className={incompleteSeeds ? "text-danger" : "text-fg"}>{incompleteSeeds}</span> incomplete
						</span>
					}
				>
					<div className="h-2 rounded-full bg-surface-overlay/60 overflow-hidden">
						<div
							className="h-full bg-gradient-to-r from-green-600 to-green-500 rounded-full transition-all duration-500 ease-out"
							style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
						/>
					</div>

					{active.length > 0 ? (
						<div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
							{active
								.sort((a, b) => (a.worker_id ?? 0) - (b.worker_id ?? 0))
								.map((s) => {
									const since = now != null ? fmtDuration(now - Date.parse(s.updated_at)) : "—";
									return (
										<div key={s.seed_idx} className="rounded-lg border border-line-subtle bg-surface-raised/50 px-3 py-2">
											<div className="flex items-center justify-between text-[11px] text-fg-muted">
												<span>worker {s.worker_id ?? "?"}</span>
												<span className="font-mono tabular-nums">{since}</span>
											</div>
											<div className="mt-1 text-xs font-mono text-fg-secondary truncate" title={s.name ?? undefined}>
												{s.name ?? "—"}
											</div>
											<div className="text-[10px] font-mono text-fg-disabled">#{s.seed_idx}</div>
										</div>
									);
								})}
						</div>
					) : (
						<p className="mt-4 text-xs text-fg-disabled">
							{isRunning ? "Waiting for workers to claim seeds…" : "No active workers — run complete."}
						</p>
					)}
				</Panel>

				{/* ── lower grid: gallery (M2) · diagnostics · certification ──────── */}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
					<Panel
						icon={LayoutGrid}
						title="Found tilings"
						right={<span className="text-xs text-fg-muted font-mono tabular-nums">{run.count ?? "—"} distinct</span>}
					>
						<div className="flex flex-col items-center justify-center py-10 text-center">
							<LayoutGrid size={28} className="text-fg-disabled/40 mb-3" />
							<p className="text-sm text-fg-muted">{run.count ?? 0} cells mirrored</p>
							<Badge tone="info" className="mt-2">
								live gallery — M2
							</Badge>
						</div>
					</Panel>

					<Panel icon={Gauge} title="Diagnostics">
						<div className="grid grid-cols-2 gap-2">
							<Stat label="gate rejected" value={agg.gateRejected.toLocaleString()} />
							<Stat label="P0 skipped" value={agg.p0.toLocaleString()} />
							<Stat label="P1 pruned" value={agg.p1.toLocaleString()} />
							<Stat label="oblique candidates" value={agg.obl.toLocaleString()} />
						</div>
						<p className="mt-3 text-[10px] text-fg-disabled">
							Aggregated across {seedsArr.filter((s) => s.diag).length} reporting seeds. INCOMPLETE-log feed + “copy as
							SYNC entry” land in M3.
						</p>
					</Panel>

					<Panel icon={BadgeCheck} title="Certification" className="lg:col-span-2">
						<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
							<Stat
								label="timeouts"
								value={
									<span className={run.timeouts === 0 ? "text-emerald-400" : "text-danger"}>
										{run.timeouts}
										{run.timeouts === 0 ? " ✓" : ""}
									</span>
								}
							/>
							<Stat label="count" value={run.count ?? "—"} />
							<Stat label="digest" value={<span className="text-xs">{run.digest ?? "forming…"}</span>} tone="muted" />
							<Stat
								label="certified"
								value={
									run.certified ? (
										<span className="text-emerald-400">yes ✓</span>
									) : (
										<span className="text-fg-muted">no</span>
									)
								}
							/>
						</div>
						<p
							className={cn(
								"mt-3 rounded-lg px-3 py-2 text-xs",
								run.certified
									? "bg-emerald-400/10 text-emerald-400"
									: "bg-yellow-400/10 text-yellow-500",
							)}
						>
							{run.certified
								? "Certified."
								: isRunning
									? "Not certifiable yet: run in progress."
									: run.incomplete
										? "Not certified: run is INCOMPLETE (timeouts / truncation)."
										: "Not certified yet. Certification is a human step (scripts/certify-run.ts) — the emitter never sets it."}
						</p>
					</Panel>
				</div>
			</div>
		</div>
	);
}
