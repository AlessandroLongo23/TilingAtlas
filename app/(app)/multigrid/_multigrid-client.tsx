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
// The batched WebGL2 rhombus renderer, shared with the Sub Rosa shelf (it takes {protoId, corners}).
import { SubRosaGL as RhombRenderer } from "@/lib/render/subrosaGL";
import { cn } from "@/lib/utils/cn";

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

export function MultigridClient() {
	const [n, setN] = useState(5);
	const [offsets, setOffsets] = useState<number[]>(() => canonicalOffsets(5));
	const [showStroke, setShowStroke] = useState(true);
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
	const canvasRef = useRef<HTMLCanvasElement>(null); // tiling GL base
	const tilingOverlayRef = useRef<HTMLCanvasElement>(null); // tiling highlight
	const gridCanvasRef = useRef<HTMLCanvasElement>(null); // grid lines base
	const gridOverlayRef = useRef<HTMLCanvasElement>(null); // grid highlight
	const view = useRef({ scale: 1, ox: 0, oy: 0, fitted: false });
	const gridView = useRef({ scale: 1, ox: 0, oy: 0 });
	const drag = useRef<{ x: number; y: number } | null>(null);
	const gridDrag = useRef<{ x: number; y: number } | null>(null);
	const glRef = useRef<RhombRenderer | null>(null);
	const modeRef = useRef<"init" | "gl" | "2d">("init");
	const uploadedRef = useRef<MgTile[] | null>(null);
	const activeRef = useRef(-1); // index of the linked-highlighted rhombus, or -1

	// size a 2D canvas to its element (dpr backing) and return a CSS-px context
	const ctx2d = (cv: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } => {
		const dpr = window.devicePixelRatio || 1;
		const w = cv.clientWidth, h = cv.clientHeight;
		if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
			cv.width = Math.round(w * dpr);
			cv.height = Math.round(h * dpr);
		}
		const ctx = cv.getContext("2d")!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);
		return { ctx, w, h };
	};

	// --- overlays (highlight the linked rhombus / crossing) --------------------------------------
	const drawTilingOverlay = useCallback(() => {
		const cv = tilingOverlayRef.current;
		if (!cv) return;
		const { ctx } = ctx2d(cv);
		const a = activeRef.current;
		if (a < 0 || a >= tiles.length) return;
		const { scale, ox, oy } = view.current;
		const t = tiles[a];
		ctx.beginPath();
		t.corners.forEach((c, k) => {
			const x = ox + scale * c.x, y = oy - scale * c.y;
			if (k) ctx.lineTo(x, y);
			else ctx.moveTo(x, y);
		});
		ctx.closePath();
		ctx.fillStyle = isDark() ? "rgba(255,138,0,0.30)" : "rgba(255,138,0,0.28)";
		ctx.fill();
		ctx.lineWidth = 2.5;
		ctx.strokeStyle = HIGHLIGHT;
		ctx.stroke();
	}, [tiles]);

	const drawGridOverlay = useCallback(() => {
		const cv = gridOverlayRef.current;
		if (!cv) return;
		const { ctx } = ctx2d(cv);
		const a = activeRef.current;
		if (a < 0 || a >= tiles.length) return;
		const { scale, ox, oy } = gridView.current;
		const t = tiles[a];
		const L = radius * 3;
		for (const fam of t.fams) {
			const ev = e[fam];
			const perp = { x: -ev.y, y: ev.x };
			const p1 = { x: t.site.x - L * perp.x, y: t.site.y - L * perp.y };
			const p2 = { x: t.site.x + L * perp.x, y: t.site.y + L * perp.y };
			ctx.beginPath();
			ctx.moveTo(ox + scale * p1.x, oy - scale * p1.y);
			ctx.lineTo(ox + scale * p2.x, oy - scale * p2.y);
			ctx.lineWidth = 3;
			ctx.strokeStyle = `hsl(${famHue(fam, n)} 85% 50%)`;
			ctx.stroke();
		}
		const dx = ox + scale * t.site.x, dy = oy - scale * t.site.y;
		ctx.beginPath();
		ctx.arc(dx, dy, 5, 0, Math.PI * 2);
		ctx.fillStyle = HIGHLIGHT;
		ctx.fill();
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = "#fff";
		ctx.stroke();
	}, [tiles, e, n, radius]);

	const setActive = useCallback(
		(idx: number) => {
			if (activeRef.current === idx) return;
			activeRef.current = idx;
			drawTilingOverlay();
			drawGridOverlay();
		},
		[drawTilingOverlay, drawGridOverlay],
	);

	// --- bases -----------------------------------------------------------------------------------
	const fit = useCallback(() => {
		const cv = canvasRef.current;
		if (!cv || tiles.length === 0) return;
		const b = bounds(tiles);
		const w = cv.clientWidth, h = cv.clientHeight;
		const bw = b.maxx - b.minx || 1, bh = b.maxy - b.miny || 1;
		const s = 0.9 * Math.min(w / bw, h / bh);
		view.current.scale = s;
		view.current.ox = w / 2 - (s * (b.minx + b.maxx)) / 2;
		view.current.oy = h / 2 + (s * (b.miny + b.maxy)) / 2; // y flipped
		view.current.fitted = true;
	}, [tiles]);

	const draw = useCallback(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const dpr = window.devicePixelRatio || 1;
		const w = cv.clientWidth, h = cv.clientHeight;
		if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
			cv.width = Math.round(w * dpr);
			cv.height = Math.round(h * dpr);
		}
		const { scale: vScale, ox: vOx, oy: vOy } = view.current;
		const dark = isDark();
		const light = dark ? 62 : 66;
		const strokeOn = showStroke && vScale > 2.2;
		const strokeRGBA: [number, number, number, number] = dark ? [0, 0, 0, 0.55] : [30 / 255, 20 / 255, 40 / 255, 0.5];

		if (modeRef.current === "gl" && glRef.current) {
			glRef.current.draw(
				{ widthCss: w, heightCss: h, scale: vScale, ox: vOx, oy: vOy, light, strokePx: strokeOn ? 1.1 : 0, strokeRGBA },
				dpr,
			);
		} else {
			const ctx = cv.getContext("2d")!;
			ctx.save();
			ctx.scale(dpr, dpr);
			ctx.clearRect(0, 0, w, h);
			const tx = (p: Vector) => [vOx + vScale * p.x, vOy - vScale * p.y] as const;
			ctx.lineJoin = "round";
			for (const t of tiles) {
				ctx.beginPath();
				const [x0, y0] = tx(t.corners[0]);
				ctx.moveTo(x0, y0);
				for (let i = 1; i < t.corners.length; i++) {
					const [x, y] = tx(t.corners[i]);
					ctx.lineTo(x, y);
				}
				ctx.closePath();
				ctx.fillStyle = `hsl(${HUE(t.protoId)} 58% ${light}%)`;
				ctx.fill();
				if (strokeOn) {
					ctx.lineWidth = Math.max(0.3, Math.min(1.1, vScale * 0.03));
					ctx.strokeStyle = dark ? "rgba(0,0,0,0.55)" : "rgba(30,20,40,0.5)";
					ctx.stroke();
				}
			}
			ctx.restore();
		}
		drawTilingOverlay();
	}, [tiles, showStroke, drawTilingOverlay]);

	const gridFit = useCallback(() => {
		const cv = gridCanvasRef.current;
		if (!cv) return;
		const w = cv.clientWidth, h = cv.clientHeight;
		const s = (0.9 * Math.min(w, h)) / (2 * radius);
		gridView.current.scale = s;
		gridView.current.ox = w / 2;
		gridView.current.oy = h / 2;
	}, [radius]);

	const drawGrid = useCallback(() => {
		const cv = gridCanvasRef.current;
		if (!cv) return;
		const { ctx } = ctx2d(cv);
		const { scale, ox, oy } = gridView.current;
		const R = radius, L = radius * 3;
		for (let j = 0; j < n; j++) {
			const ev = e[j];
			const perp = { x: -ev.y, y: ev.x };
			const kLo = Math.ceil(offsets[j] - R), kHi = Math.floor(offsets[j] + R);
			ctx.beginPath();
			for (let k = kLo; k <= kHi; k++) {
				const d = k - offsets[j];
				const fx = d * ev.x, fy = d * ev.y;
				ctx.moveTo(ox + scale * (fx - L * perp.x), oy - scale * (fy - L * perp.y));
				ctx.lineTo(ox + scale * (fx + L * perp.x), oy - scale * (fy + L * perp.y));
			}
			ctx.strokeStyle = `hsl(${famHue(j, n)} 55% 55%)`;
			ctx.lineWidth = 0.8;
			ctx.stroke();
		}
		drawGridOverlay();
	}, [offsets, n, e, radius, drawGridOverlay]);

	// --- picking (the duality link) --------------------------------------------------------------
	const pickTiling = useCallback(
		(mx: number, my: number) => {
			const { scale, ox, oy } = view.current;
			const wx = (mx - ox) / scale, wy = (oy - my) / scale;
			for (let t = 0; t < tiles.length; t++) if (pointInQuad(wx, wy, tiles[t].corners)) return setActive(t);
			setActive(-1);
		},
		[tiles, setActive],
	);
	const pickGrid = useCallback(
		(mx: number, my: number) => {
			const { scale, ox, oy } = gridView.current;
			const wx = (mx - ox) / scale, wy = (oy - my) / scale;
			let best = -1, bd = Infinity;
			for (let t = 0; t < tiles.length; t++) {
				const s = tiles[t].site;
				const dx = s.x - wx, dy = s.y - wy, d = dx * dx + dy * dy;
				if (d < bd) { bd = d; best = t; }
			}
			const tol = 12 / scale;
			setActive(bd < tol * tol ? best : -1);
		},
		[tiles, setActive],
	);

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

	// (re)upload + refit + redraw both panels when the tiling changes
	useEffect(() => {
		activeRef.current = -1;
		if (modeRef.current === "gl" && glRef.current && uploadedRef.current !== tiles) {
			glRef.current.uploadTiles(tiles, HUE);
			uploadedRef.current = tiles;
		}
		view.current.fitted = false;
		fit();
		draw();
		gridFit();
		drawGrid();
	}, [tiles, fit, draw, gridFit, drawGrid]);

	// relayout (split toggled) → both panels resized; refit and redraw after the DOM settles
	useEffect(() => {
		const id = requestAnimationFrame(() => {
			fit();
			draw();
			gridFit();
			drawGrid();
		});
		return () => cancelAnimationFrame(id);
	}, [split, fit, draw, gridFit, drawGrid]);

	useEffect(() => {
		const onResize = () => {
			fit();
			draw();
			gridFit();
			drawGrid();
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [fit, draw, gridFit, drawGrid]);

	// --- pointer handlers ------------------------------------------------------------------------
	const rel = (e: React.MouseEvent | React.WheelEvent) => {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		return { mx: e.clientX - r.left, my: e.clientY - r.top };
	};
	const onWheel = (ev: React.WheelEvent) => {
		ev.preventDefault();
		const { mx, my } = rel(ev);
		const f = Math.exp(-ev.deltaY * 0.0016);
		const v = view.current;
		v.ox = mx - f * (mx - v.ox);
		v.oy = my - f * (my - v.oy);
		v.scale *= f;
		draw();
	};
	const onDown = (ev: React.MouseEvent) => (drag.current = { x: ev.clientX - view.current.ox, y: ev.clientY - view.current.oy });
	const onMove = (ev: React.MouseEvent) => {
		if (drag.current) {
			view.current.ox = ev.clientX - drag.current.x;
			view.current.oy = ev.clientY - drag.current.y;
			draw();
		} else if (split) {
			const { mx, my } = rel(ev);
			pickTiling(mx, my);
		}
	};
	const onUp = () => (drag.current = null);
	const onLeave = () => {
		drag.current = null;
		setActive(-1);
	};

	const onGridWheel = (ev: React.WheelEvent) => {
		ev.preventDefault();
		const { mx, my } = rel(ev);
		const f = Math.exp(-ev.deltaY * 0.0016);
		const v = gridView.current;
		v.ox = mx - f * (mx - v.ox);
		v.oy = my - f * (my - v.oy);
		v.scale *= f;
		drawGrid();
	};
	const onGridDown = (ev: React.MouseEvent) =>
		(gridDrag.current = { x: ev.clientX - gridView.current.ox, y: ev.clientY - gridView.current.oy });
	const onGridMove = (ev: React.MouseEvent) => {
		if (gridDrag.current) {
			gridView.current.ox = ev.clientX - gridDrag.current.x;
			gridView.current.oy = ev.clientY - gridDrag.current.y;
			drawGrid();
		} else {
			const { mx, my } = rel(ev);
			pickGrid(mx, my);
		}
	};
	const onGridUp = () => (gridDrag.current = null);
	const onGridLeave = () => {
		gridDrag.current = null;
		setActive(-1);
	};

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
			<aside className="w-72 shrink-0 border-r border-line-subtle bg-surface-raised overflow-y-auto p-4 flex flex-col gap-5 text-sm">
				<div>
					<h1 className="text-base font-semibold text-fg">Multigrid</h1>
					<p className="text-xs text-fg-muted mt-1 leading-relaxed">
						Quasiperiodic rhombic tilings by de Bruijn&rsquo;s multigrid method — the projection
						counterpart to Sub Rosa&rsquo;s substitution. n line families dualize to a {2 * n}-fold
						rhombic tiling; drag the offsets to flip it (phasons).
					</p>
				</div>

				<Section label="Symmetry">
					<Segmented
						wrap
						options={MULTIGRID_SYMMETRIES.map((s) => ({ v: String(s), label: `${2 * s}-fold` }))}
						value={String(n)}
						onChange={(v) => changeN(Number(v))}
					/>
					<p className="text-[11px] text-fg-subtle mt-1">
						n = {n} · {protoCount} rhomb{protoCount > 1 ? "s" : ""}
						{n === 5 ? " (Penrose)" : n === 4 ? " (Ammann–Beenker)" : ""}.
					</p>
				</Section>

				<Section label="Offsets γⱼ (drag to flip)">
					<div className="flex flex-col gap-1.5">
						{offsets.map((g, j) => (
							<div key={j} className="flex items-center gap-2">
								<span
									className="text-[11px] font-mono w-8 tabular-nums"
									style={{ color: `hsl(${famHue(j, n)} 55% 50%)` }}
								>
									γ{sub(j)}
								</span>
								<input
									type="range"
									min={0}
									max={1}
									step={0.001}
									value={g}
									onChange={(ev) => setOffset(j, Number(ev.target.value))}
									className="flex-1 accent-[var(--accent)]"
								/>
								<span className="text-[11px] font-mono text-fg-subtle w-9 tabular-nums text-right">{g.toFixed(2)}</span>
							</div>
						))}
					</div>
					<div className="flex gap-1.5 mt-2">
						<PresetBtn onClick={() => preset("canonical")}>Reset</PresetBtn>
						<PresetBtn onClick={() => preset("symmetric")}>Symmetric</PresetBtn>
						<PresetBtn onClick={() => preset("random")}>Randomize</PresetBtn>
					</div>
				</Section>

				<Section label="Display">
					<label className="flex items-center gap-2 text-xs text-fg-muted">
						<input type="checkbox" checked={split} onChange={(ev) => setSplit(ev.target.checked)} />
						Split view (grid + tiling)
					</label>
					<label className="flex items-center gap-2 text-xs text-fg-muted mt-1.5">
						<input type="checkbox" checked={showStroke} onChange={(ev) => setShowStroke(ev.target.checked)} />
						Tile outlines (when zoomed in)
					</label>
					<button
						className="mt-2 px-2 py-1 rounded-control border border-line-subtle text-xs text-fg-muted hover:text-fg hover:bg-surface-overlay"
						onClick={() => {
							view.current.fitted = false;
							fit();
							draw();
							gridFit();
							drawGrid();
						}}
					>
						Reset view
					</button>
					<div className="text-[11px] text-fg-subtle mt-2">
						{tiles.length.toLocaleString()} rhombi{capped ? " (capped)" : ""}
					</div>
				</Section>

				<Section label="How it works">
					<p className="text-[11px] text-fg-subtle leading-snug">
						Each crossing of a family-i and family-j line becomes a rhombus with edges at πi/n and
						πj/n. Corners are exact integer combinations of the n directions, so shared vertices never
						drift. In split view, <span className="text-fg">hover</span> either panel: a rhombus lights
						up its two source lines and their crossing, and back. Sliding an offset sweeps a whole grid
						family — a phason flip.
					</p>
				</Section>
			</aside>

			<div className="flex-1 min-h-0 flex flex-col md:flex-row">
				{split && (
					<div className="relative flex-1 min-h-0 border-b md:border-b-0 md:border-r border-line-subtle">
						<canvas
							ref={gridCanvasRef}
							className="w-full h-full block cursor-grab active:cursor-grabbing"
							onWheel={onGridWheel}
							onMouseDown={onGridDown}
							onMouseMove={onGridMove}
							onMouseUp={onGridUp}
							onMouseLeave={onGridLeave}
						/>
						<canvas ref={gridOverlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
						<PanelTag>multigrid · z-space</PanelTag>
					</div>
				)}
				<div className="relative flex-1 min-h-0">
					<canvas
						ref={canvasRef}
						className="w-full h-full block cursor-grab active:cursor-grabbing"
						onWheel={onWheel}
						onMouseDown={onDown}
						onMouseMove={onMove}
						onMouseUp={onUp}
						onMouseLeave={onLeave}
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle mb-1.5">{label}</div>
			{children}
		</div>
	);
}

function PresetBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			onClick={onClick}
			className="px-2 py-1 rounded-control border border-line-subtle text-[11px] text-fg-muted hover:text-fg hover:bg-surface-overlay"
		>
			{children}
		</button>
	);
}

function Segmented({
	options,
	value,
	onChange,
	wrap = false,
}: {
	options: { v: string; label: string }[];
	value: string;
	onChange: (v: string) => void;
	wrap?: boolean;
}) {
	if (wrap) {
		return (
			<div className="flex flex-wrap gap-1">
				{options.map((o) => (
					<button
						key={o.v}
						onClick={() => onChange(o.v)}
						className={cn(
							"px-2.5 py-1 text-xs rounded-control border transition-colors",
							value === o.v
								? "bg-accent-subtle text-accent font-medium border-accent/40"
								: "border-line-subtle text-fg-muted hover:bg-surface-overlay",
						)}
					>
						{o.label}
					</button>
				))}
			</div>
		);
	}
	return (
		<div className="inline-flex rounded-control border border-line-subtle overflow-hidden">
			{options.map((o) => (
				<button
					key={o.v}
					onClick={() => onChange(o.v)}
					className={cn(
						"px-2.5 py-1 text-xs transition-colors",
						value === o.v ? "bg-accent-subtle text-accent font-medium" : "text-fg-muted hover:bg-surface-overlay",
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}
