"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { prepare, screenMapper } from "@/lib/render/figureCanvas";
import { colourOf, drawZetaWheel } from "@/lib/render/zetaWheel";
import { hsbToHsla, polygonHue } from "@/lib/utils/renderTiling";

// The bounded-weight theorem as one case you can read off the plane.
//
// The alphabet: the 24 ζ₂₄ unit directions, numbered, one colour each. Then one word in it — a
// tiling's two period vectors drawn as the actual chains of unit steps that sum to them, and the cell
// those two vectors fix. Splitting them is what lets each be read: the wheel sits exactly where both
// chains begin, so drawn together it lands on top of the thing it is there to explain.
//
// `panel="example"` is itself two panels, because the slide it sits on claims two steps and a single
// drawing only showed the first. Left is the lattice with no tiling in it at all: two arrows, each
// spelled out as its chain of ζ steps. Right is the same frame with the tiling in it and no arrows,
// coloured inside the cell and grey outside — the fill the first step made finite. Same bounding box
// for both, so the parallelogram lands in the same place and the pair reads as one scene twice, not
// as two drawings.
//
// The chains are searched breadth-first in exact ℤ[ζ₂₄] by scripts/build-period-figure.ts, so each is
// a SHORTEST one and its length is that vector's weight. Everything that is not a ζ step — the tiles,
// the period parallelogram — is held at low opacity, because the claim is about the steps.
//
// `dirs` re-reads the same data in a coarser alphabet. Every exponent in the stored chains is EVEN —
// every regular-polygon tiling except the 4.8.8 lives in ℤ[ζ₁₂] ⊂ ℤ[ζ₂₄], and the odd powers exist for
// the octagon alone — so once the octagon is out of the pool, halving each exponent says the same
// vector in ζ₁₂. The drawing does not move a pixel; only the names and the colours change, which is
// exactly the claim. The rescale is guarded: if any exponent failed to divide, the figure falls back
// to the alphabet the data was built in rather than quietly relabelling a step as one it is not.

interface FigureData {
	id: string;
	directions: number;
	t1: { chain: number[]; weight: number; xy: [number, number] };
	t2: { chain: number[]; weight: number; xy: [number, number] };
	polys: { n: number; v: [number, number][] }[];
}

/**
 * `panel` picks one of the two: "wheel" is the alphabet on its own (the preliminary slide), "example"
 * the spelled-out periods with the sum underneath (the method slide). Omitted, both are drawn.
 */
