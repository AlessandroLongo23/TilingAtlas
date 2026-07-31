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

const CORNER_NAMES = ["A", "B", "C", "D", "E"] as const;
/** Side i is the one ARRIVING at corner i, so the edge from corner k to k+1 carries side (k+1) mod 5. */
const SIDE_OF_EDGE = [1, 2, 3, 4, 0] as const;
const SIDE_NAMES = ["a", "b", "c", "d", "e"] as const;

const BOX = 132;
const PAD = 22;

export function PrototileInspector({
	type,
	corners,
	angles,
	sides,
}: {
	type: PentagonType;
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
	const s = (BOX - 2 * PAD) / Math.max(w, h);
	const ox = PAD + (BOX - 2 * PAD - w * s) / 2;
	const oy = PAD + (BOX - 2 * PAD - h * s) / 2;
	const px = (p: Point) => ({ x: ox + (p.x - minx) * s, y: BOX - (oy + (p.y - miny) * s) });

	const pts = corners.map(px);
	const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
	const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;

	return (
		<div className="flex flex-col gap-2">
			<svg
				viewBox={`0 0 ${BOX} ${BOX}`}
				className="w-full h-auto"
				role="img"
				aria-labelledby={`${uid}-title`}
			>
				<title id={`${uid}-title`}>
					{`${type.label}: angles ${angles.map((a) => a.toFixed(1)).join(", ")} degrees`}
				</title>
				<polygon
					points={pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
					className="fill-accent-subtle stroke-fg-secondary"
					strokeWidth={1.25}
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
							x={mx + (dx / d) * 9}
							y={my + (dy / d) * 9}
							textAnchor="middle"
							dominantBaseline="middle"
							className="fill-fg-muted"
							style={{ fontSize: 8.5, fontStyle: "italic" }}
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
							x={p.x - (dx / d) * 13}
							y={p.y - (dy / d) * 13}
							textAnchor="middle"
							dominantBaseline="middle"
							className="fill-fg"
							style={{ fontSize: 9, fontWeight: 600 }}
						>
							{CORNER_NAMES[i]}
						</text>
					);
				})}
			</svg>

			{/* The type's conditions with the current numbers substituted in. */}
			<dl className="flex flex-col gap-1 text-[11px]">
				{type.constraints.map((c) => (
					<div key={c.text} className="flex flex-col">
						<dt className="text-fg-secondary">{c.text}</dt>
						<dd className="text-fg-muted tabular-nums">{c.live(angles, sides)}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
