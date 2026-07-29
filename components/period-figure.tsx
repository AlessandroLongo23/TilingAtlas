"use client";

import { useEffect, useRef, useState } from "react";

// The bounded-weight theorem as one case you can read off the plane.
//
// The 24 ζ₂₄ directions are the step alphabet. A tiling's two period vectors are drawn as the actual
// chains of unit steps that sum to them — searched breadth-first in exact ℤ[ζ₂₄] arithmetic by
// scripts/build-period-figure.ts, so each chain is a SHORTEST one and its length is that vector's
// weight. Everything that is not a ζ step (the tiles, the period parallelogram) is held at low opacity,
// because the claim is about the steps.
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

/** Hue per ζ exponent, so a step's colour names its direction and the rose is its legend. */
const hueOf = (k: number, n: number) => (360 * k) / n;

export function PeriodFigure() {
	const [data, setData] = useState<FigureData | null>(null);
	const hostRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		let alive = true;
		fetch("/defense/period-figure.json")
			.then((r) => r.json())
			.then((d: FigureData) => { if (alive) setData(d); })
			.catch(() => {});
		return () => { alive = false; };
	}, []);

	useEffect(() => {
		const host = hostRef.current, canvas = canvasRef.current;
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

		// The cell repeated over the lattice, kept to what the period parallelogram actually covers — the
		// figure is about one cell of the tiling, not a patch of it.
		//
		// Selection is by lattice coordinate: a tile is kept when its centroid reduces to within a margin
		// of [0,1]^2 against (T1, T2). The margin is not slop — the reconstructed cell is a connected
		// patch of 12 tiles that is a fundamental SET (same area as the parallelogram, different shape),
		// so reducing each centroid into [0,1)^2 exactly would clump the patch where the cell happens to
		// sit and leave a corner of the parallelogram bare. Widening it draws the tiling AROUND the cell
		// instead, which is what the figure wants behind the vectors anyway. The sweep range only has to
		// be wide enough to reach it — the cell as reconstructed sits several periods from the origin.
		const tiles: [number, number][][] = [];
		const det = t1x * t2y - t1y * t2x;
		for (let i = -6; i <= 6; i++) {
			for (let j = -6; j <= 6; j++) {
				const ox = i * t1x + j * t2x, oy = i * t1y + j * t2y;
				for (const p of data.polys) {
					const poly = p.v.map(([x, y]) => [x + ox, y + oy] as [number, number]);
					// Keep a tile only if its centroid sits inside the parallelogram, in lattice coordinates.
					let mx = 0, my = 0;
					for (const [x, y] of poly) { mx += x; my += y; }
					mx /= poly.length; my /= poly.length;
					const a = (mx * t2y - my * t2x) / det, b = (-mx * t1y + my * t1x) / det;
					if (a > -0.45 && a < 1.45 && b > -0.45 && b < 1.45) tiles.push(poly);
				}
			}
		}

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

			const xs = [0, t1x, t2x, t1x + t2x, ...tiles.flat().map((p) => p[0]), -1.4, 1.4];
			const ys = [0, t1y, t2y, t1y + t2y, ...tiles.flat().map((p) => p[1]), -1.4, 1.4];
			const minX = Math.min(...xs), maxX = Math.max(...xs);
			const minY = Math.min(...ys), maxY = Math.max(...ys);
			const s = 0.92 * Math.min(w / (maxX - minX), h / (maxY - minY));
			ctx.scale(dpr, dpr);
			ctx.translate(w / 2, h / 2);
			ctx.scale(s, -s);
			ctx.translate(-(minX + maxX) / 2, -(minY + maxY) / 2);

			// --- everything that is not a ζ step, held back -------------------------------------------
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
			// the period parallelogram
			ctx.setLineDash([6 / s, 5 / s]);
			ctx.strokeStyle = "rgba(0,0,0,0.28)";
			ctx.lineWidth = 1.4 / s;
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(t1x, t1y);
			ctx.lineTo(t1x + t2x, t1y + t2y);
			ctx.lineTo(t2x, t2y);
			ctx.closePath();
			ctx.stroke();
			ctx.setLineDash([]);

			// --- the alphabet: 24 unit directions at the origin ---------------------------------------
			for (let k = 0; k < N; k++) {
				const [dx, dy] = unit(k);
				ctx.strokeStyle = `hsl(${hueOf(k, N)} 85% 45%)`;
				ctx.lineWidth = 1.6 / s;
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.lineTo(dx, dy);
				ctx.stroke();
				ctx.fillStyle = `hsl(${hueOf(k, N)} 85% 45%)`;
				ctx.beginPath();
				ctx.arc(dx, dy, 3.2 / s, 0, 2 * Math.PI);
				ctx.fill();
			}

			// --- the two words: each period vector as its chain of unit steps -------------------------
			const drawChain = (pts: [number, number][], chain: number[]) => {
				for (let i = 0; i < chain.length; i++) {
					ctx.strokeStyle = `hsl(${hueOf(chain[i], N)} 85% 45%)`;
					ctx.lineWidth = 4.2 / s;
					ctx.lineCap = "round";
					ctx.beginPath();
					ctx.moveTo(pts[i][0], pts[i][1]);
					ctx.lineTo(pts[i + 1][0], pts[i + 1][1]);
					ctx.stroke();
					ctx.fillStyle = "#fff";
					ctx.strokeStyle = `hsl(${hueOf(chain[i], N)} 85% 45%)`;
					ctx.lineWidth = 1.6 / s;
					ctx.beginPath();
					ctx.arc(pts[i + 1][0], pts[i + 1][1], 4 / s, 0, 2 * Math.PI);
					ctx.fill();
					ctx.stroke();
				}
			};
			drawChain(p1, data.t1.chain);
			drawChain(p2, data.t2.chain);

			// the resultants, as plain arrows over their chains
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

	const sum = (chain: number[]) => chain.map((k) => `ζ^${k}`).join(" + ");

	return (
		<div className="not-prose flex flex-col items-center gap-2">
			<div ref={hostRef} className="relative aspect-[4/3] h-[40vh] rounded-2xl border border-line bg-surface-base">
				<canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
			</div>
			{data ? (
				<p className="m-0 text-center font-mono text-[clamp(0.6rem,0.9vh+0.25vw,0.85rem)] leading-relaxed text-fg-secondary">
					T₁ = {sum(data.t1.chain)} <span className="text-fg-muted">({data.t1.weight} steps)</span>
					<br />
					T₂ = {sum(data.t2.chain)} <span className="text-fg-muted">({data.t2.weight} steps)</span>
				</p>
			) : null}
		</div>
	);
}
