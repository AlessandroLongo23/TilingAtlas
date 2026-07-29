"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";

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
// with scrolling, so callers are free to let the mouse drag whenever they like.)

export interface CardActivation {
	active: boolean;
	/** Spread onto the focusable host element that wraps the canvas. */
	hostProps: {
		tabIndex: number;
		onFocus: () => void;
		onBlur: (e: FocusEvent<HTMLElement>) => void;
		onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
		style: { touchAction: "none" | "auto" };
	};
	/** Mirror of `active` readable inside imperative loops and DOM listeners without a re-render. */
	activeRef: { readonly current: boolean };
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

	return {
		active,
		activeRef,
		hostProps: {
			tabIndex: 0,
			onFocus: () => setActive(true),
			onBlur,
			onKeyDown,
			style: { touchAction: active ? "none" : "auto" },
		},
	};
}
