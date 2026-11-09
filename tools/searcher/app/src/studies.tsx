// A study's page and its settings on the board page (study.ts says what a study is). The page reads as a run's
// does: the name and state on top, one band with what the rows came to, then the rows themselves, each a
// combination with its outcome; a row with a search opens that run.
import {
	ArrowDownAZ,
	ArrowDownZA,
	Ban,
	BookOpen,
	Check,
	ChevronsUp,
	Clock,
	Copy,
	Cpu,
	FilePen,
	FolderOpen,
	Link2,
	Minus,
	Pause,
	Play,
	Plus,
	Rows3,
	Timer,
	TimerOff,
	Trash2,
	TriangleAlert,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatedNumber } from "@/design-system/components/animated-number";
import { Badge } from "@/design-system/components/badge";
import { Button } from "@/design-system/components/button";
import { CheckboxBox } from "@/design-system/components/checkbox";
import { ActionMenu } from "@/design-system/components/context-menu";
import { Dropdown } from "@/design-system/components/dropdown";
import { InfoDot } from "@/design-system/components/info-dot";
import { Input } from "@/design-system/components/input";
import { Modal } from "@/design-system/components/modal";
import { OptionWall } from "@/design-system/components/option-wall";
import { Pagination } from "@/design-system/components/pagination";
import { RangeInput } from "@/design-system/components/range-input";
import { SearchInput } from "@/design-system/components/search-input";
import { Spinner } from "@/design-system/components/spinner";
import { Tooltip } from "@/design-system/components/tooltip";
import { cn } from "@/lib/utils/cn";
import { MAX_K, minpolys, parse, polyDegree, polyText, type Board } from "./board";
import {
	describeRaise,
	minutesText,
	raiseCeiling,
	raiseStop,
	type RaiseRule,
	type FaceTally,
	type RowState,
	type OutFile,
	type Run,
	type RunOptions,
	type Status,
	type StudyDetail,
	type StudyEdit,
	type StudyOptions,
	type StudyRow,
	type StudySummary,
} from "./bridge";
import { Problems } from "./editor";
import { Facts, KChart, type Fact } from "./overview";
import { DeleteModal, duration, ImproveModal, RaiseConditions, ThreadsInput, threadsHint, when, earlierOf, withEarlier } from "./runs";
import { PRIORITY_HINT, PriorityInput } from "./settings";
import { Field } from "@/design-system/components/field";
import {
	faceLabels,
	faceTally,
	freeParam,
	MAX_ROWS,
	paramText,
	planStudy,
	readParams,
	substitute,
	wholeBoards,
	withoutOptionalFace,
	withParam,
	withSubsets,
	type Param,
	type StudyPlan,
} from "./study";
import { GroupPicker, groupOfK, resolveGroup, TilingsView, type Group } from "./tilings";

const api = () => window.tilesearch;
const n = (x: number) => x.toLocaleString("en");

// ── what a row came to ──

/** The study's state as its badge reads. */
export function studyLabel(s: StudySummary): string {
	if (s.state === "checking") return `checking ${n(s.checked)} of ${n(s.rowCount)}`;
	if (s.state === "running") return "running";
	if (s.state === "paused") return "paused";
	return "complete";
}
export const STUDY_TONE = { checking: "accent", running: "accent", paused: "neutral", done: "success" } as const;

/** The outcomes in the order the band and the filter show them, each with its colour. */
const OUTCOMES: { key: string; label: string; states: RowState[]; bar: string }[] = [
	{ key: "found", label: "Found", states: ["found"], bar: "bg-success" },
	{ key: "none", label: "None found", states: ["none"], bar: "bg-fg/35" },
	{ key: "ruled", label: "Ruled out", states: ["ruled-out", "same"], bar: "bg-fg/15" },
	// stopped by a time limit or a ceiling of the raise rule: done for the study until Finish or a new limit
	{ key: "limit", label: "Limit reached", states: ["limit"], bar: "bg-signal-attention" },
	{ key: "searching", label: "Searching", states: ["running", "queued"], bar: "bg-accent" },
	{ key: "left", label: "Left", states: ["waiting", "checking", "stopped"], bar: "bg-fg/[0.06]" },
	{ key: "failed", label: "Failed", states: ["failed", "conflict"], bar: "bg-danger" },
];
const tallyOf = (s: StudySummary, states: RowState[]) => states.reduce((t, x) => t + (s.tally[x] ?? 0), 0);

/** A raised row's new search, after what the search before it found: " · queued to k = 12". */
const raisingText = (r: StudyRow) =>
	r.raising
		? ` · ${r.raising.state === "running" ? "searching" : r.raising.state === "queued" ? "queued" : "paused"} to k = ${r.raising.k}`
		: "";

/** What the rows holding a face found, in words (faceTally): "none up to k = 12". */
const verdict = (t: FaceTally) =>
	t.found
		? `tilings in ${n(t.found)} row${t.found === 1 ? "" : "s"}`
		: t.proven
			? "ruled out at every k"
			: t.through
				? `none up to k = ${t.through}`
				: t.left
					? `none yet, ${n(t.left)} row${t.left === 1 ? "" : "s"} to search`
					: "none found";

/** How a row's outcome reads in the table, with its icon. */
function outcome(r: StudyRow): { icon: React.ReactNode; text: string; tone: string } {
	const cls = "h-3.5 w-3.5 shrink-0";
	const raisingNow = r.raising?.state === "running";
	switch (r.state) {
		case "found":
			return {
				icon: raisingNow ? <Spinner className="text-fg-accent" /> : <Check className={cn(cls, "text-success")} />,
				text: `from k = ${r.first}${raisingText(r)}`,
				tone: "text-fg",
			};
		case "none":
			return {
				icon: raisingNow ? <Spinner className="text-fg-accent" /> : <Minus className={cn(cls, "text-fg-muted")} />,
				text: `${r.through ? `none up to k = ${r.through}` : "none found"}${raisingText(r)}`,
				tone: "text-fg-secondary",
			};
		case "ruled-out":
			return {
				icon: <Ban className={cn(cls, "text-fg-muted")} />,
				text:
					r.by === "balance"
						? "ruled out by counting"
						: r.by === "split"
							? "faces cannot meet"
							: "a corner fits nowhere",
				tone: "text-fg-secondary",
			};
		case "same":
			return {
				icon: <Link2 className={cn(cls, "text-fg-muted")} />,
				text: "same board as another row",
				tone: "text-fg-muted",
			};
		case "running":
			return {
				icon: <Spinner className="text-fg-accent" />,
				text: `searching${r.reached ? ` to k = ${r.reached}` : ""}${r.roots?.all ? ` · ${n(r.roots.done)} of ${n(r.roots.all)} roots` : ""}`,
				tone: "text-fg",
			};
		case "queued":
			return { icon: <Clock className={cn(cls, "text-fg-muted")} />, text: "queued", tone: "text-fg-muted" };
		case "waiting":
			return { icon: <Clock className={cn(cls, "text-fg-muted")} />, text: "waiting", tone: "text-fg-muted" };
		case "checking":
			return { icon: <Clock className={cn(cls, "text-fg-disabled")} />, text: "checking", tone: "text-fg-muted" };
		case "limit":
		case "stopped":
			// part of its roots finished: what they found so far, never a first k (later roots may find lower k)
			return {
				icon:
					r.state === "limit" ? (
						<Timer className={cn(cls, "text-fg-muted")} />
					) : (
						<Pause className={cn(cls, "text-fg-muted")} />
					),
				// at the study's time limit, or past a ceiling of its raise rule (the reason says which)
				text: `${r.state === "limit" ? (r.reason ? "stopped by its rule" : "time limit") : "stopped"}${r.reached ? ` at k = ${r.reached}` : ""}${r.total ? ` · ${n(r.total)} so far` : ""}${r.roots?.all ? ` · ${n(r.roots.done)} of ${n(r.roots.all)} roots` : ""}`,
				tone: "text-fg-secondary",
			};
		case "conflict":
			return {
				icon: <TriangleAlert className={cn(cls, "text-danger")} />,
				text: "ruled out, yet tilings found",
				tone: "text-danger",
			};
		default:
			return { icon: <TriangleAlert className={cn(cls, "text-danger")} />, text: "failed", tone: "text-danger" };
	}
}

/** A row's name as chips: its parameter values, then its optional faces; "no optional face" for the empty one. */
function RowChips({ r }: { r: StudyRow }) {
	const values = Object.entries(r.values);
	return (
		<span className="flex min-w-0 flex-wrap items-center gap-1">
			{values.map(([k, v]) => (
				<Badge key={k} tone="accent" mono>
					{k} = {v}
				</Badge>
			))}
			{r.faces.map((f) => (
				<Badge key={f} mono>
					{f}
				</Badge>
			))}
			{!r.faces.length && !values.length ? <span className="text-small text-fg-muted">no optional face</span> : null}
		</span>
	);
}

/** The study as Marek writes a census: by size, one line per combination with what is known of it. */
export function censusText(s: StudyDetail): string {
	const out: string[] = [
		`# ${s.name}: ${n(s.rowCount)} rows, k = ${s.kmin} to ${s.kmax}`,
		// a face taken out narrows what the census covers: it says so, with what its rows had found
		...s.removed.map(
			(t) =>
				`# removed ${t.face} on ${t.at.slice(0, 10)}: ${n(t.rows)} rows, ${verdict(t)}${t.found ? ` (${n(t.tilings)} tilings)` : ""}`,
		),
	];
	let size = -1;
	for (const r of s.rows) {
		if (s.optional.length && r.faces.length !== size) {
			size = r.faces.length;
			out.push("", `Size ${size}`);
		}
		const name = [...Object.entries(r.values).map(([k, v]) => `${k}=${v}`), ...r.faces].join(", ") || "base";
		const what =
			r.state === "found"
				? `k=${r.first}`
				: r.state === "none"
					? r.through
						? `none up to k=${r.through}`
						: "none found"
					: r.state === "ruled-out"
						? `IMPOSSIBLE (${r.reason ?? "ruled out"})`
						: r.state === "same"
							? `same as ${r.reason?.replace(/^Same board as /, "").replace(/\.$/, "") ?? "another row"}`
							: r.state === "limit"
								? `${r.reason ? "stopped by its rule" : "time limit"}, incomplete${r.total ? ` (${n(r.total)} tilings so far)` : ""}`
								: r.state;
		out.push(`${name}: ${what}`);
	}
	return out.join("\n") + "\n";
}

