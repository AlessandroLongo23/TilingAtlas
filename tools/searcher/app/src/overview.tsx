// The top of a run's page: how many tilings, how far the search got, and how they spread over k. One
// panel: the total and the roots on the left, the counts per k as columns on the right, and below them a
// strip of the facts the run has (a fact it lacks is left out, never shown as a dash).
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { InfoDot } from "@/components/ui/info-dot";
import { Tooltip } from "@/components/ui/tooltip";
import { tileFill } from "@/lib/render/tilePalette";
import { cn } from "@/lib/utils/cn";
import { polygonHue } from "@/lib/utils/renderTiling";
import { parse } from "./board";
import type { Run } from "./bridge";
import { cornerShapes } from "./corners";
import { INK } from "./figures";
import { startFold, useFold } from "./fold";
import { approx, bytes, duration, estimatedTotal, when } from "./runs";

const n = (x: number) => x.toLocaleString("en");
const percent = (x: number) =>
	x >= 0.995 ? "99%" : x < 0.01 ? `${+(x * 100).toFixed(1)}%` : `${Math.round(x * 100)}%`;
const compact = (x: number) => (x < 1e4 ? n(x) : x < 1e6 ? `${+(x / 1e3).toFixed(1)}K` : `${+(x / 1e6).toFixed(1)}M`);

export function RunOverview({ run, k, onPick }: { run: Run; k: number | null; onPick: (k: number) => void }) {
	const live = run.state === "running";
	const est = run.estimate && run.state !== "finished" ? run.estimate : null;
	const ks = Array.from({ length: Math.max(0, run.kmax - run.kmin + 1) }, (_, i) => run.kmin + i);
	const expected = est
		? ks
				.map((k) => estimatedTotal(est, k))
				.reduce<[number, number]>((t, [v, se]) => [t[0] + v, Math.hypot(t[1], se)], [0, 0])
		: null;
	const fold = useFold(run.id);
	const folded = fold && "view" in fold ? fold.view : null;
	const total = folded ? [...folded.perK.values()].reduce((t, r) => t + r.folded, 0) : run.total;
	const facts: Fact[] = [];
	if (live) {
		facts.push({ label: "Elapsed", value: duration(run.elapsed) });
		facts.push({ label: "Rate", value: `${n(Math.round(run.rate))} / s`, sub: "tilings a second" });
		if (run.work?.left)
			facts.push({
				label: "Time left",
				value: `≈ ${duration(run.work.left.seconds)}`,
				sub: `${duration(run.work.left.low)} to ${duration(run.work.left.high)}`,
			});
	} else if (run.elapsed) facts.push({ label: "Search time", value: duration(run.elapsed) });
	if (run.created) facts.push({ label: "Started", value: when(run.created) });
	if (run.options)
		facts.push({
			label: "Threads",
			value: String(run.options.threads),
			sub: run.options.nice === 0 ? "normal priority" : `nice ${run.options.nice}`,
		});
	facts.push({
		label: "Files",
		value: n(run.files.length),
		sub: run.files.length ? bytes(run.files.reduce((t, f) => t + f.bytes, 0)) : undefined,
	});

	return (
		<section className="shrink-0 overflow-hidden rounded-surface border border-line-subtle bg-surface-raised shadow-sm">
			<div className="grid grid-cols-[minmax(220px,300px)_minmax(0,1fr)] max-lg:grid-cols-1">
				<div className="flex flex-col justify-between gap-6 border-r border-line-subtle p-5 max-lg:border-r-0 max-lg:border-b">
					<div>
						<div className="ta-label">Tilings</div>
						<AnimatedNumber
							value={total}
							className="mt-2 block text-[44px] leading-none font-semibold tracking-[-0.02em] text-fg"
						/>
						<div className="mt-2 text-sm text-fg-secondary">
							{expected ? (
								<>
									of {approx(expected)} expected
									<span className="ml-1 inline-block align-[-2px]">
										<InfoDot side="bottom">
											Estimated from {n(est!.probes)} samples of the search ({Math.round(est!.seconds)} s), duplicates
											accounted for. The search visits {approx(est!.nodes)} nodes, {duration(est!.cpu[0])} of work on
											one core.
										</InfoDot>
									</span>
								</>
							) : (
								<>
									{ks.length === 1 ? `k = ${run.kmin}` : `k = ${run.kmin} to ${run.kmax}`}
									{live ? "" : run.state === "finished" ? ", the whole search" : ", so far"}
									{folded ? `, each family once (${n(run.total)} in all)` : ""}
								</>
							)}
						</div>
					</div>
					<Roots run={run} />
				</div>
				<KChart run={run} ks={ks} selected={k} onPick={onPick} folded={folded?.perK} />
			</div>
			<dl className="flex flex-wrap border-t border-line-subtle bg-surface-sunken/40 px-5 py-3.5">
				{facts.map((f) => (
					<div key={f.label} className="min-w-[7.5rem] border-l border-line-subtle px-5 first:border-l-0 first:pl-0">
						<dt className="ta-label">{f.label}</dt>
						<dd className="mt-1 text-sm font-medium text-fg">
							{f.value}
							{f.sub ? <span className="ml-1.5 text-xs font-normal text-fg-muted">{f.sub}</span> : null}
						</dd>
					</div>
				))}
				{run.state === "finished" ? <Families run={run} /> : null}
			</dl>
		</section>
	);
}

