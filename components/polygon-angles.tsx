"use client";

import { INK } from "@/lib/render/figureGlyphs";
import { hsbToHsla, polygonFillHue, TILE_FILL_ALPHA } from "@/lib/utils/renderTiling";

// The five tiles of the 12-direction pool, each with the interior angle this slide turns on marked at
// one corner.
//
// Drawn at ONE edge length, which is the slide's own premise: the edge is the unit, so the twelve-gon
// really is that much larger than the triangle and the marked corners really are the same size arc on
// every tile. Scaling each shape to fill its own cell would have been easier to read and would have
// contradicted the sentence above it.
//
// The angles are computed, not typed: 180 - 360/n. Every one of them is a whole number of 15° = 360/24,
// which is the whole reason the alphabet beside them has 24 letters and not some other number.

const NS = [3, 4, 6, 8, 12];
const PAD = 0.07;
/** Same arc on every tile, in edge units — it can be, because they share an edge length. */
const WEDGE_R = 0.28;

const rad = (deg: number) => (deg * Math.PI) / 180;
type Pt = [number, number];

interface Shape {
	n: number;
	pts: Pt[];
	angle: number;
	/** Index of the corner the arc marks. */
	mark: number;
}

/** A regular n-gon of unit edge, turned so an edge lies flat at the bottom. */
function shapeOf(n: number): Shape {
	const R = 1 / (2 * Math.sin(Math.PI / n));
	const pts: Pt[] = Array.from({ length: n }, (_, k) => {
		const a = rad(-90 + 180 / n + (k * 360) / n);
		return [R * Math.cos(a), R * Math.sin(a)];
	});
	// The top-right corner, so the arc sits where the caption can hang under it and never behind a
	// neighbouring tile. Even-sided tiles have two corners at the top; the tie goes right.
	let mark = 0;
	pts.forEach((p, i) => {
		const q = pts[mark];
		if (p[1] > q[1] + 1e-9 || (Math.abs(p[1] - q[1]) < 1e-9 && p[0] > q[0])) mark = i;
	});
	return { n, pts, angle: 180 - 360 / n, mark };
}

/**
 * The interior angle at the marked corner, as a filled sector.
 *
 * Sampled instead of drawn with an SVG arc: the sweep flag depends on which way the corner turns, and
 * a polyline of twenty steps is exact enough at this size and has no cases in it. The vertices run
 * anticlockwise, so the interior at a corner is the sweep from "towards the next vertex" through the
 * angle itself.
 */
function wedgePoints(s: Shape): Pt[] {
	const v = s.pts[s.mark];
	const next = s.pts[(s.mark + 1) % s.n];
	const start = Math.atan2(next[1] - v[1], next[0] - v[0]);
	const span = rad(s.angle);
	const steps = 20;
	return [
		v,
		...Array.from({ length: steps + 1 }, (_, i): Pt => {
			const a = start + (span * i) / steps;
			return [v[0] + WEDGE_R * Math.cos(a), v[1] + WEDGE_R * Math.sin(a)];
		}),
	];
}

function Tile({ s }: { s: Shape }) {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const [x, y] of s.pts) {
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	}
	const w = maxX - minX + 2 * PAD;
	const h = maxY - minY + 2 * PAD;
	// y is flipped: the tile is built in maths orientation and the viewBox runs downward.
	const path = (pts: Pt[]) =>
		pts.map(([x, y]) => `${(x - minX + PAD).toFixed(4)},${(maxY - y + PAD).toFixed(4)}`).join(" ");
	return (
		<svg viewBox={`0 0 ${w.toFixed(4)} ${h.toFixed(4)}`} className="h-auto w-full" aria-hidden>
			<polygon
				points={path(s.pts)}
				fill={hsbToHsla(polygonFillHue(s.pts.map(([x, y]) => ({ x, y }))), 40, 100, TILE_FILL_ALPHA)}
				stroke="rgba(20,20,20,0.5)"
				strokeWidth={0.022}
				strokeLinejoin="round"
			/>
			{/* Filled near-white, not a dark tint: the sector sits on the tile's own colour, and a dark one
			    reads as a smudge at the size a triangle gets here. */}
			<polygon
				points={path(wedgePoints(s))}
				fill="rgba(255,255,255,0.72)"
				stroke={INK}
				strokeWidth={0.024}
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** `<polygon-angles>` — the five regular tiles at one edge length, each with its interior angle. */
export function PolygonAngles() {
	const shapes = NS.map(shapeOf);
	const spans = shapes.map((s) => {
		const xs = s.pts.map(([x]) => x);
		return Math.max(...xs) - Math.min(...xs) + 2 * PAD;
	});
	return (
		<figure className="not-prose m-0 flex w-full flex-col items-center gap-[0.7em]">
			{/* The cells grow in proportion to the tiles' own widths, which is what keeps one scale across
			    five separate drawings. */}
			<div className="flex w-full items-stretch justify-center gap-[0.6em]">
				{shapes.map((s, i) => (
					<div
						key={s.n}
						className="flex min-w-0 flex-col items-center gap-[0.35em]"
						style={{ flex: `${spans[i]} 1 0` }}
					>
						<div className="flex flex-1 items-center">
							<Tile s={s} />
						</div>
						<div className="text-center leading-tight">
							<div className="font-mono text-[clamp(0.7rem,1.05vh+0.3vw,1.1rem)] font-semibold text-fg">
								{s.n}
							</div>
							<div className="text-[clamp(0.66rem,1vh+0.28vw,1.05rem)] text-fg-secondary">
								{s.angle}&deg;
							</div>
						</div>
					</div>
				))}
			</div>
			<figcaption className="text-center text-[clamp(0.66rem,1.02vh+0.28vw,1rem)] text-fg-muted">
				all angles are multiples of 15&deg; = 360&deg;/24 steps
			</figcaption>
		</figure>
	);
}
