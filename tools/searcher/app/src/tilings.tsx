// The tilings a run found, drawn: a grid of the tilings in one certificate file, and the selected one
// large, with its certificate beside it. Every drawing is the site's own: the plane through its flat
// edge-pattern canvas, the disk through its per-pixel hyperbolic canvases, steered as on the site.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ParametricEdgesCanvas, ParametricEdgesThumbnail } from "@/components/freedraw/parametric-edges-view";
import type { BuiltShelfPattern } from "@/components/freedraw/parametric-edges-view";
import { HyperbolicColorsCanvas } from "@/components/hyperbolic-colors-canvas";
import { HyperbolicColorsThumbnail, type HypColorsThumbInput } from "@/components/hyperbolic-colors-thumbnail";
import { HyperbolicEdgesCanvas } from "@/components/hyperbolic-edges-canvas";
import { HyperbolicEdgesThumbnail, type HypEdgesThumbInput } from "@/components/hyperbolic-edges-thumbnail";
import { Button } from "@/components/ui/button";
import { InfoDot } from "@/components/ui/info-dot";
import { Toggle } from "@/components/ui/toggle";
import { useDiskInput } from "@/lib/render/diskInput";
import { cn } from "@/lib/utils/cn";
import { parse, type Board } from "./board";
import type { OutFile, Run } from "./bridge";
import { decode, flatPattern, geometry, hyperbolicDarts, vertexWords } from "./develop";
import { bytes } from "./runs";

const READ_BYTES = 256 * 1024;
const THUMBS = 60;

type Drawing =
	| { kind: "plane"; built: BuiltShelfPattern }
	/** A board that marks edges with digons draws its marked edges bold over the faint rest. */
	| { kind: "edges"; pattern: HypEdgesThumbInput; edge: number }
	/** Faces filled by polygon size, apeirogons white: the site's hyp-poly shelf exactly. */
	| { kind: "tiles"; pattern: HypColorsThumbInput; edge: number }
	| { kind: "none"; message: string };

/** Decode, choose the geometry, develop. Everything that can go wrong comes back as a message. */
function prepare(board: Board, cert: string, id: string): Drawing {
	try {
		const g = geometry(board, vertexWords(cert));
		if (g.kind === "none") return g;
		const d = decode(cert, board);
		if (g.kind === "plane") {
			const pattern = flatPattern(d, board, g.turn, id);
			const span = Math.max(Math.hypot(...pattern.patch!.T1), Math.hypot(...pattern.patch!.T2));
			return { kind: "plane", built: { pattern, reason: null, cells: Math.max(10, span * 1.6) } };
		}
		const darts = hyperbolicDarts(d, g);
		const base = { id, config: board.name, edge: g.edge, darts };
		return darts.sizes.includes(2)
			? { kind: "edges", pattern: base, edge: g.edge }
			: { kind: "tiles", pattern: { ...base, colors: darts.sizes.length, sizes: darts.sizes }, edge: g.edge };
	} catch (e) {
		return { kind: "none", message: (e as Error).message };
	}
}

const ALWAYS = { current: true };

/** The selected tiling, large and steerable. Keyed per tiling by the caller, so each opens centred. */
function BigView({ drawing }: { drawing: Drawing }) {
	const hostRef = useRef<HTMLDivElement>(null);
	const disk = drawing.kind === "edges" || drawing.kind === "tiles";
	const { inputRef, handlers } = useDiskInput(hostRef, ALWAYS, disk);
	if (drawing.kind === "none")
		return (
			<div className="flex aspect-square w-full items-center justify-center rounded-surface bg-surface-sunken p-6 text-center text-sm text-fg-muted">
				{drawing.message}
			</div>
		);
	if (drawing.kind === "plane")
		return (
			<div className="aspect-square w-full overflow-hidden rounded-surface border border-line-subtle bg-surface">
				<ParametricEdgesCanvas built={drawing.built} />
			</div>
		);
	return (
		<div
			ref={hostRef}
			{...handlers}
			role="application"
			aria-label="Hyperbolic tiling: drag to move, scroll to turn"
			className="relative aspect-square w-full cursor-grab touch-none select-none active:cursor-grabbing"
		>
			{drawing.kind === "edges" ? (
				<HyperbolicEdgesCanvas pattern={drawing.pattern} input={inputRef} />
			) : (
				<HyperbolicColorsCanvas pattern={drawing.pattern} input={inputRef} tiles />
			)}
		</div>
	);
}

