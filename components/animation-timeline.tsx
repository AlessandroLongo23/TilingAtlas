"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type PointerEvent as ReactPointerEvent,
	type RefObject,
} from "react";
import { Check, Diamond, Magnet, Pause, Play, SkipBack, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { ToolbarReveal } from "@/components/ui/floating-toolbar";
import { CameraPathOverlay } from "@/components/camera-path-overlay";
import { AnimationExportModal } from "@/components/animation-export-modal";

import { Button } from "@/components/ui/button";
import { KEY_EPS, useAnimation } from "@/stores/animation";
import { flatDriver } from "@/lib/render/flatCamera";
import {
	liveCamera,
	moveLength,
	publishCamera,
	subscribeCamera,
	type GeometryKind,
	type Pose,
} from "@/lib/render/cameraPose";
import { captureFrame, playSurfaceColor } from "@/lib/render/capture";
import { MAX_DPR, measureBox } from "@/lib/render/canvasSize";
import { DEFAULT_CURVE, distanceTimes, viewAtTime } from "@/lib/render/viewPath";
import { Checkbox } from "@/components/ui/checkbox";
import { curvePath, SpeedCurveEditor } from "@/components/speed-curve-editor";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import type { ParametricCellData } from "@/lib/utils/paramCell";
import { cn } from "@/lib/utils/cn";

// The animation timeline docked under the /play canvas (Marek Čtrnáct's suggestion: store views of a
// tiling and render a GIF that moves smoothly between them). It works like a video editor's: a playhead
// you scrub, keyframes you drop at the playhead and drag in time, an end marker, and playback on the
// canvas itself. Between keyframes the camera follows the uniform spiral of lib/render/viewPath.ts.
//
// Flat Euclidean shelves only: a keyframe is the (offset, zoom, rotation) triple of the configuration
// store's camera, and the disk and the sphere own theirs.

const MIN_SPAN = 5; // seconds visible on an empty or short timeline
const SNAP = 0.1; // keyframes and the end marker land on tenths of a second

const snapTime = (t: number) => Math.max(0, Math.round(t / SNAP) * SNAP);
const fmt = (t: number) => `${t.toFixed(1)}s`;

// Motion: the app's standard curve and pace (ToolbarReveal), so the timeline moves like the toolbar.
const EASE = [0.2, 0, 0, 1] as const;
const DOCK_MS = 300;
const GLIDE_MS = 240;
const TIMELINE_H = 208; // the timeline's h-52

function liveBox(host: HTMLElement | null) {
	const { w, h } = measureBox(host);
	return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

export function AnimationTimeline({
	scope,
	geometry,
	hostRef,
	cell,
	paramCell,
}: {
	/** Which camera to drive: the flat one through the store, the others as their canvas publishes them. */
	geometry: GeometryKind;
	/** The tiling the keyframes belong to. */
	scope: string;
	/** The element the canvases fill. */
	hostRef: RefObject<HTMLElement | null>;
	cell: TranslationalCellData | null;
	paramCell: ParametricCellData | null;
}) {
	const { keys, duration, ending, byDistance, snap } = useAnimation();
	const { setScope, putKey, setThumb, moveKey, removeKey, set, toggle, setCurve, setTimes } = useAnimation.getState();
	useEffect(() => setScope(scope), [scope, setScope]);

	// The camera this timeline drives. The flat one is built here from the store; the disk's and the
	// sphere's are published by their canvases (cameraPose.ts) and may be null until one mounts.
	const cellsRef = useRef({ cell, paramCell });
	useEffect(() => {
		cellsRef.current = { cell, paramCell };
	}, [cell, paramCell]);
	const flat = useMemo(
		() =>
			flatDriver(
				() => liveBox(hostRef.current),
				() => cellsRef.current,
			),
		[hostRef],
	);
	// Published too while on a flat shelf, so there is one live camera whatever the geometry.
	useEffect(() => (geometry === "flat" ? publishCamera(flat) : undefined), [geometry, flat]);
	const published = useSyncExternalStore(subscribeCamera, liveCamera, () => null);
	const driver = geometry === "flat" ? flat : published?.kind === geometry ? published : null;

	const [time, setTime] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [selected, setSelected] = useState<number | null>(null);
	const reduce = useReducedMotion();
	// False while the dock is sliding away, so the canvas overlay fades out with it.
	const present = useIsPresent();

	// Keyframe times as drawn on the track. A retime (Time by distance, a bent path, a preset) glides the
	// keyframes to their new times; a drag moves them with the pointer. Positions in px are not eased, so
	// a track being squeezed by the curve panel reflows at once instead of trailing it.
	const instantRef = useRef(false);
	const [shown, setShown] = useState<Record<number, number>>({});
	const shownRef = useRef(shown);
	const timesSig = keys.map((k) => `${k.id}:${k.t}`).join(" ");
	useEffect(() => {
		const to = Object.fromEntries(keys.map((k) => [k.id, k.t]));
		const from = shownRef.current;
		if (instantRef.current || reduce) {
			shownRef.current = to;
			setShown(to);
			return;
		}
		const start = performance.now();
		let raf = 0;
		const step = (now: number) => {
			const u = Math.min(1, (now - start) / GLIDE_MS);
			const e = 1 - (1 - u) ** 3;
			const cur = Object.fromEntries(keys.map((k) => [k.id, (from[k.id] ?? k.t) + (k.t - (from[k.id] ?? k.t)) * e]));
			shownRef.current = cur;
			setShown(cur);
			if (u < 1) raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
		// timesSig stands for keys' ids and times, the only part of keys this follows.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [timesSig, reduce]);
	const tShown = (k: { id: number; t: number }) => shown[k.id] ?? k.t;

	// The move whose speed curve is open, by the keyframe it starts at.
	const [seg, setSeg] = useState<number | null>(null);
	const [exporting, setExporting] = useState(false);
	// The canvas host, once mounted: the camera path overlay is portalled into it.
	const [host, setHost] = useState<HTMLElement | null>(null);
	useEffect(() => setHost(hostRef.current), [hostRef]);

	/**
	 * Where the tail past the last keyframe flies. "return" goes back to the first view. "drift" goes to
	 * the first view moved by a symmetry of the tiling (a lattice period, a deck transformation of the
	 * disk, a full turn of the sphere): it draws the same picture as the first, so the loop has no seam,
	 * but the pattern has travelled on the way instead of the camera going back and forth.
	 */
	const closeTo = useMemo((): Pose | undefined => {
		const first = keys[0]?.view;
		if (!first || ending === "hold") return undefined;
		return ending === "return" ? first : driver?.drift(first);
	}, [keys, ending, driver]);

	const viewAt = useCallback(
		(t: number) => viewAtTime(keys, t, { duration, closeTo, model: driver?.model }),
		[keys, duration, closeTo, driver],
	);

	// `commit` publishes the view to React (sliders, URL). Playback and scrubbing leave it off and commit
	// once when they stop, so a frame costs the canvases' draw and nothing else.
	const seek = useCallback(
		(t: number, commit = true) => {
			const c = Math.min(Math.max(0, t), duration);
			setTime(c);
			const v = viewAt(c);
			if (v) driver?.apply(v);
			if (commit) driver?.commit();
		},
		[duration, viewAt, driver],
	);

	// "Time by distance": the keyframes sit where an even pace puts them, the first at 0 and the end of
	// the motion at the end marker, and follow every edit that changes how far a move goes.
	useEffect(() => {
		if (!byDistance || keys.length === 0 || !driver) return;
		const times = distanceTimes(keys, duration, (a, b, bend) => moveLength(driver, a, b, bend), closeTo);
		if (times.some((t, i) => Math.abs(t - keys[i].t) > 1e-3)) setTimes(times);
	}, [byDistance, keys, duration, closeTo, driver, setTimes]);

	// Playback on the canvas. A looping ending wraps; "hold" stops at the end, as an editor does.
	useEffect(() => {
		if (!playing) return;
		let raf = 0;
		let last = performance.now();
		let t = time >= duration ? 0 : time;
		const step = (now: number) => {
			t += (now - last) / 1000;
			last = now;
			if (t >= duration) {
				if (ending === "hold" || duration <= 0) {
					seek(duration, false);
					setPlaying(false);
					return;
				}
				t %= duration;
			}
			seek(t, false);
			raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => {
			cancelAnimationFrame(raf);
			driver?.commit();
		};
		// `time` seeds the run and is then driven by it; re-running on every tick would restart the clock.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [playing, duration, ending, seek, driver]);

	const keyAtPlayhead = keys.find((k) => Math.abs(k.t - time) < KEY_EPS) ?? null;

	async function addKey() {
		setPlaying(false);
		const pose = driver?.read();
		if (!pose) return;
		const id = putKey(snapTime(time), pose);
		setSelected(id);
		await retakeThumb(id);
	}

	// A keyframe's thumbnail: one capture at the live size, which changes nothing the canvas was drawing
	// and so cannot flash (the premise of freezeView), scaled down. The canvas must be showing that
	// keyframe's view when this runs.
	async function retakeThumb(id: number) {
		const box = liveBox(hostRef.current);
		const shot = await captureFrame(
			{ ...box, dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR) },
			{ background: playSurfaceColor() },
		);
		if (!shot) return;
		const th = document.createElement("canvas");
		th.height = 96;
		th.width = Math.max(1, Math.round((shot.width / shot.height) * 96));
		th.getContext("2d")?.drawImage(shot, 0, 0, th.width, th.height);
		setThumb(id, th.toDataURL("image/jpeg", 0.8));
	}

	// ── track geometry ──
	const trackRef = useRef<HTMLDivElement | null>(null);
	const [trackW, setTrackW] = useState(600);
	useEffect(() => {
		const el = trackRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setTrackW(el.clientWidth));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const span = Math.max(MIN_SPAN, duration * 1.15);
	const pps = trackW / span;
	const xOf = (t: number) => t * pps;
	const tOf = (e: { clientX: number }) => {
		const r = trackRef.current?.getBoundingClientRect();
		return r ? (e.clientX - r.left) / pps : 0;
	};
	const tick = [0.5, 1, 2, 5, 10, 30].find((s) => s * pps >= 56) ?? 60;

	// One drag at a time: the playhead (scrub), a keyframe (retime) or the end marker (duration).
	const drag = useRef<{ kind: "scrub" | "key" | "end"; id?: number; x0: number; t0: number; moved: boolean } | null>(
		null,
	);
	const onDown = (e: ReactPointerEvent, kind: "scrub" | "key" | "end", id?: number, t0 = 0) => {
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		setPlaying(false);
		drag.current = { kind, id, x0: e.clientX, t0, moved: false };
		instantRef.current = kind === "key";
		if (kind === "scrub") seek(tOf(e), false);
		if (kind === "key") setSelected(id ?? null);
	};
	const onMove = (e: ReactPointerEvent) => {
		const d = drag.current;
		if (!d) return;
		if (Math.abs(e.clientX - d.x0) > 3) d.moved = true;
		if (d.kind === "scrub") seek(tOf(e), false);
		// Under "Time by distance" the times are derived, so a keyframe can be clicked but not dragged.
		else if (d.kind === "key" && d.moved && d.id != null && !byDistance)
			moveKey(d.id, snapTime(d.t0 + (e.clientX - d.x0) / pps));
		else if (d.kind === "end") set({ duration: Math.max(keys.at(-1)?.t ?? 0, SNAP, snapTime(tOf(e))) });
	};
	const onUp = () => {
		const d = drag.current;
		drag.current = null;
		instantRef.current = false;
		if (d?.kind === "scrub") driver?.commit();
		// A keyframe that was clicked, not dragged, moves the playhead to it and shows its view.
		if (d?.kind === "key" && !d.moved) seek(d.t0);
		if (d?.kind === "key" && d.moved) {
			const k = useAnimation.getState().keys.find((q) => q.id === d.id);
			if (k) seek(k.t);
		}
	};

	const goToKey = (id: number) => {
		const k = useAnimation.getState().keys.find((q) => q.id === id);
		setPlaying(false);
		setSelected(id);
		if (k) seek(k.t);
		return k;
	};

	const first = keys[0];
	const segIndex = keys.findIndex((k) => k.id === seg);
	// The last keyframe's move exists only while the timeline loops back.
	const segKey = segIndex >= 0 && (segIndex + 1 < keys.length || closeTo) ? keys[segIndex] : null;

	return (
		<div
			className="flex h-52 shrink-0 flex-col border-t border-line bg-surface-raised select-none"
			tabIndex={-1}
			onKeyDown={(e) => {
				if ((e.key === "Delete" || e.key === "Backspace") && selected != null) {
					removeKey(selected);
					setSelected(null);
				}
			}}
		>
			<div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b border-line px-3">
				<Button size="icon" variant="secondary" icon={SkipBack} aria-label="Go to start" onClick={() => seek(0)} />
				<Button
					size="sm"
					classes="shrink-0 whitespace-nowrap"
					variant="primary"
					icon={playing ? Pause : Play}
					label={playing ? "Pause" : "Play"}
					onClick={() => setPlaying((p) => !p)}
					disabled={keys.length === 0}
				/>
				<span className="shrink-0 text-xs whitespace-nowrap text-fg-muted tabular-nums">
					{fmt(time)} / {fmt(duration)}
				</span>
				<Button
					size="sm"
					classes="shrink-0 whitespace-nowrap"
					variant="secondary"
					icon={Diamond}
					label={keyAtPlayhead ? "Update keyframe" : "Add keyframe"}
					onClick={addKey}
				/>
				<ToolbarReveal show={selected != null}>
					<Button
						size="icon"
						classes="shrink-0"
						variant="ghost"
						icon={Trash2}
						aria-label="Delete keyframe"
						onClick={() => {
							if (selected != null) removeKey(selected);
							setSelected(null);
						}}
					/>
				</ToolbarReveal>
				<div className="ml-auto flex shrink-0 items-center gap-3">
					<button
						type="button"
						aria-pressed={snap}
						onClick={() => set({ snap: !snap })}
						title="Snap keyframes dragged on the canvas to vertices, edge midpoints and tile centres, and their turn to the tiling's directions. Hold Alt to drag freely."
						className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-1 text-xs whitespace-nowrap text-fg-muted transition-colors hover:text-fg aria-pressed:bg-surface-sunken aria-pressed:text-fg"
					>
						<Magnet size={14} />
						Snap
					</button>
					<span title="Space the keyframes so the camera keeps one pace, between 0 and the end marker">
						<Checkbox label="Time by distance" checked={byDistance} onCheckedChange={(v) => set({ byDistance: v })} />
					</span>
					<Button
						size="sm"
						classes="shrink-0 whitespace-nowrap"
						variant="primary"
						icon={Check}
						label="Done"
						onClick={() => {
							setPlaying(false);
							setExporting(true);
						}}
						disabled={keys.length === 0}
					/>
					<button
						type="button"
						aria-label="Close timeline"
						onClick={toggle}
						className="text-fg-muted transition-colors hover:text-fg"
					>
						<X size={16} />
					</button>
				</div>
			</div>

			<div className="flex min-h-0 flex-1">
				{/* Inset by half a thumbnail each side: keyframes are centred on their time. */}
				<div className="relative min-h-0 min-w-0 flex-1 px-12 pt-1 pb-2">
					<div
						ref={trackRef}
						className="relative h-full cursor-text"
						onPointerDown={(e) => onDown(e, "scrub")}
						onPointerMove={onMove}
						onPointerUp={onUp}
					>
						{/* Ruler */}
						<div className="pointer-events-none absolute inset-x-0 top-0 h-5 border-b border-line">
							{Array.from({ length: Math.floor(span / tick) + 1 }, (_, i) => i * tick).map((t) => (
								<div key={t} className="absolute top-0 h-full border-l border-line" style={{ left: xOf(t) }}>
									<span className="ml-1 text-[10px] text-fg-muted tabular-nums">{t}s</span>
								</div>
							))}
						</div>

						{/* Past the end */}
						<div
							className="pointer-events-none absolute top-5 bottom-0 bg-surface-sunken/70"
							style={{ left: xOf(duration), right: 0 }}
						/>

						{/* The moves, one strip each under the keyframes, drawing its speed curve. Click one to edit it. */}
						{keys.flatMap((k, i) => {
							const next = keys[i + 1];
							const end = next ? tShown(next) : closeTo ? duration : null;
							if (end == null || end <= tShown(k)) return [];
							const w = xOf(end) - xOf(tShown(k));
							return [
								<button
									key={k.id}
									type="button"
									title="Speed curve of this move"
									className={cn(
										"absolute bottom-0 h-7 rounded-sm border transition-colors",
										seg === k.id ? "border-accent bg-accent/15" : "border-transparent bg-accent/5 hover:bg-accent/10",
									)}
									style={{ left: xOf(tShown(k)) + 1, width: Math.max(0, w - 2) }}
									onPointerDown={(e) => e.stopPropagation()}
									onClick={() => setSeg(seg === k.id ? null : k.id)}
								>
									<svg width={Math.max(0, w - 4)} height={22} className="pointer-events-none mx-auto block">
										<path
											d={curvePath(k.curve ?? DEFAULT_CURVE, Math.max(0, w - 4), 22)}
											fill="none"
											className="stroke-accent"
											strokeWidth={1.5}
										/>
									</svg>
								</button>,
							];
						})}

						{keys.length === 0 ? (
							<p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-xs text-fg-muted">
								Set up the view on the canvas, then press Add keyframe. Move the playhead, change the view, add another.
							</p>
						) : null}

						{/* The loop's closing view, drawn as a ghost of the first keyframe at the end marker */}
						{first && closeTo ? (
							<div
								className="pointer-events-none absolute top-7 -translate-x-1/2 opacity-50"
								style={{ left: xOf(duration) }}
								title={ending === "drift" ? "First view, one period on" : "First view"}
							>
								{first.thumb ? (
									// eslint-disable-next-line @next/next/no-img-element
									<img src={first.thumb} alt="" className="h-14 w-auto rounded border border-dashed border-line" />
								) : null}
								<span className="block text-center text-[10px] text-fg-muted">
									{ending === "drift" ? "+1 period" : "loop"}
								</span>
							</div>
						) : null}

						<AnimatePresence initial={false}>
							{keys.map((k) => (
								<motion.div
									key={k.id}
									className={cn(
										"absolute top-7 flex flex-col items-center",
										byDistance ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
									)}
									style={{ left: xOf(tShown(k)), x: "-50%" }}
									initial={{ opacity: 0, scale: 0.8 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.8 }}
									transition={{ duration: reduce ? 0 : GLIDE_MS / 1000, ease: EASE }}
									onPointerDown={(e) => onDown(e, "key", k.id, k.t)}
									onPointerMove={onMove}
									onPointerUp={onUp}
								>
									{k.thumb ? (
										// eslint-disable-next-line @next/next/no-img-element
										<img
											src={k.thumb}
											alt={`Keyframe at ${fmt(k.t)}`}
											draggable={false}
											className={cn(
												"h-14 w-auto rounded border",
												selected === k.id ? "border-accent ring-2 ring-accent/40" : "border-line",
											)}
										/>
									) : (
										<div className="h-14 w-20 animate-pulse rounded border border-line bg-surface-sunken" />
									)}
									<Diamond
										size={12}
										className={cn(
											"mt-1",
											selected === k.id ? "fill-accent text-accent" : "fill-fg-muted text-fg-muted",
										)}
									/>
								</motion.div>
							))}
						</AnimatePresence>

						{/* End marker: drag to set the length */}
						<div
							className="absolute top-0 bottom-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize"
							style={{ left: xOf(duration) }}
							onPointerDown={(e) => onDown(e, "end")}
							onPointerMove={onMove}
							onPointerUp={onUp}
							title="Drag to set the length"
						>
							<div className="mx-auto h-full w-0.5 bg-fg-muted" />
						</div>

						{/* Playhead */}
						<div
							className="pointer-events-none absolute top-0 bottom-0 z-20 -translate-x-1/2"
							style={{ left: xOf(time) }}
						>
							<div className="mx-auto h-2.5 w-2.5 rotate-45 bg-danger" />
							<div className="mx-auto -mt-1 h-full w-0.5 bg-danger" />
						</div>
					</div>
				</div>
				{/* Slides in from the right and squeezes the track; its content keeps its width while it does. */}
				<AnimatePresence initial={false}>
					{segKey ? (
						<motion.div
							key="curve"
							className="shrink-0 overflow-hidden border-l border-line"
							initial={{ width: 0, opacity: 0 }}
							animate={{ width: "auto", opacity: 1 }}
							exit={{ width: 0, opacity: 0 }}
							transition={{ duration: reduce ? 0 : DOCK_MS / 1000, ease: EASE }}
						>
							<div className="flex w-max flex-col gap-1 px-3 py-2">
								<div className="flex items-center justify-between gap-2 text-[11px] text-fg-muted">
									<span>
										Speed, move {segIndex + 1} → {keys[segIndex + 1] ? segIndex + 2 : "end"}
									</span>
									<button
										type="button"
										aria-label="Close speed curve"
										onClick={() => setSeg(null)}
										className="hover:text-fg"
									>
										<X size={12} />
									</button>
								</div>
								<SpeedCurveEditor
									curve={segKey.curve ?? DEFAULT_CURVE}
									onChange={(c) => setCurve(segKey.id, c)}
									onApplyAll={() => setCurve("all", segKey.curve ?? DEFAULT_CURVE)}
								/>
							</div>
						</motion.div>
					) : null}
				</AnimatePresence>
			</div>
			<AnimationExportModal
				open={exporting}
				onClose={() => setExporting(false)}
				hostRef={hostRef}
				scope={scope}
				viewAt={viewAt}
				driver={driver}
			/>
			{host && driver
				? createPortal(
						<CameraPathOverlay
							driver={driver}
							keys={keys}
							snap={snap}
							visible={present}
							closeTo={closeTo}
							selected={selected}
							onSelect={goToKey}
							onSelectSegment={setSeg}
							onMoved={async (id) => {
								// Show the re-centred keyframe, then let a frame draw it before photographing it.
								if (!goToKey(id)) return;
								await new Promise((r) => requestAnimationFrame(r));
								await retakeThumb(id);
							}}
						/>,
						host,
					)
				: null}
		</div>
	);
}

/** The timeline, rising from under the canvas on open and sinking on close. The canvas sizes itself
 *  to its box every frame, so the height animation pushes and resizes it with no extra wiring. */
export function AnimationTimelineDock({ open, ...props }: { open: boolean } & Parameters<typeof AnimationTimeline>[0]) {
	const reduce = useReducedMotion();
	return (
		<AnimatePresence initial={false}>
			{open ? (
				<motion.div
					key="timeline"
					className="shrink-0 overflow-hidden"
					initial={{ height: 0 }}
					animate={{ height: TIMELINE_H }}
					exit={{ height: 0 }}
					transition={{ duration: reduce ? 0 : DOCK_MS / 1000, ease: EASE }}
				>
					<AnimationTimeline {...props} />
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
