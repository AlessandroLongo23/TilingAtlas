"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Vector } from "@/classes/Vector";
import {
	buildMultigrid,
	canonicalOffsets,
	symmetricOffsets,
	randomOffsets,
	MULTIGRID_SYMMETRIES,
	type MgTile,
} from "@/lib/multigrid/engine";
// The batched WebGL2 rhombus renderer, shared with the Sub Rosa shelf (it takes {protoId, corners}).
import { SubRosaGL as RhombRenderer } from "@/lib/render/subrosaGL";
import { cn } from "@/lib/utils/cn";

// Same prototile hues as Sub Rosa, so the two constructors read as one visual system.
const HUES = [265, 175, 45, 330, 130, 200, 90];
const HUE = (protoId: number) => HUES[(protoId - 1) % HUES.length];

const MAX_TILES = 120_000;
const TARGET_TILES = 11_000; // pick the patch radius so every n shows a comparably-sized patch

// Σ_{i<j} sin(π(j−i)/n) = the rhombus density per unit area of the multigrid (spacing 1). Used to
// size the enumerated patch: tiles ≈ πR²·sumSin, so R = √(target / (π·sumSin)).
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

export function MultigridClient() {
	const [n, setN] = useState(5);
	const [offsets, setOffsets] = useState<number[]>(() => canonicalOffsets(5));
	const [showStroke, setShowStroke] = useState(true);
	const seedRef = useRef(1);

	const radius = useMemo(() => radiusFor(n), [n]);
	const { tiles, capped } = useMemo(() => buildMultigrid({ n, offsets, radius }, MAX_TILES), [n, offsets, radius]);

	// changing n resets the offsets to the generic default for that n (offset length must equal n)
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

	// view transform + GL wiring (same model as the Sub Rosa shelf)
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const view = useRef({ scale: 1, ox: 0, oy: 0, fitted: false });
	const drag = useRef<{ x: number; y: number } | null>(null);
	const glRef = useRef<RhombRenderer | null>(null);
	const modeRef = useRef<"init" | "gl" | "2d">("init");
	const uploadedRef = useRef<MgTile[] | null>(null);

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
		const dark = document.documentElement.classList.contains("dark") ||
			document.documentElement.getAttribute("data-theme") === "dark";
		const light = dark ? 62 : 66;
		const strokeOn = showStroke && vScale > 2.2;
		const strokeRGBA: [number, number, number, number] = dark ? [0, 0, 0, 0.55] : [30 / 255, 20 / 255, 40 / 255, 0.5];

		if (modeRef.current === "gl" && glRef.current) {
			glRef.current.draw(
				{ widthCss: w, heightCss: h, scale: vScale, ox: vOx, oy: vOy, light, strokePx: strokeOn ? 1.1 : 0, strokeRGBA },
				dpr,
			);
			return;
		}

		// 2D fallback (no WebGL2)
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
	}, [tiles, showStroke]);

	// create the WebGL2 renderer once (see the Sub Rosa client for the Strict-Mode ordering notes)
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

	// (re)upload on tile change, refit, redraw
	useEffect(() => {
		if (modeRef.current === "gl" && glRef.current && uploadedRef.current !== tiles) {
			glRef.current.uploadTiles(tiles, HUE);
			uploadedRef.current = tiles;
		}
		view.current.fitted = false;
		fit();
		draw();
	}, [tiles, fit, draw]);

	useEffect(() => {
		const onResize = () => {
			if (!view.current.fitted) fit();
			draw();
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [fit, draw]);

	// pan / zoom
	const onWheel = (e: React.WheelEvent) => {
		e.preventDefault();
		const cv = canvasRef.current!;
		const rect = cv.getBoundingClientRect();
		const mx = e.clientX - rect.left, my = e.clientY - rect.top;
		const f = Math.exp(-e.deltaY * 0.0016);
		const v = view.current;
		v.ox = mx - f * (mx - v.ox);
		v.oy = my - f * (my - v.oy);
		v.scale *= f;
		draw();
	};
	const onDown = (e: React.MouseEvent) => {
		drag.current = { x: e.clientX - view.current.ox, y: e.clientY - view.current.oy };
	};
	const onMove = (e: React.MouseEvent) => {
		if (!drag.current) return;
		view.current.ox = e.clientX - drag.current.x;
		view.current.oy = e.clientY - drag.current.y;
		draw();
	};
	const onUp = () => (drag.current = null);

	// dev hook for visual checks
	useEffect(() => {
		(window as unknown as { __multigrid?: unknown }).__multigrid = {
			setN: changeN,
			setOffset,
			preset,
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
								<span className="text-[11px] font-mono text-fg-subtle w-8 tabular-nums">γ{sub(j)}</span>
								<input
									type="range"
									min={0}
									max={1}
									step={0.001}
									value={g}
									onChange={(e) => setOffset(j, Number(e.target.value))}
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
						<input type="checkbox" checked={showStroke} onChange={(e) => setShowStroke(e.target.checked)} />
						Tile outlines (when zoomed in)
					</label>
					<button
						className="mt-2 px-2 py-1 rounded-control border border-line-subtle text-xs text-fg-muted hover:text-fg hover:bg-surface-overlay"
						onClick={() => {
							view.current.fitted = false;
							fit();
							draw();
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
						drift. Sliding an offset sweeps a whole grid family; when a line crosses a triple point the
						local tiles reconfigure — a phason flip.
					</p>
				</Section>
			</aside>

			<div className="flex-1 min-h-0 relative">
				<canvas
					ref={canvasRef}
					className="w-full h-full block cursor-grab active:cursor-grabbing"
					onWheel={onWheel}
					onMouseDown={onDown}
					onMouseMove={onMove}
					onMouseUp={onUp}
					onMouseLeave={onUp}
				/>
			</div>
		</div>
	);
}

// Subscript digits for the offset labels (γ₀, γ₁, …).
const SUBS = "₀₁₂₃₄₅₆₇₈₉";
const sub = (j: number) => String(j).split("").map((d) => SUBS[Number(d)]).join("");

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
