// The runs: every run folder under the output folder, live progress for the running ones, and per run
// its counts per k, its output files and the certificates in them.
import {
	ArchiveRestore,
	ArrowDownUp,
	Check,
	ChevronsDownUp,
	Archive,
	ChevronsUp,
	ChevronsUpDown,
	FilePen,
	Folder,
	FolderOpen,
	FolderPlus,
	HardDrive,
	History,
	Pause,
	Pencil,
	Play,
	Rows3,
	RotateCcw,
	Square,
	Telescope,
	Trash2,
} from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/design-system/components/badge";
import { Checkbox, CheckboxBox } from "@/design-system/components/checkbox";
import { Button } from "@/design-system/components/button";
import { CopyButton } from "@/design-system/components/copy-button";
import { ActionMenu, ContextMenu, type ContextMenuItem } from "@/design-system/components/context-menu";
import { Dropdown } from "@/design-system/components/dropdown";
import { Field } from "@/design-system/components/field";
import { HoverPill } from "@/design-system/components/hover-pill";
import { FoldChevron } from "@/design-system/components/disclosure";
import { Input } from "@/design-system/components/input";
import { InfoDot } from "@/design-system/components/info-dot";
import { Modal } from "@/design-system/components/modal";
import { OptionWall } from "@/design-system/components/option-wall";
import { RangeInput } from "@/design-system/components/range-input";
import { Tabs } from "@/design-system/components/tabs";
import { Tooltip } from "@/design-system/components/tooltip";
import { NavActivePill } from "@/components/nav-bar";
import { cn } from "@/lib/utils/cn";
import { MAX_K, parse, serialize } from "./board";
import {
	describeRaise,
	type OutFile,
	type RaiseRule,
	type Rule,
	type Run,
	type RunOptions,
	type Status,
	type StudySummary,
} from "./bridge";
import { FindMark, FindOverview, findState } from "./find";
import { percent, RunOverview } from "./overview";
import { filesOf, GroupPicker, groupOfK, resolveGroup, TilingsView, type Group } from "./tilings";
import { STEP_MS } from "@/design-system/motion";

const api = () => window.tilesearch;
const n = (x: number) => x.toLocaleString("en");
export const bytes = (x: number) =>
	x < 1024
		? `${x} B`
		: x < 2 ** 20
			? `${(x / 1024).toFixed(1)} KB`
			: x < 2 ** 30
				? `${(x / 2 ** 20).toFixed(1)} MB`
				: `${(x / 2 ** 30).toFixed(1)} GB`;
export const duration = (s: number) =>
	s < 60
		? `${s.toFixed(1)} s`
		: s < 3600
			? `${Math.floor(s / 60)} m ${String(Math.floor(s % 60)).padStart(2, "0")} s`
			: `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} m`;
/** A run's creation time, as "25 Oct, 14:15". */
export const when = (ms: number) =>
	ms
		? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
		: "";
/** The folder a path is in, and its last segment, whichever separator the platform uses. */
const splitPath = (p: string) => {
	const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
	return [p.slice(0, i), p.slice(i + 1)] as const;
};
/** Browser storage for per-window conveniences; it can be missing or refuse, and then nothing is kept. */
export const load = (k: string) => {
	try {
		return localStorage.getItem(k);
	} catch {
		return null;
	}
};
export const store = (k: string, v: string) => {
	try {
		localStorage.setItem(k, v);
	} catch {}
};
const OPEN_FOLDERS = "tilesearch:open-folders";
/** A study or run folder's date stamp, left out of a name as people read it. */
const STAMP_SUFFIX = /-\d{8}-\d{6}(?:-\d+)?$/;
/** How each folder's runs are ordered: by name, newest started first, or last ended first (what ran overnight). */
const RUN_ORDER = "tilesearch:run-order";
type Order = "name" | "started" | "ended";
const ORDERS: { key: Order; label: string }[] = [
	{ key: "name", label: "By name" },
	{ key: "started", label: "Newest started first" },
	{ key: "ended", label: "Last ended first" },
];
const byOrder = (o: Order) => (a: Run, b: Run) =>
	o === "started"
		? b.created - a.created
		: o === "ended"
			? (b.ended ?? -1) - (a.ended ?? -1) || b.created - a.created
			: 0;
const CLOSED_SECTIONS = "tilesearch:closed-sections";

/** The run list's sections, by state; each holds the folder tree of its own runs. */
type Section = { key: string; label: string; keep: (r: Run) => boolean };
const SECTIONS: Section[] = [
	{ key: "running", label: "Running", keep: (r) => r.state === "running" || !!r.queued },
	{ key: "unfinished", label: "Unfinished", keep: (r) => !r.queued && (r.state === "stopped" || r.state === "failed") },
	{ key: "finished", label: "Finished", keep: (r) => r.state === "finished" },
];
/** The section that also shows the folders holding no run, and a folder being made. */
const HOME = "finished";
const sectionOf = (r: Run) => SECTIONS.find((s) => s.keep(r))!;
/** A folder shown open, by section: one that shows in two sections opens and closes in each on its own. */
const at = (section: string, folder: string) => `${section} ${folder}`;
/** A study's section: going (checking or running), paused, or done. */
const studySection = (s: StudySummary) =>
	s.state === "paused" ? "unfinished" : s.state === "done" ? "finished" : "running";
/** Rows settled, of all: what a study's progress bar shows. */
const studyDone = (s: StudySummary) =>
	(["found", "none", "ruled-out", "same", "failed", "conflict", "limit"] as const).reduce(
		(t, k) => t + (s.tally[k] ?? 0),
		0,
	);
/** The finished runs opened since they finished, by folder. */
const INSPECTED = "tilesearch:inspected";
const loadSet = (k: string): Set<string> | null => {
	try {
		const v = load(k);
		return v === null ? null : new Set(JSON.parse(v) as string[]);
	} catch {
		return null;
	}
};

export const parentOf = (p: string) => p.replace(/[\\/][^\\/]*$/, "");
export const baseOf = (p: string) => p.slice(parentOf(p).length + 1);
/** Whether `p` is `folder` or inside it. */
// The run tree draws its highlighted path one piece every STEP_MS (design-system/styles/tree.css .ta-rail).
const isWithin = (p: string, folder: string) =>
	p === folder || (p.startsWith(folder) && /[\\/]/.test(p[folder.length]));
/** An estimate as people read it: "≈ 1,250 ± 30", the error rounded to two figures and the value to match. */
export function approx([v, se]: [number, number]): string {
	if (!(se > 0)) return `≈ ${n(Math.round(v))}`;
	const step = 10 ** Math.max(0, Math.floor(Math.log10(1.96 * se)) - 1);
	const r = (x: number) => n(Math.round(x / step) * step);
	return `≈ ${r(v)} ± ${r(1.96 * se)}`;
}

/** The estimated total per k: the tilings of finished roots, counted, plus the estimate for the rest. */
export function estimatedTotal(e: NonNullable<Run["estimate"]>, k: number): [number, number] {
	const u = e.perK[k]?.unique ?? [0, 0];
	return [(e.base[k] ?? 0) + u[0], u[1]];
}

/** A run's certificate files by bytes: plain text, and gzipped. */
export const packOf = (r: Run) => {
	let [plain, gz] = [0, 0];
	for (const f of r.files)
		if (f.path.endsWith(".gz")) gz += f.bytes;
		else plain += f.bytes;
	return { plain, gz };
};
/** Compress and Decompress for a run's menus, or its progress while one goes. */
export function packItems(r: Run, onError: (e: string) => void): ContextMenuItem[] {
	if (r.packing)
		return [
			{
				icon: r.packing.unpack ? ArchiveRestore : Archive,
				label: `${r.packing.unpack ? "Decompressing" : "Compressing"} ${r.packing.done} of ${r.packing.all}`,
				disabled: true,
				onSelect: () => {},
			},
		];
	const { plain, gz } = packOf(r);
	const go = (unpack: boolean) => async () => onError((await api().compress(r.id, unpack)).error ?? "");
	return [
		...(r.state === "finished" && plain
			? [{ icon: Archive, label: `Compress files (${bytes(plain)})`, onSelect: go(false) }]
			: []),
		...(r.state !== "running" && gz
			? [{ icon: ArchiveRestore, label: `Decompress files (${bytes(gz)})`, onSelect: go(true) }]
			: []),
	];
}
/** The runs a bulk Compress or Decompress would take, and their bytes. */
export function packable(runs: Run[], unpack: boolean) {
	const take = runs.filter(
		(r) =>
			!r.packing &&
			(unpack ? r.state !== "running" && packOf(r).gz > 0 : r.state === "finished" && packOf(r).plain > 0),
	);
	return { take, bytes: take.reduce((t, r) => t + packOf(r)[unpack ? "gz" : "plain"], 0) };
}
/** Compress (or decompress) runs one after another, stopping at the first error. */
export async function packRuns(runs: Run[], unpack: boolean, onError: (e: string) => void) {
	for (const r of runs) {
		const { error } = await api().compress(r.id, unpack);
		if (error) return onError(`${r.name}: ${error}`);
	}
	onError("");
}
/** Bulk Compress and Decompress items for the runs in a folder, or every run. */
export function packAllItems(runs: Run[], onError: (e: string) => void): ContextMenuItem[] {
	return ([false, true] as const).flatMap((unpack) => {
		const { take, bytes: b } = packable(runs, unpack);
		return take.length
			? [
					{
						icon: unpack ? ArchiveRestore : Archive,
						label: `${unpack ? "Decompress" : "Compress"} ${take.length} run${take.length === 1 ? "" : "s"} (${bytes(b)})`,
						onSelect: () => void packRuns(take, unpack, onError),
					},
				]
			: [];
	});
}

