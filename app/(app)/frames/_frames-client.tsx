"use client";

// The frames shelf: regions a polyform tiles in exactly two ways, with no tile in the same place in
// both, listed with the regions that have more tilings and a pair of them with no tile in common. A
// census in /heesch's form: pick a grid and a size, then a shape, then one of its regions.
//
// It is /heesch's page in everything but the subject. The same sidebar shell, switchers, picker glyph
// and patch canvas (lib/hooks/usePatchCanvas.ts); the copies come out of lib/heesch/data.ts in the
// same cell-map format, one hue per orientation of the tile. A frame is drawn as the empty region, then
// its two tilings side by side, or overlaid: tiling 1 filled and tiling 2's edges dashed over it; a
// region with more tilings as the empty region and its tilings in rows (allTilings lists them; with
// mirror images or rotations hidden, tilingClasses keeps one a class). The
// empty region, the dashes and the cell seams go on a second canvas that tracks the same view (the
// device /heesch uses for cell seams).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import { applyViewTransform, type AperiodicFrame } from "@/lib/hooks/useAperiodicView";
import { STROKE_CSS, STROKE_WIDTH, strokePxAt, usePatchCanvas } from "@/lib/hooks/usePatchCanvas";
import { useImmersiveShortcuts } from "@/components/fullscreen-toggle";
import { PeekTitle } from "@/components/dock-peek";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CornerControls } from "@/components/ui/corner-controls";
import { Pagination } from "@/components/ui/pagination";
import { PATCH_LIGHT } from "@/lib/hooks/usePatchCanvas";
import {
	HEESCH_GRIDS,
	cellSides,
	copyCells,
	gridPlacement,
	heeschGridLabel,
	outlinePage,
	polyformName,
	polyformPlural,
} from "@/lib/heesch/data";
import {
	M_ORDER,
	allTilings,
	hides,
	tilingClasses,
	frameDrawing,
	frameRings,
	loadFrameSet,
	loadFrames,
	loadFramesIndex,
	tilePolygons,
	type Frame,
	type FrameDrawing,
	type Hide,
	type FrameSetInfo,
	type FrameShape,
	type FrameView,
} from "@/lib/frames/data";
import { ViewFooter } from "../aperiodic/_view-chrome";
import { Details, HeeschSidebar, RingGlyph, Section, Segmented } from "../heesch/_controls";

/** The P pentiamond's set: the tile the original Frame Finder opens on. */
const DEFAULT_SET = "iamond5";
const PAGE_SIZE = 24;
const PICKER_COLS = 6;
const SET_COLS = 6;
const EMPTY: { s: FrameShape; i: number; f: number }[] = [];

/** Tiling 2's edges over tiling 1 in the overlaid view: the outline's width, dashed. */
const OVERLAY_DASH = [4, 3];
/** A cell seam against a tile outline, as on /heesch: half the width, a third of the ink. */
const SEAM_WIDTH = 0.5;
const SEAM_ALPHA = 0.35;
/** The empty region's fill: grey at the tiles' lightness. */
const EMPTY_FILL = `hsl(0 0% ${PATCH_LIGHT}%)`;

