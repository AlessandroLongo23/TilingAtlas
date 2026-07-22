"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Shuffle } from "lucide-react";
import {
	drawPolygons,
	expandToViewport,
	parseBaseCell,
	type BaseCell,
	type RawPolygon,
} from "@/lib/utils/renderTiling";
import {
	TILING_TRANSITION_IN_MS,
	TILING_TRANSITION_OUT_MS,
	WAVE_MIN_SCALE,
	prefersReducedMotion,
	waveTileScale,
} from "@/lib/utils/tilingTransition";
import type { LandingSpecimen } from "@/lib/services/landingData";

// The hero's living background. Three behaviours on top of the static specimen render:
//  - a slow drift in one fixed direction. The pattern is periodic, so the steady state is ONE
//    drawImage per frame from an offscreen render, with the offset wrapped by the lattice basis —
//    the offscreen never needs repainting while a specimen is on stage;
//  - every ROTATE_MS a switch to another random specimen from the server-picked pool, played with
//    the /play canvas's radial wave (lib/utils/tilingTransition.ts): the outgoing tiling collapses
//    into its centroids centre-outward, the incoming one grows back the same way. During the wave
//    the frame is vector-drawn so each tile can scale about its own centroid;
//  - the caption follows the specimen on stage: id, compact config, k, and the Play deep link.
// prefers-reduced-motion disables drift and auto-rotation, and makes shuffle swap instantly.

const PX_PER_EDGE = 56;
const ROTATE_MS = 10_000;
const DRIFT_PX_PER_S = 9; // slow — one tile edge every ~6 s
const DRIFT_DIR = { x: 1, y: 0.4 }; // world units; y is up, so the pattern drifts right and up

interface Stage {
	base: BaseCell;
	scale: number; // world → CSS px
	polys: RawPolygon[]; // expanded to viewport + wrap margin, world coords
	centroids: { x: number; y: number }[];
	marginPx: number; // wrap margin in CSS px on each side of the offscreen
	off: HTMLCanvasElement;
}

function centroidOf(poly: RawPolygon): { x: number; y: number } {
	let x = 0, y = 0;
	for (const v of poly.vertices) {
		x += v.x;
		y += v.y;
	}
	return { x: x / poly.vertices.length, y: y / poly.vertices.length };
}

/** Build the stage for one specimen at the current viewport size: expanded polygons for the wave
 *  and a pre-rendered offscreen (viewport + wrap margin) for the steady drift. */
function buildStage(cell: LandingSpecimen["cell"], W: number, H: number, dpr: number, background: string): Stage | null {
	const base = parseBaseCell(cell);
	if (!base) return null;
	const scale = PX_PER_EDGE / base.medianEdge;
	const [[v1x, v1y], [v2x, v2y]] = base.basis;
	const marginWorld = (Math.hypot(v1x, v1y) + Math.hypot(v2x, v2y)) / 2;
	const marginPx = Math.ceil(marginWorld * scale);
	const cx = (base.minX + base.maxX) / 2;
	const cy = (base.minY + base.maxY) / 2;
	const polys = expandToViewport(
		base,
		cx,
		cy,
		W / (2 * scale) + marginWorld,
		H / (2 * scale) + marginWorld,
		200,
	);
	if (polys.length === 0) return null;

	const off = document.createElement("canvas");
	const offW = W + 2 * marginPx;
	const offH = H + 2 * marginPx;
	off.width = Math.floor(offW * dpr);
	off.height = Math.floor(offH * dpr);
	const octx = off.getContext("2d");
	if (!octx) return null;
	octx.setTransform(dpr, 0, 0, dpr, 0, 0);
	octx.fillStyle = background;
	octx.fillRect(0, 0, offW, offH);
	octx.save();
	octx.translate(offW / 2, offH / 2);
	octx.scale(scale, -scale);
	octx.translate(-cx, -cy);
	drawPolygons(octx, polys, scale);
	octx.restore();

	return { base, scale, polys, centroids: polys.map(centroidOf), marginPx, off };
}

interface HeroRotatorProps {
	specimens: LandingSpecimen[];
}

