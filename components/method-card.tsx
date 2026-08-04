"use client";

import { Children, cloneElement, isValidElement } from "react";
import { cn } from "@/lib/utils/cn";

// The enumeration methods as one row of schematics, for the slide that would otherwise be a
// paragraph about them. Each panel is a drawing, not a picture of a tiling: what a method *does* to
// the problem, at the size a room reads in two seconds.
//
// Drawn as inline SVG, not exported from the thesis TikZ, for two reasons. The panels are
// schematic and have no counterpart in the thesis, so there is nothing to keep in sync; and a
// projector may be anything from 720p to 4K, where a 200px PNG in a five-across strip is the one
// figure format guaranteed to look soft.
//
// Everything is drawn in one 100x100 box with the deck's own tokens, so the strip inverts with the
// theme instead of sitting on the white plate the imported TikZ figures need.

const INK = "var(--color-text-primary)";
const LINE = "var(--color-border-strong)";
const SOFT = "var(--color-border-default)";
const MUTED = "var(--color-text-muted)";
const FILL = "var(--color-surface-overlay)";
const TINT = "var(--color-accent-subtle)";

const SQRT3 = Math.sqrt(3);

interface MethodCardProps {
	/** Which schematic to draw. An unknown key draws a labelled placeholder, not nothing. */
	fig?: string;
	/** The method, in the fewest words that identify it. */
	name?: string;
	/** One line under the name: where the method ended up. */
	note?: string;
	/** `accent="yes"` for the one the path arrived at, so the terminus reads without being said. */
	accent?: string;
	/** Set by `<method-strip>`: every card but the first draws the arrow that precedes it. */
	linked?: boolean;
	/**
	 * `frame="no"` drops the panel's border and background. For a divider, where the drawing has no
	 * neighbours to be separated from and the box is the only thing on the slide with a hard edge.
	 */
	frame?: string;
}

/** A line with a solid head, built as geometry so no `<marker>` id has to be unique on the page. */
function Arrow({
	x1,
	y1,
	x2,
	y2,
	color = MUTED,
	width = 1.4,
	head = 4.2,
}: {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	color?: string;
	width?: number;
	head?: number;
}) {
	const len = Math.hypot(x2 - x1, y2 - y1) || 1;
	const ux = (x2 - x1) / len;
	const uy = (y2 - y1) / len;
	const bx = x2 - ux * head;
	const by = y2 - uy * head;
	const nx = -uy * head * 0.48;
	const ny = ux * head * 0.48;
	return (
		<g>
			<line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={width} strokeLinecap="round" />
			<polygon points={`${x2},${y2} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`} fill={color} />
		</g>
	);
}

/** `count` chevrons pointing along (ux, uy), centred on (x, y): the edge-identification mark. */
function Chevrons({
	x,
	y,
	ux,
	uy,
	count = 1,
	size = 3.4,
}: {
	x: number;
	y: number;
	ux: number;
	uy: number;
	count?: number;
	size?: number;
}) {
	const nx = -uy;
	const ny = ux;
	return (
		<g stroke={INK} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none">
			{Array.from({ length: count }, (_, i) => {
				const off = (i - (count - 1) / 2) * size * 1.7;
				const cx = x + ux * off;
				const cy = y + uy * off;
				const tipX = cx + ux * size * 0.7;
				const tipY = cy + uy * size * 0.7;
				const backX = cx - ux * size * 0.7;
				const backY = cy - uy * size * 0.7;
				return (
					<polyline
						key={i}
						points={`${backX + nx * size},${backY + ny * size} ${tipX},${tipY} ${backX - nx * size},${backY - ny * size}`}
					/>
				);
			})}
		</g>
	);
}

// 1. Expand-and-extract: stamp copies at the frontier, corona after corona, and look for two
// translations in what comes back. The outer ring is dashed and incomplete because the frontier is
// where the method died: locally legal boundary variants that never stop arriving.
const HEX = 10.2;
const HEX_DIRS: [number, number][] = [
	[1, 0],
	[1, -1],
	[0, -1],
	[-1, 0],
	[-1, 1],
	[0, 1],
];

