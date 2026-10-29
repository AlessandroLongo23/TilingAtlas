// TileSearch: build a board (visually or as text, the two kept in step), run it, watch the runs.
// The board text is the one source of truth: the visual editor parses it and writes it back.
import { FilePlus, FolderOpen, Play, Save, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NAV_BAR, NAV_LABEL, NavActivePill, NavBrand, NavDivider, navLinkClass } from "@/components/nav-bar";
import { HoverPill } from "@/components/ui/hover-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoDot } from "@/components/ui/info-dot";
import { Modal } from "@/components/ui/modal";
import { OptionWall } from "@/components/ui/option-wall";
import { RangeInput } from "@/components/ui/range-input";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils/cn";
import { emptyBoard, parse, serialize, type Board, type Problem } from "./board";
import type { Check, Estimate, Rule, Settings, Status } from "./bridge";
import { Problems, VisualEditor } from "./editor";
import { approx, bytes, duration, load, RULE_HINT, RuleField as RulePicker, RunList, RunView, store } from "./runs";

const api = () => window.tilesearch;
const DRAFT = "tilesearch:draft";

const NEW_BOARD = serialize({
	...emptyBoard(),
	name: "my_board",
	angles: [{ sym: "A4", value: "90" }],
	faces: [{ word: ["A4"], repeat: 4 }],
	vertices: [{ word: ["A4", "A4", "A4", "A4"] }],
});

/** The site's hexagon mark (components/nav.tsx). */
/** How big a search will be, before it runs: a few seconds of sampling its tree (tools/searcher/tileestimate.cpp). */
function SizeEstimate({
	text,
	k,
	rule,
	disabled,
}: {
	text: string;
	k: [number, number] | null;
	rule?: Rule;
	disabled: boolean;
}) {
	const [state, setState] = useState<{ for: string; e: Estimate | { error: string } | "running" } | null>(null);
	const key = text + JSON.stringify(k) + (rule ?? "");
	const result = state?.for === key ? state.e : null; // an estimate of another board is not shown
	const run = async () => {
		setState({ for: key, e: "running" });
		const e = await api().estimate(text, k ?? undefined, rule);
		setState({ for: key, e });
	};
	return (
		<Field
			label="Size"
			hint="Sampled from the search tree in a few seconds. Duplicates are accounted for; rare tilings make the range wide."
		>
			<Button
				size="sm"
				label={result === "running" ? "Estimating…" : "Estimate size"}
				disabled={disabled || result === "running"}
				onClick={run}
			/>
			{result && result !== "running" ? (
				"error" in result ? (
					<p className="text-xs text-danger">{result.error}</p>
				) : (
					<div className="space-y-1 rounded-control bg-surface-sunken p-2.5 font-mono text-xs text-fg-secondary">
						{Object.entries(result.perK).map(([kk, v]) => (
							<div key={kk} className="flex justify-between gap-2">
								<span>k = {kk}</span>
								<span className="text-fg">{approx(v.unique)} tilings</span>
							</div>
						))}
						<div className="flex justify-between gap-2 border-t border-line-subtle pt-1">
							<span>work</span>
							<span className="text-fg">{duration(result.cpu[0])} on one core</span>
						</div>
					</div>
				)
			) : null}
		</Field>
	);
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
	return (
		<div className="space-y-1.5">
			<div className="ta-label flex items-center gap-1.5">
				{label}
				{hint ? <InfoDot>{hint}</InfoDot> : null}
			</div>
			{children}
		</div>
	);
}

