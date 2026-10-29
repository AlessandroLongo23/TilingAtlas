// The gestures of an embedded Poincaré disk. /play's disk reads pan and rotation from the global store,
// which its p5 layer writes; an embedded disk (the landing wall's Hyperbolic cell, the Tiling Searcher's results)
// must not steer that store or be steered by it, so useDiskInput writes a per-instance
// HyperbolicViewInput, which HyperbolicCanvas takes through its `input` prop.
//
// Controls match /play's hyperbolic view exactly: drag pans (a Möbius translation, so the tiling slides
// under the pointer and the disk stays put), the bare wheel rotates in 5° detents (the disk has no zoom:
// its radius is fixed), a click folds the tile under the cursor to the centre, and right-click recentres.

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { useTouchGestures } from "@/lib/render/touchGestures";
import {
	ROTATE_SNAP_DEG,
	accumulateDetents,
	makeCardControls,
	stepCardControls,
	wheelDeltaPx,
	wrap360,
	type CardControls,
} from "@/lib/render/viewControls";
import type { HyperbolicViewInput } from "@/components/hyperbolic-canvas";

// Pointer travel, in px, under which a press-release counts as a click, not a pan. Same threshold /play
// uses (components/canvas.tsx CLICK_DRAG_THRESHOLD_PX).
const CLICK_DRAG_THRESHOLD_PX = 5;

/**
 * Gestures on `hostRef` into a HyperbolicViewInput, eased in this hook's own frame loop while `running`.
 * `activeRef` gates them: the landing wall's card takes input only once activated, so the page scrolls
 * past it until then; a disk that is always live passes a ref holding true.
 */
export function useDiskInput(hostRef: RefObject<HTMLElement | null>, activeRef: RefObject<boolean>, running = true) {
	// Mutated in place: the object identity never changes, so the canvas's render loop can hold onto it.
	const inputRef = useRef<HyperbolicViewInput>({
		offset: { x: 0, y: 0 },
		targetOffset: { x: 0, y: 0 },
		rotationDeg: 0,
		resetSeq: 0,
		click: null,
	});
	// Zoom is unused (the disk has none), so any value does; 1 keeps the ease a no-op.
	const controlsRef = useRef<CardControls>(makeCardControls(1));
	const dragRef = useRef<{ id: number; x: number; y: number; startX: number; startY: number } | null>(null);
	const clickSeq = useRef(0);

	// Ease the controls and publish them. `false` disables the pivot-about-centre offset compensation: the
	// disk applies rotation as θ inside its own Möbius map and derives its pan from the raw offset, so
	// rotating the offset here too would double-count the spin (/play skips the same step).
	useEffect(() => {
		if (!running) return;
		let raf = 0;
		const tick = () => {
			raf = requestAnimationFrame(tick);
			const c = controlsRef.current;
			stepCardControls(c, false);
			const input = inputRef.current;
			input.offset.x = c.offset.x;
			input.offset.y = c.offset.y;
			input.targetOffset.x = c.targetOffset.x;
			input.targetOffset.y = c.targetOffset.y;
			input.rotationDeg = c.rotation;
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [running]);

	// Wheel → rotation detents. A non-passive DOM listener, because React's onWheel cannot preventDefault;
	// inert while inactive, so the page scrolls normally until then.
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		const onWheel = (e: WheelEvent) => {
			if (!activeRef.current) return;
			e.preventDefault();
			const c = controlsRef.current;
			const { steps, accum } = accumulateDetents(c.scrollAccum, wheelDeltaPx(e));
			c.scrollAccum = accum;
			if (steps !== 0) c.targetRotation = wrap360(c.targetRotation + steps * ROTATE_SNAP_DEG);
		};
		host.addEventListener("wheel", onWheel, { passive: false });
		return () => host.removeEventListener("wheel", onWheel);
	}, [hostRef, activeRef]);

	// Snap home instead of easing home: the canvas syncs its own pan bookkeeping to whatever offset it sees
	// on the reset frame, so a glide back to the origin afterwards would be read as a fresh drag and pan
	// the disk straight off centre again.
	const resetView = () => {
		const c = controlsRef.current;
		c.offset.x = c.offset.y = c.targetOffset.x = c.targetOffset.y = 0;
		c.rotation = c.targetRotation = 0;
		c.prevRotation = 0;
		c.scrollAccum = 0;
		inputRef.current.resetSeq++;
	};

	// Fingers, as on /play's disk: two fingers pan by their midpoint and twist to turn the disk (it has no
	// zoom, so the spread is ignored), and a double-tap is the right-click recentre.
	const touch = useTouchGestures(hostRef, {
		pinchStart: () => {
			dragRef.current = null;
		},
		pinch: ({ from, to, rotate }) => {
			if (!activeRef.current) return;
			const c = controlsRef.current;
			c.targetOffset.x += to.x - from.x;
			c.targetOffset.y += to.y - from.y;
			// Negated: the disk turns by +θ counter-clockwise (su11Rotation acts in its y-up frame), while a
			// positive twist is clockwise on screen. The pattern follows the fingers this way round.
			const deg = (-rotate * 180) / Math.PI;
			c.rotation += deg;
			c.targetRotation = wrap360(c.targetRotation + deg);
		},
		doubleTap: () => {
			if (activeRef.current) resetView();
		},
	});

	const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.id !== e.pointerId) return;
		dragRef.current = null;
		// A finger's tap is how a phone dismisses things and the first half of the double-tap reset, so on
		// touch it does not fold (the /play disk makes the same exception); only a click does.
		if (e.pointerType === "touch") return;
		// A press that barely moved is a click: fold the tile under it to the disk centre, in the centred
		// CSS px the canvas expects.
		if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) >= CLICK_DRAG_THRESHOLD_PX) return;
		const rect = e.currentTarget.getBoundingClientRect();
		inputRef.current.click = {
			x: e.clientX - rect.left - rect.width / 2,
			y: e.clientY - rect.top - rect.height / 2,
			seq: ++clickSeq.current,
		};
	};

	const handlers = {
		onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
			if (e.button === 2) {
				resetView();
				return;
			}
			// An inactive card's first click activates it (via focus) and deliberately does NOT start a pan,
			// so an activation click never jolts the view.
			if (e.button !== 0 || !activeRef.current || touch.pinching) return;
			dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
			e.currentTarget.setPointerCapture(e.pointerId);
		},
		onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
			if (touch.pinching) return;
			const drag = dragRef.current;
			if (!drag || drag.id !== e.pointerId) return;
			const c = controlsRef.current;
			c.targetOffset.x += e.clientX - drag.x;
			c.targetOffset.y += e.clientY - drag.y;
			drag.x = e.clientX;
			drag.y = e.clientY;
		},
		onPointerUp,
		onPointerCancel: onPointerUp,
		onContextMenu: (e: { preventDefault(): void }) => e.preventDefault(),
	};
	/** Drop a drag in progress: call when input is switched off mid-drag (focus moved away, Esc). */
	const release = () => (dragRef.current = null);
	return { inputRef, resetView, handlers, release };
}
