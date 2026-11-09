"use client";

import { Popover as Base } from "@base-ui/react/popover";
import { ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { POPUP, POPUP_TRIGGER } from "./popup";
import { cn } from "@/lib/utils/cn";

/**
 * A panel of its own on a button that looks like a Dropdown's: for a choice a list would make long (columns to
 * click, say). It opens into the same popup paper, and closes on Escape or a click outside; `open` and
 * `onOpenChange` let a pick inside close it.
 */
export function Popover({
	face,
	children,
	open,
	onOpenChange,
	"aria-label": ariaLabel,
	className,
	popupClassName,
}: {
	/** What the button says: the value picked. */
	face: ReactNode;
	children: ReactNode;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	"aria-label": string;
	className?: string;
	popupClassName?: string;
}) {
	return (
		<Base.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
			{/* Named "<label>: <the value shown>", so the name holds the words on the button (WCAG 2.5.3). */}
			<Base.Trigger className={cn(POPUP_TRIGGER, className)}>
				<span className="sr-only">{ariaLabel}: </span>
				<span className="min-w-0 truncate">{face}</span>
				<ChevronsUpDown className="ml-auto size-icon-sm shrink-0 text-fg-muted" />
			</Base.Trigger>
			<Base.Portal>
				<Base.Positioner className="z-popup outline-none" sideOffset={4} align="end">
					<Base.Popup className={cn(POPUP, "max-w-[var(--available-width)]", popupClassName)}>{children}</Base.Popup>
				</Base.Positioner>
			</Base.Portal>
		</Base.Root>
	);
}
