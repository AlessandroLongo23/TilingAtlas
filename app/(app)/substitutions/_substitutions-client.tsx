"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Vector } from "@/classes/Vector";
import {
	buildRule,
	seedStar,
	seedSingle,
	substituteOnce,
	SUPPORTED_SYMMETRIES,
	type SubRosaRule,
	type RenderTile,
} from "@/lib/subrosa/engine";
import { prototileAngles } from "@/lib/subrosa/sigma";
import { SubRosaGL } from "@/lib/render/subrosaGL";
import { cn } from "@/lib/utils/cn";

// Tile budget for one patch. The whole patch is a single GPU draw (lib/render/subrosaGL.ts), so this
// is sized against GPU memory, not per-tile CPU draw cost: ~90 B/tile of vertex data ⇒ ~135 MB of
// buffers at the cap. The substitution self-composes to any depth (point-symmetric super-rhomb
// boundary ⇒ adjacent super-rhombs interlock; verified gap/overlap-free); depth is bounded only here.
const MAX_TILES = 1_500_000;
// Never offer a slider depth past this even if it would fit — keeps the CPU build (substituteOnce
// allocates one object per tile) from freezing the tab for seconds. The exact per-config max depth is
// derived from the substitution matrix below and is usually the real limit well before this.
const DEPTH_CEILING = 6;

// Prototile hues by index (protoId 1..⌊n/2⌋). Distinct, legible in light and dark.
const HUES = [265, 175, 45, 330, 130, 200, 90];
const HUE = (protoId: number) => HUES[(protoId - 1) % HUES.length];

type Seed = "single" | "star";

function seedTiles(rule: SubRosaRule, seed: Seed, protoX: number): RenderTile[] {
	return seed === "star" ? seedStar(rule) : seedSingle(rule, protoX);
}

function build(rule: SubRosaRule, seed: Seed, protoX: number, depth: number): RenderTile[] {
	let tiles = seedTiles(rule, seed, protoX);
	for (let i = 0; i < depth; i++) {
		const next = substituteOnce(rule, tiles);
		if (next.length > MAX_TILES) break; // defensive; renderableDepth() should keep us under budget
		tiles = next;
	}
	return tiles;
}

// Exact tile count at each substitution depth, from the substitution matrix M[target][source] =
// (# children of prototile `source` whose protoId is `target`). The count vector evolves v → M·v; the
// seed's prototile histogram is v₀. K ≤ ⌊n/2⌋, so this is trivially cheap — cheap enough to size the
// depth slider to what actually fits the budget rather than let the user pick a depth that silently
// falls back to a shallower one.
function depthTileCounts(rule: SubRosaRule, seed: Seed, protoX: number, ceiling: number): number[] {
	const K = rule.prototiles.length;
	const idxOf = new Map<number, number>();
	rule.prototiles.forEach((p, i) => idxOf.set(p.x, i));
	const M: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
	rule.prototiles.forEach((p, src) => {
		for (const c of p.children) M[idxOf.get(c.protoId)!][src]++;
	});
	let v = new Array<number>(K).fill(0);
	if (seed === "star") v[idxOf.get(1) ?? 0] = 2 * rule.n; // star seed = 2n copies of the thin rhomb
	else v[idxOf.get(protoX) ?? 0] = 1;
	const counts = [v.reduce((a, b) => a + b, 0)];
	for (let d = 1; d <= ceiling; d++) {
		const nv = new Array<number>(K).fill(0);
		for (let t = 0; t < K; t++) {
			let s = 0;
			for (let src = 0; src < K; src++) s += M[t][src] * v[src];
			nv[t] = s;
		}
		v = nv;
		counts.push(v.reduce((a, b) => a + b, 0));
	}
	return counts;
}

// Deepest substitution whose tile count still fits `budget` (counts rise monotonically, so stop early).
function renderableDepth(counts: number[], budget: number): number {
	let md = 0;
	for (let d = 0; d < counts.length; d++) {
		if (counts[d] <= budget) md = d;
		else break;
	}
	return md;
}

