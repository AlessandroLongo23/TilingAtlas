"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// Fingers on the atlas' canvases. Every live canvas already pans with a single pointer (Pointer Events,
// or p5's mouse model on /play), and that path is left exactly as it is: one finger IS a mouse drag.
// This module adds what a mouse gets from its wheel and its other buttons, for touch pointers only:
//
//   - two fingers: pinch to zoom about their midpoint, move the midpoint to pan, twist to rotate;
//   - a tap, for the pages where hovering shows something (a finger has no hover);
//   - double-tap: back to the home view (right-click, middle-click or double-click on the desktop).
//
// It is a bookkeeper, not a view model. It listens to an element's pointer events and hands back steps
// the canvas applies to its own state (lib/render/viewControls.ts `pinchOffsetView` for the
// CardControls-shaped views). Mouse and pen events are never tracked, so a canvas wired through here
// behaves on the desktop exactly as it did before.
//
// Its listeners sit on the element itself, so they run before the element's React handlers (React
// listens at the root) and before p5's (on the window). By the time a canvas's own pointerdown runs,
// `pinching` already says whether this finger is the second of two, and the one-finger path steps aside.

type Pt = { x: number; y: number };

/** The fields of a PointerEvent the tracker reads. */
export interface PointerLike {
	pointerId: number;
	pointerType: string;
	clientX: number;
	clientY: number;
	type: string;
	timeStamp: number;
}

/**
 * One step of a two-finger gesture, in the element's CENTRED CSS px (origin at its centre, y down),
 * the frame every view offset in the atlas lives in.
 */
export interface PinchStep {
	/** The fingers' midpoint at the previous step. */
	from: Pt;
	/** Their midpoint now. `to - from` is the pan. */
	to: Pt;
	/** Finger spread now over spread before: above 1 the fingers opened (zoom in). */
	scale: number;
	/** Turn to apply, radians, screen frame (y down), so positive is clockwise, the sense a positive view
	 *  angle turns every renderer. Zero until the twist clears TWIST_DEAD_DEG (see there). */
	rotate: number;
}

export interface TouchGestureHandlers {
	/** A second finger landed. Drop whatever the first finger started (a pan, a tool stroke). */
	pinchStart?: () => void;
	/** The fingers moved. */
	pinch?: (step: PinchStep) => void;
	/** The last finger of a two-finger gesture lifted: commit what the steps only previewed. */
	pinchEnd?: () => void;
	/** One quick tap, in px from the element's top-left corner: what hovering there shows a mouse. Both
	 *  taps of a double-tap fire it, before doubleTap. */
	tap?: (x: number, y: number) => void;
	/** Two quick taps in the same place. */
	doubleTap?: () => void;
}

/** A press shorter than this, moving less than TAP_SLOP_PX, is a tap. */
const TAP_MAX_MS = 350;
const TAP_SLOP_PX = 10;
/** A tap that lands this soon after the previous one lifted, this close to it, makes a double-tap.
 *  Measured from the first lift to the second press, as Android's GestureDetector does (its window is
 *  300 ms; a little more forgives a slow hand without catching two deliberate single taps). Timed with
 *  the events' own timestamps, so a main thread busy drawing does not stretch the gap it measures. */
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP_PX = 32;
/**
 * Twist a pinch may carry before it turns the view, degrees summed over the gesture. Two fingers that
 * only mean to zoom still drift a few degrees, and without this every zoom left the pattern tilted.
 * Past it the view turns by the angle beyond it, so the turn starts from zero with no jump.
 */
export const TWIST_DEAD_DEG = 12;

/** Was a press (where and when it went down) released as a tap by `up`? */
export function isTap(press: Pt & { t: number }, up: PointerLike): boolean {
	return (
		up.type !== "pointercancel" &&
		up.timeStamp - press.t <= TAP_MAX_MS &&
		Math.hypot(up.clientX - press.x, up.clientY - press.y) <= TAP_SLOP_PX
	);
}

/** A press that lands on a control inside the canvas's element (a Done chip, an overlay button) is the
 *  control's, never the start of a gesture on the canvas. */
const onControl = (e: Event) =>
	e.target !== e.currentTarget && !!(e.target as Element | null)?.closest?.("button, a, input, select, label");

export class TouchGestures {
	/** Read per event. Null tracks the fingers but reports nothing. */
	handlers: TouchGestureHandlers | null;
	private pts = new Map<number, Pt>();
	private multi = false;
	private twist = 0;
	private twisting = false;
	private press: (Pt & { t: number }) | null = null;
	private lastTap: (Pt & { t: number }) | null = null;

	/**
	 * @param el       the element whose box the steps are measured in (read per step). attach() sets it;
	 *                 a caller that feeds down/move/up itself passes it here.
	 * @param handlers see `handlers`
	 */
	constructor(
		private el: () => Element | null = () => null,
		handlers: TouchGestureHandlers | null = null,
	) {
		this.handlers = handlers;
	}

	/** Swap the handlers, e.g. for the ones a component's latest render made. */
	use(handlers: TouchGestureHandlers | null): void {
		this.handlers = handlers;
	}

	/** True from the moment a second finger lands until the last finger lifts. While it holds, the
	 *  caller's one-finger path must stay out of the way, even after one of the two fingers has lifted. */
	get pinching(): boolean {
		return this.multi;
	}

