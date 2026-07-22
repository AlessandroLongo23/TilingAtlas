"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";

/** Above this many intervals the marks are closer together than the 12px thumb and read as
 *  hatching rather than as positions, so they are dropped. */
const MAX_TICK_INTERVALS = 20;

/** Number of intervals to mark, or null when the value set is too large — or too irregular — to
 *  mark honestly. A range whose span is not a whole number of steps (min 0, max 10, step 3) has
 *  an off-grid last value, and evenly spaced marks would lie about where the thumb can land. */
function tickIntervals(min: number, max: number, step: number): number | null {
	if (!(step > 0) || !(max > min)) return null;
	const intervals = (max - min) / step;
	const whole = Math.round(intervals);
	if (Math.abs(intervals - whole) > 1e-9) return null;
	return whole >= 1 && whole <= MAX_TICK_INTERVALS ? whole : null;
}

interface RangeInputProps {
	id?: string;
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	disabled?: boolean;
	/** Width (and any other box) utilities for the track. Defaults to filling its container. */
	className?: string;
	"aria-label"?: string;
}

// The bare slider control of the squared w/b design system: a 2px square-ended track, a 12px
// square thumb, and — for short value sets — a tick per reachable value. Everything visible is a
// DOM element styled by .ta-track (globals.css); the native <input type="range"> sits transparent
// on top, so dragging, clicking the track, arrow keys, focus and screen readers all stay native.
export function RangeInput({
	id,
	value,
	onChange,
	min = 0,
	max = 100,
	step = 1,
	disabled = false,
	className = "w-full",
	"aria-label": ariaLabel,
}: RangeInputProps) {
	const f = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
	const ticks = tickIntervals(min, max, step);

	return (
		<span className={cn("ta-track", className)} style={{ "--f": f } as CSSProperties}>
			<span className="ta-track-line" aria-hidden="true" />
			{ticks !== null ? (
				<span
					className="ta-track-ticks"
					style={{ "--ticks": ticks } as CSSProperties}
					aria-hidden="true"
				/>
			) : null}
			<span className="ta-track-fill" aria-hidden="true" />
			<span className="ta-track-travel" aria-hidden="true">
				<span className="ta-track-thumb" />
			</span>
			<input
				id={id}
				type="range"
				className="ta-track-input"
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				aria-label={ariaLabel}
			/>
		</span>
	);
}
