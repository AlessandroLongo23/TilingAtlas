"use client";

import { useEffect, useRef } from "react";

/**
 * Is this key event going into a control the reader is typing in?
 *
 * Every keyboard handler in the atlas needs this and each one used to spell it out, byte for byte, in
 * twelve files. Written once so a shortcut can never fire while a slider, a search box or a
 * contenteditable has focus — and so that widening it later (a new control type, a new field) is one
 * edit and not a hunt.
 */
export const isTypingTarget = (e: KeyboardEvent): boolean => {
	const el = e.target as HTMLElement | null;
	return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

/**
 * Bind keys to callbacks, under the same guard the /play key handler uses: modifier combos pass
 * through (so Cmd/Ctrl+key stays the browser's) and nothing fires while a form field or
 * contenteditable has focus. Keys are matched against a lowercased `event.key`, so "g" and
 * "arrowleft" are both valid entries. A matched key is preventDefault'd.
 *
 * Exists so the catalogue pages (/colors, /freedraw) can carry the SAME keys as /play — G, P, O mean
 * the same three overlays in every view that has them. Keep any overlay key added here in step with
 * the FREEDRAW_TOGGLES / COLORS_TOGGLES tables in app/(app)/play/_play-client.tsx, and with the Kbd
 * badge on the control it drives.
 *
 * The map is read through a ref, so callbacks that close over changing state never re-bind the
 * listener (the caller can pass a fresh object literal every render).
 */
export function useKeyShortcuts(map: Record<string, () => void>) {
	const latest = useRef(map);
	useEffect(() => {
		latest.current = map;
	});
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (isTypingTarget(e)) return;
			const fn = latest.current[e.key.toLowerCase()];
			if (!fn) return;
			e.preventDefault();
			fn();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
}
