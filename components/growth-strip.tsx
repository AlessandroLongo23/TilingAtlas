"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import { cn } from "@/lib/utils/cn";
import { orbitColor } from "@/lib/utils/orbitColors";
import { drawPolygons, hsbToHsla, type RawPolygon } from "@/lib/utils/renderTiling";

// The expansion, run by hand in front of the room: a k=3 seed, then the two stamps that grow it.
//
// Everything drawn here is precomputed SeedExpander output (scripts/build-growth-figure.ts) — the
// open vertices it sees, the one it takes next, and every rigid placement of the seed that survives
// its orbit, alignment and collision gates there. Nothing is illustrated. What the widget adds is the
// pause: the candidate is shown faint until it is confirmed, so the room sees a choice being made
// and not a result appearing.
//
// The target vertex is not the viewer's to choose. The expander always takes the open vertex of least
// graph distance to the core (`sorted[0]` in its DFS), and letting a click move it would show a
// freedom the search does not have.
//
// Keys are `,` `.` and Enter, deliberately NOT the arrows: the deck moves slides on the arrows, and a
// presentation clicker sends exactly those. A widget that captured them would kill the clicker for as
// long as the pointer sat on it.

interface FigPoly {
	n: number;
	v: [number, number][];
}

interface FigCandidate {
	/** Only the tiles this stamp ADDS — the rest of the copy lands on tiles already there. */
	add: FigPoly[];
	/** Vertices this stamp completes, with the orbit each belongs to. */
	collapsed: { at: [number, number]; orbit: number }[];
}

interface FigState {
	frontier: [number, number][];
	target: [number, number] | null;
	candidates: FigCandidate[];
}

interface GrowthFigure {
	k: number;
	seedName: string;
	vcs: string[];
	cores: { at: [number, number]; orbit: number }[];
	seedPolys: FigPoly[];
	root: FigState;
	/** One entry per root candidate: the state reached by confirming it. */
	level1: FigState[];
}

const toRaw = (polys: FigPoly[]): RawPolygon[] =>
	polys.map((p) => ({ n: p.n, vertices: p.v.map(([x, y]) => ({ x, y })) }));

interface Box { minX: number; maxX: number; minY: number; maxY: number }

