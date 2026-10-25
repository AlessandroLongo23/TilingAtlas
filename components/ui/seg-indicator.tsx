"use client";

import { useLayoutEffect, useRef } from "react";

const ACTIVE = ":scope > .ta-tab:is([data-state='active'], [aria-pressed='true'], [aria-checked='true'])";

/**
 * The sliding pill of a `.ta-seg`. Drop it in as the segmented control's first child: it finds the one
 * selected `.ta-tab` beside it and glides to it, so picking an option moves the white pill across the
 * track instead of blinking it off one cell and on another. While it is showing it sets `data-ind` on the
 * track, and globals.css then takes the fill off the selected tab (the pill paints it). With no single
 * selection (a multi-select wall, nothing picked) it hides and the tabs paint themselves as before.
 *
 * Reads selection off the attributes the controls already publish (Radix data-state, aria-pressed,
 * aria-checked), so no call site threads the value through.
 */
export function SegIndicator() {
	const ref = useRef<HTMLSpanElement>(null);
	useLayoutEffect(() => {
		const pill = ref.current;
		const seg = pill?.parentElement;
		if (!pill || !seg) return;
		let shown = false;
		const place = () => {
			const on = seg.querySelectorAll<HTMLElement>(ACTIVE);
			const tab = on.length === 1 ? on[0] : null;
			// A hidden panel lays out at zero size; wait for it to show before measuring.
			if (!tab || tab.offsetWidth === 0) {
				if (!tab) delete seg.dataset.ind;
				shown = false;
				return;
			}
			// The first placement (and the first after being hidden) lands without travel: the pill should
			// appear under the selected option, not fly in from the corner.
			pill.style.transition = shown ? "" : "none";
			pill.style.width = `${tab.offsetWidth}px`;
			pill.style.height = `${tab.offsetHeight}px`;
			pill.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`;
			seg.dataset.ind = "";
			if (!shown) {
				void pill.offsetWidth; // commit the jump before transitions come back on
				pill.style.transition = "";
			}
			shown = true;
		};
		place();
		const mo = new MutationObserver(place);
		mo.observe(seg, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ["data-state", "aria-pressed", "aria-checked"],
		});
		// No ResizeObserver (jsdom, very old browsers): the pill still follows selection, just not resizes.
		const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
		ro?.observe(seg);
		return () => {
			mo.disconnect();
			ro?.disconnect();
			delete seg.dataset.ind;
		};
	}, []);
	return <span ref={ref} aria-hidden="true" className="ta-seg-ind" />;
}
