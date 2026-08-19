"use client";

import { squaringToSvg, labelFits } from "@/lib/squaring/squaringSvg";
import type { SquaringRecord } from "@/lib/squaring/shelf";
import { FigureCaption } from "./stage-board";
import { edgeKey, tileInk } from "./stage-shared";

// Stage 4: the rectangle, with each tile's side written inside it.
//
// Separate from components/squaring-card.tsx, which is the article's figure and is a server component
// with no interaction. This one carries the pipeline's shared hover: every tile knows which polyhedron
// edge it came from, so pointing at a square lights up its edge in the solid, in the flat graph and in
// the circuit at once. That link is the reason to have four stages on one page instead of four
// pictures, so it is worth a second component.

interface SquaringFigureProps {
	record: SquaringRecord;
	size?: number;
	hovered: string | null;
	onHover: (key: string | null) => void;
	/** Clicking a tile makes its edge the battery, as clicking an edge does in the graph stages. */
	onPickBattery?: (edge: [number, number]) => void;
}

const FONT = 26;

export function SquaringFigure({ record, size = 1000, hovered, onHover, onPickBattery }: SquaringFigureProps) {
	const svg = squaringToSvg(record, size);

	// SVG has no z-index: later elements paint over earlier ones, so a tile's highlight stroke was being
	// half-swallowed by whichever neighbours happened to be drawn after it. Straddling a shared edge, a
	// stroke is only half inside its own tile, and the other half belongs to the neighbour. Drawing the
	// hovered tile LAST puts its whole outline on top.
	const order = svg.rects.map((_, i) => i);
	const hoveredIndex = order.find((i) => {
		const e = record.squares[i].edge;
		return edgeKey(e[0], e[1]) === hovered;
	});
	if (hoveredIndex !== undefined) {
		order.splice(order.indexOf(hoveredIndex), 1);
		order.push(hoveredIndex);
	}

	return (
		<div className="flex h-full min-h-0 w-full flex-col gap-2">
			<svg
				viewBox={svg.viewBox}
				className="min-h-0 w-full flex-1"
				onPointerLeave={() => onHover(null)}
				role="img"
				aria-label={`Squared rectangle of order ${record.order}, ${record.width} by ${record.height}`}
			>
				{order.map((i) => {
					const r = svg.rects[i];
					const square = record.squares[i];
					const key = edgeKey(square.edge[0], square.edge[1]);
					const isHovered = key === hovered;
					return (
						<g
							key={i}
							onPointerEnter={() => onHover(key)}
							onClick={() => onPickBattery?.([square.edge[0], square.edge[1]])}
							style={{ cursor: "pointer" }}
						>
							<rect
								x={r.x}
								y={r.y}
								width={r.size}
								height={r.size}
								fill={r.fill}
								fillOpacity={isHovered ? 1 : 0.92}
								stroke={isHovered ? "var(--color-fg)" : "var(--color-line)"}
								strokeWidth={isHovered ? 5 : 1.5}
							>
								<title>{`${r.label} — from edge ${square.edge[0]}–${square.edge[1]}`}</title>
							</rect>
							{labelFits(r, FONT) ? (
								<text
									x={r.x + r.size / 2}
									y={r.y + r.size / 2}
									textAnchor="middle"
									dominantBaseline="central"
									fontSize={FONT}
									fill={tileInk(r.fill)}
									className="pointer-events-none font-mono"
								>
									{r.label}
								</text>
							) : null}
						</g>
					);
				})}
			</svg>
			<FigureCaption>
				{record.width} x {record.height} · order {record.order} ·{" "}
				{record.perfect ? "every tile a different size" : `${record.distinct} sizes across ${record.order} tiles`}
				{onPickBattery ? " · click a tile for its edge" : ""}
			</FigureCaption>
		</div>
	);
}
