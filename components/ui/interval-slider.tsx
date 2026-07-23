"use client";

import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils/cn";
import { tickIntervals } from "./range-input";

// The dual-thumb sibling of <RangeInput>: same .ta-track anatomy (2px square-ended track, ticks for
// short value sets, 12px square thumbs), but the value is an interval [lo, hi] and the selected span
// is filled between the two thumbs. No native <input type="range"> pair can express the coincident-
// handle rule below, so the track handles pointers itself and each thumb is its own ARIA slider
// (role="slider" + arrow keys) for keyboard and screen-reader access.
//
// Pointer rules:
//  - A press picks the NEAREST bound and jumps it to the pressed value; dragging keeps moving it.
//  - Bounds never cross — dragging one into the other clamps them coincident.
//  - Coincident bounds: pressing left of them moves lo, right of them moves hi, and pressing ON them
//    is ambiguous — nothing moves until the drag direction (left ⇒ lo, right ⇒ hi) resolves it; a
//    plain click there does nothing. The same wait-for-direction rule settles a press exactly midway
//    between two distinct bounds.

/** Which bound a press engages; "pending" = ambiguous until the drag direction resolves it. */
export type IntervalBound = "lo" | "hi" | "pending";

/** Bound selection for a press at value v. Nearest bound wins; ties (coincident bounds hit head-on,
 *  or the exact midpoint between distinct bounds) stay pending. */
export function chooseBound(v: number, lo: number, hi: number): IntervalBound {
	if (lo === hi) return v < lo ? "lo" : v > hi ? "hi" : "pending";
	const dLo = Math.abs(v - lo);
	const dHi = Math.abs(v - hi);
	return dLo < dHi ? "lo" : dHi < dLo ? "hi" : "pending";
}

/** Move one bound to v, clamped so the interval never inverts (lo ≤ hi always). */
export function applyBound(bound: "lo" | "hi", v: number, [lo, hi]: [number, number]): [number, number] {
	return bound === "lo" ? [Math.min(v, hi), hi] : [lo, Math.max(v, lo)];
}

/** Snap a track fraction (0..1) to the nearest step, clamped to [min, max]. The rounding to 1e-6
 *  sheds the float dust of `min + n*step` so 0.1-style steps produce clean values. */
export function quantize(f: number, min: number, max: number, step: number): number {
	const raw = min + Math.min(1, Math.max(0, f)) * (max - min);
	const q = min + Math.round((raw - min) / step) * step;
	return Math.min(max, Math.max(min, Math.round(q * 1e6) / 1e6));
}

/** Horizontal pixels of drag it takes to resolve a pending (ambiguous) press into a direction.
 *  Big enough to swallow press jitter, small enough that any intentional drag decides instantly. */
const DIRECTION_THRESHOLD_PX = 3;

interface IntervalSliderProps {
	value: [number, number];
	onChange: (value: [number, number]) => void;
	min?: number;
	max?: number;
	step?: number;
	disabled?: boolean;
	/** Width (and any other box) utilities for the track. Defaults to filling its container. */
	className?: string;
	/** Group name for the thumbs' accessible labels: "<label> minimum" / "<label> maximum". */
	"aria-label"?: string;
}

