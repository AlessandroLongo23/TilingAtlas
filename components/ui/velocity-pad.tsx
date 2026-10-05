"use client";

import { useRef } from "react";
import {
	PAD_DEAD_ZONE,
	PAD_MAX_RATE,
	padPosition,
	padPositionFromVelocity,
	padVelocity,
} from "@/lib/render/velocityPad";
import { cn } from "@/lib/utils/cn";

// Circular velocity pad: drag the knob to hold a 2-D rate. The knob PERSISTS where released
// (set-and-forget animation); the dead zone around the centre snaps it back and stops the motion.
// With `springBack` it is a joystick instead: releasing it writes zero and the knob glides home.
// Extracted from the spiral view's pad so the parquet page's two drift controls share it — the math
// lives in lib/render/velocityPad.ts. Spec: docs/superpowers/specs/2026-07-16-spiral-velocity-pad-design.md.

interface VelocityPadProps {
	value: { x: number; y: number };
	onChange: (value: { x: number; y: number }) => void;
	/** Rate at full deflection, both axes. */
	maxRate?: number;
	/** Axis captions drawn beside/below the disc. Omit either to hide it. */
	labelX?: string;
	labelY?: string;
	/** SVG viewBox side in px. */
	size?: number;
	ariaLabel: string;
	/** Readout appended to the aria value text, e.g. "0.30 / −0.10". */
	formatValue?: (value: { x: number; y: number }) => string;
	/** Joystick behaviour: the rate returns to zero on release instead of persisting. */
	springBack?: boolean;
	/** A short caption riding on the knob, e.g. the controller stick that drives it. */
	knobLabel?: string;
}

export function VelocityPad({
	value,
	onChange,
	maxRate = PAD_MAX_RATE,
	labelX,
	labelY,
	size = 128,
	ariaLabel,
	formatValue,
	springBack = false,
	knobLabel,
}: VelocityPadProps) {
	const C = size / 2;
	const discR = C - 6; // leaves room for the stroke
	// The joystick's knob is a thumb-sized cap. At full deflection it overhangs the disc by a little
	// under a quarter of its diameter, as a physical stick does, so its travel stops short of the rim.
	const knobR = springBack ? Math.round(size * 0.15) : 5;
	const radius = springBack ? discR - 0.55 * knobR : discR;

	const svgRef = useRef<SVGSVGElement | null>(null);
	const draggingRef = useRef(false);

	// Fully controlled: the knob is DERIVED from `value`, never mirrored into local state. That works
	// because padPosition→padVelocity→padPositionFromVelocity is an exact round trip (the quadratic
	// magnitude and its square root cancel), so the knob lands back under the pointer with no drift —
	// and the pad then follows an external reset for free, with no effect to sync it.
	const pos = padPositionFromVelocity(value, radius, maxRate);

	const updateFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
		const svg = svgRef.current;
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		const scale = size / rect.width; // CSS px → viewBox px (the SVG renders square)
		const p = padPosition(
			(e.clientX - (rect.left + rect.width / 2)) * scale,
			(e.clientY - (rect.top + rect.height / 2)) * scale,
			radius,
		);
		onChange(padVelocity(p, radius, maxRate));
	};

	const active = pos.x !== 0 || pos.y !== 0;
	const release = () => {
		draggingRef.current = false;
		if (springBack) onChange({ x: 0, y: 0 });
	};

	return (
		<div className="flex items-center justify-center">
			{labelY ? (
				<span
					className="text-[11px] text-fg-muted select-none"
					style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
				>
					{labelY}
				</span>
			) : null}
			<div className="flex flex-col items-center">
				<svg
					ref={svgRef}
					width={size}
					height={size}
					viewBox={`0 0 ${size} ${size}`}
					className="touch-none cursor-pointer select-none overflow-visible"
					role="slider"
					aria-label={ariaLabel}
					aria-valuetext={
						active
							? (formatValue?.(value) ?? `${value.x.toFixed(2)}, ${value.y.toFixed(2)}`)
							: "stopped"
					}
					onPointerDown={(e) => {
						e.preventDefault();
						e.currentTarget.setPointerCapture(e.pointerId);
						draggingRef.current = true;
						updateFromEvent(e);
					}}
					onPointerMove={(e) => {
						if (draggingRef.current) updateFromEvent(e);
					}}
					onPointerUp={release}
					onPointerCancel={release}
				>
					<circle cx={C} cy={C} r={discR} className="fill-surface stroke-line" strokeWidth={1} />
					{/* Crosshair axes */}
					<line x1={C - discR} y1={C} x2={C + discR} y2={C} className="stroke-line" strokeWidth={0.5} />
					<line x1={C} y1={C - discR} x2={C} y2={C + discR} className="stroke-line" strokeWidth={0.5} />
					{/* Dead zone: inside this ring the knob snaps to the centre and the animation stops */}
					<circle
						cx={C}
						cy={C}
						r={radius * PAD_DEAD_ZONE}
						className="stroke-line"
						fill="none"
						strokeWidth={0.75}
						strokeDasharray="2 2"
					/>
					{/* Velocity vector + knob */}
					{active && !springBack ? (
						<line x1={C} y1={C} x2={C + pos.x} y2={C + pos.y} className="stroke-accent" strokeWidth={1.5} />
					) : null}
					{/* The transition is on the resting knob only, so it eases home and never lags the pointer. */}
					<g
						style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
						className={cn(springBack && !active && "transition-transform duration-200 ease-out motion-reduce:transition-none")}
					>
						<circle
							cx={C}
							cy={C}
							r={knobR}
							className={springBack ? "fill-white stroke-line drop-shadow-sm" : active ? "fill-accent" : "fill-fg-muted"}
						/>
						{knobLabel ? (
							<text x={C} y={C} textAnchor="middle" dominantBaseline="central" className="pointer-events-none fill-neutral-500 font-mono text-[11px] font-medium">
								{knobLabel}
							</text>
						) : null}
					</g>
				</svg>
				{labelX ? <span className="text-[11px] text-fg-muted select-none">{labelX}</span> : null}
			</div>
		</div>
	);
}