function hexRing(k: number): [number, number][] {
	if (k === 0) return [[0, 0]];
	const out: [number, number][] = [];
	let [q, r] = [HEX_DIRS[4][0] * k, HEX_DIRS[4][1] * k];
	for (const [dq, dr] of HEX_DIRS) {
		for (let step = 0; step < k; step++) {
			out.push([q, r]);
			q += dq;
			r += dr;
		}
	}
	return out;
}

function hexCentre([q, r]: [number, number]): [number, number] {
	return [50 + HEX * 1.5 * q, 50 + HEX * SQRT3 * (r + q / 2)];
}

function hexPoints(cx: number, cy: number, radius = HEX): string {
	return Array.from({ length: 6 }, (_, i) => {
		const a = (Math.PI / 180) * 60 * i;
		return `${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`;
	}).join(" ");
}

function GrowthFigure() {
	const ring2 = hexRing(2);
	// Where the corona is left open, so the frontier arrows have somewhere to point.
	const gaps = [1, 9];
	// The two copies of the seed the extraction step is looking for: one tile east, one south-east.
	const found = [5, 3];
	return (
		<>
			{ring2.map((cell, i) => {
				if (gaps.includes(i) || found.includes(i)) return null;
				const [x, y] = hexCentre(cell);
				return (
					<polygon
						key={`r2-${i}`}
						points={hexPoints(x, y, HEX * 0.97)}
						fill="none"
						stroke={SOFT}
						strokeWidth={1.1}
						strokeDasharray="3 2.4"
					/>
				);
			})}
			{hexRing(1).map((cell, i) => {
				const [x, y] = hexCentre(cell);
				return <polygon key={`r1-${i}`} points={hexPoints(x, y)} fill="none" stroke={LINE} strokeWidth={1.3} />;
			})}
			{gaps.map((i) => {
				const [x, y] = hexCentre(ring2[i]);
				return (
					<Arrow
						key={`arrow-${i}`}
						x1={50 + (x - 50) * 0.74}
						y1={50 + (y - 50) * 0.74}
						x2={50 + (x - 50) * 1.03}
						y2={50 + (y - 50) * 1.03}
						head={4.6}
					/>
				);
			})}
			{found.map((i) => {
				const [x, y] = hexCentre(ring2[i]);
				return (
					<polygon key={`f-${i}`} points={hexPoints(x, y)} fill={TINT} stroke={INK} strokeWidth={1.5} />
				);
			})}
			<polygon points={hexPoints(50, 50)} fill={TINT} stroke={INK} strokeWidth={1.8} />
			{found.map((i) => {
				const [x, y] = hexCentre(ring2[i]);
				return <Arrow key={`t-${i}`} x1={50} y1={50} x2={x} y2={y} color={INK} width={1.7} head={5} />;
			})}
		</>
	);
}

// 2. Wallpaper fitting: lay the fundamental domain of a group over the lattice and read the tiling
// off its orbit. The dashed copy with the double arrow is the reason it never shipped — for cmm and
// p2 the domain's shape is a parameter of the tiling you are looking for, not a fixed template.
function WallpaperFigure() {
	const dot = (i: number, j: number): [number, number] => [18 + 27 * i + 8 * j, 78 - 27 * j];
	const rows = [0, 1, 2];
	// One asymmetric motif per lattice point, offset to sit inside its own cell: the pattern is the
	// orbit of that motif, and the shaded cell holds exactly one of it.
	const motif = (x: number, y: number, colour: string, width: number) => (
		<g stroke={colour} strokeWidth={width} fill={colour} strokeLinecap="round" strokeLinejoin="round">
			<line x1={x} y1={y + 5} x2={x} y2={y - 5.5} />
			<polygon points={`${x},${y - 5.5} ${x + 6.4},${y - 3} ${x},${y - 0.6}`} />
		</g>
	);
	return (
		<>
			<g stroke={SOFT} strokeWidth={0.8} opacity={0.75}>
				{rows.map((j) => (
					<line key={`row-${j}`} x1={dot(0, j)[0]} y1={dot(0, j)[1]} x2={dot(2, j)[0]} y2={dot(2, j)[1]} />
				))}
				{rows.map((i) => (
					<line key={`col-${i}`} x1={dot(i, 0)[0]} y1={dot(i, 0)[1]} x2={dot(i, 2)[0]} y2={dot(i, 2)[1]} />
				))}
			</g>

			<polygon points="18,78 45,78 53,51 26,51" fill={TINT} stroke={INK} strokeWidth={1.9} />
			{/* The same domain with its top edge slid along: for cmm and p2 the shape is a parameter of
			    the tiling being sought, which is what no fixed-shape matcher can follow. */}
			<polygon
				points="18,78 45,78 66,51 39,51"
				fill="none"
				stroke={INK}
				strokeWidth={1.4}
				strokeDasharray="3.6 2.6"
				opacity={0.6}
			/>
			<Arrow x1={59} y1={45} x2={67} y2={45} head={4} width={1.5} color={INK} />
			<Arrow x1={59} y1={45} x2={51} y2={45} head={4} width={1.5} color={INK} />

			<g fill={MUTED}>
				{rows.flatMap((i) =>
					rows.map((j) => {
						const [x, y] = dot(i, j);
						return <circle key={`${i}-${j}`} cx={x} cy={y} r={1.6} />;
					}),
				)}
			</g>
			{rows.flatMap((i) =>
				rows.map((j) => {
					const [x, y] = dot(i, j);
					const inside = i === 0 && j === 0;
					return (
						<g key={`m-${i}-${j}`}>{motif(x + 9, y - 9, inside ? INK : MUTED, inside ? 1.5 : 1.1)}</g>
					);
				}),
			)}
		</>
	);
}

