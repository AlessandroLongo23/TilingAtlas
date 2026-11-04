// The top of a run's page: how many tilings, how far the search got, and how they spread over k. One short
// band: the total and the roots, the counts per k as columns, and the facts the run has (a fact it lacks is
// left out, never shown as a dash).
import { useEffect, useMemo, useRef, useState } from "react";
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
import { approx, bytes, duration, estimatedTotal, RULE_NAME, when } from "./runs";

const n = (x: number) => x.toLocaleString("en");
export const percent = (x: number) =>
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
	if (run.ended) facts.push({ label: run.state === "finished" ? "Finished" : "Stopped", value: when(run.ended) });
	if (run.options)
		facts.push({
			label: "Threads",
			value: String(run.options.threads),
			sub: run.options.nice === 0 ? "normal priority" : `nice ${run.options.nice}`,
		});
	if (run.branching)
		facts.push({
			label: "Branching",
			value: RULE_NAME[run.branching],
			sub: run.options?.rule ? "forced" : "auto",
		});
	facts.push({
		label: "Files",
		value: n(run.files.length),
		sub: run.files.length ? bytes(run.files.reduce((t, f) => t + f.bytes, 0)) : undefined,
	});

	// One band, short enough that the tilings below fit on the first screen: the total and the roots, the
	// counts per k, and the facts in two columns. On a narrow window the three stack.
	return (
		<section className="grid shrink-0 grid-cols-[minmax(200px,260px)_minmax(0,1fr)_minmax(240px,320px)] overflow-hidden rounded-surface border border-line-subtle bg-surface-raised shadow-sm max-xl:grid-cols-[minmax(200px,260px)_minmax(0,1fr)]">
			<div className="flex flex-col justify-between gap-3 border-r border-line-subtle p-4">
				<div>
					<div className="ta-label">Tilings</div>
					<AnimatedNumber
						value={total}
						className="mt-1.5 block text-[32px] leading-none font-semibold tracking-[-0.02em] text-fg"
					/>
					{/* one line, never two: a wrap here would change the band's height mid-run and resize everything below */}
					<div className="mt-1.5 flex h-5 items-center gap-1 text-sm whitespace-nowrap text-fg-secondary">
						{expected ? (
							<>
								<span className="min-w-0 truncate">of {approx(expected)} expected</span>
								<span className="shrink-0">
									<InfoDot side="bottom">
										Estimated from {n(est!.probes)} samples of the search ({Math.round(est!.seconds)} s), duplicates
										accounted for. The search visits {approx(est!.nodes)} nodes, {duration(est!.cpu[0])} of work on
										one core.
									</InfoDot>
								</span>
							</>
						) : (
							<>{ks.length === 1 ? `k = ${run.kmin}` : `k = ${run.kmin} to ${run.kmax}`}</>
						)}
					</div>
				</div>
				{/* room for the tallest state (patch, caption, work bar), so the band keeps its height as a run goes */}
				<div className="flex min-h-[116px] flex-col justify-end">
					<Roots run={run} />
				</div>
			</div>
			<KChart run={run} ks={ks} selected={k} onPick={onPick} folded={folded?.perK} />
			{/* equal columns, so a live value growing a digit never shifts the facts after it */}
			<dl className="grid content-start grid-cols-2 gap-x-5 gap-y-3 border-l border-line-subtle p-4 max-xl:col-span-2 max-xl:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] max-xl:border-t max-xl:border-l-0">
				{facts.map((f) => (
					<div key={f.label} className="min-w-0">
						<dt className="ta-label">{f.label}</dt>
						<dd className="mt-1 truncate text-sm font-medium text-fg tabular-nums" title={f.sub}>
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
		<div className="col-span-2 min-w-0">
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
 * The search's roots as a patch of the hexagonal tiling, one hexagon each in the engine's order: a
 * root's tilings reach the files when it finishes. A finished root is a tile in the hexagon's colour
 * (the app's mark), an unsearched one only its outline, so the patch fills in as the run goes; while it
 * is live the roots in hand pulse, each titled with its units done. Past two thousand roots the cells
 * would be specks, so it becomes a plain bar.
 */
// Each caption is one line in the column's narrowest width (180px of text): a few words and a count,
// with the explanation behind the info dot. The line is a fixed h-5, so the tile never changes height.
const STAGES: Record<string, string> = {
	tables: "Building the tables",
	plan: "Measuring the rules",
	rank: "Ordering roots",
	find: "Stepping stones",
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
						{stage.name === "plan" ? `${(stage.done / 10).toFixed(1)} s` : `${n(stage.done)} of ${n(stage.all)}`}
					</span>
				) : null}
				<InfoDot side="bottom" label="What happens before the search">
					Before its first root the engine builds its tables, then chooses where to start and how to branch: it
					samples the search at your k under each branching rule, from each required set it could start from, and
					keeps the one that will take the least time. The sampling takes a fiftieth of the search&rsquo;s estimated
					time, between a tenth of a second and a second and a half per way. Last it orders the root types so the
					small ones go first, again by sampling (the count is the types sampled). A resumed run keeps its rule.
				</InfoDot>
			</div>
		</div>
	);
}

function Roots({ run }: { run: Run }) {
	if (run.stage) return <Stage stage={run.stage} />;
	// a find run has no roots of its own: its steps are separate searches (tilesearch --find)
	if (run.options?.find) return <div className={LINE}>{run.note || "Stepping stones"}</div>;
	const { done, all, finished, active = [] } = run.roots;
	const live = run.state === "running";
	const inHand = new Map(active.map((a) => [a.root, a]));
	// the roots by number when the app has them, else (a run from before) the finished first, then the threads
	const finishedSet = finished ? new Set(finished) : null;
	const inFlight = live && all ? Math.min(run.options?.threads ?? 1, all - done) : 0;
	const cell = (i: number) =>
		finishedSet
			? finishedSet.has(i)
				? "done"
				: inHand.has(i)
					? "now"
					: "todo"
			: i < done
				? "done"
				: i < done + inFlight
					? "now"
					: "todo";
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
				<span className="min-w-0 truncate">roots{live && active.length ? `, ${n(active.length)} in hand` : ""}</span>
				<InfoDot side="bottom" label="What a root is">
					The search is split by the first vertex: root r finds exactly the tilings whose first vertex, in the
					board&rsquo;s order, is vertex type r, so no two roots find the same tiling. The pulsing cells are the roots
					in hand; point at one for its units. A root&rsquo;s tilings reach the files when it finishes. In a large run
					each root is split further into units, one per partial tiling a few edges deep, each kept on disk as it
					finishes, so a stop loses at most the units in hand, and Resume runs only those again.
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
		<div className="space-y-2">
			<svg
				viewBox={`${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}`}
				className="block h-12 w-full"
				role="img"
				aria-label={`${done} of ${all} roots searched`}
			>
				{Array.from({ length: all }, (_, i) => {
					const r = Math.floor(i / cols);
					const c = i % cols;
					const state = cell(i);
					const a = inHand.get(i);
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
						>
							{a ? (
								<title>{`Root ${i + 1}: ${a.all > 1 ? `${n(a.done)} of ${n(a.all)} units done` : "in hand"}`}</title>
							) : null}
						</polygon>
					);
				})}
			</svg>
			{caption}
		</div>
	);
}

