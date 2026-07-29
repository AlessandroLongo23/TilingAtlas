"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Vector } from "@/classes/Vector";
import {
	buildMultigrid,
	canonicalOffsets,
	symmetricOffsets,
	randomOffsets,
	directions,
	MULTIGRID_SYMMETRIES,
	type MgTile,
} from "@/lib/multigrid/engine";
// The batched WebGL2 rhombus renderer, shared with the Sub Rosa view (it takes {protoId, corners}).
import { SubRosaGL as RhombRenderer } from "@/lib/render/subrosaGL";
import {
	applyViewTransform,
	useAperiodicView,
	viewToWorld,
	type AperiodicFrame,
	type HomeBox,
} from "@/lib/hooks/useAperiodicView";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RangeInput } from "@/components/ui/range-input";
import { AperiodicSidebar, Section, Segmented } from "./_controls";
import { Details, strokePxAt, STROKE_CSS, STROKE_RGBA, STROKE_WIDTH, ViewFooter } from "./_view-chrome";

// Same prototile hues as Sub Rosa, so the two constructors read as one visual system.
const HUES = [265, 175, 45, 330, 130, 200, 90];
const HUE = (protoId: number) => HUES[(protoId - 1) % HUES.length];
const famHue = (j: number, n: number) => (j * 360) / n; // grid family colour
const HIGHLIGHT = "#ff8a00"; // duality-link highlight (reads on both teal and violet tiles)

const MAX_TILES = 120_000;
const TARGET_TILES = 11_000; // pick the patch radius so every n shows a comparably-sized patch

function sumSin(n: number): number {
	let s = 0;
	for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) s += Math.sin((Math.PI * (j - i)) / n);
	return s;
}
const radiusFor = (n: number) => Math.sqrt(TARGET_TILES / (Math.PI * sumSin(n)));

function bounds(tiles: MgTile[]) {
	let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
	for (const t of tiles)
		for (const c of t.corners) {
			if (c.x < minx) minx = c.x;
			if (c.x > maxx) maxx = c.x;
			if (c.y < miny) miny = c.y;
			if (c.y > maxy) maxy = c.y;
		}
	return { minx, miny, maxx, maxy };
}

const isDark = () =>
	document.documentElement.classList.contains("dark") || document.documentElement.getAttribute("data-theme") === "dark";

// Point-in-convex-quad by consistent cross-product sign.
function pointInQuad(x: number, y: number, q: Vector[]): boolean {
	let sign = 0;
	for (let i = 0; i < 4; i++) {
		const a = q[i], b = q[(i + 1) % 4];
		const cr = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
		if (Math.abs(cr) < 1e-9) continue;
		const s = cr > 0 ? 1 : -1;
		if (sign === 0) sign = s;
		else if (s !== sign) return false;
	}
	return true;
}

