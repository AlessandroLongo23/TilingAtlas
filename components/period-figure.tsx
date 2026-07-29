"use client";

import { useEffect, useRef, useState } from "react";

// The bounded-weight theorem as one case you can read off the plane, in two panels.
//
// Left, the alphabet: the 24 ζ₂₄ unit directions, numbered, one colour each. Right, one word in it —
// a tiling's two period vectors drawn as the actual chains of unit steps that sum to them, over the
// cell they generate. Splitting them is what lets each be read: the wheel sits exactly where both
// chains begin, so drawn together it lands on top of the thing it is there to explain.
//
// The chains are searched breadth-first in exact ℤ[ζ₂₄] by scripts/build-period-figure.ts, so each is
// a SHORTEST one and its length is that vector's weight. Everything that is not a ζ step — the tiles,
// the period parallelogram — is held at low opacity, because the claim is about the steps.
//
// A detail worth having ready: the chains only ever use EVEN exponents. Every regular-polygon tiling
// except the 4.8.8 lives in ℤ[ζ₁₂] ⊂ ℤ[ζ₂₄], and the odd powers exist for the octagon alone.

interface FigureData {
	id: string;
	directions: number;
	t1: { chain: number[]; weight: number; xy: [number, number] };
	t2: { chain: number[]; weight: number; xy: [number, number] };
	polys: { n: number; v: [number, number][] }[];
}

/** Hue per ζ exponent, so a step's colour names its direction and the wheel is its legend. */
const colourOf = (k: number, n: number) => `hsl(${(360 * k) / n} 85% 45%)`;

/**
 * Size a canvas to its host and hand back a context in world coordinates (y up), plus the scale.
 * `fill` is how much of the shorter side the content takes.
 */
function prepare(
	host: HTMLDivElement,
	canvas: HTMLCanvasElement,
	box: { minX: number; maxX: number; minY: number; maxY: number },
	fill: number,
): { ctx: CanvasRenderingContext2D; s: number; dpr: number } | null {
	const w = host.clientWidth, h = host.clientHeight;
	if (w <= 0 || h <= 0) return null;
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
	if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, bw, bh);
	const s = fill * Math.min(w / (box.maxX - box.minX), h / (box.maxY - box.minY));
	ctx.scale(dpr, dpr);
	ctx.translate(w / 2, h / 2);
	ctx.scale(s, -s);
	ctx.translate(-(box.minX + box.maxX) / 2, -(box.minY + box.maxY) / 2);
	return { ctx, s, dpr };
}

