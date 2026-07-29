"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { prepare, screenMapper } from "@/lib/render/figureCanvas";

// Why fixing the period lattice first makes the search finite, in two panels.
//
// Left, the plane: a real tiling, with one period parallelogram outlined on it. Right, the same
// parallelogram with its opposite edges identified — the torus. A tile that leaves one side comes
// back on the other, so there is no boundary to grow into and nothing outside the cell left to
// decide. One tile is picked out in both panels: on the left it is two distinct copies poking in
// from opposite edges, on the right it is one tile.
//
// The pieces are not drawn by hand. Every lattice translate of every cell polygon is clipped against
// the unit square in lattice coordinates (Sutherland-Hodgman), which is what makes the covering come
// out exact: the cell is a fundamental SET, so its translates cover the plane exactly once and the
// surviving pieces tile the parallelogram with no gap and no overlap. Reducing tile CENTROIDS into
// [0,1)² instead — the obvious shortcut — does not, because a tile whose centre falls inside can
// still hang out over an edge.
//
// Same tiling and same JSON as <period-figure>, so the three slides of this act share one subject.

interface FigureData {
	t1: { xy: [number, number] };
	t2: { xy: [number, number] };
	polys: { n: number; v: [number, number][] }[];
}

type Pt = [number, number];

const T1_COLOUR = "hsl(212 78% 45%)";
const T2_COLOUR = "hsl(285 55% 47%)";
const ACCENT = "hsl(18 88% 48%)";
const TILE_FILL = "rgba(0,0,0,0.045)";
const TILE_LINE = "rgba(0,0,0,0.17)";
/**
 * How far past the cell the sweep reaches, in periods. Generous, because the plane panel then culls
 * again by a WORLD-space square: a lattice-space window is a parallelogram, and framing on one leaves
 * two white corners where the skew cuts it.
 */
const PLANE_WINDOW = 1.7;

/** Clip a polygon against one half-plane of the unit square, in lattice coordinates. */
function clipHalf(poly: Pt[], keep: (p: Pt) => boolean, cut: (a: Pt, b: Pt) => Pt): Pt[] {
	const out: Pt[] = [];
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i], b = poly[(i + 1) % poly.length];
		const ka = keep(a), kb = keep(b);
		if (ka) out.push(a);
		if (ka !== kb) out.push(cut(a, b));
	}
	return out;
}

/** Sutherland-Hodgman against [0,1]². Convex window, so one pass per edge is enough. */
function clipToUnitSquare(poly: Pt[]): Pt[] {
	const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
	let p = poly;
	p = clipHalf(p, (q) => q[0] >= 0, (a, b) => lerp(a, b, (0 - a[0]) / (b[0] - a[0])));
	p = clipHalf(p, (q) => q[0] <= 1, (a, b) => lerp(a, b, (1 - a[0]) / (b[0] - a[0])));
	p = clipHalf(p, (q) => q[1] >= 0, (a, b) => lerp(a, b, (0 - a[1]) / (b[1] - a[1])));
	p = clipHalf(p, (q) => q[1] <= 1, (a, b) => lerp(a, b, (1 - a[1]) / (b[1] - a[1])));
	return p;
}

const area = (poly: Pt[]) => {
	let a = 0;
	for (let i = 0; i < poly.length; i++) {
		const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
		a += x1 * y2 - x2 * y1;
	}
	return Math.abs(a) / 2;
};

const fillStroke = (ctx: CanvasRenderingContext2D, poly: Pt[]) => {
	ctx.beginPath();
	ctx.moveTo(poly[0][0], poly[0][1]);
	for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
};