type Fact = { label: string; value: string; sub?: string };

/**
 * The run with each star family shown once (families.ts, fold.ts): on request, since it reads every
 * certificate. Only for boards with star or isotoxal faces, the only ones a family can come from.
 */
function Families({ run }: { run: Run }) {
	const board = useMemo(() => parse(run.board).board, [run.board]);
	const stars = useMemo(() => [...cornerShapes(board).values()].some((s) => s.kind === "iso"), [board]);
	const fold = useFold(run.id);
	if (!stars) return null;
	const v = fold && "view" in fold ? fold.view : null;
	const rows = v ? [...v.perK].sort((a, b) => a[0] - b[0]) : [];
	return (
		<div className="min-w-[7.5rem] border-l border-line-subtle px-5">
			<dt className="ta-label flex items-center gap-1.5">
				Families
				<InfoDot side="top" label="What folding does">
					A family is one tiling whose star points can slide: the search finds each member at its own angle, the atlas
					shows it once. Folding groups tilings that are the same once a star&rsquo;s angle is left out (same corners
					round every vertex, same gluing) and counts each group once; the chart and the tilings then show each family
					once, with a slider through its members. On the atlas&rsquo;s 15° star palette it gives 19, 42, 104 and 230
					for k = 1 to 4, the atlas&rsquo;s own counts.
				</InfoDot>
			</dt>
			<dd className="mt-1 text-sm font-medium text-fg">
				{v ? (
					<Tooltip label={rows.map(([k, r]) => `k = ${k}: ${n(r.tilings)} → ${n(r.folded)}`).join(" · ")}>
						<span>
							{n(v.families)}
							<span className="ml-1.5 text-xs font-normal text-fg-muted">
								{v.families ? "shown once each" : "no family has two members"}
								{v.unread ? ` · ${n(v.unread)} unread` : ""}
								{v.pinnedGroups ? ` · ${n(v.pinnedGroups)} groups do not flex` : ""}
							</span>
						</span>
					</Tooltip>
				) : fold && "all" in fold ? (
					<span className="text-xs font-normal text-fg-muted tabular-nums">
						Folding {n(fold.done)} of {n(fold.all)}
					</span>
				) : (
					<Button
						size="sm"
						variant="ghost"
						label={fold && "error" in fold ? `Failed: ${fold.error}` : "Fold families"}
						onClick={() => void startFold(run, board)}
					/>
				)}
			</dd>
		</div>
	);
}

// ── roots ──

// A pointy-top hexagon of circumradius 1 is √3 wide; rows of a honeycomb are 1.5 apart.
const HEX_W = Math.sqrt(3);
const HEX_FILL = tileFill(polygonHue(6));
const hex = (cx: number, cy: number, r: number) =>
	[-90, -30, 30, 90, 150, 210]
		.map(
			(a) =>
				`${(cx + r * Math.cos((a * Math.PI) / 180)).toFixed(3)},${(cy + r * Math.sin((a * Math.PI) / 180)).toFixed(3)}`,
		)
		.join(" ");