export function PeriodFigure() {
	const [data, setData] = useState<FigureData | null>(null);
	const wheelHost = useRef<HTMLDivElement | null>(null);
	const wheelCanvas = useRef<HTMLCanvasElement | null>(null);
	const exHost = useRef<HTMLDivElement | null>(null);
	const exCanvas = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		let alive = true;
		fetch("/defense/period-figure.json")
			.then((r) => r.json())
			.then((d: FigureData) => { if (alive) setData(d); })
			.catch(() => {});
		return () => { alive = false; };
	}, []);

	// --- panel one: the alphabet -------------------------------------------------------------------
	useEffect(() => {
		const host = wheelHost.current, canvas = wheelCanvas.current;
		if (!host || !canvas || !data) return;
		const N = data.directions;

		const paint = () => {
			const p = prepare(host, canvas, { minX: -1.5, maxX: 1.5, minY: -1.5, maxY: 1.5 }, 0.96);
			if (!p) return;
			const { ctx, s, dpr } = p;

			// The axes of the complex plane, and the unit circle every arrowhead lands on — which is what
			// says "these are UNIT steps" without a word. The tick at 1 gives the circle its scale; ζ⁰ is
			// that point, so labelling the tick as well would name it twice.
			ctx.strokeStyle = "rgba(0,0,0,0.42)";
			ctx.lineWidth = 1.2 / s;
			for (const [ax, ay] of [[1, 0], [0, 1]] as const) {
				ctx.beginPath();
				ctx.moveTo(-1.15 * ax, -1.15 * ay);
				ctx.lineTo(1.15 * ax, 1.15 * ay);
				ctx.stroke();
				// ticks at ±1, across the axis
				for (const sgn of [-1, 1]) {
					ctx.beginPath();
					ctx.moveTo(sgn * ax - 0.045 * ay, sgn * ay - 0.045 * ax);
					ctx.lineTo(sgn * ax + 0.045 * ay, sgn * ay + 0.045 * ax);
					ctx.stroke();
				}
			}
			ctx.setLineDash([4 / s, 4 / s]);
			ctx.strokeStyle = "rgba(0,0,0,0.22)";
			ctx.beginPath();
			ctx.arc(0, 0, 1, 0, 2 * Math.PI);
			ctx.stroke();
			ctx.setLineDash([]);

			const labels: { x: number; y: number; k: number }[] = [];
			for (let k = 0; k < N; k++) {
				const a = (2 * Math.PI * k) / N;
				const dx = Math.cos(a), dy = Math.sin(a);
				ctx.strokeStyle = colourOf(k, N);
				ctx.fillStyle = colourOf(k, N);
				ctx.lineWidth = 2.2 / s;
				ctx.lineCap = "butt";
				const head = 0.13;
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.lineTo(dx * (1 - head * 0.75), dy * (1 - head * 0.75));
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(dx, dy);
				ctx.lineTo(dx - head * Math.cos(a - 0.32), dy - head * Math.sin(a - 0.32));
				ctx.lineTo(dx - head * Math.cos(a + 0.32), dy - head * Math.sin(a + 0.32));
				ctx.closePath();
				ctx.fill();
				labels.push({ x: dx * 1.28, y: dy * 1.28, k });
			}

			// Text goes on in SCREEN space: the world transform flips y, and anything drawn through it
			// comes out mirrored. Anchors are mapped through the matrix by hand.
			const m = ctx.getTransform();
			const toScreen = (x: number, y: number): [number, number] =>
				[(m.a * x + m.c * y + m.e) / dpr, (m.b * x + m.d * y + m.f) / dpr];
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.scale(dpr, dpr);
			const size = Math.max(9, Math.min(15, s * 0.115));
			const base = `${size}px ui-sans-serif, system-ui, sans-serif`;
			const sup = `${size * 0.68}px ui-sans-serif, system-ui, sans-serif`;
			ctx.textBaseline = "middle";
			// ζ^k, set by hand rather than with a superscript glyph: the exponent runs to two digits and
			// the Unicode superscripts for 4-9 are missing from enough UI fonts to risk a tofu on stage.
			for (const { x, y, k } of labels) {
				const exp = String(k);
				ctx.font = base;
				const wz = ctx.measureText("ζ").width;
				ctx.font = sup;
				const we = ctx.measureText(exp).width;
				const [sx, sy] = toScreen(x, y);
				const left = sx - (wz + we) / 2;
				ctx.fillStyle = colourOf(k, N);
				ctx.textAlign = "left";
				ctx.font = base;
				ctx.fillText("ζ", left, sy);
				ctx.font = sup;
				ctx.fillText(exp, left + wz, sy - size * 0.3);
			}
			// the tick's value, tucked under the real axis so it does not crowd ζ⁰
			ctx.font = `${size * 0.9}px ui-sans-serif, system-ui, sans-serif`;
			ctx.fillStyle = "rgba(0,0,0,0.62)";
			ctx.textAlign = "center";
			const [ux, uy] = toScreen(1, -0.22);
			ctx.fillText("1", ux, uy);
		};

		paint();
		const ro = new ResizeObserver(paint);
		ro.observe(host);
		return () => ro.disconnect();
	}, [data]);

	// --- panel two: one word in that alphabet ------------------------------------------------------
	useEffect(() => {
		const host = exHost.current, canvas = exCanvas.current;
		if (!host || !canvas || !data) return;

		const N = data.directions;
		const unit = (k: number): [number, number] => [Math.cos((2 * Math.PI * k) / N), Math.sin((2 * Math.PI * k) / N)];
		const chainPoints = (chain: number[]) => {
			const pts: [number, number][] = [[0, 0]];
			let x = 0, y = 0;
			for (const k of chain) { const [dx, dy] = unit(k); x += dx; y += dy; pts.push([x, y]); }
			return pts;
		};
		const p1 = chainPoints(data.t1.chain);
		const p2 = chainPoints(data.t2.chain);
		const [t1x, t1y] = data.t1.xy, [t2x, t2y] = data.t2.xy;

		// The cell repeated over the lattice, kept to a margin around the period parallelogram. The
		// margin is not slop: the reconstructed cell is a connected patch of 12 tiles that is a
		// fundamental SET — same area as the parallelogram, different shape — so reducing each centroid
		// into [0,1)² exactly clumps the patch where the cell happens to sit and leaves a corner of the
		// parallelogram bare. Widening it draws the tiling AROUND the cell, which is what belongs behind
		// the vectors anyway, and a tight margin keeps the chains large enough to read. The sweep range
		// only has to reach the cell: as reconstructed it sits
		// several periods from the origin.
		const tiles: [number, number][][] = [];
		const det = t1x * t2y - t1y * t2x;
		for (let i = -6; i <= 6; i++) {
			for (let j = -6; j <= 6; j++) {
				const ox = i * t1x + j * t2x, oy = i * t1y + j * t2y;
				for (const poly of data.polys) {
					const q = poly.v.map(([x, y]) => [x + ox, y + oy] as [number, number]);
					let mx = 0, my = 0;
					for (const [x, y] of q) { mx += x; my += y; }
					mx /= q.length; my /= q.length;
					const a = (mx * t2y - my * t2x) / det, b = (-mx * t1y + my * t1x) / det;
					if (a > -0.22 && a < 1.22 && b > -0.22 && b < 1.22) tiles.push(q);
				}
			}
		}

		const paint = () => {
			const xs = [0, t1x, t2x, t1x + t2x, ...tiles.flat().map((q) => q[0])];
			const ys = [0, t1y, t2y, t1y + t2y, ...tiles.flat().map((q) => q[1])];
			const p = prepare(
				host, canvas,
				{ minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
				0.94,
			);
			if (!p) return;
			const { ctx, s } = p;

			ctx.lineWidth = 1 / s;
			ctx.strokeStyle = "rgba(0,0,0,0.16)";
			ctx.fillStyle = "rgba(0,0,0,0.045)";
			for (const poly of tiles) {
				ctx.beginPath();
				ctx.moveTo(poly[0][0], poly[0][1]);
				for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
			}
			ctx.setLineDash([6 / s, 5 / s]);
			ctx.strokeStyle = "rgba(0,0,0,0.3)";
			ctx.lineWidth = 1.4 / s;
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(t1x, t1y);
			ctx.lineTo(t1x + t2x, t1y + t2y);
			ctx.lineTo(t2x, t2y);
			ctx.closePath();
			ctx.stroke();
			ctx.setLineDash([]);

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
			drawChain(p1, data.t1.chain);
			drawChain(p2, data.t2.chain);

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
		};

		paint();
		const ro = new ResizeObserver(paint);
		ro.observe(host);
		return () => ro.disconnect();
	}, [data]);

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
				<figure className="m-0 flex flex-col items-center gap-1">
					<div ref={wheelHost} className="relative aspect-square h-[34vh] rounded-2xl border border-line bg-surface-base">
						<canvas ref={wheelCanvas} className="absolute inset-0 h-full w-full" />
					</div>
					<figcaption className="text-center text-[clamp(0.65rem,0.9vh+0.25vw,0.9rem)] text-fg-muted">
						the alphabet: 24 unit steps
					</figcaption>
				</figure>
				<figure className="m-0 flex flex-col items-center gap-1">
					<div ref={exHost} className="relative aspect-[4/3] h-[34vh] rounded-2xl border border-line bg-surface-base">
						<canvas ref={exCanvas} className="absolute inset-0 h-full w-full" />
					</div>
					<figcaption className="text-center text-[clamp(0.65rem,0.9vh+0.25vw,0.9rem)] text-fg-muted">
						one tiling&rsquo;s two periods, spelled in it
					</figcaption>
				</figure>
			</div>
			{data ? (
				<p className="m-0 text-center font-mono text-[clamp(0.6rem,0.9vh+0.25vw,0.85rem)] leading-relaxed text-fg-secondary">
					T₁ = {sum(data.t1.chain, data.directions)}
					<span className="text-fg-muted"> ({data.t1.weight} steps)</span>
					<br />
					T₂ = {sum(data.t2.chain, data.directions)}
					<span className="text-fg-muted"> ({data.t2.weight} steps)</span>
				</p>
			) : null}
		</div>
	);
}
