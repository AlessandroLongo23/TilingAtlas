"use client";

// What a dock page (PageSidebar mobile="dock") hands the phone sheet besides its controls: the title
// block of the peek row, and the drop to half after a pick. Desktop never renders the one nor runs the
// other.

import type { ReactNode } from "react";
import { isPhoneNow } from "@/lib/hooks/useIsPhone";
import { cn } from "@/lib/utils/cn";
import { useMobileSheet } from "@/stores/mobileSheet";

/** The peek row's name and one line under it. `mono` sets the line in tabular mono (counts, codes). */
export function PeekTitle({ title, sub, mono = false }: { title: ReactNode; sub: ReactNode; mono?: boolean }) {
	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<span className="truncate text-[15px] font-semibold leading-tight text-fg">{title}</span>
			<span className={cn("truncate text-xs text-fg-muted", mono && "font-mono tabular-nums")}>{sub}</span>
		</div>
	);
}

// The nearest ancestor inside the sheet that actually scrolls.
function scrollerOf(el: Element): HTMLElement | null {
	for (let p = el.parentElement; p && p.tagName !== "ASIDE"; p = p.parentElement) {
		const o = getComputedStyle(p).overflowY;
		if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
	}
	return null;
}

/**
 * A pick made with the sheet at full would change a canvas the sheet is covering, so on a phone it drops
 * the sheet to half: the result shows above, and the list stays open below for the next pick. Once the
 * sheet has settled, the picked item (`selector`, when given) is scrolled back to the middle of the
 * shorter view. By hand, not scrollIntoView, which would also scroll the sheet's clipped ancestors.
 */
export function showPickOnCanvas(selector?: string) {
	const sheet = useMobileSheet.getState();
	if (!isPhoneNow() || sheet.snap !== "full") return;
	sheet.setSnap("half");
	if (!selector) return;
	window.setTimeout(() => {
		const item = document.querySelector(selector);
		const scroller = item && scrollerOf(item);
		if (!item || !scroller) return;
		const r = item.getBoundingClientRect();
		// What shows of the scroller: a panel with fixed-height parts can run it past the sheet's bottom.
		const s = scroller.getBoundingClientRect();
		const top = s.top;
		const bottom = Math.min(s.bottom, scroller.closest("aside")?.getBoundingClientRect().bottom ?? s.bottom);
		// Clear of the region's 24px bottom fade.
		if (r.top >= top && r.bottom <= bottom - 24) return;
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		scroller.scrollBy({ top: r.top + r.height / 2 - (top + bottom) / 2, behavior: reduce ? "auto" : "smooth" });
	}, 400);
}