/** Counts as they read, the empty ones left out: "2 folders, 3 runs and 1 study". */
const tally = (parts: [number, string, string][]) => {
	const words = parts.filter(([c]) => c).map(([c, one, many]) => `${n(c)} ${c === 1 ? one : many}`);
	return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : (words[0] ?? "");
};
/** A stopped run resumes with this window's threads and priority, and its own k, rule and raise rule. */
const resumeOptions = (r: Run, options: RunOptions): RunOptions => ({
	...options,
	k: r.options?.k,
	rule: r.options?.rule,
	...(r.options?.raise ? { raise: r.options.raise } : {}),
});
/**
 * Start and Pause for everything in a folder: its stopped runs and paused studies, or its going ones (a queued
 * run leaves the queue). A failed run, or one its raise rule's ceiling stopped, is left for its own page.
 */
function goAllItems(
	runs: Run[],
	studies: StudySummary[],
	options: RunOptions,
	onError: (e: string) => void,
): ContextMenuItem[] {
	type Call = [string, () => Promise<{ error?: string }>];
	const item = (pause: boolean, rs: Run[], ss: StudySummary[]): ContextMenuItem[] => {
		if (!rs.length && !ss.length) return [];
		const run = (r: Run): Call => [
			r.name,
			() => (pause ? api().stop(r.id).then(() => ({})) : api().resume(r.id, resumeOptions(r, options))),
		];
		const study = (s: StudySummary): Call => [s.name, () => api().studyAction(s.id, pause ? "pause" : "resume")];
		// a pause takes the queued runs first, so a slot it frees starts none of them; a start puts runs first,
		// as a search started by hand goes before a study's rows
		const calls = pause
			? [...rs.filter((r) => r.queued).map(run), ...ss.map(study), ...rs.filter((r) => !r.queued).map(run)]
			: [...rs.map(run), ...ss.map(study)];
		return [
			{
				icon: pause ? Pause : Play,
				label: `${pause ? "Pause" : "Start"} ${tally([
					[rs.length, "run", "runs"],
					[ss.length, "study", "studies"],
				])}`,
				// one after another, stopping at the first error, as packRuns does
				onSelect: async () => {
					for (const [name, call] of calls) {
						const { error } = await call();
						if (error) return onError(`${name}: ${error}`);
					}
					onError("");
				},
			},
		];
	};
	return [
		...item(
			false,
			runs.filter((r) => r.state === "stopped" && !r.queued && !r.capped && !r.packing),
			studies.filter((s) => s.state === "paused"),
		),
		...item(
			true,
			runs.filter((r) => r.state === "running" || !!r.queued),
			studies.filter((s) => s.state === "checking" || s.state === "running"),
		),
	];
}

const TONE = { running: "accent", stopped: "neutral", finished: "success", failed: "danger" } as const;
/** A run's state as it reads: a finished run searched every root, a stopped one has roots left. */
export const stateLabel = (r: Run) =>
	r.queued
		? `queued · ${r.queued === 1 ? "next" : `#${r.queued}`}`
		: r.options?.find
			? findState(r)
			: r.state === "finished"
				? "complete"
				: r.state === "stopped"
					? `stopped · ${r.roots.done} of ${r.roots.all || "?"} roots`
					: r.state;

/** A run's files gzipped, as an icon: pulsing while Compress or Decompress goes. */
export function PackMark({ run, className }: { run: Run; className?: string }) {
	const { plain, gz } = packOf(run);
	if (!run.packing && !(gz && !plain)) return null;
	const Icon = run.packing?.unpack ? ArchiveRestore : Archive;
	const what = run.packing
		? `${run.packing.unpack ? "Decompressing" : "Compressing"}: ${run.packing.done} of ${run.packing.all} files`
		: `Compressed: ${bytes(gz)} of gzipped files, read here as they are`;
	return (
		<span title={what} aria-label={what} className={cn("inline-flex shrink-0", className)}>
			<Icon size={13} className={run.packing ? "animate-pulse text-fg-accent" : "text-fg-muted"} />
		</span>
	);
}

/** A run row's progress: the roots finished and, while it runs, the share of the estimated work, with a bar. */
function Progress({ run }: { run: Run }) {
	const { roots, work } = run;
	if (run.options?.find) return <span className="mt-1 block truncate text-small text-fg-secondary">{findState(run)}</span>;
	return (
		<span className="mt-1 flex items-center gap-2 text-small text-fg-secondary tabular-nums">
			{work ? (
				<span className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-surface-sunken">
					<span className="block h-full bg-accent" style={{ width: `${work.share * 100}%` }} />
				</span>
			) : null}
			<span className="truncate">
				{roots.all
					? `${n(roots.done)} of ${n(roots.all)} roots`
					: roots.done
						? `${n(roots.done)} roots done`
						: run.state === "running"
							? "starting"
							: "no root finished yet"}
				{work ? ` · ≈ ${percent(work.share)}` : ""}
			</span>
		</span>
	);
}

/** A name typed in place: Enter saves, Escape or leaving the field cancels. `save` answers with an error or null. */
function NameField({
	initial,
	suffix,
	save,
	done,
}: {
	initial: string;
	/** Fixed text after the field, not editable: a run's date stamp. */
	suffix?: string;
	save: (name: string) => Promise<string | null>;
	done: () => void;
}) {
	const [name, setName] = useState(initial);
	const [error, setError] = useState("");
	const commit = async () => {
		if (name.trim() === initial) return done();
		const e = await save(name);
		if (e) setError(e);
		else done();
	};
	// the suffix goes under the field: beside it, deep in the tree, it left the field no room
	return (
		<div className="min-w-0 flex-1">
			<Input
				value={name}
				size="sm"
				autoFocus
				onFocus={(e) => e.currentTarget.select()}
				onChange={(e) => (setName(e.target.value), setError(""))}
				onKeyDown={(e) => {
					if (e.key === "Enter") void commit();
					if (e.key === "Escape") done();
				}}
				onBlur={() => !error && done()}
				aria-label="Name"
			/>
			{suffix ? <p className="mt-1 truncate font-mono text-caption text-fg-muted">{suffix}</p> : null}
			{error ? <p className="mt-1 text-small text-danger">{error}</p> : null}
		</div>
	);
}

/** What a delete takes with it: a run, or a folder and every run in it. */
/** Run a run's board again, to a higher k (Raise k) or over the same k (`again`), under a name of its
 *  choosing, in a folder of its choosing, and maybe replace it. */
const folderOptions = (status: Status) =>
	[status.root, ...status.folders].map((f) => ({
		value: f,
		label: f === status.root ? "the output folder" : f.slice(status.root.length + 1),
	}));

// "Nearest face", not "Face first": it orders the search, and was taken for a search by tile orbits (`search faces`)
export const RULE_NAME: Record<Rule, string> = { fewest: "Fewest options", face: "Nearest face" };
export const RULE_HINT =
	"Auto samples the search under both rules at your k, for a second or so, and keeps the faster. When the two are close it may keep the slightly slower one. Forcing one changes the time, never the tilings.";
/** The branching rule for a run: Auto lets the engine measure and pick, the others force one. */
export function RuleField({ rule, onChange }: { rule?: Rule; onChange: (r: Rule | undefined) => void }) {
	return (
		<OptionWall
			columns={3}
			options={[
				{ value: "auto", label: "Auto" },
				{ value: "fewest", label: RULE_NAME.fewest },
				{ value: "face", label: RULE_NAME.face },
			]}
			selected={rule ?? "auto"}
			onChange={(v) => onChange(v === "auto" ? undefined : (v as Rule))}
		/>
	);
}

const RAISE_HINT =
	"Raised by itself, the searches go one k at a time: the first to the lowest k, and each that finishes without finding what you ask is followed by one to the next k, which replaces it. A search covers every k up to its own, so starting low finds the first k cheaply. Time and disk are ceilings on each search: one that passes either stops there, keeping what it finished, and the raising ends; in a study that row is done and the study goes on. An enumeration only.";
const RAISE_TESTS = [
	{ key: "found", lead: "finds at least", unit: "tilings", start: 1, least: 1 },
	{ key: "minutes", lead: "runs over", unit: "minutes", start: 3, least: 0.1 },
	{ key: "gigabytes", lead: "writes over", unit: "GB", start: 5, least: 0.1 },
] as const;
/**
 * Raise k by itself (bridge.ts RaiseRule): off, or what ends it. On the board page the searches go from the board's
 * lowest k to its highest (`to`); in Raise k, from the k chosen to a highest k set here.
 */
/**
 * k for a search: one range, searched once (`range`, the caller's inputs), or raised by itself one k at a time by a
 * rule (bridge.ts RaiseRule). The switch comes first and shows one or the other. `from` is where the climbing
 * starts and `upTo` its highest k: on the board page both are the board's own k.
 */
export function KField({
	hint,
	range,
	rule,
	onRule,
	from,
	onFrom,
	upTo,
	onUpTo,
}: {
	hint: ReactNode;
	range: ReactNode;
	rule?: RaiseRule;
	onRule: (r: RaiseRule | undefined) => void;
	from: number;
	onFrom?: (k: number) => void;
	upTo?: number;
	onUpTo?: (k: number) => void;
}) {
	const r: RaiseRule = rule ?? { found: 1, minutes: 3, upTo: upTo ?? Math.min(MAX_K, from + 4) };
	return (
		<Field
			label="k"
			hint={
				<>
					{hint} {RAISE_HINT}
				</>
			}
		>
			<OptionWall
				columns={2}
				options={[
					{ value: "fixed range", label: "Fixed range" },
					{ value: "raise by itself", label: "Raise by itself" },
				]}
				selected={rule ? "raise by itself" : "fixed range"}
				onChange={(v) => onRule(v === "raise by itself" ? r : undefined)}
			/>
			{rule ? (
				<RaiseConditions rule={r} onChange={onRule} from={from} onFrom={onFrom} upTo={upTo} onUpTo={onUpTo} />
			) : (
				range
			)}
		</Field>
	);
}

