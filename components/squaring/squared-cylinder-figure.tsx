"use client";

import { useMemo } from "react";
import type { CylinderLayerData } from "@/lib/squaring/shelf";
import { FigureCaption } from "./stage-board";

// Stage 4: the squared cylinder.
//
// Left and right edges are glued, so the tiling is drawn with one wrapped copy on each side and the
// seam marked. The top edge is the source vertex and the bottom edge is the boundary at infinity, which
// is where the squares pile up: each layer of the ball contributes a band of squares roughly a constant
// factor smaller than the last, and that geometric decay IS the hyperbolic growth of the tiling.
//
// Not drawn to a square aspect. The cylinder is much wider than it is tall — circumference around 4.9
// against height 1 for {3,7} — so forcing the picture into a square box either shrinks the tiles to
// nothing or lies about their shape. A `span` prop shows one slice of the circumference at true aspect
// instead, and the caption says how much of it is on screen.

interface Props {
	layer: CylinderLayerData;
	hovered: number | null;
	onHover: (edge: number | null) => void;
	fills: string[];
	/** Fraction of the circumference to show. 1 is the whole cylinder, squashed; 1/3 reads better. */
	span?: number;
}

const W = 1000;

export function SquaredCylinderFigure({ layer, hovered, onHover, fills, span = 1 }: Props) {
	const { rects, height, seams } = useMemo(() => {
		const C = layer.circumference;
		const width = C * span;
		const scale = W / width;
		const H = 1 * scale;
		const out: { x: number; y: number; s: number; edge: number; ghost: boolean }[] = [];
		for (const q of layer.squares) {
			for (const shift of [-C, 0, C]) {
				const x = (q.x + shift) * scale;
				const s = q.side * scale;
				if (x + s < -2 || x > W + 2) continue;
				out.push({ x, y: H - (q.y + q.side) * scale, s, edge: q.edge, ghost: shift !== 0 });
			}
		}
		const marks: number[] = [];
		for (let k = 0; k * C <= width + 1e-9; k++) marks.push(k * C * scale);
		return { rects: out, height: H, seams: marks };
	}, [layer, span]);

	// Hovered tiles last: SVG has no z-index and a highlight stroke straddles a shared edge.
	const order = rects.map((_, i) => i).sort((a, b) => Number(rects[a].edge === hovered) - Number(rects[b].edge === hovered));

	return (
		<div className="flex h-full min-h-0 w-full flex-col gap-2">
			<svg
				viewBox={`0 0 ${W} ${height}`}
				className="min-h-0 w-full flex-1"
				onPointerLeave={() => onHover(null)}
				role="img"
				aria-label={`Square tiling of a cylinder, ${layer.squares.length} squares`}
			>
				<rect x={0} y={0} width={W} height={height} fill="var(--color-surface-overlay)" fillOpacity={0.35} />
				{order.map((i) => {
					const r = rects[i];
					const isHovered = r.edge === hovered;
					return (
						<rect
							key={i}
							x={r.x}
							y={r.y}
							width={r.s}
							height={r.s}
							fill={fills[r.edge]}
							fillOpacity={isHovered ? 1 : r.ghost ? 0.4 : 0.88}
							stroke={isHovered ? "var(--color-fg)" : "var(--color-line)"}
							strokeWidth={isHovered ? 3 : Math.min(1, r.s / 10)}
							onPointerEnter={() => onHover(r.edge)}
							style={{ cursor: "pointer" }}
						/>
					);
				})}
				{seams.map((x, i) => (
					<line
						key={`seam${i}`}
						x1={x}
						y1={0}
						x2={x}
						y2={height}
						stroke="var(--color-fg)"
						strokeWidth={2.5}
						strokeDasharray="9 7"
						opacity={0.75}
						className="pointer-events-none"
					/>
				))}
			</svg>
			{/* Short on purpose: the count and the circumference are both in the control rail, and this
			    caption has a two-line budget it must not exceed at the narrowest cell the board gives. */}
			<FigureCaption>
				{span < 1 ? `showing ${Math.round(span * 100)}% of the circumference, true aspect` : "the whole cylinder"} ·
				dashed is the seam
			</FigureCaption>
		</div>
	);
}
