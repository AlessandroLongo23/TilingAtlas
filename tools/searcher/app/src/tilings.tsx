// The tilings a run found, drawn: a grid of the tilings in one certificate file, and the selected one
// large, with its certificate beside it. Every drawing is the site's own: a tiling of the plane through
// the flat cell renderer of the /theory cards (a colouring through its palette), an edge system through
// the freedraw canvas, and the hyperbolic plane through the disk, each steered as on the site.
import { Check, ChevronLeft, ChevronRight, Copy, Maximize, Minimize, Shuffle } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ParametricEdgesCanvas } from "@/components/freedraw/parametric-edges-view";
import { FreedrawThumbnail } from "@/components/freedraw/freedraw-thumbnail";
import { HyperbolicCanvas } from "@/components/hyperbolic-canvas";
import { HyperbolicThumbnail } from "@/components/hyperbolic-thumbnail";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { Badge } from "@/design-system/components/badge";
import { Button } from "@/design-system/components/button";
import { OptionWall } from "@/design-system/components/option-wall";
import { CopyButton } from "@/design-system/components/copy-button";
import { ColumnPicker, type Column } from "@/design-system/components/column-chart";
import { Popover } from "@/design-system/components/popover";
import { FloatingToolbar } from "@/design-system/components/floating-toolbar";
import { InfoDot } from "@/design-system/components/info-dot";
import { RangeInput } from "@/design-system/components/range-input";
import { Tooltip } from "@/design-system/components/tooltip";
import type { FreedrawPattern } from "@/lib/freedraw/pattern";
import { useFlatCellPreview } from "@/lib/hooks/useFlatCellPreview";
import { useDiskInput } from "@/lib/render/diskInput";
import type { HypDiskMode, HypDiskTiling } from "@/lib/render/hypDisk";
import { dartShapeIds, patchShapeIds, rankShapes, type ShapeRanks } from "@/lib/render/tileShapes";
import type { OrbitData } from "@/lib/services/orbitsFromExactSource";
import type { SymmetryData } from "@/lib/classes/symmetry/types";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import { cn } from "@/lib/utils/cn";
import { useConfiguration } from "@/lib/stores/configuration";
import { edgeTypes, minpolyAt, minpolys, parse, polyText, searchesFaces, type Board } from "./board";
import type { OutFile, Run } from "./bridge";
import { morphTurn, pointsAt, useFold, type Family } from "./fold";
import {
	certificatesIn,
	abstractBoard,
	decode,
	flatCellWithOverlays,
	flatPattern,
	faceColors,
	isColoring,
	marksEdges,
	geometry,
	hyperbolicDarts,
	vertexWordsOf,
	withSymbols,
} from "./develop";
import { bytes, parentOf } from "./runs";

/** Enough of a file for its first tiling, in the one-per-file view. */
const FIRST_BYTES = 64 * 1024;
/** The most text a group reads: whole files, in order, until it is spent ("All" can span hundreds). */
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
	| { kind: "disk"; tiling: HypDiskTiling; mode: HypDiskMode; plain: boolean }
	| { kind: "none"; message: string };

/** A colouring whose tiles are plain polygons (not bubbles, whose curved outlines are their shapes). */
const plainColoring = (board: Board) =>
	isColoring(board) && ![...edgeTypes(board).values()].some((e) => e.style === "bump" || e.style === "bite");

/** Decode, choose the geometry, develop. Everything that can go wrong comes back as a message. */
function prepare(
	board: Board,
	cert: string,
	id: string,
	points?: Map<string, number>,
	byShape = false,
	abstract = false,
): Drawing {
	try {
		// abstract: each apeirogon drawn as the polygon its rings close up into (abstractBoard)
		if (abstract) board = abstractBoard(board, decode(cert, board)) ?? board;
		const g = geometry(board, vertexWordsOf(cert, board));
		if (g.kind === "none") return g;
		const d = decode(cert, board);
		if (g.kind === "plane") {
			// a family's member drawn with its stars' points moved along the slider
			const turn = points ? morphTurn(board, g.turn, points) : g.turn;
			if (!marksEdges(board))
				return { kind: "cell", plain: plainColoring(board), ...flatCellWithOverlays(d, board, turn, byShape) };
			const pattern = flatPattern(d, board, g.turn, id);
			const span = Math.max(Math.hypot(...pattern.patch!.T1), Math.hypot(...pattern.patch!.T2));
			return { kind: "edges", pattern, cells: Math.max(10, span * 1.6) };
		}
		const darts = hyperbolicDarts(d, g, board, byShape);
		// an edge system: digons, or drawn and hidden sides
		if (darts.sizes.includes(2) || darts.drawn)
			return { kind: "disk", tiling: { id, edge: g.edge, darts }, mode: "edges", plain: false };
		// faces of one shape told apart by their corners (bubble tiles, a colouring): one colour per board face
		if (isColoring(board))
			return {
				kind: "disk",
				tiling: { id, edge: g.edge, darts, colors: faceColors(board).count },
				mode: "colors",
				plain: plainColoring(board),
			};
		return { kind: "disk", tiling: { id, edge: g.edge, darts, faceHue: byShape }, mode: "tiling", plain: false };
	} catch (e) {
		return { kind: "none", message: (e as Error).message };
	}
}

