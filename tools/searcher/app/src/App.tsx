// The Tiling Searcher: build a board (visually or as text, the two kept in step), run it, watch the runs.
// The board text is the one source of truth: the visual editor parses it and writes it back.
import { BookOpen, ChevronLeft, FilePlus, FolderOpen, Play, Save, Settings as Gear, X } from "lucide-react";
import { ActionMenu } from "@/components/ui/context-menu";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NAV_BAR, NAV_LABEL, NavActivePill, NavBrand, NavDivider, navLinkClass } from "@/components/nav-bar";
import { HoverPill } from "@/components/ui/hover-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoDot } from "@/components/ui/info-dot";
import { Modal } from "@/components/ui/modal";
import { OptionWall } from "@/components/ui/option-wall";
import { Reveal } from "@/components/ui/reveal";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils/cn";
import { emptyBoard, MAX_K, parse, serialize, type Board, type Problem } from "./board";
import { withPermutations } from "./corners";
import type { Check, Estimate, RaiseRule, Rule, Settings, Status } from "./bridge";
import { problemCount, ProblemList, Problems, VisualEditor } from "./editor";
import { DiskMap } from "./diskmap";
import { isStudy, MAX_ROWS, plainBoard, planStudy, readParams, substitute } from "./study";
import { DrawnAt, StudyFields, StudyRunFields, StudyView, type StudySettings } from "./studies";
import { Field, PRIORITY_HINT, PriorityInput, SettingsModal } from "./settings";
import {
	approx,
	bytes,
	duration,
	load,
	RULE_HINT,
	KField,
	RuleField as RulePicker,
	RunList,
	RunView,
	store,
	ThreadsInput,
	threadsHint,
} from "./runs";

const api = () => window.tilesearch;
const DRAFT = "tilesearch:draft";