	/** Listen to `el`'s pointer events; its box is the frame the steps are measured in. Returns the
	 *  unbinder, so it drops straight into an effect's cleanup. */
	attach(el: Element): () => void {
		this.el = () => el;
		const down = (e: Event) => {
			if (!onControl(e)) this.down(e as PointerEvent);
		};
		const move = (e: Event) => this.move(e as PointerEvent);
		const up = (e: Event) => this.up(e as PointerEvent);
		const events = [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", up]] as const;
		for (const [type, fn] of events) el.addEventListener(type, fn);
		return () => {
			for (const [type, fn] of events) el.removeEventListener(type, fn);
		};
	}

	/** Feed a pointerdown. True when the pointer belongs to a multi-finger gesture. */
	down(e: PointerLike): boolean {
		if (e.pointerType !== "touch") return false;
		this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (this.pts.size === 1) {
			this.multi = false;
			this.press = { x: e.clientX, y: e.clientY, t: e.timeStamp };
			return false;
		}
		this.press = null;
		this.lastTap = null;
		if (!this.multi) {
			this.multi = true;
			this.twist = 0;
			this.twisting = false;
			this.handlers?.pinchStart?.();
		}
		return true;
	}

	/** Feed a pointermove. True when the move was consumed by a multi-finger gesture. */
	move(e: PointerLike): boolean {
		if (e.pointerType !== "touch") return false;
		const prev = this.pts.get(e.pointerId);
		if (!prev) return this.multi;
		const next = { x: e.clientX, y: e.clientY };
		if (!this.multi) {
			this.pts.set(e.pointerId, next);
			if (this.press && Math.hypot(next.x - this.press.x, next.y - this.press.y) > TAP_SLOP_PX) this.press = null;
			return false;
		}
		// The gesture is carried by the first two fingers down; a third rides along without steering.
		const ids = [...this.pts.keys()];
		const i = ids.indexOf(e.pointerId);
		if (i > 1 || this.pts.size < 2) {
			this.pts.set(e.pointerId, next);
			return true;
		}
		const a0 = this.pts.get(ids[0])!, b0 = this.pts.get(ids[1])!;
		this.pts.set(e.pointerId, next);
		const a1 = this.pts.get(ids[0])!, b1 = this.pts.get(ids[1])!;
		const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
		const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
		const el = this.el();
		if (!el || d0 < 1 || d1 < 1) return true;
		const r = el.getBoundingClientRect();
		const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
		let rotate = Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x);
		if (rotate > Math.PI) rotate -= 2 * Math.PI;
		else if (rotate < -Math.PI) rotate += 2 * Math.PI;
		if (!this.twisting) {
			this.twist += rotate;
			const dead = (TWIST_DEAD_DEG * Math.PI) / 180;
			this.twisting = Math.abs(this.twist) > dead;
			rotate = this.twisting ? this.twist - Math.sign(this.twist) * dead : 0;
		}
		this.handlers?.pinch?.({
			from: { x: (a0.x + b0.x) / 2 - cx, y: (a0.y + b0.y) / 2 - cy },
			to: { x: (a1.x + b1.x) / 2 - cx, y: (a1.y + b1.y) / 2 - cy },
			scale: d1 / d0,
			rotate,
		});
		return true;
	}

	/** Feed a pointerup or pointercancel. True when the pointer was part of a multi-finger gesture. */
	up(e: PointerLike): boolean {
		if (e.pointerType !== "touch" || !this.pts.delete(e.pointerId)) return false;
		const wasMulti = this.multi;
		if (this.pts.size > 0) return wasMulti;
		this.multi = false;
		const press = this.press;
		this.press = null;
		if (wasMulti) {
			this.handlers?.pinchEnd?.();
			return true;
		}
		// A cancelled pointer is the browser taking the gesture back, never a tap. A drag or a cancel
		// between two taps also means they were not one gesture.
		if (!press || !isTap(press, e)) {
			this.lastTap = null;
			return false;
		}
		const r = this.el()?.getBoundingClientRect();
		if (r) this.handlers?.tap?.(press.x - r.left, press.y - r.top);
		const last = this.lastTap;
		if (last && press.t - last.t < DOUBLE_TAP_MS && Math.hypot(press.x - last.x, press.y - last.y) < DOUBLE_TAP_SLOP_PX) {
			this.lastTap = null;
			this.handlers?.doubleTap?.();
		} else {
			this.lastTap = { x: press.x, y: press.y, t: e.timeStamp };
		}
		return false;
	}
}

/**
 * A TouchGestures on the element in `ref`, for a React component. `handlers` may be a fresh object
 * every render: the latest one answers each event, so the handlers can read props and state directly.
 * Pass null to leave the element alone (a card that is not live yet). Returns the tracker, whose
 * `pinching` the component's own one-finger handlers check first.
 */
export function useTouchGestures(ref: RefObject<Element | null>, handlers: TouchGestureHandlers | null): TouchGestures {
	const [touch] = useState(() => new TouchGestures());
	const bound = useRef<{ el: Element; off: () => void } | null>(null);
	// Every commit: take this render's handlers, and follow the ref if the element was swapped.
	useEffect(() => {
		touch.use(handlers);
		const el = ref.current;
		if (bound.current?.el === el) return;
		bound.current?.off();
		bound.current = el ? { el, off: touch.attach(el) } : null;
	});
	useEffect(
		() => () => {
			bound.current?.off();
			bound.current = null;
		},
		[],
	);
	return touch;
}

// The phone layout puts a visible Reset button over every canvas, since a touch screen has no right
// button. Page chrome and canvas live in different components, so the button does not call into the
// canvas: it broadcasts, and every live canvas on the page that owns a view listens and returns home.
const RESET_EVENT = "ta:reset-view";

/** Send every live canvas on the page back to its home view: what right-click does on the desktop. */
export function requestViewReset(): void {
	window.dispatchEvent(new Event(RESET_EVENT));
}

/** Listen for requestViewReset. Returns the unsubscribe, so it drops straight into a useEffect. */
export function onViewReset(fn: () => void): () => void {
	window.addEventListener(RESET_EVENT, fn);
	return () => window.removeEventListener(RESET_EVENT, fn);
}