/**
 * The search's roots as a patch of the hexagonal tiling, one hexagon each: the engine searches root by
 * root, and a root's tilings reach the files when it finishes. A finished root is a tile in the hexagon's
 * colour (the app's mark), an unsearched one only its outline, so the patch fills in as the run goes;
 * while it is live, as many cells as it has threads pulse after the finished ones, the roots in hand.
 * Past two thousand roots the cells would be specks, so it becomes a plain bar.
 */
// Each caption is one line in the column's narrowest width (180px of text): a few words and a count,
// with the explanation behind the info dot. The line is a fixed h-5, so the tile never changes height.
const STAGES: Record<string, string> = {
	tables: "Building the tables",
	plan: "Trial searches",
	rank: "Ordering roots",
};
const LINE = "flex h-5 items-center gap-1.5 text-xs whitespace-nowrap text-fg-secondary";

/** Before the first root: what the engine is preparing, with its count when it has one. */
function Stage({ stage }: { stage: NonNullable<Run["stage"]> }) {
	return (
		<div className="space-y-2">
			<div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
				<div
					className={cn(
						"h-full rounded-full bg-accent transition-[width] duration-500",
						!stage.all && "w-1/3 animate-pulse",
					)}
					style={stage.all ? { width: `${(stage.done / stage.all) * 100}%` } : undefined}
				/>
			</div>
			<div className={LINE}>
				<span className="min-w-0 truncate font-medium text-fg">{STAGES[stage.name] ?? "Preparing"}</span>
				{stage.all ? (
					<span className="shrink-0 tabular-nums">
						{stage.name === "plan" ? `k ≤ ${stage.done} of ${stage.all}` : `${n(stage.done)} of ${n(stage.all)}`}
					</span>
				) : null}
				<InfoDot side="bottom" label="What happens before the search">
					Before its first root the engine builds its tables, then chooses where to start and how to branch: it runs
					short trial searches, each required set to start from under each branching rule, to k = 1, 2, 3 and on
					(the count shows the k reached), carries each one&rsquo;s growth on to your k and keeps the cheapest. The
					trials stop once they have cost a twentieth of that, or two million nodes when that is more. Last it orders
					the root types so the small ones go first (the count is the types ordered).
				</InfoDot>
			</div>
		</div>
	);
}

