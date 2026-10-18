"use client";

// The Heesch shelf: shapes that cannot tile the plane, and how far they get before they fail.
//
// A shape's Heesch number is the most complete rings of copies (coronas) that can surround it. The
// page is a census: every non-tiling polyomino, polyiamond and polyhex of a size, each with the patch that reaches its number,
// plus a few larger tiles found by hand. A corona patch is finite and has no lattice, which is what
// /aperiodic's patch views already draw, so the canvas is the same one (lib/hooks/usePatchCanvas.ts).
//
// Two numbers a shape, never one: strict (every corona a closed disk) and with holes allowed in the
// outermost corona. The definition toggle switches both the number and the patch shown for it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import { applyViewTransform, type AperiodicFrame } from "@/lib/hooks/useAperiodicView";
import { STROKE_CSS, STROKE_RGBA, STROKE_WIDTH, strokePxAt, usePatchCanvas } from "@/lib/hooks/usePatchCanvas";
import { useParametricTilingCanvas } from "@/lib/hooks/useParametricTilingCanvas";
import { useImmersiveShortcuts } from "@/components/fullscreen-toggle";
import { PeekTitle } from "@/components/dock-peek";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CornerControls } from "@/components/ui/corner-controls";
import { Pagination } from "@/components/ui/pagination";
import { Slider } from "@/components/ui/slider";
import {
	NAMED_SET,
	HEESCH_GRIDS,
	cellSeams,
	gridCaveat,
	gridPlacement,
	heeschGridLabel,
	heeschNumber,
	loadHeeschIndex,
	loadHeeschSet,
	loadHeeschTilers,
	outlinePage,
	patchPolygons,
	polyformName,
	polyformPlural,
	ringSizes,
	tilingCell,
	type HeeschDefinition,
	type HeeschGridId,
	type HeeschIndex,
	type HeeschSetInfo,
	type HeeschShape,
} from "@/lib/heesch/data";
import { ViewFooter } from "../aperiodic/_view-chrome";
import { Details, HeeschSidebar, Section, Segmented } from "./_controls";

const DEFAULT_SET = NAMED_SET;
/** Shapes per page of the picker, and its columns: four full rows. */
const PAGE_SIZE = 24;
const PICKER_COLS = 6;
/** Columns in the size switcher; a grid with more sizes wraps onto the same columns. */
const SET_COLS = 6;

/** A cell seam against a tile outline: half the width, a third of the ink. */
const SEAM_WIDTH = 0.5;
const SEAM_ALPHA = 0.35;

const EMPTY: HeeschShape[] = [];
const NO_SHARDS = new Map<number, HeeschShape[]>();
/** How far the 2-D fallback (no WebGL2) repeats a tiling's period, in periods. */
const TILING_FALLBACK_RADIUS = 30;

/** A shape's outline fitted to a small square: the picker's cell. */
function ShapeGlyph({ shape }: { shape: HeeschShape }) {
	const S = 22;
	const ring = outlinePage(shape);
	let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
	for (const v of ring) {
		minx = Math.min(minx, v.x);
		maxx = Math.max(maxx, v.x);
		miny = Math.min(miny, v.y);
		maxy = Math.max(maxy, v.y);
	}
	const k = S / Math.max(maxx - minx, maxy - miny, 1);
	const ox = (S - k * (maxx - minx)) / 2, oy = (S - k * (maxy - miny)) / 2;
	// y is flipped because SVG counts down and every tiling in the atlas counts up.
	const points = ring.map((v) => `${ox + k * (v.x - minx)},${S - oy - k * (v.y - miny)}`);
	return (
		<svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-hidden="true" className="my-0.5">
			<polygon points={points.join(" ")} className="fill-current" />
		</svg>
	);
}