/** On the grids where copies are only tried on the grid, a frame here may have more tilings off it. */
const RESTRICTED = new Set(["kite", "drafter", "abolo", "halfcairo", "octasquare", "trihex", "bevelhex"]);

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** Which pairs are hidden: those whose tiling 2 is tiling 1 reflected, or rotated (Frame.m's bits). */
/** A shape's frames by tiles a tiling, less the hidden pairs. */
const shownByN = (s: FrameShape, h: Hide) => s.byM.map((ms) => ms.reduce((a, c, m) => a + (hides(h, m) ? 0 : c), 0));

/** How tiling 2 is tiling 1 moved, from a frame's Frame.m & 3, for the details. */
const RELATION = ["Not by a symmetry of the region", "Mirror image", "Rotated", "Mirror image, and rotated"];

/** Stroke page segments [x0, y0, x1, y1, …] as one path. */
function strokeSegs(ctx: CanvasRenderingContext2D, segs: number[]) {
	ctx.beginPath();
	for (let i = 0; i < segs.length; i += 4) {
		ctx.moveTo(segs[i], segs[i + 1]);
		ctx.lineTo(segs[i + 2], segs[i + 3]);
	}
	ctx.stroke();
}

export function FramesClient() {
	const searchParams = useSearchParams();
	const [index, setIndex] = useState<FrameSetInfo[] | null>(null);
	const [wantSet, setSetId] = useState(DEFAULT_SET);
	const [loaded, setLoaded] = useState<{ key: string; period: number[] | null; shapes: FrameShape[] }>({
		key: "",
		period: null,
		shapes: [],
	});
	const [hideEmpty, setHideEmpty] = useState(true);
	/** Leave out the pairs whose tiling 2 is tiling 1 reflected, or rotated. */
	const [hide, setHide] = useState<Hide>({ mirror: false, rotated: false });
	/** Draw every tile as the unit cells it is made of. */
	const [showCells, setShowCells] = useState(false);
	const [shapePick, setShapePick] = useState(0);
	/** Which number of tiles a tiling the frame picker lists; null is all. */
	const [tiles, setTiles] = useState<number | null>(null);
	const [framePick, setFramePick] = useState(0);
	const [view, setView] = useState<FrameView>("side");
	const [strokeWidth, setStrokeWidth] = useState<number>(STROKE_WIDTH.def);
	/** Fetched frame files, by "set:shape:shard". */
	const [shards, setShards] = useState<Map<string, Frame[]>>(new Map());
	// A set the census has not reached (or a stale link) opens the first set there is.
	const setId = index?.length && !index.some((s) => s.id === wantSet) ? index[0].id : wantSet;
	const ready = index !== null;

	useImmersiveShortcuts();

	useEffect(() => {
		let live = true;
		loadFramesIndex().then((d) => live && setIndex(d?.sets ?? []));
		return () => {
			live = false;
		};
	}, []);

	// Adopt a deep link once, after hydration: the page is force-static (the /heesch note has the detail).
	const pending = useRef<{ set: string; shape: number; frame: number } | null>(null);
	const adopted = useRef(false);
	useEffect(() => {
		if (adopted.current) return;
		adopted.current = true;
		const s = searchParams.get("set");
		if (!s || !/^[a-z]+\d+$/.test(s)) return;
		pending.current = {
			set: s,
			shape: Number(searchParams.get("shape")) || 0,
			frame: Number(searchParams.get("frame")) || 0,
		};
		setSetId(s);
	}, [searchParams]);

	useEffect(() => {
		if (!ready) return;
		let live = true;
		loadFrameSet(setId).then((d) => {
			if (!live) return;
			setLoaded({ key: setId, period: d?.period ?? null, shapes: d?.shapes ?? [] });
			const want = pending.current?.set === setId ? pending.current : null;
			if (want) pending.current = null;
			setShapePick(want?.shape ?? 0);
			setTiles(null);
			setFramePick(want?.frame ?? 0);
		});
		return () => {
			live = false;
		};
	}, [setId, ready]);

	const setInfo = index?.find((s) => s.id === setId);
	const allShapes = loaded.key === setId ? loaded.shapes : null;
	// The picker's shapes, each with its index in the set file (which names its frame files).
	const listed = useMemo(
		() =>
			(allShapes ?? [])
				.map((s, i) => ({ s, i, f: shownByN(s, hide).reduce((a, b) => a + b, 0) }))
				.filter(({ f }) => !hideEmpty || f > 0),
		[allShapes, hideEmpty, hide],
	);
	const shapes = allShapes ? listed : EMPTY;
	const at = Math.min(shapePick, Math.max(0, shapes.length - 1));
	const picked = shapes[at] ?? null;
	const shape = picked?.s ?? null;

	// Frames are stored by tiles a tiling, and within a number of tiles by how the pair is related
	// (M_ORDER): the j-th frame listed is found by walking those runs, skipping the hidden ones.
	const shown = shape ? shownByN(shape, hide) : [];
	const frameCount = picked ? (tiles === null ? picked.f : (shown[tiles] ?? 0)) : 0;
	const slotOf = (j: number) => {
		if (!shape) return 0;
		let start = 0;
		for (let n = 0; n < shape.byN.length; n++) {
			for (const m of M_ORDER) {
				const c = shape.byM[n][m];
				if ((tiles === null || n === tiles) && !hides(hide, m)) {
					if (j < c) return start + j;
					j -= c;
				}
				start += c;
			}
		}
		return start;
	};
	const fAt = Math.min(framePick, Math.max(0, frameCount - 1));
	const shard = setInfo?.shard ?? 1;
	const frameAt = (j: number): Frame | null => {
		if (!picked) return null;
		const g = slotOf(j);
		return shards.get(`${setId}:${picked.i}:${Math.floor(g / shard)}`)?.[g % shard] ?? null;
	};
	const frame = frameCount ? frameAt(fAt) : null;
	const fPage = Math.floor(fAt / PAGE_SIZE) + 1;
	const fPageStart = (fPage - 1) * PAGE_SIZE;

	// Fetch the frame files the picker's page reaches.
	const asked = useRef(new Set<string>());
	useEffect(() => {
		if (!picked) return;
		for (let j = fPageStart; j < Math.min(fPageStart + PAGE_SIZE, frameCount); j++) {
			const k = Math.floor(slotOf(j) / shard),
				key = `${setId}:${picked.i}:${k}`;
			if (asked.current.has(key)) continue;
			asked.current.add(key);
			loadFrames(setId, picked.i, k).then((d) => d && setShards((prev) => new Map(prev).set(key, d)));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- slotOf reads only shape, tiles and hide, all listed
	}, [picked, fPageStart, frameCount, tiles, hide, shard, setId]);

	const selectShape = useCallback((i: number) => {
		setShapePick(i);
		setTiles(null);
		setFramePick(0);
	}, []);

	// ←/→ step through the frames of the shape, wrapping; read through a ref as /heesch does.
	const stepRef = useRef({ at: fAt, n: frameCount });
	useEffect(() => {
		stepRef.current = { at: fAt, n: frameCount };
	});
	const step = useCallback((delta: number) => {
		const { at: i, n } = stepRef.current;
		if (n > 0) setFramePick((i + delta + n) % n);
	}, []);
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

	// Mirror the selection into the URL without navigating, debounced as on /heesch.
	useEffect(() => {
		const t = window.setTimeout(() => {
			const q = new URLSearchParams();
			if (setId !== DEFAULT_SET || at > 0 || fAt > 0) q.set("set", setId);
			if (at > 0) q.set("shape", String(at));
			if (tiles === null && !hide.mirror && !hide.rotated && fAt > 0) q.set("frame", String(fAt));
			const s = q.toString();
			window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
		}, 400);
		return () => window.clearTimeout(t);
	}, [setId, at, fAt, tiles, hide]);

	// Every tiling of the region: the stored pair, and past two the rest, listed here.
	const period = loaded.period;
	const tilings = useMemo(
		() => (shape && frame ? (period && frame.c ? allTilings(shape, frame, period) : [frame.t[0], frame.t[1]]) : null),
		[shape, frame, period],
	);
	// One tiling a class when mirror images or rotations are hidden.
	const classes = useMemo(
		() => (shape && tilings ? tilingClasses(shape, tilings, hide) : null),
		[shape, tilings, hide],
	);
	// A frame is its pair, side by side or overlaid; a region with more tilings is all of them.
	const drawView: FrameView = frame?.c ? "all" : view;
	const next = useMemo(
		(): FrameDrawing | null =>
			shape && classes
				? frameDrawing(shape, classes, drawView)
				: shape
					? {
							polys: tilePolygons(shape),
							lines: [],
							empty: null,
							seams: cellSides(copyCells(shape, [1, 0, 0, 0, 1, 0])[0]).inner,
						}
					: null,
		[shape, classes, drawView],
	);
	// While a frame's file is on its way, hold the last picture: drawing the lone tile in between
	// flashes for the few frames a fetch takes.
	const [drawing, setDrawing] = useState(next);
	if (drawing !== next && !(frameCount > 0 && !frame)) setDrawing(next);
	const extent = useMemo(() => drawing?.empty?.cells.flat(), [drawing]);

	// The empty region, the cell seams and tiling 2's dashed edges, on a canvas over the patch that tracks
	// its frame: the patch renderer outlines every polygon at one weight, which none of these is.
	const overlayRef = useRef<HTMLCanvasElement>(null);
	const drawLines = useCallback(
		(f: AperiodicFrame) => {
			const cv = overlayRef.current;
			const ctx = cv?.getContext("2d");
			if (!cv || !ctx) return;
			if (cv.width !== Math.round(f.w * f.dpr) || cv.height !== Math.round(f.h * f.dpr)) {
				cv.width = Math.round(f.w * f.dpr);
				cv.height = Math.round(f.h * f.dpr);
			}
			ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
			ctx.clearRect(0, 0, f.w, f.h);
			if (!drawing) return;
			const px = strokePxAt(Math.max(strokeWidth, 1), f.zoom);
			ctx.save();
			applyViewTransform(ctx, f);
			ctx.lineJoin = "round";
			ctx.strokeStyle = STROKE_CSS;
			const { empty } = drawing;
			if (empty) {
				// One path for every cell, stroked in its own colour too so no seam shows between cells.
				ctx.beginPath();
				for (const ring of empty.cells) {
					ring.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
					ctx.closePath();
				}
				ctx.fillStyle = ctx.strokeStyle = EMPTY_FILL;
				ctx.lineWidth = 1 / f.zoom;
				ctx.fill();
				ctx.stroke();
				ctx.strokeStyle = STROKE_CSS;
				ctx.lineWidth = strokePxAt(strokeWidth, f.zoom) / f.zoom;
				if (ctx.lineWidth > 0) strokeSegs(ctx, empty.outer);
			}
			if (showCells && px > 0) {
				ctx.lineWidth = (px * SEAM_WIDTH) / f.zoom;
				ctx.globalAlpha = SEAM_ALPHA;
				strokeSegs(ctx, drawing.seams);
				if (empty) strokeSegs(ctx, empty.inner);
				ctx.globalAlpha = 1;
			}
			if (drawing.lines.length && px > 0) {
				ctx.lineWidth = px / f.zoom;
				ctx.setLineDash(OVERLAY_DASH.map((d) => (d * px) / f.zoom));
				strokeSegs(ctx, drawing.lines);
			}
			ctx.restore();
		},
		[drawing, strokeWidth, showCells],
	);
	const { canvasRef, view: patchView } = usePatchCanvas({
		polys: drawing?.polys ?? [],
		extent,
		strokeWidth,
		subject: `${setId}:${at}:${tiles}:${fAt}:${drawView}:${frame ? "f" : "t"}`,
		fixed: true,
		onFrame: drawLines,
	});
	const { requestDraw } = patchView;
	useEffect(() => {
		requestDraw();
	}, [drawLines, requestDraw]);

	// Two switchers, one selection: the grid, then a size within it; the set id carries both.
	const grid = setId.replace(/\d+$/, "");
	const gridOptions = useMemo(
		() =>
			HEESCH_GRIDS.filter((g) => index?.some((s) => s.grid === g)).map((g) => ({
				v: g,
				label: heeschGridLabel(g),
				sub: (index ?? []).reduce((n, s) => n + (s.grid === g ? s.regions : 0), 0).toLocaleString(),
			})),
		[index],
	);
	const sizeOptions = useMemo(
		() =>
			(index ?? [])
				.filter((s) => s.grid === grid)
				.map((s) => ({ v: s.id, label: String(s.cells), sub: s.regions.toLocaleString() })),
		[index, grid],
	);
	const selectGrid = useCallback((g: string) => setSetId(index?.find((s) => s.grid === g)?.id ?? DEFAULT_SET), [index]);
	const switcher = (
		<>
			<Section label="Grid">
				<Segmented options={gridOptions} value={grid} onChange={selectGrid} cols={2} />
			</Section>
			{sizeOptions.length > 0 && (
				<Section label="Cells">
					<Segmented options={sizeOptions} value={setId} onChange={setSetId} cols={SET_COLS} fill={false} />
					{setInfo && (
						<p className="text-[11px] text-fg-muted max-md:text-xs">
							{setInfo.count === 1
								? `The one free ${polyformName(setInfo)}`
								: `All ${setInfo.count.toLocaleString()} free ${polyformPlural(setInfo.grid, setInfo.cells)}`}
							: every frame of at most {setInfo.N} tiles a tiling
							{setInfo.N3 !== null
								? `, and every region of at most ${setInfo.N3} with three or more tilings and a pair of them with no tile in common`
								: ""}
							: {plural(setInfo.regions, "region")} on {plural(setInfo.framed, "shape")},{" "}
							{plural(setInfo.frames, "frame")} among them.
							{RESTRICTED.has(setInfo.grid) &&
								" Copies are placed on the grid only, so a region here may have more tilings with copies off it."}
						</p>
					)}
				</Section>
			)}
		</>
	);

	const title = shape ? polyformName(shape) : setInfo ? heeschGridLabel(setInfo.grid) : "Frames";
	const sub = !shape
		? allShapes && !shapes.length
			? "No regions in this set"
			: "Loading"
		: picked?.f
			? `${plural(picked.f, "region")} up to ${setInfo?.N ?? "?"} tiles`
			: `No region up to ${setInfo?.N ?? "?"} tiles`;

	const header = (
		<>
			<div className="flex flex-col gap-1">
				<h1 className="text-[15px] leading-tight font-semibold text-fg">{title}</h1>
				<p className="truncate text-xs text-fg-muted" title={sub}>
					{sub}
				</p>
			</div>
			{switcher}
		</>
	);
	const peek = (
		<>
			<PeekTitle title={title} sub={sub} />
			<Button variant="ghost" size="icon" icon={ChevronLeft} aria-label="Previous frame" onClick={() => step(-1)} />
			<Button variant="ghost" size="icon" icon={ChevronRight} aria-label="Next frame" onClick={() => step(1)} />
		</>
	);

	const sPage = Math.floor(at / PAGE_SIZE) + 1;
	const sPageStart = (sPage - 1) * PAGE_SIZE;

	return (
		<div className="relative flex min-h-0 flex-1">
			<CornerControls reset={false} />
			<HeeschSidebar header={header} peek={peek} title="Frames">
				<div className="flex flex-col gap-6 md:hidden">{switcher}</div>

				<Section label={`Shape · ${(at + 1).toLocaleString()} of ${shapes.length.toLocaleString()}`}>
					<Segmented
						options={shapes.slice(sPageStart, sPageStart + PAGE_SIZE).map(({ s, f }, k) => ({
							v: String(sPageStart + k),
							label: <RingGlyph rings={[outlinePage(s)]} />,
							title: `${polyformName(s)} · ${plural(f, "frame")}`,
						}))}
						value={String(at)}
						onChange={(v) => selectShape(Number(v))}
						cols={PICKER_COLS}
						fill={false}
					/>
					<Pagination
						totalItems={shapes.length}
						pageSize={PAGE_SIZE}
						currentPage={sPage}
						onPageChange={(p) => p !== sPage && selectShape((p - 1) * PAGE_SIZE)}
						showRange={false}
					/>
					{setInfo && setInfo.framed < setInfo.count && (
						<Checkbox
							id="frames-hide-empty"
							label={`Hide shapes with no region (${(setInfo.count - setInfo.framed).toLocaleString()})`}
							checked={hideEmpty}
							onCheckedChange={(v) => {
								setHideEmpty(v);
								selectShape(0);
							}}
						/>
					)}
					{setInfo &&
						(["mirror", "rotated"] as const).map(
							(k) =>
								setInfo[k] > 0 && (
									<Checkbox
										key={k}
										id={`frames-hide-${k}`}
										label={`Hide ${k === "mirror" ? "mirror images" : "rotations"} (${setInfo[k].toLocaleString()})`}
										checked={hide[k]}
										onCheckedChange={(v) => {
											setHide((h) => ({ ...h, [k]: v }));
											selectShape(0);
										}}
									/>
								),
						)}
				</Section>

				{shape && picked && picked.f > 0 && (
					<>
						<Section label="Tiles a tiling">
							<Segmented
								options={[
									{ v: "all", label: "All", sub: picked.f.toLocaleString() },
									...shown
										.map((n, k) => ({ v: String(k), label: String(k), sub: n.toLocaleString(), disabled: n === 0 }))
										.slice(2),
								]}
								value={tiles === null ? "all" : String(tiles)}
								onChange={(v) => {
									setTiles(v === "all" ? null : Number(v));
									setFramePick(0);
								}}
								cols={Math.min(shape.byN.length - 1, SET_COLS)}
								fill={false}
							/>
						</Section>

						<Section label={`Region · ${(fAt + 1).toLocaleString()} of ${frameCount.toLocaleString()}`}>
							<Segmented
								options={Array.from({ length: Math.max(0, Math.min(PAGE_SIZE, frameCount - fPageStart)) }, (_, k) => {
									const f = frameAt(fPageStart + k);
									return {
										v: String(fPageStart + k),
										label: f ? (
											<RingGlyph rings={frameRings(shape, f)} />
										) : (
											<span className="my-0.5 block h-[22px] w-[22px]" />
										),
										title: f
											? `${plural(f.n, "tile")} a tiling${f.h.length ? `, ${plural(f.h.length, "hole")}` : ""}${f.c ? `, ${f.c} tilings` : ""}`
											: "Loading",
									};
								})}
								value={String(fAt)}
								onChange={(v) => setFramePick(Number(v))}
								cols={PICKER_COLS}
								fill={false}
							/>
							<Pagination
								totalItems={frameCount}
								pageSize={PAGE_SIZE}
								currentPage={fPage}
								onPageChange={(p) => p !== fPage && setFramePick((p - 1) * PAGE_SIZE)}
								showRange={false}
							/>
						</Section>
					</>
				)}

				<ViewFooter strokeWidth={strokeWidth} onStrokeWidth={setStrokeWidth}>
					{drawView !== "all" && (
						<Segmented
							options={[
								{ v: "side", label: "Side by side", sub: "tiling 1, tiling 2" },
								{ v: "overlay", label: "Overlaid", sub: "tiling 2 dashed" },
							]}
							value={view}
							onChange={(v) => setView(v as FrameView)}
						/>
					)}
					<Checkbox id="frames-cells" label="Cells of every tile" checked={showCells} onCheckedChange={setShowCells} />
				</ViewFooter>

				{shape && (
					<Section label="Details">
						<Details
							rows={
								frame
									? [
											["Tiles", `${frame.n} a tiling`],
											...(frame.c
												? [
														[
															"Tilings",
															classes && classes.length !== frame.c
																? `${frame.c}, ${classes.length} up to ${hide.mirror && hide.rotated ? "symmetry" : hide.mirror ? "mirror images" : "rotation"}`
																: String(frame.c),
														] as [string, string],
													]
												: []),
											["Cells", String(frame.n * shape.cells)],
											[
												"Holes",
												frame.h.length ? frame.h.map((h) => `${h} cell${h === 1 ? "" : "s"}`).join(", ") : "none",
											],
											["Overlaps", frame.p.map(([k, c]) => `${c}×${k}`).join(" ")],
											...(frame.c ? [] : [["Tiling 2", RELATION[frame.m & 3]] as [string, string]]),
											["Copies", gridPlacement(shape.grid)],
											["Search", "frames.cpp, this atlas"],
										]
									: [
											["Cells", String(shape.cells)],
											["Frames", `none up to ${setInfo?.N ?? "?"} tiles a tiling`],
										]
							}
						/>
					</Section>
				)}
			</HeeschSidebar>

			<div className="relative min-h-0 flex-1">
				<canvas ref={canvasRef} className="block h-full w-full" />
				<canvas ref={overlayRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
			</div>
		</div>
	);
}
