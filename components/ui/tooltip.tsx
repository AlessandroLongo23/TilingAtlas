"use client";

import type { ReactElement, ReactNode } from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils/cn";

type Side = "top" | "right" | "bottom" | "left";

interface TooltipProps {
	/** Plain-text tooltip. Ignored when `content` is set. */
	label?: string;
	/** Optional keyboard hint rendered as a <kbd> beside `label`. */
	shortcut?: string;
	/** Rich tooltip body (e.g. images). Takes precedence over `label`/`shortcut`. */
	content?: ReactNode;
	side?: Side;
	sideOffset?: number;
	delay?: number;
	children: ReactElement;
}

// Reusable tooltip built on Base UI (matches the Lume app's primitive), themed with the app's design
// tokens instead of raw zinc. The wrapper adds no DOM node around `children`; Base UI's
// `Trigger render` merges the trigger props and ref onto the child element, so the child must forward
// its ref to a DOM node (see ToggleButton).
export function Tooltip({
	label,
	shortcut,
	content,
	side = "top",
	sideOffset = 8,
	delay = 400,
	children,
}: TooltipProps) {
	// Nothing to show → render the trigger untouched.
	if (content == null && !label) return children;

	// Enter/exit motion and the arrow both adapt to whichever side the popup lands on. On show, the popup
	// fades in and slides a few px from the trigger's direction (and reverses on hide). Base UI centres the
	// arrow on the cross axis via inline styles, so we only set the static-side inset and draw the triangle
	// pointing at the trigger (fill = popup bg, stroke = popup border; the open path leaves the base seamless).
	const enterFrom = {
		top: "data-[starting-style]:translate-y-1 data-[ending-style]:translate-y-1",
		bottom: "data-[starting-style]:-translate-y-1 data-[ending-style]:-translate-y-1",
		left: "data-[starting-style]:translate-x-1 data-[ending-style]:translate-x-1",
		right: "data-[starting-style]:-translate-x-1 data-[ending-style]:-translate-x-1",
	}[side];
	const arrow = {
		top: { inset: "bottom-[-7px]", w: 14, h: 8, viewBox: "0 0 14 8", d: "M1 0L7 7L13 0" },
		bottom: { inset: "top-[-7px]", w: 14, h: 8, viewBox: "0 0 14 8", d: "M1 8L7 1L13 8" },
		left: { inset: "right-[-7px]", w: 8, h: 14, viewBox: "0 0 8 14", d: "M0 1L7 7L0 13" },
		right: { inset: "left-[-7px]", w: 8, h: 14, viewBox: "0 0 8 14", d: "M8 1L1 7L8 13" },
	}[side];

	return (
		<BaseTooltip.Root>
			<BaseTooltip.Trigger delay={delay} render={children} />
			<BaseTooltip.Portal>
				<BaseTooltip.Positioner side={side} sideOffset={sideOffset}>
					<BaseTooltip.Popup
						className={cn(
							"border border-line bg-surface-overlay text-fg rounded-md shadow-xl z-[var(--z-tooltip)]",
							"transition duration-150 ease-out motion-reduce:transition-none",
							"data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
							enterFrom,
							content != null
								? "p-3 max-w-[min(90vw,26rem)]"
								: "flex items-center gap-2 px-2 py-1 text-xs text-fg-secondary",
						)}
					>
						<BaseTooltip.Arrow className={arrow.inset}>
							<svg width={arrow.w} height={arrow.h} viewBox={arrow.viewBox} className="block overflow-visible">
								<path
									d={arrow.d}
									strokeWidth={1}
									strokeLinejoin="round"
									style={{ fill: "var(--color-surface-overlay)", stroke: "var(--color-line)" }}
								/>
							</svg>
						</BaseTooltip.Arrow>
						{content != null ? (
							content
						) : (
							<>
								<span>{label}</span>
								{shortcut ? (
									<kbd className="px-1.5 py-0.5 rounded bg-surface border border-line text-[11px] text-fg-muted font-sans">
										{shortcut}
									</kbd>
								) : null}
							</>
						)}
					</BaseTooltip.Popup>
				</BaseTooltip.Positioner>
			</BaseTooltip.Portal>
		</BaseTooltip.Root>
	);
}