const boxOf = (polys: FigPoly[], into?: Box): Box => {
	const b = into ?? { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
	for (const p of polys) for (const [x, y] of p.v) {
		if (x < b.minX) b.minX = x;
		if (x > b.maxX) b.maxX = x;
		if (y < b.minY) b.minY = y;
		if (y > b.maxY) b.maxY = y;
	}
	return b;
};

/**
 * One frame for all three cards, big enough for every patch any path can reach.
 *
 * Fitting each card to its own contents would draw the seed at the same size as the finished patch
 * and the growth — the only thing the row exists to show — would vanish. A frame that never changes
 * also means confirming a stamp moves nothing that was already on screen.
 */
function worldFrame(fig: GrowthFigure): Box {
	const b = boxOf(fig.seedPolys);
	fig.root.candidates.forEach((c, i) => {
		boxOf(c.add, b);
		for (const c2 of fig.level1[i]?.candidates ?? []) boxOf(c2.add, b);
	});
	return b;
}

const DOT_R = 4.5;      // collapsed vertex, CSS px
const OPEN_R = 3;       // open (frontier) vertex
const TARGET_R = 9;     // ring on the vertex the expander takes next

export function GrowthStrip({ src = "/defense/growth-k3.json" }: { src?: string }) {
	const [fig, setFig] = useState<GrowthFigure | null>(null);
	const [confirmed, setConfirmed] = useState<number[]>([]);
	const [cursor, setCursor] = useState(0);
	const rootRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		let live = true;
		fetch(src)
			.then((r) => r.json())
			.then((d: GrowthFigure) => { if (live) setFig(d); })
			.catch(() => { if (live) setFig(null); });
		return () => { live = false; };
	}, [src]);

	// The state the active card is choosing from: the root, then whichever level-1 state the first
	// stamp led to. Null once both stamps are placed — there is no third iteration.
	const step = confirmed.length;
	const active: FigState | null = !fig ? null : step === 0 ? fig.root : step === 1 ? (fig.level1[confirmed[0]] ?? null) : null;

	// Patches on the current path: [seed, seed+stamp1, seed+stamp1+stamp2], truncated to what is placed.
	const patches = useMemo<FigPoly[][]>(() => {
		if (!fig) return [];
		const out: FigPoly[][] = [fig.seedPolys];
		if (confirmed.length >= 1) out.push([...out[0], ...fig.root.candidates[confirmed[0]].add]);
		if (confirmed.length >= 2) {
			const lvl = fig.level1[confirmed[0]];
			out.push([...out[1], ...lvl.candidates[confirmed[1]].add]);
		}
		return out;
	}, [fig, confirmed]);

	// Collapsed vertices accumulate as stamps are confirmed: the seed's k cores, then whatever each
	// stamp closed. This is the orbit bookkeeping the expander does — every one of them carries the
	// orbit id of the core it was placed from, and a placement that would give a vertex two different
	// orbits is exactly what the search rejects.
	const collapsedAt = useMemo<{ at: [number, number]; orbit: number }[][]>(() => {
		if (!fig) return [];
		const out = [fig.cores];
		if (confirmed.length >= 1) out.push(fig.root.candidates[confirmed[0]].collapsed.length
			? [...fig.cores, ...fig.root.candidates[confirmed[0]].collapsed]
			: fig.cores);
		if (confirmed.length >= 2) {
			const lvl = fig.level1[confirmed[0]];
			out.push([...out[1], ...lvl.candidates[confirmed[1]].collapsed]);
		}
		return out;
	}, [fig, confirmed]);

	const frame = useMemo(() => (fig ? worldFrame(fig) : null), [fig]);
	const candidate = active?.candidates[cursor] ?? null;
	const total = active?.candidates.length ?? 0;

	const cycle = useCallback((d: number) => {
		if (total === 0) return;
		setCursor((c) => (c + d + total) % total);
	}, [total]);

	const confirm = useCallback(() => {
		if (!active || total === 0) return;
		setConfirmed((c) => [...c, cursor]);
		setCursor(0);
	}, [active, total, cursor]);

	const reset = useCallback(() => { setConfirmed([]); setCursor(0); }, []);

	// `,` `.` cycle and Enter confirms while the pointer is over the strip. Every one of them is
	// stopped here so the deck never sees it — and the arrows are never touched, so the clicker keeps
	// working throughout.
	//
	// The listener registers ONCE and reads the current handlers through a ref. Depending on them
	// directly re-runs the effect every time the cursor moves, which dropped every keypress after the
	// first back when the effect also owned the hover flag.
	//
	// No hover gate at all, deliberately. Hover is only known from pointer EVENTS, so coming back to
	// this slide with the pointer already parked on the widget leaves it stale — the keys stay dead
	// until the mouse is jiggled, which is not a thing to discover mid-sentence. The strip is mounted
	// on exactly one slide and `,` `.` Enter are unused by the deck, so listening whenever it exists
	// costs nothing and always works.
	const keysRef = useRef({ cycle, confirm });
	useEffect(() => { keysRef.current = { cycle, confirm }; }, [cycle, confirm]);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (isTypingTarget(e)) return;
			if (e.key === ",") { e.preventDefault(); e.stopPropagation(); keysRef.current.cycle(-1); }
			else if (e.key === ".") { e.preventDefault(); e.stopPropagation(); keysRef.current.cycle(1); }
			else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); keysRef.current.confirm(); }
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, []);

	if (!fig || !frame) {
		return (
			<div className="not-prose flex h-[38vh] items-center justify-center rounded-xl border border-line bg-surface-overlay/30 text-xs text-fg-muted">
				loading the expansion…
			</div>
		);
	}

	return (
		<div ref={rootRef} className="not-prose flex flex-col items-center gap-3">
			<div className="flex w-full items-center justify-center gap-2">
				{[0, 1, 2].map((i) => (
					<div key={i} className="contents">
						{i > 0 && (
							<span aria-hidden className={cn("shrink-0 text-2xl", patches[i] ? "text-fg-muted" : "text-line")}>
								→
							</span>
						)}
						<GrowthCard
							frame={frame}
							k={fig.k}
							patch={patches[i] ?? null}
							overlay={i === step ? candidate?.add ?? null : null}
							collapsed={collapsedAt[i] ?? null}
							frontier={i === step ? active?.frontier ?? null : null}
							target={i === step ? active?.target ?? null : null}
							// `step` still points at the last card once both stamps are placed, but there is
							// nothing to choose there — an accent border would promise a control that is gone.
							activeStep={i === step && active !== null}
							label={i === 0 ? "the seed" : i === 1 ? "one stamp" : "two stamps"}
						/>
					</div>
				))}
			</div>

			<div className="flex items-center gap-2 text-xs">
				{active ? (
					<>
						<button
							type="button"
							onClick={() => cycle(-1)}
							aria-label="previous placement"
							className="rounded-md border border-line px-2 py-1 text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
						>
							‹
						</button>
						<span className="tabular-nums text-fg-secondary">
							placement {cursor + 1} of {total}
						</span>
						<button
							type="button"
							onClick={() => cycle(1)}
							aria-label="next placement"
							className="rounded-md border border-line px-2 py-1 text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
						>
							›
						</button>
						<button
							type="button"
							onClick={confirm}
							className="ml-1 rounded-md border border-accent bg-accent/10 px-3 py-1 font-medium text-accent transition-colors hover:bg-accent/20"
						>
							stamp it
						</button>
					</>
				) : (
					<span className="text-fg-muted">two stamps placed — the expansion runs to graph distance 18 from here</span>
				)}
				<button
					type="button"
					onClick={reset}
					className="ml-3 rounded-md border border-line px-2 py-1 text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
				>
					reset
				</button>
			</div>
			<p className="m-0 text-[11px] text-fg-disabled">
				<kbd>,</kbd> <kbd>.</kbd> cycle · <kbd>Enter</kbd> stamps · the ringed vertex is the one the search takes next
			</p>
		</div>
	);
}

