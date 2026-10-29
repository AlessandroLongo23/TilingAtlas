// The tilings a run found, drawn: a grid of the tilings in one certificate file, and the selected one
// large, with its certificate beside it. Every drawing is the site's own: a tiling of the plane through
// the flat cell renderer of the /theory cards (a colouring through its palette), an edge system through
// the freedraw canvas, and the hyperbolic plane through the disk, each steered as on the site.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ParametricEdgesCanvas } from "@/components/freedraw/parametric-edges-view";
import { FreedrawThumbnail } from "@/components/freedraw/freedraw-thumbnail";
import { HyperbolicCanvas } from "@/components/hyperbolic-canvas";
import { HyperbolicThumbnail } from "@/components/hyperbolic-thumbnail";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dropdown } from "@/components/ui/dropdown";
import { FloatingToolbar } from "@/components/ui/floating-toolbar";
import { InfoDot } from "@/components/ui/info-dot";
import { Toggle } from "@/components/ui/toggle";
import { ToggleButton } from "@/components/ui/toggle-button";
import type { FreedrawPattern } from "@/lib/freedraw/pattern";
import { useFlatCellPreview } from "@/lib/hooks/useFlatCellPreview";
import { useDiskInput } from "@/lib/render/diskInput";
import type { HypDiskMode, HypDiskTiling } from "@/lib/render/hypDisk";
import type { OrbitData } from "@/lib/services/orbitsFromExactSource";
import type { SymmetryData } from "@/lib/classes/symmetry/types";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import { cn } from "@/lib/utils/cn";
import { useConfiguration } from "@/lib/stores/configuration";
import { edgeTypes, parse, type Board } from "./board";
import type { OutFile, Run } from "./bridge";
import { morphTurn, pointsAt, useFold, type Family } from "./fold";
import {
	certificatesIn,
	decode,
	flatCellWithOverlays,
	flatPattern,
	faceColors,
	isColoring,
	marksEdges,
	geometry,
	hyperbolicDarts,
	vertexWords,
	withSymbols,
} from "./develop";
import { bytes } from "./runs";

const READ_BYTES = 256 * 1024;
const READ_BUDGET = 8 * 2 ** 20;
const THUMBS = 60;

type Drawing =
	/** A tiling or a colouring of the plane: one period, for the flat cell renderer, its vertex orbits, and its
	 *  wallpaper group on demand (null for a colouring). */
	| {
			kind: "cell";
			cell: TranslationalCellData;
			/** A colouring read by its colours: drawn without tile outlines unless the grid is on. */
			plain: boolean;
			orbits: OrbitData;
			symmetry: (() => SymmetryData | null) | null;
	  }
	/** An edge system of the plane (a board that marks edges with digons): the freedraw renderer. */
	| { kind: "edges"; pattern: FreedrawPattern; cells: number }
	/** The site's disk: `tiling` fills faces by polygon size (the hyp-poly shelf), `edges` draws a board that
	 *  marks edges with digons, its marked edges bold over the faint rest. */
	| { kind: "disk"; tiling: HypDiskTiling; mode: HypDiskMode }
	| { kind: "none"; message: string };

/** A colouring whose tiles are plain polygons (not bubbles, whose curved outlines are their shapes). */
const plainColoring = (board: Board) =>
	isColoring(board) && ![...edgeTypes(board).values()].some((e) => e.style === "bump" || e.style === "bite");

/** Decode, choose the geometry, develop. Everything that can go wrong comes back as a message. */
function prepare(board: Board, cert: string, id: string, points?: Map<string, number>): Drawing {
	try {
		const g = geometry(board, vertexWords(cert));
		if (g.kind === "none") return g;
		const d = decode(cert, board);
		if (g.kind === "plane") {
			// a family's member drawn with its stars' points moved along the slider
			const turn = points ? morphTurn(board, g.turn, points) : g.turn;
			if (!marksEdges(board)) return { kind: "cell", plain: plainColoring(board), ...flatCellWithOverlays(d, board, turn) };
			const pattern = flatPattern(d, board, g.turn, id);
			const span = Math.max(Math.hypot(...pattern.patch!.T1), Math.hypot(...pattern.patch!.T2));
			return { kind: "edges", pattern, cells: Math.max(10, span * 1.6) };
		}
		const darts = hyperbolicDarts(d, g, board);
		if (darts.sizes.includes(2)) return { kind: "disk", tiling: { id, edge: g.edge, darts }, mode: "edges" };
		// faces of one shape told apart by their corners (bubble tiles, a colouring): one colour per board face
		if (isColoring(board))
			return { kind: "disk", tiling: { id, edge: g.edge, darts, colors: faceColors(board).count }, mode: "colors" };
		return { kind: "disk", tiling: { id, edge: g.edge, darts }, mode: "tiling" };
	} catch (e) {
		return { kind: "none", message: (e as Error).message };
	}
}

