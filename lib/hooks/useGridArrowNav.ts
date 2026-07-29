"use client";

import { useEffect, type RefObject } from "react";
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
 * inside `gridRef` is scrolled into view with block "nearest", which is a no-op when it is already
 * fully visible (so clicking a thumbnail never jolts the list).
 */
export function useGridArrowNav({
	gridRef,
	count,
	index,
	onMove,
}: {
	gridRef: RefObject<HTMLElement | null>;
	/** Length of the full filtered list. */
	count: number;
	/** The selection's position in that list, or -1 when there is none. */
	index: number;
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

	useEffect(() => {
		gridRef.current?.querySelector("[data-selected]")?.scrollIntoView({ block: "nearest" });
		// gridRef is a stable ref object; re-running on index alone is the point.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [index]);
}