/** A raise rule's range and conditions: KField's, and a study's Raise k. The range edits `from` and `upTo` through
 *  the caller when it passes them (the board's k), the rule's own `upTo` when not. */
export function RaiseConditions({
	rule: r,
	onChange,
	from,
	onFrom,
	upTo,
	onUpTo,
}: {
	rule: RaiseRule;
	onChange: (r: RaiseRule) => void;
	from: number;
	onFrom?: (k: number) => void;
	upTo?: number;
	onUpTo?: (k: number) => void;
}) {
	const set = (x: Partial<RaiseRule>) => onChange({ ...r, ...x });
	const kOf = (v: string) => Math.min(MAX_K, Math.max(1, Math.round(Number(v)) || 1));
	const test = (t: (typeof RAISE_TESTS)[number]) => {
		const v = r[t.key];
		return (
			<label key={t.key} className="flex items-center gap-2">
				<CheckboxBox checked={v !== undefined} onCheckedChange={(c) => set({ [t.key]: c ? t.start : undefined })} />
				<span className={cn("w-24", v === undefined && "text-fg-muted")}>{t.lead}</span>
				<Input
					type="number"
					min={t.least}
					value={v ?? t.start}
					disabled={v === undefined}
					onChange={(e) => {
						const x = Number(e.target.value) || t.least;
						set({ [t.key]: t.key === "found" ? Math.max(1, Math.round(x)) : Math.max(t.least, x) });
					}}
					className="w-20"
					aria-label={`A search ${t.lead} (${t.unit})`}
				/>
				<span className={cn(v === undefined && "text-fg-muted")}>{t.unit}</span>
			</label>
		);
	};
	return (
		<div className="space-y-2 text-body text-fg-secondary">
			<div className="flex items-center gap-2">
				from
				{onFrom ? (
					<Input
						type="number"
						min={1}
						max={MAX_K}
						value={from}
						onChange={(e) => onFrom(kOf(e.target.value))}
						className="w-20"
						aria-label="First k"
					/>
				) : (
					<span className="text-fg">{from}</span>
				)}
				up to
				<Input
					type="number"
					min={from}
					max={MAX_K}
					value={upTo ?? r.upTo}
					onChange={(e) => (onUpTo ? onUpTo(kOf(e.target.value)) : set({ upTo: kOf(e.target.value) }))}
					className="w-20"
					aria-label="Highest k"
				/>
			</div>
			<p className="text-small text-fg-muted">Each search goes one k higher than the last.</p>
			<p className="pt-1 text-small text-fg-muted">Stop raising when a search</p>
			{test(RAISE_TESTS[0])}
			<p className="pt-1 text-small text-fg-muted">Stop any search that</p>
			{test(RAISE_TESTS[1])}
			{test(RAISE_TESTS[2])}
		</div>
	);
}

/** Threads for a run, up to twice the cores. */
export function ThreadsInput({
	value,
	cores,
	onChange,
}: {
	value: number;
	cores: number;
	onChange: (n: number) => void;
}) {
	return <RangeInput min={1} max={Math.max(1, cores * 2)} value={value} onChange={onChange} aria-label="Threads" />;
}
export const threadsHint = (cores: number) => `This computer has ${cores} cores. Threads never change the result.`;

export function ImproveModal({
	run,
	status,
	options,
	cores,
	again = false,
	onClose,
	onStarted,
}: {
	run: Run;
	status: Status;
	options: RunOptions;
	cores: number;
	again?: boolean;
	onClose: () => void;
	onStarted: (id: string) => void;
}) {
	const [name, setName] = useState(run.name);
	// for this run only: the saved setting stays as the board left it
	const [threads, setThreads] = useState(options.threads);
	// a find run asks a question again, with any k range and time limit: nothing it found is carried over
	const finding = !!run.options?.find;
	const [from, setFrom] = useState(String(run.kmin));
	const [to, setTo] = useState(String(again ? run.kmax : run.kmax + 1));
	const [seconds, setSeconds] = useState(String(run.options?.find?.seconds ?? 120));
	// an improved run holds every tiling of the old one, so by default it takes its place
	const [replace, setReplace] = useState(!again && !finding);
	// beside the run it improves, unless moved
	const [folder, setFolder] = useState(parentOf(run.dir));
	const [error, setError] = useState("");
	const [rule, setRule] = useState<Rule | undefined>(run.options?.rule);
	// its own rule, if any, going higher than the k it reached: a raise by hand asks for more
	const [raise, setRaise] = useState<RaiseRule | undefined>(() => {
		const r = run.options?.raise;
		return r && { ...r, upTo: Math.min(MAX_K, Math.max(r.upTo, run.kmax + 5)) };
	});
	const lo = finding ? Math.round(Number(from)) : run.kmin;
	const k = again && !finding ? run.kmax : Math.round(Number(to));
	const secs = Math.round(Number(seconds));
	// why the run cannot start yet, shown under the form; empty when it can
	const problem = !name.trim()
		? "The run needs a name."
		: !Number.isFinite(k) || !Number.isFinite(lo)
			? "k must be a whole number."
			: finding && (lo < 1 || k < lo)
				? "k needs 1 ≤ from ≤ to."
				: !finding && !again && k <= run.kmax
					? `Raise k past ${run.kmax}.`
					: k > MAX_K
						? `k goes up to ${MAX_K}.`
						: raise && !finding && raise.upTo < k
							? `Raise k up to at least ${k}.`
							: finding && !(secs >= 5)
								? "Give each k at least 5 seconds."
								: "";
	const ok = !problem;
	const start = async () => {
		// from the same lowest k, so the new run holds every tiling the old one did
		const res = await api().start(
			run.board,
			name.trim(),
			finding
				? { ...options, threads, k: [lo, k], find: { seconds: secs } }
				: { ...options, threads, k: [run.kmin, k], ...(rule ? { rule } : {}), ...(raise ? { raise } : {}) },
			replace ? run.dir : undefined,
			folder,
		);
		if (res.error) return setError(res.error);
		onStarted(res.id);
		onClose();
	};
	return (
		<Modal
			open
			onOpenChange={(o) => !o && onClose()}
			title={again ? `Run “${run.name}” again` : `Raise k of “${run.name}”`}
			size="md"
			description={
				finding
					? "Look again for one tiling meeting every required set. The new run starts from scratch."
					: again
						? "Run the same board over the same k"
						: "Search the board again up to a higher k. A finished run cannot be extended: every branch of the search grows with k, so the work below the old k is done again."
			}
			footer={
				<div className="flex justify-end gap-2">
					<Button label="Cancel" onClick={onClose} />
					<Button
						variant="primary"
						icon={Play}
						label={
							finding
								? `Find a tiling, k ${ok ? lo : "?"}–${ok ? k : "?"}`
								: `Run k ${run.kmin}–${ok ? k : "?"}${raise && ok && raise.upTo > k ? `, raising to ${raise.upTo}` : ""}`
						}
						disabled={!ok}
						onClick={start}
					/>
				</div>
			}
		>
			<div className="space-y-4 p-5 text-body">
				<Field label="Name">
					<Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Run name" />
				</Field>
				<Field label="Folder">
					<Dropdown
						value={folder}
						options={folderOptions(status)}
						onChange={setFolder}
						className="w-full"
						aria-label="Folder for the new run"
					/>
				</Field>
				{finding ? (
					<>
						<Field
							label="k"
							hint="Starting higher skips what is already settled: below the k this run proved, there is nothing to find."
						>
							<div className="flex items-center gap-2">
								<span className="text-fg-secondary">from</span>
								<Input
									type="number"
									min={1}
									value={from}
									onChange={(e) => setFrom(e.target.value)}
									className="w-20"
									aria-label="k from"
								/>
								<span className="text-fg-secondary">to</span>
								<Input
									type="number"
									min={1}
									max={MAX_K}
									value={to}
									onChange={(e) => setTo(e.target.value)}
									className="w-20"
									aria-label="k up to"
								/>
								{run.find?.proven ? <span className="text-fg-muted">none below {run.find.proven}, proven</span> : null}
							</div>
						</Field>
						<Field label="Time limit">
							<div className="flex items-center gap-2">
								<Input
									type="number"
									min={5}
									value={seconds}
									onChange={(e) => setSeconds(e.target.value)}
									className="w-20"
									aria-label="Seconds per k"
								/>
								<span className="text-fg-secondary">seconds per k, in each step</span>
							</div>
						</Field>
					</>
				) : null}
				{finding ? null : (
					// the new top k, or the first of a climb raised by itself (its highest set there)
					<KField
						hint="This run's search, again to a higher k: every k from its lowest up is searched once more."
						range={
							again ? (
								<p className="text-fg-secondary">
									Over the same k, {run.kmin} to {run.kmax}.
								</p>
							) : (
								<div className="flex items-center gap-2">
									<span className="text-fg-secondary">from {run.kmin} to</span>
									<Input
										type="number"
										min={run.kmax + 1}
										max={MAX_K}
										value={to}
										onChange={(e) => setTo(e.target.value)}
										className="w-24"
										aria-label="k up to"
									/>
									<span className="text-fg-muted">this run went to {run.kmax}</span>
								</div>
							)
						}
						rule={raise}
						onRule={setRaise}
						from={Number.isFinite(k) ? k : run.kmax}
						onFrom={again ? undefined : (v) => setTo(String(v))}
					/>
				)}
				<Field label="Branching rule" hint={RULE_HINT} className={finding ? "hidden" : undefined}>
					<RuleField rule={rule} onChange={setRule} />
					{run.branching ? (
						<p className="text-small text-fg-muted">
							This run searched with {RULE_NAME[run.branching]}
							{run.options?.rule ? "" : ", picked by Auto"}.
						</p>
					) : null}
				</Field>
				<Field label={`Threads · ${threads}`}>
					<ThreadsInput value={threads} cores={cores} onChange={setThreads} />
					<p className="text-small text-fg-muted">
						{threadsHint(cores)}
						{run.options && run.options.threads !== threads ? ` This run used ${run.options.threads}.` : ""}
					</p>
				</Field>
				<Checkbox
					label={`Delete “${run.name}” when the new run finishes`}
					checked={replace}
					onCheckedChange={setReplace}
					hint={
						<InfoDot>
							{finding
								? "Only once it finishes: stopped or failed, the old run stays."
								: `Only once it finishes: stopped or failed, the old run stays. The new run covers k ${run.kmin}${again ? `–${run.kmax}, as this one did` : " upward"}, so it holds every tiling this one has.`}
						</InfoDot>
					}
				/>
				{error || problem ? <p className="text-danger">{error || problem}</p> : null}
			</div>
		</Modal>
	);
}