function bounds(tiles: RenderTile[]) {
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

export function SubstitutionsClient() {
	const [N, setN] = useState(5);
	const rule = useMemo(() => buildRule(N), [N]);
	const [seed, setSeed] = useState<Seed>("single");
	const [protoX, setProtoX] = useState(2);
	const [depth, setDepth] = useState(1);
	const [showStroke, setShowStroke] = useState(true);

	const effProtoX = Math.min(protoX, Math.floor(N / 2)); // clamp when switching to a smaller n
	// The slider's real ceiling: the deepest substitution that fits the tile budget for THIS config.
	const maxDepth = useMemo(
		() => (rule ? renderableDepth(depthTileCounts(rule, seed, effProtoX, DEPTH_CEILING), MAX_TILES) : 0),
		[rule, seed, effProtoX],
	);
	const effDepth = Math.min(depth, maxDepth);

	const tiles = useMemo(
		() => (rule ? build(rule, seed, effProtoX, effDepth) : []),
		[rule, seed, effProtoX, effDepth],
	);

	// view transform
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const view = useRef({ scale: 1, ox: 0, oy: 0, fitted: false });
	const drag = useRef<{ x: number; y: number } | null>(null);
	// GPU renderer: WebGL2 batched draw (one drawArrays for the whole patch). Falls back to the 2D
	// loop if a WebGL2 context can't be created. `mode` is fixed at first mount — a canvas can hold
	// only one context type. `uploaded` tracks which tile array is on the GPU so a redraw (theme,
	// stroke toggle, pan) doesn't needlessly re-triangulate.
	const glRef = useRef<SubRosaGL | null>(null);
	const modeRef = useRef<"init" | "gl" | "2d">("init");
	const uploadedRef = useRef<RenderTile[] | null>(null);

	const fit = useCallback(() => {
		const cv = canvasRef.current;
		if (!cv || tiles.length === 0) return;
		const b = bounds(tiles);
		const w = cv.clientWidth, h = cv.clientHeight;
		const bw = b.maxx - b.minx || 1, bh = b.maxy - b.miny || 1;
		const s = 0.86 * Math.min(w / bw, h / bh);
		view.current.scale = s;
		view.current.ox = w / 2 - s * (b.minx + b.maxx) / 2;
		view.current.oy = h / 2 + s * (b.miny + b.maxy) / 2; // y flipped
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
			(document.documentElement.getAttribute("data-theme") === "dark");
		const light = dark ? 62 : 66;
		const strokeOn = showStroke && vScale > 2.2;
		const strokeRGBA: [number, number, number, number] = dark
			? [0, 0, 0, 0.55]
			: [30 / 255, 20 / 255, 40 / 255, 0.5];

		// GPU path: one batched draw. Pan/zoom just changed view.current, so this is a uniform update.
		if (modeRef.current === "gl" && glRef.current) {
			glRef.current.draw(
				{
					widthCss: w,
					heightCss: h,
					scale: vScale,
					ox: vOx,
					oy: vOy,
					light,
					strokePx: strokeOn ? 1.1 : 0,
					strokeRGBA,
				},
				dpr,
			);
			return;
		}

		// 2D fallback (canvas has no WebGL2): the original per-tile loop.
		const ctx = cv.getContext("2d")!;
		ctx.save();
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, w, h);
		const tx = (p: Vector) => [vOx + vScale * p.x, vOy - vScale * p.y] as const;
		const strokeW = Math.max(0.3, Math.min(1.1, vScale * 0.03));
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
				ctx.lineWidth = strokeW;
				ctx.strokeStyle = dark ? "rgba(0,0,0,0.55)" : "rgba(30,20,40,0.5)";
				ctx.stroke();
			}
		}
		ctx.restore();
	}, [tiles, showStroke]);

	// Create the WebGL2 renderer once. A canvas can hold only one context type, so this decides the
	// render path for the component's life. Declared BEFORE the upload effect so the renderer exists
	// when the first upload runs (effects fire in declaration order, incl. Strict-Mode's re-run).
	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const gl = cv.getContext("webgl2", { antialias: true, premultipliedAlpha: false, alpha: true });
		if (gl) {
			try {
				glRef.current = new SubRosaGL(gl);
				modeRef.current = "gl";
			} catch {
				modeRef.current = "2d";
			}
		} else {
			modeRef.current = "2d";
		}
		uploadedRef.current = null; // a fresh renderer holds no geometry — force the next upload
		return () => {
			glRef.current?.dispose();
			glRef.current = null;
			uploadedRef.current = null;
		};
	}, []);

	// refit when the tile set changes; (re)upload to the GPU, then redraw on view/resize
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
		// Edge-consistency check on the rendered patch: round every tile edge to a grid and confirm
		// no edge is shared by >2 tiles (overlap) and interior coverage is clean. A gap/overlap from a
		// wrong child orientation shows up as edges used 1× deep inside the patch or 3+× at a seam.
		const edgeCheck = () => {
			const q = 1e5;
			const key = (v: Vector) => `${Math.round(v.x * q)},${Math.round(v.y * q)}`;
			const use = new Map<string, number>();
			for (const t of tiles)
				for (let i = 0; i < t.corners.length; i++) {
					const a = key(t.corners[i]);
					const b = key(t.corners[(i + 1) % t.corners.length]);
					const e = a < b ? `${a}|${b}` : `${b}|${a}`;
					use.set(e, (use.get(e) ?? 0) + 1);
				}
			let over = 0;
			const single: [string, string][] = [];
			for (const [e, c] of use) {
				if (c > 2) over++;
				if (c === 1) single.push(e.split("|") as [string, string]);
			}
			// Count loops among once-used (boundary) edges: a gap-free simply-connected patch has
			// exactly ONE boundary loop; each interior hole (gap) adds another. Union-find on endpoints.
			const parent = new Map<string, string>();
			const find = (x: string): string => {
				let r = x;
				while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
				parent.set(x, r);
				return r;
			};
			for (const [a, b] of single) {
				if (!parent.has(a)) parent.set(a, a);
				if (!parent.has(b)) parent.set(b, b);
				parent.set(find(a), find(b));
			}
			const roots = new Set<string>();
			for (const k of parent.keys()) roots.add(find(k));
			return {
				tiles: tiles.length,
				edgesOverused: over,
				boundaryEdges: single.length,
				boundaryLoops: roots.size,
			};
		};
		(window as unknown as { __subrosa?: unknown }).__subrosa = {
			setN,
			setDepth,
			setSeed,
			setProtoX,
			setShowStroke,
			tileCount: () => tiles.length,
			edgeCheck,
		};
	}, [tiles]);

	if (!rule) {
		return <div className="p-8 text-fg-muted">Sub Rosa engine failed to build for n={N}.</div>;
	}

	const angles = prototileAngles(N);
	const areaFactor = rule.scaling * rule.scaling;

	return (
		<div className="flex-1 min-h-0 flex">
			{/* control + info sidebar */}
			<aside className="w-72 shrink-0 border-r border-line-subtle bg-surface-raised overflow-y-auto p-4 flex flex-col gap-5 text-sm">
				<div>
					<h1 className="text-base font-semibold text-fg">Sub Rosa</h1>
					<p className="text-xs text-fg-muted mt-1 leading-relaxed">
						Aperiodic rhombic substitution tilings with {2 * N}-fold symmetry (Kari &amp; Rissanen
						2016). Vertices exact in ℤ[ζ₄ₙ]; the dissection is derived from the edge word Σ(n), not
						traced from a figure.
					</p>
				</div>

				<Section label="Symmetry">
					<Segmented
						options={SUPPORTED_SYMMETRIES.map((s) => ({ v: String(s), label: `${2 * s}-fold` }))}
						value={String(N)}
						onChange={(v) => {
							const nn = Number(v);
							setN(nn);
							setProtoX((p) => Math.min(p, Math.floor(nn / 2)));
						}}
					/>
					<p className="text-[11px] text-fg-subtle mt-1">
						n = {N} · {angles.length} rhomb{angles.length > 1 ? "s" : ""}
						{N === 5 ? " (Penrose)" : ""}. Interior via the de Bruijn matched-line fill.
					</p>
				</Section>

				<Section label="Seed">
					<Segmented
						options={[
							{ v: "single", label: "Single tile" },
							{ v: "star", label: `Star (${2 * N}-fold)` },
						]}
						value={seed}
						onChange={(v) => setSeed(v as Seed)}
					/>
					{seed === "single" && (
						<div className="mt-2">
							<Segmented
								options={angles.map((a) => ({
									v: String(a.x),
									label: `${Math.round(a.acuteDeg)}°/${Math.round(a.obtuseDeg)}°`,
								}))}
								value={String(effProtoX)}
								onChange={(v) => setProtoX(Number(v))}
							/>
						</div>
					)}
				</Section>

				<Section label={`Iteration — depth ${effDepth} / ${maxDepth}`}>
					<input
						type="range"
						min={0}
						max={maxDepth}
						value={effDepth}
						onChange={(e) => setDepth(Number(e.target.value))}
						className="w-full accent-[var(--accent)]"
					/>
					<div className="flex justify-between text-[11px] text-fg-subtle mt-1">
						<span>{tiles.length.toLocaleString()} tiles</span>
						{effDepth === maxDepth && maxDepth < DEPTH_CEILING && (
							<span className="text-fg-subtle">budget limit</span>
						)}
					</div>
					<p className="text-[11px] text-fg-subtle mt-1 leading-snug">
						Each level is exact and gap/overlap-free — the point-symmetric super-rhomb boundary
						makes adjacent tiles interlock, so the rule self-composes to any depth.
					</p>
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
				</Section>

				<Section label="How it works">
					<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
						<dt className="text-fg-subtle">Inflation S(n)</dt>
						<dd className="text-fg font-mono">{rule.scaling.toFixed(4)}</dd>
						<dt className="text-fg-subtle">Area factor</dt>
						<dd className="text-fg font-mono">{areaFactor.toFixed(2)}×</dd>
						<dt className="text-fg-subtle">Prototiles</dt>
						<dd className="text-fg">{rule.prototiles.length} rhombs</dd>
						<dt className="text-fg-subtle">Edge word Σ</dt>
						<dd className="text-fg font-mono text-[11px]">{rule.sigma.join(" ")}</dd>
					</dl>
					<div className="mt-3 space-y-3">
						{rule.prototiles.map((p) => (
							<RuleDiagram key={p.x} rule={rule} x={p.x} />
						))}
					</div>
				</Section>
			</aside>

			{/* canvas */}
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle mb-1.5">{label}</div>
			{children}
		</div>
	);
}

