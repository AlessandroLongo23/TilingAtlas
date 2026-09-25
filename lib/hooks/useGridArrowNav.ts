"use client";

import { useEffect, type RefObject } from "react";
import { useIsPhone } from "./useIsPhone";
import { useKeyShortcuts } from "./useKeyShortcuts";

/**
 * Arrow-key navigation over a paginated thumbnail catalogue (/colors, both /freedraw arms):
 * ←/→ step one entry, ↑/↓ move one ROW while holding the column.
 *
 * `index` is a position in the WHOLE filtered list, not in the visible page, so a step off the end of
 * a page moves into the next one — the caller's onMove is expected to set the page from the index
 * (see PAGE_SIZE at each call site). Both axes CLAMP, they never wrap: /play wraps because its list is
 * the browse scope, but wrapping a 27k-entry catalogue from the last thumbnail back to page 1 is a
 * jump, not a step.
 *
 * The row width is whatever `repeat(auto-fill, …)` resolved to at the current viewport, so it is read
 * off the live computed style (px track sizes) instead of recomputing the breakpoint math here — one
 * read per keypress, never per render. Only px tracks are counted: an unlaid-out grid computes to the
 * specified `repeat(...)` string, which would otherwise miscount as several tracks.
 *
 * Also keeps the selection on screen: after the index changes, the element marked `data-selected`
 * inside `gridRef` is brought into its scroll pane by the least scroll that shows it whole (what
 * `scrollIntoView({ block: "nearest" })` does), a no-op when it is already fully visible, so clicking a
 * thumbnail never jolts the list. Only that pane scrolls: scrollIntoView also scrolls every ancestor,
 * and when the card started below the fold it dragged the `overflow-hidden` app shell up with it, which
 * is how the page opened shifted up on a phone.
 *
 * On a phone, a new `page` also scrolls that pane back to the top: the pagination sits under the grid,
 * so without it a tap on "2" leaves the reader at the bottom of page 2.
 *
 * Returns `step(delta)`, the same clamped move the keys make, for on-screen previous / next buttons.
 */
export function useGridArrowNav({
	gridRef,
	count,
	index,
	page,
	onMove,
}: {
	gridRef: RefObject<HTMLElement | null>;
	/** Length of the full filtered list. */
	count: number;
	/** The selection's position in that list, or -1 when there is none. */
	index: number;
	/** The page on show. */
	page?: number;
	onMove: (next: number) => void;
}) {
	const columns = () => {
		const el = gridRef.current;
		if (!el) return 1;
		const tracks = getComputedStyle(el)
			.gridTemplateColumns.split(/\s+/)
			.filter((t) => t.endsWith("px")).length;
		return Math.max(1, tracks);
	};

	const move = (delta: number) => {
		if (count === 0 || index < 0) return;
		const next = Math.min(count - 1, Math.max(0, index + delta));
		if (next !== index) onMove(next);
	};

	useKeyShortcuts({
		arrowleft: () => move(-1),
		arrowright: () => move(1),
		arrowup: () => move(-columns()),
		arrowdown: () => move(columns()),
	});

	// Declared before the selection effect, so a step onto the previous page's last card still ends in view.
	const isPhone = useIsPhone();
	useEffect(() => {
		const pane = isPhone && gridRef.current && scrollParent(gridRef.current);
		if (pane) pane.scrollTop = 0;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [page]);

	useEffect(() => {
		const card = gridRef.current?.querySelector("[data-selected]");
		const pane = card && scrollParent(card);
		if (!card || !pane) return;
		const c = card.getBoundingClientRect();
		const p = pane.getBoundingClientRect();
		if (c.top < p.top) pane.scrollTop += c.top - p.top;
		else if (c.bottom > p.bottom) pane.scrollTop += Math.min(c.bottom - p.bottom, c.top - p.top);
		// gridRef is a stable ref object; re-running on index alone is the point.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [index]);

	return { step: move };
}

/** The nearest ancestor that scrolls vertically, or null. */
export function scrollParent(el: Element): HTMLElement | null {
	for (let p = el.parentElement; p; p = p.parentElement) {
		const oy = getComputedStyle(p).overflowY;
		if (oy === "auto" || oy === "scroll") return p;
	}
	return null;
}
