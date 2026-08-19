"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { relaxStep } from "@/lib/squaring/tutte";
import type { PipelineRecord } from "@/lib/squaring/shelf";
import { FigureControls } from "./stage-board";
import { edgeKey, project, voltageColor, ratio } from "./stage-shared";

// Stage 2: the graph pulled flat by springs, which is Tutte's 1963 method.
//
// The simulation is not a decoration over a precomputed answer. Rest-length-zero springs with the outer
// face pinned converge to the barycentric embedding, and that embedding IS the flat drawing; letting it
// run is a legitimate way to compute it. The build solves the same system directly
// (lib/squaring/tutte.ts) and the two agree, which is the check drawn as the "settled" marker below.
//
// The starting position is the SQUASHED SOLID: stage 1's vertices projected straight down onto the
// plane, fold-overs and all. That is deliberate and it is the one thing that makes the stage legible as
// a continuation of the previous one, since the mess it begins from is visibly the polyhedron the
// reader was just rotating. Tutte's theorem is what promises the fold-overs come out: for a 3-connected
// planar graph the equilibrium has no crossings at all and every face is convex.

interface TutteSpringsProps {
	record: PipelineRecord;
	size?: number;
	hovered: string | null;
	onHover: (key: string | null) => void;
	/** Clicking an edge makes it the battery, and the whole pipeline re-solves for that choice. */
	onPickBattery?: (edge: [number, number]) => void;
}

const SIZE = 340;
const SETTLED = 1e-4;