function Thumb({ drawing }: { drawing: Drawing }) {
	if (drawing.kind === "none")
		return (
			<div className="flex h-full w-full items-center justify-center p-2 text-center text-[11px] text-fg-muted">
				Not drawn
			</div>
		);
	if (drawing.kind === "plane") return <ParametricEdgesThumbnail built={drawing.built} label="tiling" />;
	return drawing.kind === "edges" ? (
		<HyperbolicEdgesThumbnail pattern={drawing.pattern} />
	) : (
		<HyperbolicColorsThumbnail pattern={drawing.pattern} />
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

/** The tilings in one certificate file: thumbnails, the selected one large, and its certificate. */
export function TilingsView({ run, file, onFile }: { run: Run; file: OutFile | null; onFile: (f: OutFile) => void }) {
	const [text, setText] = useState("");
	// the selected tiling, per file: another file opens at its first
	const [pick, setPick] = useState({ path: "", i: 0 });
	const i = pick.path === file?.path ? pick.i : 0;
	const setI = (n: number) => setPick({ path: file?.path ?? "", i: n });
	const [names, setNames] = useState("board");
	useEffect(() => {
		if (!file) return;
		let live = true;
		void window.tilesearch.readFile(file.path, READ_BYTES).then((t) => live && setText(t));
		return () => {
			live = false;
		};
	}, [file?.path, file?.bytes]); // eslint-disable-line react-hooks/exhaustive-deps -- the object is new on every status update
	const board = useMemo(() => parse(run.board).board, [run.board]);
	const symbolsKey = JSON.stringify(run.symbols);
	// the certificates as the engine printed them, and with its X<n> labels read back as the board's symbols
	const [raw, certs] = useMemo(() => {
		const end = text.lastIndexOf("---\n");
		const list =
			end < 0
				? []
				: text
						.slice(0, end)
						.split(/\n?---\n\n?/)
						.filter(Boolean);
		const symbols = Object.entries(JSON.parse(symbolsKey) as Record<string, string>);
		const named = list.map((c) => symbols.reduce((t, [x, sym]) => t.replace(new RegExp(`\\b${x}\\b`, "g"), sym), c));
		return [list, named];
		// keyed on the symbols' contents: every status update carries a new object, and a new list here
		// re-develops every drawing (that was an idle window at 54% CPU)
	}, [text, symbolsKey]);
	const thumbs = useMemo(() => certs.slice(0, THUMBS), [certs]);
	const path = file?.path ?? "";
	const make = useMemo(() => (c: string, j: number) => prepare(board, c, `${path}#${j}`), [board, path]);
	const drawn = useQueued(thumbs, make);
	const shown = Math.min(i, Math.max(0, certs.length - 1));
	const big = useMemo(
		() => (certs[shown] ? prepare(board, certs[shown], `${path}#${shown}`) : null),
		[board, certs, shown, path],
	);

	if (!file) return <p className="text-sm text-fg-muted">No certificate files yet: they appear as roots finish.</p>;
	const body = (names === "board" ? certs : raw)[shown] ?? "";
	const index = run.files.findIndex((f) => f.path === file.path);
	const where =
		big?.kind === "plane"
			? "In the plane, one period repeated. Drag to move, scroll to zoom, Shift-scroll to turn, double-click to go back."
			: big?.kind === "edges" || big?.kind === "tiles"
				? `In the hyperbolic plane (Poincaré disk), regular faces of edge ${big.edge.toFixed(4)}. Drag to move, scroll to turn, click a tile to bring it to the centre, right-click to go back.`
				: "";
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-2">
				<select
					value={file.path}
					onChange={(e) => onFile(run.files.find((f) => f.path === e.target.value) ?? file)}
					className="h-8 max-w-sm rounded-control border border-line bg-surface-raised px-2 font-mono text-xs text-fg"
					aria-label="Certificate file"
				>
					{run.files.map((f) => (
						<option key={f.path} value={f.path}>
							k={f.k} · {f.labels}
							{f.orientable ? " · orientable" : ""} · {f.edges} edge orbits
						</option>
					))}
				</select>
				<Button
					size="icon"
					icon={ChevronLeft}
					aria-label="Previous tiling"
					disabled={shown === 0}
					onClick={() => setI(shown - 1)}
				/>
				<span className="font-mono text-xs text-fg-secondary">
					{certs.length ? `${shown + 1} / ${certs.length}${file.bytes > READ_BYTES ? "+" : ""}` : "0"}
				</span>
				<Button
					size="icon"
					icon={ChevronRight}
					aria-label="Next tiling"
					disabled={shown >= certs.length - 1}
					onClick={() => setI(shown + 1)}
				/>
				{file.bytes > READ_BYTES ? (
					<InfoDot side="bottom" label="Why the count ends in +">
						Showing the tilings in the first {bytes(READ_BYTES)} of {bytes(file.bytes)}; the whole file is in the run
						folder.
					</InfoDot>
				) : null}
				<span className="flex-1" />
				{where ? (
					<InfoDot side="left" label="How to move the drawing">
						{where}
					</InfoDot>
				) : null}
				<span className="text-xs text-fg-muted">
					file {index + 1} of {run.files.length}
				</span>
			</div>

			<div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
				{/* as wide as the column allows, and never taller than the window */}
				<div className="min-w-0" style={{ maxWidth: "calc(100vh - 140px)" }}>
					{big ? <BigView key={`${file.path}#${shown}`} drawing={big} /> : null}
				</div>
				<div className="flex min-w-0 flex-col gap-2">
					<div className="flex items-center justify-between gap-2">
						<span className="ta-label">Certificate</span>
						{Object.keys(run.symbols).length ? (
							<div className="w-48">
								<Toggle leftValue="board" rightValue="engine" value={names} onChange={setNames} padding="py-1 px-2" />
							</div>
						) : null}
					</div>
					<pre className="max-h-[640px] min-h-0 flex-1 overflow-auto rounded-surface border border-line-subtle bg-surface-raised p-3 font-mono text-xs leading-relaxed text-fg">
						{body || "This file has no complete tiling yet."}
					</pre>
				</div>
			</div>

			{thumbs.length > 1 ? (
				<div className="space-y-2">
					<div className="ta-label">
						{thumbs.length < certs.length ? `The first ${thumbs.length} of ${certs.length}` : `All ${certs.length}`} in
						this file
					</div>
					<div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2">
						{thumbs.map((_, j) => (
							<button
								key={j}
								type="button"
								onClick={() => setI(j)}
								className={cn(
									"flex cursor-pointer flex-col items-center gap-1 rounded-surface border bg-surface-raised p-1.5 transition-colors",
									j === shown ? "border-accent" : "border-line-subtle hover:border-line-strong",
								)}
							>
								{drawn[j] ? (
									<div className="h-[118px] w-[118px]">
										<Thumb drawing={drawn[j]!} />
									</div>
								) : (
									<div className="h-[118px] w-[118px] animate-pulse rounded-surface bg-surface-sunken" />
								)}
								<span className="font-mono text-[11px] text-fg-muted">{j + 1}</span>
							</button>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}