export function DeleteModal({
	target,
	runs,
	onClose,
	onDeleted,
	what = "folder",
}: {
	/** One path, or several picked together (`what` then names them all: "2 folders and 3 runs"). */
	target: string | string[] | null;
	runs: Run[];
	onClose: () => void;
	onDeleted: () => void;
	/** What the folder is, for the title: a study is a folder of runs. */
	what?: string;
}) {
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const targets = target === null ? [] : [target].flat();
	if (!targets.length) return null;
	const one = targets.length === 1 ? targets[0] : null;
	const run = runs.find((r) => r.dir === one);
	const inside = runs.filter((r) => targets.some((t) => isWithin(r.dir, t)));
	const tilings = inside.reduce((t, r) => t + r.total, 0);
	const size = inside.reduce((t, r) => t + r.files.reduce((u, f) => u + f.bytes, 0), 0);
	const name = run ? run.name : baseOf(one ?? "");
	// the folder holding every target, which the list of several names them from
	let base = parentOf(targets[0]);
	while (base && !targets.every((t) => isWithin(t, base) && t !== base)) base = parentOf(base);
	return (
		<Modal
			open
			onOpenChange={(o) => !o && (setError(""), onClose())}
			title={
				run
					? `Delete the run “${name}”?`
					: one
						? `Delete the ${what} “${name.replace(STAMP_SUFFIX, "")}”?`
						: `Delete ${what}?`
			}
			size="sm"
			description="Deleting removes the folder from the disk for good"
			footer={
				<div className="flex justify-end gap-2">
					<Button label="Cancel" onClick={onClose} />
					<Button
						variant="danger"
						icon={Trash2}
						label={busy ? "Deleting…" : "Delete for good"}
						disabled={busy}
						// one after another, stopping at the first that fails
						onClick={async () => {
							setBusy(true);
							for (const t of targets) {
								const res = await api().remove(t);
								if (res.error) return setBusy(false), setError(one ? res.error : `${baseOf(t)}: ${res.error}`);
							}
							setBusy(false);
							setError("");
							onDeleted();
						}}
					/>
				</div>
			}
		>
			<div className="space-y-3 p-5 text-body text-fg-secondary">
				{one ? (
					<p>
						This deletes <span className="font-mono text-small break-all text-fg">{one}</span>
						{run
							? ` with its ${n(run.total)} tilings in ${n(run.files.length)} certificate files (${bytes(size)}), its board and its log.`
							: inside.length
								? ` and the ${inside.length === 1 ? "run" : `${n(inside.length)} runs`} in it: ${n(tilings)} tilings in ${bytes(size)} of certificate files.`
								: ", which holds no runs."}
					</p>
				) : (
					<>
						<p>
							This deletes the {what} below from <span className="font-mono text-small break-all text-fg">{base}</span>
							{/* the runs they hold, counted when the picks are not all runs themselves */}
							{inside.length
								? `${inside.length > targets.filter((t) => runs.some((r) => r.dir === t)).length ? `, ${n(inside.length)} runs in all` : ""}: ${n(tilings)} tilings in ${bytes(size)} of certificate files.`
								: ", which hold no runs."}
						</p>
						<ul className="max-h-40 overflow-y-auto font-mono text-small break-all text-fg">
							{targets.map((t) => (
								<li key={t}>{base ? t.slice(base.length + 1) : t}</li>
							))}
						</ul>
					</>
				)}
				<p className="font-medium text-fg">It does not go to the Trash, and it cannot be undone.</p>
				{error ? <p className="text-danger">{error}</p> : null}
			</div>
		</Modal>
	);
}

/** What a dragged entry carries: the paths it moves, as JSON. */
const DRAG = "text/x-tilesearch";

/**
 * The output folder as a tree: folders, then runs, newest first. Drag a run or a folder onto a folder to move it.
 * Cmd-click and Shift-click pick several, which then move together and share one right-click menu.
 */
