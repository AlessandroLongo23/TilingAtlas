"use client";

import { useMemo } from "react";
import type { TorusSquaring } from "@/lib/squaring/torusSquaring";
import { FigureCaption } from "./stage-board";
import { tileInk } from "./stage-shared";
import { num, torusFills, viewFit } from "./torus-shared";

// Stage 4: the squared torus.
//
// The tiling is drawn over nine copies of the image lattice with one fundamental parallelogram
// outlined, because a squared torus shown as a single tile looks like a squared rectangle that has
// gone wrong — squares run off one side and reappear on the other, and only the repetition makes it
// read as a tiling. What is outlined is a fundamental domain for the flat torus, and its corners are
// where the two periods take the origin.
//
// The parallelogram is generally NOT axis-aligned, and that is the substance of the genus-1 case:
// crossing the tiling by one lattice step of the original tiling moves you by (stream period, voltage
// period) here, and those two vectors are what the class (m, n) controls.
//
// Only the CENTRE copy carries size labels. The surrounding copies are drawn at 0.62 alpha, so what
// the label would sit on is the tile composited against the page, which moves with the theme: the same
// tile is pale in light mode and dark in dark mode, and no fixed ink reads on both. The centre copy is
// nearly opaque, so `tileInk` can choose from the fill itself. Dropping the repeated labels also suits
// the figure, which already uses that alpha to say which domain is the one being read.

interface Props {
	squaring: TorusSquaring;
	hovered: number | null;
	onHover: (edge: number | null) => void;
	onPick?: (edge: number) => void;
	edges: number;
	/** Off the integer lattice the sides are irrational and scale-arbitrary, so they are not printed. */
	labels?: boolean;
}

const SIZE = 1000;
const FONT = 24;

export function SquaredTorusFigure({ squaring, hovered, onHover, onPick, edges, labels = true }: Props) {
	const { copies, project, fills, ring } = useMemo(() => {
		const L: [number, number][] = [
			[num(squaring.lattice[0][0]), num(squaring.lattice[0][1])],
			[num(squaring.lattice[1][0]), num(squaring.lattice[1][1])],
		];
		const sq = squaring.squares.map((s) => ({ x: num(s.x), y: num(s.y), s: num(s.side), edge: s.edge, label: s.side }));
		// The shipped squares are ONE fundamental domain's worth, but their coordinates come out of the
		// solve and sit wherever the potentials put them, which is not the parallelogram spanned by the
		// two periods. Framing on that parallelogram therefore pushes the actual tiles into a corner, so
		// the view is centred on the tiles and the parallelogram is drawn around their centre instead —
		// any translate of it is equally a fundamental domain, so this loses nothing.
		let cx0 = Infinity;
		let cx1 = -Infinity;
		let cy0 = Infinity;
		let cy1 = -Infinity;
		for (const q of sq) {
			cx0 = Math.min(cx0, q.x);
			cx1 = Math.max(cx1, q.x + q.s);
			cy0 = Math.min(cy0, q.y);
			cy1 = Math.max(cy1, q.y + q.s);
		}
		const cx = (cx0 + cx1) / 2;
		const cy = (cy0 + cy1) / 2;

		const out: { x: number; y: number; s: number; edge: number; label: string; centre: boolean }[] = [];
		const REACH = 2;
		for (let i = -REACH; i <= REACH; i++) {
			for (let j = -REACH; j <= REACH; j++) {
				for (const q of sq) {
					out.push({
						x: q.x + i * L[0][0] + j * L[1][0],
						y: q.y + i * L[0][1] + j * L[1][1],
						s: q.s,
						edge: q.edge,
						label: q.label,
						centre: i === 0 && j === 0,
					});
				}
			}
		}
		// Frame a little wider than one domain so the repetition is visible without the tiles shrinking.
		const half = Math.max(cx1 - cx0, cy1 - cy0) * 0.85;
		const proj = viewFit({ minX: cx - half, maxX: cx + half, minY: cy - half, maxY: cy + half }, SIZE, 10);
		const centreOfRing = [(L[0][0] + L[1][0]) / 2, (L[0][1] + L[1][1]) / 2];
		const corners: [number, number][] = ([
			[0, 0],
			[L[0][0], L[0][1]],
			[L[0][0] + L[1][0], L[0][1] + L[1][1]],
			[L[1][0], L[1][1]],
		] as [number, number][]).map((p) => [p[0] - centreOfRing[0] + cx, p[1] - centreOfRing[1] + cy]);
		return { copies: out, project: proj, fills: torusFills(squaring, edges), ring: corners.map(proj) };
	}, [squaring, edges]);

	// SVG paints in document order and a highlight stroke straddles a shared edge, so the hovered tiles
	// must come last or their outlines get half-swallowed by whichever neighbour is drawn after them.
	const order = copies.map((_, i) => i).sort((a, b) => Number(copies[a].edge === hovered) - Number(copies[b].edge === hovered));

	return (
		<div className="flex h-full min-h-0 w-full flex-col gap-2">
			<svg
				viewBox={`0 0 ${SIZE} ${SIZE}`}
				className="min-h-0 w-full flex-1"
				onPointerLeave={() => onHover(null)}
				role="img"
				aria-label={`Square tiling of a torus, order ${squaring.order}`}
			>
				{order.map((idx) => {
					const q = copies[idx];
					const p0 = project([q.x, q.y]);
					const p1 = project([q.x + q.s, q.y + q.s]);
					const x = Math.min(p0[0], p1[0]);
					const y = Math.min(p0[1], p1[1]);
					const w = Math.abs(p1[0] - p0[0]);
					const isHovered = q.edge === hovered;
					return (
						<g
							key={idx}
							onPointerEnter={() => onHover(q.edge)}
							onClick={() => onPick?.(q.edge)}
							style={{ cursor: onPick ? "pointer" : "default" }}
						>
							<rect
								x={x}
								y={y}
								width={w}
								height={w}
								fill={fills[q.edge]}
								fillOpacity={isHovered ? 1 : q.centre ? 0.92 : 0.62}
								stroke={isHovered ? "var(--color-fg)" : "var(--color-line)"}
								strokeWidth={isHovered ? 4 : 1.2}
							>
								<title>{`${q.label} — from edge ${q.edge}`}</title>
							</rect>
							{labels && q.centre && w > FONT * (q.label.length * 0.62 + 0.6) ? (
								<text
									x={x + w / 2}
									y={y + w / 2}
									textAnchor="middle"
									dominantBaseline="central"
									fontSize={FONT}
									fill={tileInk(fills[q.edge])}
									className="pointer-events-none font-mono"
								>
									{q.label}
								</text>
							) : null}
						</g>
					);
				})}
				<polygon
					points={ring.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}
					fill="none"
					stroke="var(--color-fg)"
					strokeWidth={3.5}
					strokeDasharray="11 8"
					className="pointer-events-none"
				/>
			</svg>
			<FigureCaption>
				torus area {squaring.approx ? "≈ " : ""}
				{squaring.covolume} · order {squaring.order}
				{squaring.approx
					? ""
					: squaring.perfect
						? " · every tile a different size"
						: ` · ${squaring.distinct} sizes across ${squaring.order} tiles`}
				{onPick ? " · dashed outline is one fundamental domain" : ""}
			</FigureCaption>
		</div>
	);
}