export function HeroRotator({ specimens }: HeroRotatorProps) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [current, setCurrent] = useState(0);
	const currentRef = useRef(0);
	// The switch request channel: the shuffle button writes here, the rAF loop picks it up.
	const requestRef = useRef<number | null>(null);

	useEffect(() => {
		const host = hostRef.current;
		const canvas = canvasRef.current;
		if (!host || !canvas || specimens.length === 0) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const reduced = prefersReducedMotion();
		let disposed = false;
		let raf = 0;
		let W = 0, H = 0, dpr = 1;
		let background = "#fff";
		let stage: Stage | null = null;
		// Drift offset in world units, wrapped by the lattice each frame.
		let ox = 0, oy = 0;
		let lastT = 0;
		let nextRotateAt = 0;
		let transition: { phase: "out" | "in"; start: number; target: number } | null = null;

		const pickOther = () => {
			if (specimens.length < 2) return currentRef.current;
			let i = currentRef.current;
			while (i === currentRef.current) i = Math.floor(Math.random() * specimens.length);
			return i;
		};

		// Load specimen `i` onto the stage, skipping unparsable cells (defensive: every eager-atlas
		// entry has a renderCell, but a malformed one must not kill the hero).
		const load = (i: number): boolean => {
			for (let tries = 0; tries < specimens.length; tries++) {
				const idx = (i + tries) % specimens.length;
				const s = buildStage(specimens[idx].cell, W, H, dpr, background);
				if (s) {
					stage = s;
					ox = 0;
					oy = 0;
					currentRef.current = idx;
					setCurrent(idx);
					return true;
				}
			}
			return false;
		};

		const measure = () => {
			const rect = host.getBoundingClientRect();
			W = Math.max(1, Math.floor(rect.width));
			H = Math.max(1, Math.floor(rect.height));
			dpr = Math.min(window.devicePixelRatio ?? 1, 2);
			canvas.width = Math.floor(W * dpr);
			canvas.height = Math.floor(H * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			background = getComputedStyle(host).backgroundColor;
		};

		/** Reduce the drift offset into the fundamental cell so the offscreen always covers the view. */
		const wrapOffset = () => {
			if (!stage) return { rx: 0, ry: 0 };
			const [[v1x, v1y], [v2x, v2y]] = stage.base.basis;
			const det = v1x * v2y - v1y * v2x;
			if (Math.abs(det) < 1e-12) return { rx: ox, ry: oy };
			const a = Math.round((ox * v2y - oy * v2x) / det);
			const b = Math.round((v1x * oy - v1y * ox) / det);
			ox -= a * v1x + b * v2x;
			oy -= a * v1y + b * v2y;
			return { rx: ox, ry: oy };
		};

		const blitSteady = () => {
			if (!stage) return;
			const { rx, ry } = wrapOffset();
			const offW = W + 2 * stage.marginPx;
			const offH = H + 2 * stage.marginPx;
			// World offset (rx, ry) moves the pattern by (+rx·scale, −ry·scale) on screen (y flips).
			ctx.drawImage(
				stage.off,
				-stage.marginPx + rx * stage.scale,
				-stage.marginPx - ry * stage.scale,
				offW,
				offH,
			);
		};

		const drawWave = (phase: "out" | "in", p: number) => {
			if (!stage) return;
			const { rx, ry } = wrapOffset();
			const { scale, base } = stage;
			const cx = (base.minX + base.maxX) / 2;
			const cy = (base.minY + base.maxY) / 2;
			ctx.fillStyle = background;
			ctx.fillRect(0, 0, W, H);
			ctx.save();
			ctx.translate(W / 2, H / 2);
			ctx.scale(scale, -scale);
			ctx.translate(-cx + rx, -cy + ry);
			const maxDist = Math.hypot(W, H) / 2;
			ctx.lineWidth = 1 / scale;
			for (let i = 0; i < stage.polys.length; i++) {
				const poly = stage.polys[i];
				const c = stage.centroids[i];
				// Screen distance of this tile's centroid from the canvas centre → wave coordinate u.
				const sx = (c.x - cx + rx) * scale;
				const sy = -(c.y - cy + ry) * scale;
				const u = Math.hypot(sx, sy) / maxDist;
				const s = waveTileScale(phase, u, p);
				if (s < WAVE_MIN_SCALE) continue;
				if (s >= 1) {
					drawPolygons(ctx, [poly], scale);
					continue;
				}
				const scaled: RawPolygon = {
					...poly,
					vertices: poly.vertices.map((v) => ({
						x: c.x + s * (v.x - c.x),
						y: c.y + s * (v.y - c.y),
					})),
				};
				drawPolygons(ctx, [scaled], scale);
			}
			ctx.restore();
		};

		const startTransition = (target: number, now: number) => {
			if (transition || target === currentRef.current) return;
			transition = { phase: "out", start: now, target };
		};

		const frame = (now: number) => {
			if (disposed) return;
			const dt = lastT ? Math.min((now - lastT) / 1000, 0.1) : 0;
			lastT = now;

			// Drift, in world units per second.
			if (stage) {
				const driftWorld = DRIFT_PX_PER_S / stage.scale;
				const n = Math.hypot(DRIFT_DIR.x, DRIFT_DIR.y);
				ox += (DRIFT_DIR.x / n) * driftWorld * dt;
				oy += (DRIFT_DIR.y / n) * driftWorld * dt;
			}

			// Pending shuffle request from the button.
			if (requestRef.current != null) {
				const t = requestRef.current;
				requestRef.current = null;
				startTransition(t, now);
			}
			if (now >= nextRotateAt && !transition) {
				startTransition(pickOther(), now);
				nextRotateAt = now + ROTATE_MS;
			}

			if (transition) {
				const dur = transition.phase === "out" ? TILING_TRANSITION_OUT_MS : TILING_TRANSITION_IN_MS;
				const p = Math.min((now - transition.start) / dur, 1);
				drawWave(transition.phase, p);
				if (p >= 1) {
					if (transition.phase === "out") {
						load(transition.target);
						transition = { phase: "in", start: now, target: transition.target };
					} else {
						transition = null;
						nextRotateAt = now + ROTATE_MS;
					}
				}
			} else {
				blitSteady();
			}
			raf = requestAnimationFrame(frame);
		};

		measure();
		load(0);

		if (reduced) {
			// Static: draw once, honour shuffle with an instant swap, no drift, no auto-rotation.
			blitSteady();
			const onShuffle = () => {
				if (requestRef.current == null) return;
				load(requestRef.current);
				requestRef.current = null;
				blitSteady();
			};
			const poll = setInterval(onShuffle, 150);
			const ro = new ResizeObserver(() => {
				measure();
				load(currentRef.current);
				blitSteady();
			});
			ro.observe(host);
			return () => {
				disposed = true;
				clearInterval(poll);
				ro.disconnect();
			};
		}

		nextRotateAt = performance.now() + ROTATE_MS;
		raf = requestAnimationFrame(frame);
		const ro = new ResizeObserver(() => {
			measure();
			load(currentRef.current);
		});
		ro.observe(host);
		return () => {
			disposed = true;
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	}, [specimens]);

	const specimen = specimens[current];

	return (
		<>
			<div ref={hostRef} aria-hidden="true" className="absolute inset-0 bg-surface">
				<canvas ref={canvasRef} className="w-full h-full block" />
			</div>
			{specimen ? (
				<div className="absolute bottom-3 right-3 z-10 flex items-center gap-2.5 text-[11px] font-mono bg-surface/75 backdrop-blur-sm border border-line rounded-md px-2.5 py-1.5 text-fg-secondary">
					<span className="max-w-[38vw] sm:max-w-none truncate">
						{specimen.id} <span className="hidden sm:inline">· {specimen.label} </span>· k&nbsp;=&nbsp;{specimen.k}
					</span>
					<Link
						href={`/play?source=reference&tiling=${encodeURIComponent(specimen.id)}`}
						className="inline-flex items-center gap-1 text-fg-muted hover:text-fg transition-colors"
					>
						<ExternalLink size={11} aria-hidden="true" />
						<span>open in Play</span>
					</Link>
					<button
						type="button"
						onClick={() => {
							if (specimens.length < 2) return;
							let i = current;
							while (i === current) i = Math.floor(Math.random() * specimens.length);
							requestRef.current = i;
						}}
						title="Show another tiling"
						aria-label="Show another tiling"
						className="inline-flex items-center gap-1 text-fg-muted hover:text-fg transition-colors"
					>
						<Shuffle size={12} aria-hidden="true" />
						<span>shuffle</span>
					</button>
				</div>
			) : null}
		</>
	);
}
