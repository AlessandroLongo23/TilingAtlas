"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useIsPhone } from "./useIsPhone";

// The phone's modal layers (the menu, the filter and contents sheets, the wall sheets, a `Modal`) as
// one stack, so that whatever is on top, and only that, answers Esc, Tab and the Back button.
//
// Back: opening a layer pushes a history entry with the page's own URL; Back pops it, and the popstate
// closes the top layer instead of leaving the page. A layer closed any other way (its X, Esc, the
// backdrop, a swipe) takes its entry back off with history.go(-n). Both pops are stopped before Next's
// router sees them, and the entry left on top is rewritten with the URL the page was showing, since a
// page may have rewritten its query (filters, the selected tiling) while the sheet was up. History work
// is batched to the next task, so React's StrictMode mount, unmount and remount of an effect nets to
// nothing.
//
// A navigation from inside a layer (a link, "Open in play") replaces the top layer's entry, so Back from
// the new page returns to the old one in one press and Forward comes back.

interface Layer {
	onClose: () => void;
	/** Called when the layer above this one closes (see useModalLayer). */
	onTop?: () => void;
}

const stack: Layer[] = [];
/** Entries we pushed above the page's own entry. */
let pushed = 0;
/** Pathname the entries were pushed on. A layer that closes on another page was closed by navigation. */
let pushedPath = "";
/** Pops we started ourselves, still to arrive. */
let ownPops = 0;
/** The current entry's state and URL, kept up to date through the history methods (see `track`). */
let live: { state: unknown; url: string } | null = null;
/**
 * Marked entries a navigation left behind (the layers under the one it left from), on this path up to
 * this depth. Forward from the page steps over those onto the page the navigation went to. Any other
 * marked entry ahead of the page is one a closed sheet left, with nothing worth stepping onto.
 */
let stranded: { path: string; depth: number } | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let installed = false;
let locks = 0;
let prevOverflow = "";

const MARK = "__taLayer";

function withDepth(state: unknown, depth: number) {
	const next = { ...(state as Record<string, unknown> | null) };
	if (depth > 0) next[MARK] = depth;
	else delete next[MARK];
	return next;
}

function track() {
	live = { state: history.state, url: location.href };
}

const pathOf = (url: string | URL) => new URL(url, location.href).pathname;

/** A navigation left from inside the layers: they close, and their entries are no longer ours. */
function leaveLayers() {
	stranded = pushed > 1 ? { path: pushedPath, depth: pushed - 1 } : null;
	pushed = 0;
	const closing = stack.slice().reverse();
	// Out of the history call, which Next makes while it commits the new page.
	setTimeout(() => closing.forEach((l) => stack.includes(l) && l.onClose()), 0);
}

function install() {
	if (installed) return;
	installed = true;
	// Pages rewrite their query with replaceState while a sheet is open. Follow every write, so a Back
	// press can put the latest URL back, and keep the depth mark on our entry through it. Wraps whatever
	// is installed (Next patches these too, and copies its own state into a bare one).
	const push = history.pushState;
	const replace = history.replaceState;
	history.pushState = function (this: History, state, unused, url) {
		// A push with a URL while layers hold entries is a navigation from inside them: it takes the top
		// layer's entry, where a push would stack the new page on entries that only close a sheet.
		if (pushed > 0 && url != null) {
			replace.call(this, state, unused, url);
			leaveLayers();
		} else push.call(this, state, unused, url);
		track();
	};
	history.replaceState = function (this: History, state, unused, url) {
		if (pushed > 0 && url != null && pathOf(url) !== pushedPath) leaveLayers();
		replace.call(this, pushed > 0 ? withDepth(state, pushed) : state, unused, url);
		track();
	};
	track();
}

/**
 * Ours has to run before Next's router, to stop it from also handling a pop that only closes a sheet (it
 * would render the page again, from the entry's older URL). Two things see to that: the listener is a
 * capture listener, which WebKit and Firefox run before the bubble listener the router adds, and the
 * module is loaded by the root layout (LayerHistory), so on every route it registers before the router
 * hydrates, which is what Chromium, running listeners on window in the order added, needs. A hot reload
 * swaps the handler, never adds a second listener.
 */
function onPopState(e: PopStateEvent) {
	if (!installed) return;
	if (ownPops > 0) {
		ownPops--;
		e.stopImmediatePropagation();
		restore(pushed);
		return;
	}
	const mark = typeof e.state?.[MARK] === "number" ? (e.state[MARK] as number) : null;
	if (pushed > 0 && location.pathname === pushedPath) {
		// Back with a layer open: close as many layers as entries were popped (one, unless the entry we
		// landed on says otherwise; a page's replaceState can wipe the mark).
		e.stopImmediatePropagation();
		const depth = Math.max(0, Math.min(mark ?? pushed - 1, pushed - 1));
		const closing = stack.slice(depth).reverse();
		pushed = depth;
		restore(depth);
		for (const layer of closing) layer.onClose();
		return;
	}
	if (pushed === 0 && mark) {
		// A marked entry with no layer open. Arriving from elsewhere (Back from the page a navigation
		// went to): step back over it to the page it belongs to, and let the router render that landing.
		// Arriving from its own page (Forward): on towards the new page if a navigation stranded it,
		// otherwise it is one a closed sheet left, so return to the page silently and Forward does
		// nothing, where stepping on would leave nothing ahead and the next Back dead.
		e.stopImmediatePropagation();
		const fromPage = live !== null && pathOf(live.url) === location.pathname;
		if (!fromPage) history.go(-mark);
		else if (stranded?.path === location.pathname && mark <= stranded.depth) history.go(1);
		else {
			ownPops++;
			history.go(-mark);
		}
		return;
	}
	track();
}

