"use client";

import { useRef, type CSSProperties, type PointerEvent } from "react";
import { cn } from "@/lib/utils/cn";
import { useIsPhone } from "@/lib/hooks/useIsPhone";
import { TOUCH_SLOP_PX, trackValueAt } from "./interval-slider";

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
	/** Keep the browser's own slider at 768px and up, with these classes on it: for the controls that
	 *  predate the tracked design. A phone still gets the track and its touch handling. */
	native?: string;
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
	native,
}: RangeInputProps) {
	const f = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;

	// On a phone the native input takes no pointer events (app/styles/mobile.css) and the track does the
	// pointer work: a mouse or pen moves the value at once, a finger only after it has moved sideways, so
	// a vertical swipe that starts on the slider scrolls the sheet and leaves the value alone. A tap
	// jumps. On a desktop the input covers the track and takes every press itself; these see none.
	const press = useRef<{ id: number; x: number; y: number; armed: boolean } | null>(null);
	const commit = (track: HTMLElement, clientX: number) => {
		const v = trackValueAt(track, clientX, min, max, step);
		if (v !== value) onChange(v);
	};
	const onPointerDown = (e: PointerEvent<HTMLSpanElement>) => {
		if (disabled || e.button !== 0 || e.target instanceof HTMLInputElement) return;
		const armed = e.pointerType !== "touch";
		press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, armed };
		if (!armed) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		commit(e.currentTarget, e.clientX);
	};
	const onPointerMove = (e: PointerEvent<HTMLSpanElement>) => {
		const p = press.current;
		if (!p || p.id !== e.pointerId) return;
		if (!p.armed) {
			const dx = Math.abs(e.clientX - p.x);
			const dy = Math.abs(e.clientY - p.y);
			if (dx < TOUCH_SLOP_PX && dy < TOUCH_SLOP_PX) return;
			if (dy >= dx) {
				press.current = null;
				return;
			}
			p.armed = true;
			e.currentTarget.setPointerCapture(e.pointerId);
		}
		commit(e.currentTarget, e.clientX);
	};
	const onPointerUp = (e: PointerEvent<HTMLSpanElement>) => {
		const p = press.current;
		press.current = null;
		if (p?.id === e.pointerId && !p.armed) commit(e.currentTarget, e.clientX);
	};

	const isPhone = useIsPhone();
	const onInput = (e: { target: HTMLInputElement }) => onChange(Number(e.target.value));
	if (native !== undefined && !isPhone) {
		return (
			<input
				id={id}
				type="range"
				className={native}
				value={value}
				onChange={onInput}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				aria-label={ariaLabel}
			/>
		);
	}

	return (
		<span
			className={cn("ta-track", className)}
			style={{ "--f": f } as CSSProperties}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={() => (press.current = null)}
		>
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
				onChange={onInput}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				aria-label={ariaLabel}
			/>
		</span>
	);
}