/** The board as text, with line numbers and the problems of each line marked in the gutter. */
function TextEditor({ text, setText, problems }: { text: string; setText: (t: string) => void; problems: Problem[] }) {
	const area = useRef<HTMLTextAreaElement>(null);
	const gutter = useRef<HTMLDivElement>(null);
	const lines = text.split("\n");
	const bad = new Map(problems.filter((p) => p.line !== null).map((p) => [p.line!, p.severity]));
	const goto = (line: number) => {
		const el = area.current;
		if (!el) return;
		const start = lines.slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
		el.focus();
		el.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
	};
	return (
		<div className="flex h-full flex-col gap-3">
			<div className="flex min-h-0 flex-1 overflow-hidden rounded-surface border border-line-subtle bg-surface-raised font-mono text-[13px] leading-6 shadow-sm">
				<div
					ref={gutter}
					className="overflow-hidden border-r border-line-subtle bg-surface-sunken/50 py-3 text-right select-none"
				>
					{lines.map((_, i) => (
						<div
							key={i}
							className={cn(
								"px-3 tabular-nums",
								bad.get(i + 1) === "error"
									? "bg-danger-subtle text-danger"
									: bad.get(i + 1)
										? "text-fg"
										: "text-fg-disabled",
							)}
						>
							{i + 1}
						</div>
					))}
				</div>
				<textarea
					ref={area}
					value={text}
					spellCheck={false}
					onChange={(e) => setText(e.target.value)}
					onScroll={(e) => gutter.current && (gutter.current.scrollTop = e.currentTarget.scrollTop)}
					className="min-w-0 flex-1 resize-none bg-transparent px-3 py-3 whitespace-pre text-fg outline-none"
					aria-label="Board text"
				/>
			</div>
			{problems.length ? (
				<ul className="max-h-40 space-y-1 overflow-auto">
					{problems.map((p, i) => (
						<li key={i}>
							<button type="button" onClick={() => p.line && goto(p.line)} className="w-full cursor-pointer text-left">
								<Problems list={[{ ...p, message: `${p.line ? `Line ${p.line}: ` : ""}${p.message}` }]} />
							</button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

export function App() {
	const [text, setTextRaw] = useState(() => load(DRAFT) ?? NEW_BOARD);
	const [mode, setMode] = useState("visual");
	const [view, setView] = useState<"board" | "runs">("board");
	const [settings, setSettings] = useState<Settings | null>(null);
	const [status, setStatus] = useState<Status>({
		root: "",
		folders: [],
		runs: [],
		freeBytes: 0,
		minFreeBytes: 10 * 2 ** 30,
	});
	const [selected, setSelected] = useState<string | null>(null);
	const [engine, setEngine] = useState<Check | null>(null);
	const [runK, setRunK] = useState<[number, number] | null>(null);
	const [runRule, setRunRule] = useState<Rule | undefined>(undefined);
	const [message, setMessage] = useState("");
	const [askQuit, setAskQuit] = useState(false);
	const history = useRef<string[]>([]);

	const { board, problems } = useMemo(() => parse(text), [text]);
	const setText = useCallback((t: string) => {
		setTextRaw((old) => {
			if (old !== t) history.current = [...history.current.slice(-199), old];
			return t;
		});
	}, []);
	const set = useCallback((b: Board) => setText(serialize(b)), [setText]);
	const loadBoard = useCallback((t: string) => (setText(t), setRunK(null), setView("board")), [setText]);

	useEffect(() => store(DRAFT, text), [text]);
	useEffect(() => {
		const t = setTimeout(() => void api().check(text).then(setEngine), 250);
		return () => clearTimeout(t);
	}, [text]);
	useEffect(() => {
		void api().settings().then(setSettings);
		void api().status().then(setStatus);
		const off = api().onStatus(setStatus);
		const offHook = api().onHook((h) => {
			if ("load" in h) loadBoard(h.load);
			if ("run" in h) document.getElementById("run-search")?.click();
		});
		const offQuit = api().onQuitRequest(() => setAskQuit(true));
		return () => (off(), offHook(), offQuit());
	}, [loadBoard]);
	// undo for the visual editor; text fields keep their own
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
			if (typing || !(e.metaKey || e.ctrlKey) || e.key !== "z" || e.shiftKey) return;
			const prev = history.current.pop();
			if (prev === undefined) return;
			e.preventDefault();
			setTextRaw(prev);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const errors = problems.filter((p) => p.severity === "error");
	const engineError = engine && !engine.ok ? engine : null;
	const lowDisk = status.freeBytes > 0 && status.freeBytes < status.minFreeBytes;
	const running = status.runs.filter((r) => r.state === "running").length;
	const run = status.runs.find((r) => r.id === selected) ?? null;
	const options = settings ? { threads: settings.threads, nice: settings.nice } : { threads: 1, nice: 10 };

	const start = async () => {
		const res = await api().start(text, board.name, { ...options, ...(runK ? { k: runK } : {}), ...(runRule ? { rule: runRule } : {}) });
		if ("error" in res) setMessage(res.error);
		else setMessage("");
		setSelected(res && "id" in res ? res.id : null);
		setView("runs");
	};
	const saveSetting = (s: Partial<Pick<Settings, "threads" | "nice">>) => void api().setSettings(s).then(setSettings);

	const sidebar = (
		<aside className="flex w-[360px] shrink-0 flex-col border-r border-line-subtle bg-surface-chrome">
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="space-y-4 border-b border-line-subtle p-5">
					<Toggle leftValue="visual" rightValue="text" value={mode} onChange={setMode} />
				</div>

				<div className="space-y-5 border-b border-line-subtle p-5">
					<Field
						label="k"
						hint="The number of vertex orbits: k = 1 is the uniform tilings, k = 2 the 2-uniform ones, and so on. Each step up costs far more than the last."
					>
						<div className="flex items-center gap-2 text-sm text-fg-secondary">
							from
							<Input
								type="number"
								min={1}
								value={board.kmin}
								onChange={(e) => set({ ...board, kmin: Math.max(1, Number(e.target.value) || 1) })}
								className="w-20"
								aria-label="k from"
							/>
							to
							<Input
								type="number"
								min={board.kmin}
								value={board.kmax}
								onChange={(e) => set({ ...board, kmax: Math.max(1, Number(e.target.value) || 1) })}
								className="w-20"
								aria-label="k to"
							/>
						</div>
					</Field>
					<Field
						label="Permutations"
						hint={
							board.permutations
								? "On: a vertex lists which corners meet there, in any order. Each one stands for every distinct way to arrange its corners round the point."
								: "Off: a vertex is exactly the order you arranged its corners in (a turned or mirrored order is the same vertex)."
						}
					>
						<Toggle
							leftValue="off"
							rightValue="on"
							value={board.permutations ? "on" : "off"}
							onChange={(v) => set({ ...board, permutations: v === "on" })}
						/>
					</Field>
					<Field
						label="Initial vertices"
						hint="Output only the tilings that contain at least one initial vertex. Mark vertices as initial on their cards; with none marked, every tiling is output."
					>
						<div className="flex items-center gap-2 text-sm text-fg">
							{board.initial.length ? `Vertex ${board.initial.join(", ")}` : "None: all tilings"}
							{board.initial.length ? (
								<Button size="sm" variant="ghost" label="Clear" onClick={() => set({ ...board, initial: [] })} />
							) : null}
						</div>
					</Field>
					<Field
						label="Required sets"
						hint="Output only the tilings that hold a vertex from every set: every star on the board, say. Make a set by selecting vertices (the filter helps: A6p90 OR A6d90, then Select all) and pressing Require, or from a face with Require this face. Initial vertices, when marked too, count as one more set. The search prunes on k, so a targeted search is faster too."
					>
						{board.require.length ? (
							<ol className="space-y-0.5">
								{board.require.map((r, i) => (
									<li key={i} className="flex items-center gap-2 text-sm text-fg">
										<span className="w-4 shrink-0 font-mono text-xs text-fg-muted">{i + 1}</span>
										{r.faces ? (
											<span
												className="min-w-0 flex-1 truncate font-mono text-xs"
												title={r.faces.map((w) => `face ${w.join(" ")}`).join("\n")}
											>
												{r.faces.length === 1 ? `face ${r.faces[0].join(" ")}` : `one of ${r.faces.length} faces`}
											</span>
										) : (
											<span className="min-w-0 flex-1 truncate" title={`Vertex ${r.set.join(", ")}`}>
												{r.trail ? <span className="font-mono text-xs">{r.trail}</span> : `Vertex ${r.set.join(", ")}`}
												<span className="text-fg-muted"> · {r.set.length}</span>
											</span>
										)}
										<Button
											size="icon"
											variant="ghost"
											icon={X}
											aria-label={`Remove required set ${i + 1}`}
											onClick={() => set({ ...board, require: board.require.filter((_, j) => j !== i) })}
										/>
									</li>
								))}
							</ol>
						) : (
							<span className="text-sm text-fg">None</span>
						)}
					</Field>
					<Problems
						list={problems.filter((p) =>
							["name", "k", "initial", "require", "permutations", "board"].includes(p.where.kind),
						)}
					/>
				</div>

				<div className="space-y-5 p-5">
					<Field
						label={`Threads · ${options.threads}`}
						hint={settings ? `This computer has ${settings.cores} cores. Threads never change the result.` : undefined}
					>
						<RangeInput
							min={1}
							max={Math.max(1, (settings?.cores ?? 1) * 2)}
							value={options.threads}
							onChange={(threads) => saveSetting({ threads })}
							aria-label="Threads"
						/>
					</Field>
					<Field
						label="Priority"
						hint="Low lets the search use the cores nothing else needs, and yield to the rest of the computer."
					>
						<OptionWall
							columns={3}
							options={[
								{ value: 0, label: "Normal" },
								{ value: 10, label: "Low" },
								{ value: 19, label: "Lowest" },
							]}
							selected={options.nice}
							onChange={(nice) => saveSetting({ nice })}
						/>
					</Field>
					<Field
						label="k for this run"
						hint="Leave the board's range, or run part of it. A resumed run keeps the range it started with."
					>
						<div className="flex items-center gap-2 text-sm text-fg-secondary">
							<Toggle
								leftValue="board"
								rightValue="custom"
								value={runK ? "custom" : "board"}
								onChange={(v) => setRunK(v === "custom" ? [board.kmin, board.kmax] : null)}
								padding="py-1 px-2"
							/>
						</div>
						{runK ? (
							<div className="flex items-center gap-2 text-sm text-fg-secondary">
								from
								<Input
									type="number"
									min={1}
									value={runK[0]}
									onChange={(e) => setRunK([Math.max(1, Number(e.target.value) || 1), runK[1]])}
									className="w-20"
									aria-label="Run k from"
								/>
								to
								<Input
									type="number"
									min={runK[0]}
									value={runK[1]}
									onChange={(e) => setRunK([runK[0], Math.max(runK[0], Number(e.target.value) || 1)])}
									className="w-20"
									aria-label="Run k to"
								/>
							</div>
						) : null}
					</Field>
					<Field label="Branching rule" hint={RULE_HINT}>
						<RulePicker rule={runRule} onChange={setRunRule} />
					</Field>
					<SizeEstimate text={text} k={runK} rule={runRule} disabled={!!engineError || errors.length > 0} />
					<Field label="Output folder" hint="Every run stops when the disk drops under 10 GB free.">
						<div className="flex items-center gap-2">
							<span
								className="min-w-0 flex-1 truncate font-mono text-xs text-fg-secondary"
								title={settings?.root}
								dir="rtl"
							>
								{settings?.root}
							</span>
							<Button size="sm" label="Change…" onClick={() => void api().chooseRoot().then(setSettings)} />
						</div>
						<p className={cn("text-xs", lowDisk ? "text-danger" : "text-fg-muted")}>
							{bytes(status.freeBytes)} free{lowDisk ? ": under 10 GB, runs cannot start." : ""}
						</p>
					</Field>
				</div>
			</div>
			<div className="space-y-2 border-t border-line-subtle px-5 py-4">
				<Button
					id="run-search"
					variant="primary"
					fullWidth
					icon={Play}
					label="Run search"
					disabled={!!engineError || errors.length > 0 || lowDisk}
					onClick={start}
				/>
				{message ? <p className="text-xs text-danger">{message}</p> : null}
			</div>
		</aside>
	);

	return (
		<div className="flex h-full flex-col bg-surface">
			{/* the atlas's own bar (components/nav-bar.tsx) */}
			<header className={cn(NAV_BAR, "h-12 border-b border-line-subtle")}>
				<div className="mr-4 flex shrink-0 items-center gap-2">
					<NavBrand name="TileSearch" version={settings?.version ?? ""} />
				</div>
				<NavDivider />
				<nav className="relative flex min-w-0 flex-1 items-center gap-1">
					<HoverPill />
					{(["board", "runs"] as const).map((v) => (
						<button
							key={v}
							type="button"
							onClick={() => setView(v)}
							aria-current={view === v ? "page" : undefined}
							className={navLinkClass(view === v)}
						>
							{view === v ? <NavActivePill /> : null}
							<span className={NAV_LABEL}>
								{v === "board" ? "Board" : `Runs${running ? ` · ${running} running` : ""}`}
							</span>
						</button>
					))}
				</nav>
				<ThemeToggle />
			</header>

			{view === "board" ? (
				<div className="flex min-h-0 flex-1">
					{sidebar}
					<main className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
						<header className="flex items-center gap-3">
							<Input
								value={board.name}
								onChange={(e) => set({ ...board, name: e.target.value.replace(/\s|#/g, "_") })}
								className="max-w-sm text-base font-semibold"
								aria-label="Board name"
							/>
							<div className="ml-auto flex gap-1.5">
								<Button size="sm" icon={FilePlus} label="New" onClick={() => loadBoard(NEW_BOARD)} />
								<Button
									size="sm"
									icon={FolderOpen}
									label="Open…"
									onClick={async () => {
										const f = await api().openBoard();
										if (f) loadBoard(f.text);
									}}
								/>
								<Button size="sm" icon={Save} label="Save…" onClick={() => void api().saveBoard(text, board.name)} />
							</div>
						</header>
						{mode === "visual" ? (
							<VisualEditor b={board} set={set} problems={problems} />
						) : (
							<div className="flex min-h-0 flex-1 flex-col gap-3">
								<p className="text-xs text-fg-muted">
									The board file, as the engine reads it (docs/searcher/board-format.md). Edits here and in the visual
									editor are the same board; a line the visual editor cannot show is kept as written.
								</p>
								<TextEditor text={text} setText={setText} problems={problems} />
								{engine?.ok ? (
									<details className="text-xs text-fg-muted">
										<summary className="cursor-pointer">What the engine reads (tilesearch --dump)</summary>
										<pre className="mt-2 max-h-60 overflow-auto rounded-control bg-surface-sunken p-2 font-mono">
											{engine.dump}
										</pre>
									</details>
								) : null}
							</div>
						)}
					</main>
				</div>
			) : (
				<div className="flex min-h-0 flex-1">
					<aside className="w-[360px] shrink-0 overflow-y-auto border-r border-line-subtle bg-surface-chrome">
						<RunList status={status} selected={run?.id ?? null} onSelect={setSelected} />
					</aside>
					<main className="min-w-0 flex-1">
						{run ? (
							<RunView run={run} status={status} options={options} onEdit={loadBoard} onSelect={setSelected} />
						) : (
							<p className="p-6 text-sm text-fg-muted">Select a run, or start one from the board.</p>
						)}
					</main>
				</div>
			)}
			<QuitModal
				open={askQuit}
				onClose={() => setAskQuit(false)}
				runs={status.runs.filter((r) => r.state === "running")}
			/>
		</div>
	);
}

/** Asked when the app is closed with runs going: quitting stops them, so say what that keeps. */
function QuitModal({ open, onClose, runs }: { open: boolean; onClose: () => void; runs: Status["runs"] }) {
	const n = runs.length;
	return (
		<Modal
			isOpen={open && n > 0}
			onOpenChange={(o) => !o && onClose()}
			title={n === 1 ? "A search is running" : `${n} searches are running`}
			size="sm"
			description="Quitting TileSearch stops the searches that are running"
			footer={
				<div className="flex justify-end gap-2">
					<Button label="Keep running" onClick={onClose} />
					<Button
						variant="danger"
						label={n === 1 ? "Stop it and quit" : "Stop them and quit"}
						onClick={() => void api().quit()}
					/>
				</div>
			}
		>
			<div className="space-y-4 p-5 text-sm text-fg-secondary">
				<p>
					Quitting stops {n === 1 ? "it" : "them"}. Every finished root is kept on disk; the roots in progress are lost
					and start again from the beginning when you press Resume on the run.
				</p>
				<ul className="space-y-1.5">
					{runs.map((r) => (
						<li
							key={r.id}
							className="flex items-center justify-between gap-3 rounded-control bg-surface-sunken px-3 py-2"
						>
							<span className="truncate font-medium text-fg">{r.name}</span>
							<span className="shrink-0 font-mono text-xs text-fg-muted">
								{r.roots.done} / {r.roots.all || "?"} roots · {r.total.toLocaleString("en")} tilings
							</span>
						</li>
					))}
				</ul>
			</div>
		</Modal>
	);
}