function GrowthCard({
	frame,
	k,
	patch,
	overlay,
	collapsed,
	frontier,
	target,
	activeStep,
	label,
}: {
	frame: Box;
	k: number;
	patch: FigPoly[] | null;
	overlay: FigPoly[] | null;
	collapsed: { at: [number, number]; orbit: number }[] | null;
	frontier: [number, number][] | null;
	target: [number, number] | null;
	activeStep: boolean;
	label: string;
}) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		const host = hostRef.current, canvas = canvasRef.current;
		if (!host || !canvas) return;

		const paint = () => {
			const w = host.clientWidth, h = host.clientHeight;
			if (w <= 0 || h <= 0) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
			if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, bw, bh);
			if (!patch) return;

			// The shared frame, filling the card bar a hair of margin. The frame has to hold the largest
			// patch any path reaches, so the seed already sits at about half the card's width; there is no
			// padding to spare on top of that.
			const fw = frame.maxX - frame.minX, fh = frame.maxY - frame.minY;
			const s = 0.96 * Math.min(w / fw, h / fh);
			const cx = (frame.minX + frame.maxX) / 2, cy = (frame.minY + frame.maxY) / 2;
			ctx.scale(dpr, dpr);
			ctx.translate(w / 2, h / 2);
			ctx.scale(s, -s); // world y is up
			ctx.translate(-cx, -cy);

			drawPolygons(ctx, toRaw(patch), s);
			if (overlay && overlay.length > 0) {
				// A candidate has to read as a proposal from the back of a room, and faintness alone does
				// not do it — a pale tile beside pale tiles is just another tile. So: faint fill, then a
				// dashed accent outline, which nothing else in the figure wears.
				ctx.globalAlpha = 0.35;
				drawPolygons(ctx, toRaw(overlay), s, 0, false);
				ctx.globalAlpha = 1;
				ctx.save();
				ctx.strokeStyle = "#e8590c";
				ctx.lineWidth = 1.6 / s;
				ctx.setLineDash([6 / s, 4 / s]);
				for (const poly of overlay) {
					ctx.beginPath();
					poly.v.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
					ctx.closePath();
					ctx.stroke();
				}
				ctx.restore();
			}

			// Vertex marks, in screen px — they must not grow with the patch.
			const px = 1 / s;
			const dot = (p: [number, number], r: number, fill: string, stroke: string, width: number) => {
				ctx.beginPath();
				ctx.arc(p[0], p[1], r * px, 0, Math.PI * 2);
				if (fill !== "none") { ctx.fillStyle = fill; ctx.fill(); }
				ctx.strokeStyle = stroke;
				ctx.lineWidth = width * px;
				ctx.stroke();
			};
			for (const f of frontier ?? []) dot(f, OPEN_R, "#fff", "rgba(0,0,0,0.45)", 1.2);
			for (const c of collapsed ?? []) {
				const { h: hue, s: sat, b } = orbitColor(c.orbit, k);
				// A white halo under the dot. The orbit colours are the tiles' own saturation and
				// brightness (orbitColor matches Tiling.show), which is right on /play where orbit mode
				// dims the fill — but here the tiles are at full strength and a red dot on a red triangle
				// disappears. The halo is what separates them without inventing a second palette.
				dot(c.at, DOT_R + 1.4, "#fff", "rgba(255,255,255,0)", 0);
				dot(c.at, DOT_R, hsbToHsla(hue, sat, b, 1), "rgba(0,0,0,0.9)", 1.4);
			}
			if (target) dot(target, TARGET_R, "none", "#e8590c", 2);
		};

		paint();
		const ro = new ResizeObserver(paint);
		ro.observe(host);
		return () => ro.disconnect();
	}, [frame, k, patch, overlay, collapsed, frontier, target]);

	return (
		<figure className="m-0 flex min-w-0 flex-1 flex-col items-center gap-1">
			<div
				ref={hostRef}
				className={cn(
					"relative aspect-square w-full rounded-2xl border bg-surface-base",
					!patch && "border-dashed",
					activeStep ? "border-accent" : patch ? "border-line" : "border-line/60",
				)}
			>
				<canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
			</div>
			<figcaption className={cn("text-[clamp(0.65rem,0.9vh+0.3vw,0.95rem)]", patch ? "text-fg-muted" : "text-fg-disabled")}>
				{label}
			</figcaption>
		</figure>
	);
}
