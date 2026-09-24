"use client";

import { useRef, useState } from "react";

// The Hankin construction on one edge, as a direct-manipulation control for the Islamic angle and edge
// offset together. The baseline is the edge (end ticks = its vertices, centre tick = the midpoint); two
// mirrored rays rise from it. Drag a TIP to set the angle, a ROOT to slide the roots along the edge; the
// other ray mirrors. Geometry matches Polygon.calculateIslamicSegments: the angle is measured from the
// edge and the offset is a signed fraction of the half-edge. Positive roots each ray on the side OPPOSITE
// its lean (an X crossing over the midpoint); negative roots it on its own side (the pair splits apart and
// the edge between the roots is drawn, as it is in the tiling). A root drag passes through 0 continuously,
// so one gesture reaches both. Arrows step ±1 (±10 with Shift) on the focused handle. Same SVG +
// pointer-capture idiom as the hue ring.

interface HankinPadProps {
	angle: number; // degrees from the edge, 0–90
	offset: number; // signed % of the half-edge, −100 (split) to 100 (cross)
	onAngleChange: (angle: number) => void;
	onOffsetChange: (offset: number) => void;
	label?: string;
}

const W = 240; // viewBox width
const H = 104; // viewBox height
const CX = W / 2; // edge midpoint
const BASE_Y = 86; // edge line
const HALF = 100; // half-edge length
const RAY = 62; // drawn ray length
const ARC_R = 20; // angle-marker radius

