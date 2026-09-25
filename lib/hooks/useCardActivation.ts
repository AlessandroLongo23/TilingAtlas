"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, PointerEvent } from "react";
import { isTap } from "@/lib/render/touchGestures";

// Click-to-activate for an interactive canvas embedded in a page the reader SCROLLS — the landing
// wall's live cards, and the same contract the /theory preview cards run on.
//
// Why a card can't just be live: a wheel handler that zooms must preventDefault, which stops the page
// scrolling the moment the pointer crosses the card. So a card is inert until clicked and only then
// owns the wheel; Esc or clicking elsewhere hands it back. Activation IS focus, which makes it
// inherently exclusive — focusing one card blurs any other, so two cards can never both be live.
//
// Touch rides the same switch through `touchAction`: while inert the browser keeps the gesture and
// scrolls the page; once active the card claims it for dragging. (On desktop a drag never competes
// with scrolling, so callers are free to let the mouse drag whenever they like.) A finger activates on
// a COMPLETED tap, never on the press: every scroll swipe starts with a press, and a card that woke on
// it would take the rest of the page's swipes. The capture-phase handlers below do that, so they
// coexist with whatever pointer handlers the host carries.

export interface CardActivation {
	active: boolean;
	/** Spread onto the focusable host element that wraps the canvas. */
	hostProps: {
		tabIndex: number;
		onFocus: () => void;
		onBlur: (e: FocusEvent<HTMLElement>) => void;
		onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
		style: { touchAction: "none" | "auto" };
		onPointerDownCapture: (e: PointerEvent<HTMLElement>) => void;
		onPointerUpCapture: (e: PointerEvent<HTMLElement>) => void;
	};
	/** Mirror of `active` readable inside imperative loops and DOM listeners without a re-render. */
	activeRef: { readonly current: boolean };
	/**
	 * Hand the page back, as Esc does. For the phone's "Done" chip (components/card-done-chip.tsx):
	 * a touch screen has no Esc, and tapping the page beside a card only moves focus when the tapped
	 * thing is focusable, so without it a live card could keep swallowing the swipes that scroll.
	 */
	deactivate: () => void;
}

export function useCardActivation(): CardActivation {
	const [active, setActive] = useState(false);
	// Synced in an effect, not during render: the ref only ever feeds DOM listeners and rAF
	// loops, which run after commit, so a one-render lag is unobservable.
	const activeRef = useRef(false);
	useEffect(() => {
		activeRef.current = active;
	}, [active]);

	const onBlur = useCallback((e: FocusEvent<HTMLElement>) => {
		// Focus hopping between the host and a button it contains (an overlay link, say) stays active;
		// only leaving the card altogether deactivates it.
		if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
		setActive(false);
	}, []);

	const onKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
		if (e.key === "Escape") (e.currentTarget as HTMLElement).blur();
	}, []);

	const deactivate = useCallback(() => {
		setActive(false);
		// Activation IS focus, so the focus has to go too, or the next tap on the card would not
		// re-activate it (a focused element gets no second focus event).
		const el = document.activeElement;
		if (el instanceof HTMLElement) el.blur();
	}, []);

	// Where and when a finger went down on the card; a scroll's pointercancel never reaches the up.
	const pressRef = useRef<{ x: number; y: number; t: number } | null>(null);
	const onPointerDownCapture = useCallback((e: PointerEvent<HTMLElement>) => {
		pressRef.current = e.pointerType === "touch" ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
	}, []);
	const onPointerUpCapture = useCallback((e: PointerEvent<HTMLElement>) => {
		const press = pressRef.current;
		pressRef.current = null;
		// A tap on one of the card's own buttons belongs to the button.
		if (!press || !isTap(press, e) || (e.target as Element).closest("button, a")) return;
		e.currentTarget.focus({ preventScroll: true });
	}, []);

	return {
		active,
		activeRef,
		deactivate,
		hostProps: {
			tabIndex: 0,
			onFocus: () => setActive(true),
			onBlur,
			onKeyDown,
			style: { touchAction: active ? "none" : "auto" },
			onPointerDownCapture,
			onPointerUpCapture,
		},
	};
}