/** The underlying grid: a plain colouring's tile outlines, or an edge pattern's undrawn edges. */
function GridToggle({ on, flip, edges }: { on: boolean; flip: () => void; edges?: boolean }) {
	return (
		<Tooltip
			shortcut="G"
			label={
				edges
					? "The edges the pattern does not draw, faint"
					: "Every tile's outline; without it the colours alone show where tiles meet"
			}
		>
			<Button size="sm" variant="ghost" pressed={on} onClick={flip} label="Grid" />
		</Tooltip>
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
		// opens at 3.5 periods across, or at 16 px an edge where that draws them smaller (a large cell shows fewer)
		homePeriods: 3.5,
		homeZoomMin: 16,
		active: true,
		keepView: true,
		lineWidth: plain && !show.grid ? 0 : 1,
		// zoomed all the way out, about five periods of this tiling across, large cell or small
		zoomOutPeriods: 5,
		// fullscreen enlarges the same view
		scaleWithHost: true,
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

/** A hyperbolic tiling's edge, and the minimal polynomial of cosh of it when its board names one. */
function EdgeLine({ edge, poly }: { edge: number; poly: string | null }) {
	return (
		<div className="flex shrink-0 items-center gap-2 border-b border-line-subtle px-4 py-2 text-small text-fg-secondary">
			<span className="ta-label">Edge</span>
			<span className="font-mono text-fg tabular-nums">{+edge.toFixed(7)}</span>
			<span
				className="min-w-0 flex-1 truncate font-mono"
				title={poly ? `cosh of the edge is a root of ${polyText(poly)}` : undefined}
			>
				{poly ? `cosh: ${polyText(poly)}` : ""}
			</span>
			{poly ? <CopyButton text={poly} /> : null}
		</div>
	);
}

/** The hyperbolic disk, with the gestures of the site's embedded disks. */
function DiskView({ tiling, mode, outline }: { tiling: HypDiskTiling; mode: HypDiskMode; outline: boolean }) {
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
			<HyperbolicCanvas tiling={tiling} mode={mode} input={inputRef} diskPadPx={0} outline={outline} />
		</div>
	);
}

/** A disk edge system's tiling with the run's shape colour order, the same object while both stay. */
const useRanked = (drawing: Drawing, ranks?: ShapeRanks) =>
	useMemo(
		() => (drawing.kind === "disk" && ranks ? { ...drawing.tiling, shapeRanks: ranks } : drawing.kind === "disk" ? drawing.tiling : null),
		[drawing, ranks],
	);

/** The selected tiling, large and steerable. Keyed per tiling by the caller, so each opens centred. */
function BigView({
	drawing,
	show,
	symmetry,
	ranks,
}: {
	drawing: Drawing;
	show: Overlays;
	symmetry: SymmetryData | null;
	ranks?: ShapeRanks;
}) {
	const tiling = useRanked(drawing, ranks);
	if (drawing.kind === "cell")
		return (
			<CellView
				cell={drawing.cell}
				plain={drawing.plain}
				orbitData={drawing.orbits}
				symmetryData={symmetry}
				show={show}
			/>
		);
	if (drawing.kind === "edges")
		return (
			<div className={FRAME}>
				<ParametricEdgesCanvas
					built={{ pattern: drawing.pattern, reason: null, cells: drawing.cells }}
					shapeRanks={ranks}
				/>
			</div>
		);
	if (drawing.kind === "disk")
		return <DiskView tiling={tiling!} mode={drawing.mode} outline={!drawing.plain || show.grid} />;
	return (
		<div className="flex h-full w-full items-center justify-center bg-surface-sunken p-6 text-center text-body text-fg-muted">
			{drawing.message}
		</div>
	);
}

function Thumb({ drawing, grid, ranks }: { drawing: Drawing; grid: boolean; ranks?: ShapeRanks }) {
	const tiling = useRanked(drawing, ranks);
	if (drawing.kind === "cell")
		return <TilingThumbnail translationalCell={drawing.cell} periodsAcross={2} outline={!drawing.plain || grid} />;
	if (drawing.kind === "edges") return <FreedrawThumbnail pattern={drawing.pattern} shapeRanks={ranks} />;
	if (drawing.kind === "disk")
		return <HyperbolicThumbnail tiling={tiling!} mode={drawing.mode} outline={!drawing.plain || grid} />;
	return (
		<div className="flex h-full w-full items-center justify-center p-2 text-center text-caption text-fg-muted">
			Not drawn
		</div>
	);
}

/** Previews drawn, by run and the files they came from: a run hovered again shows them at once. */
const previewCache = new Map<string, (Drawing | undefined)[]>();

/** A few of a run's tilings, small: the first tiling of each of its first files, then more of the first file. */
export function RunPreviews({ run, count = 3 }: { run: Run; count?: number }) {
	const paths = run.files
		.slice(0, count)
		.map((f) => f.path)
		.join("|");
	const key = `${run.id}|${paths}`;
	const cached = previewCache.get(key);
	const symbolsKey = JSON.stringify(run.symbols);
	const [certs, setCerts] = useState<string[] | null>(null);
	useEffect(() => {
		if (previewCache.has(key)) return;
		let live = true;
		const ps = paths ? paths.split("|") : [];
		// a run the pointer only crosses is never read: reading and drawing start once it rests on one
		const wait = setTimeout(
			() =>
				void Promise.all(ps.map((p) => window.tilesearch.readFile(p, FIRST_BYTES))).then(
					(texts) => {
						const per = texts.map((t) => certificatesIn(t));
						const picks = per.flatMap((c) => c.slice(0, 1));
						for (const c of per[0] ?? []) if (picks.length < count && !picks.includes(c)) picks.push(c);
						const symbols = JSON.parse(symbolsKey) as Record<string, string>;
						if (live) setCerts(picks.slice(0, count).map((c) => withSymbols(c, symbols)));
					},
					() => {},
				),
			80,
		);
		return () => {
			live = false;
			clearTimeout(wait);
		};
	}, [key, paths, symbolsKey, count]);
	const board = useMemo(() => parse(run.board).board, [run.board]);
	const make = useMemo(() => (c: string, j: number) => prepare(board, c, `preview:${run.id}#${j}`), [board, run.id]);
	const drawn = useQueued(certs ?? [], make);
	useEffect(() => {
		if (!certs?.length || drawn.length < certs.length || !drawn.every(Boolean)) return;
		previewCache.set(key, drawn);
		if (previewCache.size > 100) previewCache.delete(previewCache.keys().next().value!);
	}, [certs, drawn, key]);
	const shown = cached ?? drawn;
	if (!cached && certs && !certs.length) return <p className="text-small text-fg-muted">No tilings yet.</p>;
	return (
		<div className="grid grid-cols-3 gap-1.5">
			{Array.from({ length: count }, (_, j) => (
				<div key={j} className="aspect-square overflow-hidden rounded-control bg-surface-sunken">
					{shown[j] ? <Thumb drawing={shown[j]} grid={false} /> : null}
				</div>
			))}
		</div>
	);
}

/** The thumbnails draw one per frame, so a grid of them never blocks the window; with `near`, only those in
 *  view or close to it. A k = 21 tiling takes 0.1 s to develop, so sixty were six seconds of a stuttering
 *  window, most of them for thumbnails out of sight. */
function useQueued<T>(
	items: T[],
	make: (t: T, i: number) => Drawing,
	near?: ReadonlySet<number>,
): (Drawing | undefined)[] {
	type Made = { items: T[]; make: typeof make; out: (Drawing | undefined)[] };
	const [done, setDone] = useState<Made | null>(null);
	// what is made so far, for these items and this maker: kept while `near` grows
	const made = useRef<Made | null>(null);
	useEffect(() => {
		if (made.current?.items !== items || made.current.make !== make) made.current = { items, make, out: [] };
		const { out } = made.current;
		const wanted = (i: number) => out[i] === undefined && (!near || near.has(i));
		let raf = 0;
		const step = () => {
			const t0 = performance.now();
			for (let i = 0; i < items.length && performance.now() - t0 < 12; i++) if (wanted(i)) out[i] = make(items[i], i);
			setDone({ items, make, out: [...out] });
			if (items.some((_, i) => wanted(i))) raf = requestAnimationFrame(step);
		};
		if (items.some((_, i) => wanted(i))) raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [items, make, near]);
	return done?.items === items && done.make === make ? done.out : [];
}

/** Which tilings are shown: k (the vertex orbits), the edge orbits and the face orbits; "all" takes every value. */
export type Group = { k: number | "all"; edges: number | "all"; faces: number | "all" };

// a file's name gives its k and edge orbits; its face orbits differ tiling to tiling, counted in it (OutFile.faces),
// so a file not counted yet may hold some
const holds = (g: Group, f: OutFile) =>
	(g.k === "all" || f.k === g.k) &&
	(g.edges === "all" || f.edges === g.edges) &&
	(g.faces === "all" || !f.faces || !!f.faces[g.faces]);
/** The certificate files a group reads. */
export const filesOf = (run: Run, g: Group) => run.files.filter((f) => holds(g, f));

const ALL: Omit<Group, "k"> = { edges: "all", faces: "all" };
/** The group shown: the one asked for when the run has files for it, else the first k, every orbit count. */
export function resolveGroup(run: Run, group: Group | null): Group | null {
	if (group && filesOf(run, group).length) return group;
	const f = run.files[0];
	return f ? { k: f.k, ...ALL } : null;
}

/** Another k, keeping the edge and face orbits picked where that k has them. */
export function groupOfK(run: Run, k: Group["k"], from?: Group | null): Group {
	const tries: Group[] = [{ ...ALL, ...from, k }, { ...ALL, k, edges: from?.edges ?? "all" }, { k, ...ALL }];
	return tries.find((g) => filesOf(run, g).length) ?? tries[2];
}

const sorted = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);

/** The pickers for the panel's head: k, then the edge orbits and the face orbits, each a chart of its tilings. */
export function GroupPicker({ run, group, onGroup }: { run: Run; group: Group | null; onGroup: (g: Group) => void }) {
	const g = resolveGroup(run, group);
	const [open, setOpen] = useState<"edges" | "faces" | null>(null);
	// a tile-orbit search (`search faces`) ran on the board with faces and vertices swapped: its k counts tile
	// orbits, and the face lines of its certificates are this board's vertex orbits
	const swapped = useMemo(() => searchesFaces(parse(run.board).board), [run.board]);
	const faceNoun = swapped ? "vertex orbit" : "face orbit";
	// the counts are read from the files themselves (electron/runs.ts countTilings), once, when a picker opens:
	// from each run the files come from (a study's whole board reads many)
	const sizes = run.files.map((f) => `${f.path}:${f.bytes}`).join("|");
	useEffect(() => {
		if (open)
			for (const dir of new Set(run.files.map((f) => parentOf(parentOf(f.path))))) void window.tilesearch.countFiles(dir);
	}, [open, sizes]); // eslint-disable-line react-hooks/exhaustive-deps
	if (!g) return null;
	const files = filesOf(run, g).length;
	// the tilings at this k by edge orbits (of the face orbits picked) and by face orbits (of the edge orbits
	// picked), each over a ghost of every tiling at this k while the other picker filters
	const inK = filesOf(run, { k: g.k, ...ALL });
	const inEdges = inK.filter((f) => g.edges === "all" || f.edges === g.edges);
	const withFaces = (x: number) => (f: OutFile) => (f.faces ? (f.faces[x] ?? 0) : null);
	const byEdges = sorted(inK.map((f) => f.edges)).map((e) => {
		const of = inK.filter((f) => f.edges === e);
		const all = tally(of, (f) => f.tilings);
		return column(e, "edge orbit", g.faces === "all" ? all : tally(of, withFaces(g.faces)), g.faces === "all" ? null : all, g.faces, faceNoun);
	});
	const byFaces = sorted(inK.flatMap((f) => Object.keys(f.faces ?? {}).map(Number))).map((x) => {
		const all = tally(inK, withFaces(x));
		return column(x, faceNoun, g.edges === "all" ? all : tally(inEdges, withFaces(x)), g.edges === "all" ? null : all, g.edges, "edge orbit");
	});
	const counting = inK.filter((f) => !f.faces).length;
	// a pick the other picker's choice has no tilings for lets that choice go
	const pick = (key: "edges" | "faces") => (v: number | "all") => {
		const want = { ...g, [key]: v };
		onGroup(filesOf(run, want).length ? want : { ...want, [key === "edges" ? "faces" : "edges"]: "all" });
		setOpen(null);
	};
	return (
		<>
			<InfoDot side="bottom" label="What these are">
				The numbers of edge and {faceNoun}s, at the k picked in the chart of tilings per k (k is the number of{" "}
				{swapped ? "tile" : "vertex"} orbits; click the picked column again for every k). These tilings come from{" "}
				{files === 1
					? "one certificate file."
					: `${files} certificate files, which differ in the corners they use and in orientability.`}
			</InfoDot>
			<OrbitPicker
				noun="edge orbit"
				axis="e"
				at={g.k}
				value={g.edges}
				columns={byEdges}
				onPick={pick("edges")}
				open={open === "edges"}
				onOpen={(o) => setOpen(o ? "edges" : null)}
				ghost={g.faces === "all" ? null : `with any number of ${faceNoun}s`}
				note={inK.some((f) => f.tilings === null || (g.faces !== "all" && !f.faces)) ? "Counting the tilings in the files…" : null}
			/>
			<OrbitPicker
				noun={faceNoun}
				axis={swapped ? "v" : "t"}
				at={g.k}
				value={g.faces}
				columns={byFaces}
				onPick={pick("faces")}
				open={open === "faces"}
				onOpen={(o) => setOpen(o ? "faces" : null)}
				ghost={g.edges === "all" ? null : "with any number of edge orbits"}
				note={
					counting
						? `Counting the ${faceNoun}s in ${counting === inK.length ? "the" : `${counting} more of the`} files…`
						: null
				}
			/>
		</>
	);
}

type Tally = { count?: number; part: boolean };
/** The tilings of `files` by `of`, as far as they are counted: their sum, and whether a file is not counted yet. */
function tally(files: OutFile[], of: (f: OutFile) => number | null): Tally {
	const known = files.map(of).filter((c): c is number => c !== null);
	return { count: known.length ? known.reduce((a, b) => a + b, 0) : undefined, part: known.length < files.length };
}

/**
 * A column of an orbit picker: the tilings with x orbits under the other picker's choice (`other`, `otherNoun`),
 * and while that choice filters, every tiling with x orbits (`all`) as a ghost behind them.
 */
function column(x: number, noun: string, shown: Tally, all: Tally | null, other: Group["edges"], otherNoun: string): Column {
	const many = (v: number, w: string) => `${v.toLocaleString("en")} ${w}${v === 1 ? "" : "s"}`;
	const { count, part } = shown;
	const ghost = all?.count;
	const tip =
		count === undefined
			? "not counted yet"
			: all
				? `${count ? count.toLocaleString("en") : "none"} with ${many(+other, otherNoun)}, of ${many(ghost ?? 0, "tiling")}${count ? "" : ". Picking it shows them all"}`
				: many(count, "tiling");
	return {
		x,
		count,
		behind: all ? ghost : undefined,
		part: part || !!all?.part,
		disabled: !part && !count && !ghost,
		tip: `${many(x, noun)}: ${tip}${part && count !== undefined ? " so far" : ""}`,
	};
}

/** A choice of how many orbits, as columns of the tilings with each number, in a popover off a field. */
function OrbitPicker({
	noun,
	axis,
	at,
	value,
	columns,
	onPick,
	open,
	onOpen,
	ghost,
	note,
}: {
	noun: string;
	/** The letter under the scale: e, t (face orbits are tile orbits) or v. */
	axis: string;
	/** The k the columns count, for the title. */
	at: Group["k"];
	value: number | "all";
	columns: Column[];
	onPick: (v: number | "all") => void;
	open: boolean;
	onOpen: (open: boolean) => void;
	/** What the pale columns behind stand for, while the other picker filters. */
	ghost: string | null;
	/** Why the columns are not all there yet. */
	note: string | null;
}) {
	return (
		<Popover
			face={value === "all" ? `All ${noun}s` : `${value} ${noun}${value === 1 ? "" : "s"}`}
			aria-label={noun[0].toUpperCase() + noun.slice(1) + "s"}
			open={open}
			onOpenChange={onOpen}
			popupClassName="p-3"
		>
			<div className="max-w-full" style={{ width: Math.max(340, 64 + columns.length * 28) }}>
				<ColumnPicker
					columns={columns}
					value={value}
					onChange={onPick}
					axis={axis}
					title={`Tilings by ${noun}s, ${at === "all" ? "every k" : `k = ${at}`}`}
					allLabel={`All ${noun}s`}
					ghost={ghost}
					note={note}
				/>
			</div>
		</Popover>
	);
}

/** How many of a run's tilings its shape colour order is read from: the first in k order, where its small
 *  shapes turn up, within this much of their text. */
const RANK_SAMPLE = 400;
const RANK_BYTES = 2 * 2 ** 20;

/** The shape ids of a drawing's tiles: a plane edge system's components, a disk edge system's faces. */
const shapeIdsOf = (d: Drawing): string[] =>
	d.kind === "edges" && d.pattern.patch
		? patchShapeIds(d.pattern.patch)
		: d.kind === "disk" && d.mode === "edges"
			? dartShapeIds(d.tiling.darts, d.tiling.edge)
			: [];

/**
 * A run's colour order for its edge systems' tile shapes (lib/render/tileShapes.ts), so a shape keeps one colour
 * across the run: the shapes in most of its first tilings (k ascending) first. A finished run's order is saved
 * as shapes.json in its folder and read back from there, so it never moves; a running one's is worked out anew.
 */
function useShapeRanks(run: Run, board: Board): ShapeRanks | undefined {
	const [ranks, setRanks] = useState<{ dir: string; ranks: ShapeRanks } | null>(null);
	const edges = marksEdges(board);
	const finished = run.state === "finished";
	const filesKey = run.files.map((f) => f.path).join("|");
	const symbolsKey = JSON.stringify(run.symbols);
	useEffect(() => {
		if (!edges || !filesKey) return;
		let live = true;
		const sep = run.dir.includes("\\") ? "\\" : "/";
		void (async () => {
			const saved = await window.tilesearch
				.readFile(run.dir + sep + "shapes.json", 0)
				.then((t) => (JSON.parse(t) as { shapes: string[] }).shapes)
				.catch(() => null);
			if (saved?.length) return live && setRanks({ dir: run.dir, ranks: new Map(saved.map((s, i) => [s, i])) });
			const symbols = JSON.parse(symbolsKey) as Record<string, string>;
			const files = [...run.files].sort((a, b) => a.k - b.k || a.name.localeCompare(b.name));
			const tilings: string[][] = [];
			let left = RANK_BYTES;
			for (const f of files) {
				if (!live || tilings.length >= RANK_SAMPLE || left <= 0) break;
				const text = await window.tilesearch.readFile(f.path, left);
				left -= text.length;
				for (const c of certificatesIn(text).slice(0, RANK_SAMPLE - tilings.length)) {
					tilings.push(shapeIdsOf(prepare(board, withSymbols(c, f.symbols ?? symbols), `rank#${tilings.length}`)));
					// a tiling at a time, between frames: the page stays live while the order is read
					await new Promise((r) => setTimeout(r));
					if (!live) return;
				}
			}
			if (!live || !tilings.length) return;
			const order = rankShapes(tilings);
			setRanks({ dir: run.dir, ranks: order });
			if (finished) void window.tilesearch.saveShapes(run.dir, JSON.stringify({ shapes: [...order.keys()] }));
		})().catch(() => {});
		return () => void (live = false);
	}, [run.dir, edges, finished, filesKey, symbolsKey, board]); // eslint-disable-line react-hooks/exhaustive-deps
	return ranks?.dir === run.dir ? ranks.ranks : undefined;
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
	const [read, setRead] = useState<{ key: string; texts: string[]; cut: boolean }>({ key: "", texts: [], cut: false });
	const g = resolveGroup(run, group);
	const files = g ? filesOf(run, g) : [];
	// one per file: each file's first tiling, which spans the corners, edge orbits and orientability at once
	const [firsts, setFirsts] = useState(false);
	const id = g ? `${g.k}/${g.edges}/${g.faces}${firsts ? "/firsts" : ""}` : "";
	// the selected tiling, per group: another group opens at its first
	const [pick, setPick] = useState({ id: "", i: 0 });
	const i = pick.id === id ? pick.i : 0;
	const setI = (n: number) => setPick({ id, i: n });
	const [names, setNames] = useState("board");
	const stage = useRef<HTMLDivElement>(null);
	const [copying, setCopying] = useState<"capturing" | "copied" | null>(null);
	// the drawing over the whole window
	const [full, setFull] = useState(false);
	const [show, setShow] = useState<Overlays>({ orbits: false, symmetry: false, domain: false, grid: false });
	// an edge pattern's grid is the freedraw renderer's scaffold, a setting of its own store
	useEffect(() => useConfiguration.getState().set({ freedrawScaffold: show.grid }), [show.grid]);
	const flip = (key: keyof Overlays) => setShow((s) => ({ ...s, [key]: !s[key] }));
	const filesKey = `${firsts}|${g?.faces ?? "all"}|` + files.map((f) => `${f.path}:${f.bytes}`).join("|");
	useEffect(() => {
		let live = true;
		const [heads, faces, ...rest] = filesKey.split("|");
		// a face orbit count picked: the app reads out only those certificates, each whole
		const only = faces === "all" ? undefined : Number(faces);
		const paths = rest.filter(Boolean).map((p) => p.slice(0, p.lastIndexOf(":")));
		// The budget counts the text as read: a gzipped file's size on disk says little of it (a 30 KB file
		// held 1.1 MB). A file that ends short of its closing "---" was cut there.
		void (async () => {
			const texts: string[] = [];
			let [left, cut] = [READ_BUDGET, false];
			for (const p of paths) {
				if (left <= 0) {
					cut = true;
					break;
				}
				const max = heads === "true" ? Math.min(FIRST_BYTES, left) : left;
				const t = await window.tilesearch.readFile(p, max, only);
				texts.push(t);
				left -= t.length;
				if (heads !== "true" && (t.length >= max || (only === undefined && !/---\n\s*$/.test(t)))) cut = true;
			}
			if (live) setRead({ key: filesKey, texts, cut });
		})().catch(() => {}); // the run deleted under it (a raise's run replacing it): the next status moves on
		return () => {
			live = false;
		};
	}, [filesKey]); // keyed on the paths and sizes: the file objects are new on every status update
	const fresh = read.key === filesKey ? read.texts : null;
	const board = useMemo(() => parse(run.board).board, [run.board]);
	const ranks = useShapeRanks(run, board);
	// the edge's minimal polynomial: a study row's board carries it (since 2026-11-05), an older run's study has it
	const [studyHeader, setStudyHeader] = useState<string[]>([]);
	useEffect(() => {
		if (minpolys(board.header).length) return;
		let live = true;
		const sep = run.dir.includes("\\") ? "\\" : "/";
		window.tilesearch
			.readFile(run.dir.slice(0, run.dir.lastIndexOf(sep)) + sep + "study.board", 0)
			.then((t) => void (live && setStudyHeader(parse(t).board.header)))
			.catch(() => {});
		return () => void (live = false);
	}, [run.dir, board]);
	const symbolsKey = JSON.stringify(run.symbols);
	// a study's whole board reads the files of many runs, each with its own X<n> labels (OutFile.symbols)
	const fileSymbols = JSON.stringify(files.some((f) => f.symbols) ? files.map((f) => f.symbols ?? {}) : null);
	// the certificates as the engine printed them, and with its X<n> labels read back as the board's symbols
	// once the run is folded, a family shows once: its first member stands for it
	const fold = useFold(run.id);
	const family = fold && "view" in fold ? fold.view.family : null;
	const [raw, certs] = useMemo(() => {
		const symbols = JSON.parse(symbolsKey) as Record<string, string>;
		const perFile = JSON.parse(fileSymbols) as Record<string, string>[] | null;
		const pairs = (fresh ?? [])
			.flatMap((text, j) =>
				(firsts ? certificatesIn(text).slice(0, 1) : certificatesIn(text)).map(
					(c) => [c, withSymbols(c, perFile?.[j] ?? symbols)] as const,
				),
			)
			.filter(([, c]) => !family?.has(c) || family.get(c)!.members[0] === c);
		return [pairs.map(([c]) => c), pairs.map(([, c]) => c)];
		// keyed on the symbols' contents: every status update carries a new object, and a new list here
		// re-develops every drawing (that was an idle window at 54% CPU)
	}, [fresh, symbolsKey, fileSymbols, family, firsts]);
	const thumbs = useMemo(() => certs.slice(0, THUMBS), [certs]);
	// one colour per board face, not per side count: offered where faces are plain tiles (not a colouring's
	// palette or an edge pattern), and where two faces of the board could otherwise share a colour
	const [shapes, setShapes] = useState(false);
	const canShape = !isColoring(board) && !marksEdges(board) && board.faces.length > 1;
	const byShape = shapes && canShape;
	// apeirogons drawn as finite polygons, offered where the board has one
	const [abstractOn, setAbstract] = useState(false);
	const canAbstract = board.faces.some((f) => f.repeat === "inf");
	const abstract = abstractOn && canAbstract;
	const make = useMemo(
		() => (c: string, j: number) => prepare(board, c, `${id}#${j}${abstract ? "a" : ""}`, undefined, byShape, abstract),
		[board, id, byShape, abstract],
	);
	// the thumbnails in view or a row from it (gridObserver below), anew for each list
	const [near, setNear] = useState<{ of: string[]; at: ReadonlySet<number> }>({ of: thumbs, at: new Set() });
	if (near.of !== thumbs) setNear({ of: thumbs, at: new Set() });
	const drawn = useQueued(thumbs, make, near.at);
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
				? prepare(
						board,
						certs[shown],
						`${id}#${shown}${abstract ? "a" : ""}`,
						fam && drawnT ? pointsAt(fam, drawnT) : undefined,
						byShape,
						abstract,
					)
				: null,
		[board, certs, shown, id, fam, drawnT, byShape, abstract],
	);
	// before any root closes: the engine's latest find, from a root still open (it rewrites it every 30 s)
	const latestText = !files.length ? run.latest?.text : undefined;
	const latest = useMemo(() => {
		const cert = latestText && certificatesIn(latestText)[0];
		return cert
			? prepare(board, withSymbols(cert, JSON.parse(symbolsKey)), `latest#${cert.length}`, undefined, byShape, abstract)
			: null;
	}, [latestText, board, symbolsKey, byShape, abstract]);
	// the wallpaper group, worked out exactly the first time an overlay asks for it
	const wantSymmetry = show.symmetry || show.domain;
	const symmetry = useMemo(
		() => (wantSymmetry && big?.kind === "cell" && big.symmetry ? big.symmetry() : null),
		[big, wantSymmetry],
	);
	// ← and → step through the tilings, O, S and D toggle the overlays as on /play and F fullscreen, unless
	// the keys belong to a field or a dialog
	const count = certs.length;
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (editable(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
			const overlay = ({ o: "orbits", s: "symmetry", d: "domain", g: "grid" } as const)[
				e.key.toLowerCase() as "o" | "s" | "d" | "g"
			];
			if (overlay) return flip(overlay);
			if (e.key.toLowerCase() === "f" && count) return setFull((f) => !f);
			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
			e.preventDefault();
			setPick({ id, i: Math.max(0, Math.min(count - 1, shown + (e.key === "ArrowLeft" ? -1 : 1))) });
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [id, shown, count]);
	// Esc leaves fullscreen, caught before the app's own Esc, which would close the run
	useEffect(() => {
		if (!full) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || editable(e.target)) return;
			e.stopImmediatePropagation();
			setFull(false);
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [full]);
	const grid = useRef<HTMLDivElement>(null);
	useEffect(() => {
		grid.current?.querySelector("[aria-current=true]")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [shown, id]);
	useEffect(() => {
		const root = grid.current;
		if (!root) return;
		const io = new IntersectionObserver(
			(es) => {
				const seen = es.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.thumb));
				if (seen.length) setNear((n) => (n.of === thumbs ? { of: thumbs, at: new Set([...n.at, ...seen]) } : n));
			},
			{ root, rootMargin: "120px 0px" },
		);
		root.querySelectorAll("[data-thumb]").forEach((el) => io.observe(el));
		return () => io.disconnect();
	}, [thumbs]);

	if (!g && latest)
		return (
			<div className="flex h-full flex-col">
				<div className="relative min-h-0 flex-1">
					<BigView key={latestText} drawing={latest} show={show} symmetry={null} ranks={ranks} />
				</div>
				<p className="border-t border-line-subtle px-5 py-2.5 text-small text-fg-muted">
					The latest tiling found, in a root still open; it changes every 30 seconds or so. A run shows its tilings once
					their roots finish, and a stop drops the roots still open, this one with them.
				</p>
			</div>
		);
	if (!g)
		return (
			<div className="flex h-full items-center justify-center p-8 text-body text-fg-muted">
				{run.options?.find
					? run.find?.done
						? "No tiling was found, so there is nothing to show."
						: "The tiling shows here once one is found."
					: "No certificate files yet: they appear as roots finish."}
			</div>
		);
	const truncated = read.key === filesKey && read.cut;
	const total = `${certs.length.toLocaleString("en")}${truncated ? "+" : ""}`;
	const body = (names === "board" ? certs : raw)[shown] ?? "";
	const copy = async () => {
		setCopying("capturing");
		// two frames: the controls hide, then the window repaints without them
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
		const r = stage.current!.getBoundingClientRect();
		await window.tilesearch.copyImage({ x: r.x, y: r.y, width: r.width, height: r.height });
		setCopying("copied");
		setTimeout(() => setCopying(null), 1500);
	};
	const where =
		big?.kind === "cell" || big?.kind === "edges"
			? "Drag to move, scroll to zoom, Shift-scroll to turn, double-click to go back. ← and → step through the tilings."
			: big?.kind === "disk"
				? `Regular faces of edge ${big.tiling.edge.toFixed(4)} in the Poincaré disk. Drag to move, scroll to turn, click a tile to bring it to the centre, right-click to go back. ← and → step through the tilings.`
				: "";
	return (
		<div className="grid h-full grid-cols-[auto_minmax(0,1fr)]">
			{/* the stage's place in the layout, kept while the stage itself fills the window */}
			<div className="relative aspect-square h-full border-r border-line-subtle">
			<div
				ref={stage}
				className={cn(
					"overflow-hidden bg-surface",
					// ds-check: keep (the stage lifts itself over the window, its live canvas and view intact; a Modal would remount it in a portal)
					full ? "fixed inset-0 z-modal" : "absolute inset-0",
					// the controls over the drawing stay out of a copied image
					copying === "capturing" && "[&>*:not(:first-child)]:invisible",
				)}
			>
				{big ? (
					<BigView key={`${id}#${shown}`} drawing={big} show={show} symmetry={symmetry} ranks={ranks} />
				) : (
					<div className="h-full w-full animate-pulse bg-surface-sunken" />
				)}
				{fam ? (
					<div className="ta-float absolute inset-x-3 top-14 px-3 py-2">
						<div className="flex items-center justify-between gap-2 text-small text-fg-secondary">
							<span className="font-medium text-fg">Family of {fam.members.length}</span>
							<span className="font-mono tabular-nums">
								{[...pointsAt(fam, t)]
									.map(([sp, deg]) => `${sp.split("/")[0]}-star point ${+deg.toFixed(1)}°`)
									.join(" · ")}
							</span>
						</div>
						<RangeInput
							min={0}
							max={fam.members.length - 1}
							step={0.02}
							value={t}
							onChange={(v) => setSlide({ key: `${id}#${shown}`, t: v })}
							aria-label="Move the stars' points through the family"
							className="mt-1.5 w-full"
						/>
					</div>
				) : null}
				{where ? (
					<div className="ta-float absolute top-3 left-3 flex p-1">
						<InfoDot side="right" label="How to move the drawing">
							{where}
						</InfoDot>
					</div>
				) : null}
				{/* the drawing's toggles, one bar: the grid where a drawing has one, and a tiling's overlays */}
				{big && big.kind !== "none" && (big.kind !== "disk" || big.plain || big.mode === "edges") ? (
					// held clear of the top-left dot ("How to move the drawing"): a narrow drawing wraps the bar to a second line
					// instead of laying it over the dot
					<div className="pointer-events-none absolute top-3 right-3 left-14 flex justify-end">
						<div className="ta-float pointer-events-auto flex flex-wrap justify-end gap-1 p-1">
							{big.kind === "edges" || big.plain || (big.kind === "disk" && big.mode === "edges") ? (
								<GridToggle
									on={show.grid}
									flip={() => flip("grid")}
									edges={big.kind === "edges" || (big.kind === "disk" && big.mode === "edges")}
								/>
							) : null}
							{big.kind === "cell" ? (
								<>
									<Tooltip label="Dot every vertex by its orbit; hover a dot to light its orbit" shortcut="O">
										<Button
											size="sm"
											variant="ghost"
											pressed={show.orbits}
											onClick={() => flip("orbits")}
											label="Vertex orbits"
										/>
									</Tooltip>
									{(
										[
											[
												"symmetry",
												symmetry ? `Symmetry ${symmetry.group}` : "Symmetry",
												"Mirrors, glides and rotation centres",
											],
											["domain", "Fundamental domain", "One fundamental domain of the wallpaper group, in its cell"],
										] as const
									).map(([key, label, title]) => {
										// on but with no group: a colouring, or angles off the 15° grid the exact analysis needs
										const none = !big.symmetry || (wantSymmetry && !symmetry);
										return (
											<Tooltip
												key={key}
												shortcut={big.symmetry && !none ? (key === "symmetry" ? "S" : "D") : undefined}
												label={
													big.symmetry
														? none
															? "No wallpaper group: an angle of this board is off the 15° grid"
															: title
														: "A colouring's symmetry is not worked out here"
												}
											>
												<Button
													size="sm"
													variant="ghost"
													pressed={show[key] && !none}
													onClick={() => flip(key)}
													disabled={!big.symmetry}
													label={label}
												/>
											</Tooltip>
										);
									})}
								</>
							) : null}
						</div>
					</div>
				) : null}
				{certs.length ? (
					<FloatingToolbar>
						<Tooltip label="Previous tiling">
							<Button
								size="icon"
								variant="ghost"
								icon={ChevronLeft}
								aria-label="Previous tiling"
								disabled={shown === 0}
								onClick={() => setI(shown - 1)}
							/>
						</Tooltip>
						<span className="min-w-16 px-1 text-center font-mono text-small whitespace-nowrap text-fg-secondary tabular-nums">
							{(shown + 1).toLocaleString("en")} / {total}
						</span>
						<Tooltip label="Next tiling">
							<Button
								size="icon"
								variant="ghost"
								icon={ChevronRight}
								aria-label="Next tiling"
								disabled={shown >= certs.length - 1}
								onClick={() => setI(shown + 1)}
							/>
						</Tooltip>
						<Tooltip label="Random tiling">
							<Button
								size="icon"
								variant="ghost"
								icon={Shuffle}
								aria-label="Random tiling"
								disabled={certs.length < 2}
								onClick={() => setI((shown + 1 + Math.floor(Math.random() * (certs.length - 1))) % certs.length)}
							/>
						</Tooltip>
						<Tooltip label={copying === "copied" ? "Copied" : "Copy the image to the clipboard"}>
							<Button
								size="icon"
								variant="ghost"
								icon={copying === "copied" ? Check : Copy}
								aria-label="Copy the image"
								onClick={() => void copy()}
							/>
						</Tooltip>
						<Tooltip label={full ? "Exit fullscreen" : "Fullscreen"} shortcut={full ? "F or Esc" : "F"}>
							<Button
								size="icon"
								variant="ghost"
								icon={full ? Minimize : Maximize}
								aria-label={full ? "Exit fullscreen" : "Fullscreen"}
								pressed={full}
								onClick={() => setFull(!full)}
							/>
						</Tooltip>
					</FloatingToolbar>
				) : null}
			</div>
			</div>

			<div className="flex min-h-0 min-w-0 flex-col">
				<div className="flex shrink-0 items-center gap-1.5 px-4 pt-3.5 pb-2.5">
					<span className="ta-label">
						{!certs.length
							? "Reading"
							: firsts
								? `The first of each of ${total} files`
								: thumbs.length < certs.length
									? `The first ${thumbs.length} of ${total}`
									: `All ${total}`}
					</span>
					{truncated ? (
						<InfoDot side="bottom" label="Why the count ends in +">
							Showing the tilings in the first {bytes(READ_BUDGET)} of these {files.length} files&apos; text; the whole
							files are in the run folder.
						</InfoDot>
					) : null}
					<span className="ml-auto flex gap-1">
						{canAbstract ? (
							<Tooltip label="Each apeirogon drawn as a finite polygon: the fewest sides its faces close up into in the tiling's period. A picture of the tiling's combinatorics, not of its geometry">
								<Button
									size="sm"
									variant="ghost"
									pressed={abstract}
									onClick={() => setAbstract(!abstractOn)}
									label="Abstract"
								/>
							</Tooltip>
						) : null}
						{canShape ? (
							<Tooltip label="A colour for each face of the board, not for each number of sides: an A3 and a B3 differ">
								<Button
									size="sm"
									variant="ghost"
									pressed={byShape}
									onClick={() => setShapes(!shapes)}
									label="By shape"
								/>
							</Tooltip>
						) : null}
						{files.length > 1 ? (
							<Tooltip label="The first tiling of each certificate file: one for each set of corners, edge orbits and orientability">
								<Button
									size="sm"
									variant="ghost"
									pressed={firsts}
									onClick={() => setFirsts(!firsts)}
									label="One per file"
								/>
							</Tooltip>
						) : null}
					</span>
				</div>
				<div ref={grid} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
					<div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2 p-0.5">
						{thumbs.map((_, j) => (
							<button
								key={j}
								data-thumb={j}
								type="button"
								onClick={() => setI(j)}
								aria-current={j === shown}
								aria-label={`Tiling ${j + 1}`}
								className={cn(
									"group relative aspect-square cursor-pointer overflow-hidden rounded-control bg-surface ring-1 transition-[box-shadow] motion-feedback",
									j === shown ? "ring-2 ring-accent" : "ring-line-subtle hover:ring-line-strong",
								)}
							>
								{drawn[j] ? (
									<Thumb drawing={drawn[j]!} grid={show.grid} ranks={ranks} />
								) : (
									<div className="h-full w-full animate-pulse bg-surface-sunken" />
								)}
								{family?.has(certs[j]) ? (
									<Badge tone="solid" mono className="absolute top-1 left-1">
										×{family.get(certs[j])!.members.length}
									</Badge>
								) : null}
								<Badge tone={j === shown ? "solid" : "raised"} mono className="absolute right-1 bottom-1">
									{j + 1}
								</Badge>
							</button>
						))}
					</div>
				</div>
				<div className="flex h-[38%] min-h-36 shrink-0 flex-col border-t border-line-subtle">
					{big?.kind === "disk" ? (
						<EdgeLine
							edge={big.tiling.edge}
							poly={minpolyAt(board.header, big.tiling.edge) ?? minpolyAt(studyHeader, big.tiling.edge)}
						/>
					) : null}
					<div className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-2">
						<span className="ta-label flex-1">Certificate {certs.length ? shown + 1 : ""}</span>
						{Object.keys(run.symbols).length ? (
							<div className="w-40">
								<OptionWall
									columns={2}
									options={[
										{ value: "board", label: "Board" },
										{ value: "engine", label: "Engine" },
									]}
									selected={names}
									onChange={setNames}
								/>
							</div>
						) : null}
						{body ? <CopyButton text={body} /> : null}
					</div>
					<pre tabIndex={0} className="min-h-0 flex-1 overflow-auto px-4 pb-3 font-mono text-caption leading-relaxed text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
						{body || (certs.length ? "" : "This file has no complete tiling yet.")}
					</pre>
				</div>
			</div>
		</div>
	);
}