export function RunList({
	status,
	options,
	selected,
	onSelect,
}: {
	status: Status;
	/** The threads and priority a run resumed from a folder's Start gets. */
	options: RunOptions;
	selected: string | null;
	onSelect: (id: string | null) => void;
}) {
	// a study's rows and folders stay inside it: the list shows the study as one entry, its page shows its rows
	const inStudy = (p: string) => status.studies.some((x) => isWithin(p, x.dir));
	const allRuns = status.runs.filter((r) => !inStudy(r.dir));
	const allFolders = status.folders.filter((f) => !inStudy(f));
	// a study's row picked: its study is the entry the list marks
	const studyOf = (id: string | null) => status.studies.find((x) => id !== null && isWithin(id, x.dir));
	const entry = studyOf(selected)?.dir ?? selected;
	const fullRuns = status.runs;
	status = { ...status, runs: allRuns, folders: allFolders };
	// the folders shown open, by section: none at first, and kept across pages and launches (a folder saved
	// without its section, as before 4 November, opens in each)
	const [opened, setOpened] = useState<Set<string>>(
		() =>
			new Set(
				[...(loadSet(OPEN_FOLDERS) ?? [])].flatMap((x) =>
					SECTIONS.some((s) => x.startsWith(`${s.key} `)) ? [x] : SECTIONS.map((s) => at(s.key, x)),
				),
			),
	);
	useEffect(() => store(OPEN_FOLDERS, JSON.stringify([...opened])), [opened]);
	// finished runs opened since they finished: the open one joins once finished, and a run that goes again
	// leaves, so its next finish shows as new. The first time, every run already finished counts as opened.
	const [inspected, setInspected] = useState(() => loadSet(INSPECTED));
	useEffect(() => void (inspected && store(INSPECTED, JSON.stringify([...inspected]))), [inspected]);
	if (status.runs.length) {
		const next = new Set(inspected ?? status.runs.filter((r) => r.state === "finished").map((r) => r.id));
		for (const r of status.runs) {
			if (r.state !== "finished") next.delete(r.id);
			else if (r.id === selected) next.add(r.id);
		}
		if (!inspected || next.size !== inspected.size || [...next].some((x) => !inspected.has(x))) setInspected(next);
	}
	// a rename or a move changes the folders the marks are kept by
	const carry = (from: string, to: string) =>
		setInspected((s) => s && new Set([...s].map((x) => (isWithin(x, from) ? to + x.slice(from.length) : x))));
	// a run picked inside closed folders (one just started there, say) opens them, or it would be out of sight;
	// only on a new pick, so coming back to this page keeps the folders as they were left
	const [seen, setSeen] = useState(selected);
	const [closed, setClosed] = useState<Set<string>>(() => loadSet(CLOSED_SECTIONS) ?? new Set());
	useEffect(() => store(CLOSED_SECTIONS, JSON.stringify([...closed])), [closed]);
	const [creating, setCreating] = useState<string | null>(null);
	// A folder shows in a section when it holds one of the section's runs; the home section also shows the
	// folders holding no run at all and the folders a new folder is being made in.
	const studiesIn = (s: Section, folder: string) =>
		status.studies.filter((x) => studySection(x) === s.key && parentOf(x.dir) === folder);
	const shows = (s: Section, f: string) =>
		status.runs.some((r) => s.keep(r) && isWithin(r.dir, f)) ||
		status.studies.some((x) => studySection(x) === s.key && isWithin(x.dir, f)) ||
		(s.key === HOME && (!status.runs.some((r) => isWithin(r.dir, f)) || (creating !== null && isWithin(creating, f))));
	const foldersIn = (s: Section, folder: string) => status.folders.filter((f) => parentOf(f) === folder && shows(s, f));
	const [order, setOrder] = useState<Order>(() => ORDERS.find((o) => o.key === load(RUN_ORDER))?.key ?? "name");
	useEffect(() => store(RUN_ORDER, order), [order]);
	const runsIn = (s: Section, folder: string) =>
		status.runs.filter((r) => s.keep(r) && parentOf(r.dir) === folder).sort(byOrder(order));
	// The highlighted path to the selected run, as the rail pieces it is drawn with, top to bottom: in each
	// folder below the top level, "pass" for the entries above the one it enters and "on" for that entry,
	// each tagged with the run's section.
	const pathTo = (sel: string | null) => {
		const pieces: string[] = [];
		const run = status.runs.find((r) => r.id === sel);
		const study = status.studies.find((x) => x.id === sel);
		if (!sel || (!run && !study)) return pieces;
		const s = run ? sectionOf(run) : SECTIONS.find((x) => x.key === studySection(study!))!;
		for (let folder = status.root, depth = 0; folder !== sel; depth++) {
			const entries = [
				...foldersIn(s, folder),
				...studiesIn(s, folder).map((x) => x.dir),
				...runsIn(s, folder).map((r) => r.dir),
			];
			const on = entries.findIndex((e) => isWithin(sel, e));
			if (on < 0) break;
			if (depth) pieces.push(...entries.slice(0, on).map((e) => `pass ${s.key} ${e}`), `on ${s.key} ${entries[on]}`);
			folder = entries[on];
		}
		return pieces;
	};
	// The entries picked for a bulk action or a drag, by path, and the one a Shift-click counts from (by section,
	// as in `opened`). Opening an entry outside the picks makes it the only pick. None open keeps the picks: a moved
	// entry is briefly none until the status that has its new path arrives.
	const [picked, setPicked] = useState<Set<string>>(() => new Set(entry ? [entry] : []));
	const [anchor, setAnchor] = useState<string | null>(null);
	// On a new pick only what changed is drawn: from the first piece where the new path leaves the old one.
	const [from, setFrom] = useState(0);
	if (seen !== entry) {
		if (entry && !picked.has(entry)) setPicked(new Set([entry]));
		const [was, now] = [pathTo(seen), pathTo(entry)];
		let i = 0;
		while (i < now.length && was[i] === now[i]) i++;
		setFrom(i);
		setSeen(entry);
		const run = status.runs.find((r) => r.id === entry);
		const st = status.studies.find((x) => x.id === entry);
		const key = run ? sectionOf(run).key : st ? studySection(st) : null;
		const up = key
			? status.folders.filter((f) => isWithin(entry!, f) && !opened.has(at(key, f))).map((f) => at(key, f))
			: [];
		if (up.length) setOpened(new Set([...opened, ...up]));
		if (key && closed.has(key)) setClosed(new Set([...closed].filter((x) => x !== key)));
		setAnchor(key && at(key, entry!));
	}
	// what is being renamed, and in which section: a folder can show in more than one
	const [renaming, setRenaming] = useState<{ section: string; path: string } | null>(null);
	const isRenaming = (s: Section, p: string) => renaming?.section === s.key && renaming.path === p;
	const [deleting, setDeleting] = useState<string | string[] | null>(null);
	const [over, setOver] = useState<string | null>(null);
	const [error, setError] = useState("");
	const countIn = (s: Section, f: string) =>
		status.runs.filter((r) => s.keep(r) && isWithin(r.dir, f)).length +
		status.studies.filter((x) => studySection(x) === s.key && isWithin(x.dir, f)).length;

	// the picks still on disk with none inside another: what a bulk action or a drag takes
	const kindOf = (p: string) =>
		status.folders.includes(p)
			? "folder"
			: status.studies.some((x) => x.dir === p)
				? "study"
				: status.runs.some((r) => r.dir === p)
					? "run"
					: null;
	const tops = [...picked].filter((p) => kindOf(p) && ![...picked].some((q) => q !== p && isWithin(p, q)));
	const many = tops.length > 1;
	const kinds = (ps: string[]) =>
		tally([
			[ps.filter((p) => kindOf(p) === "folder").length, "folder", "folders"],
			[ps.filter((p) => kindOf(p) === "study").length, "study", "studies"],
			[ps.filter((p) => kindOf(p) === "run").length, "run", "runs"],
		]);
	// a right-click on any of several picks acts on them all, as a folder's menu does on what it holds
	const bulk: ContextMenuItem[] = [];
	if (many) {
		const under = <T extends { dir: string }>(xs: T[]) => xs.filter((x) => tops.some((t) => isWithin(x.dir, t)));
		const going = under(fullRuns).some((r) => r.state === "running");
		bulk.push(...goAllItems(under(status.runs), under(status.studies), options, setError));
		bulk.push(...packAllItems(under(status.runs), setError));
		bulk.push({
			icon: Trash2,
			label: going ? "Delete: stop the searches going first" : `Delete ${kinds(tops)}`,
			danger: true,
			disabled: going,
			onSelect: () => setDeleting(tops),
		});
	}
	// The entries as shown, top to bottom, by section: a Shift-click picks the stretch between two of them.
	const shown = () => {
		const walk = (sec: Section, folder: string): string[] => [
			...foldersIn(sec, folder).flatMap((f) => [f, ...(opened.has(at(sec.key, f)) ? walk(sec, f) : [])]),
			...studiesIn(sec, folder).map((x) => x.dir),
			...runsIn(sec, folder).map((r) => r.dir),
		];
		return SECTIONS.filter((s) => !closed.has(s.key)).flatMap((s) => walk(s, status.root).map((p) => at(s.key, p)));
	};
	/** A click on an entry: with Shift, the stretch from the last one clicked; with Cmd (Ctrl off the Mac, where
	 *  Ctrl-click is the right-click) it joins the picks or leaves them; plain, it is the only pick and opens. */
	const pick = (e: React.MouseEvent, sec: Section, p: string, open: () => void) => {
		const key = at(sec.key, p);
		if (e.shiftKey && anchor) {
			const keys = shown();
			const [i, j] = [keys.indexOf(anchor), keys.indexOf(key)];
			if (i >= 0 && j >= 0)
				return setPicked(new Set(keys.slice(Math.min(i, j), Math.max(i, j) + 1).map((k) => k.slice(k.indexOf(" ") + 1))));
		}
		setAnchor(key);
		if (e.metaKey || e.ctrlKey)
			return setPicked(new Set(picked.has(p) ? [...picked].filter((x) => x !== p) : [...picked, p]));
		setPicked(new Set([p]));
		open();
	};
	// A picked row wears the selected surface, and fades while the picks travel under the pointer.
	const [dragging, setDragging] = useState(false);
	const fade = useRef(0);
	const settle = () => (clearTimeout(fade.current), setDragging(false));
	const shade = (p: string) =>
		cn(many && picked.has(p) && "ta-tab-on rounded-control", dragging && picked.has(p) && "opacity-50");
	const ghost = useRef<HTMLDivElement>(null);
	const ghostRow = useRef<HTMLDivElement>(null);

	// drop target props: what is dragged here (one entry, or every pick) moves into `folder`
	const drop = (folder: string) => ({
		onDragOver: (e: React.DragEvent) => {
			if (!e.dataTransfer.types.includes(DRAG)) return;
			e.preventDefault();
			e.stopPropagation();
			setOver(folder);
		},
		onDragLeave: () => setOver((o) => (o === folder ? null : o)),
		onDrop: async (e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setOver(null);
			settle();
			const paths = (JSON.parse(e.dataTransfer.getData(DRAG) || "[]") as string[]).filter((p) => parentOf(p) !== folder);
			// one after another, stopping at the first that fails; the picks and the open entry follow
			const moves: [string, string][] = [];
			let failed = "";
			for (const p of paths) {
				const res = await api().move(p, folder);
				if ("error" in res) {
					failed = paths.length > 1 ? `${baseOf(p)}: ${res.error}` : res.error;
					break;
				}
				carry(p, res.path);
				moves.push([p, res.path]);
			}
			setError(failed);
			const to = (x: string) => {
				const m = moves.find(([a]) => isWithin(x, a));
				return m ? m[1] + x.slice(m[0].length) : x;
			};
			if (moves.length) setPicked((s) => new Set([...s].map(to)));
			if (selected && to(selected) !== selected) onSelect(to(selected));
		},
	});
	const drag = (p: string) => ({
		draggable: true,
		onDragStart: (e: React.DragEvent<HTMLElement>) => {
			const all = many && picked.has(p);
			e.dataTransfer.setData(DRAG, JSON.stringify(all ? tops : [p]));
			e.dataTransfer.effectAllowed = "move";
			if (!all || !ghost.current || !ghostRow.current) return;
			// the picks travel as one: the row under the pointer, stacked, with their count on it
			const row = e.currentTarget;
			const box = row.getBoundingClientRect();
			ghostRow.current.replaceChildren(row.cloneNode(true));
			ghostRow.current.style.width = `${box.width}px`;
			const [inner, outer] = [ghostRow.current, ghost.current].map((x) => x.getBoundingClientRect());
			e.dataTransfer.setDragImage(
				ghost.current,
				e.clientX - box.left + inner.left - outer.left,
				e.clientY - box.top + inner.top - outer.top,
			);
			// after the drag has begun: a change to the dragged row inside dragstart ends the drag in Chromium
			fade.current = window.setTimeout(() => setDragging(true));
		},
		onDragEnd: settle,
	});
	const rename = async (p: string, name: string) => {
		const res = await api().rename(p, name);
		if ("error" in res) return res.error;
		carry(p, res.path);
		if (selected === p) onSelect(res.path);
		return null;
	};
	const newFolder = (parent: string) =>
		creating === parent ? (
			<li className="flex items-center gap-2 py-1 pr-2 pl-2">
				<FolderPlus className="size-icon-md shrink-0 text-fg-muted" />
				<NameField
					initial="New folder"
					save={async (name) => {
						const res = await api().mkdir(parent, name);
						return "error" in res ? res.error : null;
					}}
					done={() => setCreating(null)}
				/>
			</li>
		) : null;

	const path = new Map(pathTo(entry).map((piece, i) => [piece, i]));
	const mark = (sec: Section, entry: string) => {
		for (const role of ["on", "pass"]) {
			const i = path.get(`${role} ${sec.key} ${entry}`);
			if (i !== undefined)
				return {
					[`data-rail-${role}`]: "",
					style: { "--rail-delay": `${Math.max(0, i - from) * STEP_MS}ms` } as React.CSSProperties,
				};
		}
		return {};
	};
	const level = (sec: Section, folder: string): React.ReactNode => {
		const folders = foldersIn(sec, folder);
		const runs = runsIn(sec, folder);
		return (
			<>
				{sec.key === HOME ? newFolder(folder) : null}
				{folders.map((f) => {
					const k = at(sec.key, f);
					const open = opened.has(k);
					const toggle = () => setOpened(open ? new Set([...opened].filter((x) => x !== k)) : new Set([...opened, k]));
					return (
						<li key={f} {...drop(f)} {...mark(sec, f)}>
							<ContextMenu
								{...drag(f)}
								items={many && picked.has(f) ? bulk : [
									...goAllItems(
										status.runs.filter((r) => isWithin(r.dir, f)),
										status.studies.filter((x) => isWithin(x.dir, f)),
										options,
										setError,
									),
									{
										icon: FolderPlus,
										label: "New folder inside",
										// the new folder's name is typed in the home section: open the way there
										onSelect: () => {
											setOpened(
												new Set([...opened, ...status.folders.filter((g) => isWithin(f, g)).map((g) => at(HOME, g))]),
											);
											setCreating(f);
										},
									},
									{ icon: Pencil, label: "Rename", onSelect: () => setRenaming({ section: sec.key, path: f }) },
									...packAllItems(
										status.runs.filter((r) => isWithin(r.dir, f)),
										setError,
									),
									{ icon: Trash2, label: "Delete", onSelect: () => setDeleting(f), danger: true },
								]}
								className={cn(
									"flex h-9 items-center rounded-control transition-colors",
									over === f && "bg-accent/15 ring-1 ring-accent",
									shade(f),
								)}
							>
								{isRenaming(sec, f) ? (
									<span className="flex w-full items-center gap-1.5 pr-1 pl-2">
										<Folder className="size-icon-md shrink-0 text-fg-secondary" />
										<NameField initial={baseOf(f)} save={(name) => rename(f, name)} done={() => setRenaming(null)} />
									</span>
								) : (
									// one hover target: the name, the count (shown on hover) and the chevron
									<button
										type="button"
										onClick={(e) => pick(e, sec, f, toggle)}
										className="group flex h-full w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-control pr-2 pl-2 text-left"
										aria-expanded={open}
									>
										<Folder className="size-icon-md shrink-0 text-fg-secondary" />
										<span className="min-w-0 flex-1 truncate text-body font-medium text-fg">{baseOf(f)}</span>
										<span className="font-mono text-caption text-fg-muted tabular-nums opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
											{countIn(sec, f)}
										</span>
										<FoldChevron open={open} size={14} />
									</button>
								)}
							</ContextMenu>
							{/* the rail: a folder's contents hang off a line under its icon (app.css .ta-rail) */}
							{open ? <ul className="ta-tree-reveal ta-rail mt-0.5">{level(sec, f)}</ul> : null}
						</li>
					);
				})}
				{studiesIn(sec, folder).map((x) => (
					<li key={x.id} className="[--rail-mid:26px]" {...mark(sec, x.dir)}>
						<ContextMenu
							{...drag(x.dir)}
							className={shade(x.dir)}
							items={many && picked.has(x.dir) ? bulk : [
								...(x.state === "running" || x.state === "checking"
									? []
									: [
											{ icon: Pencil, label: "Rename", onSelect: () => setRenaming({ section: sec.key, path: x.dir }) },
										]),
								{ icon: FolderOpen, label: "Show folder", onSelect: () => void api().reveal(x.dir) },
								...(x.state === "running" || x.state === "checking"
									? []
									: [{ icon: Trash2, label: "Delete", onSelect: () => setDeleting(x.dir), danger: true }]),
							]}
						>
							{isRenaming(sec, x.dir) ? (
								<span className="flex items-center py-2 pr-1 pl-1">
									<NameField
										initial={x.name}
										suffix={baseOf(x.dir).slice(x.name.length)}
										save={(name) => rename(x.dir, name)}
										done={() => setRenaming(null)}
									/>
								</span>
							) : (
								<StudyEntry study={x} selected={entry === x.id} onClick={(e) => pick(e, sec, x.dir, () => onSelect(x.id))} />
							)}
						</ContextMenu>
					</li>
				))}
				{runs.map((r) => (
					<li key={r.id} className="[--rail-mid:26px]" {...mark(sec, r.dir)}>
						<ContextMenu
							{...drag(r.dir)}
							className={shade(r.dir)}
							items={many && picked.has(r.dir) ? bulk : [
								...(r.state === "running"
									? []
									: [
											{ icon: Pencil, label: "Rename", onSelect: () => setRenaming({ section: sec.key, path: r.dir }) },
										]),
								{ icon: FolderOpen, label: "Show folder", onSelect: () => void api().reveal(r.dir) },
								...packItems(r, setError),
								...(r.state === "running"
									? []
									: [{ icon: Trash2, label: "Delete", onSelect: () => setDeleting(r.dir), danger: true }]),
							]}
						>
							{isRenaming(sec, r.dir) ? (
								<span className="flex items-center py-2 pr-1 pl-1">
									<NameField
										initial={r.name}
										suffix={baseOf(r.dir).slice(r.name.length)}
										save={(name) => rename(r.dir, name)}
										done={() => setRenaming(null)}
									/>
								</span>
							) : (
								<button
									type="button"
									onClick={(e) => pick(e, sec, r.dir, () => onSelect(r.id))}
									aria-current={selected === r.id || undefined}
									className="relative isolate flex w-full cursor-pointer items-center gap-3 rounded-control py-2 pr-3 pl-3 text-left"
								>
									{selected === r.id ? <OpenFill /> : null}
									{/* the run's state in one colour; a find run (existence, not a count) wears a telescope for its dot */}
									{(() => {
										// [dot, telescope] for the run's state, written out so Tailwind sees every class
										const [dot, ink] = r.queued
											? ["border border-fg-muted", "text-fg-muted"]
											: r.state === "running"
												? ["animate-pulse bg-accent", "animate-pulse text-fg-accent"]
												: r.state === "failed"
													? ["bg-danger", "text-danger"]
													: r.state === "finished"
														? inspected?.has(r.id)
															? ["bg-fg", "text-fg"]
															: ["animate-pulse bg-signal-positive", "animate-pulse text-signal-positive"]
														: ["bg-signal-attention", "text-signal-attention"];
										return r.options?.find ? (
											<Telescope className={cn("size-icon-md", "-mx-1 shrink-0", ink)} aria-label="Existence search"/>
										) : (
											<span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
										);
									})()}
									<span className="min-w-0 flex-1">
										<span className="block truncate text-body font-medium text-fg">{r.name}</span>
										<span className="block truncate text-small text-fg-muted">
											{/* ordered by end: the end time, so the night's runs read in the order they ended */}
											{order === "ended" && r.ended
												? `Ended ${when(r.ended)}${r.options?.find ? "" : ` · k ${r.kmin}–${r.kmax}`}`
												: r.options?.find
													? `Existence · ${when(r.created)}`
													: `${when(r.created)} · k ${r.kmin}–${r.kmax}`}
											{r.state === "failed" ? " · failed" : ""}
										</span>
										{r.queued ? (
											<span className="mt-1 block truncate text-small text-fg-secondary">
												{r.queued === 1 ? "Queued: next to start" : `Queued: #${r.queued}`}
											</span>
										) : r.state === "running" || r.state === "stopped" ? (
											<Progress run={r} />
										) : null}
									</span>
									<PackMark run={r} />
									{r.options?.find ? (
										<FindMark run={r} />
									) : (
										<span className="font-mono text-small text-fg-secondary tabular-nums">{n(r.total)}</span>
									)}
								</button>
							)}
						</ContextMenu>
					</li>
				))}
			</>
		);
	};

	return (
		<div {...drop(status.root)} className={cn("flex min-h-full flex-col", over === status.root && "bg-accent/5")}>
			<div className="flex items-center justify-between gap-2 px-5 pt-4 pb-1">
				<span className="ta-label flex-1">Runs in the output folder</span>
				<ActionMenu
					label="Order the runs"
					trigger={
						<Button
							size="icon"
							variant="ghost"
							icon={ArrowDownUp}
							aria-label={`Order the runs: ${ORDERS.find((o) => o.key === order)!.label.toLowerCase()}`}
						/>
					}
					items={ORDERS.map((o) => ({
						label: o.label,
						icon: o.key === order ? Check : undefined,
						onSelect: () => setOrder(o.key),
					}))}
				/>
				{status.folders.length ? (
					<Tooltip label={opened.size ? "Collapse all folders" : "Expand all folders"}>
						<Button
							size="icon"
							variant="ghost"
							icon={opened.size ? ChevronsDownUp : ChevronsUpDown}
							aria-label={opened.size ? "Collapse all" : "Expand all"}
							onClick={() =>
								setOpened(new Set(opened.size ? [] : SECTIONS.flatMap((s) => status.folders.map((f) => at(s.key, f)))))
							}
						/>
					</Tooltip>
				) : null}
				<Tooltip label={`Output folder: ${status.root}. Change it…`}>
					<Button
						size="icon"
						variant="ghost"
						icon={HardDrive}
						aria-label="Change the output folder"
						onClick={() => void api().chooseRoot()}
					/>
				</Tooltip>
				<Tooltip label="New folder">
					<Button
						size="icon"
						variant="ghost"
						icon={FolderPlus}
						aria-label="New folder"
						onClick={() => setCreating(status.root)}
					/>
				</Tooltip>
			</div>
			{error ? <p className="px-5 py-1 text-small text-danger">{error}</p> : null}
			{status.runs.length || status.folders.length || status.studies.length || creating ? (
				<ul
					className="relative mx-2 my-2 space-y-0.5"
					// a Shift-click picks rows, it does not select their text; Escape lets go of the picks
					onMouseDown={(e) => e.shiftKey && e.preventDefault()}
					onKeyDown={(e) => e.key === "Escape" && many && setPicked(new Set(entry ? [entry] : []))}
				>
					{/* the atlas's gliding hover (design-system/components/hover-pill.tsx), over every row in the tree */}
					<HoverPill />
					{SECTIONS.map((sec) => {
						const count =
							status.runs.filter(sec.keep).length + status.studies.filter((x) => studySection(x) === sec.key).length;
						if (!count && !(sec.key === HOME && (foldersIn(sec, status.root).length || creating))) return null;
						const open = !closed.has(sec.key);
						return (
							<li key={sec.key} className="pt-1">
								<button
									type="button"
									onClick={() =>
										setClosed(open ? new Set([...closed, sec.key]) : new Set([...closed].filter((x) => x !== sec.key)))
									}
									aria-expanded={open}
									className="flex w-full cursor-pointer items-center gap-1.5 rounded-control px-2 py-1 text-left"
								>
									<FoldChevron open={open} />
									<span className="ta-label flex-1">{sec.label}</span>
									<span className="font-mono text-caption text-fg-muted tabular-nums">{count}</span>
								</button>
								{open ? <ul className="mt-0.5 space-y-0.5">{level(sec, status.root)}</ul> : null}
							</li>
						);
					})}
				</ul>
			) : (
				<p className="px-5 py-6 text-body text-fg-muted">No runs yet. Build a board and press Run search.</p>
			)}
			{/* what a drag of several picks shows under the pointer, kept off screen (drag, above) */}
			{many ? (
				<div ref={ghost} aria-hidden className="pointer-events-none fixed top-0 left-0 -translate-x-full p-2">
					<div className="relative">
						<div className="absolute inset-0 translate-x-1 translate-y-1 rounded-control bg-surface-raised shadow-raised" />
						<div ref={ghostRow} className="relative rounded-control bg-surface-raised shadow-lift" />
						<Badge tone="solid" mono className="absolute -top-2 -right-2">
							{n(tops.length)}
						</Badge>
					</div>
				</div>
			) : null}
			<DeleteModal
				target={deleting}
				runs={fullRuns}
				onClose={() => setDeleting(null)}
				onDeleted={() => {
					if (selected && [deleting ?? []].flat().some((d) => isWithin(selected, d))) onSelect(null);
					setDeleting(null);
					setPicked(new Set());
				}}
				what={
					Array.isArray(deleting)
						? kinds(deleting)
						: deleting && status.studies.some((x) => x.dir === deleting)
							? "study"
							: undefined
				}
			/>
		</div>
	);
}

