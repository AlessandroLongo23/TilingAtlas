"use client";

import { useEffect, useRef, useState } from "react";
import { project } from "./stage-shared";

// A slowly turning wireframe of a solid, for the picker. Same projection as stage 1, so a row in the
// list and the figure it selects are recognisably the same object seen the same way.
//
// Turning matters more here than it looks: a still wireframe of a 26-vertex solid is a thicket of
// crossing lines, and depth-faded strokes alone do not separate front from back. Rotation does, for
// free, because motion parallax is what the eye actually reads three dimensions from.
//
// Two things keep 31 of these affordable:
//
//   One clock, not thirty-one. A single module-level rAF loop advances one shared angle and notifies
//   its subscribers; each thumbnail adds a fixed phase offset so they are not all in lockstep, which
//   would read as a page-wide wobble. Thirty-one independent rAF loops would each schedule their own
//   frame and land at slightly different times, for no benefit.
//
//   Only what is on screen. An IntersectionObserver unsubscribes a thumbnail that has scrolled out of
//   the picker — the list holds 31 and shows about eight — following the same discipline as
//   components/tiling-thumbnail.tsx, which lazily renders for the same reason.

const RADIANS_PER_SECOND = 0.28;
// Thumbnails do not need the display's full rate; a slow turn at ~24fps is indistinguishable from one
// at 120 and costs a fifth as many DOM writes across the whole list.
const FRAME_MS = 42;

type Subscriber = (angle: number) => void;
const subscribers = new Set<Subscriber>();
let clockFrame: number | null = null;
let angle = 0;
let lastTick = 0;

function startClock() {
	if (clockFrame !== null) return;
	lastTick = performance.now();
	let lastEmit = 0;
	const tick = (now: number) => {
		angle += ((now - lastTick) / 1000) * RADIANS_PER_SECOND;
		lastTick = now;
		if (now - lastEmit >= FRAME_MS) {
			lastEmit = now;
			for (const fn of subscribers) fn(angle);
		}
		clockFrame = requestAnimationFrame(tick);
	};
	clockFrame = requestAnimationFrame(tick);
}

function stopClock() {
	if (clockFrame === null || subscribers.size > 0) return;
	cancelAnimationFrame(clockFrame);
	clockFrame = null;
}

function useSharedSpin(active: boolean): number {
	const [value, setValue] = useState(angle);
	useEffect(() => {
		if (!active) return;
		const fn: Subscriber = (a) => setValue(a);
		subscribers.add(fn);
		startClock();
		return () => {
			subscribers.delete(fn);
			stopClock();
		};
	}, [active]);
	return value;
}

interface PolyhedronThumbProps {
	vertices: [number, number, number][];
	edges: [number, number][];
	size?: number;
	/** Stroke colour; defaults to the inherited text colour so it follows the row's own state. */
	tone?: string;
	/** A per-solid offset so neighbouring thumbnails are not all at the same angle. */
	phase?: number;
	/** Hold still — used where motion would be noise rather than information. */
	still?: boolean;
}

export function PolyhedronThumb({ vertices, edges, size = 64, tone, phase = 0, still = false }: PolyhedronThumbProps) {
	const host = useRef<HTMLDivElement | null>(null);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const el = host.current;
		if (!el) return;
		const io = new IntersectionObserver((entries) => setVisible(entries[0]?.isIntersecting ?? false), {
			rootMargin: "120px",
		});
		io.observe(el);
		return () => io.disconnect();
	}, []);

	const spin = useSharedSpin(visible && !still);
	const yaw = 0.6 + (still ? 0 : spin + phase);

	const projected = vertices.map((v) => project(v, yaw, 0.35));
	const r = size * 0.42;
	// Rounded before it reaches the DOM. Node and Chromium do not round Math.cos/Math.sin identically in
	// the last bit, so the server and the client serialise the same rotation as 17.205206141377392 and
	// 17.20520614137739 — enough to make React report a hydration mismatch on every thumbnail in the
	// picker. Two decimals is far more precision than a 54px wireframe can show.
	const at = (i: number) => ({
		x: Math.round((size / 2 + projected[i].x * r) * 100) / 100,
		y: Math.round((size / 2 + projected[i].y * r) * 100) / 100,
	});

	// Far edges first so near ones draw over them; depth also sets the weight, which is what reads as
	// three dimensions in a still frame and reinforces the parallax in a turning one.
	const ordered = edges
		.map(([a, b]) => ({ a, b, depth: (projected[a].depth + projected[b].depth) / 2 }))
		.sort((p, q) => p.depth - q.depth);

	return (
		<div ref={host} className="shrink-0" style={{ width: size, height: size }}>
			<svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
				{ordered.map(({ a, b, depth }) => {
					const p = at(a);
					const q = at(b);
					const front = (depth + 1) / 2;
					return (
						<line
							key={`${a}-${b}`}
							x1={p.x}
							y1={p.y}
							x2={q.x}
							y2={q.y}
							stroke={tone ?? "currentColor"}
							strokeOpacity={Math.round((0.3 + front * 0.6) * 1000) / 1000}
							strokeWidth={Math.round((0.6 + front * 1.1) * 1000) / 1000}
							strokeLinecap="round"
						/>
					);
				})}
			</svg>
		</div>
	);
}
