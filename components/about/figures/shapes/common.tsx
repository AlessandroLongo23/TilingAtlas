"use client";

// Helpers shared by the isohedral and pentagon article figures: a translational cell repeated over a
// box, rounded SVG coordinates, and labels that stay upright inside the kit's y-up Stage.

import type { ReactNode } from "react";
import type { RawPolygon } from "@/lib/utils/renderTiling";

type Pt = { x: number; y: number };

/**
 * Coordinates rounded to a thousandth. The figures render on the server too, and Node's and Chromium's
 * trigonometry can differ in the last bit; a rounded attribute hydrates identically.
 */
const r3 = (v: number) => Math.round(v * 1000) / 1000;
export const pts = (p: { vertices: Pt[] }) => p.vertices.map((v) => `${r3(v.x)},${r3(v.y)}`).join(" ");
export const pathOf = (ps: { vertices: Pt[] }[]) =>
	ps.map((p) => `M${p.vertices.map((v) => `${r3(v.x)},${r3(v.y)}`).join("L")}Z`).join("");

/** A square box of half-width `h` about (cx, cy), as a polygon the kit's Stage can fit. */
export const box = (h: number, cx = 0, cy = 0) => [
	{
		vertices: [
			{ x: cx - h, y: cy - h },
			{ x: cx + h, y: cy - h },
			{ x: cx + h, y: cy + h },
			{ x: cx - h, y: cy + h },
		],
	},
];

/**
 * Every copy of a translational cell's tiles that reaches into the box of half-width `h` about the
 * origin. The Stage's SVG clips at its viewBox, so tiles crossing the edge are simply cut there.
 */
export function patch(cell: RawPolygon[], v1: [number, number], v2: [number, number], h: number): RawPolygon[] {
	const det = v1[0] * v2[1] - v1[1] * v2[0];
	if (!Math.abs(det)) return cell;
	// The cell's own reach, so a copy whose origin is outside the box can still be kept.
	let reach = 0;
	for (const p of cell) for (const v of p.vertices) reach = Math.max(reach, Math.hypot(v.x, v.y));
	const R = 1.15 * h * Math.SQRT2 + reach;
	// Lattice coordinates of a point: bound |i|, |j| by the box's corners.
	const coord = (x: number, y: number) => [(x * v2[1] - y * v2[0]) / det, (v1[0] * y - v1[1] * x) / det];
	let n = 1;
	for (const [x, y] of [
		[R, R],
		[R, -R],
		[-R, R],
		[-R, -R],
	])
		for (const c of coord(x, y)) n = Math.max(n, Math.ceil(Math.abs(c)) + 1);
	n = Math.min(n, 40);
	const out: RawPolygon[] = [];
	for (let i = -n; i <= n; i++)
		for (let j = -n; j <= n; j++) {
			const ox = i * v1[0] + j * v2[0];
			const oy = i * v1[1] + j * v2[1];
			for (const p of cell) {
				const vs = p.vertices.map((v) => ({ x: v.x + ox, y: v.y + oy }));
				// The Stage pads its view by 6%, so keep what reaches into that margin too.
				const H = h * 1.15;
				const hit = vs.some((v) => Math.abs(v.x) <= H && Math.abs(v.y) <= H);
				const xs = vs.map((v) => v.x),
					ys = vs.map((v) => v.y);
				const spans = Math.min(...xs) <= H && Math.max(...xs) >= -H && Math.min(...ys) <= H && Math.max(...ys) >= -H;
				if (hit || spans) out.push({ ...p, vertices: vs });
			}
		}
	return out;
}

/** Text at world (x, y) inside a Stage, flipped back upright. `size` is in world units. */
export function Label({
	x,
	y,
	size,
	children,
	className = "fill-fg-muted",
	italic,
	bold,
}: {
	x: number;
	y: number;
	size: number;
	children: ReactNode;
	className?: string;
	italic?: boolean;
	bold?: boolean;
}) {
	return (
		<text
			transform={`translate(${r3(x)} ${r3(y)}) scale(1 -1)`}
			textAnchor="middle"
			dominantBaseline="central"
			className={`font-sans ${className}`}
			style={{ fontSize: r3(size), fontStyle: italic ? "italic" : undefined, fontWeight: bold ? 600 : undefined }}
		>
			{children}
		</text>
	);
}

/** The extent of a point set: the larger side of its bounding box. */
export function extent(ps: Pt[]) {
	const xs = ps.map((p) => p.x),
		ys = ps.map((p) => p.y);
	return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
}

export function centroid(ps: Pt[]) {
	return {
		x: ps.reduce((a, p) => a + p.x, 0) / ps.length,
		y: ps.reduce((a, p) => a + p.y, 0) / ps.length,
	};
}
