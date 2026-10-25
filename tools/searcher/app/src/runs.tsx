// The runs: every run folder under the output folder, live progress for the running ones, and per run
// its counts per k, its output files and the certificates in them.
import { ChevronRight, FilePen, Folder, FolderOpen, FolderPlus, Pencil, Play, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoDot } from "@/components/ui/info-dot";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import type { OutFile, Run, RunOptions, Status } from "./bridge";
import { TilingsView } from "./tilings";

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
const when = (ms: number) =>
	ms ? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
/** The folder a path is in, and its last segment, whichever separator the platform uses. */
const parentOf = (p: string) => p.replace(/[\\/][^\\/]*$/, "");
const baseOf = (p: string) => p.slice(parentOf(p).length + 1);
/** Whether `p` is `folder` or inside it. */
const isWithin = (p: string, folder: string) => p === folder || (p.startsWith(folder) && /[\\/]/.test(p[folder.length]));
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
	save,
	done,
	className,
}: {
	initial: string;
	save: (name: string) => Promise<string | null>;
	done: () => void;
	className?: string;
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
		<div className={cn("min-w-0 flex-1", className)}>
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
			{error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
		</div>
	);
}

/** What a delete takes with it: a run, or a folder and every run in it. */
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
	const [closed, setClosed] = useState<Set<string>>(new Set());
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
		if (selected === p) onSelect(res.path);
		return null;
	};
	const newFolder = (parent: string, depth: number) =>
		creating === parent ? (
			<li className="flex items-center gap-2 py-1 pr-2" style={{ paddingLeft: 12 + depth * 16 }}>
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

	const level = (folder: string, depth: number): React.ReactNode => {
		const folders = status.folders.filter((f) => parentOf(f) === folder);
		const runs = status.runs.filter((r) => parentOf(r.dir) === folder);
		return (
			<>
				{newFolder(folder, depth)}
				{folders.map((f) => {
					const open = !closed.has(f);
					return (
<li key={f} {...drop(f)}>
<div
{...drag(f)}
className={cn(
// a fixed height, and the actions fade in over it: hovering moves nothing
"group flex h-9 items-center gap-1.5 rounded-control pr-1 transition-colors",
over === f ? "bg-accent/15 ring-1 ring-accent" : "hover:bg-surface-overlay",
)}
style={{ paddingLeft: 8 + depth * 16 }}
>
<button
type="button"
onClick={() => setClosed((c) => (open ? new Set([...c, f]) : new Set([...c].filter((x) => x !== f))))}
className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
aria-expanded={open}
>
{/* one glyph that turns, as in the atlas's catalogue tree */}
<ChevronRight
size={14}
className={cn(
"shrink-0 text-fg-muted transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)] motion-reduce:transition-none",
open && "rotate-90",
)}
/>
<Folder size={15} className="shrink-0 text-fg-secondary" />
{renaming === f ? null : <span className="truncate text-sm font-medium text-fg">{baseOf(f)}</span>}
</button>
{renaming === f ? (
<NameField initial={baseOf(f)} save={(name) => rename(f, name)} done={() => setRenaming(null)} />
) : (
<>
<span className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
{[
{
icon: FolderPlus,
label: "New folder inside",
on: () => {
setClosed((c) => new Set([...c].filter((x) => x !== f)));
setCreating(f);
},
},
{ icon: Pencil, label: "Rename folder", on: () => setRenaming(f) },
{ icon: Trash2, label: "Delete folder", on: () => setDeleting(f) },
].map(({ icon, label, on }) => (
<Tooltip key={label} label={label}>
<Button size="icon" variant="ghost" icon={icon} aria-label={label} onClick={on} />
</Tooltip>
))}
</span>
<span className="w-6 text-right font-mono text-[11px] text-fg-muted tabular-nums">{countIn(f)}</span>
</>
)}
</div>
{open ? <ul className="ta-tree-reveal">{level(f, depth + 1)}</ul> : null}
</li>
);
				})}
				{runs.map((r) => (
					<li key={r.id}>
						<button
							type="button"
							{...drag(r.dir)}
							onClick={() => onSelect(r.id)}
							style={{ paddingLeft: 12 + depth * 16 }}
							className={cn(
								"flex w-full cursor-pointer items-center gap-3 rounded-control py-2 pr-3 text-left transition-colors",
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
												? "bg-fg"
												: "bg-line-strong",
								)}
							/>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-medium text-fg">{r.name}</span>
								<span className="block text-xs text-fg-muted">
									{when(r.created)} · k {r.kmin}–{r.kmax} · {r.state}
								</span>
							</span>
							<span className="font-mono text-xs text-fg-secondary tabular-nums">{n(r.total)}</span>
						</button>
					</li>
				))}
			</>
		);
	};

	return (
		<div {...drop(status.root)} className={cn("flex min-h-full flex-col", over === status.root && "bg-accent/5")}>
			<div className="flex items-center justify-between gap-2 px-5 pt-4 pb-1">
				<span className="ta-label">Runs in the output folder</span>
				<Tooltip label="New folder">
					<Button size="icon" variant="ghost" icon={FolderPlus} aria-label="New folder" onClick={() => setCreating(status.root)} />
				</Tooltip>
			</div>
			{error ? <p className="px-5 py-1 text-xs text-danger">{error}</p> : null}
			{status.runs.length || status.folders.length || creating ? (
				<ul className="space-y-0.5 p-2">{level(status.root, 0)}</ul>
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

function Stat({
	label,
	value,
	hint,
	children,
}: {
	label: string;
	value: string;
	hint?: React.ReactNode;
	children?: React.ReactNode;
}) {
	return (
		<div className="min-w-0 flex-1 rounded-surface border border-line-subtle bg-surface-raised px-4 py-3 shadow-sm">
			<div className="ta-label flex items-center gap-1.5">
				{label}
				{hint ? <InfoDot side="bottom">{hint}</InfoDot> : null}
			</div>
			<div className="mt-1 font-mono text-xl text-fg tabular-nums">{value}</div>
			{children}
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
	const [renaming, setRenaming] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [file, setFile] = useState<OutFile | null>(null);
	const [error, setError] = useState("");
	const running = run.state === "running";
	const kMax = Math.max(1, ...Object.values(run.counts));
	const ks = Array.from({ length: Math.max(0, run.kmax - run.kmin + 1) }, (_, i) => run.kmin + i);
	const share = run.roots.all ? run.roots.done / run.roots.all : run.state === "finished" ? 1 : 0;
	return (
		<div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
			<div className="flex flex-wrap items-start gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						{renaming ? (
							<NameField
								className="max-w-md"
								initial={baseOf(run.dir)}
								save={async (name) => {
									const res = await api().rename(run.dir, name);
									if ("error" in res) return res.error;
									onSelect(res.path);
									return null;
								}}
								done={() => setRenaming(false)}
							/>
						) : (
							<>
								<h1 className="truncate text-xl font-semibold text-fg">{run.name}</h1>
								<Tooltip label="Rename the run and its folder">
									<Button
										size="icon"
										variant="ghost"
										icon={Pencil}
										aria-label="Rename run"
										disabled={running}
										onClick={() => setRenaming(true)}
									/>
								</Tooltip>
							</>
						)}
						<Badge tone={TONE[run.state]}>{run.state}</Badge>
						{run.options || run.stats ? (
							<InfoDot side="bottom" label="How this run was started">
								{run.options
									? `Started with ${run.options.threads} threads, priority ${run.options.nice === 0 ? "normal" : `nice ${run.options.nice}`}${run.options.k ? `, k ${run.options.k[0]}–${run.options.k[1]}` : ""}.`
									: ""}
								{run.stats ? ` Engine: ${run.stats}.` : ""}
							</InfoDot>
						) : null}
					</div>
					<div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-fg-muted">
						<span className="shrink-0">In</span>
						<select
							value={parentOf(run.dir)}
							disabled={running}
							title={running ? "Stop the run to move it" : "Move the run to another folder"}
							onChange={async (e) => {
								const res = await api().move(run.dir, e.target.value);
								setError("error" in res ? res.error : "");
								if ("path" in res) onSelect(res.path);
							}}
							className="h-6 max-w-xs rounded-control border border-line bg-surface-raised px-1.5 text-xs text-fg disabled:opacity-60"
							aria-label="Folder"
						>
							{[status.root, ...status.folders].map((f) => (
								<option key={f} value={f}>
									{f === status.root ? "the output folder" : f.slice(status.root.length + 1)}
								</option>
							))}
						</select>
						<span className="truncate font-mono" title={run.dir}>
							{run.dir}
						</span>
					</div>
					{run.note || error ? (
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
								setError((await api().resume(run.id, { ...options, k: run.options?.k })).error ?? "")
							}
						/>
					) : null}
					<Button size="sm" icon={FilePen} label="Edit board" onClick={() => onEdit(run.board)} />
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
			<DeleteModal
				target={deleting ? run.dir : null}
				runs={status.runs}
				onClose={() => setDeleting(false)}
				onDeleted={() => (setDeleting(false), onSelect(null))}
			/>

			<div className="flex gap-3">
				<Stat label="Tilings" value={n(run.total)} />
				<Stat
					label="Roots done"
					hint="Output reaches the files one root at a time: a root's tilings appear when the root finishes. A stop loses at most the roots that were running, and Resume runs those again."
					value={run.roots.all ? `${n(run.roots.done)} / ${n(run.roots.all)}` : n(run.roots.done)}
				>
					<div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-sunken">
						<div
							className="h-full rounded-full bg-accent transition-[width] duration-500"
							style={{ width: `${share * 100}%` }}
						/>
					</div>
				</Stat>
				<Stat label="Rate" value={running ? `${n(Math.round(run.rate))} / s` : "–"} />
				<Stat label="Elapsed" value={running || run.elapsed ? duration(run.elapsed) : "–"} />
				<Stat
					label="Time left"
					value={running && run.eta ? `≈ ${duration(run.eta.seconds)}` : "–"}
					hint={
						run.estimate
							? `The search visits ${approx(run.estimate.nodes)} nodes, ${duration(run.estimate.cpu[0])} of work on one core.${run.eta ? "" : " A time left needs the engine to report how many it has visited, which this engine does not do yet."}`
							: undefined
					}
				>
					{running && run.eta ? (
						<div className="mt-1 text-xs text-fg-muted">
							{duration(run.eta.low)} to {duration(run.eta.high)}
						</div>
					) : null}
				</Stat>
				<Stat label="Files" value={n(run.files.length)} />
			</div>

			<section className="rounded-surface border border-line-subtle bg-surface-raised p-4 shadow-sm">
				<div className="mb-3 flex items-center gap-1.5">
					<span className="ta-label">Tilings per k</span>
					{run.estimate && run.state !== "finished" ? (
						<InfoDot>
							The totals are estimated from {n(run.estimate.probes)} samples of the search (
							{Math.round(run.estimate.seconds)} s), duplicates accounted for.
						</InfoDot>
					) : null}
				</div>
				<div className="space-y-1.5">
					{ks.map((k) => {
						const est = run.estimate && run.state !== "finished" ? estimatedTotal(run.estimate, k) : null;
						const found = run.counts[k] ?? 0;
						const of = est ? Math.max(est[0], found, 1) : kMax;
						return (
							<div key={k} className="grid grid-cols-[3rem_1fr_7rem_13rem] items-center gap-3 text-sm">
								<span className="font-mono text-fg-secondary">k = {k}</span>
								<div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
									<div
										className="h-full rounded-full bg-fg/70 transition-[width] duration-500"
										style={{ width: `${Math.min(1, found / of) * 100}%` }}
									/>
								</div>
								<span className="text-right font-mono text-fg tabular-nums">
									{run.counts[k] !== undefined ? n(found) : "–"}
								</span>
								<span className="text-right font-mono text-xs text-fg-muted tabular-nums">
									{est ? `of ${approx(est)}` : ""}
								</span>
							</div>
						);
					})}
				</div>
			</section>

			<div className="shrink-0">
				<Tabs value={tab} onValueChange={setTab} tabs={["Tilings", "Files", "Log", "Board"]} listClassName="max-w-md">
					{(t) => (
						<div className="h-full pt-3">
							{t === "Files" ? (
								<Files run={run} onOpen={(f) => (setFile(f), setTab("Tilings"))} />
							) : t === "Tilings" ? (
								<TilingsView run={run} file={file ?? run.files[0] ?? null} onFile={setFile} />
							) : t === "Log" ? (
								<pre className="h-full max-h-[480px] overflow-auto rounded-surface border border-line-subtle bg-surface-raised p-3 font-mono text-xs text-fg-secondary">
									{run.log.join("\n") || "Nothing logged yet."}
								</pre>
							) : (
								<pre className="max-h-[480px] overflow-auto rounded-surface border border-line-subtle bg-surface-raised p-3 font-mono text-xs text-fg">
									{run.board}
								</pre>
							)}
						</div>
					)}
				</Tabs>
			</div>
		</div>
	);
}

function Files({ run, onOpen }: { run: Run; onOpen: (f: OutFile) => void }) {
	if (!run.files.length)
		return <p className="text-sm text-fg-muted">No certificate files yet: they appear as roots finish.</p>;
	return (
		<div className="max-h-[480px] overflow-auto rounded-surface border border-line-subtle bg-surface-raised">
			<table className="w-full text-sm">
				<thead className="sticky top-0 bg-surface-raised">
					<tr className="border-b border-line-subtle text-left">
						{["k", "Corners", "Orientable", "Edge orbits", "Size"].map((h) => (
							<th key={h} className="ta-label px-3 py-2 font-medium">
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{run.files.map((f) => (
						<tr
							key={f.name}
							onClick={() => onOpen(f)}
							className="cursor-pointer border-b border-line-subtle/60 hover:bg-surface-overlay/60"
							title={f.name}
						>
							<td className="px-3 py-1.5 font-mono">{f.k}</td>
							<td className="px-3 py-1.5 font-mono">{f.labels}</td>
							<td className="px-3 py-1.5">{f.orientable ? "yes" : ""}</td>
							<td className="px-3 py-1.5 font-mono">{f.edges}</td>
							<td className="px-3 py-1.5 font-mono text-fg-secondary">{bytes(f.bytes)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
