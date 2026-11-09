"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * One hover highlight for a whole row of controls (the floating toolbar, the nav links): it glides from
 * the button it was under to the one the pointer reaches, instead of each button lighting up on its
 * own. Arriving from outside the row, it fades in where it lands and does not fly in. Crossing the gap
 * between two buttons keeps it where it was. Mouse only: a finger has no hover.
 *
 * Drop it in as a child of the row; the row must be positioned. While it shows, the row carries
 * `data-pill` and globals.css takes the buttons' own hover fill off (.ta-pill-host). A list's options
 * (role="option", the Dropdown's) and a menu's items (role="menuitem", the ContextMenu's) count as buttons. A control marked
 * `data-pill-skip` (a filled primary button) is never highlighted.
 */
export function HoverPill() {
	const ref = useRef<HTMLSpanElement>(null);
	useLayoutEffect(() => {
		const pill = ref.current;
		const host = pill?.parentElement;
		if (!pill || !host) return;
		host.classList.add("ta-pill-host");
		const hide = () => {
			delete host.dataset.pill;
		};
		const over = (e: PointerEvent) => {
			if (e.pointerType !== "mouse") return;
			const target = e.target as Element;
			const item = target.closest<HTMLElement>("button, a, [role='option'], [role='menuitem']");
			if (!item || !host.contains(item)) {
				// In a gap between buttons the pill holds; anything else in the row clears it.
				if (target !== host) hide();
				return;
			}
			if (item.matches(":disabled, [aria-disabled='true'], [data-pill-skip]")) return hide();
			const h = host.getBoundingClientRect();
			const r = item.getBoundingClientRect();
			const fresh = host.dataset.pill === undefined;
			// A fresh entry moves the pill without travel, then fades it in.
			pill.style.transitionProperty = fresh ? "opacity" : "";
			pill.style.width = `${r.width}px`;
			// The pill takes the corner of the item it sits under, so a nav link, a toolbar button and a menu row
			// each get their own radius without a rule per host.
			pill.style.borderRadius = getComputedStyle(item).borderRadius;
			pill.style.height = `${r.height}px`;
			pill.style.transform = `translate(${r.left - h.left - host.clientLeft + host.scrollLeft}px, ${r.top - h.top - host.clientTop + host.scrollTop}px)`;
			host.dataset.pill = "";
		};
		host.addEventListener("pointerover", over);
		host.addEventListener("pointerleave", hide);
		return () => {
			host.removeEventListener("pointerover", over);
			host.removeEventListener("pointerleave", hide);
			host.classList.remove("ta-pill-host");
			hide();
		};
	}, []);
	return <span ref={ref} aria-hidden="true" className="ta-hover-pill" />;
}
