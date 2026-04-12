"use client";

import { useEffect, useRef, type DependencyList, type RefObject } from "react";

// p5 is an ESM default export; `any` to dodge the mismatch between @types/p5 (v1)
// and the installed p5 v2 runtime. Sketch callbacks get `p5` typed at the call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P5Instance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P5Sketch = (p5: any) => void;

/**
 * Create and manage a p5.js instance bound to `containerRef`.
 *
 * - Instance mode (new p5(sketch, element)): doesn't pollute globals.
 * - Strict-Mode safe: cleanup calls `instance.remove()` between double-mounts.
 * - `sketchFactory` is regenerated when `deps` change, triggering a full
 *   teardown + recreate. For hot canvas data (e.g. a changing Tiling), pass
 *   the data through refs and read inside draw() instead of adding it to deps.
 */
export function useP5(
	containerRef: RefObject<HTMLElement | null>,
	sketchFactory: () => P5Sketch,
	deps: DependencyList = [],
) {
	const instanceRef = useRef<P5Instance | null>(null);

	useEffect(() => {
		let cancelled = false;
		let instance: P5Instance | null = null;

		(async () => {
			if (!containerRef.current) return;
			const p5Module = await import("p5");
			if (cancelled || !containerRef.current) return;
			const P5 = (p5Module as { default: unknown }).default ?? p5Module;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			instance = new (P5 as any)(sketchFactory(), containerRef.current);
			instanceRef.current = instance;
		})();

		return () => {
			cancelled = true;
			if (instance) {
				try {
					instance.remove();
				} catch {
					// p5.remove can throw during tear-down; safe to ignore.
				}
			}
			if (instanceRef.current === instance) {
				instanceRef.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);

	return instanceRef;
}
