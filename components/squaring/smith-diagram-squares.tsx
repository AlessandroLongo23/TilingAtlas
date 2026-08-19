"use client";

import { useMemo } from "react";

// The Smith diagram, read back off a finished tiling instead of out of a solver.
//
// Every horizontal segment of the tiling is a node, placed at the height of its own potential and at
// the centre of the run of squares it carries; every square is a wire between the node under it and the
// node over it. Taking the layout from the tiling's own geometry is what keeps it legible — the diagram
// and the tiling then agree square for square, and a reader can check one against the other by eye.
//
// Shared by the genus-1 and hyperbolic stages, which is why it knows nothing about either: it takes a
// bare list of placed squares. The sphere keeps its own component, whose nodes carry pole markers this
// one has no use for.

export interface PlacedSquare {
	x: number;
	y: number;
	side: number;
	edge: number;
}

interface Props {
	squares: PlacedSquare[];
	fills: string[];
	hovered: number | null;
	onHover: (edge: number | null) => void;
	/** Drawn across the top and bottom when the picture is a cylinder rather than a torus. */
	caps?: boolean;
}

const SIZE = 1000;
const WIRE = 6;

export function SquaresSmithDiagram({ squares, fills, hovered, onHover, caps = false }: Props) {
	const { nodes, wires, project } = useMemo(() => {
		// A node per distinct height. Its horizontal extent is the union of the x-spans of every square
		// resting on it or hanging from it, which is exactly the horizontal segment in the tiling.
		const span = new Map<number, { lo: number; hi: number }>();
		const key = (y: number) => Math.round(y * 1e6) / 1e6;
		const touch = (y: number, lo: number, hi: number) => {
			const k = key(y);
			const cur = span.get(k);
			if (cur) {
				cur.lo = Math.min(cur.lo, lo);
				cur.hi = Math.max(cur.hi, hi);
			} else span.set(k, { lo, hi });
		};
		for (const q of squares) {
			touch(q.y, q.x, q.x + q.side);
			touch(q.y + q.side, q.x, q.x + q.side);
		}
		const nodeList = [...span.entries()].map(([y, v]) => ({ y, x: (v.lo + v.hi) / 2, lo: v.lo, hi: v.hi }));
		const at = new Map(nodeList.map((nd) => [nd.y, nd]));
		type Node = { y: number; x: number; lo: number; hi: number };
		const w: { a: Node; b: Node; edge: number }[] = [];
		for (const q of squares) {
			const a = at.get(key(q.y));
			const b = at.get(key(q.y + q.side));
			if (a && b) w.push({ a, b, edge: q.edge });
		}
		let minX = Infinity;
		let maxX = -Infinity;
		let minY = Infinity;
		let maxY = -Infinity;
		for (const nd of nodeList) {
			minX = Math.min(minX, nd.lo);
			maxX = Math.max(maxX, nd.hi);
			minY = Math.min(minY, nd.y);
			maxY = Math.max(maxY, nd.y);
		}
		const spanX = Math.max(maxX - minX, 1e-9);
		const spanY = Math.max(maxY - minY, 1e-9);
		const M = 60;
		const proj = (p: readonly [number, number]): [number, number] => [
			M + ((p[0] - minX) / spanX) * (SIZE - 2 * M),
			SIZE - M - ((p[1] - minY) / spanY) * (SIZE - 2 * M),
		];
		return { nodes: nodeList, wires: w, project: proj };
	}, [squares]);

	const order = wires.map((_, i) => i).sort((a, b) => Number(wires[a].edge === hovered) - Number(wires[b].edge === hovered));

	return (
		<svg
			viewBox={`0 0 ${SIZE} ${SIZE}`}
			className="h-full w-full"
			onPointerLeave={() => onHover(null)}
			role="img"
			aria-label="Smith diagram of the squaring"
		>
			{nodes.map((nd, i) => {
				const a = project([nd.lo, nd.y]);
				const b = project([nd.hi, nd.y]);
				const pole = caps && (i === 0 || i === nodes.length - 1);
				return (
					<line
						key={`n${i}`}
						x1={a[0]}
						y1={a[1]}
						x2={b[0]}
						y2={b[1]}
						stroke={pole ? "var(--color-fg)" : "var(--color-line)"}
						strokeWidth={pole ? 3 : 1.5}
						strokeDasharray={pole ? undefined : "4 5"}
						opacity={pole ? 0.8 : 0.6}
					/>
				);
			})}
			{order.map((idx) => {
				const w = wires[idx];
				const a = project([w.a.x, w.a.y]);
				const b = project([w.b.x, w.b.y]);
				const isHovered = w.edge === hovered;
				return (
					<g key={idx} onPointerEnter={() => onHover(w.edge)} style={{ cursor: "pointer" }}>
						<line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={16} />
						<line
							x1={a[0]}
							y1={a[1]}
							x2={b[0]}
							y2={b[1]}
							stroke={isHovered ? "var(--color-fg)" : fills[w.edge]}
							strokeWidth={isHovered ? WIRE + 3 : WIRE}
							strokeLinecap="round"
						/>
					</g>
				);
			})}
			{nodes.map((nd, i) => {
				const p = project([nd.x, nd.y]);
				return (
					<circle
						key={`d${i}`}
						cx={p[0]}
						cy={p[1]}
						r={nodes.length > 120 ? 4 : 8}
						fill="var(--color-fg)"
						stroke="var(--color-bg)"
						strokeWidth={2}
					/>
				);
			})}
		</svg>
	);
}
