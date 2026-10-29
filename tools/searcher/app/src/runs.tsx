// The runs: every run folder under the output folder, live progress for the running ones, and per run
// its counts per k, its output files and the certificates in them.
import {
	Check,
	ChevronRight,
	ChevronsDownUp,
	ChevronsUp,
	ChevronsUpDown,
	FilePen,
	Folder,
	FolderOpen,
	FolderPlus,
	Pencil,
	Play,
	RotateCcw,
	Square,
	Trash2,
} from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { ContextMenu } from "@/components/ui/context-menu";
import { Dropdown } from "@/components/ui/dropdown";
import { HoverPill } from "@/components/ui/hover-pill";
import { Input } from "@/components/ui/input";
import { InfoDot } from "@/components/ui/info-dot";
import { Modal } from "@/components/ui/modal";
import { OptionWall } from "@/components/ui/option-wall";
import { Tabs } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import { parse, serialize } from "./board";
import type { OutFile, Rule, Run, RunOptions, Status } from "./bridge";
import { RunOverview } from "./overview";
import { filesOf, GroupPicker, groupOfK, resolveGroup, TilingsView, type Group } from "./tilings";

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

const parentOf = (p: string) => p.replace(/[\\/][^\\/]*$/, "");
const baseOf = (p: string) => p.slice(parentOf(p).length + 1);
/** Whether `p` is `folder` or inside it. */
/** The run tree draws its highlighted path one piece every RAIL_STEP ms (app.css .ta-rail). */
const RAIL_STEP = 70;
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

const TONE = { running: "accent", stopped: "neutral", finished: "success", failed: "danger" } as const;

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
	return (
		<div className="min-w-0 flex-1">
			<div className="flex items-center gap-1.5">
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
				{suffix ? <span className="shrink-0 font-mono text-xs text-fg-muted">{suffix}</span> : null}
			</div>
			{error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
		</div>
	);
}

/** What a delete takes with it: a run, or a folder and every run in it. */
/** Run a run's board again, to a higher k (Improve) or over the same k (`again`), under a name of its
 *  choosing, in a folder of its choosing, and maybe replace it. */
const folderOptions = (status: Status) =>
	[status.root, ...status.folders].map((f) => ({
		value: f,
		label: f === status.root ? "the output folder" : f.slice(status.root.length + 1),
	}));

export const RULE_HINT =
	"Auto measures both rules on small k and keeps the cheaper one, and can guess wrong. Forcing one changes the time, never the tilings.";
/** The branching rule for a run: Auto lets the engine measure and pick, the others force one. */
export function RuleField({ rule, onChange }: { rule?: Rule; onChange: (r: Rule | undefined) => void }) {
	return (
		<OptionWall
			columns={3}
			options={[
				{ value: "auto", label: "Auto" },
				{ value: "fewest", label: "Fewest options" },
				{ value: "face", label: "Face first" },
			]}
			selected={rule ?? "auto"}
			onChange={(v) => onChange(v === "auto" ? undefined : (v as Rule))}
		/>
	);
}