// ── counts per k ──

const PLOT = 112; // px: the columns' room, the tallest one's label included
const HEAD = 18; // px of it kept above the tallest column for its label

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
	// many k: label the axis every `step` k so the labels never touch, and print a count only where it fits
	const plot = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const el = plot.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setWidth(el.clientWidth));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const col = width ? width / rows.length : Infinity;
	const CHAR = 7; // px per character at 11px mono, with a little air
	const kw = String(ks[ks.length - 1] ?? 1).length * CHAR + 6;
	const step = [1, 2, 5, 10, 20, 50, 100].find((s) => s * col >= kw) ?? 100;
	// the selected k is always labelled, so the ticks too close to it give way
	const tick = (k: number) =>
		k === selected || (k % step === 0 && (selected === null || Math.abs(k - selected) * col >= kw));
	// columns grow from the rail once, when the panel first shows
	const [grown, setGrown] = useState(false);
	useEffect(() => {
		const f = requestAnimationFrame(() => setGrown(true));
		return () => cancelAnimationFrame(f);
	}, []);

	return (
		<div className="flex min-w-0 flex-col justify-between gap-2 p-4">
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
					<div ref={plot} className="absolute inset-0 flex">
						{rows.map((r, i) => {
							const on = r.k === selected;
							const text = r.found === undefined ? "" : full ? n(r.found) : compact(r.found);
							const label = on || text.length * CHAR <= col ? text : "";
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
				<div className="flex h-6 pt-2">
					{rows.map((r) => (
						<span key={r.k} className="relative min-w-0 flex-1">
							{tick(r.k) ? (
								<span
									className={cn(
										"absolute left-1/2 -translate-x-1/2 font-mono text-[11px] tabular-nums",
										r.k === selected ? "font-medium text-fg" : "text-fg-muted",
									)}
								>
									{r.k}
								</span>
							) : null}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}
