"use client";

// The pentagon shelf: the fifteen types of convex pentagon that tile the plane.
//
// Reinhardt found five in 1918 and believed the list complete. Kershner added three in 1968 and
// believed the same. James, Rice and Stein brought it to fourteen by 1985; Mann, McLoud-Mann and Von
// Derau found the fifteenth by computer search in 2015, and Rao proved in 2017 that there are no more.
// Each type is a FAMILY, not a shape: its conditions leave between zero and five degrees of freedom,
// and the sliders here move within them. Type 1 has five, Types 14 and 15 have none.
//
// These tilings are periodic, so they render on the atlas' flat Euclidean renderer, the one /play and
// /isohedral use: FlatCellRenderer takes one translational cell and the vertex shader instances it
// across the visible lattice every frame (lib/render/flatTilingGL.ts). The tiling is therefore
// unbounded, and a frame costs two instanced draw calls whatever the zoom. It also makes the sliders
// cheap in the way that matters: a parameter change rebuilds between 2 and 12 pentagons, not a patch.
//
// drawPolygons over expandToViewport is the 2-D fallback for a canvas with no WebGL2 context, walking
// the same lattice on the CPU.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import { useSearchParams } from "next/navigation";
import { Lock, RotateCcw } from "lucide-react";
import { useParametricTilingCanvas } from "@/lib/hooks/useParametricTilingCanvas";
import { tilingPeriodicCell } from "@/lib/render/periodic/tilings";
import { Button } from "@/components/ui/button";
import { RangeInput } from "@/components/ui/range-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Reveal } from "@/components/ui/reveal";
import { TilingInfo } from "@/components/tiling-info";
import { InversiveCanvas } from "@/components/inversive-canvas";
import { InversiveControls, useInversiveShortcut } from "@/components/inversive-controls";
import { FullscreenToggle, useImmersiveShortcuts } from "@/components/fullscreen-toggle";
import { useConfiguration } from "@/stores/configuration";
import { useImmersive } from "@/stores/immersive";
import type { TilingSpec } from "@/lib/services/tilingSpec";
import {
	DEFAULT_TYPE,
	PENTAGON_TYPES,
	defaultParams,
	parseType,
	pentagonType,
} from "@/lib/pentagon/types";
import { buildCell, hasAssembly } from "@/lib/pentagon/build";
import { PentagonSidebar, Section, Segmented, type SegmentedOption } from "./_controls";
import { PrototileInspector } from "./_prototile";

const STROKE_WIDTH = { min: 0, max: 3, step: 0.25, def: 1.5 } as const;
const STROKE_RGB: [number, number, number] = [0, 0, 0];
const STROKE_CSS = "#000";

/** Lattice radius the CPU fallback walks out to. Well past a screenful at the zooms this page uses. */
const FALLBACK_MAX_RADIUS = 40;

/** Columns in the type grid. The arrow keys walk the same layout, so both read it from here. */
const GRID_COLS = 5;

/** Arrow key → (column step, row step) in that grid. */
const ARROW_STEP: Record<string, [number, number]> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
};

