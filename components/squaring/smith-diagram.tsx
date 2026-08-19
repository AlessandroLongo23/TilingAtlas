"use client";

import { useMemo } from "react";
import { squareFills } from "@/lib/squaring/squaringSvg";
import type { PipelineRecord } from "@/lib/squaring/shelf";
import { edgeKey, ratio } from "./stage-shared";
import { FigureCaption } from "./stage-board";

// Stage 3: the circuit as a graph, laid out where the tiling puts it and painted in the tiling's own
// colours.
//
// Both coordinates come from the squaring, which is what keeps it untangled:
//   y — the node's voltage, which is the height of the horizontal segment it stands for.
//   x — the CENTRE of that segment, recovered from the squares touching it. This is the stream
//       function doing its job; it is the honest horizontal coordinate, and an earlier version that
//       borrowed x from the Tutte embedding instead produced a tangle with the current labels piled on
//       top of each other, because that coordinate has nothing to do with the circuit.
//
// Every wire is a plain line of the same weight, running from the higher node to the lower one. An
// earlier version tapered each one and scaled its width by the current it carried; that made the big
// currents shout and the small ones nearly invisible, and it was redundant besides, since the current
// is already written on the wire and already drawn as the size of a tile in stage 4.
//
// The colour is the point of the stage. Every wire is painted in the exact fill its square has in stage
// 4 (one shared ramp, see lib/squaring/squaringSvg.ts), so the correspondence needs no caption: the
// reader finds the green line, looks right, and there is the green tile.

interface SmithDiagramProps {
	record: PipelineRecord;
	size?: number;
	hovered: string | null;
	onHover: (key: string | null) => void;
}

const SIZE = 1000;
const LABEL = 28;
/** Every wire the same weight: the current is written on it, not encoded in its thickness. */
const WIRE = 6;

