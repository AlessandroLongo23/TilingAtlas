"use client";

import { useEffect, useRef, useState } from "react";
import type { PipelineRecord } from "@/lib/squaring/shelf";
import { FigureControls } from "./stage-board";
import { edgeKey, project, voltageColor, ratio } from "./stage-shared";

// Stage 1: the solid itself, as a rotatable wireframe.
//
// Hand-rolled SVG projection instead of the atlas's three.js sphere (lib/render/sphericalScene.ts),
// for one reason that decides it: that renderer draws the tiling procedurally in a fragment shader over
// a sphere, so there is no way to pick out ONE edge and say "this is the battery". Here the battery
// edge is the whole point of the picture — it is the single choice the entire construction depends on,
// and a different edge gives a different rectangle.
//
// Being SVG also means no WebGL context. The pipeline page shows four stages side by side and the
// library grid already competes for the browser's ~16 contexts (see components/spherical-thumbnail.tsx,
// which shares one renderer across every thumbnail for exactly this reason).
//
// Hidden lines are handled by depth, not by occlusion: edges behind the solid are drawn thinner and
// faded instead of removed. A wireframe you can see through is easier to follow when what you are
// tracking is one specific edge, and the atlas is drawing skeletons here, not solids.

interface PolyhedronWireProps {
	record: PipelineRecord;
	size?: number;
	hovered: string | null;
	onHover: (key: string | null) => void;
	/** Clicking an edge makes it the battery, and the whole pipeline re-solves for that choice. */
	onPickBattery?: (edge: [number, number]) => void;
	/**
	 * Drop the caption row. For the article's figures, where the solid is an inset next to the metadata
	 * and there is no width for "drag to rotate · click an edge to make it the battery" — the idle spin
	 * says it is live, and the pipeline page is where the controls are worth explaining.
	 */
	compact?: boolean;
}

const SIZE = 340;

export function PolyhedronWire({ record, size = SIZE, hovered, onHover, onPickBattery, compact = false }: PolyhedronWireProps) {
	const [yaw, setYaw] = useState(0.6);
	const [pitch, setPitch] = useState(0.35);
	const [spinning, setSpinning] = useState(true);
	const drag = useRef<{ x: number; y: number } | null>(null);
	const frame = useRef<number | null>(null);
	// A rotate-drag ends with a pointerup over some edge, which would otherwise read as a click on it.
	// Only a press that never moved counts as picking an edge.
	const moved = useRef(false);

	useEffect(() => {
		if (!spinning) return;
		let last = performance.now();
		const tick = (now: number) => {
			const dt = (now - last) / 1000;
			last = now;
			setYaw((y) => y + dt * 0.35);
			frame.current = requestAnimationFrame(tick);
		};
		frame.current = requestAnimationFrame(tick);
		return () => {
			if (frame.current !== null) cancelAnimationFrame(frame.current);
		};
	}, [spinning]);

	const height = BigInt(record.squaring.height) === 0n ? "1" : record.squaring.height;
	const projected = record.vertices.map((v) => project(v, yaw, pitch));
	const radius = size * 0.38;
	const at = (i: number) => ({
		x: size / 2 + projected[i].x * radius,
		y: size / 2 + projected[i].y * radius,
	});

	const batteryKey = edgeKey(record.battery[0], record.battery[1]);
	// Painter's algorithm: far edges first, so near ones overdraw them.
	const ordered = record.edges
		.map(([a, b]) => ({ a, b, depth: (projected[a].depth + projected[b].depth) / 2 }))
		.sort((p, q) => p.depth - q.depth);

	return (
		<div className="flex h-full min-h-0 w-full flex-col gap-2">
			<svg
				viewBox={`0 0 ${size} ${size}`}
				className="min-h-0 w-full flex-1 cursor-grab touch-none select-none active:cursor-grabbing"
				onPointerDown={(e) => {
					drag.current = { x: e.clientX, y: e.clientY };
					moved.current = false;
					setSpinning(false);
					(e.target as Element).setPointerCapture?.(e.pointerId);
				}}
				onPointerMove={(e) => {
					if (!drag.current) return;
					const dx = e.clientX - drag.current.x;
					const dy = e.clientY - drag.current.y;
					if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
					setYaw((y) => y + dx * 0.01);
					setPitch((p) => Math.max(-1.4, Math.min(1.4, p + dy * 0.01)));
					drag.current = { x: e.clientX, y: e.clientY };
				}}
				onPointerUp={() => {
					drag.current = null;
				}}
				onPointerLeave={() => {
					drag.current = null;
					onHover(null);
				}}
				role="img"
				aria-label={`${record.name}, rotatable wireframe with the battery edge marked`}
			>
				{ordered.map(({ a, b, depth }) => {
					const key = edgeKey(a, b);
					const isBattery = key === batteryKey;
					const isHovered = key === hovered;
					const p = at(a);
					const q = at(b);
					// Depth runs about -1..1 on the unit sphere; map it to a visibility weight.
					const front = (depth + 1) / 2;
					return (
						<line
							key={key}
							x1={p.x}
							y1={p.y}
							x2={q.x}
							y2={q.y}
							stroke={
								isBattery
									? "var(--color-accent)"
									: isHovered
										? "var(--color-fg)"
										: "var(--color-fg-muted)"
							}
							strokeOpacity={isBattery || isHovered ? 1 : 0.25 + front * 0.55}
							strokeWidth={isBattery ? 4 : isHovered ? 3.5 : 1 + front * 1.4}
							strokeDasharray={isBattery ? "7 4" : undefined}
							strokeLinecap="round"
							onPointerEnter={() => onHover(key)}
							onClick={() => {
								if (!moved.current && !isBattery) onPickBattery?.([Math.min(a, b), Math.max(a, b)]);
							}}
							style={{ cursor: isBattery ? "default" : "pointer" }}
						/>
					);
				})}
				{record.vertices.map((_, i) => {
					const p = at(i);
					const t = ratio(record.potential[i], height);
					const isPole = i === record.battery[0] || i === record.battery[1];
					return (
						<circle
							key={i}
							cx={p.x}
							cy={p.y}
							r={isPole ? 6.5 : 4}
							fill={voltageColor(t)}
							stroke="var(--color-surface-raised)"
							strokeWidth={isPole ? 2.5 : 1.5}
						/>
					);
				})}
			</svg>
			{compact ? null : (
				<FigureControls>
					<span className="truncate font-mono text-[10px] text-fg-muted">
						drag to rotate · click an edge to make it the battery
					</span>
					<button
						type="button"
						onClick={() => setSpinning((s) => !s)}
						className="border border-line px-2 py-0.5 text-[10px] text-fg-muted transition-colors hover:text-fg"
					>
						{spinning ? "pause" : "spin"}
					</button>
				</FigureControls>
			)}
		</div>
	);
}
