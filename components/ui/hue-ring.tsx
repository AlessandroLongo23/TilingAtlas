"use client";

import { useMemo, useRef } from "react";
import { arcPath, hueFromPointer, ringColor, thumbPosition, wrapHue } from "@/lib/render/hueRing";

// An annular hue slider: a rainbow RING (not a wheel) with a circular thumb riding the track, whose
// angle (0° at the top, clockwise) is a hue offset in degrees. The ring is painted with the tile-fill
// palette itself — HSL(h, 100%, 80%) ≡ the canvas's HSB(h, 0.40, 1.0) — so the color under the thumb
// is the exact fill a hue-0 (red) tile takes at that offset. Pointer: press/drag anywhere re-aims the
// thumb; double-click resets to 0; arrows step ±1° (±15° with Shift). Same SVG + pointer-capture idiom
// as the spiral velocity pad. Spec: docs/superpowers/specs/2026-07-16-hue-ring-design.md.

interface HueRingProps {
	value: number; // hue offset, degrees (wrapped onto [0, 360) for display)
	onChange: (value: number) => void;
	label?: string;
	size?: number; // rendered square side, px
}

const VIEW = 96; // SVG viewBox side
const C = VIEW / 2; // ring centre
const TRACK_R = 38; // track centerline radius
const TRACK_W = 12; // ring thickness (stroke width of the segments)
const THUMB_R = 8; // thumb circle radius
const SEG_DEG = 5; // rainbow segment span; 72 segments read as continuous
const SEG_OVERLAP = 0.6; // degrees of overlap so butt-capped segments leave no hairline seams

export function HueRing({ value, onChange, label, size = VIEW }: HueRingProps) {
	const svgRef = useRef<SVGSVGElement | null>(null);
	const draggingRef = useRef(false);
	const hue = wrapHue(Math.round(value));
	const thumb = thumbPosition(hue, TRACK_R);

	// The rainbow is static — build the segment list once.
	const segments = useMemo(() => {
		const segs: { d: string; color: string }[] = [];
		for (let a = 0; a < 360; a += SEG_DEG) {
			segs.push({
				d: arcPath(C, C, TRACK_R, a, Math.min(a + SEG_DEG + SEG_OVERLAP, 360)),
				color: ringColor(a + SEG_DEG / 2),
			});
		}
		return segs;
	}, []);

	const updateFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
		const svg = svgRef.current;
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		const deg = hueFromPointer(
			e.clientX - (rect.left + rect.width / 2),
			e.clientY - (rect.top + rect.height / 2),
		);
		onChange(Math.round(deg) % 360);
	};

	const step = (delta: number) => onChange(wrapHue(hue + delta));

	return (
		<div className="grid w-full gap-2">
			{label ? (
				<div className="flex flex-row justify-between items-center">
					<span className="text-sm font-medium text-fg-secondary">{label}</span>
					<span className="text-xs text-accent font-medium">{hue}°</span>
				</div>
			) : null}
			<svg
				ref={svgRef}
				width={size}
				height={size}
				viewBox={`0 0 ${VIEW} ${VIEW}`}
				className="mx-auto touch-none cursor-pointer select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-line-focus/40 rounded-full"
				role="slider"
				tabIndex={0}
				aria-label={label ?? "Hue offset"}
				aria-valuemin={0}
				aria-valuemax={359}
				aria-valuenow={hue}
				aria-valuetext={`${hue} degrees`}
				onPointerDown={(e) => {
					e.preventDefault();
					e.currentTarget.setPointerCapture(e.pointerId);
					e.currentTarget.focus();
					draggingRef.current = true;
					updateFromEvent(e);
				}}
				onPointerMove={(e) => {
					if (draggingRef.current) updateFromEvent(e);
				}}
				onPointerUp={() => {
					draggingRef.current = false;
				}}
				onPointerCancel={() => {
					draggingRef.current = false;
				}}
				onDoubleClick={() => onChange(0)}
				onKeyDown={(e) => {
					const d = e.shiftKey ? 15 : 1;
					if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); step(d); }
					else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); step(-d); }
					else if (e.key === "Home") { e.preventDefault(); onChange(0); }
				}}
			>
				{/* Rainbow track: 72 butt-capped arcs at the tile-fill S/L, slightly overlapped (no seams). */}
				{segments.map((s, i) => (
					<path key={i} d={s.d} stroke={s.color} strokeWidth={TRACK_W} fill="none" />
				))}
				{/* Thumb: a circle riding the track, filled with the color it selects. */}
				<circle
					cx={(C + thumb.x).toFixed(3)}
					cy={(C + thumb.y).toFixed(3)}
					r={THUMB_R}
					fill={ringColor(hue)}
					className="stroke-fg"
					strokeWidth={2}
				/>
				{/* Numeric readout in the ring's hole. */}
				<text
					x={C}
					y={C}
					textAnchor="middle"
					dominantBaseline="central"
					className="fill-fg-secondary font-mono select-none pointer-events-none"
					fontSize={13}
				>
					{hue}°
				</text>
			</svg>
		</div>
	);
}
