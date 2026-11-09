// The top of a run's page: how many tilings, how far the search got, and how they spread over k. One short
// band: the total and the roots, the counts per k as columns, and the facts the run has (a fact it lacks is
// left out, never shown as a dash).
import { useMemo, type ReactNode } from "react";
import { Button } from "@/design-system/components/button";
import { AnimatedNumber } from "@/design-system/components/animated-number";
import { Field } from "@/design-system/components/field";
import { InfoDot } from "@/design-system/components/info-dot";
import { ColumnChart, type Column } from "@/design-system/components/column-chart";
import { Tooltip } from "@/design-system/components/tooltip";
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

export function RunOverview({ run, k, onPick }: { run: Run; k: number | null; onPick: (k: number | "all") => void }) {
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
		<section className="ta-card grid shrink-0 grid-cols-[minmax(200px,260px)_minmax(0,1fr)_minmax(240px,320px)] overflow-hidden shadow-raised max-xl:grid-cols-[minmax(200px,260px)_minmax(0,1fr)]">
			<div className="flex flex-col justify-between gap-3 border-r border-line-subtle p-4">
				<Field label="Tilings">
					<AnimatedNumber
						value={total}
						className="block text-display leading-none font-semibold tracking-tight text-fg"
					/>
					{/* one line, never two: a wrap here would change the band's height mid-run and resize everything below */}
					<div className="flex h-5 items-center gap-1 text-body whitespace-nowrap text-fg-secondary">
						{expected ? (
							<>
								<span className="min-w-0 truncate">of {approx(expected)} expected</span>
								<span className="shrink-0">
									<InfoDot side="bottom">
										Estimated from {n(est!.probes)} samples of the search ({Math.round(est!.seconds)} s), duplicates
										accounted for. The search visits {approx(est!.nodes)} nodes, {duration(est!.cpu[0])} of work on one
										core.
									</InfoDot>
								</span>
							</>
						) : (
							<>{ks.length === 1 ? `k = ${run.kmin}` : `k = ${run.kmin} to ${run.kmax}`}</>
						)}
					</div>
				</Field>
				{/* room for the tallest state (patch, caption, work bar), so the band keeps its height as a run goes */}
				<div className="flex min-h-[116px] flex-col justify-end">
					<Roots run={run} />
				</div>
			</div>
			<KChart run={run} ks={ks} selected={k} onPick={onPick} folded={folded?.perK} />
			<Facts facts={facts}>{run.state === "finished" ? <Families run={run} /> : null}</Facts>
		</section>
	);
}

export type Fact = { label: string; value: string; sub?: string; title?: string };

/** A band's facts, a label over each value and its note muted after it: a run's, a study's, a find run's. Equal
 *  columns, so a live value growing a digit never shifts the facts after it. */
export function Facts({ facts, children }: { facts: Fact[]; children?: ReactNode }) {
	return (
		<dl className="grid grid-cols-2 content-start gap-x-5 gap-y-3 border-l border-line-subtle p-4 max-xl:col-span-2 max-xl:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] max-xl:border-t max-xl:border-l-0">
			{facts.map((f) => (
				<div key={f.label} className="min-w-0">
					<dt className="ta-label">{f.label}</dt>
					<dd className="mt-1 truncate text-body font-medium text-fg tabular-nums" title={f.title ?? f.sub}>
						{f.value}
						{f.sub ? <span className="ml-1.5 text-small font-normal text-fg-muted">{f.sub}</span> : null}
					</dd>
				</div>
			))}
			{children}
		</dl>
	);
}

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
			<dd className="mt-1 text-body font-medium text-fg">
				{v ? (
					<Tooltip label={rows.map(([k, r]) => `k = ${k}: ${n(r.tilings)} → ${n(r.folded)}`).join(" · ")}>
						<span>
							{n(v.families)}
							<span className="ml-1.5 text-small font-normal text-fg-muted">
								{v.families ? "shown once each" : "no family has two members"}
								{v.unread ? ` · ${n(v.unread)} unread` : ""}
								{v.pinnedGroups ? ` · ${n(v.pinnedGroups)} groups do not flex` : ""}
							</span>
						</span>
					</Tooltip>
				) : fold && "all" in fold ? (
					<span className="text-small font-normal text-fg-muted tabular-nums">
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
const LINE = "flex h-5 items-center gap-1.5 text-small whitespace-nowrap text-fg-secondary";

/** Before the first root: what the engine is preparing, with its count when it has one. */
function Stage({ stage }: { stage: NonNullable<Run["stage"]> }) {
	return (
		<div className="space-y-2">
			<div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
				<div
					className={cn(
						"h-full rounded-full bg-accent transition-[width] motion-settle",
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
					Before its first root the engine builds its tables, then chooses where to start and how to branch: it samples
					the search at your k under each branching rule, from each required set it could start from, and keeps the one
					that will take the least time. The sampling takes a fiftieth of the search&rsquo;s estimated time, between a
					tenth of a second and a second and a half per way. Last it orders the root types so the small ones go first,
					again by sampling (the count is the types sampled). A resumed run keeps its rule.
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
							className="h-full rounded-full bg-accent transition-[width] motion-settle"
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
							className="h-full rounded-full bg-accent transition-[width] motion-settle"
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
								"transition-[fill,stroke] motion-settle",
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

/**
 * Tilings per k as columns (ColumnChart). While an estimate stands, a pale column behind each count is its
 * expected total. The k the browser below shows is the accent column, and clicking a column opens that k there;
 * clicking the accent column again opens every k at once (the browser has no k picker of its own).
 */
export function KChart({
	run,
	ks,
	selected,
	onPick,
	folded,
	complete,
}: {
	run: Run;
	ks: number[];
	selected: number | null;
	/** A column clicked: its k, or "all" when it was the picked one. */
	onPick: (k: number | "all") => void;
	/** Per k, the count with each family once, when the run has been folded. */
	folded?: Map<number, { tilings: number; folded: number }>;
	/** The highest k whose count is final (a study's whole board): the columns past it are pale, so far. */
	complete?: number;
}) {
	const est = run.estimate && run.state !== "finished" ? run.estimate : null;
	const columns = ks.map((k): Column => {
		const found = folded?.get(k)?.folded ?? run.counts[k];
		const e = est ? estimatedTotal(est, k) : null;
		const part = complete !== undefined && k > complete;
		const all = run.counts[k];
		return {
			x: k,
			count: found,
			behind: e?.[0],
			part,
			disabled: !run.files.some((f) => f.k === k),
			tip: `k = ${k}: ${found === undefined ? "none yet" : `${n(found)} tiling${found === 1 ? "" : "s"}`}${part ? " so far, not every row searched to here" : ""}${folded && all !== found ? ` with each family once, of ${n(all)}` : ""}${e ? `, ${approx(e)} expected` : ""}${k === selected ? ". Click again for every k" : ""}`,
		};
	});
	return (
		<div className="flex min-w-0 flex-col justify-between gap-2 p-4">
			<div className="flex items-baseline justify-between gap-3">
				<span className="ta-label">Tilings per k{folded ? ", each family once" : ""}</span>
				<span className="font-mono text-caption text-fg-muted">
					{est || columns.some((c) => c.part && c.count) ? (
						<span className="mr-3 inline-flex items-center gap-1.5">
							<span className="h-2 w-2 rounded-mark bg-fg/10" /> {est ? "expected" : "incomplete"}
						</span>
					) : null}
					log scale
				</span>
			</div>
			<ColumnChart columns={columns} selected={selected} onPick={(k) => onPick(k === selected ? "all" : k)} axis="k" />
		</div>
	);
}