function Roots({ run }: { run: Run }) {
	if (run.stage) return <Stage stage={run.stage} />;
	const { done, all } = run.roots;
	const live = run.state === "running";
	const inFlight = live && all ? Math.min(run.options?.threads ?? 1, all - done) : 0;
	// about twice as wide as tall, with the last row as full as the nearby widths allow
	const near = Math.ceil(Math.sqrt(all * 4));
	const cols = Math.min(
		all,
		[0, -1, 1, -2, 2, -3, 3]
			.map((d) => Math.max(6, near + d))
			.reduce((b, c) => (((-all % c) + c) % c < ((-all % b) + b) % b ? c : b)),
	);
	const work = run.work;
	const caption = (
		<div className="space-y-2">
			<div className={LINE}>
				<span className="font-medium text-fg tabular-nums">{all ? `${n(done)} of ${n(all)}` : n(done)}</span>
				<span className="min-w-0 truncate">roots</span>
				<InfoDot side="bottom" label="What a root is">
					The search starts from each way of placing the first vertex: those are its roots. A root&rsquo;s tilings reach
					the files when the root finishes, so a stop loses at most the roots in hand, and Resume runs those again.
				</InfoDot>
			</div>
			{work ? (
				<div className="space-y-1.5">
					<div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
						<div
							className="h-full rounded-full bg-accent transition-[width] duration-500"
							style={{ width: `${work.share * 100}%` }}
						/>
					</div>
					<div className={LINE}>
						{work.share < 1 ? (
							<>
								<span className="font-medium text-fg tabular-nums">≈ {percent(work.share)}</span>
								<span className="min-w-0 truncate">{work.resumed ? "of what was left" : "of the work"}</span>
							</>
						) : (
							<span className="min-w-0 truncate">Past the estimate</span>
						)}
						<InfoDot side="bottom" label="How the work is measured">
							Roots differ in size by orders of magnitude, so the share of roots done says little about time. This is
							the nodes the engine has visited over the nodes the estimate expects, and is as good as that estimate.
							After a resume it counts from the work that was left. Past the estimate means the estimate was low.
						</InfoDot>
					</div>
				</div>
			) : null}
		</div>
	);
	if (!all || cols > 90)
		return (
			<div className="space-y-2">
				{all ? (
					<div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
						<div
							className="h-full rounded-full bg-accent transition-[width] duration-500"
							style={{ width: `${(done / all) * 100}%` }}
						/>
					</div>
				) : null}
				{caption}
			</div>
		);
	const rows = Math.ceil(all / cols);
	const w = cols * HEX_W + (rows > 1 ? HEX_W / 2 : 0);
	const h = (rows - 1) * 1.5 + 2;
	const pad = 0.06;
	return (
		<div className="space-y-3">
			<svg
				viewBox={`${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}`}
				className="block max-h-40 w-full"
				role="img"
				aria-label={`${done} of ${all} roots searched`}
			>
				{Array.from({ length: all }, (_, i) => {
					const r = Math.floor(i / cols);
					const c = i % cols;
					const state = i < done ? "done" : i < done + inFlight ? "now" : "todo";
					return (
						<polygon
							key={i}
							points={hex(c * HEX_W + HEX_W / 2 + (r % 2 ? HEX_W / 2 : 0), 1 + r * 1.5, 1)}
							strokeWidth={0.06}
							strokeLinejoin="round"
							className={cn(
								"transition-[fill,stroke] duration-500",
								state === "now" && "animate-pulse fill-accent",
								state === "todo" && "fill-transparent stroke-line",
							)}
							style={state === "todo" ? undefined : { fill: state === "done" ? HEX_FILL : undefined, stroke: INK }}
						/>
					);
				})}
			</svg>
			{caption}
		</div>
	);
}

// ── counts per k ──

const PLOT = 176; // px: the columns' room, the tallest one's label included
const HEAD = 22; // px of it kept above the tallest column for its label

/**
 * Tilings per k as columns on a log scale: counts grow about twofold per k, so on a linear one every k
 * but the last few is a sliver. Gridlines at the powers of ten carry the scale; each column's value sits
 * on its cap. While an estimate stands, a pale column behind each count is its expected total. The k the
 * browser below shows is the accent column, and clicking a column opens that k there.
 */
