// A study's page and its settings on the board page (study.ts says what a study is). The page reads as a run's
// does: the name and state on top, one band with what the rows came to, then the rows themselves, each a
// combination with its outcome; a row with a search opens that run.
import {
	Ban,
	BookOpen,
	Check,
	ChevronsUp,
	Clock,
	Copy,
	FilePen,
	FolderOpen,
	Link2,
	LoaderCircle,
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
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/context-menu";
import { Dropdown } from "@/components/ui/dropdown";
import { InfoDot } from "@/components/ui/info-dot";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MultiSelect } from "@/components/ui/multi-select";
import { OptionWall } from "@/components/ui/option-wall";
import { Pagination } from "@/components/ui/pagination";
import { RangeInput } from "@/components/ui/range-input";
import { SearchInput } from "@/components/ui/search-input";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import { MAX_K, type Board } from "./board";
import {
	describeRaise,
	raiseCeiling,
	raiseStop,
	type RaiseRule,
	type RowState,
	type RunOptions,
	type Status,
	type StudyDetail,
	type StudyRow,
	type StudySummary,
} from "./bridge";
import { Problems } from "./editor";
import { DeleteModal, duration, ImproveModal, RaiseConditions, when } from "./runs";
import { Field } from "./settings";
import { faceLabels, freeParam, MAX_ROWS, paramText, readParams, substitute, withParam, type Param, type StudyPlan } from "./study";

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
	{ key: "searching", label: "Searching", states: ["running", "queued"], bar: "bg-accent" },
	{ key: "left", label: "Left", states: ["waiting", "checking", "stopped", "limit"], bar: "bg-fg/[0.06]" },
	{ key: "failed", label: "Failed", states: ["failed", "conflict"], bar: "bg-danger" },
];
const tallyOf = (s: StudySummary, states: RowState[]) => states.reduce((t, x) => t + (s.tally[x] ?? 0), 0);

/** How a row's outcome reads in the table, with its icon. */
function outcome(r: StudyRow): { icon: React.ReactNode; text: string; tone: string } {
	const cls = "h-3.5 w-3.5 shrink-0";
	switch (r.state) {
		case "found":
			return { icon: <Check className={cn(cls, "text-success")} />, text: `from k = ${r.first}`, tone: "text-fg" };
		case "none":
			return {
				icon: <Minus className={cn(cls, "text-fg-muted")} />,
				text: r.through ? `none up to k = ${r.through}` : "none found",
				tone: "text-fg-secondary",
			};
		case "ruled-out":
			return {
				icon: <Ban className={cn(cls, "text-fg-muted")} />,
				text: r.by === "balance" ? "ruled out by counting" : r.by === "split" ? "faces cannot meet" : "a corner fits nowhere",
				tone: "text-fg-secondary",
			};
		case "same":
			return { icon: <Link2 className={cn(cls, "text-fg-muted")} />, text: "same board as another row", tone: "text-fg-muted" };
		case "running":
			return {
				icon: <LoaderCircle className={cn(cls, "animate-spin text-accent")} />,
				text: r.roots?.all ? `searching · ${n(r.roots.done)} of ${n(r.roots.all)} roots` : "searching",
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
				icon: r.state === "limit" ? <Timer className={cn(cls, "text-fg-muted")} /> : <Pause className={cn(cls, "text-fg-muted")} />,
				// at the study's time limit, or past a ceiling of its raise rule (the reason says which)
				text: `${r.state === "limit" ? (r.reason ? "stopped by its rule" : "time limit") : "stopped"}${r.total ? ` · ${n(r.total)} so far` : ""}${r.roots?.all ? ` · ${n(r.roots.done)} of ${n(r.roots.all)} roots` : ""}`,
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
				<span key={k} className="rounded-sm bg-accent-subtle px-1.5 py-px font-mono text-[11px] text-accent">
					{k} = {v}
				</span>
			))}
			{r.faces.map((f) => (
				<span key={f} className="rounded-sm bg-surface-sunken px-1.5 py-px font-mono text-[11px] text-fg">
					{f}
				</span>
			))}
			{!r.faces.length && !values.length ? <span className="text-xs text-fg-muted">no optional face</span> : null}
		</span>
	);
}