function ImproveModal({
	run,
	status,
	options,
	again = false,
	onClose,
	onStarted,
}: {
	run: Run;
	status: Status;
	options: RunOptions;
	again?: boolean;
	onClose: () => void;
	onStarted: (id: string) => void;
}) {
	const [name, setName] = useState(run.name);
	const [to, setTo] = useState(String(run.kmax + 1));
	// an improved run holds every tiling of the old one, so by default it takes its place
	const [replace, setReplace] = useState(!again);
	// beside the run it improves, unless moved
	const [folder, setFolder] = useState(parentOf(run.dir));
	const [error, setError] = useState("");
	const [rule, setRule] = useState<Rule | undefined>(run.options?.rule);
	const k = again ? run.kmax : Math.round(Number(to));
	const ok = Number.isFinite(k) && (again || (k > run.kmax && k <= 64)) && !!name.trim();
	const start = async () => {
		// from the same lowest k, so the new run holds every tiling the old one did
		const res = await api().start(
			run.board,
			name.trim(),
			{ ...options, k: [run.kmin, k], ...(rule ? { rule } : {}) },
			replace ? run.dir : undefined,
			folder,
		);
		if ("error" in res) return setError(res.error);
		onStarted(res.id);
		onClose();
	};
	return (
		<Modal
			isOpen
			onOpenChange={(o) => !o && onClose()}
			title={again ? `Run “${run.name}” again` : `Improve “${run.name}”`}
			size="md"
			description={again ? "Run the same board over the same k" : "Run the same board again to a higher k"}
			footer={
				<div className="flex justify-end gap-2">
					<Button label="Cancel" onClick={onClose} />
					<Button
						variant="primary"
						icon={Play}
						label={`Run k ${run.kmin}–${ok ? k : "?"}`}
						disabled={!ok}
						onClick={start}
					/>
				</div>
			}
		>
			<div className="space-y-4 p-5 text-sm">
				<label className="block space-y-1.5">
					<span className="ta-label">Name</span>
					<Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Run name" />
				</label>
				<label className="block space-y-1.5">
					<span className="ta-label">Folder</span>
					<Dropdown
						value={folder}
						options={folderOptions(status)}
						onChange={setFolder}
						className="w-full"
						ariaLabel="Folder for the new run"
					/>
				</label>
				<div className={cn("space-y-1.5", again && "hidden")}>
					<span className="ta-label">k</span>
					<div className="flex items-center gap-2">
						<span className="text-fg-secondary">from {run.kmin} to</span>
						<Input
							type="number"
							min={run.kmax + 1}
							max={64}
							value={to}
							onChange={(e) => setTo(e.target.value)}
							className="w-24"
							aria-label="k up to"
						/>
						<span className="text-fg-muted">this run went to {run.kmax}</span>
					</div>
				</div>
				<div className="space-y-1.5">
					<span className="ta-label flex items-center gap-1.5">
						Branching rule <InfoDot>{RULE_HINT}</InfoDot>
					</span>
					<RuleField rule={rule} onChange={setRule} />
				</div>
				<Checkbox
					label={`Delete “${run.name}” when the new run finishes`}
					checked={replace}
					onCheckedChange={setReplace}
					hint={
						<InfoDot>
							Only once it finishes: stopped or failed, the old run stays. The new run covers k {run.kmin}
							{again ? `–${run.kmax}, as this one did` : " upward"}, so it holds every tiling this one has.
						</InfoDot>
					}
				/>
				{error ? <p className="text-danger">{error}</p> : null}
			</div>
		</Modal>
	);
}

export function DeleteModal({
	target,
	runs,
	onClose,
	onDeleted,
}: {
	target: string | null;
	runs: Run[];
	onClose: () => void;
	onDeleted: () => void;
}) {
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	if (!target) return null;
	const run = runs.find((r) => r.dir === target);
	const inside = runs.filter((r) => isWithin(r.dir, target));
	const tilings = inside.reduce((t, r) => t + r.total, 0);
	const size = inside.reduce((t, r) => t + r.files.reduce((u, f) => u + f.bytes, 0), 0);
	const name = run ? run.name : baseOf(target);
	return (
		<Modal
			isOpen
			onOpenChange={(o) => !o && (setError(""), onClose())}
			title={run ? `Delete the run “${name}”?` : `Delete the folder “${name}”?`}
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
						onClick={async () => {
							setBusy(true);
							const res = await api().remove(target);
							setBusy(false);
							setError(res.error ?? "");
							if (!res.error) onDeleted();
						}}
					/>
				</div>
			}
		>
			<div className="space-y-3 p-5 text-sm text-fg-secondary">
				<p>
					This deletes <span className="font-mono text-xs break-all text-fg">{target}</span>
					{run
						? ` with its ${n(run.total)} tilings in ${n(run.files.length)} certificate files (${bytes(size)}), its board and its log.`
						: inside.length
							? ` and the ${inside.length === 1 ? "run" : `${n(inside.length)} runs`} in it: ${n(tilings)} tilings in ${bytes(size)} of certificate files.`
							: ", which holds no runs."}
				</p>
				<p className="font-medium text-fg">It does not go to the Trash, and it cannot be undone.</p>
				{error ? <p className="text-danger">{error}</p> : null}
			</div>
		</Modal>
	);
}

