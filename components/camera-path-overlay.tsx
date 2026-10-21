"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { motion, useReducedMotion } from "motion/react";

import { useAnimation, type TimelineKey } from "@/stores/animation";
import type { CameraDriver, Pose, Projected } from "@/lib/render/cameraPose";

// The animation's camera path, drawn over the /play canvas while the timeline is open. Each keyframe is
// a diamond at the centre of its frame, numbered, and the line between two diamonds is the path the frame
// centre travels: a curve of the plane, an arc of the disk, an arc across the sphere. Both are handles:
// drag a diamond to re-centre that keyframe, drag the dot halfway along a move to bend it (double-click
// the dot to straighten it); click the dot to open the move's speed curve. The selected keyframe also
// shows its frame where the geometry has one to show.
//
// Everything is stored in world coordinates and projected through the live camera every frame by the
// geometry's driver, so the path stays pinned to the pattern while you move around it. On the sphere the
// part of the path on the far side is drawn faint and dashed, and a keyframe behind the sphere cannot be
// grabbed until you turn it into view.

const SAMPLES = 48;

type Drag = {
	kind: "key" | "bend" | "roll";
	id: number;
	moved: boolean;
	x0: number;
	y0: number;
	/** A roll drag's starting pose, pointer angle and the screen turn one degree of `rotate` gives. */
	base?: Pose;
	a0?: number;
	perDeg?: number;
};

/** Snap radius for a keyframe's centre (screen px), and for its roll (degrees). */
const SNAP_PX = 14;
const SNAP_DEG = 6;
const wrapDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** A sampled path as SVG subpaths, split where it passes behind the sphere. */
function runs(pts: Projected[]): { d: string; front: boolean }[] {
	const out: { d: string; front: boolean }[] = [];
	let cur: Projected[] = [];
	const flush = () => {
		if (cur.length > 1)
			out.push({ d: cur.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" "), front: cur[0].front });
	};
	for (const p of pts) {
		if (cur.length && cur[cur.length - 1].front !== p.front) {
			flush();
			cur = [cur[cur.length - 1], p]; // overlap one point so the runs meet
		} else cur.push(p);
	}
	flush();
	return out;
}

