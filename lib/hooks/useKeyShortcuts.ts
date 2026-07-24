"use client";

import { useEffect, useRef } from "react";

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
			const el = e.target as HTMLElement | null;
			if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
			const fn = latest.current[e.key.toLowerCase()];
			if (!fn) return;
			e.preventDefault();
			fn();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
}
