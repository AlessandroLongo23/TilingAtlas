"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";

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

	return (
		<span className={cn("ta-track", className)} style={{ "--f": f } as CSSProperties}>
			<span className="ta-track-line" aria-hidden="true" />
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
