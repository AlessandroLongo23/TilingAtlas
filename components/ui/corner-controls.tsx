"use client";

import { AboutCornerButton } from "@/components/about-corner-button";
import { FullscreenToggle } from "@/components/fullscreen-toggle";
import { ResetViewButton } from "@/components/reset-view-button";
import { cn } from "@/lib/utils/cn";

/**
 * A canvas page's top-right corner (RULES corner standard): About (on a shelf with an article page,
 * lib/about-pages.ts), Reset view, then Fullscreen rightmost, in
 * that order in the DOM too, so Tab and a screen reader meet them as they are seen. Reset is phone only
 * (the desktop resets on right-click). Absolute, so the canvas box needs `relative`. On the desktop the
 * fullscreen button lands exactly where a lone FullscreenToggle does; on a phone the pair is 44px round
 * buttons 12px from the edges, and a pinch that starts on them does not zoom the page.
 *
 * `reset={false}` for a view with nothing to reset (a fixed patch, usePatchCanvas `fixed`).
 * `fullscreen="phone"` when the desktop keeps its fullscreen button elsewhere (a toolbar): the desktop
 * corner then holds the About button alone, or nothing. `false` when
 * the view already renders its own. `onReset` for a view that does not listen to requestViewReset.
 */
export function CornerControls({
	fullscreen = true,
	reset = true,
	onReset,
	className,
}: {
	fullscreen?: boolean | "phone";
	reset?: boolean;
	onReset?: () => void;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"absolute top-4 right-4 z-30 flex gap-2 max-md:top-3 max-md:right-3 max-md:touch-pan-x max-md:touch-pan-y",
				className,
			)}
		>
			<AboutCornerButton />
			{reset && <ResetViewButton onClick={onReset} />}
			{fullscreen ? <FullscreenToggle className={cn("static", fullscreen === "phone" && "md:hidden")} /> : null}
		</div>
	);
}