// `header` is the /aperiodic view switcher, injected by the parent (see _subrosa-view.tsx).
export function MultigridView({ header }: { header: React.ReactNode }) {
	const [n, setN] = useState(5);
	const [offsets, setOffsets] = useState<number[]>(() => canonicalOffsets(5));
	const [strokeWidth, setStrokeWidth] = useState<number>(STROKE_WIDTH.def);
	const [split, setSplit] = useState(true);
	const seedRef = useRef(1);

	const radius = useMemo(() => radiusFor(n), [n]);
	const e = useMemo(() => directions(n), [n]);
	const { tiles, capped } = useMemo(() => buildMultigrid({ n, offsets, radius }, MAX_TILES), [n, offsets, radius]);

	const changeN = (nn: number) => {
		setN(nn);
		setOffsets(canonicalOffsets(nn));
	};
	const setOffset = (j: number, val: number) =>
		setOffsets((prev) => {
			const c = prev.slice();
			c[j] = val;
			return c;
		});
	const preset = (kind: "canonical" | "symmetric" | "random") =>
		setOffsets(
			kind === "symmetric" ? symmetricOffsets(n) : kind === "random" ? randomOffsets(n, seedRef.current++) : canonicalOffsets(n),
		);

	// --- refs: two panels (tiling GL + grid 2D), each with a base and a highlight overlay ---------
	// The panels hold two INDEPENDENT views — you can zoom into a crossing on the left while the whole
	// dual patch stays framed on the right — so each gets its own useAperiodicView instance.
	const canvasRef = useRef<HTMLCanvasElement>(null); // tiling GL base
	const tilingOverlayRef = useRef<HTMLCanvasElement>(null); // tiling highlight
	const gridCanvasRef = useRef<HTMLCanvasElement>(null); // grid lines base
	const gridOverlayRef = useRef<HTMLCanvasElement>(null); // grid highlight
	const glRef = useRef<RhombRenderer | null>(null);
	const modeRef = useRef<"init" | "gl" | "2d">("init");
	const uploadedRef = useRef<MgTile[] | null>(null);
	const activeRef = useRef(-1); // index of the linked-highlighted rhombus, or -1

	// Size an overlay canvas to its element and hand back a CSS-px context, cleared.
	const overlayCtx = (cv: HTMLCanvasElement, f: AperiodicFrame): CanvasRenderingContext2D => {
		if (cv.width !== Math.round(f.w * f.dpr) || cv.height !== Math.round(f.h * f.dpr)) {
			cv.width = Math.round(f.w * f.dpr);
			cv.height = Math.round(f.h * f.dpr);
		}
		const ctx = cv.getContext("2d")!;
		ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
		ctx.clearRect(0, 0, f.w, f.h);
		return ctx;
	};

	// --- overlays (highlight the linked rhombus / crossing) --------------------------------------
	// Drawn in world coordinates under the panel's own view transform, so the highlight tracks the
	// rhombus through a pan, a zoom and a rotation without any screen-space bookkeeping. Line widths
	// are divided by zoom to stay a constant number of CSS px.
	const drawTilingOverlay = useCallback(
		(f: AperiodicFrame) => {
			const cv = tilingOverlayRef.current;
			if (!cv) return;
			const ctx = overlayCtx(cv, f);
			const a = activeRef.current;
			if (a < 0 || a >= tiles.length) return;
			ctx.save();
			applyViewTransform(ctx, f);
			const t = tiles[a];
			ctx.beginPath();
			t.corners.forEach((c, k) => (k ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
			ctx.closePath();
			ctx.fillStyle = isDark() ? "rgba(255,138,0,0.30)" : "rgba(255,138,0,0.28)";
			ctx.fill();
			ctx.lineWidth = 2.5 / f.zoom;
			ctx.strokeStyle = HIGHLIGHT;
			ctx.stroke();
			ctx.restore();
		},
		[tiles],
	);

	const drawGridOverlay = useCallback(
		(f: AperiodicFrame) => {
			const cv = gridOverlayRef.current;
			if (!cv) return;
			const ctx = overlayCtx(cv, f);
			const a = activeRef.current;
			if (a < 0 || a >= tiles.length) return;
			ctx.save();
			applyViewTransform(ctx, f);
			const t = tiles[a];
			const L = radius * 3;
			for (const fam of t.fams) {
				const ev = e[fam];
				const perp = { x: -ev.y, y: ev.x };
				ctx.beginPath();
				ctx.moveTo(t.site.x - L * perp.x, t.site.y - L * perp.y);
				ctx.lineTo(t.site.x + L * perp.x, t.site.y + L * perp.y);
				ctx.lineWidth = 3 / f.zoom;
				ctx.strokeStyle = `hsl(${famHue(fam, n)} 85% 50%)`;
				ctx.stroke();
			}
			ctx.beginPath();
			ctx.arc(t.site.x, t.site.y, 5 / f.zoom, 0, Math.PI * 2);
			ctx.fillStyle = HIGHLIGHT;
			ctx.fill();
			ctx.lineWidth = 1.5 / f.zoom;
			ctx.strokeStyle = "#fff";
			ctx.stroke();
			ctx.restore();
		},
		[tiles, e, n, radius],
	);

	// --- bases -----------------------------------------------------------------------------------
	const tilingHome = useCallback((): HomeBox | null => {
		if (tiles.length === 0) return null;
		const b = bounds(tiles);
		return {
			cx: (b.minx + b.maxx) / 2,
			cy: (b.miny + b.maxy) / 2,
			width: b.maxx - b.minx || 1,
			height: b.maxy - b.miny || 1,
		};
	}, [tiles]);

	const drawTiling = useCallback(
		(f: AperiodicFrame) => {
			const cv = canvasRef.current;
			if (!cv) return;
			const dark = isDark();
			const light = dark ? 62 : 66;
			const strokePx = strokePxAt(strokeWidth, f.zoom);

			if (modeRef.current === "gl" && glRef.current) {
				glRef.current.draw(
					{
						widthCss: f.w,
						heightCss: f.h,
						zoom: f.zoom,
						offsetX: f.offsetX,
						offsetY: f.offsetY,
						rot: f.rot,
						centreX: f.centreX,
						centreY: f.centreY,
						light,
						strokePx,
						strokeRGBA: STROKE_RGBA,
					},
					f.dpr,
				);
			} else {
				const ctx = cv.getContext("2d")!;
				ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
				ctx.clearRect(0, 0, f.w, f.h);
				ctx.save();
				applyViewTransform(ctx, f);
				ctx.lineJoin = "round";
				for (const t of tiles) {
					ctx.beginPath();
					ctx.moveTo(t.corners[0].x, t.corners[0].y);
					for (let i = 1; i < t.corners.length; i++) ctx.lineTo(t.corners[i].x, t.corners[i].y);
					ctx.closePath();
					ctx.fillStyle = `hsl(${HUE(t.protoId)} 58% ${light}%)`;
					ctx.fill();
					if (strokePx > 0) {
						ctx.lineWidth = strokePx / f.zoom;
						ctx.strokeStyle = STROKE_CSS;
						ctx.stroke();
					}
				}
				ctx.restore();
			}
			drawTilingOverlay(f);
		},
		[tiles, strokeWidth, drawTilingOverlay],
	);

	// The grid's home box is the sampling disc itself: lines are drawn only within `radius` of the
	// origin, so framing 2R square shows exactly the crossings that became rhombi.
	const gridHome = useCallback((): HomeBox => ({ cx: 0, cy: 0, width: 2 * radius, height: 2 * radius }), [radius]);

	const drawGrid = useCallback(
		(f: AperiodicFrame) => {
			const cv = gridCanvasRef.current;
			if (!cv) return;
			const ctx = cv.getContext("2d")!;
			ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
			ctx.clearRect(0, 0, f.w, f.h);
			ctx.save();
			applyViewTransform(ctx, f);
			const R = radius, L = radius * 3;
			ctx.lineWidth = 0.8 / f.zoom;
			for (let j = 0; j < n; j++) {
				const ev = e[j];
				const perp = { x: -ev.y, y: ev.x };
				const kLo = Math.ceil(offsets[j] - R), kHi = Math.floor(offsets[j] + R);
				ctx.beginPath();
				for (let k = kLo; k <= kHi; k++) {
					const d = k - offsets[j];
					const fx = d * ev.x, fy = d * ev.y;
					ctx.moveTo(fx - L * perp.x, fy - L * perp.y);
					ctx.lineTo(fx + L * perp.x, fy + L * perp.y);
				}
				ctx.strokeStyle = `hsl(${famHue(j, n)} 55% 55%)`;
				ctx.stroke();
			}
			ctx.restore();
			drawGridOverlay(f);
		},
		[offsets, n, e, radius, drawGridOverlay],
	);

	// --- picking (the duality link) --------------------------------------------------------------
	// Both panels must repaint when the highlight moves, and each owns its own dirty flag.
	const redrawBoth = useRef<() => void>(() => {});
	const setActive = useCallback((idx: number) => {
		if (activeRef.current === idx) return;
		activeRef.current = idx;
		redrawBoth.current();
	}, []);

	const pickTiling = useCallback(
		(sx: number, sy: number, f: AperiodicFrame) => {
			const w = viewToWorld(f, sx, sy);
			for (let t = 0; t < tiles.length; t++) if (pointInQuad(w.x, w.y, tiles[t].corners)) return setActive(t);
			setActive(-1);
		},
		[tiles, setActive],
	);
	const pickGrid = useCallback(
		(sx: number, sy: number, f: AperiodicFrame) => {
			const w = viewToWorld(f, sx, sy);
			let best = -1, bd = Infinity;
			for (let t = 0; t < tiles.length; t++) {
				const s = tiles[t].site;
				const dx = s.x - w.x, dy = s.y - w.y, d = dx * dx + dy * dy;
				if (d < bd) { bd = d; best = t; }
			}
			const tol = 12 / f.zoom; // 12 CSS px, whatever the zoom
			setActive(bd < tol * tol ? best : -1);
		},
		[tiles, setActive],
	);

	const tilingView = useAperiodicView({
		canvasRef,
		home: tilingHome,
		fill: 0.9,
		draw: drawTiling,
		// Hover-picking is the split view's duality link; with one panel there is nothing to link to.
		onHover: split ? pickTiling : undefined,
		onHoverEnd: () => setActive(-1),
	});
	const gridView = useAperiodicView({
		canvasRef: gridCanvasRef,
		home: gridHome,
		fill: 0.9,
		draw: drawGrid,
		onHover: pickGrid,
		onHoverEnd: () => setActive(-1),
	});

	useEffect(() => {
		redrawBoth.current = () => {
			tilingView.requestDraw();
			gridView.requestDraw();
		};
	}, [tilingView.requestDraw, gridView.requestDraw]); // eslint-disable-line react-hooks/exhaustive-deps

	// --- GL renderer lifecycle -------------------------------------------------------------------
	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const gl = cv.getContext("webgl2", { antialias: true, premultipliedAlpha: false, alpha: true });
		if (gl) {
			try {
				glRef.current = new RhombRenderer(gl);
				modeRef.current = "gl";
			} catch {
				modeRef.current = "2d";
			}
		} else {
			modeRef.current = "2d";
		}
		uploadedRef.current = null;
		return () => {
			glRef.current?.dispose();
			glRef.current = null;
			uploadedRef.current = null;
		};
	}, []);

	// (re)upload + reframe both panels when the tiling changes
	useEffect(() => {
		activeRef.current = -1;
		if (modeRef.current === "gl" && glRef.current && uploadedRef.current !== tiles) {
			glRef.current.uploadTiles(tiles, HUE);
			uploadedRef.current = tiles;
		}
		tilingView.refit();
		gridView.refit();
	}, [tiles, tilingView.refit, gridView.refit]); // eslint-disable-line react-hooks/exhaustive-deps

	// Toggling split relays out the panels; the ResizeObserver in the hook rescales them, but the
	// tiling panel's home framing should also recentre, so refit it once the DOM has settled.
	useEffect(() => {
		const id = requestAnimationFrame(() => {
			tilingView.refit();
			gridView.refit();
		});
		return () => cancelAnimationFrame(id);
	}, [split, tilingView.refit, gridView.refit]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		redrawBoth.current();
	}, [strokeWidth]);

	// dev hook for visual checks
	useEffect(() => {
		(window as unknown as { __multigrid?: unknown }).__multigrid = {
			setN: changeN,
			setOffset,
			preset,
			setSplit,
			tileCount: () => tiles.length,
		};
	}, [tiles]); // eslint-disable-line react-hooks/exhaustive-deps

	const protoCount = Math.floor(n / 2);

	return (
		<div className="flex-1 min-h-0 flex">
			<AperiodicSidebar header={header}>
				<Section label="Symmetry">
					<Segmented
						cols={4}
						options={MULTIGRID_SYMMETRIES.map((s) => ({ v: String(s), label: `${2 * s}` }))}
						value={String(n)}
						onChange={(v) => changeN(Number(v))}
					/>
				</Section>

				<Section label="Offsets γⱼ">
					{/* Each row is one grid family, tinted with the colour that family's lines carry on the
					    z-space panel — the label IS the legend. Hence a bare RangeInput per row, not a
					    Slider: Slider owns its own label/value row, which would fight this one. */}
					{offsets.map((g, j) => (
						<div key={j} className="flex items-center gap-2">
							<span
								className="text-[11px] font-mono w-6 tabular-nums shrink-0"
								style={{ color: `hsl(${famHue(j, n)} 55% 50%)` }}
							>
								γ{sub(j)}
							</span>
							<div className="flex-1 min-w-0">
								<RangeInput min={0} max={1} step={0.001} value={g} onChange={(v) => setOffset(j, v)} />
							</div>
							<span className="text-[11px] font-mono text-fg-muted w-8 tabular-nums text-right shrink-0">
								{g.toFixed(2)}
							</span>
						</div>
					))}
					<div className="grid grid-cols-3 gap-1.5">
						<Button variant="secondary" size="sm" onClick={() => preset("canonical")}>
							Reset
						</Button>
						<Button variant="secondary" size="sm" onClick={() => preset("symmetric")}>
							Symmetric
						</Button>
						<Button variant="secondary" size="sm" onClick={() => preset("random")}>
							Random
						</Button>
					</div>
				</Section>

				<ViewFooter
					view={{
						// Turn both panels together — they are two windows on one construction, and a grid at a
						// different angle from its dual stops reading as the same object.
						rotationDeg: tilingView.rotationDeg,
						setRotation: (deg) => {
							tilingView.setRotation(deg);
							gridView.setRotation(deg);
						},
					}}
					strokeWidth={strokeWidth}
					onStrokeWidth={setStrokeWidth}
				>
					<Checkbox
						id="multigrid-split"
						label="Split view (grid + tiling)"
						checked={split}
						onCheckedChange={setSplit}
					/>
				</ViewFooter>

				<Section label="Details">
					<Details
						rows={[
							["Construction", "de Bruijn multigrid"],
							["Symmetry", `${2 * n}-fold · n = ${n}${n === 5 ? " (Penrose)" : n === 4 ? " (Ammann–Beenker)" : ""}`],
							["Prototiles", `${protoCount} rhomb${protoCount > 1 ? "s" : ""}`],
							["Rhombi", `${tiles.length.toLocaleString()}${capped ? " (capped)" : ""}`],
						]}
					/>
				</Section>
			</AperiodicSidebar>

			<div className="flex-1 min-h-0 flex flex-col md:flex-row">
				{split && (
					<div className="relative flex-1 min-h-0 border-b md:border-b-0 md:border-r border-line-subtle">
						<canvas
							ref={gridCanvasRef}
							className="w-full h-full block cursor-grab active:cursor-grabbing touch-none"
							{...gridView.handlers}
						/>
						<canvas ref={gridOverlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
						<PanelTag>multigrid · z-space</PanelTag>
					</div>
				)}
				<div className="relative flex-1 min-h-0">
					<canvas
						ref={canvasRef}
						className="w-full h-full block cursor-grab active:cursor-grabbing touch-none"
						{...tilingView.handlers}
					/>
					<canvas ref={tilingOverlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
					<PanelTag>dual tiling</PanelTag>
				</div>
			</div>
		</div>
	);
}

const SUBS = "₀₁₂₃₄₅₆₇₈₉";
const sub = (j: number) => String(j).split("").map((d) => SUBS[Number(d)]).join("");

function PanelTag({ children }: { children: React.ReactNode }) {
	return (
		<div className="absolute top-2 left-2 text-[11px] text-fg-subtle bg-surface-raised/80 px-1.5 py-0.5 rounded pointer-events-none">
			{children}
		</div>
	);
}