/** The study as Marek writes a census: by size, one line per combination with what is known of it. */
export function censusText(s: StudyDetail): string {
	const out: string[] = [`# ${s.name}: ${n(s.rowCount)} rows, k = ${s.kmin} to ${s.kmax}`];
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

// ── the page ──

const PAGE = 50;
const SORTS = {
	order: { label: "In order", by: (a: StudyRow, b: StudyRow) => a.index - b.index },
	most: { label: "Most faces together", by: (a: StudyRow, b: StudyRow) => b.faces.length - a.faces.length || a.index - b.index },
	fewest: { label: "Fewest faces", by: (a: StudyRow, b: StudyRow) => a.faces.length - b.faces.length || a.index - b.index },
	first: { label: "First k, lowest", by: (a: StudyRow, b: StudyRow) => (a.first ?? 1e9) - (b.first ?? 1e9) || a.index - b.index },
	last: { label: "First k, highest", by: (a: StudyRow, b: StudyRow) => (b.first ?? -1) - (a.first ?? -1) || a.index - b.index },
	tilings: { label: "Most tilings", by: (a: StudyRow, b: StudyRow) => b.total - a.total || a.index - b.index },
	few: {
		label: "Fewest tilings",
		// rows with none at the end: "fewest" means the rarest combinations that do tile
		by: (a: StudyRow, b: StudyRow) => (a.total || 1e15) - (b.total || 1e15) || a.index - b.index,
	},
	time: { label: "Longest search", by: (a: StudyRow, b: StudyRow) => b.elapsed - a.elapsed || a.index - b.index },
} as const;
type Sort = keyof typeof SORTS;
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
	const [page, setPage] = useState(1);
	const filter = (f: Partial<Filters>) => (setFilters((x) => ({ ...x, ...f })), setPage(1));
	const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTER) || !!query;
	// the row whose run Raise k is open for, and Raise k for every row
	const [raising, setRaising] = useState<string | null>(null);
	const [raisingAll, setRaisingAll] = useState(false);
	const raised = raising ? status.runs.find((r) => r.dir === raising) : undefined;
	const going = summary.state === "checking" || summary.state === "running";
	const limited = summary.tally.limit ?? 0;
	const act = async (action: "pause" | "resume" | "unlimit" | "unraise") =>
		setError((await api().studyAction(summary.id, action)).error ?? "");
	const running = status.runs.some((r) => r.state === "running" && r.dir.startsWith(summary.dir));

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
		return keep.sort(SORTS[sort].by);
	}, [detail, filters, query, sort]);

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
			<div className="flex flex-wrap items-start gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h1 className="truncate text-xl font-semibold text-fg">{summary.name}</h1>
						<Badge tone={STUDY_TONE[summary.state]}>{studyLabel(summary)}</Badge>
					</div>
					{summary.note || error ? (
						<p className={cn("mt-1.5 text-sm", error ? "text-danger" : "text-fg-secondary")}>{error || summary.note}</p>
					) : null}
				</div>
				<div className="flex gap-2">
					{going ? (
						<Button size="sm" icon={Pause} label="Pause" onClick={() => void act("pause")} />
					) : summary.state === "paused" ? (
						<Button size="sm" variant="primary" icon={Play} label="Resume" onClick={() => void act("resume")} />
					) : null}
					{summary.options.mode === "enumerate" ? (
						<Button size="sm" icon={ChevronsUp} label="Raise k" disabled={!detail} onClick={() => setRaisingAll(true)} />
					) : null}
					{limited ? (
						<Tooltip label={`${n(limited)} row${limited === 1 ? "" : "s"} stopped at the time limit go on, with no limit from now on`}>
							<Button size="sm" icon={TimerOff} label="Lift the time limit" onClick={() => void act("unlimit")} />
						</Tooltip>
					) : null}
					<Button
						size="sm"
						icon={FilePen}
						label="Edit board"
						disabled={!detail}
						onClick={() => detail && onEdit(detail.template)}
					/>
					<ActionMenu
						label="More actions"
						className="h-8 w-8"
						items={[
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
			/>

			{/* the rest of the window, at least 420 px: the table scrolls inside it, under its header */}
			<section className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-surface border border-line-subtle bg-surface-raised shadow-sm">
				<RowFilters
					s={summary}
					filters={filters}
					onFilter={filter}
					query={query}
					onQuery={(q) => (setQuery(q), setPage(1))}
					sort={sort}
					onSort={setSort}
					shown={rows.length}
					of={detail?.rows.length ?? summary.rowCount}
					active={filtered}
					onClear={() => (setFilters(NO_FILTER), setQuery(""), setPage(1))}
				/>
				<RowsTable
					// a new filter, order or page starts at the top
					key={JSON.stringify([filters, query, sort, page])}
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
			</section>
			{raisingAll && detail ? (
				<StudyRaiseModal summary={summary} detail={detail} onClose={() => setRaisingAll(false)} onError={setError} />
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
			isOpen
			onOpenChange={(o) => !o && onClose()}
			title="Raise k for every row"
			size="md"
			description="One rule for the whole study: the rows it asks more of go on"
			footer={
				<div className="flex justify-end gap-2">
					<Button label="Cancel" onClick={onClose} />
					<Button
						variant="primary"
						icon={ChevronsUp}
						label={on.length ? `Raise k · ${n(on.length)} row${on.length === 1 ? " goes" : "s go"} on` : "Set the rule"}
						onClick={() => void apply()}
					/>
				</div>
			}
		>
			<div className="space-y-4 p-5 text-sm">
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

/** Over the rows: what they are filtered by, the search, and their order. */
function RowFilters({
	s,
	filters,
	onFilter,
	query,
	onQuery,
	sort,
	onSort,
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
	onSort: (s: Sort) => void;
	shown: number;
	of: number;
	active: boolean;
	onClear: () => void;
}) {
	const faces = s.optional.map((f) => ({ value: f, label: f }));
	const sizes = Array.from({ length: s.sizes[1] - s.sizes[0] + 1 }, (_, i) => s.sizes[0] + i);
	const ks = Array.from({ length: Math.max(1, s.kmax - s.kmin + 1) }, (_, i) => s.kmin + i);
	const cls = "h-8 text-[13px]";
	return (
		<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-3">
			<Dropdown
				label="Outcome"
				ariaLabel="Rows by outcome"
				className={cls}
				value={filters.outcome}
				options={[{ value: "all", label: "Any" }, ...OUTCOMES.map((o) => ({ value: o.key, label: o.label }))]}
				onChange={(outcome) => onFilter({ outcome })}
			/>
			{s.optional.length && sizes.length > 1 ? (
				<Dropdown
					label="Faces"
					ariaLabel="Rows by how many optional faces they hold"
					className={cls}
					value={filters.size}
					options={[{ value: "any", label: "Any number" }, ...sizes.map((x) => ({ value: String(x), label: String(x) }))]}
					onChange={(size) => onFilter({ size })}
				/>
			) : null}
			{s.optional.length ? (
				<>
					<Dropdown
						label="Holds"
						ariaLabel="Rows holding a face"
						className={cls}
						value={filters.holds}
						options={[{ value: "any", label: "Any" }, ...faces]}
						onChange={(holds) => onFilter({ holds })}
					/>
					<Dropdown
						label="Lacks"
						ariaLabel="Rows without a face"
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
					ariaLabel={`Rows by ${p.name}`}
					className={cls}
					value={filters.values[p.name] ?? "any"}
					options={[{ value: "any", label: "Any" }, ...p.values.map((v) => ({ value: String(v), label: String(v) }))]}
					onChange={(v) => onFilter({ values: { ...filters.values, [p.name]: v } })}
				/>
			))}
			{s.options.mode === "enumerate" ? (
				<Dropdown
					label="First k"
					ariaLabel="Rows by the k of their first tiling"
					className={cls}
					value={filters.first === null ? "any" : String(filters.first)}
					options={[{ value: "any", label: "Any" }, ...ks.map((k) => ({ value: String(k), label: String(k) }))]}
					onChange={(v) => onFilter({ first: v === "any" ? null : Number(v) })}
				/>
			) : null}
			{active ? <Button size="sm" variant="ghost" icon={X} label="Clear" onClick={onClear} /> : null}
			{/* the count, the search and the order wrap together, to the right */}
			<span className="ml-auto flex items-center gap-2">
				<span className="font-mono text-xs text-fg-muted tabular-nums">
					{shown === of ? `${n(of)} rows` : `${n(shown)} of ${n(of)} rows`}
				</span>
				<span className="w-40">
					<SearchInput activeSearch={query} onSearchChange={onQuery} placeholder="Face or value" label={null} raw />
				</span>
				<Dropdown
					label="Sort"
					ariaLabel="Order the rows"
					className={cls}
					value={sort}
					options={(Object.keys(SORTS) as Sort[]).map((k) => ({ value: k, label: SORTS[k].label }))}
					onChange={onSort}
				/>
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
		<Tooltip label={searched.map((k) => `k ${k}: ${n(r.counts[k] ?? 0)}`).join(" · ")} delay={150}>
			<span className="flex h-4 items-end gap-px" aria-label="Tilings per k">
				{all.map((k) => {
					const c = r.counts[k] ?? 0;
					return (
						<span
							key={k}
							className={cn("shrink-0 rounded-[1px]", k > reached ? "" : c ? "bg-fg/45" : "bg-fg/10")}
							style={{ width: w, height: k > reached ? 0 : c ? `${Math.max(3, (Math.log10(1 + c) / top) * 16)}px` : "2px" }}
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
	if (loading) return <p className="px-4 py-6 text-sm text-fg-muted">Reading the rows…</p>;
	if (!rows.length) return <p className="px-4 py-6 text-sm text-fg-muted">No row matches.</p>;
	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			<table className="w-full table-fixed text-sm">
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
								<td className="py-2 pl-4 font-mono text-xs text-fg-muted tabular-nums">{r.index + 1}</td>
								<td className="py-2 pr-3">
									<RowChips r={r} />
								</td>
								<td className="py-2 pr-3">
									<span className={cn("flex min-w-0 items-center gap-1.5 text-xs", o.tone)}>
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
												<Link2 className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-label="From an earlier run" />
											</Tooltip>
										) : null}
									</span>
								</td>
								{ks ? (
									<td className="py-2 pr-3">
										<PerK r={r} ks={ks} />
									</td>
								) : null}
								<td className="py-2 pr-3 text-right font-mono text-xs text-fg-secondary tabular-nums">
									{r.total || r.state === "found" ? n(r.total) : ""}
								</td>
								<td className="py-2 pr-3 text-right font-mono text-xs text-fg-muted tabular-nums">
									{r.elapsed ? duration(r.elapsed) : ""}
								</td>
								<td className="py-1 pr-3 text-right">
									{r.run && !busy(r.run) ? (
										<Tooltip label="Raise k: search this row again to a higher k" delay={200}>
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
}: {
	s: StudySummary;
	detail: StudyDetail | null;
	/** Filter the rows by an outcome (OUTCOMES' key). */
	onFilter: (outcome: string) => void;
	/** The k the rows are filtered to by their first tiling, and a bar clicked. */
	first: number | null;
	onFirst: (k: number) => void;
}) {
	const parts = OUTCOMES.map((o) => ({ ...o, count: tallyOf(s, o.states) })).filter((o) => o.count > 0);
	const what = [
		s.optional.length
			? `every combination of ${s.optional.length} optional face${s.optional.length === 1 ? "" : "s"}${
					s.sizes[0] === s.sizes[1] ? `, ${s.sizes[0]} at a time` : s.sizes[0] > 1 || s.sizes[1] < s.optional.length ? `, ${s.sizes[0]} to ${s.sizes[1]} at a time` : ""
				}`
			: "",
		...s.params.map((p) => `${p.name} = ${rangeText(p.values)}`),
	].filter(Boolean);
	const o = s.options;
	const facts: { label: string; value: string; sub?: string; title?: string }[] = [
		{ label: "Search", value: o.mode === "find" ? "Existence" : "Enumerate", sub: `k ${s.kmin}–${s.kmax}` },
		{ label: "Rows at once", value: String(o.parallel), sub: `${o.threads} thread${o.threads === 1 ? "" : "s"} each` },
		{
			label: "Time limit",
			value: o.limit ? duration(o.limit) : "none",
			sub: o.mode === "find" ? `${o.seconds} s per k` : undefined,
		},
		...(o.raise
			? [
					{
						label: "Raise k",
						value: `up to ${o.raise.upTo}`,
						sub: briefRaise(o.raise),
						title: `Each row raises its k by itself ${describeRaise(o.raise)}.`,
					},
				]
			: []),
		{ label: "Search time", value: s.elapsed ? duration(s.elapsed) : "none yet", sub: s.elapsed ? "all rows" : undefined },
		{ label: "Started", value: when(s.created) },
	];
	if (s.ended) facts.push({ label: "Finished", value: when(s.ended) });
	return (
		<section className="grid shrink-0 grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(240px,300px)] overflow-hidden rounded-surface border border-line-subtle bg-surface-raised shadow-sm max-xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
			<div className="flex flex-col justify-between gap-3 border-r border-line-subtle p-4">
				<div>
					<div className="ta-label flex items-center gap-1.5">
						Rows
						<InfoDot side="bottom" label="What a row is">
							Each row is the board with some of its optional faces and without the others, at one value of each
							parameter. A row requires each optional face it holds, so it finds exactly the tilings that use those
							faces and no other optional one. Before any search, each row is checked: a row is ruled out only when no
							tiling can exist at any k (a corner of a required face fits no vertex, the engine&rsquo;s balance count, or
							faces that can never touch).
						</InfoDot>
					</div>
					<AnimatedNumber
						value={s.rowCount}
						className="mt-1.5 block text-[32px] leading-none font-semibold tracking-[-0.02em] text-fg"
					/>
					<div className="mt-1.5 text-sm leading-snug text-fg-secondary">{what.join("; ") || "one board"}</div>
				</div>
				<div className="space-y-2">
					<div className="flex h-2 overflow-hidden rounded-full bg-surface-sunken">
						{parts.map((p) => (
							<span
								key={p.key}
								className={cn("h-full transition-[width] duration-500 ease-[var(--ease-out)]", p.bar)}
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
									className="flex w-full cursor-pointer items-center gap-1.5 text-left text-xs text-fg-secondary hover:text-fg"
								>
									<span className={cn("h-2 w-2 shrink-0 rounded-[2px]", p.bar, p.key === "left" && "ring-1 ring-line ring-inset")} />
									<span className="min-w-0 flex-1 truncate">{p.label}</span>
									<span className="font-mono text-fg tabular-nums">{n(p.count)}</span>
								</button>
							</li>
						))}
					</ul>
				</div>
			</div>
			<FirstK s={s} detail={detail} pick={first} onPick={onFirst} />
			<dl className="grid content-start grid-cols-2 gap-x-5 gap-y-3 border-l border-line-subtle p-4 max-xl:col-span-2 max-xl:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] max-xl:border-t max-xl:border-l-0">
				{facts.map((f) => (
					<div key={f.label} className="min-w-0">
						<dt className="ta-label">{f.label}</dt>
						<dd className="mt-1 truncate text-sm font-medium text-fg tabular-nums" title={f.title ?? f.sub}>
							{f.value}
							{f.sub ? <span className="ml-1.5 text-xs font-normal text-fg-muted">{f.sub}</span> : null}
						</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

/** A raise rule's conditions, short: "until 1 tiling, 3 min a search". */
function briefRaise(r: RaiseRule): string | undefined {
	const caps = [r.minutes !== undefined && `${r.minutes} min`, r.gigabytes !== undefined && `${r.gigabytes} GB`].filter(Boolean);
	const parts = [r.found !== undefined && `until ${r.found} tiling${r.found === 1 ? "" : "s"}`, caps.length && `${caps.join(", ")} a search`];
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
	for (const r of detail?.rows ?? []) if (r.state === "found" && r.first !== undefined) per.set(r.first, (per.get(r.first) ?? 0) + 1);
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
				<span className="font-mono text-[11px] text-fg-muted">{n(tallyOf(s, ["found"]))} found</span>
			</div>
			<div className="relative flex border-b border-line" style={{ height: PLOT }}>
				{cols.map((c, i) => {
					const h = c.count ? Math.max(3, (c.count / top) * (PLOT - 20)) : 0;
					return (
						<Tooltip
							key={c.k}
							label={`k = ${c.k}: ${n(c.count)} row${c.count === 1 ? "" : "s"} first found here${c.count ? `. Click to show ${pick === c.k ? "every row" : "only these"}` : ""}`}
							delay={120}
						>
							<button
								type="button"
								disabled={!c.count}
								onClick={() => onPick(c.k)}
								aria-pressed={pick === c.k}
								aria-label={`Rows first found at k = ${c.k}`}
								className="relative h-full min-w-0 flex-1 cursor-pointer rounded-t-[4px] transition-colors enabled:hover:bg-fg/[0.04] disabled:cursor-default"
							>
								<span
									className={cn(
										"absolute bottom-0 left-1/2 w-[min(24px,62%)] -translate-x-1/2 rounded-t-[4px] transition-[height,background-color] duration-700 ease-[var(--ease-out-strong)]",
										pick === c.k ? "bg-accent" : pick === null ? "bg-success/70" : "bg-success/30",
									)}
									style={{ height: grown ? h : 0, transitionDelay: `${i * 25}ms` }}
								/>
								{c.count ? (
									<span
										className="absolute left-1/2 -translate-x-1/2 font-mono text-[11px] text-fg-secondary tabular-nums transition-[bottom] duration-700 ease-[var(--ease-out-strong)]"
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
					<span key={c.k} className="min-w-0 flex-1 text-center font-mono text-[11px] text-fg-muted tabular-nums">
						{ks.length <= 16 || c.k % 2 === 0 ? c.k : ""}
					</span>
				))}
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
				<MultiSelect
					label={
						<span className="flex items-center gap-1.5">
							Optional faces
							<InfoDot>
								A row holds some of the optional faces, requires each one it holds and leaves the others out, so
								it finds the tilings that use exactly those. The faces you leave unpicked are on every row and
								never required: the regular polygons beside a set of stars, say.
							</InfoDot>
						</span>
					}
					options={board.faces.map((_, i) => ({ id: String(i), label: labels[i] }))}
					selected={optional.map(String)}
					onSelectedChange={pick}
				/>
			) : (
				<Field label="Optional faces">
					<p className="text-sm text-fg-secondary">Add faces to the board first.</p>
				</Field>
			)}
			{optional.length ? (
				<Field
					label="Optional faces per row"
					hint="The fewest and the most optional faces a row holds. 0 adds the row with none of them: the board's other faces alone."
				>
					<div className="flex items-center gap-2 text-sm text-fg-secondary">
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
						<span className="text-xs text-fg-muted">of {optional.length}</span>
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
								<li key={p.name} className="flex items-center gap-2 text-sm text-fg-secondary">
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
										<span className="min-w-0 flex-1 truncate font-mono text-xs" title="Edit a list of values in the text">
											{raw}
										</span>
									)}
									<Button
										size="icon"
										variant="ghost"
										icon={X}
										aria-label={`Remove parameter ${p.name}`}
										title={`Remove ${p.name}: its lines keep the value drawn, ${vars[p.name] ?? p.values[0]}`}
										onClick={() =>
											setText(withParam(substitute(text, { [p.name]: vars[p.name] ?? p.values[0] }).text, p.name, null))
										}
									/>
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
				hint="One search per row, side by side on the study's page, each with what it found and from which k. Before any search, a row that can have no tiling at any k is ruled out, with the reason."
			>
				{varies ? (
					<>
						<p className="text-sm text-fg">
							<span className="font-semibold tabular-nums">{n(plan.rows)}</span> row{plan.rows === 1 ? "" : "s"}
							<span className="text-fg-secondary">{describe(plan)}</span>
						</p>
						{atRows.length ? <Problems list={atRows} /> : null}
						{plan.rows > MAX_ROWS ? (
							<p className="text-xs text-danger">
								A study runs at most {n(MAX_ROWS)} rows. Narrow the faces per row or the parameters&rsquo; values.
							</p>
						) : listed && listed.length ? (
							<p className="text-xs leading-snug text-fg-muted">
								{ruled
									? `${n(ruled)} ruled out before any search: a corner of a face they require fits no vertex. The engine checks the other ${n(listed.length - ruled)}`
									: "The engine checks each row"}{" "}
								as the study starts, and searches those it cannot rule out.
							</p>
						) : null}
					</>
				) : (
					<>
						<p className="text-sm text-fg-secondary">
							Pick the optional faces, or add a parameter: each combination becomes a row.
						</p>
						{examples.length ? (
							<>
								<p className="text-xs text-fg-muted">Or start from an example:</p>
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
		<div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-surface border border-line-subtle bg-surface-raised px-4 py-3 text-sm text-fg-secondary shadow-sm">
			<span className="flex items-center gap-1.5">
				<Rows3 className="h-4 w-4 shrink-0 text-accent" />
				Drawn at
				<InfoDot>
					A board with parameters is one board per value. Faces and corners written with a parameter (n sides, A{"{n}"})
					are drawn here at the value you pick, the checks read the board there, and the study runs every value.
					Edits apply to all of them.
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
								onPick(p.name, p.values.reduce((a, v) => (Math.abs(v - x) < Math.abs(a - x) ? v : a)));
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
				hint="A row that searches longer stops there, keeping what it finished, and the study moves on. Lift the limit on the study's page to let those rows go on."
			>
				<div className="flex items-center gap-2 text-sm text-fg-secondary">
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

/** ": every combination of 4 optional faces, 1 to 4 at a time, for n = 6 to 10". */
function describe(p: StudyPlan): string {
	const parts: string[] = [];
	if (p.optional.length)
		parts.push(
			`every combination of ${p.optional.length} optional face${p.optional.length === 1 ? "" : "s"}${
				p.sizes[0] === p.sizes[1] ? `, ${p.sizes[0]} at a time` : `, ${p.sizes[0]} to ${p.sizes[1]} at a time`
			}`,
		);
	if (p.params.length) parts.push(`for ${p.params.map((x) => `${x.name} = ${rangeText(x.values)}`).join(" and ")}`);
	return parts.length ? `: ${parts.join(", ")}` : "";
}