export function TutteSprings({ record, size = SIZE, hovered, onHover, onPickBattery }: TutteSpringsProps) {
	const adjacency = useMemo(() => {
		const adj: Set<number>[] = Array.from({ length: record.vertices.length }, () => new Set<number>());
		for (const [a, b] of record.edges) {
			adj[a].add(b);
			adj[b].add(a);
		}
		return adj;
	}, [record]);

	const pinned = useMemo(() => new Set(record.outerFace), [record]);

	// The squashed solid: the 3D vertices seen from the same angle stage 1 opens at, flattened.
	const squashed = useCallback((): [number, number][] => {
		const start: [number, number][] = record.vertices.map((v) => {
			const p = project(v, 0.6, 0.35);
			return [p.x, p.y];
		});
		// The pinned ring goes straight to its final circle; everything else starts where it fell.
		record.outerFace.forEach((v, i) => {
			const angle = (2 * Math.PI * i) / record.outerFace.length + Math.PI / 2;
			start[v] = [Math.cos(angle), Math.sin(angle)];
		});
		return start;
	}, [record]);

	const [positions, setPositions] = useState<[number, number][]>(squashed);
	const [running, setRunning] = useState(true);
	const [settled, setSettled] = useState(false);
	const state = useRef<{ pos: [number, number][]; vel: [number, number][] } | null>(null);
	const frame = useRef<number | null>(null);

	const reset = useCallback(() => {
		const pos = squashed();
		state.current = { pos, vel: pos.map(() => [0, 0] as [number, number]) };
		setPositions(pos.map((p) => [p[0], p[1]]));
		setSettled(false);
		setRunning(true);
	}, [squashed]);

	// A new polyhedron restarts the simulation from its own squashed state.
	useEffect(() => {
		reset();
	}, [reset]);

	useEffect(() => {
		if (!running) return;
		const tick = () => {
			const s = state.current;
			if (!s) return;
			// ONE physics step per frame. The relaxation is cheap enough at these sizes to run several,
			// and it originally did, which made the whole thing settle in well under a second — far too
			// fast to see the fold-overs come out, which is the part worth watching. The pacing lives in
			// the step size and damping (lib/squaring/tutte.ts), not in how many steps are crammed into
			// a frame.
			const residual = relaxStep(s.pos, s.vel, adjacency, (v) => pinned.has(v));
			setPositions(s.pos.map((p) => [p[0], p[1]]));
			if (residual < SETTLED) {
				setSettled(true);
				setRunning(false);
				return;
			}
			frame.current = requestAnimationFrame(tick);
		};
		frame.current = requestAnimationFrame(tick);
		return () => {
			if (frame.current !== null) cancelAnimationFrame(frame.current);
		};
	}, [running, adjacency, pinned]);

	const height = BigInt(record.squaring.height) === 0n ? "1" : record.squaring.height;
	const radius = size * 0.4;
	const at = (i: number) => ({
		x: size / 2 + (positions[i]?.[0] ?? 0) * radius,
		y: size / 2 + (positions[i]?.[1] ?? 0) * radius,
	});
	const batteryKey = edgeKey(record.battery[0], record.battery[1]);

	// How far the live simulation still is from the directly-solved equilibrium. Shown once settled,
	// because the number is the evidence that the springs and the linear solve agree.
	const drift = settled
		? Math.max(
				...record.tutte.map((t, i) => Math.hypot(t[0] - (positions[i]?.[0] ?? 0), t[1] - (positions[i]?.[1] ?? 0))),
			)
		: null;

	return (
		<div className="flex h-full min-h-0 w-full flex-col gap-2">
			<svg
				viewBox={`0 0 ${size} ${size}`}
				className="min-h-0 w-full flex-1"
				onPointerLeave={() => onHover(null)}
				role="img"
				aria-label="The graph relaxing into Tutte's barycentric embedding"
			>
				<polygon
					points={record.outerFace.map((v) => `${at(v).x},${at(v).y}`).join(" ")}
					fill="var(--color-surface-overlay)"
					fillOpacity={0.35}
					stroke="var(--color-line)"
					strokeWidth={1.5}
				/>
				{record.edges.map(([a, b]) => {
					const key = edgeKey(a, b);
					const isBattery = key === batteryKey;
					const isHovered = key === hovered;
					const p = at(a);
					const q = at(b);
					return (
						<line
							key={key}
							x1={p.x}
							y1={p.y}
							x2={q.x}
							y2={q.y}
							stroke={
								isBattery ? "var(--color-accent)" : isHovered ? "var(--color-fg)" : "var(--color-fg-muted)"
							}
							strokeOpacity={isBattery || isHovered ? 1 : 0.5}
							strokeWidth={isBattery ? 3.5 : isHovered ? 3.5 : 1.4}
							strokeDasharray={isBattery ? "7 4" : undefined}
							strokeLinecap="round"
							onPointerEnter={() => onHover(key)}
							onClick={() => {
								if (!isBattery) onPickBattery?.([Math.min(a, b), Math.max(a, b)]);
							}}
							style={{ cursor: isBattery ? "default" : "pointer" }}
						/>
					);
				})}
				{record.vertices.map((_, i) => {
					const p = at(i);
					const isPole = i === record.battery[0] || i === record.battery[1];
					return (
						<circle
							key={i}
							cx={p.x}
							cy={p.y}
							r={isPole ? 6 : pinned.has(i) ? 4.5 : 3.5}
							fill={voltageColor(ratio(record.potential[i], height))}
							stroke={pinned.has(i) ? "var(--color-fg)" : "var(--color-surface-raised)"}
							strokeWidth={pinned.has(i) ? 1.8 : 1.4}
						/>
					);
				})}
			</svg>
			<FigureControls>
				<span className="truncate font-mono text-[10px] leading-tight text-fg-muted">
					{settled
						? `settled · ${drift !== null && drift < 0.01 ? "matches the direct solve" : "relaxed"} · click an edge`
						: "springs relaxing…"}
				</span>
				<button
					type="button"
					onClick={reset}
					className="shrink-0 border border-line px-2 py-0.5 text-[10px] text-fg-muted transition-colors hover:text-fg"
				>
					replay
				</button>
			</FigureControls>
		</div>
	);
}