/** The underlying grid: a plain colouring's tile outlines, or an edge pattern's undrawn edges. */
function GridToggle({ on, flip, edges }: { on: boolean; flip: () => void; edges?: boolean }) {
	return (
		<ToggleButton
			size="sm"
			pressed={on}
			onPressedChange={flip}
			label="Grid"
			title={
				edges
					? "The edges the pattern does not draw, faint (G)"
					: "Every tile's outline; without it the colours alone show where tiles meet (G)"
			}
		/>
	);
}

const ALWAYS = { current: true };
const FRAME = "h-full w-full overflow-hidden bg-surface";

/** The overlays /play draws over a flat tiling, each its own toggle. */
type Overlays = { orbits: boolean; symmetry: boolean; domain: boolean; grid: boolean };

/** A tiling of the plane, as the /theory cards draw one: drag, scroll to zoom, Shift-scroll to turn. With
 *  `orbitData`, /play's orbit mode: tiles dimmed, a dot per vertex coloured by orbit, the hovered orbit grown;
 *  with `symmetryData`, /play's mirrors, glides and rotation centres and the fundamental domain. */
function CellView({
	cell,
	plain,
	orbitData,
	symmetryData,
	show,
}: {
	cell: TranslationalCellData;
	plain: boolean;
	orbitData: OrbitData;
	symmetryData: SymmetryData | null;
	show: Overlays;
}) {
	const { hostRef, pointerProps } = useFlatCellPreview({
		cell,
		orbitData: show.orbits ? orbitData : null,
		symmetryData,
		showSymmetryElements: show.symmetry,
		showFundamentalDomain: show.domain,
		homePeriods: 3,
		active: true,
		keepView: true,
		lineWidth: plain && !show.grid ? 0 : 1,
	});
	return (
		<div
			ref={hostRef}
			{...pointerProps}
			role="application"
			aria-label="Tiling: drag to move, scroll to zoom"
			className={cn(FRAME, "relative cursor-grab touch-none select-none active:cursor-grabbing")}
		/>
	);
}

/** The hyperbolic disk, with the gestures of the site's embedded disks. */
function DiskView({ tiling, mode }: { tiling: HypDiskTiling; mode: HypDiskMode }) {
	const hostRef = useRef<HTMLDivElement>(null);
	const { inputRef, handlers } = useDiskInput(hostRef, ALWAYS);
	return (
		<div
			ref={hostRef}
			{...handlers}
			role="application"
			aria-label="Hyperbolic tiling: drag to move, scroll to turn"
			className="relative h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
		>
			<HyperbolicCanvas tiling={tiling} mode={mode} input={inputRef} diskPadPx={0} />
		</div>
	);
}

/** The selected tiling, large and steerable. Keyed per tiling by the caller, so each opens centred. */
function BigView({ drawing, show, symmetry }: { drawing: Drawing; show: Overlays; symmetry: SymmetryData | null }) {
	if (drawing.kind === "cell")
		return (
			<CellView cell={drawing.cell} plain={drawing.plain} orbitData={drawing.orbits} symmetryData={symmetry} show={show} />
		);
	if (drawing.kind === "edges")
		return (
			<div className={FRAME}>
				<ParametricEdgesCanvas built={{ pattern: drawing.pattern, reason: null, cells: drawing.cells }} />
			</div>
		);
	if (drawing.kind === "disk") return <DiskView tiling={drawing.tiling} mode={drawing.mode} />;
	return (
		<div className="flex h-full w-full items-center justify-center bg-surface-sunken p-6 text-center text-sm text-fg-muted">
			{drawing.message}
		</div>
	);
}