/** `n` arrowheads along the edge P→Q, centred on its midpoint: the identification mark. */
function chevrons(ctx: CanvasRenderingContext2D, p: Pt, q: Pt, n: number, s: number, colour: string) {
	const dx = q[0] - p[0], dy = q[1] - p[1];
	const len = Math.hypot(dx, dy);
	const ux = dx / len, uy = dy / len;
	const size = 15 / s, gap = 12 / s;
	ctx.strokeStyle = colour;
	ctx.lineWidth = 3 / s;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	for (let i = 0; i < n; i++) {
		const t = len / 2 + (i - (n - 1) / 2) * gap;
		const cx = p[0] + ux * t, cy = p[1] + uy * t;
		const a = Math.atan2(uy, ux);
		ctx.beginPath();
		ctx.moveTo(cx - size * Math.cos(a - 0.62), cy - size * Math.sin(a - 0.62));
		ctx.lineTo(cx, cy);
		ctx.lineTo(cx - size * Math.cos(a + 0.62), cy - size * Math.sin(a + 0.62));
		ctx.stroke();
	}
}

export function TorusFigure() {
	const [data, setData] = useState<FigureData | null>(null);
	const planeHost = useRef<HTMLDivElement | null>(null);
	const planeCanvas = useRef<HTMLCanvasElement | null>(null);
	const torusHost = useRef<HTMLDivElement | null>(null);
	const torusCanvas = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		let alive = true;
		fetch("/defense/period-figure.json")
			.then((r) => r.json())
			.then((d: FigureData) => { if (alive) setData(d); })
			.catch(() => {});
		return () => { alive = false; };
	}, []);

	// Every translate of every cell polygon, in lattice coordinates, with the part of it that falls
	// inside the cell. `copies` is what the plane panel draws, `pieces` what the torus panel draws.
	const built = useMemo(() => {
		if (!data) return null;
		const [t1x, t1y] = data.t1.xy, [t2x, t2y] = data.t2.xy;
		const det = t1x * t2y - t1y * t2x;
		const toAB = ([x, y]: Pt): Pt => [(x * t2y - y * t2x) / det, (-x * t1y + y * t1x) / det];

		const copies: { ab: Pt[]; idx: number; meetsCell: boolean }[] = [];
		const pieces: { ab: Pt[]; idx: number }[] = [];
		// The reconstructed cell sits several periods from the origin, so the sweep has to be wide
		// enough to reach it from both directions; the window test throws away everything that misses.
		// PLANE_WINDOW is in lattice coordinates and centred on the cell, which is what keeps the left
		// panel's framing centred on the cell rather than on the origin.
		for (let i = -9; i <= 9; i++) {
			for (let j = -9; j <= 9; j++) {
				for (let k = 0; k < data.polys.length; k++) {
					const ab = data.polys[k].v.map((v) => toAB([v[0] + i * t1x + j * t2x, v[1] + i * t1y + j * t2y]));
					let lo0 = Infinity, hi0 = -Infinity, lo1 = Infinity, hi1 = -Infinity;
					for (const [a, b] of ab) {
						if (a < lo0) lo0 = a;
						if (a > hi0) hi0 = a;
						if (b < lo1) lo1 = b;
						if (b > hi1) hi1 = b;
					}
					if (hi0 < -PLANE_WINDOW || lo0 > 1 + PLANE_WINDOW) continue;
					if (hi1 < -PLANE_WINDOW || lo1 > 1 + PLANE_WINDOW) continue;
					const clipped = clipToUnitSquare(ab);
					const meetsCell = clipped.length >= 3 && area(clipped) > 1e-9;
					copies.push({ ab, idx: k, meetsCell });
					if (meetsCell) pieces.push({ ab: clipped, idx: k });
				}
			}
		}

		// The tile to pick out: one that the identification actually cuts, so the two panels differ.
		// Prefer a clean two-piece split, and among those the biggest, which is the easiest to see.
		const groups = new Map<number, { count: number; area: number }>();
		for (const p of pieces) {
			const g = groups.get(p.idx) ?? { count: 0, area: 0 };
			g.count += 1;
			g.area += area(p.ab);
			groups.set(p.idx, g);
		}
		let accent = -1, best = -1;
		for (const [idx, g] of groups) {
			if (g.count < 2) continue;
			const score = (g.count === 2 ? 100 : 0) + g.area;
			if (score > best) { best = score; accent = idx; }
		}

		return { copies, pieces, accent, t1: [t1x, t1y] as Pt, t2: [t2x, t2y] as Pt };
	}, [data]);

	// --- panel one: the plane, with one cell outlined on it ----------------------------------------
	useEffect(() => {
		const host = planeHost.current, canvas = planeCanvas.current;
		if (!host || !canvas || !built) return;
		const { copies, accent, t1, t2 } = built;
		const world = ([a, b]: Pt): Pt => [a * t1[0] + b * t2[0], a * t1[1] + b * t2[1]];

		const paint = () => {
			// A square window in WORLD space, centred on the cell and sized off it, so the tiling reaches
			// all four sides of the panel and the cell keeps a constant share of the frame whatever the
			// lattice's skew.
			const cellCorners = ([[0, 0], [1, 0], [1, 1], [0, 1]] as Pt[]).map(world);
			const cxs = cellCorners.map((c) => c[0]), cys = cellCorners.map((c) => c[1]);
			const centre: Pt = [(Math.min(...cxs) + Math.max(...cxs)) / 2, (Math.min(...cys) + Math.max(...cys)) / 2];
			const half = 0.8 * Math.max(Math.max(...cxs) - Math.min(...cxs), Math.max(...cys) - Math.min(...cys));
			const p = prepare(
				host, canvas,
				{ minX: centre[0] - half, maxX: centre[0] + half, minY: centre[1] - half, maxY: centre[1] + half },
				0.99,
			);
			if (!p) return;
			const { ctx, s, dpr } = p;

			ctx.lineWidth = 1 / s;
			for (const c of copies) {
				const w = c.ab.map(world);
				let mx = 0, my = 0;
				for (const [x, y] of w) { mx += x; my += y; }
				mx /= w.length; my /= w.length;
				if (Math.abs(mx - centre[0]) > half * 1.12 || Math.abs(my - centre[1]) > half * 1.12) continue;
				// Only the copies the cell actually cuts are accented: those are exactly the ones that
				// show up as pieces in the other panel, and highlighting every copy in the sweep would
				// say "this tile is everywhere" instead of "these two are one".
				const on = c.idx === accent && c.meetsCell;
				ctx.fillStyle = on ? "hsl(18 88% 48% / 0.4)" : TILE_FILL;
				ctx.strokeStyle = on ? ACCENT : TILE_LINE;
				fillStroke(ctx, w);
			}

			// the cell itself: the region the search will be confined to
			const box = [world([0, 0]), world([1, 0]), world([1, 1]), world([0, 1])];
			ctx.strokeStyle = "rgba(20,20,20,0.8)";
			ctx.lineWidth = 2.2 / s;
			ctx.beginPath();
			ctx.moveTo(box[0][0], box[0][1]);
			for (let i = 1; i < 4; i++) ctx.lineTo(box[i][0], box[i][1]);
			ctx.closePath();
			ctx.stroke();

			for (const [from, to, c] of [[[0, 0], [1, 0], T1_COLOUR], [[0, 0], [0, 1], T2_COLOUR]] as const) {
				const a = world(from as Pt), b = world(to as Pt);
				ctx.strokeStyle = c as string;
				ctx.fillStyle = c as string;
				ctx.lineWidth = 2.6 / s;
				ctx.beginPath();
				ctx.moveTo(a[0], a[1]);
				ctx.lineTo(b[0], b[1]);
				ctx.stroke();
				const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), head = 13 / s;
				ctx.beginPath();
				ctx.moveTo(b[0], b[1]);
				ctx.lineTo(b[0] - head * Math.cos(ang - 0.4), b[1] - head * Math.sin(ang - 0.4));
				ctx.lineTo(b[0] - head * Math.cos(ang + 0.4), b[1] - head * Math.sin(ang + 0.4));
				ctx.closePath();
				ctx.fill();
			}

			const toScreen = screenMapper(ctx, dpr);
			// Sized off the panel, not off `s`: the world units here are edge lengths, so a scale-derived
			// size lands wherever the cell happens to be big and clamps to the floor on most tilings.
			const size = Math.max(13, Math.min(21, host.clientWidth * 0.038));
			ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			for (const [at, label, c] of [
				[world([0.5, -0.19]), "T₁", T1_COLOUR],
				[world([-0.3, 0.5]), "T₂", T2_COLOUR],
			] as const) {
				ctx.fillStyle = c as string;
				const [sx, sy] = toScreen((at as Pt)[0], (at as Pt)[1]);
				ctx.fillText(label as string, sx, sy);
			}
		};

		paint();
		const ro = new ResizeObserver(paint);
		ro.observe(host);
		return () => ro.disconnect();
	}, [built]);

	// --- panel two: the same cell, with its edges identified ----------------------------------------
	useEffect(() => {
		const host = torusHost.current, canvas = torusCanvas.current;
		if (!host || !canvas || !built) return;
		const { pieces, accent, t1, t2 } = built;
		const world = ([a, b]: Pt): Pt => [a * t1[0] + b * t2[0], a * t1[1] + b * t2[1]];

		const paint = () => {
			const corners = [world([0, 0]), world([1, 0]), world([1, 1]), world([0, 1])];
			const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
			const pad = 0.16 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
			const p = prepare(
				host, canvas,
				{
					minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad,
					minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad,
				},
				0.96,
			);
			if (!p) return;
			const { ctx, s } = p;

			ctx.lineWidth = 1 / s;
			for (const piece of pieces) {
				ctx.fillStyle = piece.idx === accent ? "hsl(18 88% 48% / 0.4)" : TILE_FILL;
				ctx.strokeStyle = piece.idx === accent ? ACCENT : TILE_LINE;
				fillStroke(ctx, piece.ab.map(world));
			}

			// The identification: one chevron on the pair T1 glues, two on the pair T2 glues, each in its
			// translation's colour. Note which pair is which — the edge RUNNING along T1 is the one T2
			// carries across, so the marks sit on the opposite pair from the one the arrows point along.
			// Matching marks means matching points, which is the whole content of the picture.
			ctx.strokeStyle = "rgba(20,20,20,0.75)";
			ctx.lineWidth = 2 / s;
			ctx.beginPath();
			ctx.moveTo(corners[0][0], corners[0][1]);
			for (let i = 1; i < 4; i++) ctx.lineTo(corners[i][0], corners[i][1]);
			ctx.closePath();
			ctx.stroke();
			// the two edges along T1, which T2 identifies
			chevrons(ctx, world([0, 0]), world([1, 0]), 2, s, T2_COLOUR);
			chevrons(ctx, world([0, 1]), world([1, 1]), 2, s, T2_COLOUR);
			// the two edges along T2, which T1 identifies
			chevrons(ctx, world([0, 0]), world([0, 1]), 1, s, T1_COLOUR);
			chevrons(ctx, world([1, 0]), world([1, 1]), 1, s, T1_COLOUR);

		};

		paint();
		const ro = new ResizeObserver(paint);
		ro.observe(host);
		return () => ro.disconnect();
	}, [built]);

	return (
		<div className="not-prose flex flex-wrap items-start justify-center gap-5">
			<figure className="m-0 flex flex-col items-center gap-1">
				<div ref={planeHost} className="relative aspect-square h-[46vh] rounded-2xl border border-line bg-surface-base">
					<canvas ref={planeCanvas} className="absolute inset-0 h-full w-full" />
				</div>
				<figcaption className="text-center text-[clamp(0.65rem,0.9vh+0.25vw,0.9rem)] text-fg-muted">
					the plane, with one period cell marked
				</figcaption>
			</figure>
			<figure className="m-0 flex flex-col items-center gap-1">
				<div ref={torusHost} className="relative aspect-[4/3] h-[46vh] rounded-2xl border border-line bg-surface-base">
					<canvas ref={torusCanvas} className="absolute inset-0 h-full w-full" />
				</div>
				<figcaption className="text-center text-[clamp(0.65rem,0.9vh+0.25vw,0.9rem)] text-fg-muted">
					the same cell, opposite edges identified
				</figcaption>
			</figure>
		</div>
	);
}