// 3. Solve-for-period: choose the lattice before placing a tile, then fill the torus it defines.
// The chevrons are the identification, the shaded cells are placed tiles, the dashed one is the
// hole the fill is still working on. Everything downstream of the outline is finite.
function TorusFigure() {
	const A: [number, number] = [16, 82];
	const a: [number, number] = [56, 0];
	const b: [number, number] = [20, -48];
	const at = (u: number, v: number): [number, number] => [A[0] + a[0] * u + b[0] * v, A[1] + a[1] * u + b[1] * v];
	const N = 3;
	const cellPoly = (i: number, j: number) =>
		[at(i / N, j / N), at((i + 1) / N, j / N), at((i + 1) / N, (j + 1) / N), at(i / N, (j + 1) / N)]
			.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
			.join(" ");
	const placed: [number, number][] = [
		[0, 0],
		[1, 0],
		[2, 0],
		[0, 1],
		[2, 1],
		[1, 2],
	];
	const quarters = [1, 2];

	return (
		<>
			{placed.map(([i, j]) => (
				<polygon key={`t-${i}-${j}`} points={cellPoly(i, j)} fill={FILL} stroke={SOFT} strokeWidth={0.9} />
			))}
			{/* The one cell still open: a fill is exhaustive, and this is what exhaustive looks like
			    mid-run. */}
			<polygon points={cellPoly(1, 1)} fill="none" stroke={MUTED} strokeWidth={1.3} strokeDasharray="2.8 2.2" />

			<g stroke={SOFT} strokeWidth={0.9}>
				{quarters.map((n) => {
					const [x1, y1] = at(n / N, 0);
					const [x2, y2] = at(n / N, 1);
					return <line key={`u-${n}`} x1={x1} y1={y1} x2={x2} y2={y2} />;
				})}
				{quarters.map((n) => {
					const [x1, y1] = at(0, n / N);
					const [x2, y2] = at(1, n / N);
					return <line key={`v-${n}`} x1={x1} y1={y1} x2={x2} y2={y2} />;
				})}
			</g>

			<polygon
				points={[at(0, 0), at(1, 0), at(1, 1), at(0, 1)].map(([x, y]) => `${x},${y}`).join(" ")}
				fill="none"
				stroke={INK}
				strokeWidth={1.9}
				strokeLinejoin="round"
			/>

			<Chevrons x={at(0.5, 0)[0]} y={at(0.5, 0)[1]} ux={1} uy={0} />
			<Chevrons x={at(0.5, 1)[0]} y={at(0.5, 1)[1]} ux={1} uy={0} />
			<Chevrons x={at(0, 0.5)[0]} y={at(0, 0.5)[1]} ux={0.385} uy={-0.923} count={2} />
			<Chevrons x={at(1, 0.5)[0]} y={at(1, 0.5)[1]} ux={0.385} uy={-0.923} count={2} />
		</>
	);
}

