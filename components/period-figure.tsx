"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { prepare } from "@/lib/render/figureCanvas";
import { colourOf, drawZetaWheel } from "@/lib/render/zetaWheel";

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
			const p = prepare(host, canvas, { minX: -1.5, maxX: 1.5, minY: -1.5, maxY: 1.5 }, 0.96);
			if (!p) return;
			drawZetaWheel(p.ctx, p.s, p.dpr, N);
		};

		paint();
		const ro = new ResizeObserver(paint);
		ro.observe(host);
		return () => ro.disconnect();
	}, [view]);

	// --- panel two: one word in that alphabet ------------------------------------------------------
	useEffect(() => {
		const host = exHost.current, canvas = exCanvas.current;
		if (!host || !canvas || !data || !view) return;

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
		};

		paint();
		const ro = new ResizeObserver(paint);
		ro.observe(host);
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
					<figure className="m-0 flex flex-col items-center gap-1">
						<div
							ref={exHost}
							className={`relative aspect-[4/3] ${solo ? "h-[42vh]" : "h-[34vh]"} rounded-2xl border border-line bg-surface-base`}
						>
							<canvas ref={exCanvas} className="absolute inset-0 h-full w-full" />
						</div>
						<figcaption className="text-center text-[clamp(0.65rem,0.9vh+0.25vw,0.9rem)] text-fg-muted">
							one tiling&rsquo;s two periods, spelled in it
						</figcaption>
					</figure>
				) : null}
			</div>
			{data && showExample ? (
				<p className="m-0 text-center font-mono text-[clamp(0.6rem,0.9vh+0.25vw,0.85rem)] leading-relaxed text-fg-secondary">
					T₁ = {sum(view.t1, view.N)}
					<span className="text-fg-muted"> ({data.t1.weight} steps)</span>
					<br />
					T₂ = {sum(view.t2, view.N)}
					<span className="text-fg-muted"> ({data.t2.weight} steps)</span>
				</p>
			) : null}
		</div>
	);
}