/** The entry open on the right: the lifted surface of a selected segment (.ta-tab-on), one element for the
 *  whole list, so opening another entry glides it there as the header's pill glides between links. The
 *  tree's HoverPill gives every other row its hover. */
const OpenFill = () => <NavActivePill id="run-list-open" className="ta-tab-on -z-10" />;

/** A study in the run list: its state as an icon, its rows, and how far it has come. */

function StudyEntry({
	study: x,
	selected,
	onClick,
}: {
	study: StudySummary;
	selected: boolean;
	onClick: (e: React.MouseEvent) => void;
}) {
	const going = x.state === "running" || x.state === "checking";
	const done = studyDone(x);
	const share = x.state === "checking" ? x.checked / Math.max(1, x.rowCount) : done / Math.max(1, x.rowCount);
	const found = x.tally.found ?? 0;
	return (
		<button
			type="button"
			onClick={onClick}
			aria-current={selected || undefined}
			className="relative isolate flex w-full cursor-pointer items-center gap-3 rounded-control py-2 pr-3 pl-3 text-left"
		>
			{selected ? <OpenFill /> : null}
			<Rows3
				className={cn("size-icon-md", 
					"-mx-1 shrink-0",
					going ?"animate-pulse text-fg-accent": x.state === "paused" ? "text-signal-attention" : "text-fg",
				)}
				aria-label="Study"
			/>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-body font-medium text-fg">{x.name}</span>
				<span className="block truncate text-small text-fg-muted">
					Study · {n(x.rowCount)} row{x.rowCount === 1 ? "" : "s"} · k {x.kmin}–{x.kmax}
				</span>
				{x.state !== "done" ? (
					<span className="mt-1 flex items-center gap-2 text-small text-fg-secondary tabular-nums">
						<span className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-surface-sunken">
							<span className="block h-full bg-accent" style={{ width: `${share * 100}%` }} />
						</span>
						<span className="truncate">
							{x.state === "checking"
								? `checked ${n(x.checked)} of ${n(x.rowCount)}`
								: `${n(done)} of ${n(x.rowCount)} rows done`}
						</span>
					</span>
				) : null}
			</span>
			<Tooltip label={`${n(found)} row${found === 1 ? "" : "s"} with tilings`}>
				<span className="flex items-center gap-1 font-mono text-small text-fg-secondary tabular-nums">
					<Check className="size-icon-sm text-success" />
					{n(found)}
				</span>
			</Tooltip>
		</button>
	);
}

