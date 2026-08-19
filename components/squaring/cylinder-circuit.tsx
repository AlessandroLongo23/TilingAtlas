"use client";

import { useMemo } from "react";
import type { CylinderLayerData } from "@/lib/squaring/shelf";

// Stage 3: the circuit, with height set to potential.
//
// This does NOT reuse the Smith layout the sphere and torus stages use, and the reason is worth
// recording. That layout puts each node at the centre of its own horizontal segment, which works when
// the segments are intervals. On a cylinder they are rings: every one of them wraps the full
// circumference, so every centre lands at the same place and the whole diagram collapses onto a
// vertical line. Tried it, and it does exactly that.
//
// The honest horizontal coordinate here is the angular one, which is what ψ is on a cylinder anyway.
// Each vertex is placed at its own angle in the Poincaré disk, unrolled, and at the height of its
// potential. The result is the ball cut open along a ray and laid flat, which is the same operation
// stage 4 performs on the tiling — so the two read against each other directly.

interface Props {
	layer: CylinderLayerData;
	fills: string[];
	hovered: number | null;
	onHover: (edge: number | null) => void;
}

const W = 1000;
const H = 700;
const M = 26;

export function CylinderCircuit({ layer, fills, hovered, onHover }: Props) {
	const { lines, dots } = useMemo(() => {
		// The source sits at the disk ORIGIN, where the angle is undefined; atan2(0,0) returns 0 and every
		// edge leaving it would bunch against the left margin. It gets the same treatment as the sink
		// instead: a bar across its whole potential level, with each edge dropping from above its target.
		const source = layer.potential.indexOf(Math.max(...layer.potential));
		const angle = layer.positions.map((p, v) =>
			p && v !== source ? (Math.atan2(p[1], p[0]) + 2 * Math.PI) % (2 * Math.PI) : null,
		);
		const side = new Array<number>(layer.edges.length).fill(0);
		for (const q of layer.squares) side[q.edge] = q.side;
		const maxSide = Math.max(...side, 1e-9);
		const x = (a: number) => M + (a / (2 * Math.PI)) * (W - 2 * M);
		const y = (v: number) => H - M - v * (H - 2 * M);

		const ls: { x1: number; y1: number; x2: number; y2: number; edge: number; w: number }[] = [];
		for (let e = 0; e < layer.edges.length; e++) {
			const [u, v] = layer.edges[e];
			const au = angle[u];
			const av = angle[v];
			const w = 1 + 9 * (side[e] / maxSide);
			if (au === null || av === null) {
				// One end is a pole (the source, or the sink standing for the whole boundary): the edge runs
				// vertically from its real end to that pole's bar.
				const real = au ?? av;
				if (real === null) continue;
				const other = au === null ? v : u;
				const pole = au === null ? u : v;
				ls.push({ x1: x(real), y1: y(layer.potential[other]), x2: x(real), y2: y(layer.potential[pole]), edge: e, w });
				continue;
			}
			// Cut along angle 0: an edge straddling the seam is drawn to the nearer image, so it leaves
			// one side of the picture at the height it re-enters the other.
			let a2 = av;
			if (Math.abs(a2 - au) > Math.PI) a2 += a2 > au ? -2 * Math.PI : 2 * Math.PI;
			ls.push({ x1: x(au), y1: y(layer.potential[u]), x2: x(a2), y2: y(layer.potential[v]), edge: e, w });
		}
		// Poles have no angle, so no dot: they are the two bars.
		const ds = layer.positions
			.map((p, v) => (p && angle[v] !== null ? { x: x(angle[v] as number), y: y(layer.potential[v]), v } : null))
			.filter((d): d is { x: number; y: number; v: number } => d !== null);
		return { lines: ls, dots: ds };
	}, [layer]);

	const order = lines.map((_, i) => i).sort((a, b) => Number(lines[a].edge === hovered) - Number(lines[b].edge === hovered));

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="h-full w-full"
			onPointerLeave={() => onHover(null)}
			role="img"
			aria-label="The circuit, with height set to potential"
		>
			{/* The two poles: the source at the top, the wired boundary as a bar along the bottom. */}
			<line x1={0} y1={H - M} x2={W} y2={H - M} stroke="var(--color-fg)" strokeWidth={3} opacity={0.85} />
			<line x1={0} y1={M} x2={W} y2={M} stroke="var(--color-fg)" strokeWidth={3} opacity={0.85} />
			{order.map((i) => {
				const l = lines[i];
				const isHovered = l.edge === hovered;
				return (
					<g key={i} onPointerEnter={() => onHover(l.edge)} style={{ cursor: "pointer" }}>
						<line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="transparent" strokeWidth={12} />
						<line
							x1={l.x1}
							y1={l.y1}
							x2={l.x2}
							y2={l.y2}
							stroke={isHovered ? "var(--color-fg)" : fills[l.edge]}
							strokeWidth={isHovered ? l.w + 3 : l.w}
							strokeLinecap="round"
						/>
					</g>
				);
			})}
			{dots.map((d) => (
				<circle
					key={d.v}
					cx={d.x}
					cy={d.y}
					r={dots.length > 120 ? 3 : 6}
					fill="var(--color-fg)"
					stroke="var(--color-bg)"
					strokeWidth={1.2}
				/>
			))}
			<text x={M} y={M - 8} className="fill-fg-muted font-mono" fontSize={17}>
				potential 1 — the source
			</text>
			<text x={M} y={H - M + 20} className="fill-fg-muted font-mono" fontSize={17}>
				potential 0 — the whole boundary, shorted to one node
			</text>
		</svg>
	);
}