if (typeof window !== "undefined") {
	const w = window as Window & { __taLayerPop?: (e: PopStateEvent) => void };
	if (!w.__taLayerPop) window.addEventListener("popstate", (e) => w.__taLayerPop?.(e), { capture: true });
	w.__taLayerPop = onPopState;
}

/** Rendered by the root layout only to load this module, and with it the listener, on every route. */
export function LayerHistory() {
	return null;
}

/** Rewrite the entry we landed on with the URL and state the page was showing. */
function restore(depth: number) {
	if (!live) return;
	const { state, url } = live;
	history.replaceState(withDepth(state, depth), "", url);
}

function sync() {
	syncTimer = null;
	if (pushed > 0 && location.pathname !== pushedPath) pushed = 0;
	const want = stack.length;
	if (want > pushed) {
		if (pushed === 0) {
			pushedPath = location.pathname;
			// The push drops every entry ahead, stranded ones included.
			stranded = null;
		}
		while (pushed < want) history.pushState(withDepth(history.state, ++pushed), "");
	} else if (want < pushed) {
		const n = pushed - want;
		pushed = want;
		ownPops++;
		history.go(-n);
	}
}

function schedule() {
	if (syncTimer === null) syncTimer = setTimeout(sync, 0);
}

function isTop(layer: Layer) {
	return stack[stack.length - 1] === layer;
}

/**
 * Put a layer on the stack while `active`: it takes a history entry, and Back calls `onClose`. For
 * layers that handle their own focus and keys (Radix's `Modal`); hand-built layers use useModalLayer.
 * Phone only: on a desktop Back always navigates.
 */
export function useLayerEntry(active: boolean, onClose: () => void): RefObject<Layer> {
	const isPhone = useIsPhone();
	const layer = useRef<Layer>({ onClose });
	useEffect(() => {
		layer.current.onClose = onClose;
	});
	const on = active && isPhone;
	useEffect(() => {
		if (!on) return;
		install();
		const l = layer.current;
		stack.push(l);
		schedule();
		return () => {
			const i = stack.indexOf(l);
			if (i >= 0) stack.splice(i, 1);
			schedule();
			// Uncovered: let the layer below reclaim focus, after a Radix dialog has put its own back.
			const below = stack[stack.length - 1];
			if (i === stack.length && below?.onTop) setTimeout(() => isTop(below) && below.onTop?.(), 60);
		};
	}, [on]);
	return layer;
}

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		// offsetParent is null for display:none subtrees (and for fixed elements, hence the second test).
		(el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed",
	);
}

/**
 * What every hand-built modal layer needs while it is open on a phone (the menu, the filter and wall
 * sheets): a place on the layer stack (so Back closes it), focus moved inside and Tab cycling there,
 * Esc closing it, the page underneath held still, and focus returned to its opener on close. Keys go to
 * the top layer only, so a `Modal` opened from inside a sheet closes first and keeps its own focus.
 * Radix Dialog does the focus work for `Modal`; these layers cannot use Radix because their content is
 * mounted all the time and only shown on a phone. Inert at 768px and up whatever `active` says, so a
 * rotation to a desktop width never leaves a trap or a scroll lock behind.
 */
export function useModalLayer(ref: RefObject<HTMLElement | null>, active: boolean, onClose: () => void) {
	const isPhone = useIsPhone();
	const on = active && isPhone;
	const layer = useLayerEntry(on, onClose);

	useEffect(() => {
		if (!on) return;
		const root = ref.current;
		if (!root) return;
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		(focusables(root)[0] ?? root).focus({ preventScroll: true });

		const onKey = (e: KeyboardEvent) => {
			if (!isTop(layer.current)) return;
			if (e.key === "Escape") {
				// Capture phase and stopped, so the page's own Esc (leave immersive, deselect) does not also run.
				e.preventDefault();
				e.stopImmediatePropagation();
				layer.current.onClose();
				return;
			}
			if (e.key !== "Tab") return;
			const list = focusables(root);
			if (list.length === 0) {
				e.preventDefault();
				return;
			}
			const first = list[0];
			const last = list[list.length - 1];
			const inside = root.contains(document.activeElement);
			if (e.shiftKey && (document.activeElement === first || !inside)) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && (document.activeElement === last || !inside)) {
				e.preventDefault();
				first.focus();
			}
		};
		window.addEventListener("keydown", onKey, { capture: true });

		// A `Modal` opened from inside this layer hands focus back, on close, to wherever it was before
		// (the page, or nowhere). Once uncovered, this layer takes it back to the control last focused
		// in here: the one that opened the upper layer.
		let lastInside: HTMLElement | null = null;
		const onFocusIn = (e: FocusEvent) => {
			if (e.target instanceof HTMLElement && root.contains(e.target)) lastInside = e.target;
		};
		document.addEventListener("focusin", onFocusIn);
		const self = layer.current;
		self.onTop = () => {
			if (root.contains(document.activeElement)) return;
			((lastInside?.isConnected && lastInside) || focusables(root)[0] || root).focus({ preventScroll: true });
		};

		// One lock for any number of layers: the first saves the page's overflow, the last restores it.
		const html = document.documentElement;
		if (locks++ === 0) {
			prevOverflow = html.style.overflow;
			html.style.overflow = "hidden";
		}

		return () => {
			window.removeEventListener("keydown", onKey, { capture: true });
			document.removeEventListener("focusin", onFocusIn);
			self.onTop = undefined;
			if (--locks === 0) html.style.overflow = prevOverflow;
			if (opener?.isConnected) opener.focus({ preventScroll: true });
		};
	}, [on, ref, layer]);
}