export function PentagonsClient() {
	const searchParams = useSearchParams();

	// Start on the default and adopt ?type= in an effect, NOT in the useState initialiser.
	//
	// The page is force-static, so its HTML is prerendered at build time with no search params. Seeding
	// state from the URL during render therefore makes the server say "Type 1" while the client says
	// "Type 15", and React reports a hydration mismatch and refuses to patch it. Reading the URL after
	// mount costs one extra render on a deep link and keeps the two passes agreeing.
	const [id, setId] = useState<number>(DEFAULT_TYPE);
	const type = pentagonType(id) ?? pentagonType(DEFAULT_TYPE)!;

	const [angles, setAngles] = useState<number[]>(() => defaultParams(type).angles);
	const [sides, setSides] = useState<number[]>(() => defaultParams(type).sides);
	const [strokeWidth, setStrokeWidth] = useState<number>(STROKE_WIDTH.def);

	const canvasRef = useRef<HTMLCanvasElement>(null);

	// Selecting a type replaces its whole control set: a parameter vector only means anything relative
	// to the type it belongs to, and the types do not even agree on how many sliders there are.
	const selectType = useCallback((next: number) => {
		const t = pentagonType(next);
		if (!t) return;
		setId(next);
		const d = defaultParams(t);
		setAngles(d.angles);
		setSides(d.sides);
	}, []);

	const resetShape = useCallback(() => {
		const d = defaultParams(type);
		setAngles(d.angles);
		setSides(d.sides);
	}, [type]);

	// ←/→/↑/↓ move through the type grid the way it is drawn: one step along the row, one row down the
	// column. Both wrap, and fifteen types over five columns is exactly three full rows, so a column
	// cycles 1 → 6 → 11 → 1 with nothing skipped. The tag guard leaves the arrows to a focused slider,
	// where they nudge the parameter and must not also change the type.
	//
	// The listener binds once and reads the selection through a ref, the same shape lib/hooks/
	// useKeyShortcuts uses. Closing over `id` and re-binding on every selection instead leaves a window
	// between the render that shows the new type and the effect that swaps the listener, and a key
	// pressed inside it steps from the PREVIOUS type. Measured, not hypothetical: with ?type=14 the
	// first ArrowRight after load gave Type 2, stepping from the default instead of from 14.
	const idRef = useRef(id);
	useEffect(() => {
		idRef.current = id;
	});
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (isTypingTarget(e)) return;
			const step = ARROW_STEP[e.key];
			if (!step) return;
			e.preventDefault();
			const [dx, dy] = step;
			const n = PENTAGON_TYPES.length;
			const i = Math.max(0, PENTAGON_TYPES.findIndex((t) => t.id === idRef.current));
			if (dx !== 0) {
				selectType(PENTAGON_TYPES[(i + dx + n) % n].id);
				return;
			}
			// Walk the column, stepping over the empty slots a partial last row would leave (none at 15).
			const rows = Math.ceil(n / GRID_COLS);
			const col = i % GRID_COLS;
			let row = Math.floor(i / GRID_COLS);
			for (let s = 0; s < rows; s++) {
				row = (row + dy + rows) % rows;
				const j = row * GRID_COLS + col;
				if (j < n) {
					selectType(PENTAGON_TYPES[j].id);
					return;
				}
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [selectType]);

	// Immersive (fullscreen-canvas) mode: collapses the header + sidebar so the tiling fills the window.
	// F toggles it, Esc leaves it, and the hook restores the chrome when this page unmounts.
	const immersive = useImmersive((s) => s.immersive);
	useImmersiveShortcuts();

	// Adopt a deep link once, after hydration. Runs on mount only: afterwards this component owns the
	// selection and the effect below writes it back out.
	const adopted = useRef(false);
	useEffect(() => {
		if (adopted.current) return;
		adopted.current = true;
		const fromUrl = parseType(searchParams.get("type"));
		if (fromUrl !== DEFAULT_TYPE) selectType(fromUrl);
	}, [searchParams, selectType]);

	// Mirror the selection into the URL without navigating, so a reload and a shared link both land on
	// the same type. Debounced because the grid is clickable at speed and WebKit disables replaceState
	// after 100 calls in 30s.
	useEffect(() => {
		const t = window.setTimeout(() => {
			const q = id === DEFAULT_TYPE ? "" : `?type=${id}`;
			window.history.replaceState(null, "", `${window.location.pathname}${q}`);
		}, 400);
		return () => window.clearTimeout(t);
	}, [id]);

	const result = useMemo(() => buildCell({ id, angles, sides }), [id, angles, sides]);

	// Keep the last drawable cell on screen when a tuple has no pentagon. Dragging INTO the invalid
	// region and being told why is how a reader learns where the family ends; blanking the canvas
	// would just look like a bug.
	const lastCellRef = useRef(result.ok ? result.cell : null);
	if (result.ok) lastCellRef.current = result.cell;
	const cell = result.ok ? result.cell : lastCellRef.current;

	// The conformal lens: the same cell seen through a circle inversion, a Möbius map or Kaplan's spiral.
	// Reads the cell through the shared periodic-cell IR, so the pentagons reach it with no renderer of
	// their own. Same store fields as /play's, so a mode picked there is the mode here.
	const lens = useConfiguration((s) => s.inversive);
	const setLens = useCallback((v: boolean) => useConfiguration.getState().set({ inversive: v }), []);
	useInversiveShortcut();
	const lensCell = useMemo(
		() => (lens && cell ? tilingPeriodicCell({ cellPolygons: cell.polygons, basis: [cell.v1, cell.v2] }) : null),
		[lens, cell],
	);
	// Everything that moves the geometry, so the lens re-uploads exactly when it changes.
	const lensCellId = useMemo(
		() => (lensCell ? `pent${id}:${angles.join(",")}:${sides.join(",")}` : null),
		[lensCell, id, angles, sides],
	);

	/**
	 * What counts as "a different thing to look at", as opposed to the same thing deformed.
	 *
	 * Only the type. Picking Type 5 after Type 2 is a different tiling and should snap home; the angle
	 * and side sliders deform the one you are already looking at, and snapping on those would reset the
	 * camera on every tick of a drag, so you could never zoom into a vertex and watch what the parameter
	 * does to it, which is precisely the thing worth watching.
	 */
	const { view, lensCamera } = useParametricTilingCanvas({
		canvasRef,
		cell,
		strokeWidth,
		strokeRgb: STROKE_RGB,
		strokeCss: STROKE_CSS,
		framingKey: `${id}`,
		fallbackMaxRadius: FALLBACK_MAX_RADIUS,
		lensActive: lens,
	});

	const typeOptions: SegmentedOption[] = useMemo(
		() =>
			PENTAGON_TYPES.map((t) => ({
				v: String(t.id),
				label: <span className="text-[13px] tabular-nums">{t.id}</span>,
				// Sans at 11px so "1" never reads as "i"; a lock marks the rigid types.
				sub: (
					<span className="font-sans text-[11px]">
						{t.dof === 0 ? <Lock size={10} className="inline" aria-label="rigid" /> : t.dof}
					</span>
				),
				dim: !hasAssembly(t.id),
				title: `${t.label} · ${t.discovered} · ${t.dof} degree${t.dof === 1 ? "" : "s"} of freedom · ${t.tilesPerUnit} tiles per unit · ${t.constraints.map((c) => c.text).join("; ")}`,
			})),
		[],
	);

	const header = (
		<div className="ta-wall-cell bg-surface-chrome px-3.5 py-3 flex flex-col gap-1.5">
			<span className="text-[15px] font-semibold text-fg">{type.label}</span>
			<span className="text-xs text-fg-secondary">
				{type.discovered} · {type.tilesPerUnit} tiles/unit
			</span>
			<span className="flex flex-wrap gap-1">
				{type.groups.split(", ").map((g) => (
					<span key={g} className="rounded-control bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg-secondary">
						{g}
					</span>
				))}
			</span>
		</div>
	);

	/**
	 * The facts, for the same floating info panel /play carries over its canvas — not a sidebar block.
	 *
	 * They belong there because they are what the tiling IS, not what you can set: the sidebar states
	 * values you can change, and every row here is read-only output. Putting them in the shared panel
	 * also means one presenter decides how a tiling describes itself across the whole atlas.
	 *
	 * The orbit counts stay null. A monohedral pentagon tiling's vertex and tile orbits are not derived
	 * anywhere on this page, and reporting four blanks would say less than reporting nothing — the panel
	 * drops the section when it knows none of them.
	 */
	const spec: TilingSpec = useMemo(
		() => ({
			geometry: "euclidean",
			label: type.label,
			// Čtrnáct's ladder describes tilings by REGULAR polygons; this page's tiles are neither.
			level: null,
			wallpaperGroup: null,
			orbifold: null,
			latticeShape: null,
			freedraw: null,
			colors: null,
			isohedral: null,
			pentagon: {
				typeId: type.id,
				discovered: type.discovered,
				dof: type.dof,
				tilesPerUnit: type.tilesPerUnit,
				groups: type.groups,
				angles: cell ? cell.angles : null,
				sides: cell ? cell.sides : null,
				status: result.ok ? null : result.reason,
			},
			k: null,
			m: null,
			partition: null,
			edgeOrbits: null,
			faceOrbits: null,
		}),
		[type, cell, result],
	);

	return (
		<div className="flex-1 min-h-0 flex">
			<PentagonSidebar
				collapsed={immersive}
				header={header}
				types={
					<Section label="Family">
						<Segmented
							cols={GRID_COLS}
							options={typeOptions}
							value={String(id)}
							onChange={(v) => selectType(Number(v))}
						/>
					</Section>
				}
			>
				{cell ? (
					<Section label="Prototile">
						<PrototileInspector
							type={type}
							corners={cell.prototile}
							angles={cell.angles}
							sides={cell.sides}
							hue={cell.polygons[0]?.hue ?? 0}
						/>
					</Section>
				) : null}

				{type.angleParams.length + type.sideParams.length > 0 ? (
					<Section label="Parameters">
						<div className="flex flex-col">
							{type.angleParams.map((p, i) => (
								<ParamRow
									key={p.key}
									id={`pent-angle-${i}`}
									label={p.key}
									value={angles[i] ?? p.def}
									onChange={(v) => setAngles((prev) => prev.map((old, j) => (j === i ? v : old)))}
									min={p.min}
									max={p.max}
									step={p.step}
									format={(v) => `${v}°`}
								/>
							))}
							{type.sideParams.map((p, i) => (
								<ParamRow
									key={p.key}
									id={`pent-side-${i}`}
									label={p.key}
									value={sides[i] ?? p.def}
									onChange={(v) => setSides((prev) => prev.map((old, j) => (j === i ? v : old)))}
									min={p.min}
									max={p.max}
									step={p.step}
									format={(v) => v.toFixed(3)}
								/>
							))}
						</div>
						<Button variant="ghost" size="sm" icon={RotateCcw} label="Reset" onClick={resetShape} classes="border-line-subtle" />
						{result.ok ? null : (
							<p className="text-[11px] text-fg-muted">
								No pentagon here: {result.reason}. The tiling shown is the last valid one.
							</p>
						)}
					</Section>
				) : (
					<Section label="Parameters">
						<p className="text-xs text-fg-muted">
							Rigid. This type&apos;s conditions fix the pentagon completely, up to size.
						</p>
					</Section>
				)}

				{/* No zoom control: the wheel does it, over an unbounded tiling. A slider for it would
				    duplicate the gesture and, because changing the framing refits, would yank the view back
				    to home the moment you touched it. */}
				<Section label="View">
					<div className="flex flex-col">
						<ParamRow
							id="pent-rotation"
							label="Rotation"
							title="Shift + scroll over the canvas also rotates"
							value={view.rotationDeg}
							onChange={view.setRotation}
							min={0}
							max={359}
							step={1}
							format={(v) => `${v}°`}
						/>
						<ParamRow
							id="pent-outlines"
							label="Outlines"
							value={strokeWidth}
							onChange={setStrokeWidth}
							min={STROKE_WIDTH.min}
							max={STROKE_WIDTH.max}
							step={STROKE_WIDTH.step}
							format={(v) => (v === 0 ? "off" : `${v} px`)}
						/>
					</div>
					<Checkbox
						id="pent-inversive"
						label="Inversive view"
						shortcut="X"
						checked={lens}
						onCheckedChange={(v) => setLens(v)}
					/>
					<Reveal show={lens}>
						<div className="pl-7">
							<InversiveControls />
						</div>
					</Reveal>
				</Section>

			</PentagonSidebar>

			<div className="flex-1 min-h-0 relative">
				<canvas
					ref={canvasRef}
					className="w-full h-full block cursor-grab active:cursor-grabbing touch-none"
					{...view.handlers}
				/>
				{/* The lens is a second canvas over the first, which stays mounted as the input layer —
				    the same arrangement /play uses, and for the same reason: a canvas holds one WebGL
				    context for its life. */}
				{lens ? <InversiveCanvas cell={lensCell} cellId={lensCellId} camera={lensCamera} /> : null}
				{/* Same corner, same component as /play's canvas. */}
				<div className="absolute top-4 left-4 z-20">
					<TilingInfo spec={spec} />
				</div>
				{/* Opposite corner, and the only control that stays put while immersive — it is the way back. */}
				<FullscreenToggle />
			</div>
		</div>
	);
}

/** One slider on a single 36px line: name, track, tabular value. Every slider in the panel uses it. */
function ParamRow({
	id,
	label,
	title,
	format,
	...range
}: {
	id: string;
	label: string;
	title?: string;
	value: number;
	onChange: (v: number) => void;
	min: number;
	max: number;
	step: number;
	format: (v: number) => string;
}) {
	return (
		<div className="grid h-9 grid-cols-[3.75rem_1fr_3.5rem] items-center gap-3">
			<label htmlFor={id} title={title} className="text-[13px] font-medium text-fg-secondary">
				{label}
			</label>
			<RangeInput id={id} {...range} />
			<span className="text-right font-mono text-xs text-fg tabular-nums">{format(range.value)}</span>
		</div>
	);
}