// 4. Delaney–Dress: forget the tiles and keep the barycentric chambers, one per flag. The three
// involutions move a chamber across its three sides — 0 changes the vertex, 1 the edge, 2 the tile,
// which is the one that leaves the polygon. A symbol is that structure with the tiles thrown away.
function DelaneyFigure() {
	const T = 24;
	const B = 68;
	const S = B - T;
	const cy = (T + B) / 2;
	// Two tiles, so the involution that leaves the polygon has somewhere to go.
	const tiles = [
		{ x0: 6, cx: 6 + S / 2 },
		{ x0: 50, cx: 50 + S / 2 },
	];
	const chamber = (cx: number, ex: number, ey: number, vx: number, vy: number) =>
		`${cx},${cy} ${ex},${ey} ${vx},${vy}`;
	return (
		<>
			{tiles.map(({ x0, cx }, t) => (
				<g key={t}>
					<polygon points={`${x0},${T} ${x0 + S},${T} ${x0 + S},${B} ${x0},${B}`} fill={FILL} opacity={0.45} />
					<g stroke={SOFT} strokeWidth={1}>
						{[
							[x0, T],
							[x0 + S, T],
							[x0 + S, B],
							[x0, B],
							[cx, T],
							[x0 + S, cy],
							[cx, B],
							[x0, cy],
						].map(([x, y], i) => (
							<line key={i} x1={cx} y1={cy} x2={x} y2={y} />
						))}
					</g>
				</g>
			))}

			{/* The flag: this tile, this edge, this vertex. Its mirror across the shared edge is the
			    same flag in the neighbouring tile, which is what the third involution does. */}
			<polygon points={chamber(tiles[0].cx, 50, cy, 50, T)} fill={TINT} stroke={INK} strokeWidth={1.6} />
			<polygon points={chamber(tiles[1].cx, 50, cy, 50, T)} fill={FILL} stroke={SOFT} strokeWidth={1.2} />

			{tiles.map(({ x0 }, t) => (
				<polygon
					key={t}
					points={`${x0},${T} ${x0 + S},${T} ${x0 + S},${B} ${x0},${B}`}
					fill="none"
					stroke={INK}
					strokeWidth={1.7}
				/>
			))}
			{tiles.map(({ cx }, t) => (
				<circle key={t} cx={cx} cy={cy} r={t === 0 ? 2 : 1.6} fill={t === 0 ? INK : MUTED} />
			))}
			<circle cx={50} cy={T} r={2} fill={INK} />

			<g fill={MUTED} fontSize={9} fontFamily="var(--font-mono, monospace)" textAnchor="middle">
				<text x={39} y={53}>
					0
				</text>
				<text x={33} y={36}>
					1
				</text>
				<text x={57} y={38}>
					2
				</text>
			</g>
		</>
	);
}

// 5. The engine that survived: abstract vertices, each a cyclic sequence of half-edges, joined by
// gluing one half-edge to another. Nothing on this panel has a position — the two squares meeting at
// the seam are the whole move, and coordinates arrive only after the search is over.
function GluingFigure() {
	const spoke = (cx: number, cy: number, deg: number, len: number) => {
		const a = (Math.PI / 180) * deg;
		return { x: cx + Math.cos(a) * len, y: cy + Math.sin(a) * len };
	};
	const nodes: { cx: number; cy: number; angles: number[] }[] = [
		{ cx: 27, cy: 50, angles: [68, 140, 214, 292] },
		{ cx: 73, cy: 50, angles: [112, 40, -34, -112] },
	];
	return (
		<>
			{nodes.map(({ cx, cy, angles }, n) => (
				<g key={n}>
					<circle cx={cx} cy={cy} r={9} fill="none" stroke={SOFT} strokeWidth={0.9} strokeDasharray="2.4 2.4" />
					{angles.map((deg, i) => {
						const end = spoke(cx, cy, deg, 17.5);
						const stub = spoke(cx, cy, deg, 20.5);
						return (
							<g key={i}>
								<line x1={cx} y1={cy} x2={end.x} y2={end.y} stroke={LINE} strokeWidth={1.5} strokeLinecap="round" />
								<rect
									x={stub.x - 2.6}
									y={stub.y - 2.6}
									width={5.2}
									height={5.2}
									fill="var(--color-surface-base)"
									stroke={SOFT}
									strokeWidth={1.1}
								/>
							</g>
						);
					})}
				</g>
			))}

			<line x1={27} y1={50} x2={73} y2={50} stroke={INK} strokeWidth={2.1} strokeLinecap="round" />
			<rect x={41} y={44.5} width={9} height={11} fill={TINT} stroke={INK} strokeWidth={1.7} />
			<rect x={50} y={44.5} width={9} height={11} fill={TINT} stroke={INK} strokeWidth={1.7} />
			<line x1={50} y1={42} x2={50} y2={58} stroke={INK} strokeWidth={1.1} strokeDasharray="2.4 2" />

			<circle cx={27} cy={50} r={3.4} fill={INK} />
			<circle cx={73} cy={50} r={3.4} fill={INK} />
		</>
	);
}

