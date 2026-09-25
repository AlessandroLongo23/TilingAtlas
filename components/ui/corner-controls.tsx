"use client";

import { FullscreenToggle } from "@/components/fullscreen-toggle";
import { ResetViewButton } from "@/components/reset-view-button";
import { cn } from "@/lib/utils/cn";

/**
 * A canvas page's top-right corner (RULES corner standard): Reset view, then Fullscreen rightmost, in
 * that order in the DOM too, so Tab and a screen reader meet them as they are seen. Reset is phone only
 * (the desktop resets on right-click). Absolute, so the canvas box needs `relative`. On the desktop the
 * fullscreen button lands exactly where a lone FullscreenToggle does; on a phone the pair is 44px round
 * buttons 12px from the edges, and a pinch that starts on them does not zoom the page.
 *
 * `fullscreen="phone"` when the desktop keeps its fullscreen button elsewhere (a toolbar); `false` when
 * the view already renders its own. `onReset` for a view that does not listen to requestViewReset.
 */
export function CornerControls({
	fullscreen = true,
	onReset,
	className,
}: {
	fullscreen?: boolean | "phone";
	onReset?: () => void;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"absolute right-4 top-4 z-30 flex gap-2 max-md:right-3 max-md:top-3 max-md:touch-pan-x max-md:touch-pan-y",
				fullscreen !== true && "md:hidden",
				className,
			)}
		>
			<ResetViewButton onClick={onReset} />
			{fullscreen ? <FullscreenToggle className="static" /> : null}
		</div>
	);
}