type Handle = "tip" | "root";
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function HankinPad({ angle, offset, onAngleChange, onOffsetChange, label }: HankinPadProps) {
	const svgRef = useRef<SVGSVGElement | null>(null);
	const dragRef = useRef<{ handle: Handle; lean: number } | null>(null);
	const [active, setActive] = useState<Handle | null>(null);
	const theta = clamp(Math.round(angle), 0, 90);
	const off = clamp(Math.round(offset), -100, 100);
	const rad = (theta * Math.PI) / 180;
	const d = (off / 100) * HALF;
	const rootX = (lean: number) => CX - lean * d;

	// lean +1 = the ray leaning right (+x); lean −1 mirrors it. The right-leaning ray roots left of the
	// midpoint when crossing (d > 0) and right of it when split (d < 0).
	const rays = [1, -1].map((lean) => {
		const rx = rootX(lean);
		const tx = rx + lean * RAY * Math.cos(rad);
		const ty = BASE_Y - RAY * Math.sin(rad);
		const ax = rx + lean * ARC_R * Math.cos(rad);
		const ay = BASE_Y - ARC_R * Math.sin(rad);
		const mid = rad / 2;
		return {
			lean,
			rx,
			tx,
			ty,
			arc: `M ${rx + lean * ARC_R} ${BASE_Y} A ${ARC_R} ${ARC_R} 0 0 ${lean > 0 ? 0 : 1} ${ax} ${ay}`,
			lx: rx + lean * (ARC_R + 14) * Math.cos(mid),
			ly: BASE_Y - (ARC_R + 14) * Math.sin(mid),
		};
	});

	// Past the crossing the two arc labels overlap; one label under the midpoint says the same thing.
	const stacked = Math.abs(rays[0].lx - rays[1].lx) < 32;

	const toView = (e: React.PointerEvent) => {
		const rect = svgRef.current!.getBoundingClientRect();
		return { x: ((e.clientX - rect.left) * W) / rect.width, y: ((e.clientY - rect.top) * H) / rect.height };
	};

	const apply = (p: { x: number; y: number }) => {
		const drag = dragRef.current;
		if (!drag) return;
		if (drag.handle === "root") {
			onOffsetChange(clamp(Math.round((drag.lean * (CX - p.x) * 100) / HALF), -100, 100));
			return;
		}
		const dx = (p.x - rootX(drag.lean)) * drag.lean;
		const dy = Math.max(0, BASE_Y - p.y);
		onAngleChange(clamp(Math.round((Math.atan2(dy, dx) * 180) / Math.PI), 0, 90));
	};

	const keyStep = (handle: Handle) => (e: React.KeyboardEvent) => {
		const step = e.shiftKey ? 10 : 1;
		const delta = e.key === "ArrowRight" || e.key === "ArrowUp" ? step : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : 0;
		if (!delta) return;
		e.preventDefault();
		if (handle === "tip") onAngleChange(clamp(theta + delta, 0, 90));
		else onOffsetChange(clamp(off + delta, -100, 100));
	};

	const handleClass = (h: Handle) => (active === h ? "stroke-accent" : "stroke-fg");

	return (
		<div className="grid w-full gap-2">
			{label ? (
				<div className="flex flex-row justify-between items-center gap-2">
					<span className="text-[13px] font-medium text-fg-secondary">{label}</span>
					<span className="font-mono text-xs text-fg tabular-nums whitespace-nowrap">
						{theta}° · {off === 0 ? "0%" : `${off > 0 ? "cross" : "split"} ${Math.abs(off)}%`}
					</span>
				</div>
			) : null}
			<svg
				ref={svgRef}
				viewBox={`0 0 ${W} ${H}`}
				className="w-full h-auto touch-none cursor-pointer select-none rounded-surface bg-surface-sunken ring-1 ring-line-subtle"
				onPointerDown={(e) => {
					e.preventDefault();
					e.currentTarget.setPointerCapture(e.pointerId);
					// Grab whichever of the four handles is nearest the press. Coincident roots (offset 0) are
					// one point with two rays: take the ray leaning toward the press, so dragging out splits.
					const p = toView(e);
					let best = { handle: "tip" as Handle, lean: 1, dist: Infinity };
					for (const r of rays) {
						for (const [handle, x, y] of [["tip", r.tx, r.ty], ["root", r.rx, BASE_Y]] as const) {
							const dist = Math.hypot(p.x - x, p.y - y);
							if (dist < best.dist) best = { handle, lean: r.lean, dist };
						}
					}
					if (best.handle === "root" && Math.abs(d) < 1) best.lean = p.x >= CX ? 1 : -1;
					dragRef.current = best;
					setActive(best.handle);
					apply(p);
				}}
				onPointerMove={(e) => apply(toView(e))}
				onPointerUp={() => {
					dragRef.current = null;
					setActive(null);
				}}
				onPointerCancel={() => {
					dragRef.current = null;
					setActive(null);
				}}
			>
				{/* The edge, its two vertices and midpoint. */}
				<line x1={CX - HALF} y1={BASE_Y} x2={CX + HALF} y2={BASE_Y} className="stroke-line-strong" strokeWidth={1} />
				{[CX - HALF, CX, CX + HALF].map((x) => (
					<line key={x} x1={x} y1={BASE_Y - 4} x2={x} y2={BASE_Y + 4} className="stroke-line-strong" strokeWidth={1} />
				))}
				{/* Split: the edge between the roots is part of the pattern, so it draws like a ray. */}
				{off < 0 ? (
					<line x1={rays[1].rx} y1={BASE_Y} x2={rays[0].rx} y2={BASE_Y} className="stroke-fg" strokeWidth={1.5} strokeLinecap="round" />
				) : null}
				{rays.map((r) => (
					<g key={r.lean}>
						<line x1={r.rx} y1={BASE_Y} x2={r.rx} y2={10} className="stroke-line" strokeWidth={1} strokeDasharray="2 3" />
						<path d={r.arc} fill="none" className="stroke-fg-muted" strokeWidth={1} />
						{stacked ? null : (
							<text x={r.lx} y={r.ly} textAnchor="middle" dominantBaseline="central" fontSize={11} className="fill-fg-secondary font-mono pointer-events-none">
								{theta}°
							</text>
						)}
						<line x1={r.rx} y1={BASE_Y} x2={r.tx} y2={r.ty} className="stroke-fg" strokeWidth={1.5} strokeLinecap="round" />
					</g>
				))}
				{stacked ? (
					<text x={CX} y={BASE_Y + 11} textAnchor="middle" dominantBaseline="central" fontSize={11} className="fill-fg-secondary font-mono pointer-events-none">
						{theta}°
					</text>
				) : null}
				{/* Handles last so they sit over every ray. Only the left-leaning ray's handles take focus (its
				    root sits at CX + d, so ArrowRight raises the offset); the mirror would be a redundant stop. */}
				{rays.map((r) => (
					<g key={r.lean}>
						<circle
							cx={r.rx}
							cy={BASE_Y}
							r={4}
							className={`fill-fg ${handleClass("root")} outline-none`}
							strokeWidth={active === "root" ? 2 : 0}
							{...(r.lean === -1
								? {
										tabIndex: 0,
										role: "slider",
										"aria-label": "Edge offset",
										"aria-valuemin": -100,
										"aria-valuemax": 100,
										"aria-valuenow": off,
										"aria-valuetext": off === 0 ? "midpoint" : `${off > 0 ? "cross" : "split"} ${Math.abs(off)} percent`,
										onKeyDown: keyStep("root"),
										onFocus: () => setActive("root"),
										onBlur: () => setActive(null),
									}
								: { "aria-hidden": true })}
						/>
						<circle
							cx={r.tx}
							cy={r.ty}
							r={5.5}
							className={`fill-white ${handleClass("tip")} outline-none`}
							strokeWidth={1.5}
							{...(r.lean === -1
								? {
										tabIndex: 0,
										role: "slider",
										"aria-label": "Islamic angle",
										"aria-valuemin": 0,
										"aria-valuemax": 90,
										"aria-valuenow": theta,
										"aria-valuetext": `${theta} degrees`,
										onKeyDown: keyStep("tip"),
										onFocus: () => setActive("tip"),
										onBlur: () => setActive(null),
									}
								: { "aria-hidden": true })}
						/>
					</g>
				))}
			</svg>
		</div>
	);
}