/** A size's whole census, where the set lists only some of it or the count is still running. */
function CensusNote({ census, grid, cells, listed }: { census: NonNullable<HeeschSetInfo["census"]>; grid: HeeschGridId; cells: number; listed: number }) {
	const n = (v: number) => v.toLocaleString();
	return (
		<div className="flex flex-col gap-1 text-[11px] text-fg-muted max-md:text-xs">
			<p>
				{n(census.holeFree)} hole-free {polyformPlural(grid, cells)}: {n(census.tilers)} tile the plane; with holes allowed,{" "}
				{census.hh.map((c, h) => `${n(c)} at H = ${h}`).join(", ")}.
			</p>
			{census.listedFrom !== undefined && !census.slices && (
				<p>
					Listed here: the {n(listed)} from H = {census.listedFrom} up, with their coronas. The rest are counted, not drawn.
				</p>
			)}
			{census.unresolved && (
				<p>
					{census.unresolved === 1
						? "One shape is left out of every count: Anton Bakker's census counts it as a tiler, and no search here has tiled it yet."
						: `${n(census.unresolved)} shapes are left out of every count: Anton Bakker's census counts them as tilers, and no search here has tiled them yet.`}
				</p>
			)}
			{census.slices && (
				<p>
					Census still running: {n(census.slices[0])} of {n(census.slices[1])} slices done, so these counts will grow.
				</p>
			)}
		</div>
	);
}