/**
 * The five drawings, keyed the way `fig="…"` names them. Exported because `<failed-path>` threads
 * the first four onto one curve for the Part II divider, and drawing them twice would be two
 * drawings to keep in step.
 */
export const METHOD_FIGURES: Record<string, () => React.ReactElement> = {
	growth: GrowthFigure,
	wallpaper: WallpaperFigure,
	torus: TorusFigure,
	delaney: DelaneyFigure,
	gluing: GluingFigure,
};

export function MethodCard({ fig, name, note, accent, linked, frame }: MethodCardProps) {
	const Figure = fig ? METHOD_FIGURES[fig] : undefined;
	const marked = String(accent) === "yes";
	const framed = String(frame) !== "no";

	return (
		// Captions sized off the CARD, not the viewport: the same strip is rendered at 190px on a slide
		// and at 30px in the overview grid, and a viewport-relative clamp would set both to the same
		// number, which is how a thumbnail ends up with three-line names beside a 30px drawing.
		<figure className="@container not-prose m-0 flex min-w-0 flex-col">
			<div
				className={cn(
					"relative aspect-square w-full p-[6%]",
					framed && ["border bg-surface-base", marked ? "border-accent" : "border-line"],
				)}
			>
				{/* Anchored to the panel, not the card, so the arrow sits on the drawings' centre
				    line whatever the captions below happen to wrap to. */}
				{linked && (
					<span
						aria-hidden
						className="absolute top-1/2 -left-[1.15em] -translate-x-1/2 -translate-y-1/2 text-[min(8cqw,1.15rem)] leading-none text-fg-muted"
					>
						&rarr;
					</span>
				)}
				{Figure ? (
					<svg viewBox="0 0 100 100" role="img" aria-label={name ?? fig ?? "method"} className="h-full w-full">
						<Figure />
					</svg>
				) : (
					<div className="flex h-full w-full items-center justify-center border border-dashed border-line-strong text-center text-[0.65rem] text-fg-muted">
						{fig ? `figure: ${fig}` : "no figure"}
					</div>
				)}
			</div>
			<figcaption className="mt-[0.6em] text-center">
				{name && (
					<span
						className={cn(
							"block text-[min(7.6cqw,1.05rem)] leading-tight font-semibold text-balance",
							marked ? "text-accent" : "text-fg",
						)}
					>
						{name}
					</span>
				)}
				{note && (
					<span className="mt-[0.25em] block text-[min(6.6cqw,0.9rem)] leading-tight text-balance text-fg-muted">
						{note}
					</span>
				)}
			</figcaption>
		</figure>
	);
}

/** The row itself: equal columns, and every card after the first gets the arrow into it. */
export function MethodStrip({ children }: { children?: React.ReactNode }) {
	const cards = Children.toArray(children).filter((c) => typeof c !== "string" || c.trim().length > 0);
	return (
		<div
			className="not-prose mx-auto mb-[1.1em] grid w-full gap-[2.4vw]"
			style={{ gridTemplateColumns: `repeat(${Math.max(1, cards.length)}, minmax(0, 1fr))` }}
		>
			{cards.map((child, i) =>
				isValidElement(child)
					? cloneElement(child as React.ReactElement<MethodCardProps>, { key: i, linked: i > 0 })
					: child,
			)}
		</div>
	);
}
