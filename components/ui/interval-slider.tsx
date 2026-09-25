"use client";

import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils/cn";

// The dual-thumb sibling of <RangeInput>: same .ta-track anatomy (rounded track, 12px round thumbs),
// but the value is an interval [lo, hi] and the selected span
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

/** How far a finger moves before a press on a track counts as a drag. Sideways, it moves the value;
 *  up or down, it is the start of a scroll and the value is left alone. */
export const TOUCH_SLOP_PX = 8;

/** The value under clientX on a .ta-track: thumb centres travel [t/2, width - t/2] for a thumb t px
 *  wide, the same mapping the native control uses. t is read off the drawn thumb, 12px on a desktop and
 *  24px on a phone (app/styles/mobile.css). */
export function trackValueAt(track: HTMLElement, clientX: number, min: number, max: number, step: number): number {
	const rect = track.getBoundingClientRect();
	const t = track.querySelector<HTMLElement>(".ta-track-thumb")?.offsetWidth || 12;
	if (rect.width <= t) return min;
	return quantize((clientX - rect.left - t / 2) / (rect.width - t), min, max, step);
}

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
	useLayoutEffect(() => {
		valueRef.current = value;
	});
	// `armed` is false while a finger's press is still undecided between a drag and a scroll.
	const dragRef = useRef<{ pointerId: number; bound: IntervalBound; startX: number; startY: number; armed: boolean } | null>(
		null,
	);

	const span = max - min;
	const fLo = span > 0 ? (lo - min) / span : 0;
	const fHi = span > 0 ? (hi - min) / span : 0;

	const valueAt = (clientX: number): number =>
		trackRef.current ? trackValueAt(trackRef.current, clientX, min, max, step) : min;

	const emit = (next: [number, number]) => {
		const [curLo, curHi] = valueRef.current;
		if (next[0] !== curLo || next[1] !== curHi) onChange(next);
	};

	// Pick the bound a press at clientX engages and jump it there.
	const engage = (drag: NonNullable<typeof dragRef.current>, clientX: number) => {
		const v = valueAt(clientX);
		const [curLo, curHi] = valueRef.current;
		drag.bound = chooseBound(v, curLo, curHi);
		if (drag.bound !== "pending") emit(applyBound(drag.bound, v, [curLo, curHi]));
	};

	// A mouse or pen engages on press. A finger waits for TOUCH_SLOP_PX of sideways movement (moving up
	// or down first lets the sheet scroll, touch-action: pan-y on a phone) or engages on a plain tap.
	const handlePointerDown = (e: PointerEvent<HTMLSpanElement>) => {
		if (disabled || e.button !== 0) return;
		const armed = e.pointerType !== "touch";
		const drag = { pointerId: e.pointerId, bound: "pending" as IntervalBound, startX: e.clientX, startY: e.clientY, armed };
		dragRef.current = drag;
		if (!armed) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		engage(drag, e.clientX);
	};

	const handlePointerMove = (e: PointerEvent<HTMLSpanElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== e.pointerId) return;
		if (!drag.armed) {
			const dx = Math.abs(e.clientX - drag.startX);
			const dy = Math.abs(e.clientY - drag.startY);
			if (dx < TOUCH_SLOP_PX && dy < TOUCH_SLOP_PX) return;
			if (dy >= dx) {
				dragRef.current = null;
				return;
			}
			drag.armed = true;
			e.currentTarget.setPointerCapture(e.pointerId);
			engage(drag, drag.startX);
		}
		if (drag.bound === "pending") {
			const dx = e.clientX - drag.startX;
			if (Math.abs(dx) < DIRECTION_THRESHOLD_PX) return;
			drag.bound = dx < 0 ? "lo" : "hi";
		}
		emit(applyBound(drag.bound, valueAt(e.clientX), valueRef.current));
	};

	const handlePointerEnd = (e: PointerEvent<HTMLSpanElement>) => {
		const drag = dragRef.current;
		if (drag?.pointerId !== e.pointerId) return;
		dragRef.current = null;
		// A finger that lifted without moving: a tap, which jumps the nearest bound like a click.
		if (!drag.armed && e.type === "pointerup") engage(drag, drag.startX);
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
