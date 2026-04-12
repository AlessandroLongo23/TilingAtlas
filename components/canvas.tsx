"use client";

/**
 * DEFERRED COMPONENT — intentionally not ported to React in Phase 4.
 *
 * The source src/lib/components/Canvas.svelte is ~750 lines of tightly-coupled
 * p5.js draw loop, screenshot pipeline, WFC debug overlay, and
 * Game-of-Life integration. It reads 20+ fields from the configuration
 * store on every frame and dispatches into TilingGeneratorFromRule,
 * TilingGenerator, Tiling, and GolEngine instances.
 *
 * It'll be ported during Phase 5 (Route Port) when the /play and
 * /lab/[hash]/tilings routes land — those are its only consumers, and
 * porting it decoupled from the route context produced no value.
 *
 * The primitives it will build on (`useP5`, `<P5Canvas>`) are already
 * in place from Phase 3. The polygon/tiling draw logic is extractable
 * to `usePolygonsCanvas` (see lib/hooks/usePolygonsCanvas.ts) when
 * rendering static tilings; live interaction state (zoom, offset,
 * screenshot trigger) stays in the full Canvas component.
 */

import type { ReactNode } from "react";

interface CanvasProps {
	width?: number;
	height?: number;
	children?: ReactNode;
}

export function Canvas({ width = 600, height = 600 }: CanvasProps) {
	return (
		<div
			className="relative flex items-center justify-center h-full w-full bg-zinc-900/60 text-zinc-500 text-sm"
			style={{ minWidth: width, minHeight: height }}
		>
			Canvas — deferred to Phase 5 (route integration)
		</div>
	);
}