// ── the whole board: every row together ──

/** A study's whole board at one combination of parameter values, as a run of it would show: see wholeOf. */
type Whole = {
	run: Run;
	/** The highest k every row has searched to the end (Infinity when every row is ruled out). */
	complete: number;
	/** The rows that end there, by why: still searching, their raise rule stopped, stopped, not run yet. */
	behind: { label: string; count: number }[];
};

/**
 * The rows of one combination of parameter values together, as one run of the study's whole board (study.ts
 * wholeBoards draws them): a row requires exactly its optional faces, so a tiling is in one row and the whole
 * board's tilings at each k are the rows' summed, no search of its own needed. They are complete to the lowest
 * k every row has searched to the end: a ruled-out row at every k, a row raising its k at the finished run its
 * new run replaces, a row not run, stopped or failed at none. Above that k the counts and files are the rows'
 * so far. A row the same as an earlier one (a parameter it does not read) stands in for it.
 */
function wholeOf(
	study: Pick<StudySummary, "dir" | "kmin">,
	rows: StudyRow[],
	board: { values: Record<string, number>; text: string },
	runs: Run[],
): Whole {
	const kmin = study.kmin;
	const byDir = new Map(runs.map((r) => [r.dir, r]));
	const counts: Record<number, number> = {};
	const files: OutFile[] = [];
	const ends: { top: number; why: string }[] = [];
	const take = (src: Run, above: number) => {
		for (const [k, c] of Object.entries(src.counts)) if (+k > above && +k >= kmin) counts[+k] = (counts[+k] ?? 0) + c;
		for (const f of src.files) if (f.k > above && f.k >= kmin) files.push({ symbols: src.symbols, ...f });
	};
	for (const row of rows) {
		if (Object.entries(board.values).some(([k, v]) => row.values[k] !== v)) continue;
		const r = row.state === "same" ? rows[Number(/row (\d+)/.exec(row.reason ?? "")?.[1] ?? 0) - 1] : row;
		if (!r || r.state === "ruled-out") continue;
		const run = r.run ? byDir.get(r.run) : undefined;
		const prev = run?.replaces ? byDir.get(run.replaces) : undefined;
		const done = run?.state === "finished" ? run : prev?.state === "finished" ? prev : undefined;
		const top = done ? done.kmax : kmin - 1;
		if (run) take(withEarlier(run, earlierOf(run, runs)), kmin - 1);
		const why = !run
			? "Not run yet"
			: run.state === "running" || run.queued
				? "Searching"
				: run === done
					? "Stopped raising"
					: "Stopped";
		ends.push({ top, why });
	}
	const complete = Math.min(Infinity, ...ends.map((e) => e.top));
	const tally = new Map<string, number>();
	for (const e of ends) if (e.top === complete) tally.set(e.why, (tally.get(e.why) ?? 0) + 1);
	const ks = Object.keys(counts).map(Number);
	const run: Run = {
		id: `whole:${JSON.stringify(board.values)}`,
		// in the study's folder, beside its board, which a drawing reads for the edge's minimal polynomial
		dir: `${study.dir}${study.dir.includes("\\") ? "\\" : "/"}whole`,
		name: "Whole board",
		created: 0,
		ended: null,
		board: board.text,
		state: "finished",
		note: "",
		counts,
		total: Object.values(counts).reduce((t, c) => t + c, 0),
		elapsed: 0,
		rate: 0,
		roots: { done: 0, all: 0 },
		stage: null,
		kmin,
		kmax: Math.max(kmin, ...ks),
		options: null,
		files: files.sort((a, b) => a.k - b.k),
		latest: null,
		log: [],
		symbols: {},
		stats: null,
		branching: null,
		estimate: null,
		work: null,
		packing: null,
		find: null,
		disk: null,
	};
	return { run, complete, behind: [...tally].map(([label, count]) => ({ label, count })) };
}

// ── the page ──

const PAGE = 50;
// What the rows are ordered by, each read off a row (null when it has none: no tiling, not yet searched), and the
// direction it starts in when picked (more faces, tilings and time first; the lowest first k first). Rows with
// nothing to sort by stay at the end either way, and ties keep the study's order.
const SORTS = {
	order: { label: "Row", key: (r: StudyRow) => r.index, desc: false },
	faces: { label: "Faces", key: (r: StudyRow) => r.faces.length, desc: true },
	first: { label: "First k", key: (r: StudyRow) => r.first ?? null, desc: false },
	reached: { label: "k reached", key: (r: StudyRow) => r.reached ?? null, desc: true },
	tilings: { label: "Tilings", key: (r: StudyRow) => r.total || null, desc: true },
	time: { label: "Search time", key: (r: StudyRow) => r.elapsed || null, desc: true },
} as const;
type Sort = keyof typeof SORTS;
const sorter = (sort: Sort, desc: boolean) => (a: StudyRow, b: StudyRow) => {
	const [x, y] = [SORTS[sort].key(a), SORTS[sort].key(b)];
	if (x === null || y === null) return x === y ? a.index - b.index : x === null ? 1 : -1;
	return (desc ? y - x : x - y) || a.index - b.index;
};
/** The row filters: by outcome, how many optional faces a row holds, a face it holds or lacks, a parameter's
 *  value, and the k of its first tiling (the bars over the table set this one). */
type Filters = {
	outcome: string;
	size: string;
	holds: string;
	lacks: string;
	first: number | null;
	values: Record<string, string>;
};
const NO_FILTER: Filters = { outcome: "all", size: "any", holds: "any", lacks: "any", first: null, values: {} };