export function SmithDiagram({ record, size = SIZE, hovered, onHover }: SmithDiagramProps) {
	const layout = useMemo(() => {
		const width = record.squaring.width;
		const height = record.squaring.height;
		const canvasH = ratio(height, width) * size;
		const fills = squareFills(record.squaring);

		// A node's segment: the union of the x-spans of every square touching it. Its centre is the node.
		const span = new Map<number, { lo: bigint; hi: bigint }>();
		for (const s of record.squaring.squares) {
			const lo = BigInt(s.x);
			const hi = lo + BigInt(s.side);
			for (const v of s.edge) {
				const cur = span.get(v);
				if (!cur) span.set(v, { lo, hi });
				else span.set(v, { lo: cur.lo < lo ? cur.lo : lo, hi: cur.hi > hi ? cur.hi : hi });
			}
		}

		const at = (v: number) => {
			const s = span.get(v);
			const y = canvasH - ratio(record.potential[v], height) * canvasH;
			if (!s) return { x: size / 2, y };
			return { x: (ratio(s.lo.toString(), width) + ratio(s.hi.toString(), width)) * 0.5 * size, y };
		};

		const nodes = record.vertices.map((_, v) => at(v));

		const wires = record.squaring.squares.map((s, i) => {
			// The square's top edge sits on the higher node, its bottom edge on the lower one.
			const top = BigInt(s.y) + BigInt(s.side);
			const hi = s.edge[0] !== undefined && record.potential[s.edge[0]] === top.toString() ? s.edge[0] : s.edge[1];
			const lo = hi === s.edge[0] ? s.edge[1] : s.edge[0];
			return { key: edgeKey(s.edge[0], s.edge[1]), a: nodes[hi], b: nodes[lo], fill: fills[i], label: s.side };
		});

		// Zero-current wires join two nodes at the same voltage, so they lie flat. Their segments are
		// disjoint (they are different segments at one height), so there is a real line to draw.
		const flats = record.currents
			.filter((c) => BigInt(c.value) === 0n)
			.map((c) => ({ key: edgeKey(c.from, c.to), a: nodes[c.from], b: nodes[c.to] }));

		return { canvasH, nodes, wires, flats };
	}, [record, size]);

	const [pos, neg] =
		BigInt(record.potential[record.battery[0]]) >= BigInt(record.potential[record.battery[1]])
			? record.battery
			: [record.battery[1], record.battery[0]];
	const batteryKey = edgeKey(record.battery[0], record.battery[1]);
	const bow = size * 0.16;

	return (
		<div className="flex h-full min-h-0 w-full flex-col gap-2">
			<svg
				// The poles sit exactly at y = 0 and y = canvasH, so the +/− labels live outside the
				// tiling's own box and the vertical margin has to make room for them.
				viewBox={`${-bow - 14} -48 ${size + bow + 30} ${layout.canvasH + 96}`}
				className="min-h-0 w-full flex-1"
				onPointerLeave={() => onHover(null)}
				role="img"
				aria-label="The Smith diagram: the circuit drawn where the tiling puts it, in the tiling's colours"
			>
				<path
					d={`M ${layout.nodes[pos].x} ${layout.nodes[pos].y} C ${-bow} ${layout.nodes[pos].y}, ${-bow} ${layout.nodes[neg].y}, ${layout.nodes[neg].x} ${layout.nodes[neg].y}`}
					fill="none"
					stroke="var(--color-accent)"
					strokeWidth={hovered === batteryKey ? 7 : 4.5}
					strokeDasharray="15 10"
					strokeLinecap="round"
					onPointerEnter={() => onHover(batteryKey)}
					style={{ cursor: "pointer" }}
				/>

				{layout.flats.map((f) => (
					<line
						key={f.key}
						x1={f.a.x}
						y1={f.a.y}
						x2={f.b.x}
						y2={f.b.y}
						stroke="var(--color-fg-muted)"
						strokeOpacity={hovered === f.key ? 1 : 0.4}
						strokeWidth={hovered === f.key ? 5 : 2.5}
						strokeDasharray="7 7"
						onPointerEnter={() => onHover(f.key)}
						style={{ cursor: "pointer" }}
					/>
				))}

				{layout.wires.map((w) => {
					const isHovered = w.key === hovered;
					return (
						<line
							key={w.key}
							x1={w.a.x}
							y1={w.a.y}
							x2={w.b.x}
							y2={w.b.y}
							stroke={w.fill}
							strokeOpacity={hovered === null || isHovered ? 1 : 0.3}
							strokeWidth={isHovered ? WIRE * 1.9 : WIRE}
							strokeLinecap="round"
							onPointerEnter={() => onHover(w.key)}
							style={{ cursor: "pointer" }}
						/>
					);
				})}

				{layout.nodes.map((n, i) => (
					<circle
						key={i}
						cx={n.x}
						cy={n.y}
						r={i === pos || i === neg ? 11 : 7}
						fill={i === pos || i === neg ? "var(--color-accent)" : "var(--color-fg)"}
						stroke="var(--color-surface-raised)"
						strokeWidth={2.5}
					/>
				))}

				{layout.wires.map((w) => {
					const isHovered = w.key === hovered;
					const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
					// A wire's length is its current, so the big numbers always have room and the small ones
					// step aside until hovered. Self-balancing, which is why no collision pass is needed.
					if (len < LABEL * 1.5 && !isHovered) return null;
					return (
						<text
							key={w.key}
							x={(w.a.x + w.b.x) / 2}
							y={(w.a.y + w.b.y) / 2}
							textAnchor="middle"
							dominantBaseline="central"
							fontSize={isHovered ? LABEL * 1.3 : LABEL}
							className="pointer-events-none fill-fg font-mono"
							opacity={hovered === null || isHovered ? 1 : 0.3}
							paintOrder="stroke"
							stroke="var(--color-surface-raised)"
							strokeWidth={8}
						>
							{w.label}
						</text>
					);
				})}

				{/* Beside their own nodes, not pinned to the frame: the poles are wherever the tiling's top
				    and bottom segments are, and the labels should point at them. */}
				<text
					x={layout.nodes[pos].x}
					y={layout.nodes[pos].y - 20}
					textAnchor="middle"
					fontSize={LABEL * 1.2}
					className="fill-fg font-mono"
				>
					+
				</text>
				<text
					x={layout.nodes[neg].x}
					y={layout.nodes[neg].y + 30}
					textAnchor="middle"
					fontSize={LABEL * 1.2}
					className="fill-fg font-mono"
				>
					−
				</text>
			</svg>
			<FigureCaption>
				each wire is a square, in its own colour · height is voltage
				{record.squaring.degenerate > 0 ? ` · ${record.squaring.degenerate} zero-current wire(s) dashed` : ""}
			</FigureCaption>
		</div>
	);
}
