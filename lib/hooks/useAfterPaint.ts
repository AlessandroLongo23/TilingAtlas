import { startTransition, useEffect, useState } from "react";

/**
 * `value`, late: `initial` until the frame that shows the rest has painted and the browser has a moment
 * free. For work that should wait until what matters is on screen. The catalogue grid counts its filter
 * facets off this, so a shelf that lands paints its cards and draws their thumbnails first and fills in
 * the panel's counts after, where it used to compute twenty of them before the first card could show.
 */
export function useAfterPaint<T>(value: T, initial: T = value): T {
	const [late, setLate] = useState(initial);
	useEffect(() => {
		if (late === value) return;
		const catchUp = () => startTransition(() => setLate(value));
		// A frame callback runs just before the next paint; idle time comes after it. Safari has no
		// requestIdleCallback, and a short timer stands in.
		const hasIdle = typeof requestIdleCallback === "function";
		let later = 0;
		const frame = requestAnimationFrame(() => {
			later = hasIdle ? requestIdleCallback(catchUp, { timeout: 600 }) : window.setTimeout(catchUp, 50);
		});
		return () => {
			cancelAnimationFrame(frame);
			if (hasIdle) cancelIdleCallback(later);
			else clearTimeout(later);
		};
	}, [value, late]);
	return late;
}