export function StudyView({
	summary,
	status,
	options,
	cores,
	onEdit,
	onSelect,
}: {
	summary: StudySummary;
	status: Status;
	/** The app's run settings, for a row's Raise k. */
	options: RunOptions;
	cores: number;
	onEdit: (board: string) => void;
	onSelect: (id: string | null) => void;
}) {
	// the rows come on request (status carries only the summary): again whenever the summary changes
	// at most every 1.5 s: a study of thousands of rows changes on every tick while its rows run
	const [detail, setDetail] = useState<StudyDetail | null>(null);
	const key = JSON.stringify([summary.id, summary.tally, summary.checked, summary.state, summary.elapsed]);
	const fetched = useRef(0);
	useEffect(() => {
		let live = true;
		const t = setTimeout(
			() => {
				fetched.current = Date.now();
				void api()
					.study(summary.id)
					.then((d) => live && setDetail(d));
			},
			Math.max(0, fetched.current + 1500 - Date.now()),
		);
		return () => (clearTimeout(t), void (live = false));
	}, [key, summary.id]);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState("");
	const [filters, setFilters] = useState<Filters>(NO_FILTER);
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<Sort>("order");
	const [desc, setDesc] = useState(false);
	const [page, setPage] = useState(1);
	const filter = (f: Partial<Filters>) => (setFilters((x) => ({ ...x, ...f })), setPage(1));
	const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTER) || !!query;
	// the row whose run Raise k is open for, and Raise k for every row
	const [raising, setRaising] = useState<string | null>(null);
	const [raisingAll, setRaisingAll] = useState(false);
	const [limiting, setLimiting] = useState(false);
	const [resourcing, setResourcing] = useState(false);
	const [widening, setWidening] = useState(false);
	const raised = raising ? status.runs.find((r) => r.dir === raising) : undefined;
	const going = summary.state === "checking" || summary.state === "running";
	// the searches a time limit stopped, which Finish lets go on (a disk ceiling holds)
	const finishable = detail?.rows.filter((r) => r.state === "limit" && !r.reason?.includes("wrote over")).length ?? 0;
	const act = async (action: "pause" | "resume" | "unraise" | "finish") =>
		setError((await api().studyAction(summary.id, action)).error ?? "");
	const running = status.runs.some((r) => r.state === "running" && r.dir.startsWith(summary.dir));
	// the rows one by one, or all together as the whole board (an enumeration with optional faces): its tilings
	// per k on top and its previews below, at one combination of parameter values
	const canWhole = summary.options.mode === "enumerate" && summary.optional.length > 0;
	const views = ["Rows", ...(summary.optional.length ? ["Faces"] : []), ...(canWhole ? ["Whole board"] : [])];
	const [view, setView] = useState("Rows");
	// the study board without a face, while Remove's preview is open
	const [edited, setEdited] = useState<{ text: string; face: string } | null>(null);
	const remove =
		detail && !summary.params.length
			? (face: string) => {
					const text = withoutOptionalFace(detail.template, face);
					if (text) setEdited({ text, face });
				}
			: null;
	const [at, setAt] = useState(0);
	const [group, setGroup] = useState<Group | null>(null);
	const template = detail?.template;
	const boards = useMemo(() => (template && canWhole ? wholeBoards(template) : []), [template, canWhole]);
	const board = boards[Math.min(at, boards.length - 1)];
	const whole = useMemo(
		() => (view === "Whole board" && detail && board ? wholeOf(summary, detail.rows, board, status.runs) : null),
		[view, detail, board, summary, status.runs],
	);
	const shownK = whole ? resolveGroup(whole.run, group)?.k : undefined;

	const rows = useMemo(() => {
		if (!detail) return [];
		const states = OUTCOMES.find((o) => o.key === filters.outcome)?.states;
		const q = query.toLowerCase();
		const keep = detail.rows.filter(
			(r) =>
				(!states || states.includes(r.state)) &&
				(filters.size === "any" || r.faces.length === Number(filters.size)) &&
				(filters.holds === "any" || r.faces.includes(filters.holds)) &&
				(filters.lacks === "any" || !r.faces.includes(filters.lacks)) &&
				(filters.first === null || (r.state === "found" && r.first === filters.first)) &&
				Object.entries(filters.values).every(([k, v]) => v === "any" || String(r.values[k]) === v) &&
				(!q || [r.name, ...r.faces].some((x) => x.toLowerCase().includes(q))),
		);
		return keep.sort(sorter(sort, desc));
	}, [detail, filters, query, sort, desc]);

	// the rows: filters over the table, then the table and its pages
	const table = (
		<>
			<RowFilters
				s={summary}
				filters={filters}
				onFilter={filter}
				query={query}
				onQuery={(q) => (setQuery(q), setPage(1))}
				sort={sort}
				desc={desc}
				onSort={(s) => (setSort(s), setDesc(SORTS[s].desc))}
				onFlip={() => setDesc((d) => !d)}
				shown={rows.length}
				of={detail?.rows.length ?? summary.rowCount}
				active={filtered}
				onClear={() => (setFilters(NO_FILTER), setQuery(""), setPage(1))}
			/>
			<RowsTable
				// a new filter, order or page starts at the top
				key={JSON.stringify([filters, query, sort, desc, page])}
				rows={rows.slice((page - 1) * PAGE, page * PAGE)}
				loading={!detail}
				onOpen={onSelect}
				onRaise={(run) => setRaising(run)}
				busy={(run) => status.runs.some((r) => r.dir === run && r.state === "running")}
				ks={summary.options.mode === "enumerate" ? [summary.kmin, summary.kmax] : null}
			/>
			{rows.length > PAGE ? (
				<div className="shrink-0 border-t border-line-subtle px-4 py-2.5">
					<Pagination totalItems={rows.length} pageSize={PAGE} currentPage={page} onPageChange={setPage} />
				</div>
			) : null}
		</>
	);

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
			<div className="flex flex-wrap items-start gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h1 className="truncate text-heading font-semibold text-fg">{summary.name}</h1>
						<Badge tone={STUDY_TONE[summary.state]}>{studyLabel(summary)}</Badge>
						{views.length > 1 ? (
							<div className={cn("ml-3 shrink-0", views.length > 2 ? "w-80" : "w-56")}>
								<OptionWall
									columns={views.length}
									options={views.map((v) => ({ value: v, label: v }))}
									selected={view}
									onChange={(v) => (setView(v), setGroup(null))}
								/>
							</div>
						) : null}
					</div>
					{summary.note || error ? (
						<p className={cn("mt-1.5 text-body", error ? "text-danger" : "text-fg-secondary")}>{error || summary.note}</p>
					) : null}
				</div>
				<div className="flex gap-2">
					{going ? (
						<Button size="sm" icon={Pause} label="Pause" onClick={() => void act("pause")} />
					) : summary.state === "paused" ? (
						<Button size="sm" variant="primary" icon={Play} label="Resume" onClick={() => void act("resume")} />
					) : null}
					{finishable ? (
						<Tooltip
							label={`Let the ${n(finishable)} search${finishable === 1 ? "" : "es"} a time limit stopped finish the k ${finishable === 1 ? "it was" : "they were"} on, with no limit and raising k no further`}
						>
							<Button size="sm" icon={TimerOff} label={`Finish ${n(finishable)}`} onClick={() => void act("finish")} />
						</Tooltip>
					) : null}
					{summary.options.mode === "enumerate" ? (
						<Button
							size="sm"
							icon={ChevronsUp}
							label="Raise k"
							disabled={!detail}
							onClick={() => setRaisingAll(true)}
						/>
					) : null}
					<ActionMenu
						label="More actions"
						className="h-8 w-8"
						items={[
							{ label: "Time limit…", icon: Timer, disabled: !detail, onSelect: () => setLimiting(true) },
							{ label: "Threads and priority…", icon: Cpu, onSelect: () => setResourcing(true) },
							...(summary.sizes[1] < summary.optional.length
								? [{ label: "More faces per row…", icon: Rows3, disabled: !detail, onSelect: () => setWidening(true) }]
								: []),
							{ label: "Edit board", icon: FilePen, disabled: !detail, onSelect: () => detail && onEdit(detail.template) },
							{ label: "Show folder", icon: FolderOpen, onSelect: () => void api().reveal(summary.dir) },
							...(summary.options.raise
								? [{ label: "Stop raising k", icon: ChevronsUp, onSelect: () => void act("unraise") }]
								: []),
							{
								label: "Copy census",
								icon: Copy,
								disabled: !detail,
								onSelect: () => detail && void navigator.clipboard?.writeText(censusText(detail)),
							},
							{
								label: "Delete study",
								icon: Trash2,
								danger: true,
								disabled: running,
								onSelect: () => setDeleting(true),
							},
						]}
					/>
				</div>
			</div>
			<DeleteModal
				target={deleting ? summary.dir : null}
				what="study"
				runs={status.runs}
				onClose={() => setDeleting(false)}
				onDeleted={() => (setDeleting(false), onSelect(null))}
			/>

			<StudyOverview
				s={summary}
				detail={detail}
				onFilter={(outcome) => filter({ outcome })}
				first={filters.first}
				onFirst={(first) => filter({ first: first === filters.first ? null : first })}
				whole={whole}
				k={typeof shownK === "number" ? shownK : null}
				onK={(k) => whole && setGroup(groupOfK(whole.run, k, group))}
			/>

			{/* the rest of the window, at least 420 px: the table scrolls inside it, under its header; or the
			    whole board's tilings, as a run shows its own */}
			<section className="ta-card flex min-h-[420px] flex-1 flex-col overflow-hidden shadow-raised">
				{whole ? (
					<>
						<div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-line-subtle px-4 py-3">
							{boards.length > 1 ? (
								<Dropdown
									value={String(at)}
									options={boards.map((b, i) => ({
										value: String(i),
										label: Object.entries(b.values)
											.map(([k, v]) => `${k} = ${v}`)
											.join(", "),
									}))}
									onChange={(v) => (setAt(Number(v)), setGroup(null))}
									aria-label="Parameter values"
								/>
							) : null}
							<span className="mr-auto text-body text-fg-secondary">Every row&apos;s tilings together</span>
							<GroupPicker run={whole.run} group={group} onGroup={setGroup} />
						</div>
						<div className="min-h-0 flex-1">
							<TilingsView key={whole.run.id} run={whole.run} group={group} />
						</div>
					</>
				) : view === "Faces" ? (
					<FacesTable detail={detail} optional={summary.optional} onRemove={remove} />
				) : (
					table
				)}
			</section>
			{edited ? (
				<StudyEditModal
					id={summary.id}
					name={summary.name}
					text={edited.text}
					onClose={() => setEdited(null)}
					onDone={() => setEdited(null)}
				/>
			) : null}
			{raisingAll && detail ? (
				<StudyRaiseModal summary={summary} detail={detail} onClose={() => setRaisingAll(false)} onError={setError} />
			) : null}
			{limiting && detail ? (
				<StudyLimitModal summary={summary} detail={detail} onClose={() => setLimiting(false)} onError={setError} />
			) : null}
			{resourcing ? (
				<StudyResourcesModal summary={summary} cores={cores} onClose={() => setResourcing(false)} onError={setError} />
			) : null}
			{widening && detail ? (
				<StudyRowsModal summary={summary} template={detail.template} onClose={() => setWidening(false)} onError={setError} />
			) : null}
			{raised ? (
				<ImproveModal
					run={raised}
					status={status}
					options={options}
					cores={cores}
					onClose={() => setRaising(null)}
					onStarted={() => setRaising(null)}
				/>
			) : null}
		</div>
	);
}

/** Whether a row goes on under a new raise rule, as Study.raise decides, from what the window knows of it. */
function goesOn(r: StudyRow, rule: RaiseRule): boolean {
	if (r.raising) return false; // going on already
	const top = Math.max(0, ...Object.keys(r.counts).map(Number));
	if (r.state === "found" || r.state === "none")
		return !raiseStop(rule, { total: r.total, seconds: r.elapsed, bytes: 0, k: r.through ?? top });
	// stopped by a ceiling of the rule (the study's own time limit has no reason)
	if (r.state === "limit" && r.reason) return !raiseCeiling(rule, { seconds: r.elapsed, bytes: 0 });
	return false;
}

/** Raise k for every row: the study's rule set again, with the rows it sends on counted as it is edited. */
function StudyRaiseModal({
	summary,
	detail,
	onClose,
	onError,
}: {
	summary: StudySummary;
	detail: StudyDetail;
	onClose: () => void;
	onError: (e: string) => void;
}) {
	const now = summary.options.raise;
	const [rule, setRule] = useState<RaiseRule>(() => ({
		...(now ?? { found: 1, minutes: 3 }),
		upTo: Math.min(MAX_K, (now?.upTo ?? summary.kmax) + 2),
	}));
	const on = detail.rows.filter((r) => goesOn(r, rule));
	const count = (s: RowState) => on.filter((r) => r.state === s).length;
	const parts = [
		count("none") && `${n(count("none"))} that found none`,
		count("found") && `${n(count("found"))} that found fewer tilings than it asks`,
		count("limit") && `${n(count("limit"))} a limit stopped`,
	].filter(Boolean);
	const fresh = detail.rows.filter((r) => r.state === "waiting" || r.state === "checking").length;
	const apply = async () => {
		const res = await api().studyRaise(summary.id, rule);
		if (res.error) onError(res.error);
		onClose();
	};
	return (
		<Modal
			open
			onOpenChange={(o) => !o && onClose()}
			title="Raise k for every row"
			size="md"
			description="One rule for the whole study: the rows it asks more of go on"
			footer={
				<ModalFooter
					onClose={onClose}
					icon={ChevronsUp}
					label={on.length ? `Raise k · ${n(on.length)} row${on.length === 1 ? " goes" : "s go"} on` : "Set the rule"}
					onClick={() => void apply()}
				/>
			}
		>
			<div className="space-y-4 p-5 text-body">
				<RaiseConditions rule={rule} from={summary.kmin} onChange={setRule} />
				<p className="border-t border-line-subtle pt-4 text-fg-secondary">
					{on.length
						? `Goes on: ${parts.join(", ")}. Each searches on from the k it reached; ruled-out rows, and rows the rule is met for, stay as they are.`
						: "No row goes on under this rule: raise the highest k, ask for more tilings, or lift a limit."}
					{fresh ? ` The ${n(fresh)} rows not run yet start under it.` : ""}
				</p>
			</div>
		</Modal>
	);
}