/** The output folder as a tree: folders, then runs, newest first. Drag a run or a folder onto a folder to move it. */
export function RunList({
	status,
	selected,
	onSelect,
}: {
	status: Status;
	selected: string | null;
	onSelect: (id: string | null) => void;
}) {
	// the folders shown open: none at first, and kept across pages and launches
	const [opened, setOpened] = useState<Set<string>>(() => loadSet(OPEN_FOLDERS) ?? new Set());
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
	// The highlighted path to the selected run, as the rail pieces it is drawn with, top to bottom: in each
	// folder below the top level, "pass" for the entries above the one it enters and "on" for that entry.
	const pathTo = (sel: string | null) => {
		const pieces: string[] = [];
		for (let folder = status.root, depth = 0; sel && folder !== sel; depth++) {
			const entries = [
				...status.folders.filter((f) => parentOf(f) === folder),
				...status.runs.filter((r) => parentOf(r.dir) === folder).map((r) => r.dir),
			];
			const on = entries.findIndex((e) => isWithin(sel, e));
			if (on < 0) break;
			if (depth) pieces.push(...entries.slice(0, on).map((e) => `pass ${e}`), `on ${entries[on]}`);
			folder = entries[on];
		}
		return pieces;
	};
	// On a new pick only what changed is drawn: from the first piece where the new path leaves the old one.
	const [from, setFrom] = useState(0);
	if (seen !== selected) {
		const [was, now] = [pathTo(seen), pathTo(selected)];
		let i = 0;
		while (i < now.length && was[i] === now[i]) i++;
		setFrom(i);
		setSeen(selected);
		const up = selected ? status.folders.filter((f) => isWithin(selected, f) && !opened.has(f)) : [];
		if (up.length) setOpened(new Set([...opened, ...up]));
	}
	const [renaming, setRenaming] = useState<string | null>(null);
	const [creating, setCreating] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<string | null>(null);
	const [over, setOver] = useState<string | null>(null);
	const [error, setError] = useState("");
	const countIn = (f: string) => status.runs.filter((r) => isWithin(r.dir, f)).length;
	// drop target props: a run or a folder dragged here moves into `folder`
	const drop = (folder: string) => ({
		onDragOver: (e: React.DragEvent) => {
			if (!e.dataTransfer.types.includes("text/x-tilesearch")) return;
			e.preventDefault();
			e.stopPropagation();
			setOver(folder);
		},
		onDragLeave: () => setOver((o) => (o === folder ? null : o)),
		onDrop: async (e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setOver(null);
			const p = e.dataTransfer.getData("text/x-tilesearch");
			if (!p || parentOf(p) === folder) return;
			const res = await api().move(p, folder);
			setError("error" in res ? res.error : "");
			if ("path" in res) carry(p, res.path);
			if ("path" in res && selected === p) onSelect(res.path);
		},
	});
	const drag = (p: string) => ({
		draggable: true,
		onDragStart: (e: React.DragEvent) => {
			e.dataTransfer.setData("text/x-tilesearch", p);
			e.dataTransfer.effectAllowed = "move";
		},
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
				<FolderPlus className="h-4 w-4 shrink-0 text-fg-muted" />
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

	const path = new Map(pathTo(selected).map((piece, i) => [piece, i]));
	const mark = (entry: string) => {
		for (const role of ["on", "pass"]) {
			const i = path.get(`${role} ${entry}`);
			if (i !== undefined)
				return {
					[`data-rail-${role}`]: "",
					style: { "--rail-delay": `${Math.max(0, i - from) * RAIL_STEP}ms` } as React.CSSProperties,
				};
		}
		return {};
	};
	const level = (folder: string): React.ReactNode => {
		const folders = status.folders.filter((f) => parentOf(f) === folder);
		const runs = status.runs.filter((r) => parentOf(r.dir) === folder);
		return (
			<>
				{newFolder(folder)}
				{folders.map((f) => {
					const open = opened.has(f);
					const toggle = () =>
						setOpened(open ? new Set([...opened].filter((x) => x !== f)) : new Set([...opened, f]));
					return (
						<li key={f} {...drop(f)} {...mark(f)}>
							<ContextMenu
								{...drag(f)}
								items={[
									{
										icon: FolderPlus,
										label: "New folder inside",
										onSelect: () => {
											setOpened(new Set([...opened, f]));
											setCreating(f);
										},
									},
									{ icon: Pencil, label: "Rename", onSelect: () => setRenaming(f) },
									{ icon: Trash2, label: "Delete", onSelect: () => setDeleting(f), danger: true },
								]}
								className={cn(
									"flex h-9 items-center rounded-control transition-colors",
									over === f && "bg-accent/15 ring-1 ring-accent",
								)}
							>
								{renaming === f ? (
									<span className="flex w-full items-center gap-1.5 pr-1 pl-2">
										<Folder size={15} className="shrink-0 text-fg-secondary" />
										<NameField initial={baseOf(f)} save={(name) => rename(f, name)} done={() => setRenaming(null)} />
									</span>
								) : (
									// one hover target: the name, the count (shown on hover) and the chevron
									<button
										type="button"
										onClick={toggle}
										className="group flex h-full w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-control pr-2 pl-2 text-left"
										aria-expanded={open}
									>
										<Folder size={15} className="shrink-0 text-fg-secondary" />
										<span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{baseOf(f)}</span>
										<span className="font-mono text-[11px] text-fg-muted tabular-nums opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
											{countIn(f)}
										</span>
										<ChevronRight
											size={14}
											className={cn(
												"shrink-0 text-fg-muted transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)] motion-reduce:transition-none",
												open && "rotate-90",
											)}
										/>
									</button>
								)}
							</ContextMenu>
							{/* the rail: a folder's contents hang off a line under its icon (app.css .ta-rail) */}
							{open ? <ul className="ta-tree-reveal ta-rail mt-0.5">{level(f)}</ul> : null}
						</li>
					);
				})}
				{runs.map((r) => (
					<li key={r.id} className="[--rail-mid:26px]" {...mark(r.dir)}>
						<ContextMenu
							{...drag(r.dir)}
							items={[
								...(r.state === "running"
									? []
									: [{ icon: Pencil, label: "Rename", onSelect: () => setRenaming(r.dir) }]),
								{ icon: FolderOpen, label: "Show folder", onSelect: () => void api().reveal(r.dir) },
								...(r.state === "running"
									? []
									: [{ icon: Trash2, label: "Delete", onSelect: () => setDeleting(r.dir), danger: true }]),
							]}
						>
						{renaming === r.dir ? (
							<span className="flex items-center gap-3 py-2 pr-3 pl-3">
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
							onClick={() => onSelect(r.id)}
							aria-current={selected === r.id || undefined}
							className={cn(
								"flex w-full cursor-pointer items-center gap-3 rounded-control py-2 pr-3 pl-3 text-left transition-colors",
								selected === r.id ? "bg-surface-overlay" : "hover:bg-surface-overlay",
							)}
						>
							<span
								className={cn(
									"h-2 w-2 shrink-0 rounded-full",
									r.state === "running"
										? "animate-pulse bg-accent"
										: r.state === "failed"
											? "bg-danger"
											: r.state === "finished"
												? inspected?.has(r.id)
													? "bg-fg"
													: "animate-pulse bg-green-500"
												: "bg-yellow-400",
								)}
							/>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-medium text-fg">{r.name}</span>
								<span className="block truncate text-xs text-fg-muted">
									{when(r.created)} · k {r.kmin}–{r.kmax} · {r.state}
								</span>
							</span>
							<span className="font-mono text-xs text-fg-secondary tabular-nums">{n(r.total)}</span>
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
				{status.folders.length ? (
					<Tooltip label={opened.size ? "Collapse all folders" : "Expand all folders"}>
						<Button
							size="icon"
							variant="ghost"
							icon={opened.size ? ChevronsDownUp : ChevronsUpDown}
							aria-label={opened.size ? "Collapse all" : "Expand all"}
							onClick={() => setOpened(opened.size ? new Set() : new Set(status.folders))}
						/>
					</Tooltip>
				) : null}
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
			{error ? <p className="px-5 py-1 text-xs text-danger">{error}</p> : null}
			{status.runs.length || status.folders.length || creating ? (
				<ul className="relative mx-2 my-2 space-y-0.5">
					{/* the atlas's gliding hover (components/ui/hover-pill.tsx), over every row in the tree */}
					<HoverPill />
					{level(status.root)}
				</ul>
			) : (
				<p className="px-5 py-6 text-sm text-fg-muted">No runs yet. Build a board and press Run search.</p>
			)}
			<DeleteModal
				target={deleting}
				runs={status.runs}
				onClose={() => setDeleting(null)}
				onDeleted={() => {
					if (selected && deleting && isWithin(selected, deleting)) onSelect(null);
					setDeleting(null);
				}}
			/>
		</div>
	);
}

export function RunView({
	run,
	status,
	options,
	onEdit,
	onSelect,
}: {
	run: Run;
	status: Status;
	options: RunOptions;
	onEdit: (board: string) => void;
	onSelect: (id: string | null) => void;
}) {
	const [tab, setTab] = useState("Tilings");
	const [deleting, setDeleting] = useState(false);
	// Improve (a higher k) or Run again (the same k): both open the same modal
	const [improving, setImproving] = useState<"improve" | "again" | null>(null);
	const [group, setGroup] = useState<Group | null>(null);
	const [error, setError] = useState("");
	const running = run.state === "running";
	const shown = resolveGroup(run, group);
	const shownK = shown && shown.k !== "all" ? shown.k : null;
	return (
		<div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
			<div className="flex flex-wrap items-start gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h1 className="truncate text-xl font-semibold text-fg">{run.name}</h1>
						<Badge tone={TONE[run.state]}>{run.state}</Badge>
						{run.stats ? (
							<InfoDot side="bottom" label="What the engine reported">
								{run.stats}
							</InfoDot>
						) : null}
					</div>
					{(run.note && run.state !== "finished") || error ? (
						<p className={cn("mt-1.5 text-sm", run.state === "failed" || error ? "text-danger" : "text-fg-secondary")}>
							{error || run.note}
						</p>
					) : null}
				</div>
				<div className="flex gap-2">
					{running ? (
						<Button size="sm" variant="danger" icon={Square} label="Stop" onClick={() => void api().stop(run.id)} />
					) : run.state !== "finished" ? (
						<Button
							size="sm"
							variant="primary"
							icon={Play}
							label="Resume"
							onClick={async () =>
								setError((await api().resume(run.id, { ...options, k: run.options?.k, rule: run.options?.rule })).error ?? "")
							}
						/>
					) : null}
					{run.state === "finished" ? (
						<Button
							size="sm"
							variant="primary"
							icon={ChevronsUp}
							label="Improve"
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
					<Button size="sm" icon={FolderOpen} label="Show folder" onClick={() => void api().reveal(run.dir)} />
					<Tooltip label="Delete the run and its folder">
						<Button
							size="icon"
							variant="danger"
							icon={Trash2}
							aria-label="Delete run"
							disabled={running}
							onClick={() => setDeleting(true)}
						/>
					</Tooltip>
				</div>
			</div>
			{improving ? (
				<ImproveModal
					run={run}
					status={status}
					options={options}
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

			<RunOverview
				run={run}
				k={shownK}
				onPick={(k) => {
					setGroup(groupOfK(run, k, shown?.edges));
					setTab("Tilings");
				}}
			/>

			<section
				className="shrink-0 overflow-hidden rounded-surface border border-line-subtle bg-surface-raised shadow-sm"
				style={{ height: "clamp(480px, calc(100vh - 120px), 780px)" }}
			>
				<Tabs
					value={tab}
					onValueChange={setTab}
					tabs={["Tilings", "Files", "Log", "Board"]}
					listClassName="w-80"
					headClassName="border-b border-line-subtle px-4 py-3"
					aside={
						tab === "Tilings" ? (
							<GroupPicker run={run} group={group} onGroup={setGroup} />
						) : tab === "Files" ? (
							<span className="text-xs text-fg-muted tabular-nums">
								{n(run.files.length)} files, {bytes(run.files.reduce((t, f) => t + f.bytes, 0))}
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
							<TilingsView run={run} group={group} />
						) : t === "Files" ? (
							<Files
								run={run}
								group={group}
								onOpen={(f) => (setGroup({ k: f.k, edges: f.edges }), setTab("Tilings"))}
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
	if (!run.files.length)
		return (
			<div className="flex h-full items-center justify-center p-8 text-sm text-fg-muted">
				No certificate files yet: they appear as roots finish.
			</div>
		);
	const g = resolveGroup(run, group);
	// the open group's files; with every k and every edge orbit open, that would be every row
	const open = new Set(g && (g.k !== "all" || g.edges !== "all") ? filesOf(run, g) : []);
	const ks = [...new Set(run.files.map((f) => f.k))];
	return (
		<div className="h-full overflow-auto">
			<table className="w-full text-sm">
				<thead className="sticky top-0 z-10 bg-surface-raised">
					<tr className="text-left">
						{["Corners", "Edge orbits", "Orientable", "Size"].map((h, i) => (
							<th
								key={h}
								className={cn(
									"ta-label border-b border-line-subtle py-2.5 font-medium",
									i ? "px-3" : "pr-3 pl-5",
									i === 3 && "w-[34%]",
								)}
							>
								{h}
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
									colSpan={4}
									className="bg-surface-sunken/50 py-1.5 pr-3 pl-5 text-left text-xs font-normal text-fg-muted"
								>
									<span className="font-mono font-medium text-fg">k = {k}</span>
									<span className="ml-2 tabular-nums">
										{fs.length} file{fs.length === 1 ? "" : "s"}, {bytes(fs.reduce((t, f) => t + f.bytes, 0))}
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
												"border-l-2 py-1.5 pr-3 pl-[18px] font-mono text-[13px]",
												on ? "border-accent" : "border-transparent",
											)}
										>
											{f.labels}
										</td>
										<td className="px-3 py-1.5 font-mono text-[13px] tabular-nums">{f.edges}</td>
										<td className="px-3 py-1.5 text-fg-secondary">
											{f.orientable ? <Check size={14} aria-label="orientable" /> : null}
										</td>
										<td className="px-3 py-1.5">
											<div className="flex items-center gap-3">
												<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
													<div
														className="h-full rounded-full bg-fg/30"
														style={{ width: `${(f.bytes / largest) * 100}%` }}
													/>
												</div>
												<span className="w-16 text-right font-mono text-xs text-fg-secondary tabular-nums">
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
			className="h-full overflow-auto px-5 py-4 font-mono text-xs leading-relaxed text-fg-secondary"
		>
			{lines.join("\n") || <span className="text-fg-muted">The engine has written nothing to its log yet.</span>}
		</pre>
	);
}

/** The board the run was started from, numbered, its keywords set back from their values. */
function BoardText({ text }: { text: string }) {
	const lines = text.replace(/\n$/, "").split("\n");
	return (
		<div className="h-full overflow-auto py-4 font-mono text-xs leading-relaxed">
			<div className="grid grid-cols-[auto_minmax(0,1fr)]">
				{lines.map((l, i) => {
					const [word, ...rest] = l.split(" ");
					return (
						<Fragment key={i}>
							<span className="pr-4 pl-5 text-right text-fg-disabled tabular-nums select-none">{i + 1}</span>
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