function KChart({
	run,
	ks,
	selected,
	onPick,
	folded,
}: {
	run: Run;
	ks: number[];
	selected: number | null;
	onPick: (k: number) => void;
	/** Per k, the count with each family once, when the run has been folded. */
	folded?: Map<number, { tilings: number; folded: number }>;
}) {
	const est = run.estimate && run.state !== "finished" ? run.estimate : null;
	const rows = ks.map((k) => {
		const found = folded?.get(k)?.folded ?? run.counts[k];
		const e = est ? estimatedTotal(est, k) : null;
		return { k, found, e, files: run.files.some((f) => f.k === k) };
	});
	const top = Math.max(10, ...rows.map((r) => Math.max(r.found ?? 0, r.e?.[0] ?? 0)));
	const L = Math.log10(1 + top);
	const y = (v: number) => (v > 0 ? Math.max(2, (Math.log10(1 + v) / L) * (PLOT - HEAD)) : 0);
	const ticks = Array.from({ length: Math.floor(Math.log10(top)) }, (_, i) => 10 ** (i + 1));
	const full = ks.length <= 12;
	// columns grow from the rail once, when the panel first shows
	const [grown, setGrown] = useState(false);
	useEffect(() => {
		const f = requestAnimationFrame(() => setGrown(true));
		return () => cancelAnimationFrame(f);
	}, []);

	return (
		<div className="flex min-w-0 flex-col gap-4 p-5">
			<div className="flex items-baseline justify-between gap-3">
				<span className="ta-label">Tilings per k{folded ? ", each family once" : ""}</span>
				<span className="font-mono text-[11px] text-fg-muted">
					{est ? (
						<span className="mr-3 inline-flex items-center gap-1.5">
							<span className="h-2 w-2 rounded-[2px] bg-fg/10" /> expected
						</span>
					) : null}
					log scale
				</span>
			</div>
			<div className="grid grid-cols-[2.25rem_minmax(0,1fr)]">
				<div className="relative" style={{ height: PLOT }}>
					{ticks.map((t) => (
						<span
							key={t}
							className="absolute right-2 translate-y-1/2 font-mono text-[10px] text-fg-muted tabular-nums"
							style={{ bottom: y(t) }}
						>
							{compact(t)}
						</span>
					))}
				</div>
				{/* the rail is the zero line and the k axis at once */}
				<div className="relative border-b border-line" style={{ height: PLOT }}>
					{ticks.map((t) => (
						<div key={t} className="absolute inset-x-0 border-t border-line-subtle/70" style={{ bottom: y(t) }} />
					))}
					<div className="absolute inset-0 flex">
						{rows.map((r, i) => {
							const on = r.k === selected;
							const label = r.found === undefined ? "" : full ? n(r.found) : compact(r.found);
							const all = run.counts[r.k];
							const tip = `k = ${r.k}: ${r.found === undefined ? "none yet" : `${n(r.found)} tilings`}${folded && all !== r.found ? ` with each family once, of ${n(all)}` : ""}${r.e ? `, ${approx(r.e)} expected` : ""}`;
							return (
								<Tooltip key={r.k} label={tip} delay={120}>
									<button
										type="button"
										disabled={!r.files}
										onClick={() => onPick(r.k)}
										aria-label={tip}
										aria-pressed={on}
										className="group relative h-full min-w-0 flex-1 cursor-pointer outline-none disabled:cursor-default"
									>
										{r.e ? (
											<span
												className="absolute bottom-0 left-1/2 w-[min(24px,62%)] -translate-x-1/2 rounded-t-[4px] bg-fg/10 transition-[height] duration-700 ease-[var(--ease-out-strong)]"
												style={{ height: grown ? y(r.e[0]) : 0, transitionDelay: `${i * 25}ms` }}
											/>
										) : null}
										<span
											className={cn(
												"absolute bottom-0 left-1/2 w-[min(24px,62%)] -translate-x-1/2 rounded-t-[4px] transition-[height,background-color] duration-700 ease-[var(--ease-out-strong)]",
												on ? "bg-accent" : "bg-fg/30 group-hover:bg-fg/50 group-focus-visible:bg-fg/50",
											)}
											style={{ height: grown ? y(r.found ?? 0) : 0, transitionDelay: `${i * 25}ms` }}
										/>
										<span
											className={cn(
												"absolute left-1/2 -translate-x-1/2 font-mono text-[11px] whitespace-nowrap tabular-nums transition-[bottom,opacity] duration-700 ease-[var(--ease-out-strong)]",
												on ? "font-medium text-fg" : "text-fg-secondary",
												grown ? "opacity-100" : "opacity-0",
											)}
											style={{
												bottom: (grown ? y(Math.max(r.found ?? 0, r.e?.[0] ?? 0)) : 0) + 5,
												transitionDelay: `${i * 25}ms`,
											}}
										>
											{label}
										</span>
										<span className="absolute inset-x-1 inset-y-0 rounded-md ring-accent/50 group-focus-visible:ring-2" />
									</button>
								</Tooltip>
							);
						})}
					</div>
				</div>
				<span className="pt-2 pr-2 text-right font-mono text-[11px] text-fg-muted">k</span>
				<div className="flex pt-2">
					{rows.map((r) => (
						<span
							key={r.k}
							className={cn(
								"min-w-0 flex-1 text-center font-mono text-[11px] tabular-nums",
								r.k === selected ? "font-medium text-fg" : "text-fg-muted",
							)}
						>
							{r.k}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}