function Segmented({
	options,
	value,
	onChange,
}: {
	options: { v: string; label: string }[];
	value: string;
	onChange: (v: string) => void;
}) {
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

// Small SVG of one prototile's dissection (unit rhomb → its children), the "see how it works" cue.
function RuleDiagram({ rule, x }: { rule: SubRosaRule; x: number }) {
	const proto = rule.prototiles.find((p) => p.x === x)!;
	let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
	for (const c of proto.children)
		for (const v of c.corners) {
			minx = Math.min(minx, v.x); maxx = Math.max(maxx, v.x);
			miny = Math.min(miny, v.y); maxy = Math.max(maxy, v.y);
		}
	const W = 232, H = 90, pad = 6;
	const bw = maxx - minx || 1, bh = maxy - miny || 1;
	const s = Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh);
	const tx = (v: Vector) => [pad + s * (v.x - minx), H - pad - s * (v.y - miny)] as const;
	return (
		<div>
			<div className="text-[11px] text-fg-subtle mb-1">
				{Math.round((proto.x * 180) / rule.n)}°/{Math.round(((rule.n - proto.x) * 180) / rule.n)}° →{" "}
				{proto.children.length} tiles
			</div>
			<svg width={W} height={H} className="rounded border border-line-subtle bg-surface-overlay">
				{proto.children.map((c, i) => {
					const pts = c.corners.map((v) => tx(v).join(",")).join(" ");
					return <polygon key={i} points={pts} fill={`hsl(${HUE(c.protoId)} 55% 62%)`} stroke="rgba(0,0,0,0.35)" strokeWidth={0.4} />;
				})}
			</svg>
		</div>
	);
}
