"use client";

// The pentagon itself, drawn with its corners and sides named, above the sliders that move it.
//
// This is the control that makes the page's subject legible. Without it a slider labelled "B" is a
// number with no referent, and the type's conditions ("B + D = 180°", "2a = d = c + e") are assertions
// the reader has to take on faith. With the drawing and the live conditions next to it, dragging a
// slider visibly holds the constraint, which IS the classification.
//
// SVG, not a canvas: it is a five-sided outline with ten labels, it never animates on its own, and it
// must inherit the theme's text colours. A second WebGL context for that would be absurd.

import { useId } from "react";
import type { Angles, Point, Sides } from "@/lib/pentagon/solve";
import type { PentagonType } from "@/lib/pentagon/types";
import { tileFill } from "@/lib/render/tilePalette";

const CORNER_NAMES = ["A", "B", "C", "D", "E"] as const;
/** Side i is the one ARRIVING at corner i, so the edge from corner k to k+1 carries side (k+1) mod 5. */
const SIDE_OF_EDGE = [1, 2, 3, 4, 0] as const;
const SIDE_NAMES = ["a", "b", "c", "d", "e"] as const;

/** Drawing box in CSS px: the viewBox matches the rendered size, so font sizes below are real px. */
const BOX_W = 280;
const BOX_H = 170;
const PAD = 20;

export function PrototileInspector({
	type,
	corners,
	angles,
	sides,
	hue,
}: {
	type: PentagonType;
	/** Hue of tile 1 on the canvas, so the drawing is the same tile in the same colour. */
	hue: number;
	corners: Point[];
	angles: Angles;
	sides: Sides;
}) {
	const uid = useId();

	// Fit the pentagon into the box, flipping y so the drawing matches the canvas' orientation.
	let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
	for (const p of corners) {
		if (p.x < minx) minx = p.x;
		if (p.x > maxx) maxx = p.x;
		if (p.y < miny) miny = p.y;
		if (p.y > maxy) maxy = p.y;
	}
	const w = maxx - minx || 1;
	const h = maxy - miny || 1;
	const s = Math.min((BOX_W - 2 * PAD) / w, (BOX_H - 2 * PAD) / h);
	const ox = (BOX_W - w * s) / 2;
	const oy = (BOX_H - h * s) / 2;
	const px = (p: Point) => ({ x: ox + (p.x - minx) * s, y: BOX_H - (oy + (p.y - miny) * s) });

	const pts = corners.map(px);
	const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
	const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;

	return (
		<div className="flex flex-col items-center gap-2 rounded-surface border border-line-subtle bg-surface-raised p-2">
			<svg
				viewBox={`0 0 ${BOX_W} ${BOX_H}`}
				className="w-full"
				style={{ maxWidth: BOX_W, height: BOX_H }}
				role="img"
				aria-labelledby={`${uid}-title`}
			>
				<title id={`${uid}-title`}>
					{`${type.label}: angles ${angles.map((a) => a.toFixed(1)).join(", ")} degrees`}
				</title>
				<polygon
					points={pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
					fill={tileFill(hue)}
					stroke="#000"
					strokeWidth={1.5}
					strokeLinejoin="round"
				/>

				{/* Side labels, pushed outward from the centre so they clear the outline. */}
				{pts.map((p, i) => {
					const q = pts[(i + 1) % pts.length];
					const mx = (p.x + q.x) / 2;
					const my = (p.y + q.y) / 2;
					const dx = mx - cx;
					const dy = my - cy;
					const d = Math.hypot(dx, dy) || 1;
					return (
						<text
							key={`s${i}`}
							x={mx + (dx / d) * 10}
							y={my + (dy / d) * 10}
							textAnchor="middle"
							dominantBaseline="middle"
							className="fill-fg-muted font-sans italic"
							style={{ fontSize: 11 }}
						>
							{SIDE_NAMES[SIDE_OF_EDGE[i]]}
						</text>
					);
				})}

				{/* Corner labels, pulled inward so they sit inside the tile and never collide with a side. */}
				{pts.map((p, i) => {
					const dx = p.x - cx;
					const dy = p.y - cy;
					const d = Math.hypot(dx, dy) || 1;
					return (
						<text
							key={`c${i}`}
							x={p.x - (dx / d) * 14}
							y={p.y - (dy / d) * 14}
							textAnchor="middle"
							dominantBaseline="middle"
							fill="#000"
							className="font-sans"
							style={{ fontSize: 11, fontWeight: 600 }}
						>
							{CORNER_NAMES[i]}
						</text>
					);
				})}
			</svg>

			{/* The type's conditions as chips, with the current numbers substituted in on the right. */}
			<dl className="flex w-full flex-col gap-1 font-mono text-[11px] tabular-nums">
				{type.constraints.map((c) => (
					<div
						key={c.text}
						className="flex flex-wrap items-baseline justify-between gap-x-2 rounded-control bg-surface-sunken px-2.5 py-2"
					>
						<dt className="text-fg-secondary">{c.text}</dt>
						<dd className="ml-auto text-right text-fg">{c.live(angles, sides)}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