const NEW_BOARD = serialize({
	...emptyBoard(),
	name: "my_board",
	angles: [{ sym: "A4", value: "90" }],
	faces: [{ word: ["A4"], repeat: 4 }],
	vertices: [{ word: ["A4", "A4", "A4", "A4"] }],
	// on by default: a search with Permutations off is the exception (Marek, 2026-10-29)
	permutations: true,
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

const LOOK_FOR = "tilesearch:look-for";
const STUDY_SETTINGS = "tilesearch:study";
const RAISE = "tilesearch:raise";
const K_HINT =
	"The number of vertex orbits: k = 1 is the uniform tilings, k = 2 the 2-uniform ones, and so on. Each step up costs far more than the last.";

/** A face's corners cut to their period, as a face line writes them: `A6p30 A6d270 x 6`. */
function periodic(w: string[]): string {
	let p = 1;
	while (p < w.length && (w.length % p || w.some((c, i) => c !== w[i % p]))) p++;
	return p < w.length ? `${w.slice(0, p).join(" ")} x ${w.length / p}` : w.join(" ");
}

/** A choice at the top of the board page, two cards of a title and a line: what the search promises, and
 *  whether it runs once or as a study. Each decides which settings follow. */
function Choice<T extends string | boolean>({
	label,
	hint,
	value,
	onChange,
	options,
}: {
	label: string;
	hint: React.ReactNode;
	value: T;
	onChange: (v: T) => void;
	options: { value: T; title: string; line: string }[];
}) {
	return (
		<div className="space-y-2">
			<div className="ta-label flex items-center gap-1.5">
				{label}
				<InfoDot>{hint}</InfoDot>
			</div>
			<OptionWall
				columns={2}
				options={options.map((o) => ({
					value: o.value,
					label: (
						<span className="block px-1 py-1.5 text-left">
							<span className="block text-sm font-semibold text-fg">{o.title}</span>
							<span className="mt-0.5 block text-xs leading-snug font-normal text-fg-secondary">{o.line}</span>
						</span>
					),
				}))}
				selected={value}
				onChange={onChange}
			/>
		</div>
	);
}

export function App() {
	const [text, setTextRaw] = useState(() => load(DRAFT) ?? NEW_BOARD);
	const [mode, setMode] = useState("visual");
	const [view, setView] = useState<"board" | "runs">("board");
	const [settings, setSettings] = useState<Settings | null>(null);
	const [showSettings, setShowSettings] = useState(false);
	const [status, setStatus] = useState<Status>({
		root: "",
		folders: [],
		runs: [],
		studies: [],
		freeBytes: 0,
		minFreeBytes: 10 * 2 ** 30,
	});
	const [selected, setSelected] = useState<string | null>(null);
	const [engine, setEngine] = useState<Check | null>(null);
	const [runK, setRunK] = useState<[number, number] | null>(null);
	const [runRule, setRunRule] = useState<Rule | undefined>(undefined);
	// "one": look for one tiling meeting every required set (tilesearch --find), at most findSeconds per k
	const [lookFor, setLookFor] = useState<"all" | "one">(() => (load(LOOK_FOR) === "one" ? "one" : "all"));
	useEffect(() => store(LOOK_FOR, lookFor), [lookFor]);
	const finding = lookFor === "one";
	const [findSeconds, setFindSeconds] = useState(120);
	const [studySettings, setStudySettings] = useState<StudySettings>(() => {
		try {
			return { parallel: 4, limitMinutes: 0, ...(JSON.parse(load(STUDY_SETTINGS) ?? "{}") as Partial<StudySettings>) };
		} catch {
			return { parallel: 4, limitMinutes: 0 };
		}
	});
	useEffect(() => store(STUDY_SETTINGS, JSON.stringify(studySettings)), [studySettings]);
	// raise k by itself after each search, by this rule (an enumeration only); kept for the next board
	const [raise, setRaise] = useState<RaiseRule | undefined>(() => {
		try {
			return (JSON.parse(load(RAISE) ?? "null") as RaiseRule | null) ?? undefined;
		} catch {
			return undefined;
		}
	});
	useEffect(() => store(RAISE, JSON.stringify(raise ?? null)), [raise]);
	const [message, setMessage] = useState("");
	const [askQuit, setAskQuit] = useState(false);
	const [askRun, setAskRun] = useState(false);
	// the boards that come with the app, for a first look
	const [examples, setExamples] = useState<{ title: string; text: string }[]>([]);
	useEffect(() => void api().examples().then(setExamples), []);
	const history = useRef<string[]>([]);

	// a board with parameters (vary n …) is edited as it is written, A{n} and x {n}, and drawn at one value of
	// each, the first unless another is picked; the engine's checks read the board at those values
	const params = useMemo(() => readParams(text), [text]);
	const parametric = params.params.length > 0;
	const [picked, setPicked] = useState<Record<string, number>>({});
	const vars = useMemo(
		() =>
			Object.fromEntries(
				params.params.map((p) => [p.name, p.values.includes(picked[p.name]) ? picked[p.name] : p.values[0]]),
			),
		[params, picked],
	);
	const instance = useMemo(() => (parametric ? substitute(text, vars) : null), [parametric, vars, text]);
	// a study is a board with optional faces or a parameter; picking "A study" shows its setup before either
	const [studyOn, setStudyOn] = useState(false);
	const study = studyOn || isStudy(text);
	const nothingVaries = study && !isStudy(text);
	// the study's rows and the checks that need no engine (a few tens of ms for thousands of rows): deferred, so
	// typing stays quick; the sidebar and the Run button share it
	const deferredText = useDeferredValue(text);
	const studyPlan = useMemo(() => (study ? planStudy(deferredText) : null), [study, deferredText]);
	const { board, problems: parsed } = useMemo(() => parse(text, parametric ? vars : undefined), [text, parametric, vars]);
	const engineBoard = useMemo(() => (instance ? parse(instance.text).board : board), [instance, board]);
	const found = useMemo(
		() => [
			...params.problems,
			// a {…} the board's parse did not already flag (one in a name, say)
			...(instance?.problems ?? []).filter((p) => !parsed.some((q) => q.line === p.line)),
			...parsed,
		],
		[params.problems, instance, parsed],
	);
	// what is unused waits for Run search: a board being built always has some
	const problems = useMemo(() => found.filter((p) => !p.beforeRun), [found]);
	const unused = found.filter((p) => p.beforeRun);
	const blocking = unused.some((p) => p.severity === "error"); // a missing name: no running anyway
	const setText = useCallback((t: string) => {
		setTextRaw((old) => {
			if (old !== t) history.current = [...history.current.slice(-199), old];
			return t;
		});
	}, []);
	// the board keeps its formulas ({n}, x {n}) on the way back to text
	const set = useCallback((b: Board) => setText(serialize(b)), [setText]);
	const loadBoard = useCallback((t: string) => (setText(t), setStudyOn(false), setRunK(null), setView("board")), [setText]);
	// back to one board: every face always on again (Cmd+Z brings the study back)
	const runAsStudy = (on: boolean) => {
		setStudyOn(on);
		if (!on && !parametric && isStudy(text)) set(plainBoard(board));
	};

	useEffect(() => store(DRAFT, text), [text]);
	// the engine rejects a board with no name; while the name is being typed, it checks with a stand-in, and
	// the missing name waits for Run search like the other before-the-search problems
	const engineText = study
		? serialize(plainBoard({ ...engineBoard, name: engineBoard.name || "untitled" }))
		: board.name
			? text
			: text.replace(/^name(?=[ \t]*(#|$))/m, "name untitled");
	useEffect(() => {
		const t = setTimeout(() => void api().check(engineText).then(setEngine), 250);
		return () => clearTimeout(t);
	}, [engineText]);
	useEffect(() => {
		void api().settings().then(setSettings);
		// the run on screen follows the run replacing it (its raise rule's next k, Raise k, Improve): to the new
		// search as it starts, so a raising run is watched to its end, and to it again when the old one is deleted
		const replacedBy = new Map<string, string>();
		let last: Status | null = null;
		const take = (s: Status) => {
			const before = last;
			last = s;
			for (const r of s.runs) if (r.replaces && r.replaces !== r.id) replacedBy.set(r.replaces, r.id);
			const shown = (id: string | undefined) => !!id && s.runs.some((r) => r.id === id);
			setSelected((sel) => {
				const was = sel ? before?.runs.find((r) => r.id === sel) : undefined;
				const now = sel ? s.runs.find((r) => r.id === sel) : undefined;
				if (!sel || !was || (now && !(now.raised && !was.raised))) return sel;
				// to the newest run of the chain still there
				let next = replacedBy.get(sel);
				for (let i = 0; i < 100 && next && (!shown(next) || shown(replacedBy.get(next))); i++) next = replacedBy.get(next);
				return shown(next) ? next! : sel;
			});
			setStatus(s);
		};
		void api().status().then(take);
		const off = api().onStatus(take);
		const offHook = api().onHook((h) => {
			if ("load" in h) loadBoard(h.load);
			if ("run" in h) document.getElementById("run-search")?.click();
		});
		const offQuit = api().onQuitRequest(() => setAskQuit(true));
		return () => (off(), offHook(), offQuit());
	}, [loadBoard]);
		// Esc on a run goes back to the disk map, unless a field or a dialog has it
	useEffect(() => {
		if (view !== "runs" || !selected) return;
		const onKey = (e: KeyboardEvent) => {
			const t = e.target instanceof HTMLElement ? e.target : null;
			if (e.key !== "Escape" || t?.closest("input, textarea, select, [role=dialog]") || document.querySelector("[role=dialog]"))
				return;
			setSelected(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [view, selected]);
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
	const studyShown = status.studies.find((s) => s.id === selected) ?? null;
	// a run that is a study's row goes back to its study
	const parentStudy = run
		? status.studies.find((s) => run.dir.startsWith(s.dir + "/") || run.dir.startsWith(s.dir + "\\"))
		: undefined;
	const options = settings ? { threads: settings.threads, nice: settings.nice } : { threads: 1, nice: 10 };

	const startStudy = async () => {
		const parallel = Math.max(1, studySettings.parallel);
		const res = await api().createStudy(text, board.name || "study", {
			mode: finding ? "find" : "enumerate",
			seconds: findSeconds,
			limit: studySettings.limitMinutes * 60,
			parallel,
			threads: Math.max(1, Math.floor(options.threads / parallel)),
			nice: options.nice,
			...(runRule && !finding ? { rule: runRule } : {}),
			...(raise && !finding ? { raise: { ...raise, upTo: board.kmax } } : {}),
		});
		setMessage(res.error ?? "");
		if (res.error) return;
		setSelected(res.id);
		setView("runs");
	};
	const start = async () => {
		if (study) return startStudy();
		const res = await api().start(text, board.name, {
			...options,
			// the hidden enumeration settings stay out of a find run
			...(raise && !finding
				? { k: [board.kmin, board.kmin], raise: { ...raise, upTo: board.kmax } }
				: runK && !finding
					? { k: runK }
					: {}),
			...(runRule && !finding ? { rule: runRule } : {}),
			...(finding ? { find: { seconds: findSeconds } } : {}),
		});
		setMessage(res.error ?? "");
		setSelected(res.id);
		setView("runs");
	};
	const saveSetting = (s: Partial<Pick<Settings, "threads" | "nice">>) => void api().setSettings(s).then(setSettings);

	const required = (
		<Field
			label={finding ? "Prove a tiling holding" : "Required sets"}
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
									{r.faces.length === 1 ? `face ${periodic(r.faces[0])}` : `one of ${r.faces.length} faces`}
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
	);
	const sidebar = (
		<aside className="flex w-[360px] shrink-0 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="space-y-5 p-5 pb-1">
					<Toggle leftValue="visual" rightValue="text" value={mode} onChange={setMode} />
					<Choice
						label="Search"
						hint="Enumerate finds every tiling up to k and counts them: the result is complete. Prove existence looks for one tiling that meets every required set and stops there. It first finds tilings for each two of the sets, then searches all of them together on only the vertices those tilings use, a board far smaller than yours. What it finds is a tiling; when it finds none, only its steps on the full board prove anything, and the run says which."
						value={lookFor}
						onChange={setLookFor}
						options={[
							{ value: "all", title: "Enumerate", line: "Every tiling up to k, counted and complete" },
							{ value: "one", title: "Prove existence", line: "One tiling that meets every required set" },
						]}
					/>
					<Choice
						label="Run"
						hint="One board is one search. A study is a search per row, the rows side by side on its own page: each combination of the faces you make optional (every set of the four stars beside the regular polygons, say), and each value of a parameter, like n in 3.4.n.4. Each row requires its optional faces and leaves the others out."
						value={study}
						onChange={runAsStudy}
						options={[
							{ value: false, title: "One board", line: "One search of the board as it is" },
							{ value: true, title: "A study", line: "A search per combination of faces, or per value of n" },
						]}
					/>
					{parametric ? (
						<p className="-mt-3 text-xs text-fg-muted">
							A board with parameters always runs as a study. Remove its parameters to run it once.
						</p>
					) : null}
				</div>

				<div className="px-5">
					<Reveal show={study}>
						<div className="space-y-5 pt-4">
							<StudyFields
								plan={studyPlan ?? planStudy(text, false)}
								board={board}
								set={set}
								text={text}
								setText={setText}
								vars={vars}
								examples={examples.filter((x) => isStudy(x.text))}
								onOpen={loadBoard}
							/>
						</div>
					</Reveal>
				</div>

				<div className="space-y-5 p-5">
					{finding ? required : null}
					{finding && !board.require.length ? (
						<p className="-mt-3 text-xs text-fg-muted">
							Nothing required yet: any tiling of the board will do. Require a face or a vertex set to ask a question.
						</p>
					) : null}
					{(() => {
						const range = (
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
									max={MAX_K}
									value={board.kmax}
									onChange={(e) => set({ ...board, kmax: Math.max(1, Number(e.target.value) || 1) })}
									className="w-20"
									aria-label="k to"
								/>
							</div>
						);
						return finding ? (
							<Field label="Up to k" hint={K_HINT}>
								{range}
							</Field>
						) : (
							// one range, or raised by itself from the board's lowest k to its highest
							<KField
								hint={K_HINT}
								range={range}
								rule={raise}
								onRule={setRaise}
								from={board.kmin}
								onFrom={(kmin) => set({ ...board, kmin })}
								upTo={board.kmax}
								onUpTo={(kmax) => set({ ...board, kmax })}
							/>
						);
					})()}
					<Field
						label="Permutations"
						hint={
							board.permutations
								? "On: a vertex lists which corners meet there, in any order. Each one stands for every distinct way to arrange its corners round the point. Turning it off spells each vertex out as those orders, so one order can be required on its own."
								: "Off: a vertex is exactly the order you arranged its corners in (a turned or mirrored order is the same vertex). Turning it on merges the orders of one set of corners into one vertex."
						}
					>
						<Toggle
							leftValue="off"
							rightValue="on"
							value={board.permutations ? "on" : "off"}
							onChange={(v) => {
								const next = withPermutations(board, v === "on");
								if (next) set(next);
							}}
						/>
					</Field>
					<Field
						label="Chiral only"
						hint="On: only the tilings with no mirror and no glide reflection among their symmetries, like the snub hexagonal tiling. A tiling and its mirror image still count once."
					>
						<Toggle
							leftValue="off"
							rightValue="on"
							value={board.chiral ? "on" : "off"}
							onChange={(v) => set({ ...board, chiral: v === "on" })}
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
					{finding ? null : required}
					<Problems
						list={problems.filter(
							(p) =>
								["name", "k", "initial", "require", "permutations", "board"].includes(p.where.kind) &&
								!params.problems.includes(p), // the study's setup shows those, under Parameters
						)}
					/>
				</div>

				<div className="space-y-5 p-5">
					<Field
						label={`Threads · ${options.threads}`}
						hint={settings ? threadsHint(settings.cores) : undefined}
					>
						<ThreadsInput
							value={options.threads}
							cores={settings?.cores ?? 1}
							onChange={(threads) => saveSetting({ threads })}
						/>
					</Field>
					<Field label="Priority" hint={PRIORITY_HINT}>
						<PriorityInput value={options.nice} onChange={(nice) => saveSetting({ nice })} />
					</Field>
					{study ? (
						<StudyRunFields
							settings={studySettings}
							onSettings={setStudySettings}
							cores={settings?.cores ?? 1}
							threads={options.threads}
						/>
					) : null}
					{finding ? (
						<Field
							label="Time limit"
							hint="Each step searches one k at a time, upward. A k that runs past this limit ends its step, and the search moves to the next step: a limit never makes it miss a tiling it reports, only stop looking sooner."
						>
							<div className="flex items-center gap-2 text-sm text-fg-secondary">
								<Input
									type="number"
									min={5}
									value={findSeconds}
									onChange={(e) => setFindSeconds(Math.max(5, Number(e.target.value) || 120))}
									className="w-20"
									aria-label="Seconds per k"
								/>
								seconds per k, in each step
							</div>
						</Field>
					) : null}
					{finding || study || raise ? null : (
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
										max={MAX_K}
										value={runK[1]}
										onChange={(e) => setRunK([runK[0], Math.min(MAX_K, Math.max(runK[0], Number(e.target.value) || 1))])}
										className="w-20"
										aria-label="Run k to"
									/>
								</div>
							) : null}
						</Field>
					)}
					{finding ? null : (
						<Field label="Branching rule" hint={RULE_HINT}>
							<RulePicker rule={runRule} onChange={setRunRule} />
						</Field>
					)}
					{finding || study ? null : (
						<SizeEstimate text={engineText} k={runK} rule={runRule} disabled={!!engineError || errors.length > 0} />
					)}
					<Field label="Output folder" hint="Every run stops when the disk drops under 10 GB free.">
						<div className="flex items-center gap-2">
							<span
								className="min-w-0 flex-1 truncate font-mono text-xs text-fg-secondary"
								title={status.root}
								dir="rtl"
							>
								{status.root}
							</span>
							<Button size="sm" label="Change…" onClick={() => void api().chooseRoot().then(setSettings)} />
						</div>
						<p className={cn("text-xs", lowDisk ? "text-danger" : "text-fg-muted")}>
							{bytes(status.freeBytes)} free{lowDisk ? ": under 10 GB, runs cannot start." : ""}
						</p>
					</Field>
				</div>
			</div>
			<div className="space-y-2 px-5 py-4">
				<Button
					id="run-search"
					variant="primary"
					fullWidth
					icon={Play}
					label={
						study
							? `${finding ? "Prove each row" : "Run study"}${nothingVaries ? "" : ` · ${(studyPlan?.rows ?? 0).toLocaleString("en")} row${studyPlan?.rows === 1 ? "" : "s"}`}`
							: finding
								? "Find a tiling"
								: "Run search"
					}
					disabled={
						!!engineError ||
						errors.length > 0 ||
						lowDisk ||
						(study && (nothingVaries || !studyPlan?.rows || studyPlan.rows > MAX_ROWS || studyPlan.problems.length > 0))
					}
					onClick={() => (unused.length ? setAskRun(true) : void start())}
				/>
				{message ? <p className="text-xs text-danger">{message}</p> : null}
			</div>
		</aside>
	);

	return (
		<div className="flex h-full flex-col bg-surface">
			{/* the atlas's own bar (components/nav-bar.tsx) */}
			<header className={cn(NAV_BAR, "h-12 bg-transparent")}>
				<div className="mr-4 flex shrink-0 items-center gap-2">
					<NavBrand name="The Tiling Searcher" version={settings?.version ?? ""} />
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
				<Button size="icon" variant="ghost" icon={Gear} aria-label="Settings" onClick={() => setShowSettings(true)} />
				<ThemeToggle />
			</header>
			{showSettings && settings ? (
				<SettingsModal settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />
			) : null}

			{view === "board" ? (
				<div className="flex min-h-0 flex-1 pr-2 pb-2">
					{sidebar}
					<main className="ts-sheet flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
						<header className="flex items-center gap-3">
							<Input
								value={board.name}
								onChange={(e) => set({ ...board, name: e.target.value.replace(/\s|#/g, "_") })}
								className="max-w-sm text-base font-semibold"
								aria-label="Board name"
							/>
							<div className="ml-auto flex gap-1.5">
								<Button size="sm" variant="ghost" icon={FilePlus} label="New" onClick={() => loadBoard(NEW_BOARD)} />
								<ActionMenu
									label="Example boards"
									trigger={<Button size="sm" variant="ghost" icon={BookOpen} label="Examples" />}
									items={examples.map((x) => ({ label: x.title.split(":")[0], onSelect: () => loadBoard(x.text) }))}
								/>
								<Button
									size="sm"
									variant="ghost"
									icon={FolderOpen}
									label="Open…"
									onClick={async () => {
										const f = await api().openBoard();
										if (f) loadBoard(f.text);
									}}
								/>
								<Button
									size="sm"
									variant="ghost"
									icon={Save}
									label="Save…"
									onClick={() => void api().saveBoard(text, board.name || "untitled")}
								/>
							</div>
						</header>
						{mode === "visual" ? (
							<div className="space-y-4">
								{parametric ? (
									<DrawnAt params={params.params} vars={vars} onPick={(p, v) => setPicked((x) => ({ ...x, [p]: v }))} />
								) : null}
								<VisualEditor
									b={board}
									set={set}
									problems={problems}
									{...(parametric ? { vars, checkText: engineText } : {})}
								/>
							</div>
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
				<div className="flex min-h-0 flex-1 pr-2 pb-2">
					<aside className="w-[360px] shrink-0 overflow-y-auto">
						<RunList status={status} selected={run?.id ?? null} onSelect={setSelected} />
					</aside>
					<main className="ts-sheet min-w-0 flex-1 overflow-hidden">
						{studyShown ? (
							<StudyView
								summary={studyShown}
								status={status}
								options={options}
								cores={settings?.cores ?? 1}
								onEdit={loadBoard}
								onSelect={setSelected}
							/>
						) : run ? (
							<div className="flex h-full flex-col">
								{parentStudy ? (
									<div className="px-5 pt-4">
										<Button
											size="sm"
											variant="ghost"
											icon={ChevronLeft}
											label={parentStudy.name}
											onClick={() => setSelected(parentStudy.id)}
										/>
									</div>
								) : null}
								<div className="min-h-0 flex-1">
									<RunView
										run={run}
										status={status}
										options={options}
										cores={settings?.cores ?? 1}
										onEdit={loadBoard}
										onSelect={setSelected}
									/>
								</div>
							</div>
						) : (
							<DiskMap status={status} onSelect={setSelected} />
						)}
					</main>
				</div>
			)}
			<Modal
				isOpen={askRun}
				onOpenChange={setAskRun}
				title={`${problemCount(unused)} before the search`}
				size="md"
				description={
					blocking
						? "The search cannot start until these are fixed"
						: "These parts of the board are not used, so the search leaves them out"
				}
				footer={
					<div className="flex justify-end gap-2">
						<Button label="Back to the board" onClick={() => setAskRun(false)} />
						{blocking ? null : (
							<Button variant="primary" icon={Play} label="Run anyway" onClick={() => (setAskRun(false), void start())} />
						)}
					</div>
				}
			>
				<ProblemList list={unused} />
			</Modal>
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
			description="Quitting the Tiling Searcher stops the searches that are running"
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
