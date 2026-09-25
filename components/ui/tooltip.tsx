"use client";

import { useRef, useState, type ReactElement, type ReactNode } from "react";
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
	/**
	 * Open on a finger tap (tap toggles, a tap elsewhere closes). Default: on for rich `content`, which
	 * is information a touch user needs (an InfoDot's explanation, why an option is unavailable); off
	 * for a plain `label`, which only names a button whose tap already does something.
	 */
	tapToOpen?: boolean;
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
	tapToOpen,
	children,
}: TooltipProps) {
	// Controlled, so a touch tap can open it: Base UI opens tooltips on mouse hover and keyboard focus
	// only, which leaves a finger with no way in. Every change Base UI asks for is mirrored straight back,
	// so mouse and keyboard behave exactly as they did uncontrolled.
	const [open, setOpen] = useState(false);
	// Whether it was open when the current press began: Base UI closes it on press, before the click.
	const openAtPress = useRef(false);
	const pressType = useRef("");
	const tap = tapToOpen ?? content != null;

	// Nothing to show → render the trigger untouched.
	if (content == null && !label) return children;

	// On show, the popup fades in and slides a few px from the trigger's direction (and reverses on hide).
	const enterFrom = {
		top: "data-[starting-style]:translate-y-1 data-[ending-style]:translate-y-1",
		bottom: "data-[starting-style]:-translate-y-1 data-[ending-style]:-translate-y-1",
		left: "data-[starting-style]:translate-x-1 data-[ending-style]:translate-x-1",
		right: "data-[starting-style]:-translate-x-1 data-[ending-style]:-translate-x-1",
	}[side];

	return (
		<BaseTooltip.Root open={open} onOpenChange={setOpen}>
			<BaseTooltip.Trigger
				delay={delay}
				render={children}
				onPointerDown={(e) => {
					openAtPress.current = open;
					pressType.current = e.pointerType;
				}}
				onClick={(e) => {
					// The press type comes from pointerdown: not every browser reports it on the click itself.
					// Mouse clicks keep Base UI's own close-on-click; keyboard clicks (detail 0) are left alone.
					if (!tap || e.detail === 0) return;
					if (pressType.current === "touch" || pressType.current === "pen") setOpen(!openAtPress.current);
				}}
			/>
			<BaseTooltip.Portal>
				{/* THE Z-LAYER GOES ON THE POSITIONER. Base UI gives the Popup `position: static` inside an
				    absolutely positioned Positioner, and `z-index` does nothing on a static box, so with the
				    layer set on the Popup the whole tooltip stacked at the Positioner's own z-auto: over the
				    /play canvas (a `z-10` wrapper) every tooltip was painted UNDER the canvas and could not be
				    read at all, which is how the editor's tool tips and the reason a mode is unavailable went
				    missing. */}
				<BaseTooltip.Positioner
					className="z-[var(--z-tooltip)]"
					side={side}
					sideOffset={sideOffset}
				>
					<BaseTooltip.Popup
						className={cn(
							"transition duration-150 ease-out motion-reduce:transition-none",
							"data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
							enterFrom,
							// A plain label is a small ink chip; rich content gets a white card.
							content != null
								? "rounded-lg bg-surface-raised text-fg shadow-lg ring-1 ring-line-subtle p-3 max-w-[min(90vw,26rem)]"
								: "flex items-center gap-2 rounded-md bg-fg px-2 py-1 text-xs font-medium text-fg-inverse shadow-md",
						)}
					>
						{/* Base UI centres the arrow on the cross axis and marks the side the popup LANDED on, which
						    is not `side` when there was no room there. So the inset and the direction key on
						    data-side: one triangle pointing down (fill = popup bg, stroke = popup border; the open
						    path leaves the base seamless), turned to face the trigger. */}
						<BaseTooltip.Arrow className="h-2 w-3.5 data-[side=bottom]:top-[-7px] data-[side=left]:right-[-7px] data-[side=left]:h-3.5 data-[side=left]:w-2 data-[side=right]:left-[-7px] data-[side=right]:h-3.5 data-[side=right]:w-2 data-[side=top]:bottom-[-7px] [&[data-side=bottom]>svg]:rotate-180 [&[data-side=left]>svg]:-rotate-90 [&[data-side=right]>svg]:rotate-90">
							<svg width={14} height={8} viewBox="0 0 14 8" className="absolute top-1/2 left-1/2 -translate-1/2 overflow-visible">
								<path
									d="M1 0L7 7L13 0"
									strokeWidth={1}
									strokeLinejoin="round"
									style={
										content != null
											? { fill: "var(--color-surface-raised)", stroke: "var(--color-border-subtle)" }
											: { fill: "var(--color-text-primary)", stroke: "var(--color-text-primary)" }
									}
								/>
							</svg>
						</BaseTooltip.Arrow>
						{content != null ? (
							content
						) : (
							<>
								<span>{label}</span>
								{shortcut ? (
									<kbd className="rounded bg-fg-inverse/15 px-1.5 py-0.5 font-mono text-[10.5px] text-fg-inverse/75 max-md:hidden">
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
