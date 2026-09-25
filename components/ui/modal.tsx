"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { useLayerEntry } from "@/lib/hooks/useModalLayer";
import { SheetGrabBar, useSwipeDismiss } from "./bottom-sheet";

type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const SIZE_CLASSES: Record<ModalSize, string> = {
	sm: "max-w-md",
	md: "max-w-xl",
	lg: "max-w-4xl",
	xl: "max-w-6xl",
	full: "max-w-[95vw]",
};

interface ModalProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	title?: string;
	/** Preset size. Ignored if `maxWidth` is provided. */
	size?: ModalSize;
	/** Escape hatch for a specific Tailwind `max-w-*` class. */
	maxWidth?: string;
	/** Accessible description, announced after the title. Rendered visually hidden. Radix warns in dev
	 *  for any dialog without one; pass a sentence saying what the dialog is for. */
	description?: string;
	showHeader?: boolean;
	header?: ReactNode;
	/** Optional action bar under the body. On a phone the body scrolls and this stays pinned in view. */
	footer?: ReactNode;
	children: ReactNode;
}

export function Modal({
	isOpen,
	onOpenChange,
	title = "",
	size = "lg",
	maxWidth,
	description,
	showHeader = true,
	header,
	footer,
	children,
}: ModalProps) {
	const widthClass = maxWidth ?? SIZE_CLASSES[size];
	// Phone: a sheet among the others, so Back closes it and a pull down on its header dismisses it.
	// Radix keeps its own focus trap and Esc; the layer stack only has to know it is on top.
	const contentRef = useRef<HTMLDivElement>(null);
	const close = () => onOpenChange(false);
	useLayerEntry(isOpen, close);
	const swipe = useSwipeDismiss(contentRef, close);
	// Where focus was when the modal opened, so closing can put it back. Radix returns focus to its own
	// Dialog.Trigger, and this modal is opened from outside (a toolbar button, a store), so without this
	// focus fell to <body>. A layout effect runs before Radix moves focus into the portal.
	const opener = useRef<HTMLElement | null>(null);
	useLayoutEffect(() => {
		if (isOpen) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	}, [isOpen]);
	return (
		<Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ta-backdrop-in" />
				<Dialog.Content
					ref={contentRef}
					onCloseAutoFocus={(e) => {
						const el = opener.current;
						if (el?.isConnected && el !== document.body) {
							e.preventDefault();
							el.focus({ preventScroll: true });
						}
					}}
					className={cn(
						"fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
						"bg-surface-raised ring-1 ring-line-subtle rounded-overlay shadow-xl w-full",
						widthClass,
						"data-[state=open]:animate-in data-[state=closed]:animate-out",
						// Phone: a bottom sheet. Full width, square bottom corners on the screen edge, at most
						// 92dvh tall with the body scrolling, clear of the home indicator.
						"max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:translate-x-0 max-md:translate-y-0",
						"max-md:max-w-none max-md:rounded-b-none max-md:rounded-t-2xl max-md:max-h-[92dvh] max-md:flex max-md:flex-col",
						"max-md:pb-[env(safe-area-inset-bottom)] ta-sheet-in",
					)}
				>
					{description ? (
						<Dialog.Description className="sr-only">{description}</Dialog.Description>
					) : null}
					{showHeader ? (
						<div
							{...swipe}
							className="flex items-center justify-between px-5 py-4 border-b border-line-subtle max-md:relative max-md:shrink-0 max-md:touch-none max-md:py-2 max-md:pr-2"
						>
							<SheetGrabBar />
							<Dialog.Title className="text-base font-semibold tracking-tight text-fg">{title}</Dialog.Title>
							<div className="flex items-center gap-2">
								{header}
								<Dialog.Close
									className="p-1 rounded-md hover:bg-surface-overlay transition-colors text-fg-muted hover:text-fg max-md:flex max-md:size-11 max-md:items-center max-md:justify-center"
									aria-label="Close modal"
								>
									<X size={18} />
								</Dialog.Close>
							</div>
						</div>
					) : null}
					<div className="max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto max-md:overscroll-contain">{children}</div>
					{footer ? <div className="border-t border-line-subtle px-5 py-3 max-md:shrink-0">{footer}</div> : null}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