/** The time limit on each search, in minutes: a raise rule's ceiling, or the study's own limit; null for none. */
const limitOf = (o: StudyOptions) => o.raise?.minutes ?? (o.limit ? o.limit / 60 : null);

/** The time limit set again, lower, higher or none, with the rows it stops and the rows it sends on counted. */
function StudyLimitModal({
	summary,
	detail,
	onClose,
	onError,
}: {
	summary: StudySummary;
	detail: StudyDetail;
	onClose: () => void;
	onError: (e: string) => void;
}) {
	const now = limitOf(summary.options);
	// in seconds when it is not whole minutes
	const inSeconds = now !== null && !Number.isInteger(now);
	const [limited, setLimited] = useState(now !== null);
	const [unit, setUnit] = useState<"minutes" | "seconds">(inSeconds ? "seconds" : "minutes");
	const [value, setValue] = useState(now === null ? 5 : inSeconds ? Math.round(now * 60) : now);
	const m = limited ? (unit === "minutes" ? value : value / 60) : null;
	const past = (r: StudyRow) => m !== null && r.elapsed >= m * 60;
	const stop = detail.rows.filter((r) => r.state === "running" && past(r)).length;
	// a row a disk ceiling stopped stays stopped: this is the time limit only
	const go = detail.rows.filter((r) => r.state === "limit" && !past(r) && !r.reason?.includes("wrote over")).length;
	const apply = async () => {
		const res = await api().studyLimit(summary.id, m);
		if (res.error) onError(res.error);
		onClose();
	};
	const rows = (x: number) => `${n(x)} row${x === 1 ? "" : "s"}`;
	const effect = [
		stop &&
			`${rows(stop)} searching now ${stop === 1 ? "is" : "are"} past it and stop${stop === 1 ? "s" : ""} there, keeping what ${stop === 1 ? "it" : "they"} found.`,
		go && `${rows(go)} a limit stopped go${go === 1 ? "es" : ""} on from where ${go === 1 ? "it" : "they"} stopped.`,
	].filter(Boolean);
	return (
		<Modal
			open
			onOpenChange={(o) => !o && onClose()}
			title="Time limit"
			size="sm"
			description="How long each search may run before it stops, keeping what it finished"
			footer={
				<ModalFooter
					onClose={onClose}
					icon={Timer}
					label={go ? `Set it · ${rows(go)} go${go === 1 ? "es" : ""} on` : "Set the limit"}
					onClick={() => void apply()}
				/>
			}
		>
			<div className="space-y-4 p-5 text-body text-fg-secondary">
				<label className="flex items-center gap-2">
					<CheckboxBox checked={limited} onCheckedChange={setLimited} />
					<span className={cn(!limited && "text-fg-muted")}>A search stops after</span>
					<Input
						type="number"
						min={1}
						value={value}
						disabled={!limited}
						onChange={(e) => setValue(Math.max(1, Number(e.target.value) || 1))}
						className="w-20"
						aria-label="Time a search"
					/>
					<Dropdown<"minutes" | "seconds">
						value={unit}
						options={[
							{ value: "minutes", label: "minutes" },
							{ value: "seconds", label: "seconds" },
						]}
						onChange={setUnit}
						disabled={!limited}
						aria-label="Minutes or seconds"
					/>
				</label>
				<p className="border-t border-line-subtle pt-4">
					{effect.join(" ") || "No row changes now: the rows still to search run under it."}
				</p>
			</div>
		</Modal>
	);
}

/** A study's dialog footer: Cancel, and the change it makes. */
function ModalFooter({ onClose, ...go }: { onClose: () => void } & React.ComponentProps<typeof Button>) {
	return (
		<div className="flex justify-end gap-2">
			<Button label="Cancel" onClick={onClose} />
			<Button variant="primary" {...go} />
		</div>
	);
}

/** Rows at once, threads per row and priority, set again while the study goes or waits (studies.ts setResources). */
function StudyResourcesModal({
	summary,
	cores,
	onClose,
	onError,
}: {
	summary: StudySummary;
	cores: number;
	onClose: () => void;
	onError: (e: string) => void;
}) {
	const o = summary.options;
	const [parallel, setParallel] = useState(o.parallel);
	const [threads, setThreads] = useState(o.threads);
	const [nice, setNice] = useState(o.nice);
	const [restart, setRestart] = useState(false);
	const going = summary.tally.running ?? 0;
	const restarts = restart && going > 0 && threads !== o.threads;
	const apply = async () => {
		const res = await api().studyResources(summary.id, { parallel, threads, nice }, restarts);
		if (res.error) onError(res.error);
		onClose();
	};
	return (
		<Modal
			open
			onOpenChange={(x) => !x && onClose()}
			title="Threads and priority"
			size="sm"
			description="What the study's searches run with, from the next each row starts"
			footer={<ModalFooter onClose={onClose} icon={Cpu} label="Set" onClick={() => void apply()} />}
		>
			<div className="space-y-4 p-5">
				<Field label={`Rows at once · ${parallel}`} hint="Rows searched side by side. The app's limit on searches at once, in Settings, still holds.">
					<RangeInput min={1} max={Math.max(1, cores)} value={parallel} onChange={setParallel} aria-label="Rows at once" />
				</Field>
				<Field label={`Threads per row · ${threads}`} hint={threadsHint(cores)}>
					<ThreadsInput value={threads} cores={cores} onChange={setThreads} />
				</Field>
				<Field label="Priority" hint={PRIORITY_HINT}>
					<PriorityInput value={nice} onChange={setNice} />
				</Field>
				<p className="border-t border-line-subtle pt-4 text-body text-fg-secondary">
					Up to {n(parallel * threads)} threads in all, on {cores} cores.
					{going && nice < o.nice && !restarts
						? ` The ${n(going)} searching now keep their priority until they start again: the system lets a priority go down, not up.`
						: ""}
				</p>
				{going && threads !== o.threads ? (
					<label className="flex items-center gap-2 text-body text-fg-secondary">
						<CheckboxBox checked={restart} onCheckedChange={setRestart} />
						Restart the {n(going)} searching now with {threads} thread{threads === 1 ? "" : "s"}: each resumes from its
						finished roots
					</label>
				) : null}
			</div>
		</Modal>
	);
}

/** More optional faces per row: a higher most, with the rows it adds counted before they are (studies.ts edit). */
function StudyRowsModal({
	summary,
	template,
	onClose,
	onError,
}: {
	summary: StudySummary;
	template: string;
	onClose: () => void;
	onError: (e: string) => void;
}) {
	const [lo, was] = summary.sizes;
	const most = summary.optional.length;
	const [hi, setHi] = useState(Math.min(most, was + 1));
	const total = useMemo(() => planStudy(withSubsets(template, [lo, hi]), false).rows, [template, lo, hi]);
	const added = total - summary.rowCount;
	const apply = async () => {
		const res = await api().studyEdit(summary.id, withSubsets(template, [lo, hi]), true);
		if ("error" in res) onError(res.error);
		onClose();
	};
	return (
		<Modal
			open
			onOpenChange={(x) => !x && onClose()}
			title="More faces per row"
			size="sm"
			description={`Rows hold ${lo} to ${was} of the ${most} optional faces now`}
			footer={
				<ModalFooter
					onClose={onClose}
					icon={Plus}
					label={`Add ${n(added)} row${added === 1 ? "" : "s"}`}
					disabled={total > MAX_ROWS || added <= 0}
					onClick={() => void apply()}
				/>
			}
		>
			<div className="space-y-4 p-5">
				<Field label={`At most · ${hi} faces`}>
					<RangeInput min={was + 1} max={most} value={hi} onChange={setHi} aria-label="Most optional faces per row" />
				</Field>
				<p className="border-t border-line-subtle pt-4 text-body text-fg-secondary">
					{total > MAX_ROWS
						? `That makes ${n(total)} rows, and a study runs at most ${n(MAX_ROWS)}.`
						: `Adds ${n(added)} row${added === 1 ? "" : "s"} of ${hi > was + 1 ? `${was + 1} to ${hi}` : hi} faces, ${n(total)} in all. They are checked and searched as the others were; the rows done so far keep what they found.${summary.state === "paused" ? " Resume starts them." : ""}`}
				</p>
			</div>
		</Modal>
	);
}

/**
 * Each optional face with what the rows holding it found, and the faces edits took out, with what theirs had found
 * then. Remove previews the study without the face (StudyEditModal); a face whose rows are all searched or ruled out
 * without a tiling is the one to look at, so its Remove stands out. None on a board with parameters (`onRemove`
 * null): its lines are edited as text, in Edit board.
 */
