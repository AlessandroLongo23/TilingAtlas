"use client";

import { useRef, useState } from "react";
import { useConfiguration } from "@/stores/configuration";
import {
	PAD_DEAD_ZONE,
	padPosition,
	padPositionFromVelocity,
	padVelocity,
	type PadPos,
} from "@/lib/render/velocityPad";

// Circular velocity pad for the spiral view: drag the knob to hold a strip-space velocity —
// horizontal = zoom rate (self-similar dolly), vertical = rotation rate (spin). The knob PERSISTS
// where released (set-and-forget animation); the dead zone around the centre snaps it back and stops
// the motion. The pad only writes cfg.spiralVel on pointer events — integration happens in the
// InversiveCanvas render loop. Spec: docs/superpowers/specs/2026-07-16-spiral-velocity-pad-design.md.

const SIZE = 128; // SVG viewBox side, px
const C = SIZE / 2; // disc centre
const RADIUS = 58; // disc radius, px (leaves room for the stroke)

export function SpiralVelocityPad() {
	// Knob position in pad px (y down). Initialised from the stored velocity so a remount (tab switch,
	// mode toggle) restores the knob where it was left.
	const [pos, setPos] = useState<PadPos>(() =>
		padPositionFromVelocity(useConfiguration.getState().spiralVel, RADIUS),
	);
	const svgRef = useRef<SVGSVGElement | null>(null);
	const draggingRef = useRef(false);

	const updateFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
		const svg = svgRef.current;
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		const scale = SIZE / rect.width; // CSS px → viewBox px (the SVG renders square)
		const p = padPosition(
			(e.clientX - (rect.left + rect.width / 2)) * scale,
			(e.clientY - (rect.top + rect.height / 2)) * scale,
			RADIUS,
		);
		setPos(p);
		useConfiguration.getState().set({ spiralVel: padVelocity(p, RADIUS) });
	};

	const active = pos.x !== 0 || pos.y !== 0;

	return (
		<div className="flex items-center justify-center">
			<span
				className="text-[11px] text-fg-muted select-none"
				style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
			>
				rotation
			</span>
			<div className="flex flex-col items-center">
				<svg
					ref={svgRef}
					width={SIZE}
					height={SIZE}
					viewBox={`0 0 ${SIZE} ${SIZE}`}
					className="touch-none cursor-pointer select-none"
					role="slider"
					aria-label="Spiral animation velocity: horizontal = zoom, vertical = rotation"
					aria-valuetext={active ? `zoom ${pos.x.toFixed(0)}, rotation ${(-pos.y).toFixed(0)}` : "stopped"}
					onPointerDown={(e) => {
						e.preventDefault();
						e.currentTarget.setPointerCapture(e.pointerId);
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
				>
					<circle cx={C} cy={C} r={RADIUS} className="fill-surface stroke-line" strokeWidth={1} />
					{/* Crosshair axes */}
					<line x1={C - RADIUS} y1={C} x2={C + RADIUS} y2={C} className="stroke-line" strokeWidth={0.5} />
					<line x1={C} y1={C - RADIUS} x2={C} y2={C + RADIUS} className="stroke-line" strokeWidth={0.5} />
					{/* Dead zone: inside this ring the knob snaps to the centre and the animation stops */}
					<circle
						cx={C}
						cy={C}
						r={RADIUS * PAD_DEAD_ZONE}
						className="stroke-line"
						fill="none"
						strokeWidth={0.75}
						strokeDasharray="2 2"
					/>
					{/* Velocity vector + knob */}
					{active ? (
						<line x1={C} y1={C} x2={C + pos.x} y2={C + pos.y} className="stroke-accent" strokeWidth={1.5} />
					) : null}
					<circle
						cx={C + pos.x}
						cy={C + pos.y}
						r={5}
						className={active ? "fill-accent" : "fill-fg-muted"}
					/>
				</svg>
				<span className="text-[11px] text-fg-muted select-none">zoom</span>
			</div>
		</div>
	);
}