/**
 * The finished run a run replaces (Raise k, a raise rule) while it has not finished itself: by its path, or, after
 * the folder they share was moved or renamed, by its name beside it. That run stays on disk until this one finishes.
 */
export function earlierOf(run: Run, runs: Run[]): Run | undefined {
	if (!run.replaces || run.state === "finished") return undefined;
	const beside = `${splitPath(run.dir)[0]}/${splitPath(run.replaces)[1]}`;
	const prev = runs.find((r) => r.dir === run.replaces) ?? runs.find((r) => splitPath(r.dir).join("/") === beside);
	return prev?.state === "finished" ? prev : undefined;
}

/** A run as its page shows it: with `prev` (earlierOf), what that run found, which covers every k up to its own,
 *  and this run's tilings only above that k. */
export function withEarlier(run: Run, prev: Run | undefined): Run {
	if (!prev) return run;
	const counts = { ...prev.counts };
	for (const [k, c] of Object.entries(run.counts)) if (+k > prev.kmax) counts[+k] = c;
	const files = [
		...prev.files.map((f) => ({ ...f, symbols: prev.symbols })),
		...run.files.filter((f) => f.k > prev.kmax).map((f) => ({ ...f, symbols: run.symbols })),
	];
	return { ...run, counts, files, total: Object.values(counts).reduce((t, c) => t + c, 0) };
}