function FacesTable({
	detail,
	optional,
	onRemove,
}: {
	detail: StudyDetail | null;
	optional: string[];
	onRemove: ((face: string) => void) | null;
}) {
	if (!detail) return <p className="px-4 py-6 text-body text-fg-muted">Reading the rows…</p>;
	const num = "py-2 pr-3 text-right font-mono text-small tabular-nums";
	const line = "border-b border-line-subtle/60 align-middle last:border-b-0";
	const counts = (t: FaceTally) =>
		[t.rows, t.found, t.tilings].map((x, i) => (
			<td key={i} className={num}>
				{n(x)}
			</td>
		));
	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			<table className="w-full table-fixed text-body">
				<thead className="sticky top-0 z-10 bg-surface-raised">
					<tr className="border-b border-line-subtle text-left">
						<th className="ta-label py-2 pl-4 font-normal">Face</th>
						<th className="ta-label w-24 py-2 pr-3 text-right font-normal">Rows</th>
						<th className="ta-label w-32 py-2 pr-3 text-right font-normal">With tilings</th>
						<th className="ta-label w-28 py-2 pr-3 text-right font-normal">Tilings</th>
						<th className="ta-label w-[20rem] py-2 pl-3 font-normal">Found</th>
						<th className="w-32 py-2 pr-3" aria-label="Remove" />
					</tr>
				</thead>
				<tbody>
					{optional.map((face) => {
						const t = faceTally(detail.rows, face);
						const empty = !t.found && !t.left;
						return (
							<tr key={face} className={cn(line, "text-fg-secondary")}>
								<td className="py-2 pl-4">
									<Badge mono>{face}</Badge>
								</td>
								{counts(t)}
								<td className={cn("py-2 pl-3 text-small", empty && "text-fg")}>{verdict(t)}</td>
								<td className="py-1 pr-3 text-right">
									{onRemove ? (
										<Button size="sm" variant={empty ? "secondary" : "ghost"} label="Remove…" onClick={() => onRemove(face)} />
									) : null}
								</td>
							</tr>
						);
					})}
					{detail.removed.map((t) => (
						<tr key={`${t.face} ${t.at}`} className={cn(line, "text-fg-muted")}>
							<td className="py-2 pl-4">
								<Badge mono>{t.face}</Badge>
							</td>
							{counts(t)}
							<td className="py-2 pl-3 text-small">
								removed {when(Date.parse(t.at))}: {verdict(t)}
							</td>
							<td />
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

/**
 * An edited study board, applied once its effect is seen (studies.ts edit): the rows that keep their searches, those
 * searched again, added and dropped, and the faces it takes out, recorded in the census. Tilings a drop or a new
 * search would take from the study need a yes first.
 */
export function StudyEditModal({
	id,
	name,
	text,
	onClose,
	onDone,
}: {
	id: string;
	name: string;
	text: string;
	onClose: () => void;
	onDone: () => void;
}) {
	const [edit, setEdit] = useState<StudyEdit | { error: string } | null>(null);
	const [sure, setSure] = useState(false);
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		let live = true;
		void api()
			.studyEdit(id, text, false)
			.then((e) => live && setEdit(e));
		return () => void (live = false);
	}, [id, text]);
	const ok = edit && !("error" in edit) ? edit : null;
	const lost = ok?.lost ?? [];
	const apply = async () => {
		setBusy(true);
		const res = await api().studyEdit(id, text, true);
		setBusy(false);
		if ("error" in res) setEdit(res);
		else onDone();
	};
	const rows = (x: number) => `${n(x)} row${x === 1 ? "" : "s"}`;
	return (
		<Modal
			open
			onOpenChange={(o) => !o && onClose()}
			title={`Apply to ${name}`}
			size="md"
			description="The study goes on with the edited board; a row whose board is the same keeps what it found"
			footer={
				<ModalFooter
					onClose={onClose}
					icon={Check}
					label={busy ? "Applying…" : "Apply"}
					disabled={!ok || busy || (lost.length > 0 && !sure)}
					onClick={() => void apply()}
				/>
			}
		>
			<div className="space-y-4 p-5 text-body text-fg-secondary">
				{!edit ? (
					<p className="flex items-center gap-2 text-fg-muted">
						<Spinner /> Comparing each row&apos;s board…
					</p>
				) : !ok ? (
					<p className="text-danger">{"error" in edit ? edit.error : ""}</p>
				) : (
					<>
						<ul className="space-y-1">
							<li>{rows(ok.kept)} keep their checks and searches.</li>
							{ok.changed ? <li>{rows(ok.changed)} have a different board now, and are checked and searched again.</li> : null}
							{ok.added ? <li>{rows(ok.added)} join, and are checked and searched.</li> : null}
							{ok.dropped ? (
								<li>{rows(ok.dropped)} leave the study: their searches stop, and their folders stay on disk.</li>
							) : null}
						</ul>
						{ok.removed.map((f) => (
							<p key={f.face}>
								Takes out <Badge mono>{f.face}</Badge>: {rows(f.rows)}, {verdict(f)}. The census records it, with this count.
							</p>
						))}
						{lost.length ? (
							<div className="space-y-2 border-t border-line-subtle pt-4">
								<p className="text-danger">
									{rows(lost.length)} with {n(lost.reduce((t, r) => t + r.tilings, 0))} tilings would leave the study or
									be searched again:
								</p>
								<p className="font-mono text-small">
									{lost
										.slice(0, 12)
										.map((r) => `${r.name} (${n(r.tilings)})`)
										.join(", ")}
									{lost.length > 12 ? `, and ${n(lost.length - 12)} more` : ""}
								</p>
								<label className="flex items-center gap-2">
									<CheckboxBox checked={sure} onCheckedChange={setSure} />
									Apply anyway
								</label>
							</div>
						) : null}
					</>
				)}
			</div>
		</Modal>
	);
}

/** Over the rows: what they are filtered by, the search, and their order. */
function RowFilters({
	s,
	filters,
	onFilter,
	query,
	onQuery,
	sort,
	desc,
	onSort,
	onFlip,
	shown,
	of,
	active,
	onClear,
}: {
	s: StudySummary;
	filters: Filters;
	onFilter: (f: Partial<Filters>) => void;
	query: string;
	onQuery: (q: string) => void;
	sort: Sort;
	desc: boolean;
	onSort: (s: Sort) => void;
	onFlip: () => void;
	shown: number;
	of: number;
	active: boolean;
	onClear: () => void;
}) {
	const faces = s.optional.map((f) => ({ value: f, label: f }));
	const sizes = Array.from({ length: s.sizes[1] - s.sizes[0] + 1 }, (_, i) => s.sizes[0] + i);
	const ks = Array.from({ length: Math.max(1, s.kmax - s.kmin + 1) }, (_, i) => s.kmin + i);
	const cls = "h-8 text-ui";
	return (
		<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-3">
			<Dropdown
				label="Outcome"
				aria-label="Rows by outcome"
				className={cls}
				value={filters.outcome}
				options={[{ value: "all", label: "Any" }, ...OUTCOMES.map((o) => ({ value: o.key, label: o.label }))]}
				onChange={(outcome) => onFilter({ outcome })}
			/>
			{s.optional.length && sizes.length > 1 ? (
				<Dropdown
					label="Faces"
					aria-label="Rows by how many optional faces they hold"
					className={cls}
					value={filters.size}
					options={[
						{ value: "any", label: "Any number" },
						...sizes.map((x) => ({ value: String(x), label: String(x) })),
					]}
					onChange={(size) => onFilter({ size })}
				/>
			) : null}
			{s.optional.length ? (
				<>
					<Dropdown
						label="Holds"
						aria-label="Rows holding a face"
						className={cls}
						value={filters.holds}
						options={[{ value: "any", label: "Any" }, ...faces]}
						onChange={(holds) => onFilter({ holds })}
					/>
					<Dropdown
						label="Lacks"
						aria-label="Rows without a face"
						className={cls}
						value={filters.lacks}
						options={[{ value: "any", label: "Nothing" }, ...faces]}
						onChange={(lacks) => onFilter({ lacks })}
					/>
				</>
			) : null}
			{s.params.map((p) => (
				<Dropdown
					key={p.name}
					label={p.name}
					aria-label={`Rows by ${p.name}`}
					className={cls}
					value={filters.values[p.name] ?? "any"}
					options={[{ value: "any", label: "Any" }, ...p.values.map((v) => ({ value: String(v), label: String(v) }))]}
					onChange={(v) => onFilter({ values: { ...filters.values, [p.name]: v } })}
				/>
			))}
			{s.options.mode === "enumerate" ? (
				<Dropdown
					label="First k"
					aria-label="Rows by the k of their first tiling"
					className={cls}
					value={filters.first === null ? "any" : String(filters.first)}
					options={[{ value: "any", label: "Any" }, ...ks.map((k) => ({ value: String(k), label: String(k) }))]}
					onChange={(v) => onFilter({ first: v === "any" ? null : Number(v) })}
				/>
			) : null}
			{active ? <Button size="sm" variant="ghost" icon={X} label="Clear" onClick={onClear} /> : null}
			{/* the count, the search and the order wrap together, to the right */}
			<span className="ml-auto flex items-center gap-2">
				<span className="font-mono text-small text-fg-muted tabular-nums">
					{shown === of ? `${n(of)} rows` : `${n(shown)} of ${n(of)} rows`}
				</span>
				<span className="w-40">
					<SearchInput value={query} onChange={onQuery} placeholder="Face or value" label={null} raw />
				</span>
				<Dropdown
					label="Sort"
					aria-label="Order the rows"
					className={cls}
					value={sort}
					options={(Object.keys(SORTS) as Sort[]).map((k) => ({ value: k, label: SORTS[k].label }))}
					onChange={onSort}
				/>
				<Tooltip
					label={desc ? "Highest first: click for lowest first" : "Lowest first: click for highest first"}
				
				>
					<Button
						size="icon"
						icon={desc ? ArrowDownZA : ArrowDownAZ}
						aria-label={desc ? "Highest first" : "Lowest first"}
						aria-pressed={desc}
						onClick={onFlip}
					/>
				</Tooltip>
			</span>
		</div>
	);
}

/**
 * A row's tilings per k as small columns (log height), its counts on hover: how a combination grows with k. The
 * columns run over the study's k, which reaches as far as any row was raised, so they line up down the table; past
 * the k a row's own run reached there is no column, as nothing was searched there.
 */
function PerK({ r, ks }: { r: StudyRow; ks: [number, number] }) {
	if (!r.total) return null;
	const reached = Math.max(r.through ?? 0, ...Object.keys(r.counts).map(Number));
	const all = Array.from({ length: Math.max(ks[1], reached) - ks[0] + 1 }, (_, i) => ks[0] + i);
	const top = Math.log10(1 + Math.max(1, ...all.map((k) => r.counts[k] ?? 0)));
	// as wide as the column allows: 6 px a k up to 15 of them, narrower past that
	const w = Math.max(2, Math.min(6, Math.floor(108 / all.length) - 1));
	const searched = all.filter((k) => k <= reached);
	return (
		<Tooltip label={searched.map((k) => `k ${k}: ${n(r.counts[k] ?? 0)}`).join(" · ")} delay="instant">
			<span className="flex h-4 items-end gap-px" aria-label="Tilings per k">
				{all.map((k) => {
					const c = r.counts[k] ?? 0;
					return (
						<span
							key={k}
							className={cn("shrink-0 rounded-mark", k > reached ? "" : c ? "bg-fg/45" : "bg-fg/10")}
							style={{
								width: w,
								height: k > reached ? 0 : c ? `${Math.max(3, (Math.log10(1 + c) / top) * 16)}px` : "2px",
							}}
						/>
					);
				})}
			</span>
		</Tooltip>
	);
}

/** The rows of one page: what each combination came to. A row with a search opens its run. */
function RowsTable({
	rows,
	loading,
	onOpen,
	onRaise,
	busy,
	ks,
}: {
	rows: StudyRow[];
	loading: boolean;
	onOpen: (id: string) => void;
	/** Raise k of a row's run (the Raise k dialog, its rule to raise k by itself included). */
	onRaise: (run: string) => void;
	/** Whether a run is searching now, when it cannot be raised. */
	busy: (run: string) => boolean;
	/** The study's k range, for the per-k column of a study that counts (none for one that proves existence). */
	ks: [number, number] | null;
}) {
	if (loading) return <p className="px-4 py-6 text-body text-fg-muted">Reading the rows…</p>;
	if (!rows.length) return <p className="px-4 py-6 text-body text-fg-muted">No row matches.</p>;
	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			<table className="w-full table-fixed text-body">
				<thead className="sticky top-0 z-10 bg-surface-raised">
					<tr className="border-b border-line-subtle text-left">
						<th className="ta-label w-14 py-2 pl-4 font-normal">Row</th>
						<th className="ta-label py-2 font-normal">Holds</th>
						<th className="ta-label w-[17rem] py-2 font-normal">Outcome</th>
						{ks ? <th className="ta-label w-32 py-2 font-normal">Per k</th> : null}
						<th className="ta-label w-24 py-2 pr-3 text-right font-normal">Tilings</th>
						<th className="ta-label w-24 py-2 pr-3 text-right font-normal">Time</th>
						<th className="w-12 py-2 pr-3" aria-label="Raise k" />
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => {
						const o = outcome(r);
						const open = r.run ? () => onOpen(r.run!) : undefined;
						return (
							<tr
								key={r.index}
								onClick={open}
								className={cn(
									"border-b border-line-subtle/60 align-middle transition-colors last:border-b-0",
									open ? "cursor-pointer hover:bg-surface-overlay" : "",
								)}
							>
								<td className="py-2 pl-4 font-mono text-small text-fg-muted tabular-nums">{r.index + 1}</td>
								<td className="py-2 pr-3">
									<RowChips r={r} />
								</td>
								<td className="py-2 pr-3">
									<span className={cn("flex min-w-0 items-center gap-1.5 text-small", o.tone)}>
										{o.icon}
										<span className="truncate" title={r.reason}>
											{o.text}
										</span>
										{r.reason && r.state !== "found" ? (
											<InfoDot side="left" label="Why">
												{r.reason}
											</InfoDot>
										) : null}
										{r.adopted ? (
											<Tooltip label="An earlier run did this row's search: the study uses its result">
												<Link2 className="size-icon-sm shrink-0 text-fg-muted" aria-label="From an earlier run" />
											</Tooltip>
										) : null}
									</span>
								</td>
								{ks ? (
									<td className="py-2 pr-3">
										<PerK r={r} ks={ks} />
									</td>
								) : null}
								<td className="py-2 pr-3 text-right font-mono text-small text-fg-secondary tabular-nums">
									{r.total || r.state === "found" ? n(r.total) : ""}
								</td>
								<td className="py-2 pr-3 text-right font-mono text-small text-fg-muted tabular-nums">
									{r.elapsed ? duration(r.elapsed) : ""}
								</td>
								<td className="py-1 pr-3 text-right">
									{r.run && !busy(r.run) ? (
										<Tooltip label="Raise k: search this row again to a higher k">
											<Button
												size="icon"
												variant="ghost"
												icon={ChevronsUp}
												aria-label={`Raise k of row ${r.index + 1}`}
												onClick={(e: React.MouseEvent) => (e.stopPropagation(), onRaise(r.run!))}
											/>
										</Tooltip>
									) : null}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

/**
 * The band: how many rows and what they came to (a bar by outcome, each part a filter), where the first
 * tilings appear (rows by the k of their first tiling), and the study's facts.
 */
function StudyOverview({
	s,
	detail,
	onFilter,
	first,
	onFirst,
	whole,
	k,
	onK,
}: {
	s: StudySummary;
	detail: StudyDetail | null;
	/** Filter the rows by an outcome (OUTCOMES' key). */
	onFilter: (outcome: string) => void;
	/** The k the rows are filtered to by their first tiling, and a bar clicked. */
	first: number | null;
	onFirst: (k: number) => void;
	/** The whole board, when it is shown: its tilings per k in place of the rows' tally, the k its previews show. */
	whole: Whole | null;
	k: number | null;
	onK: (k: number | "all") => void;
}) {
	const parts = OUTCOMES.map((o) => ({ ...o, count: tallyOf(s, o.states) })).filter((o) => o.count > 0);
	const what = [
		s.optional.length ? combinations(s.optional.length, s.sizes, s.required) : "",
		...s.params.map((p) => `${p.name} = ${rangeText(p.values)}`),
	].filter(Boolean);
	const o = s.options;
	// the edge, or a family's edges, and the minimal polynomial of cosh of each (`# minpoly` header lines)
	const polys = useMemo(() => (detail ? minpolys(parse(detail.template).board.header) : []), [detail?.template]);
	const degrees = polys.map((p) => polyDegree(p.poly));
	const facts: Fact[] = [
		...(polys.length
			? [
					{
						label: polys.length === 1 ? "Edge" : "Edges",
						value: polys.length === 1 ? String(+polys[0].edge.toFixed(7)) : String(polys.length),
						sub:
							polys.length === 1 && polyText(polys[0].poly).length <= 40
								? `cosh: ${polyText(polys[0].poly)}`
								: `cosh: degree ${Math.min(...degrees)}${Math.max(...degrees) > Math.min(...degrees) ? `–${Math.max(...degrees)}` : ""}`,
						title: polys.map((p) => `cosh ${+p.edge.toFixed(7)} is a root of ${polyText(p.poly)}`).join("\n"),
					},
				]
			: []),
		{ label: "Search", value: o.mode === "find" ? "Existence" : "Enumerate", sub: `k ${s.kmin}–${s.kmax}` },
		{ label: "Rows at once", value: String(o.parallel), sub: `${o.threads} thread${o.threads === 1 ? "" : "s"} each` },
		{
			label: "Time limit",
			value: limitOf(o) === null ? "none" : minutesText(limitOf(o)!),
			sub: o.mode === "find" ? `${o.seconds} s per k` : limitOf(o) === null ? undefined : "a search",
		},
		...(o.raise
			? [
					{
						label: "Raise k",
						value: `up to ${o.raise.upTo}`,
						sub: [briefRaise(o.raise), s.raising ? `${n(s.raising)} raising` : ""].filter(Boolean).join(", "),
						title: `Each row raises its k by itself ${describeRaise(o.raise)}.`,
					},
				]
			: []),
		{
			label: "Search time",
			value: s.elapsed ? duration(s.elapsed) : "none yet",
			sub: s.elapsed ? "all rows" : undefined,
		},
		{ label: "Started", value: when(s.created) },
	];
	if (s.ended) facts.push({ label: "Finished", value: when(s.ended) });
	return (
		<section className="ta-card grid shrink-0 grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(240px,300px)] overflow-hidden shadow-raised max-xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
			{whole ? (
				<WholeTotals s={s} whole={whole} />
			) : (
				<div className="flex flex-col justify-between gap-3 border-r border-line-subtle p-4">
					<Field
						label="Rows"
						hint="Each row is the board with some of its optional faces and without the others, at one value of each parameter. A row requires each optional face it holds, so it finds exactly the tilings that use those faces and no other optional one. Before any search, each row is checked: a row is ruled out only when no tiling can exist at any k (a corner of a required face fits no vertex, the engine’s balance count, or faces that can never touch)."
						hintSide="bottom"
						hintLabel="What a row is"
					>
						<AnimatedNumber
							value={s.rowCount}
							className="block text-display leading-none font-semibold tracking-tight text-fg"
						/>
						<div className="text-body leading-tight text-fg-secondary">{what.join("; ") || "one board"}</div>
					</Field>
					<div className="space-y-2">
						<div className="flex h-2 overflow-hidden rounded-full bg-surface-sunken">
							{parts.map((p) => (
								<span
									key={p.key}
									className={cn("h-full transition-[width] motion-settle", p.bar)}
									style={{ width: `${(p.count / s.rowCount) * 100}%` }}
								/>
							))}
						</div>
						<ul className="grid grid-cols-2 gap-x-3 gap-y-1">
							{parts.map((p) => (
								<li key={p.key}>
									<button
										type="button"
										onClick={() => onFilter(p.key)}
										className="flex w-full cursor-pointer items-center gap-1.5 text-left text-small text-fg-secondary hover:text-fg"
									>
										<span
											className={cn(
												"h-2 w-2 shrink-0 rounded-mark",
												p.bar,
												p.key === "left" && "ring-1 ring-line ring-inset",
											)}
										/>
										<span className="min-w-0 flex-1 truncate">{p.label}</span>
										<span className="font-mono text-fg tabular-nums">{n(p.count)}</span>
									</button>
								</li>
							))}
						</ul>
					</div>
				</div>
			)}
			{whole ? (
				<KChart
					run={whole.run}
					ks={Array.from(
						{ length: Math.max(whole.run.kmax, Number.isFinite(whole.complete) ? whole.complete : 0) - s.kmin + 1 },
						(_, i) => s.kmin + i,
					)}
					selected={k}
					onPick={onK}
					complete={Number.isFinite(whole.complete) ? whole.complete : undefined}
				/>
			) : (
				<FirstK s={s} detail={detail} pick={first} onPick={onFirst} />
			)}
			<Facts facts={facts} />
		</section>
	);
}

/** The whole board's count, in the rows' place on the band: final up to the k every row finished, and what ends there. */
function WholeTotals({ s, whole }: { s: StudySummary; whole: Whole }) {
	const { run, complete } = whole;
	const done = Object.entries(run.counts).reduce((t, [k, c]) => (+k <= complete ? t + c : t), 0);
	const more = run.total - done;
	const what = !Number.isFinite(complete)
		? "none at any k: every row is ruled out"
		: complete < s.kmin
			? "no k complete yet: so far"
			: `complete for k = ${s.kmin}${complete > s.kmin ? ` to ${complete}` : ""}${more ? `, and ${n(more)} so far above` : ""}`;
	return (
		<div className="flex flex-col justify-between gap-3 border-r border-line-subtle p-4">
			<Field
				label="Tilings"
				hint="Every row together: the board with each optional face an ordinary one. A row requires exactly its optional faces, so each tiling is in one row, and the rows’ tilings at each k add up to the whole board’s. The count is final up to the lowest k every row has searched to the end; Raise k takes the rows further."
				hintSide="bottom"
				hintLabel="What the whole board is"
			>
				<AnimatedNumber
					value={complete < s.kmin ? run.total : done}
					className="block text-display leading-none font-semibold tracking-tight text-fg"
				/>
				<div className="text-body leading-tight text-fg-secondary">{what}</div>
			</Field>
			{whole.behind.length ? (
				<div className="space-y-1.5">
					<p className="text-small text-fg-muted">
						{complete < s.kmin ? "Rows with no k searched to the end" : `Rows that end at k = ${complete}`}
					</p>
					<ul className="grid grid-cols-2 gap-x-3 gap-y-1">
						{whole.behind.map((b) => (
							<li key={b.label} className="flex items-center gap-1.5 text-small text-fg-secondary">
								<span className="min-w-0 flex-1 truncate">{b.label}</span>
								<span className="font-mono text-fg tabular-nums">{n(b.count)}</span>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}

/** A raise rule's conditions, short: "until 1 tiling, 5 GB a search" (its time limit is a fact of its own). */
function briefRaise(r: RaiseRule): string | undefined {
	const parts = [
		r.found !== undefined && `until ${r.found} tiling${r.found === 1 ? "" : "s"}`,
		r.gigabytes !== undefined && `${r.gigabytes} GB a search`,
	];
	return parts.filter(Boolean).join(", ") || undefined;
}

/** 5 6 7 8 → "5 to 8"; anything else listed. */
const rangeText = (v: number[]) =>
	v.length > 2 && v.every((x, i) => !i || x === v[i - 1] + 1) ? `${v[0]} to ${v[v.length - 1]}` : v.join(", ");

const PLOT = 112;
/** Rows by the k of their first tiling: where a census's combinations first appear. A bar filters the rows to its k. */
function FirstK({
	s,
	detail,
	pick,
	onPick,
}: {
	s: StudySummary;
	detail: StudyDetail | null;
	pick: number | null;
	onPick: (k: number) => void;
}) {
	const ks = Array.from({ length: Math.max(1, s.kmax - s.kmin + 1) }, (_, i) => s.kmin + i);
	const per = new Map<number, number>();
	for (const r of detail?.rows ?? [])
		if (r.state === "found" && r.first !== undefined) per.set(r.first, (per.get(r.first) ?? 0) + 1);
	const cols = ks.map((k) => ({ k, count: per.get(k) ?? 0 }));
	const top = Math.max(1, ...cols.map((c) => c.count));
	const [grown, setGrown] = useState(false);
	useEffect(() => {
		const f = requestAnimationFrame(() => setGrown(true));
		return () => cancelAnimationFrame(f);
	}, []);
	return (
		<div className="flex min-w-0 flex-col justify-between gap-2 p-4">
			<div className="flex items-baseline justify-between gap-3">
				<span className="ta-label">Rows by the k of their first tiling</span>
				<span className="font-mono text-caption text-fg-muted">{n(tallyOf(s, ["found"]))} found</span>
			</div>
			{/* Every column at least 24px wide, a target a pointer can hit (WCAG 2.5.8); too narrow a panel scrolls. */}
			<div className="overflow-x-auto">
			<div style={{ minWidth: `calc(${cols.length} * var(--control-xs))` }}>
			<div className="relative flex border-b border-line" style={{ height: PLOT }}>
				{cols.map((c, i) => {
					const h = c.count ? Math.max(3, (c.count / top) * (PLOT - 20)) : 0;
					return (
						<Tooltip
							key={c.k}
							label={`k = ${c.k}: ${n(c.count)} row${c.count === 1 ? "" : "s"} first found here${c.count ? `. Click to show ${pick === c.k ? "every row" : "only these"}` : ""}`}
							delay="instant"
						>
							{/* ds-check: keep (a chart's bar: the column is the data mark, pressed while it filters the rows) */}
							<button
								type="button"
								disabled={!c.count}
								onClick={() => onPick(c.k)}
								aria-pressed={pick === c.k}
								aria-label={`${n(c.count)} row${c.count === 1 ? "" : "s"} first found at k = ${c.k}`}
								className="group relative h-full min-w-0 flex-1 cursor-pointer outline-none disabled:cursor-default"
							>
								<span
									className={cn(
										"absolute bottom-0 left-1/2 w-[min(24px,62%)] -translate-x-1/2 rounded-t-tag transition-[height,background-color] motion-settle",
										pick === c.k
											? "bg-accent"
											: pick === null
												? "bg-success/70 group-hover:bg-success group-focus-visible:bg-success"
												: "bg-success/30 group-hover:bg-success/50 group-focus-visible:bg-success/50",
									)}
									style={{ height: grown ? h : 0, transitionDelay: `${i * 25}ms` }}
								/>
								{c.count ? (
									<span
										className="absolute left-1/2 -translate-x-1/2 font-mono text-caption text-fg-secondary tabular-nums transition-[bottom] motion-settle"
										style={{ bottom: (grown ? h : 0) + 4, transitionDelay: `${i * 25}ms` }}
									>
										{n(c.count)}
									</span>
								) : null}
							</button>
						</Tooltip>
					);
				})}
			</div>
			<div className="flex h-5">
				{cols.map((c) => (
					<span key={c.k} className="min-w-0 flex-1 text-center font-mono text-caption text-fg-muted tabular-nums">
						{ks.length <= 16 || c.k % 2 === 0 ? c.k : ""}
					</span>
				))}
			</div>
			</div>
			</div>
		</div>
	);
}

// ── on the board page ──

export interface StudySettings {
	parallel: number;
	/** Minutes; 0 for none. */
	limitMinutes: number;
}

/**
 * Setting up a study on the board page: the faces a row may hold, how many at a time, the parameters, and the
 * rows that makes. All of it is board text (`optional` faces, `subsets`, `vary`), so the text stays the truth.
 */
export function StudyFields({
	plan,
	board,
	set,
	text,
	setText,
	vars,
	examples,
	onOpen,
}: {
	plan: StudyPlan;
	board: Board;
	set: (b: Board) => void;
	text: string;
	setText: (t: string) => void;
	/** The values the board is drawn at: a parameter removed keeps its value there. */
	vars: Record<string, number>;
	/** The example boards that are studies. */
	examples: { title: string; text: string }[];
	onOpen: (text: string) => void;
}) {
	const labels = useMemo(() => faceLabels(board), [board]);
	const { params, problems: wrong } = useMemo(() => readParams(text), [text]);
	// a vary line's problems show under Parameters; the rows show the rest (a value where a line breaks)
	const atRows = plan.problems.filter((p) => !wrong.some((q) => q.line === p.line && q.message === p.message));
	const optional = board.faces.flatMap((f, i) => (f.optional ? [i] : []));
	const pick = (ids: string[]) => {
		const on = new Set(ids.map(Number));
		const [lo, hi] = board.subsets ?? [0, 0];
		set({
			...board,
			subsets: board.subsets && on.size ? [Math.min(lo, on.size), Math.min(hi, on.size)] : undefined,
			faces: board.faces.map((f, i) => ({ ...f, optional: on.has(i) || undefined })),
		});
	};
	const varies = optional.length > 0 || params.length > 0;
	const listed = plan.list;
	const ruled = listed ? listed.filter((r) => r.none).length : 0;
	return (
		<>
			{board.faces.length ? (
				<Field
					label="Optional faces"
					hint={
						<>
							A row holds some of the optional faces, requires each one it holds and leaves the others out, so it
								finds the tilings that use exactly those. The faces you leave unpicked are on every row and never
								required: the regular polygons beside a set of stars, say.
						</>
					}
					aside={
						<Button
							variant="ghost"
							size="xs"
							label={optional.length === board.faces.length ? "Clear" : "All"}
							onClick={() => pick(optional.length === board.faces.length ? [] : board.faces.map((_, i) => String(i)))}
						/>
					}
				>
					<OptionWall
						multi
						options={board.faces.map((_, i) => ({ value: String(i), label: labels[i] }))}
						selected={optional.map(String)}
						onChange={(id) => {
							const now = optional.map(String);
							pick(now.includes(id) ? now.filter((x) => x !== id) : [...now, id]);
						}}
					/>
				</Field>
			) : (
				<Field label="Optional faces">
					<p className="text-body text-fg-secondary">Add faces to the board first.</p>
				</Field>
			)}
			{optional.length ? (
				<Field
					label="Optional faces per row"
					hint="The fewest and the most optional faces a row holds. 0 adds the row with none of them: the board's other faces alone."
				>
					<div className="flex items-center gap-2 text-body text-fg-secondary">
						from
						<Input
							type="number"
							min={0}
							max={optional.length}
							value={plan.sizes[0]}
							onChange={(e) => {
								const lo = Math.max(0, Math.min(optional.length, Number(e.target.value) || 0));
								set({ ...board, subsets: [lo, Math.max(lo, plan.sizes[1])] });
							}}
							className="w-20"
							aria-label="Fewest optional faces"
						/>
						to
						<Input
							type="number"
							min={plan.sizes[0]}
							max={optional.length}
							value={plan.sizes[1]}
							onChange={(e) => {
								const hi = Math.max(0, Math.min(optional.length, Number(e.target.value) || 0));
								set({ ...board, subsets: [plan.sizes[0], hi] }); // the other end stays: typing 12 passes through 1
							}}
							className="w-20"
							aria-label="Most optional faces"
						/>
						<span className="text-small text-fg-muted">of {optional.length}</span>
					</div>
				</Field>
			) : null}
			<Field
				label="Parameters"
				hint="A parameter makes a set of rows per value. Give a face n sides in its dialog (or 2n, n+2): it gets the corner A{n}, which is A6 at n = 6 and A7 at n = 7, and vertices take that corner like any other. A corner's angle can be a formula too, such as 180-360/n. The board is drawn at the value picked above it, and each value is worked out exactly."
			>
				{params.length ? (
					<ul className="space-y-1">
						{params.map((p) => {
							const raw = paramText(text, p);
							const range = /^(-?\d+)\.\.(-?\d+)$/.exec(raw);
							const [lo, hi] = range ? [Number(range[1]), Number(range[2])] : [0, 0];
							const to = (a: number, b: number) => setText(withParam(text, p.name, `${a}..${b}`));
							const num = (v: string, or: number) => (Number.isFinite(parseInt(v)) ? parseInt(v) : or);
							return (
								<li key={p.name} className="flex items-center gap-2 text-body text-fg-secondary">
									<span className="w-6 shrink-0 font-mono text-fg">{p.name}</span>
									{range ? (
										<>
											from
											<Input
												type="number"
												value={lo}
												onChange={(e) => {
													const a = num(e.target.value, lo);
													to(a, Math.max(a, hi));
												}}
												className="w-20"
												aria-label={`${p.name} from`}
											/>
											to
											<Input
												type="number"
												value={hi}
												onChange={(e) => {
													const b = num(e.target.value, hi);
													to(lo, b);
												}}
												className="w-20"
												aria-label={`${p.name} to`}
											/>
										</>
									) : (
										<span
											className="min-w-0 flex-1 truncate font-mono text-small"
											title="Edit a list of values in the text"
										>
											{raw}
										</span>
									)}
									<Tooltip label={`Remove ${p.name}: its lines keep the value drawn, ${vars[p.name] ?? p.values[0]}`}>
										<Button
											size="icon"
											variant="ghost"
											icon={X}
											aria-label={`Remove parameter ${p.name}`}
											onClick={() =>
												setText(
													withParam(substitute(text, { [p.name]: vars[p.name] ?? p.values[0] }).text, p.name, null),
												)
											}
										/>
									</Tooltip>
								</li>
							);
						})}
					</ul>
				) : null}
				{wrong.length ? <Problems list={wrong} /> : null}
				<Button
					size="sm"
					icon={Plus}
					label="Add a parameter"
					onClick={() => setText(withParam(text, freeParam(params), "6..10"))}
				/>
			</Field>
			<Field
				label="Rows"
				hint="One search per row, side by side on the study's page, each with what it found and from which k. A combination with no face of a required set (Require any) is no row. Before any search, a row that can have no tiling at any k is ruled out, with the reason."
			>
				{varies ? (
					<>
						<p className="text-body text-fg">
							<span className="font-semibold tabular-nums">{n(plan.rows)}</span> row{plan.rows === 1 ? "" : "s"}
							<span className="text-fg-secondary">{describe(plan)}</span>
						</p>
						{atRows.length ? <Problems list={atRows} /> : null}
						{plan.rows > MAX_ROWS ? (
							<p className="text-small text-danger">
								A study runs at most {n(MAX_ROWS)} rows. Narrow the faces per row or the parameters&rsquo; values.
							</p>
						) : listed && listed.length ? (
							<p className="text-small leading-tight text-fg-muted">
								{ruled
									? `${n(ruled)} ruled out before any search: a corner of a face they require fits no vertex. The engine checks the other ${n(listed.length - ruled)}`
									: "The engine checks each row"}{" "}
								as the study starts, and searches those it cannot rule out.
							</p>
						) : null}
					</>
				) : (
					<>
						<p className="text-body text-fg-secondary">
							Pick the optional faces, or add a parameter: each combination becomes a row.
						</p>
						{examples.length ? (
							<>
								<p className="text-small text-fg-muted">Or start from an example:</p>
								<div className="flex flex-wrap gap-2">
									{examples.map((x) => (
										<Button
											key={x.title}
											size="sm"
											icon={BookOpen}
											label={x.title.split(":")[0]}
											onClick={() => onOpen(x.text)}
										/>
									))}
								</div>
							</>
						) : null}
					</>
				)}
			</Field>
		</>
	);
}

/** The value of each parameter the board page draws the board at; the board itself keeps its {n}. */
export function DrawnAt({
	params,
	vars,
	onPick,
}: {
	params: Param[];
	vars: Record<string, number>;
	onPick: (name: string, value: number) => void;
}) {
	return (
		<div className="ta-card flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-body text-fg-secondary shadow-raised">
			<span className="flex items-center gap-1.5">
				<Rows3 className="size-icon-md shrink-0 text-fg-accent" />
				Drawn at
				<InfoDot>
					A board with parameters is one board per value. Faces and corners written with a parameter (n sides, A{"{n}"})
					are drawn here at the value you pick, the checks read the board there, and the study runs every value. Edits
					apply to all of them.
				</InfoDot>
			</span>
			{params.map((p) => (
				<span key={p.name} className="flex items-center gap-2">
					<span className="font-mono text-fg">{p.name} =</span>
					{p.values.length <= 12 ? (
						<div style={{ width: p.values.length * 44 }}>
							<OptionWall
								columns={p.values.length}
								fill={false}
								options={p.values.map((v) => ({ value: v, label: String(v) }))}
								selected={vars[p.name]}
								onChange={(v) => onPick(p.name, v)}
							/>
						</div>
					) : (
						<Input
							type="number"
							min={p.values[0]}
							max={p.values[p.values.length - 1]}
							value={vars[p.name]}
							onChange={(e) => {
								const x = Number(e.target.value);
								onPick(
									p.name,
									p.values.reduce((a, v) => (Math.abs(v - x) < Math.abs(a - x) ? v : a)),
								);
							}}
							className="w-24"
							aria-label={`Draw at ${p.name}`}
						/>
					)}
				</span>
			))}
		</div>
	);
}

/** How a study's rows run: side by side, and for how long each. */
export function StudyRunFields({
	settings,
	onSettings,
	cores,
	threads,
}: {
	settings: StudySettings;
	onSettings: (s: StudySettings) => void;
	cores: number;
	threads: number;
}) {
	return (
		<>
			<Field
				label={`Rows at once · ${settings.parallel}`}
				hint={`Rows searched side by side. Each gets ${Math.max(1, Math.floor(threads / settings.parallel))} of the ${threads} threads; many small rows go faster side by side than one at a time with every thread. The app's limit on searches at once, in Settings, still holds.`}
			>
				<RangeInput
					min={1}
					max={Math.max(1, cores)}
					value={settings.parallel}
					onChange={(parallel) => onSettings({ ...settings, parallel })}
					aria-label="Rows at once"
				/>
			</Field>
			<Field
				label="Time limit per row"
				hint="A row that searches longer stops there, keeping what it finished, and the study moves on. The study's page changes the limit, higher, lower or none, while it runs; rows under the new one go on."
			>
				<div className="flex items-center gap-2 text-body text-fg-secondary">
					<Input
						type="number"
						min={0}
						value={settings.limitMinutes}
						onChange={(e) => onSettings({ ...settings, limitMinutes: Math.max(0, Number(e.target.value) || 0) })}
						className="w-20"
						aria-label="Minutes per row"
					/>
					{settings.limitMinutes ? "minutes" : "minutes: none"}
				</div>
			</Field>
		</>
	);
}

/** "every combination of 15 optional faces, 1 to 3 at a time, each with a face of every required set": the size
 *  only when it narrows the combinations (from 1 to all of them it does not). */
const combinations = (optional: number, [lo, hi]: [number, number], required: number) =>
	`every combination of ${optional} optional face${optional === 1 ? "" : "s"}${
		lo === hi ? `, ${lo} at a time` : lo !== 1 || hi < optional ? `, ${lo} to ${hi} at a time` : ""
	}${required ? `, each with a face of ${required === 1 ? "the" : "every"} required set` : ""}`;

/** ": every combination of 4 optional faces, 1 to 2 at a time, for n = 6 to 10". */
function describe(p: StudyPlan): string {
	const parts: string[] = [];
	if (p.optional.length) parts.push(combinations(p.optional.length, p.sizes, p.required));
	if (p.params.length) parts.push(`for ${p.params.map((x) => `${x.name} = ${rangeText(x.values)}`).join(" and ")}`);
	return parts.length ? `: ${parts.join(", ")}` : "";
}
