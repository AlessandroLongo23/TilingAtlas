"use client";

import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils/cn";
import {
	HyperbolicDevelopedCanvas,
	type HyperbolicViewInput,
} from "@/components/hyperbolic-developed-canvas";
import { useCardActivation } from "@/lib/hooks/useCardActivation";
import { useInViewMount } from "@/lib/hooks/useInViewMount";
import {
	ROTATE_SNAP_DEG,
	accumulateDetents,
	makeCardControls,
	stepCardControls,
	wheelDeltaPx,
	wrap360,
	type CardControls,
} from "@/lib/render/viewControls";
import type { CataloguePatch } from "@/lib/render/hyperbolicDevelopedDraw";

// The Hyperbolic cell's media on the landing wall: the real Poincaré disk, not a baked still.
//
// Unlike the sphere, HyperbolicDevelopedCanvas does not own its input — on /play the p5 layer writes
// pan and rotation into the global configuration store and the disk reads them there. A landing card
// must not steer that store (it would follow the reader into /play), so this component owns a
// per-instance CardControls, eases it in its own rAF, and hands the result to the canvas through its
// `input` prop. Same maths, same feel, no shared state.
//
// Controls match /play's hyperbolic view exactly: drag pans (a Möbius translation, so the tiling
// slides under the pointer and the disk stays put), the bare wheel rotates in 5° detents (the disk
// has no zoom — its radius is fixed), a click folds the tile under the cursor to the centre, and
// right-click recentres.

// Pointer travel, in px, under which a press-release counts as a click, not a pan. Same
// threshold /play uses (components/canvas.tsx CLICK_DRAG_THRESHOLD_PX).
const CLICK_DRAG_THRESHOLD_PX = 5;

export function InteractiveHyperbolicMini({ patchId, patch }: { patchId: string; patch?: CataloguePatch }) {
	const { active, activeRef, hostProps } = useCardActivation();
	const { ref: mountRef, inView } = useInViewMount();
	const hostRef = useRef<HTMLDivElement | null>(null);

	// The view the canvas reads each frame. Mutated in place — the object identity never changes, so
	// the canvas's render loop can hold onto it.
	const inputRef = useRef<HyperbolicViewInput>({
		offset: { x: 0, y: 0 },
		targetOffset: { x: 0, y: 0 },
		rotationDeg: 0,
		resetSeq: 0,
		click: null,
	});
	// Zoom is unused here (the disk has none), so any value does; 1 keeps the ease a no-op.
	const controlsRef = useRef<CardControls>(makeCardControls(1));
	const dragRef = useRef<{ id: number; x: number; y: number; startX: number; startY: number } | null>(null);
	const clickSeq = useRef(0);

	// Ease the controls and publish them. `false` disables the pivot-about-centre offset compensation:
	// the disk applies rotation as θ inside its own Möbius map and derives its pan from the raw offset,
	// so rotating the offset here too would double-count the spin (/play skips the same step).
	useEffect(() => {
		if (!inView) return;
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
	}, [inView]);

	// Deactivating mid-drag (focus moved away, Esc) must not leave the pan latched to a pointer that is
	// no longer ours.
	useEffect(() => {
		if (!active) dragRef.current = null;
	}, [active]);

	// Wheel → rotation detents. A non-passive DOM listener, because React's onWheel cannot
	// preventDefault; inert until the card is active, so the page scrolls normally until then.
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
	}, [activeRef]);

	// Snap home instead of easing home: the canvas syncs its own pan bookkeeping to whatever offset it
	// sees on the reset frame, so a glide back to the origin afterwards would be read as a fresh drag
	// and pan the disk straight off centre again.
	const resetView = () => {
		const c = controlsRef.current;
		c.offset.x = c.offset.y = c.targetOffset.x = c.targetOffset.y = 0;
		c.rotation = c.targetRotation = 0;
		c.prevRotation = 0;
		c.scrollAccum = 0;
		inputRef.current.resetSeq++;
	};

	const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (e.button === 2) {
			resetView();
			return;
		}
		if (e.button !== 0) return;
		// First click activates (via focus); it deliberately does NOT start a pan, so an activation
		// click never jolts the view.
		if (!activeRef.current) return;
		dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
		e.currentTarget.setPointerCapture(e.pointerId);
	};

	const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.id !== e.pointerId) return;
		const c = controlsRef.current;
		c.targetOffset.x += e.clientX - drag.x;
		c.targetOffset.y += e.clientY - drag.y;
		drag.x = e.clientX;
		drag.y = e.clientY;
	};

	const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.id !== e.pointerId) return;
		dragRef.current = null;
		// A press that barely moved is a click: fold the tile under it to the disk centre, in the
		// centred CSS px the canvas expects.
		if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) >= CLICK_DRAG_THRESHOLD_PX) return;
		const rect = e.currentTarget.getBoundingClientRect();
		inputRef.current.click = {
			x: e.clientX - rect.left - rect.width / 2,
			y: e.clientY - rect.top - rect.height / 2,
			seq: ++clickSeq.current,
		};
	};

	return (
		<div
			ref={(el) => {
				hostRef.current = el;
				mountRef.current = el;
			}}
			role="application"
			aria-label="Interactive hyperbolic tiling — drag to pan, scroll to rotate"
			{...hostProps}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
			onContextMenu={(e) => e.preventDefault()}
			className={cn(
				"absolute inset-0 select-none outline-none",
				active ? "cursor-grab" : "cursor-pointer",
			)}
		>
			{inView ? (
				// diskPadPx 0: nothing floats over this canvas, so the rim goes to the cell edge.
				<HyperbolicDevelopedCanvas patchId={patchId} data={patch} input={inputRef} diskPadPx={0} />
			) : null}
		</div>
	);
}