export function IntervalSlider({
	value,
	onChange,
	min = 0,
	max = 100,
	step = 1,
	disabled = false,
	className = "w-full",
	"aria-label": ariaLabel = "Interval",
}: IntervalSliderProps) {
	const [lo, hi] = value;
	const trackRef = useRef<HTMLSpanElement>(null);
	// Latest committed value, so pointermoves that race a re-render never clamp against a stale bound.
	const valueRef = useRef(value);
	valueRef.current = value;
	const dragRef = useRef<{ pointerId: number; bound: IntervalBound; startX: number } | null>(null);

	const span = max - min;
	const fLo = span > 0 ? (lo - min) / span : 0;
	const fHi = span > 0 ? (hi - min) / span : 0;
	const ticks = tickIntervals(min, max, step);

	// Same mapping the native control uses: thumb centres travel [6px, width-6px] (the 12px thumb).
	const valueAt = (clientX: number): number => {
		const rect = trackRef.current?.getBoundingClientRect();
		if (!rect || rect.width <= 12) return min;
		return quantize((clientX - rect.left - 6) / (rect.width - 12), min, max, step);
	};

	const emit = (next: [number, number]) => {
		const [curLo, curHi] = valueRef.current;
		if (next[0] !== curLo || next[1] !== curHi) onChange(next);
	};

	const handlePointerDown = (e: PointerEvent<HTMLSpanElement>) => {
		if (disabled || e.button !== 0) return;
		const v = valueAt(e.clientX);
		const [curLo, curHi] = valueRef.current;
		const bound = chooseBound(v, curLo, curHi);
		dragRef.current = { pointerId: e.pointerId, bound, startX: e.clientX };
		e.currentTarget.setPointerCapture(e.pointerId);
		if (bound !== "pending") emit(applyBound(bound, v, [curLo, curHi]));
	};

	const handlePointerMove = (e: PointerEvent<HTMLSpanElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== e.pointerId) return;
		if (drag.bound === "pending") {
			const dx = e.clientX - drag.startX;
			if (Math.abs(dx) < DIRECTION_THRESHOLD_PX) return;
			drag.bound = dx < 0 ? "lo" : "hi";
		}
		emit(applyBound(drag.bound, valueAt(e.clientX), valueRef.current));
	};

	const handlePointerEnd = (e: PointerEvent<HTMLSpanElement>) => {
		if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
	};

	const handleThumbKey = (bound: "lo" | "hi") => (e: KeyboardEvent<HTMLSpanElement>) => {
		if (disabled) return;
		const [curLo, curHi] = valueRef.current;
		const cur = bound === "lo" ? curLo : curHi;
		let next: number;
		switch (e.key) {
			case "ArrowLeft":
			case "ArrowDown":
				next = cur - step;
				break;
			case "ArrowRight":
			case "ArrowUp":
				next = cur + step;
				break;
			case "Home":
				next = min;
				break;
			case "End":
				next = max;
				break;
			default:
				return;
		}
		e.preventDefault();
		next = Math.min(max, Math.max(min, Math.round(next * 1e6) / 1e6));
		emit(applyBound(bound, next, [curLo, curHi]));
	};

	return (
		<span
			ref={trackRef}
			className={cn("ta-track ta-ival", disabled && "ta-ival-disabled", className)}
			style={{ "--lo": fLo, "--hi": fHi } as CSSProperties}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerEnd}
			onPointerCancel={handlePointerEnd}
		>
			<span className="ta-track-line" aria-hidden="true" />
			{ticks !== null ? (
				<span
					className="ta-track-ticks"
					style={{ "--ticks": ticks } as CSSProperties}
					aria-hidden="true"
				/>
			) : null}
			<span className="ta-ival-fill" aria-hidden="true" />
			<span className="ta-track-travel" style={{ "--f": fLo } as CSSProperties}>
				<span
					className="ta-track-thumb ta-ival-thumb"
					role="slider"
					tabIndex={disabled ? -1 : 0}
					aria-label={`${ariaLabel} minimum`}
					aria-valuemin={min}
					aria-valuemax={hi}
					aria-valuenow={lo}
					aria-disabled={disabled || undefined}
					onKeyDown={handleThumbKey("lo")}
				/>
			</span>
			<span className="ta-track-travel" style={{ "--f": fHi } as CSSProperties}>
				<span
					className="ta-track-thumb ta-ival-thumb"
					role="slider"
					tabIndex={disabled ? -1 : 0}
					aria-label={`${ariaLabel} maximum`}
					aria-valuemin={lo}
					aria-valuemax={max}
					aria-valuenow={hi}
					aria-disabled={disabled || undefined}
					onKeyDown={handleThumbKey("hi")}
				/>
			</span>
		</span>
	);
}