export function HeeschClient() {
	const searchParams = useSearchParams();

	const [index, setIndex] = useState<HeeschIndex | null>(null);
	const [setId, setSetId] = useState<string>(DEFAULT_SET);
	// The loaded set, tagged with its id: between a switch and the fetch landing, the old set's shapes
	// are not the new set's, and showing them would frame the canvas on the wrong patch.
	const [loaded, setLoaded] = useState<{ id: string; shapes: HeeschShape[] }>({ id: "", shapes: EMPTY });
	const shapes = loaded.id === setId ? loaded.shapes : EMPTY;
	// A size's tilers come in files of `shard` shapes, fetched as the picker reaches them.
	const [tilerShards, setTilerShards] = useState<{ id: string; got: Map<number, HeeschShape[]> }>({ id: "", got: NO_SHARDS });
	const got = tilerShards.id === setId ? tilerShards.got : NO_SHARDS;
	const [hideTilers, setHideTilers] = useState(false);
	const [def, setDef] = useState<HeeschDefinition>("strict");
	/** Which Heesch number the picker lists; null is all of them. */
	const [filter, setFilter] = useState<number | null>(null);
	const [pick, setPick] = useState(0);
	/** Coronas drawn; null follows the shape's own number, so a new shape opens on its full patch. */
	const [shown, setShown] = useState<number | null>(null);
	const [strokeWidth, setStrokeWidth] = useState<number>(STROKE_WIDTH.def);
	/** Draw the centre tile as the unit cells it is made of. */
	const [showCells, setShowCells] = useState(false);

	useImmersiveShortcuts();

	useEffect(() => {
		let live = true;
		loadHeeschIndex().then((d) => live && setIndex(d));
		return () => {
			live = false;
		};
	}, []);

	// Adopt a deep link once, after hydration: the page is force-static, so seeding state from the URL
	// during render would disagree with the prerendered HTML (the /pentagons note has the detail).
	const selectSet = useCallback((id: string) => setSetId(id), []);
	const adopted = useRef(false);
	// The linked shape, with the set it belongs to: the default set can finish loading first, and must not
	// take a pick meant for the linked one.
	const pendingPick = useRef<{ set: string; at: number } | null>(null);
	useEffect(() => {
		if (adopted.current) return;
		adopted.current = true;
		const s = searchParams.get("set");
		const i = Number(searchParams.get("shape"));
		if (Number.isInteger(i) && i > 0) pendingPick.current = { set: s && /^(named|[a-z]+\d+)$/.test(s) ? s : DEFAULT_SET, at: i };
		if (s && /^(named|[a-z]+\d+)$/.test(s)) selectSet(s);
	}, [searchParams, selectSet]);

	useEffect(() => {
		let live = true;
		loadHeeschSet(setId).then((d) => {
			if (!live) return;
			setLoaded({ id: setId, shapes: d ?? EMPTY });
			setFilter(null);
			const want = pendingPick.current?.set === setId ? pendingPick.current.at : 0;
			if (want) pendingPick.current = null;
			setPick(want);
			setShown(null);
		});
		return () => {
			live = false;
		};
	}, [setId]);

	// The picker's list: one Heesch number under the current definition, or everything, the tilers
	// (Heesch number infinite) after the rest. The data is sorted deepest first, so index 0 is always
	// the most interesting shape of the set.
	const setInfo = index?.sets.find((s) => s.id === setId);
	const tilerCount = setInfo?.tilers?.count ?? 0;
	const shard = setInfo?.tilers?.shard ?? 1;
	const listed = useMemo(
		() => (filter === null ? shapes : shapes.filter((s) => heeschNumber(s, def) === filter)),
		[shapes, def, filter],
	);
	const tilersListed = !hideTilers && (filter === null || filter === Infinity) ? tilerCount : 0;
	const total = listed.length + tilersListed;
	const shapeAt = (i: number) =>
		i < listed.length ? listed[i] : (got.get(Math.floor((i - listed.length) / shard))?.[(i - listed.length) % shard] ?? null);
	const at = Math.min(pick, Math.max(0, total - 1));
	const shape = shapeAt(at);
	const tiles = !!shape?.p;
	const H = shape && !tiles ? heeschNumber(shape, def) : 0;
	const page = Math.floor(at / PAGE_SIZE) + 1;
	const pageStart = (page - 1) * PAGE_SIZE;
	const asked = useRef(new Set<string>());
	useEffect(() => {
		for (let i = Math.max(pageStart, listed.length); i < Math.min(pageStart + PAGE_SIZE, total); i++) {
			const k = Math.floor((i - listed.length) / shard);
			if (got.has(k) || asked.current.has(`${setId}:${k}`)) continue;
			asked.current.add(`${setId}:${k}`);
			loadHeeschTilers(setId, k).then(
				(d) => d && setTilerShards((prev) => ({ id: setId, got: new Map(prev.id === setId ? prev.got : []).set(k, d) })),
			);
		}
	}, [pageStart, listed.length, total, shard, got, setId]);
	const upTo = Math.min(shown ?? H, H);

	const selectShape = useCallback((i: number) => {
		setPick(i);
		setShown(null);
	}, []);

	// ←/→ step through the listed shapes, wrapping. Bound once and read through a ref, the shape
	// lib/hooks/useKeyShortcuts uses, so a key pressed between a render and its effect cannot step from
	// the previous selection.
	const stepRef = useRef({ at, n: total });
	useEffect(() => {
		stepRef.current = { at, n: total };
	});
	const step = useCallback(
		(delta: number) => {
			const { at: i, n } = stepRef.current;
			if (n > 0) selectShape((i + delta + n) % n);
		},
		[selectShape],
	);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
			e.preventDefault();
			step(e.key === "ArrowLeft" ? -1 : 1);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [step]);

	// Mirror the selection into the URL without navigating. Debounced: the picker is clickable at speed
	// and WebKit disables replaceState after 100 calls in 30s.
	useEffect(() => {
		const t = window.setTimeout(() => {
			const q = new URLSearchParams();
			if (setId !== DEFAULT_SET) q.set("set", setId);
			if (filter === null && at > 0) q.set("shape", String(at));
			const s = q.toString();
			window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
		}, 400);
		return () => window.clearTimeout(t);
	}, [setId, filter, at]);

	// A tiler is drawn the way /play draws a tiling, one period repeated over the whole view; everything
	// else as its finite corona patch.
	const polys = useMemo(() => (shape && !tiles ? patchPolygons(shape, def, upTo) : []), [shape, tiles, def, upTo]);
	const tilingCanvasRef = useRef<HTMLCanvasElement>(null);
	const cell = useMemo(() => (shape ? tilingCell(shape) : null), [shape]);
	const { view: tilingView } = useParametricTilingCanvas({
		canvasRef: tilingCanvasRef,
		cell,
		strokeWidth,
		strokeRgb: [STROKE_RGBA[0], STROKE_RGBA[1], STROKE_RGBA[2]],
		strokeCss: STROKE_CSS,
		framingKey: `${setId}:${at}`,
		fallbackMaxRadius: TILING_FALLBACK_RADIUS,
		mounted: tiles,
	});

	// The centre tile's cell seams, on a second canvas over the first: the patch renderer strokes every
	// polygon at one weight, and a seam must read as a subdivision of one tile, not as a tile edge. So
	// it is drawn here at half the outline width and a third of its ink, tracking the same frame.
	const seamCanvasRef = useRef<HTMLCanvasElement>(null);
	const seams = useMemo(() => (shape && showCells ? cellSeams(shape) : null), [shape, showCells]);
	const drawSeams = useCallback(
		(f: AperiodicFrame) => {
			const cv = seamCanvasRef.current;
			const ctx = cv?.getContext("2d");
			if (!cv || !ctx) return;
			if (cv.width !== Math.round(f.w * f.dpr) || cv.height !== Math.round(f.h * f.dpr)) {
				cv.width = Math.round(f.w * f.dpr);
				cv.height = Math.round(f.h * f.dpr);
			}
			ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
			ctx.clearRect(0, 0, f.w, f.h);
			const px = strokePxAt(Math.max(strokeWidth, 1), f.zoom) * SEAM_WIDTH;
			if (!seams || px <= 0) return;
			ctx.save();
			applyViewTransform(ctx, f);
			ctx.lineWidth = px / f.zoom;
			ctx.strokeStyle = STROKE_CSS;
			ctx.globalAlpha = SEAM_ALPHA;
			ctx.beginPath();
			for (let i = 0; i < seams.length; i += 4) {
				ctx.moveTo(seams[i], seams[i + 1]);
				ctx.lineTo(seams[i + 2], seams[i + 3]);
			}
			ctx.stroke();
			ctx.restore();
		},
		[seams, strokeWidth],
	);
	// The subject is the shape and its patch, not the corona count: stepping the rings keeps the view,
	// so the patch grows in place instead of shrinking to fit at every step.
	const { canvasRef, view } = usePatchCanvas({
		polys,
		strokeWidth,
		subject: shape ? `${setId}:${def}:${filter}:${at}` : "loading",
		keepView: true,
		onFrame: drawSeams,
	});
	const { requestDraw } = view;
	useEffect(() => {
		requestDraw();
	}, [drawSeams, requestDraw]);

	// Two switchers, one selection: the grid (or the named tiles), then a size within it. The set id
	// carries both, so the grid is read off it and picking a grid opens that grid's first size.
	const grid = setId === NAMED_SET ? NAMED_SET : setId.replace(/\d+$/, "");
	const gridOptions = useMemo(
		() => [
			{ v: NAMED_SET, label: "Named", sub: index ? String(index.named) : "" },
			...HEESCH_GRIDS.map((g) => ({
				v: g,
				label: heeschGridLabel(g),
				sub: (index?.sets ?? []).reduce((n, s) => n + (s.grid === g ? s.count + (s.tilers?.count ?? 0) : 0), 0).toLocaleString(),
			})),
		],
		[index],
	);
	const sizeOptions = useMemo(
		() => (index?.sets ?? []).filter((s) => s.grid === grid).map((s) => ({ v: s.id, label: String(s.cells), sub: (s.count + (s.tilers?.count ?? 0)).toLocaleString() })),
		[index, grid],
	);
	const selectGrid = useCallback(
		(g: string) => selectSet(g === NAMED_SET ? NAMED_SET : (index?.sets.find((s) => s.grid === g)?.id ?? NAMED_SET)),
		[index, selectSet],
	);
	const switcher = (
		<>
			<Section label="Grid">
				<Segmented options={gridOptions} value={grid} onChange={selectGrid} cols={2} />
			</Section>
			{sizeOptions.length > 0 && (
				<Section label="Cells">
					<Segmented options={sizeOptions} value={setId} onChange={selectSet} cols={SET_COLS} fill={false} />
					{grid !== NAMED_SET && gridCaveat(grid as HeeschGridId) && (
						<p className="text-[11px] text-fg-muted max-md:text-xs">{gridCaveat(grid as HeeschGridId)}</p>
					)}
					{setInfo?.census && <CensusNote census={setInfo.census} grid={setInfo.grid} cells={setInfo.cells} listed={setInfo.count} />}
					{setInfo?.of && (
						<p className="text-[11px] text-fg-muted max-md:text-xs">
							Search still running: {setInfo.searched} of {setInfo.of} shapes done, so these counts will grow.
						</p>
					)}
				</Section>
			)}
		</>
	);
	const setLabel = setId === NAMED_SET ? "Named tiles" : heeschGridLabel(grid as HeeschGridId);

	// Shapes per Heesch number in this set under the current definition, for the filter's sub-lines.
	const counts = useMemo(() => {
		const c: number[] = [];
		for (const s of shapes) c[heeschNumber(s, def)] = (c[heeschNumber(s, def)] ?? 0) + 1;
		return Array.from(c, (n) => n ?? 0);
	}, [shapes, def]);

	const rings = shape ? ringSizes(shape, def) : [1];
	const tilersShown = hideTilers ? 0 : tilerCount;
	const title = shape?.name ?? (shape ? polyformName(shape) : setLabel);
	const sub = tiles
		? "Tiles the plane"
		: shape
			? `Heesch number ${shape.hc} · ${shape.hh} with holes`
			: loaded.id === setId && total === 0
				? "No shapes listed yet"
				: "Loading";

	const header = (
		<>
			<div className="flex flex-col gap-1">
				<h1 className="text-[15px] font-semibold leading-tight text-fg">{title}</h1>
				<p className="text-xs text-fg-muted truncate" title={sub}>
					{sub}
				</p>
			</div>
			{switcher}
		</>
	);

	const peek = (
		<>
			<PeekTitle title={title} sub={sub} />
			<Button variant="ghost" size="icon" icon={ChevronLeft} aria-label="Previous shape" onClick={() => step(-1)} />
			<Button variant="ghost" size="icon" icon={ChevronRight} aria-label="Next shape" onClick={() => step(1)} />
		</>
	);

	return (
		<div className="relative flex-1 min-h-0 flex">
			{/* The canvas's top-right corner, first in the DOM so it is read before the sheet. */}
			<CornerControls />
			<HeeschSidebar header={header} peek={peek}>
				{/* The header's switchers are hidden on a phone, where the peek row replaces the header. */}
				<div className="flex flex-col gap-6 md:hidden">{switcher}</div>

				<Section label="Definition">
					<Segmented
						options={[
							{ v: "strict", label: "Strict", sub: "every corona a disk" },
							{ v: "holes", label: "Holes allowed", sub: "outer corona only" },
						]}
						value={def}
						onChange={(v) => {
							setDef(v as HeeschDefinition);
							setFilter(null);
							selectShape(0);
						}}
					/>
				</Section>

				<Section label="Heesch number">
					<Segmented
						options={[
							{ v: "all", label: "All", sub: (shapes.length + tilersShown).toLocaleString() },
							...counts.map((n, h) => ({ v: String(h), label: String(h), sub: n.toLocaleString(), disabled: n === 0 })),
							...(tilersShown ? [{ v: "inf", label: "∞", sub: tilersShown.toLocaleString() }] : []),
						]}
						value={filter === null ? "all" : filter === Infinity ? "inf" : String(filter)}
						onChange={(v) => {
							setFilter(v === "all" ? null : v === "inf" ? Infinity : Number(v));
							selectShape(0);
						}}
						cols={counts.length + 1 + (tilersShown ? 1 : 0)}
					/>
					{tilerCount > 0 && (
						<Checkbox
							id="heesch-hide-tilers"
							label="Leave out the shapes that tile"
							checked={hideTilers}
							onCheckedChange={(v) => {
								setHideTilers(v);
								if (v && filter === Infinity) setFilter(null);
								selectShape(0);
							}}
						/>
					)}
				</Section>

				<Section label={`Shape · ${(at + 1).toLocaleString()} of ${total.toLocaleString()}`}>
					<Segmented
						options={Array.from({ length: Math.max(0, Math.min(PAGE_SIZE, total - pageStart)) }, (_, i) => {
							const s = shapeAt(pageStart + i);
							return {
								v: String(pageStart + i),
								label: s ? <ShapeGlyph shape={s} /> : <span className="my-0.5 block h-[22px] w-[22px]" />,
								title: s ? `${s.name ?? polyformName(s)} · ${s.p ? "tiles the plane" : `H = ${heeschNumber(s, def)}`}` : "Loading",
							};
						})}
						value={String(at)}
						onChange={(v) => selectShape(Number(v))}
						cols={PICKER_COLS}
						fill={false}
					/>
					<Pagination
						totalItems={total}
						pageSize={PAGE_SIZE}
						currentPage={page}
						onPageChange={(p) => p !== page && selectShape((p - 1) * PAGE_SIZE)}
						showRange={false}
					/>
				</Section>

				{shape?.p ? (
					<Section label="Tiling">
						<span className="text-[11px] text-fg-muted max-md:text-xs">
							It tiles the plane. Drawn here: one of its tilings, which repeats every {shape.p.k.length / 6}{" "}
							{shape.p.k.length === 6 ? "copy" : "copies"}, one colour per orientation.
						</span>
					</Section>
				) : (
					<Section label="Coronas">
						<Slider
							id="heesch-coronas"
							label="Coronas shown"
							value={upTo}
							onChange={setShown}
							min={0}
							max={Math.max(H, 1)}
							step={1}
							disabled={H === 0}
							format={(v) => `${v} of ${H} · ${rings.slice(0, v + 1).reduce((a, b) => a + b, 0).toLocaleString()} tiles`}
						/>
						{H === 0 && <span className="text-[11px] text-fg-muted max-md:text-xs">No complete ring of copies fits around this shape.</span>}
					</Section>
				)}

				<ViewFooter view={tiles ? tilingView : view} strokeWidth={strokeWidth} onStrokeWidth={setStrokeWidth}>
					{!tiles && <Checkbox id="heesch-cells" label="Cells of the centre tile" checked={showCells} onCheckedChange={setShowCells} />}
				</ViewFooter>

				{shape && (
					<Section label="Details">
						<Details
							rows={shape.p ? [
								["Cells", String(shape.cells)],
								["Heesch number", "∞, tiles the plane"],
								["Copies per period", String(shape.p.k.length / 6)],
								["Period", `(${shape.p.l[0]}, ${shape.p.l[1]}), (${shape.p.l[2]}, ${shape.p.l[3]})`],
								["Proof", "omino_census, this atlas"],
							] : [
								["Cells", String(shape.cells)],
								["Strict", `H = ${shape.hc}`],
								["With holes", `H = ${shape.hh}`],
								["Ring sizes", rings.join(", ")],
								["Tiles", rings.reduce((a, b) => a + b, 0).toLocaleString()],
								["Copies", gridPlacement(shape.grid)],
								...(shape.credit ? ([["Found by", shape.credit]] as [string, string][]) : []),
								["Solver", setInfo?.census?.listedFrom ? "free_heesch, this atlas" : "heesch-sat, C. S. Kaplan"],
							]}
						/>
					</Section>
				)}
			</HeeschSidebar>

			<div className="flex-1 min-h-0 relative">
				{/* The corona canvas stays mounted under a tiler, hidden, so its GL context outlives the switch. */}
				<canvas
					ref={canvasRef}
					className={`w-full h-full cursor-grab active:cursor-grabbing touch-none ${tiles ? "hidden" : "block"}`}
					{...view.handlers}
				/>
				<canvas ref={seamCanvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
				{tiles && (
					<canvas
						ref={tilingCanvasRef}
						className="absolute inset-0 w-full h-full block cursor-grab active:cursor-grabbing touch-none"
						{...tilingView.handlers}
					/>
				)}
			</div>
		</div>
	);
}
