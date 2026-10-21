"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useReducedMotion } from "motion/react";
import { CURVE_PRESETS, easeCurve, type Curve } from "@/lib/render/viewPath";
import { cn } from "@/lib/utils/cn";

// A segment's speed curve, edited like a curves adjustment in a photo editor: time across, progress up,
// the diagonal is constant speed. The two handles are the cubic's control points, each tied to its end
// of the curve by a line; presets set both at once.

const S = 104; // drawing size in px
const PAD = 6;
const toX = (x: number) => PAD + x * S;
const toY = (y: number) => PAD + (1 - y) * S;

/** The curve as an SVG path at `size`, sampled through easeCurve so it shows exactly what plays. */
export function curvePath(c: Curve, w: number, h: number, steps = 24): string {
	return Array.from({ length: steps + 1 }, (_, i) => {
		const u = i / steps;
		return `${i ? "L" : "M"}${(u * w).toFixed(1)},${((1 - easeCurve(c, u)) * h).toFixed(1)}`;
	}).join(" ");
}

const same = (a: Curve, b: Curve) => a.every((v, i) => Math.abs(v - b[i]) < 1e-3);

export function SpeedCurveEditor({
	curve,
	onChange,
	onApplyAll,
}: {
	curve: Curve;
	onChange: (c: Curve) => void;
	onApplyAll: () => void;
}) {
	const svgRef = useRef<SVGSVGElement | null>(null);
	const drag = useRef<0 | 1 | null>(null);
	const morph = useRef(0);
	const reduce = useReducedMotion();

	// A preset morphs the curve into place instead of jumping, through onChange, so the track's strip and
	// any distance retiming follow it frame by frame.
	const morphTo = (to: Curve) => {
		cancelAnimationFrame(morph.current);
		if (reduce) return onChange(to);
		const from = curve;
		let start = -1;
		const step = (now: number) => {
			if (start < 0) start = now;
			const u = Math.min(1, (now - start) / 220);
			const e = 1 - (1 - u) ** 3;
			onChange(from.map((v, i) => v + (to[i] - v) * e) as Curve);
			if (u < 1) morph.current = requestAnimationFrame(step);
		};
		morph.current = requestAnimationFrame(step);
	};

	const at = (e: { clientX: number; clientY: number }) => {
		const r = svgRef.current!.getBoundingClientRect();
		const clamp = (v: number) => Math.min(1, Math.max(0, v));
		return [clamp((e.clientX - r.left - PAD) / S), clamp(1 - (e.clientY - r.top - PAD) / S)];
	};
	const down = (e: ReactPointerEvent, h: 0 | 1) => {
		cancelAnimationFrame(morph.current);
		e.stopPropagation();
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		drag.current = h;
	};
	const move = (e: ReactPointerEvent) => {
		if (drag.current === null) return;
		const [x, y] = at(e);
		onChange(drag.current === 0 ? [x, y, curve[2], curve[3]] : [curve[0], curve[1], x, y]);
	};

	const handle = (h: 0 | 1) => {
		const [x, y] = h === 0 ? [curve[0], curve[1]] : [curve[2], curve[3]];
		const [ex, ey] = h === 0 ? [0, 0] : [1, 1];
		return (
			<g key={h}>
				<line x1={toX(ex)} y1={toY(ey)} x2={toX(x)} y2={toY(y)} className="stroke-fg-muted" strokeWidth={1} />
				<circle
					cx={toX(x)}
					cy={toY(y)}
					r={5}
					className="cursor-move fill-surface-raised stroke-accent"
					strokeWidth={2}
					onPointerDown={(e) => down(e, h)}
					onPointerMove={move}
					onPointerUp={() => (drag.current = null)}
				/>
			</g>
		);
	};

	return (
		<div className="flex items-start gap-2">
			<svg
				ref={svgRef}
				width={S + 2 * PAD}
				height={S + 2 * PAD}
				className="shrink-0 touch-none"
				aria-label="Speed curve"
			>
				<rect x={PAD} y={PAD} width={S} height={S} className="fill-surface-sunken stroke-line" />
				{[0.25, 0.5, 0.75].map((g) => (
					<g key={g} className="stroke-line" strokeWidth={0.5}>
						<line x1={toX(g)} y1={toY(0)} x2={toX(g)} y2={toY(1)} />
						<line x1={toX(0)} y1={toY(g)} x2={toX(1)} y2={toY(g)} />
					</g>
				))}
				<line x1={toX(0)} y1={toY(0)} x2={toX(1)} y2={toY(1)} className="stroke-line" strokeDasharray="3 3" />
				<path
					d={curvePath(curve, S, S)}
					transform={`translate(${PAD},${PAD})`}
					fill="none"
					className="stroke-accent"
					strokeWidth={2}
				/>
				{handle(0)}
				{handle(1)}
			</svg>
			<div className="flex flex-col gap-1">
				{CURVE_PRESETS.map((p) => (
					<button
						key={p.name}
						type="button"
						onClick={() => morphTo(p.curve)}
						className={cn(
							"rounded px-1.5 py-0.5 text-left text-[11px] whitespace-nowrap transition-colors hover:bg-surface-overlay",
							same(p.curve, curve) ? "bg-surface-sunken text-fg" : "text-fg-muted",
						)}
					>
						{p.name}
					</button>
				))}
				<button
					type="button"
					onClick={onApplyAll}
					className="mt-1 rounded px-1.5 py-0.5 text-left text-[11px] whitespace-nowrap text-fg-muted underline-offset-2 hover:text-fg hover:underline"
				>
					Apply to all moves
				</button>
			</div>
		</div>
	);
}
