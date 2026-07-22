"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
	FlaskConical,
	Cpu,
	LayoutGrid,
	Gauge,
	BadgeCheck,
	Wifi,
	WifiOff,
	GitCompare,
	Copy,
	Check,
	AlertTriangle,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { GalleryPanel } from "@/components/run/gallery-panel";
import { useLiveRun } from "@/lib/hooks/useLiveRun";
import type { RunRow, RunSeedRow, FoundTiling } from "@/lib/services/runsService";
import { buildSyncEntry, dateOf, shortId } from "@/lib/services/syncEntry";
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
// Small inline "copy this text" affordance — clipboard only, no side effects.
function CopyChip({ text, label = "copy" }: { text: string; label?: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={() =>
				navigator.clipboard?.writeText(text).then(
					() => {
						setCopied(true);
						setTimeout(() => setCopied(false), 1400);
					},
					() => {},
				)
			}
			className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-surface-overlay/60 transition-colors"
		>
			{copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
			{copied ? "copied" : label}
		</button>
	);
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
	initialTilings,
	siblings,
}: {
	runId: string;
	initialRun: RunRow;
	initialSeeds: RunSeedRow[];
	initialTilings: FoundTiling[];
	siblings: RunRow[];
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

	// Completeness hazards — surfaced LOUDLY, never aggregated away. A timed-out or oblique-truncated
	// seed means the sweep may have dropped a tiling; the run is then not a completeness claim.
	const timedOutSeeds = useMemo(() => seedsArr.filter((s) => s.timed_out), [seedsArr]);
	const truncatedSeeds = useMemo(() => seedsArr.filter((s) => s.diag?.obliqueTruncated), [seedsArr]);
	const hazards = timedOutSeeds.length + truncatedSeeds.length;

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
							className={cn("inline-flex items-center gap-1 text-[10px]", connected ? "text-success" : "text-fg-disabled")}
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
					<div className="h-2 bg-surface-overlay/60 overflow-hidden">
						<div
							className="h-full bg-fg transition-all duration-500 ease-out"
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
						className="lg:col-span-2"
						right={<span className="text-xs text-fg-muted font-mono tabular-nums">{run.count ?? "—"} distinct</span>}
					>
						<GalleryPanel runId={runId} initial={initialTilings} />
					</Panel>

					<Panel icon={Gauge} title="Diagnostics">
						<div className="grid grid-cols-2 gap-2">
							<Stat label="gate rejected" value={agg.gateRejected.toLocaleString()} />
							<Stat label="P0 skipped" value={agg.p0.toLocaleString()} />
							<Stat label="P1 pruned" value={agg.p1.toLocaleString()} />
							<Stat label="oblique candidates" value={agg.obl.toLocaleString()} />
						</div>
						<p className="mt-3 text-[10px] text-fg-disabled">
							Aggregated across {seedsArr.filter((s) => s.diag).length} reporting seeds.
						</p>
					</Panel>

					<Panel
						icon={BadgeCheck}
						title="Certification"
						right={!isRunning ? <CopyChip text={buildSyncEntry(run)} label="copy SYNC entry" /> : undefined}
					>
						<div className="grid grid-cols-2 gap-2">
							<Stat
								label="timeouts"
								value={
									<span className={run.timeouts === 0 ? "text-success" : "text-danger"}>
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
										<span className="text-success">yes ✓</span>
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
									? "bg-success-subtle text-success"
									: "bg-warning-subtle text-warning",
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

						{hazards > 0 ? (
							<div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2">
								<div className="flex items-center gap-1.5 text-xs font-medium text-danger">
									<AlertTriangle size={13} />
									Completeness hazards — a tiling may have been dropped
								</div>
								<ul className="mt-1.5 space-y-1 text-[11px] font-mono text-fg-secondary">
									{timedOutSeeds.map((s) => (
										<li key={`to-${s.seed_idx}`} className="truncate" title={s.name ?? undefined}>
											⏱ seed #{s.seed_idx} timed out{s.name ? ` · ${s.name}` : ""}
										</li>
									))}
									{truncatedSeeds.map((s) => (
										<li key={`tr-${s.seed_idx}`} className="truncate" title={s.diag?.obliqueTruncated ?? undefined}>
											✂ seed #{s.seed_idx} oblique-truncated · {s.diag?.obliqueTruncated}
										</li>
									))}
								</ul>
							</div>
						) : null}
					</Panel>

					{/* ── digest history: same (k, family) across runs (M3) ──────────── */}
					<Panel
						icon={GitCompare}
						title="Digest history"
						className="lg:col-span-2"
						right={
							<span className="text-xs text-fg-muted font-mono">
								k={run.k} · {"{"}
								{run.family}
								{"}"}
							</span>
						}
					>
						{siblings.length === 0 ? (
							<p className="text-xs text-fg-disabled">No other runs for this k / family yet.</p>
						) : (
							<div className="overflow-x-auto">
								<table className="w-full text-xs">
									<thead>
										<tr className="text-left text-[10px] uppercase tracking-wide text-fg-disabled">
											<th className="font-normal py-1 pr-3">run</th>
											<th className="font-normal py-1 pr-3">date</th>
											<th className="font-normal py-1 pr-3">count</th>
											<th className="font-normal py-1 pr-3">digest</th>
											<th className="font-normal py-1 pr-3">vs this</th>
											<th className="font-normal py-1">state</th>
										</tr>
									</thead>
									<tbody className="font-mono tabular-nums">
										{/* this run, pinned as the reference row */}
										<tr className="border-t border-line-subtle bg-accent-subtle/30">
											<td className="py-1.5 pr-3 text-accent">{shortId(run.id)} ·this</td>
											<td className="py-1.5 pr-3 text-fg-muted">{dateOf(run)}</td>
											<td className="py-1.5 pr-3 text-fg">{run.count ?? "—"}</td>
											<td className="py-1.5 pr-3 text-fg-secondary">{run.digest ?? "—"}</td>
											<td className="py-1.5 pr-3 text-fg-disabled">ref</td>
											<td className="py-1.5">{run.certified ? "✓ cert" : run.incomplete ? "incompl." : "—"}</td>
										</tr>
										{siblings.map((s) => {
											const cmp =
												!s.digest || !run.digest
													? null
													: s.digest === run.digest
														? "match"
														: "differ";
											return (
												<tr key={s.id} className="border-t border-line-subtle">
													<td className="py-1.5 pr-3">
														<Link href={`/history/run/${s.id}`} className="text-fg-muted hover:text-accent transition-colors">
															{shortId(s.id)}
														</Link>
													</td>
													<td className="py-1.5 pr-3 text-fg-muted">{dateOf(s)}</td>
													<td className="py-1.5 pr-3 text-fg">{s.count ?? "—"}</td>
													<td className="py-1.5 pr-3 text-fg-secondary">{s.digest ?? "—"}</td>
													<td className="py-1.5 pr-3">
														{cmp === "match" ? (
															<span className="text-success">✓ match</span>
														) : cmp === "differ" ? (
															<span className="text-danger">✗ differs</span>
														) : (
															<span className="text-fg-disabled">—</span>
														)}
													</td>
													<td className="py-1.5">
														{s.certified ? (
															<span className="text-success">✓ cert</span>
														) : s.incomplete ? (
															<span className="text-danger">incompl.</span>
														) : (
															<span className="text-fg-disabled">{s.status}</span>
														)}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
								<p className="mt-2 text-[10px] text-fg-disabled">
									A digest that differs from a certified sibling is a regression signal — or just a different commit.
									Comparison only; the site never certifies.
								</p>
							</div>
						)}
					</Panel>
				</div>
			</div>
		</div>
	);
}