export function RunView({
	run,
	status,
	options,
	cores,
	onEdit,
	onSelect,
}: {
	run: Run;
	status: Status;
	options: RunOptions;
	cores: number;
	onEdit: (board: string) => void;
	onSelect: (id: string | null) => void;
}) {
	const [tab, setTab] = useState("Tilings");
	const [deleting, setDeleting] = useState(false);
	// Raise k or Run again (the same k): both open the same modal
	const [improving, setImproving] = useState<"improve" | "again" | null>(null);
	const [group, setGroup] = useState<Group | null>(null);
	const [error, setError] = useState("");
	const running = run.state === "running";
	const finding = !!run.options?.find;
	// what it found, with the tilings of the run it replaces until it finishes (withEarlier)
	const earlier = earlierOf(run, status.runs);
	const seen = withEarlier(run, earlier);
	const shown = resolveGroup(seen, group);
	const shownK = shown && shown.k !== "all" ? shown.k : null;
	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
			<div className="flex flex-wrap items-start gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h1 className="truncate text-heading font-semibold text-fg">{run.name}</h1>
						<Badge tone={TONE[run.state]}>{stateLabel(run)}</Badge>
						{run.stats ? (
							<InfoDot side="bottom" label="What the engine reported">
								{run.stats}
							</InfoDot>
						) : null}
					</div>
					{(run.note && run.state !== "finished") || error ? (
						<p className={cn("mt-1.5 text-body", run.state === "failed" || error ? "text-danger" : "text-fg-secondary")}>
							{error || run.note}
						</p>
					) : null}
					{earlier ? (
						<p className="mt-1.5 flex items-center gap-2 text-body text-fg-secondary">
							<History className="size-icon-md shrink-0 text-fg-muted" />
							<span className="min-w-0">
								Until it finishes, this shows what the search before it found, every k up to {earlier.kmax}
								{Object.keys(seen.counts).some((k) => +k > earlier.kmax) ? ", and its own tilings above" : ""}.
							</span>
							<Button
								size="sm"
								variant="ghost"
								className="shrink-0"
								label="Open that search"
								onClick={() => onSelect(earlier.id)}
							/>
						</p>
					) : null}
					{run.options?.raise && !finding && !run.capped ? (
						<p className="mt-1.5 flex items-center gap-2 text-body text-fg-secondary">
							<ChevronsUp className="size-icon-md shrink-0 text-fg-accent" />
							<span className="min-w-0">
								{run.raised
									? `Raised by its rule: the run to k = ${run.kmax + 1} replaces this one when it finishes.`
									: run.state === "finished" && run.note.includes("Stopped raising")
										? run.note.slice(run.note.indexOf("Stopped raising"))
										: `Raises k by itself ${describeRaise(run.options.raise)}.`}
							</span>
							{!run.raised && run.state !== "finished" ? (
								<Button
									size="sm"
									variant="ghost"
									label="Stop raising"
									onClick={() => void api().setRaise(run.id, null)}
								/>
							) : null}
						</p>
					) : null}
				</div>
				<div className="flex gap-2">
					{running ? (
						<Button size="sm" variant="danger" icon={Square} label="Stop" onClick={() => void api().stop(run.id)} />
					) : run.queued ? (
						<Button size="sm" icon={Square} label="Leave the queue" onClick={() => void api().stop(run.id)} />
					) : run.state !== "finished" ? (
						<Button
							size="sm"
							variant="primary"
							icon={Play}
							label="Resume"
							onClick={async () => setError((await api().resume(run.id, resumeOptions(run, options))).error ?? "")}
						/>
					) : null}
					{run.state === "finished" && !finding ? (
						<Button
							size="sm"
							variant="primary"
							icon={ChevronsUp}
							label="Raise k"
							onClick={() => setImproving("improve")}
						/>
					) : null}
					{running ? null : (
						<Button size="sm" icon={RotateCcw} label="Run again" onClick={() => setImproving("again")} />
					)}
					<Button
						size="sm"
						icon={FilePen}
						label="Edit board"
						// under the run's name, which a rename may have changed; a board name is one word
						onClick={() => onEdit(serialize({ ...parse(run.board).board, name: run.name.trim().replace(/\s+/g, "_") }))}
					/>
					<ActionMenu
						label="More actions"
						className="h-8 w-8"
						items={[
							{ label: "Show folder", icon: FolderOpen, onSelect: () => void api().reveal(run.dir) },
							...packItems(run, setError),
							{ label: "Delete run", icon: Trash2, danger: true, disabled: running, onSelect: () => setDeleting(true) },
						]}
					/>
				</div>
			</div>
			{improving ? (
				<ImproveModal
					run={run}
					status={status}
					options={options}
					cores={cores}
					again={improving === "again"}
					onClose={() => setImproving(null)}
					onStarted={onSelect}
				/>
			) : null}
			<DeleteModal
				target={deleting ? run.dir : null}
				runs={status.runs}
				onClose={() => setDeleting(false)}
				onDeleted={() => (setDeleting(false), onSelect(null))}
			/>

			{finding ? (
				<FindOverview run={run} />
			) : (
				<RunOverview
					run={seen}
					k={shownK}
					onPick={(k) => {
						setGroup(groupOfK(seen, k, shown));
						setTab("Tilings");
					}}
				/>
			)}

			{/* the rest of the page: the tilings start on the first screen, and a short window scrolls the page instead */}
			<section className="ta-card flex min-h-[400px] flex-1 flex-col overflow-hidden shadow-raised">
				<Tabs
					value={tab}
					onValueChange={setTab}
					tabs={["Tilings", "Files", "Log", "Board"]}
					listClassName="w-80"
					headClassName="border-b border-line-subtle px-4 py-3"
					aside={
						tab === "Tilings" ? (
							<GroupPicker run={seen} group={group} onGroup={setGroup} />
						) : tab === "Files" ? (
							<span className="text-small text-fg-muted tabular-nums">
								{n(seen.files.length)} files, {bytes(seen.files.reduce((t, f) => t + f.bytes, 0))}
							</span>
						) : tab === "Log" ? (
							run.log.length ? (
								<CopyButton text={run.log.join("\n")} label="copy" />
							) : null
						) : (
							<CopyButton text={run.board} label="copy" />
						)
					}
				>
					{(t) =>
						t === "Tilings" ? (
							<TilingsView run={seen} group={group} />
						) : t === "Files" ? (
							<Files
								run={seen}
								group={group}
								onOpen={(f) => (setGroup({ k: f.k, edges: f.edges, faces: "all" }), setTab("Tilings"))}
							/>
						) : t === "Log" ? (
							<Log lines={run.log} />
						) : (
							<BoardText text={run.board} />
						)
					}
				</Tabs>
			</section>
		</div>
	);
}

/** The certificate files by k, each with its size against the largest; a row opens its tilings. */
function Files({ run, group, onOpen }: { run: Run; group: Group | null; onOpen: (f: OutFile) => void }) {
	// counted while the tab is open: again when the files grow, which they do only while the run is going
	const size = run.files.reduce((t, f) => t + f.bytes, 0);
	useEffect(() => void api().countFiles(run.id), [run.id, size]);
	if (!run.files.length)
		return (
			<div className="flex h-full items-center justify-center p-8 text-body text-fg-muted">
				No certificate files yet: they appear as roots finish.
			</div>
		);
	const g = resolveGroup(run, group);
	// the open group's files; with every k and every edge orbit open, that would be every row
	const open = new Set(g && (g.k !== "all" || g.edges !== "all") ? filesOf(run, g) : []);
	const ks = [...new Set(run.files.map((f) => f.k))];
	return (
		<div className="h-full overflow-auto">
			<table className="w-full text-body">
				<thead className="sticky top-0 z-10 bg-surface-raised">
					<tr className="text-left">
						{["Corners", "Edge orbits", "Orientable", "Tilings", "Size"].map((h, i) => (
							<th
								key={h}
								className={cn(
									"ta-label border-b border-line-subtle py-2.5 font-medium",
									i ? "px-3" : "pr-3 pl-5",
									i === 3 && "text-right",
									i === 4 && "w-[30%]",
								)}
							>
								<span className="inline-flex items-center gap-1.5">
									{h}
									{i === 0 ? (
										<InfoDot side="bottom" label="The highlighted files">
											A blue edge marks the files the Tilings tab is showing: those of the k and edge orbits picked
											there. Click a file to show its tilings.
										</InfoDot>
									) : null}
								</span>
							</th>
						))}
					</tr>
				</thead>
				{ks.map((k) => {
					const fs = run.files.filter((f) => f.k === k);
					const largest = Math.max(1, ...fs.map((f) => f.bytes)); // bars compare the files of one k
					return (
						<tbody key={k}>
							<tr>
								<th
									colSpan={5}
									className="bg-surface-sunken/50 py-1.5 pr-3 pl-5 text-left text-small font-normal text-fg-muted"
								>
									<span className="font-mono font-medium text-fg">k = {k}</span>
									<span className="ml-2 tabular-nums">
										{fs.length} file{fs.length === 1 ? "" : "s"}, {bytes(fs.reduce((t, f) => t + f.bytes, 0))}
										{fs.every((f) => f.tilings !== null)
											? `, ${n(fs.reduce((t, f) => t + f.tilings!, 0))} tilings`
											: ""}
									</span>
								</th>
							</tr>
							{fs.map((f) => {
								const on = open.has(f);
								return (
									<tr
										key={f.name}
										onClick={() => onOpen(f)}
										title={f.name}
										className={cn(
											"cursor-pointer border-b border-line-subtle/60 transition-colors",
											on ? "bg-accent-subtle/60" : "hover:bg-surface-overlay/60",
										)}
									>
										<td
											className={cn(
												// ds-check: keep (the 2px rule plus 18px puts the label on the header's pl-5 column)
												"border-l-2 py-1.5 pr-3 pl-[18px] font-mono text-ui",
												on ? "border-accent" : "border-transparent",
											)}
										>
											{f.labels}
										</td>
										<td className="px-3 py-1.5 font-mono text-ui tabular-nums">{f.edges}</td>
										<td className="px-3 py-1.5 text-fg-secondary">
											{f.orientable ? <Check className="size-icon-sm" aria-label="orientable" /> : null}
										</td>
										<td className="px-3 py-1.5 text-right font-mono text-ui tabular-nums">
											{f.tilings === null ? <span className="text-fg-muted">…</span> : n(f.tilings)}
										</td>
										<td className="px-3 py-1.5">
											<div className="flex items-center gap-3">
												<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
													<div
														className="h-full rounded-full bg-fg/30"
														style={{ width: `${(f.bytes / largest) * 100}%` }}
													/>
												</div>
												<span className="w-16 text-right font-mono text-small text-fg-secondary tabular-nums">
													{bytes(f.bytes)}
												</span>
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					);
				})}
			</table>
		</div>
	);
}

/** The engine's output; it follows new lines while scrolled to the bottom, and holds still otherwise. */
function Log({ lines }: { lines: string[] }) {
	const ref = useRef<HTMLPreElement>(null);
	const stick = useRef(true);
	useLayoutEffect(() => {
		const el = ref.current;
		if (el && stick.current) el.scrollTop = el.scrollHeight;
	}, [lines]);
	return (
		<pre
			ref={ref}
			onScroll={(e) => {
				const el = e.currentTarget;
				stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
			}}
			className="h-full overflow-auto px-5 py-4 font-mono text-small leading-relaxed text-fg-secondary"
		>
			{lines.join("\n") || <span className="text-fg-muted">The engine has written nothing to its log yet.</span>}
		</pre>
	);
}

/** The board the run was started from, numbered, its keywords set back from their values. */
function BoardText({ text }: { text: string }) {
	const lines = text.replace(/\n$/, "").split("\n");
	return (
		<div className="h-full overflow-auto py-4 font-mono text-small leading-relaxed">
			<div className="grid grid-cols-[auto_minmax(0,1fr)]">
				{lines.map((l, i) => {
					const [word, ...rest] = l.split(" ");
					return (
						<Fragment key={i}>
							<span className="pr-4 pl-5 text-right text-fg-muted tabular-nums select-none">{i + 1}</span>
							<span className="pr-5 whitespace-pre-wrap">
								<span className={l.startsWith("#") ? "text-fg-muted" : "text-fg-secondary"}>{word}</span>
								{rest.length ? <span className="text-fg"> {rest.join(" ")}</span> : null}
							</span>
						</Fragment>
					);
				})}
			</div>
		</div>
	);
}