function Thumb({ drawing, grid }: { drawing: Drawing; grid: boolean }) {
	if (drawing.kind === "cell")
		return <TilingThumbnail translationalCell={drawing.cell} periodsAcross={2} outline={!drawing.plain || grid} />;
	if (drawing.kind === "edges") return <FreedrawThumbnail pattern={drawing.pattern} />;
	if (drawing.kind === "disk") return <HyperbolicThumbnail tiling={drawing.tiling} mode={drawing.mode} />;
	return (
		<div className="flex h-full w-full items-center justify-center p-2 text-center text-[11px] text-fg-muted">
			Not drawn
		</div>
	);
}

/** The thumbnails draw one per frame, so a grid of them never blocks the window. */
function useQueued<T>(items: T[], make: (t: T, i: number) => Drawing): (Drawing | undefined)[] {
	const [done, setDone] = useState<(Drawing | undefined)[]>([]);
	useEffect(() => {
		let i = 0;
		let raf = 0;
		const out: (Drawing | undefined)[] = [];
		setDone([]);
		const step = () => {
			const t0 = performance.now();
			for (; i < items.length && performance.now() - t0 < 12; i++) out[i] = make(items[i], i);
			setDone([...out]);
			if (i < items.length) raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [items, make]);
	return done;
}

/** Which tilings are shown: k (the vertex orbits), then the edge orbits; "all" takes every value. */
export type Group = { k: number | "all"; edges: number | "all" };

const holds = (g: Group, f: OutFile) => (g.k === "all" || f.k === g.k) && (g.edges === "all" || f.edges === g.edges);
/** The certificate files a group reads. */
export const filesOf = (run: Run, g: Group) => run.files.filter((f) => holds(g, f));

/** The group shown: the one asked for when the run has files for it, else the first k, every edge orbit. */
export function resolveGroup(run: Run, group: Group | null): Group | null {
	if (group && filesOf(run, group).length) return group;
	const f = run.files[0];
	return f ? { k: f.k, edges: "all" } : null;
}

/** Another k, keeping the edge orbits picked when that k has them. */
export const groupOfK = (run: Run, k: Group["k"], edges: Group["edges"] = "all"): Group =>
	filesOf(run, { k, edges }).length ? { k, edges } : { k, edges: "all" };

const sorted = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);

/** The two pickers, k and then the edge orbits, for the panel's head. */
export function GroupPicker({ run, group, onGroup }: { run: Run; group: Group | null; onGroup: (g: Group) => void }) {
	const g = resolveGroup(run, group);
	if (!g) return null;
	const ks = sorted(run.files.map((f) => f.k));
	const edgeCounts = sorted(filesOf(run, { k: g.k, edges: "all" }).map((f) => f.edges));
	const files = filesOf(run, g).length;
	return (
		<>
			<InfoDot side="bottom" label="What these are">
				k is the number of vertex orbits, then the number of edge orbits. These tilings come from{" "}
				{files === 1
					? "one certificate file."
					: `${files} certificate files, which differ in the corners they use and in orientability.`}
			</InfoDot>
			<Dropdown<Group["k"]>
				value={g.k}
				options={[{ value: "all", label: "All k" }, ...ks.map((k) => ({ value: k, label: `k = ${k}` }))]}
				onChange={(k) => onGroup(groupOfK(run, k, g.edges))}
				ariaLabel="Vertex orbits"
			/>
			<Dropdown<Group["edges"]>
				value={g.edges}
				options={[
					{ value: "all", label: "All edge orbits" },
					...edgeCounts.map((e) => ({ value: e, label: `${e} edge orbit${e === 1 ? "" : "s"}` })),
				]}
				onChange={(edges) => onGroup({ k: g.k, edges })}
				ariaLabel="Edge orbits"
			/>
		</>
	);
}

const editable = (t: EventTarget | null) =>
	t instanceof HTMLElement &&
	(t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest("[role=dialog]"));

/**
 * The tilings of one group, as a workbench that fits the panel: the selected tiling large on a square
 * stage (steer it as on the site; step with the arrows over it or the ← → keys), and beside it every
 * tiling as a thumbnail over the selected one's certificate.
 */
export function TilingsView({ run, group }: { run: Run; group: Group | null }) {
	// The files' texts, tagged with the files they were read from: until the new group's files are read,
	// it shows nothing, never the last group's tilings under the new group's ids (a drawing's id names
	// its tiling, and the disk keeps its camera for an id it has seen: a stale tiling left it on a face
	// the real one lacks, a grey disk).
	const [read, setRead] = useState<{ key: string; texts: string[] }>({ key: "", texts: [] });
	const g = resolveGroup(run, group);
	const files = g ? filesOf(run, g) : [];
	// Up to READ_BYTES of each file, and at most READ_BUDGET over the group: "All" can span hundreds.
	const reading: OutFile[] = [];
	for (let i = 0, used = 0; i < files.length && used < READ_BUDGET; i++) {
		reading.push(files[i]);
		used += Math.min(files[i].bytes, READ_BYTES);
	}
	const id = g ? `${g.k}/${g.edges}` : "";
	// the selected tiling, per group: another group opens at its first
	const [pick, setPick] = useState({ id: "", i: 0 });
	const i = pick.id === id ? pick.i : 0;
	const setI = (n: number) => setPick({ id, i: n });
	const [names, setNames] = useState("board");
	const [show, setShow] = useState<Overlays>({ orbits: false, symmetry: false, domain: false, grid: false });
	// an edge pattern's grid is the freedraw renderer's scaffold, a setting of its own store
	useEffect(() => useConfiguration.getState().set({ freedrawScaffold: show.grid }), [show.grid]);
	const flip = (key: keyof Overlays) => setShow((s) => ({ ...s, [key]: !s[key] }));
	const filesKey = reading.map((f) => `${f.path}:${f.bytes}`).join("|");
	useEffect(() => {
		let live = true;
		const paths = filesKey ? filesKey.split("|").map((p) => p.slice(0, p.lastIndexOf(":"))) : [];
		void Promise.all(paths.map((p) => window.tilesearch.readFile(p, READ_BYTES))).then(
			(t) => live && setRead({ key: filesKey, texts: t }),
		);
		return () => {
			live = false;
		};
	}, [filesKey]); // keyed on the paths and sizes: the file objects are new on every status update
	const fresh = read.key === filesKey ? read.texts : null;
	const board = useMemo(() => parse(run.board).board, [run.board]);
	const symbolsKey = JSON.stringify(run.symbols);
	// the certificates as the engine printed them, and with its X<n> labels read back as the board's symbols
	// once the run is folded, a family shows once: its first member stands for it
	const fold = useFold(run.id);
	const family = fold && "view" in fold ? fold.view.family : null;
	const [raw, certs] = useMemo(() => {
		const symbols = JSON.parse(symbolsKey) as Record<string, string>;
		const pairs = (fresh ?? [])
			.flatMap(certificatesIn)
			.map((c) => [c, withSymbols(c, symbols)] as const)
			.filter(([, c]) => !family?.has(c) || family.get(c)!.members[0] === c);
		return [pairs.map(([c]) => c), pairs.map(([, c]) => c)];
		// keyed on the symbols' contents: every status update carries a new object, and a new list here
		// re-develops every drawing (that was an idle window at 54% CPU)
	}, [fresh, symbolsKey, family]);
	const thumbs = useMemo(() => certs.slice(0, THUMBS), [certs]);
	const make = useMemo(() => (c: string, j: number) => prepare(board, c, `${id}#${j}`), [board, id]);
	const drawn = useQueued(thumbs, make);
	const shown = Math.min(i, Math.max(0, certs.length - 1));
	// a family's slider: 0 at its first member, members − 1 at its last
	const member = certs[shown] ? family?.get(certs[shown]) : undefined;
	// the same object every render, so the drawing below develops again only when the slider moves
	const fam = member?.points ? (member as Family & { points: Map<string, number>[] }) : undefined;
	const [slide, setSlide] = useState({ key: "", t: 0 });
	const t = slide.key === `${id}#${shown}` ? slide.t : 0;
	// the drawing follows the slider when it can: developing a tiling takes longer than a drag's step
	const drawnT = useDeferredValue(t);
	const big = useMemo(
		() =>
			certs[shown]
				? prepare(board, certs[shown], `${id}#${shown}`, fam && drawnT ? pointsAt(fam, drawnT) : undefined)
				: null,
		[board, certs, shown, id, fam, drawnT],
	);
	// the wallpaper group, worked out exactly the first time an overlay asks for it
	const wantSymmetry = show.symmetry || show.domain;
	const symmetry = useMemo(
		() => (wantSymmetry && big?.kind === "cell" && big.symmetry ? big.symmetry() : null),
		[big, wantSymmetry],
	);
	// ← and → step through the tilings, and O, S and D toggle the overlays as on /play, unless the keys
	// belong to a field or a dialog
	const count = certs.length;
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (editable(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
			const overlay = ({ o: "orbits", s: "symmetry", d: "domain", g: "grid" } as const)[
				e.key.toLowerCase() as "o" | "s" | "d" | "g"
			];
			if (overlay) return flip(overlay);
			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
			e.preventDefault();
			setPick({ id, i: Math.max(0, Math.min(count - 1, shown + (e.key === "ArrowLeft" ? -1 : 1))) });
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [id, shown, count]);
	const grid = useRef<HTMLDivElement>(null);
	useEffect(() => {
		grid.current?.querySelector("[aria-current=true]")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [shown, id]);

	if (!g)
		return (
			<div className="flex h-full items-center justify-center p-8 text-sm text-fg-muted">
				No certificate files yet: they appear as roots finish.
			</div>
		);
	const partFiles = files.some((f) => f.bytes > READ_BYTES);
	const truncated = partFiles || reading.length < files.length;
	const total = `${certs.length.toLocaleString("en")}${truncated ? "+" : ""}`;
	const body = (names === "board" ? certs : raw)[shown] ?? "";
	const where =
		big?.kind === "cell" || big?.kind === "edges"
			? "Drag to move, scroll to zoom, Shift-scroll to turn, double-click to go back. ← and → step through the tilings."
			: big?.kind === "disk"
				? `Regular faces of edge ${big.tiling.edge.toFixed(4)} in the Poincaré disk. Drag to move, scroll to turn, click a tile to bring it to the centre, right-click to go back. ← and → step through the tilings.`
				: "";
	return (
		<div className="grid h-full grid-cols-[auto_minmax(0,1fr)]">
			<div className="relative aspect-square h-full overflow-hidden border-r border-line-subtle bg-surface">
				{big ? (
					<BigView key={`${id}#${shown}`} drawing={big} show={show} symmetry={symmetry} />
				) : (
					<div className="h-full w-full animate-pulse bg-surface-sunken" />
				)}
				{fam ? (
					<div className="absolute inset-x-3 top-14 rounded-control bg-surface-raised/95 px-3 py-2 shadow-sm ring-1 ring-line-subtle backdrop-blur-sm">
						<div className="flex items-center justify-between gap-2 text-xs text-fg-secondary">
							<span className="font-medium text-fg">Family of {fam.members.length}</span>
							<span className="font-mono tabular-nums">
								{[...pointsAt(fam, t)]
									.map(([sp, deg]) => `${sp.split("/")[0]}-star point ${+deg.toFixed(1)}°`)
									.join(" · ")}
							</span>
						</div>
						<input
							type="range"
							min={0}
							max={fam.members.length - 1}
							step={0.02}
							value={t}
							onChange={(e) => setSlide({ key: `${id}#${shown}`, t: Number(e.target.value) })}
							aria-label="Move the stars' points through the family"
							className="mt-1.5 w-full accent-[var(--color-accent)]"
						/>
					</div>
				) : null}
				{where ? (
					<div className="absolute top-3 left-3 flex rounded-full bg-surface-raised/95 p-1 shadow-sm ring-1 ring-line-subtle backdrop-blur-sm">
						<InfoDot side="right" label="How to move the drawing">
							{where}
						</InfoDot>
					</div>
				) : null}
				{big?.kind === "edges" ? (
					<div className="absolute top-3 right-3 flex rounded-control bg-surface-raised/95 p-1 shadow-sm backdrop-blur-sm">
						<GridToggle on={show.grid} flip={() => flip("grid")} edges />
					</div>
				) : null}
				{big?.kind === "cell" ? (
					<div className="absolute top-3 right-3 flex gap-1 rounded-control bg-surface-raised/95 p-1 shadow-sm backdrop-blur-sm">
						{big.plain ? <GridToggle on={show.grid} flip={() => flip("grid")} /> : null}
						<ToggleButton
							size="sm"
							pressed={show.orbits}
							onPressedChange={() => flip("orbits")}
							label="Vertex orbits"
							title="Dot every vertex by its orbit; hover a dot to light its orbit (O)"
						/>
						{(
							[
								[
									"symmetry",
									symmetry ? `Symmetry ${symmetry.group}` : "Symmetry",
									"Mirrors, glides and rotation centres (S)",
								],
								["domain", "Fundamental domain", "One fundamental domain of the wallpaper group, in its cell (D)"],
							] as const
						).map(([key, label, title]) => {
							// on but with no group: a colouring, or angles off the 15° grid the exact analysis needs
							const none = !big.symmetry || (wantSymmetry && !symmetry);
							return (
								<ToggleButton
									key={key}
									size="sm"
									pressed={show[key] && !none}
									onPressedChange={() => flip(key)}
									disabled={!big.symmetry}
									label={label}
									title={
										big.symmetry
											? none
												? "No wallpaper group: an angle of this board is off the 15° grid"
												: title
											: "A colouring's symmetry is not worked out here"
									}
								/>
							);
						})}
					</div>
				) : null}
				{certs.length > 1 ? (
					<FloatingToolbar>
						<Button
							size="icon"
							variant="ghost"
							icon={ChevronLeft}
							aria-label="Previous tiling"
							disabled={shown === 0}
							onClick={() => setI(shown - 1)}
						/>
						<span className="min-w-16 px-1 text-center font-mono text-xs text-fg-secondary tabular-nums">
							{(shown + 1).toLocaleString("en")} / {total}
						</span>
						<Button
							size="icon"
							variant="ghost"
							icon={ChevronRight}
							aria-label="Next tiling"
							disabled={shown >= certs.length - 1}
							onClick={() => setI(shown + 1)}
						/>
					</FloatingToolbar>
				) : null}
			</div>

			<div className="flex min-h-0 min-w-0 flex-col">
				<div className="flex shrink-0 items-center gap-1.5 px-4 pt-3.5 pb-2.5">
					<span className="ta-label">
						{!certs.length
							? "Reading"
							: thumbs.length < certs.length
								? `The first ${thumbs.length} of ${total}`
								: `All ${total}`}
					</span>
					{truncated ? (
						<InfoDot side="bottom" label="Why the count ends in +">
							{partFiles ? `Showing the tilings in the first ${bytes(READ_BYTES)} of each certificate file` : "Showing"}
							{reading.length < files.length
								? `${partFiles ? ", from" : " the tilings of"} the first ${reading.length} of these ${files.length} files`
								: ""}
							; the whole files are in the run folder.
						</InfoDot>
					) : null}
				</div>
				<div ref={grid} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
					<div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2">
						{thumbs.map((_, j) => (
							<button
								key={j}
								type="button"
								onClick={() => setI(j)}
								aria-current={j === shown}
								aria-label={`Tiling ${j + 1}`}
								className={cn(
									"group relative aspect-square cursor-pointer overflow-hidden rounded-control bg-surface ring-1 transition-[box-shadow] duration-150",
									j === shown ? "ring-2 ring-accent" : "ring-line-subtle hover:ring-line-strong",
								)}
							>
								{drawn[j] ? (
									<Thumb drawing={drawn[j]!} grid={show.grid} />
								) : (
									<div className="h-full w-full animate-pulse bg-surface-sunken" />
								)}
								{family?.has(certs[j]) ? (
									<span className="absolute top-1 left-1 rounded-[4px] bg-accent px-1 font-mono text-[10px] text-accent-contrast tabular-nums">
										×{family.get(certs[j])!.members.length}
									</span>
								) : null}
								<span
									className={cn(
										"absolute right-1 bottom-1 rounded-[4px] px-1 font-mono text-[10px] tabular-nums",
										j === shown ? "bg-accent text-accent-contrast" : "bg-surface-raised/90 text-fg-muted",
									)}
								>
									{j + 1}
								</span>
							</button>
						))}
					</div>
				</div>
				<div className="flex h-[38%] min-h-36 shrink-0 flex-col border-t border-line-subtle">
					<div className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-2">
						<span className="ta-label flex-1">Certificate {certs.length ? shown + 1 : ""}</span>
						{Object.keys(run.symbols).length ? (
							<div className="w-40">
								<Toggle leftValue="board" rightValue="engine" value={names} onChange={setNames} padding="py-0.5 px-2" />
							</div>
						) : null}
						{body ? <CopyButton text={body} /> : null}
					</div>
					<pre className="min-h-0 flex-1 overflow-auto px-4 pb-3 font-mono text-[11px] leading-relaxed text-fg">
						{body || (certs.length ? "" : "This file has no complete tiling yet.")}
					</pre>
				</div>
			</div>
		</div>
	);
}