export function PeriodFigure({ panel, dirs, size }: { panel?: string; dirs?: string | number; size?: string }) {
	const showWheel = panel !== "example";
	const showExample = panel !== "wheel";
	const solo = panel === "wheel" || panel === "example";
	/** `sm` is for a slide that already carries a figure: the wheel is the footnote there, not the subject. */
	const compact = String(size) === "sm";
	/** The example is a PAIR of 4:3 panels, so what fits is set by the two of them side by side. */
	const panelH = solo ? "h-[39vh]" : "h-[26vh]";
	const [data, setData] = useState<FigureData | null>(null);
	const wheelHost = useRef<HTMLDivElement | null>(null);
	const wheelCanvas = useRef<HTMLCanvasElement | null>(null);
	const exHost = useRef<HTMLDivElement | null>(null);
	const exCanvas = useRef<HTMLCanvasElement | null>(null);
	const cellHost = useRef<HTMLDivElement | null>(null);
	const cellCanvas = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		let alive = true;
		fetch("/defense/period-figure.json")
			.then((r) => r.json())
			.then((d: FigureData) => { if (alive) setData(d); })
			.catch(() => {});
		return () => { alive = false; };
	}, []);

	// The alphabet actually drawn, and the two chains written in it.
	const view = useMemo(() => {
		if (!data) return null;
		const N = data.directions;
		const want = Number(dirs);
		const f = want > 0 ? N / want : 1;
		const chains = [...data.t1.chain, ...data.t2.chain];
		if (!(want > 0) || want === N || !Number.isInteger(f) || f < 1 || chains.some((k) => k % f !== 0))
			return { N, t1: data.t1.chain, t2: data.t2.chain };
		return { N: want, t1: data.t1.chain.map((k) => k / f), t2: data.t2.chain.map((k) => k / f) };
	}, [data, dirs]);

	// --- panel one: the alphabet -------------------------------------------------------------------
	useEffect(() => {
		const host = wheelHost.current, canvas = wheelCanvas.current;
		if (!host || !canvas || !view) return;
		const N = view.N;

		const paint = () => {
			// 1.66 and not 1.5: the Re/Im labels sit outside the ring of ζ labels, and the box has to hold
			// them (lib/render/zetaWheel.ts).
			const p = prepare(host, canvas, { minX: -1.66, maxX: 1.66, minY: -1.66, maxY: 1.66 }, 0.96);
			if (!p) return;
			drawZetaWheel(p.ctx, p.s, p.dpr, N, true);
		};

		paint();
		const ro = new ResizeObserver(paint);
		ro.observe(host);
		return () => ro.disconnect();
	}, [view]);

	// --- panels two and three: one word in that alphabet, and what it fixes -------------------------
	useEffect(() => {
		const chainHost = exHost.current, chainCanvas = exCanvas.current;
		const fillHost = cellHost.current, fillCanvas = cellCanvas.current;
		if (!chainHost || !chainCanvas || !fillHost || !fillCanvas || !data || !view) return;

		const N = view.N;
		const unit = (k: number): [number, number] => [Math.cos((2 * Math.PI * k) / N), Math.sin((2 * Math.PI * k) / N)];
		const chainPoints = (chain: number[]) => {
			const pts: [number, number][] = [[0, 0]];
			let x = 0, y = 0;
			for (const k of chain) { const [dx, dy] = unit(k); x += dx; y += dy; pts.push([x, y]); }
			return pts;
		};
		const p1 = chainPoints(view.t1);
		const p2 = chainPoints(view.t2);
		const [t1x, t1y] = data.t1.xy, [t2x, t2y] = data.t2.xy;

		/**
		 * One bounding box for both panels, so the cell sits in the same place in each: the period
		 * parallelogram plus a quarter of itself on every side, which leaves the arrows most of the
		 * frame and still shows that the tiling carries on past the cell.
		 */
		const cx = [0, t1x, t2x, t1x + t2x], cy = [0, t1y, t2y, t1y + t2y];
		const bw = Math.max(...cx) - Math.min(...cx), bh = Math.max(...cy) - Math.min(...cy);
		const M = 0.18;
		const box = {
			minX: Math.min(...cx) - M * bw, maxX: Math.max(...cx) + M * bw,
			minY: Math.min(...cy) - M * bh, maxY: Math.max(...cy) + M * bh,
		};

		// Enough of the tiling to leave no white corner in the frame at any panel shape. `box` sets the
		// scale, but a 4:3 canvas showing a box of some other aspect sees WIDER than the box on one
		// axis, so the tiles are generated over a square around it big enough to cover either case.
		const half = 0.9 * Math.max(box.maxX - box.minX, box.maxY - box.minY);
		const midX = (box.minX + box.maxX) / 2, midY = (box.minY + box.maxY) / 2;
		const covered = { minX: midX - half, maxX: midX + half, minY: midY - half, maxY: midY + half };
		const tiles: { q: [number, number][]; n: number }[] = [];
		for (let i = -10; i <= 10; i++) {
			for (let j = -10; j <= 10; j++) {
				const ox = i * t1x + j * t2x, oy = i * t1y + j * t2y;
				for (const poly of data.polys) {
					const q = poly.v.map(([x, y]) => [x + ox, y + oy] as [number, number]);
					const qx = q.map((v) => v[0]), qy = q.map((v) => v[1]);
					if (Math.min(...qx) > covered.maxX || Math.max(...qx) < covered.minX) continue;
					if (Math.min(...qy) > covered.maxY || Math.max(...qy) < covered.minY) continue;
					tiles.push({ q, n: poly.n });
				}
			}
		}

		const cellPath = (ctx: CanvasRenderingContext2D) => {
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(t1x, t1y);
			ctx.lineTo(t1x + t2x, t1y + t2y);
			ctx.lineTo(t2x, t2y);
			ctx.closePath();
		};
		const tracePoly = (ctx: CanvasRenderingContext2D, q: [number, number][]) => {
			ctx.beginPath();
			ctx.moveTo(q[0][0], q[0][1]);
			for (let i = 1; i < q.length; i++) ctx.lineTo(q[i][0], q[i][1]);
			ctx.closePath();
		};

		/** `chains` draws the two words; `fill` draws the tiling. Never both: that was the old figure. */
		const paint = (
			host: HTMLDivElement,
			canvas: HTMLCanvasElement,
			mode: "chains" | "fill",
		) => {
			const p = prepare(host, canvas, box, 0.94);
			if (!p) return;
			const { ctx, s } = p;

			if (mode === "fill") {
				// Grey everywhere first, then the same tiles again in their own colours, clipped to the
				// cell. Clipped and not picked by centroid: the tiles whose centroids reduce into the cell
				// are a fundamental SET of the same area and a different shape, so colouring those would
				// paint a blob that does not line up with the parallelogram the reader is being shown.
				// Cutting at the boundary is also the truth about the torus: a tile can straddle the seam.
				ctx.lineWidth = 1 / s;
				ctx.strokeStyle = "rgba(0,0,0,0.16)";
				ctx.fillStyle = "rgba(0,0,0,0.045)";
				for (const t of tiles) {
					tracePoly(ctx, t.q);
					ctx.fill();
					ctx.stroke();
				}
				ctx.save();
				cellPath(ctx);
				ctx.clip();
				ctx.lineWidth = 1.3 / s;
				for (const t of tiles) {
					ctx.fillStyle = hsbToHsla(polygonHue(t.n), 40, 100, 0.9);
					ctx.strokeStyle = hsbToHsla(polygonHue(t.n), 55, 62, 1);
					tracePoly(ctx, t.q);
					ctx.fill();
					ctx.stroke();
				}
				ctx.restore();

				// The lattice itself, and not only the one cell: the cell's own two edge directions
				// continued across the frame, with their parallels one period apart. This is the claim
				// the panel is making — the cell tiles the plane by translation — and without the grid a
				// reader has to take the surrounding grey on trust.
				ctx.setLineDash([6 / s, 5 / s]);
				ctx.strokeStyle = "rgba(0,0,0,0.28)";
				ctx.lineWidth = 1.1 / s;
				for (let n = -3; n <= 4; n++) {
					for (const [px, py, dx, dy] of [
						[n * t2x, n * t2y, t1x, t1y],
						[n * t1x, n * t1y, t2x, t2y],
					] as const) {
						ctx.beginPath();
						ctx.moveTo(px - 4 * dx, py - 4 * dy);
						ctx.lineTo(px + 5 * dx, py + 5 * dy);
						ctx.stroke();
					}
				}
				ctx.setLineDash([]);
			}

			// With no tiling behind it the parallelogram is the only shape in the panel, so it gets a
			// tint: an outline alone leaves the frame reading as empty.
			if (mode === "chains") {
				ctx.fillStyle = "rgba(0,0,0,0.035)";
				cellPath(ctx);
				ctx.fill();
			}
			ctx.setLineDash([6 / s, 5 / s]);
			ctx.strokeStyle = "rgba(0,0,0,0.36)";
			ctx.lineWidth = 1.4 / s;
			cellPath(ctx);
			ctx.stroke();
			ctx.setLineDash([]);

			if (mode === "chains") {
				const drawChain = (pts: [number, number][], chain: number[]) => {
					for (let i = 0; i < chain.length; i++) {
						ctx.strokeStyle = colourOf(chain[i], N);
						ctx.lineWidth = 5 / s;
						ctx.lineCap = "round";
						ctx.beginPath();
						ctx.moveTo(pts[i][0], pts[i][1]);
						ctx.lineTo(pts[i + 1][0], pts[i + 1][1]);
						ctx.stroke();
						ctx.fillStyle = "#fff";
						ctx.strokeStyle = colourOf(chain[i], N);
						ctx.lineWidth = 1.8 / s;
						ctx.beginPath();
						ctx.arc(pts[i + 1][0], pts[i + 1][1], 4.4 / s, 0, 2 * Math.PI);
						ctx.fill();
						ctx.stroke();
					}
				};
				drawChain(p1, view.t1);
				drawChain(p2, view.t2);

				for (const [ex, ey] of [[t1x, t1y], [t2x, t2y]] as const) {
					ctx.strokeStyle = "rgba(20,20,20,0.85)";
					ctx.lineWidth = 2 / s;
					ctx.beginPath();
					ctx.moveTo(0, 0);
					ctx.lineTo(ex, ey);
					ctx.stroke();
					const a = Math.atan2(ey, ex), head = 13 / s;
					ctx.fillStyle = "rgba(20,20,20,0.85)";
					ctx.beginPath();
					ctx.moveTo(ex, ey);
					ctx.lineTo(ex - head * Math.cos(a - 0.4), ey - head * Math.sin(a - 0.4));
					ctx.lineTo(ex - head * Math.cos(a + 0.4), ey - head * Math.sin(a + 0.4));
					ctx.closePath();
					ctx.fill();
				}

				// The two arrows named, so the sum lines under the panel have something to point at.
				// Text goes on LAST and in screen space: the world transform flips y, and screenMapper
				// resets the context to draw it.
				const px = Math.max(13, Math.min(28, 0.09 * s * bh));
				const face = (w: number) => `600 ${w}px ui-sans-serif, system-ui, sans-serif`;
				const map = screenMapper(ctx, p.dpr);
				ctx.textBaseline = "middle";
				for (const [ex, ey, ox, oy, sub] of [
					[t1x, t1y, t2x, t2y, "1"],
					[t2x, t2y, t1x, t1y, "2"],
				] as const) {
					// Half way along, pushed off the arrow on the side AWAY from the other period: that is
					// the outside of the parallelogram, and the chain of ζ steps runs along the inside.
					let nx = -ey, ny = ex;
					const len = Math.hypot(nx, ny) || 1;
					if (nx * ox + ny * oy > 0) { nx = -nx; ny = -ny; }
					const off = (px * 1.15) / s / len;
					const [tx, ty] = map(ex / 2 + nx * off, ey / 2 + ny * off);

					ctx.font = face(px);
					const wT = ctx.measureText("T").width;
					ctx.font = face(px * 0.68);
					const wSub = ctx.measureText(sub).width;
					const left = tx - (wT + wSub) / 2;
					// A white outline under it: the label can land on the tint, on a chain, or on nothing.
					ctx.textAlign = "left";
					ctx.lineJoin = "round";
					ctx.strokeStyle = "#fff";
					ctx.lineWidth = 3.5;
					ctx.fillStyle = "rgba(20,20,20,0.9)";
					ctx.font = face(px);
					ctx.strokeText("T", left, ty);
					ctx.fillText("T", left, ty);
					ctx.font = face(px * 0.68);
					ctx.strokeText(sub, left + wT, ty + px * 0.3);
					ctx.fillText(sub, left + wT, ty + px * 0.3);
				}
			}
		};

		const repaint = () => {
			paint(chainHost, chainCanvas, "chains");
			paint(fillHost, fillCanvas, "fill");
		};
		repaint();
		const ro = new ResizeObserver(repaint);
		ro.observe(chainHost);
		ro.observe(fillHost);
		return () => ro.disconnect();
	}, [data, view]);

	/** The sum written out, each term in its direction's colour, so the line and the wheel agree. */
	const sum = (chain: number[], n: number) =>
		chain.map((k, i) => (
			<span key={i}>
				{i > 0 ? " + " : ""}
				<span style={{ color: colourOf(k, n) }}>
					ζ<sup>{k}</sup>
				</span>
			</span>
		));

	return (
		<div className="not-prose flex flex-col items-center gap-2">
			<div className="flex flex-wrap items-start justify-center gap-5">
				{showWheel ? (
					<figure className="m-0 flex flex-col items-center gap-1">
						<div
							ref={wheelHost}
							className={`relative aspect-square ${solo ? (compact ? "h-[27vh]" : "h-[44vh]") : "h-[34vh]"} rounded-2xl border border-line bg-surface-base`}
						>
							<canvas ref={wheelCanvas} className="absolute inset-0 h-full w-full" />
						</div>
						<figcaption className="text-center text-[clamp(0.65rem,0.9vh+0.25vw,0.9rem)] text-fg-muted">
							the alphabet: {view?.N ?? 24} unit steps
						</figcaption>
					</figure>
				) : null}
				{showExample ? (
					<>
						<figure className="m-0 flex flex-col items-center gap-1">
							<div
								ref={exHost}
								className={`relative aspect-[4/3] ${panelH} rounded-2xl border border-line bg-surface-base`}
							>
								<canvas ref={exCanvas} className="absolute inset-0 h-full w-full" />
							</div>
							{/* The words go under the panel that draws them, not under the pair. Neither panel
							    carries a caption: the numbered list above the figure already says which step
							    each one is, and a line of grey text under a drawing is read by nobody. */}
							{data ? (
								// The size is INLINE and not a utility class: the deck styles slide paragraphs with
							// its own responsive rule, and a selector beats a single class, so a `text-[…]`
							// here silently does nothing. `w-0 min-w-full` keeps a long sum from widening the
							// figure past its own panel and wrapping the pair onto two rows.
							<p
								className="m-0 w-0 min-w-full text-center font-mono leading-relaxed text-fg-secondary"
								style={{ fontSize: "clamp(0.6rem, 1.25vh + 0.37vw, 1.15rem)" }}
							>
									T₁ = {sum(view.t1, view.N)}
									<span className="text-fg-muted"> ({data.t1.weight} steps)</span>
									<br />
									T₂ = {sum(view.t2, view.N)}
									<span className="text-fg-muted"> ({data.t2.weight} steps)</span>
								</p>
							) : null}
						</figure>
						<figure className="m-0 flex flex-col items-center gap-1">
							<div
								ref={cellHost}
								className={`relative aspect-[4/3] ${panelH} rounded-2xl border border-line bg-surface-base`}
							>
								<canvas ref={cellCanvas} className="absolute inset-0 h-full w-full" />
							</div>
						</figure>
					</>
				) : null}
			</div>
		</div>
	);
}