export function CameraPathOverlay({
	driver,
	keys,
	snap,
	visible,
	closeTo,
	selected,
	onSelect,
	onSelectSegment,
	onMoved,
}: {
	driver: CameraDriver;
	keys: TimelineKey[];
	/** Snap dragged keyframes to the tiling's points of interest and their roll to its directions. */
	snap: boolean;
	/** Fades the overlay in and out with the timeline. */
	visible: boolean;
	/** The pose the loop closes on, when the timeline loops. */
	closeTo?: Pose;
	selected: number | null;
	/** A diamond was clicked, not dragged. */
	onSelect: (id: number) => void;
	/** A move's dot was clicked, not dragged: open its speed curve. */
	onSelectSegment: (id: number) => void;
	/** A diamond drag ended: the keyframe's pose changed. */
	onMoved: (id: number) => void;
}) {
	const svgRef = useRef<SVGSVGElement | null>(null);
	const reduce = useReducedMotion();
	const [cam, setCam] = useState<{ p: Pose | null; w: number; h: number }>({ p: null, w: 0, h: 0 });
	// What a drag is snapped to, for the cue: a point, or an axis through the keyframe's centre.
	const [hint, setHint] = useState<{ x: number; y: number; axis?: number } | null>(null);

	// Cameras are mutated in place by their draw loops, never through React, so the live pose is polled
	// per frame and the overlay re-renders only when it moved.
	useEffect(() => {
		let raf = 0;
		let prev = "";
		const loop = () => {
			const p = driver.read();
			const el = svgRef.current;
			const w = el?.clientWidth ?? 0,
				h = el?.clientHeight ?? 0;
			const sig = `${JSON.stringify(p, (_, v) => (typeof v === "number" ? +v.toFixed(5) : v))} ${w} ${h}`;
			if (sig !== prev) {
				prev = sig;
				setCam({ p, w, h });
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [driver]);

	const live = cam.p;
	const { model } = driver;
	const segs = keys.flatMap((k, i) => {
		const to = keys[i + 1]?.view ?? closeTo;
		return to ? [{ key: k, from: k.view, to }] : [];
	});

	const drag = useRef<Drag | null>(null);
	/** The screen direction of a pose's "up", under the live camera: where its roll knob points. */
	const upAngle = (p: Pose, livePose: Pose) => {
		const c = driver.project(livePose, model.centre(p));
		const u = driver.unproject(p, cam.w / 2, cam.h / 2 - 0.12 * Math.min(cam.w, cam.h));
		if (!u) return null;
		const s = driver.project(livePose, u);
		return (Math.atan2(s.y - c.y, s.x - c.x) * 180) / Math.PI;
	};
	const startRoll = (e: ReactPointerEvent, k: TimelineKey) => {
		const livePose = driver.read();
		const r = svgRef.current?.getBoundingClientRect();
		if (!livePose || !r) return;
		down(e, "roll", k.id);
		// Which way, and how far on screen, the pose's own rotate() turns it: the models differ in sign.
		const a = upAngle(k.view, livePose),
			b = upAngle(model.rotate(k.view, 5), livePose);
		const c = driver.project(livePose, model.centre(k.view));
		drag.current = {
			...drag.current!,
			base: k.view,
			a0: (Math.atan2(e.clientY - r.top - c.y, e.clientX - r.left - c.x) * 180) / Math.PI,
			perDeg: a === null || b === null ? 1 : wrapDeg(b - a) / 5 || 1,
		};
	};
	const down = (e: ReactPointerEvent, kind: Drag["kind"], id: number) => {
		e.stopPropagation();
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		drag.current = { kind, id, moved: false, x0: e.clientX, y0: e.clientY };
	};
	const move = (e: ReactPointerEvent) => {
		const d = drag.current;
		if (!d) return;
		if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 3) d.moved = true;
		const st = useAnimation.getState();
		const r = svgRef.current?.getBoundingClientRect();
		const livePose = driver.read();
		if (!d.moved || !r || !livePose) return;
		const px = e.clientX - r.left,
			py = e.clientY - r.top;
		const snapping = snap && !e.altKey;
		if (d.kind === "roll") {
			const k = st.keys.find((q) => q.id === d.id);
			if (!k || !d.base) return;
			const c = driver.project(livePose, model.centre(d.base));
			let turn = wrapDeg((Math.atan2(py - c.y, px - c.x) * 180) / Math.PI - d.a0!);
			let axis: number | undefined;
			if (snapping) {
				// The directions from the keyframe's centre to the features around it, on its own screen:
				// a turn that lays one along a screen axis (an edge level, a vertex straight up) catches.
				const { w: W, h: H } = { w: cam.w, h: cam.h };
				let best = SNAP_DEG;
				for (const f of driver.snapCandidates(model.centre(d.base))) {
					const s = driver.project(d.base, f);
					const dist = Math.hypot(s.x - W / 2, s.y - H / 2);
					if (!s.front || dist < 6 || dist > 0.45 * Math.min(W, H)) continue;
					const a = (Math.atan2(s.y - H / 2, s.x - W / 2) * 180) / Math.PI;
					for (const target of [0, 90, 180, -90]) {
						const t = wrapDeg(target - a);
						if (Math.abs(wrapDeg(t - turn)) < best) {
							best = Math.abs(wrapDeg(t - turn));
							turn = t;
							axis = target;
						}
					}
				}
			}
			st.setKeyView(d.id, model.rotate(d.base, turn / d.perDeg!));
			setHint(axis === undefined ? null : { x: c.x, y: c.y, axis });
			return;
		}
		let w = driver.unproject(livePose, px, py);
		if (!w) return;
		let snapped: { x: number; y: number } | null = null;
		if (snapping) {
			let best = SNAP_PX;
			for (const f of driver.snapCandidates(w)) {
				const s = driver.project(livePose, f);
				const dd = Math.hypot(s.x - px, s.y - py);
				if (s.front && dd < best) {
					best = dd;
					w = f;
					snapped = s;
				}
			}
		}
		setHint(snapped);
		if (d.kind === "key") {
			const k = st.keys.find((q) => q.id === d.id);
			if (k) st.setKeyView(d.id, model.withCentre(k.view, w));
		} else {
			const s = segs.find((q) => q.key.id === d.id);
			if (s) st.setBend(d.id, model.bendThrough(s.from, s.to, w));
		}
	};
	const up = () => {
		const d = drag.current;
		drag.current = null;
		setHint(null);
		if (d?.kind === "roll") onMoved(d.id);
		if (d?.kind === "key") (d.moved ? onMoved : onSelect)(d.id);
		if (d?.kind === "bend" && !d.moved) onSelectSegment(d.id);
	};

	if (!live) return <svg ref={svgRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
	const proj = (p: Pose) => driver.project(live, model.centre(p));

	// The selected keyframe's frame: its screen's corners pulled back to the world and shown through the
	// live camera. Only the plane has its corners on the surface; the disk and the sphere show none.
	const sel = keys.find((k) => k.id === selected);
	const corners = sel
		? [
				[0, 0],
				[cam.w, 0],
				[cam.w, cam.h],
				[0, cam.h],
			].map(([x, y]) => driver.unproject(sel.view, x, y))
		: [];
	const frame =
		corners.length && corners.every(Boolean)
			? corners.map((c) => driver.project(live, c!)).map((s) => `${s.x},${s.y}`)
			: null;

	const diamond = (c: { x: number; y: number }, r: number) =>
		`M${c.x},${c.y - r} L${c.x + r},${c.y} L${c.x},${c.y + r} L${c.x - r},${c.y} Z`;
	const closing = closeTo && keys.length ? proj(closeTo) : null;

	return (
		<motion.svg
			ref={svgRef}
			data-camera-path
			className="pointer-events-none absolute inset-0 z-[12] h-full w-full"
			aria-hidden
			initial={{ opacity: 0 }}
			animate={{ opacity: visible ? 1 : 0 }}
			transition={{ duration: reduce ? 0 : 0.3, ease: [0.2, 0, 0, 1] }}
		>
			{frame ? (
				<polygon
					points={frame.join(" ")}
					fill="none"
					stroke="white"
					strokeWidth={1.5}
					strokeDasharray="6 4"
					style={{ filter: "drop-shadow(0 0 1px rgb(0 0 0 / .8))" }}
				/>
			) : null}

			{segs.map(({ key, from, to }) => {
				const pts = Array.from({ length: SAMPLES + 1 }, (_, i) => proj(model.segment(from, to, key.bend, i / SAMPLES)));
				const mid = pts[SAMPLES / 2];
				const isClosing = to === closeTo && !keys.some((k) => k.view === to);
				return (
					<g key={key.id}>
						{runs(pts).map((r, i) => (
							<g key={i} opacity={r.front ? 1 : 0.35}>
								<path d={r.d} fill="none" stroke="rgb(0 0 0 / .55)" strokeWidth={4} />
								<path
									d={r.d}
									fill="none"
									stroke="white"
									strokeWidth={2}
									strokeDasharray={isClosing || !r.front ? "5 4" : undefined}
								/>
							</g>
						))}
						<circle
							cx={mid.x}
							cy={mid.y}
							r={7}
							opacity={mid.front ? 1 : 0.35}
							className={(mid.front ? "pointer-events-auto " : "") + "cursor-move fill-white stroke-accent"}
							strokeWidth={key.bend ? 3 : 2}
							onPointerDown={(e) => down(e, "bend", key.id)}
							onPointerMove={move}
							onPointerUp={up}
							onDoubleClick={() => useAnimation.getState().setBend(key.id, null)}
						>
							<title>Drag to bend this move; double-click to straighten it; click for its speed curve</title>
						</circle>
					</g>
				);
			})}

			{sel && live
				? (() => {
						const c = proj(sel.view);
						const a = upAngle(sel.view, live);
						if (!c.front || a === null) return null;
						const k = { x: c.x + 42 * Math.cos((a * Math.PI) / 180), y: c.y + 42 * Math.sin((a * Math.PI) / 180) };
						return (
							<g>
								<line x1={c.x} y1={c.y} x2={k.x} y2={k.y} stroke="white" strokeWidth={1.5} />
								<circle
									cx={k.x}
									cy={k.y}
									r={6}
									className="pointer-events-auto cursor-grab fill-accent"
									stroke="white"
									strokeWidth={2}
									onPointerDown={(e) => startRoll(e, sel)}
									onPointerMove={move}
									onPointerUp={up}
								>
									<title>Drag to turn this keyframe (Alt: no snapping)</title>
								</circle>
							</g>
						);
					})()
				: null}

			{hint ? (
				hint.axis === undefined ? (
					<circle cx={hint.x} cy={hint.y} r={16} fill="none" className="stroke-accent" strokeWidth={2} />
				) : (
					<line
						x1={hint.x - 60 * Math.cos((hint.axis * Math.PI) / 180)}
						y1={hint.y - 60 * Math.sin((hint.axis * Math.PI) / 180)}
						x2={hint.x + 60 * Math.cos((hint.axis * Math.PI) / 180)}
						y2={hint.y + 60 * Math.sin((hint.axis * Math.PI) / 180)}
						className="stroke-accent"
						strokeWidth={1.5}
						strokeDasharray="4 3"
					/>
				)
			) : null}

			{closing ? (
				<path
					d={diamond(closing, 8)}
					fill="none"
					stroke="white"
					strokeWidth={2}
					strokeDasharray="3 3"
					opacity={closing.front ? 1 : 0.35}
				/>
			) : null}

			{keys.map((k, i) => {
				const c = proj(k.view);
				return (
					<g key={k.id} opacity={c.front ? 1 : 0.35}>
						<path
							d={diamond(c, 11)}
							className={
								(c.front ? "pointer-events-auto cursor-grab active:cursor-grabbing " : "") +
								(k.id === selected ? "fill-accent" : "fill-fg-muted")
							}
							stroke="white"
							strokeWidth={2}
							onPointerDown={(e) => down(e, "key", k.id)}
							onPointerMove={move}
							onPointerUp={up}
						>
							<title>Keyframe {i + 1}: drag to re-centre it, click to go to it</title>
						</path>
						<text
							x={c.x}
							y={c.y + 4}
							textAnchor="middle"
							className="pointer-events-none fill-white text-[11px] font-semibold"
						>
							{i + 1}
						</text>
					</g>
				);
			})}
		</motion.svg>
	);
}
