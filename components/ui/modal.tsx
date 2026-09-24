"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

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
	children,
}: ModalProps) {
	const widthClass = maxWidth ?? SIZE_CLASSES[size];
	return (
		<Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
				<Dialog.Content
					className={cn(
						"fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
						"bg-surface-raised ring-1 ring-line-subtle rounded-overlay shadow-xl w-full",
						widthClass,
						"data-[state=open]:animate-in data-[state=closed]:animate-out",
					)}
				>
					{description ? (
						<Dialog.Description className="sr-only">{description}</Dialog.Description>
					) : null}
					{showHeader ? (
						<div className="flex items-center justify-between px-5 py-4 border-b border-line-subtle">
							<Dialog.Title className="text-base font-semibold tracking-tight text-fg">{title}</Dialog.Title>
							<div className="flex items-center gap-2">
								{header}
								<Dialog.Close
									className="p-1 rounded-md hover:bg-surface-overlay transition-colors text-fg-muted hover:text-fg"
									aria-label="Close modal"
								>
									<X size={18} />
								</Dialog.Close>
							</div>
						</div>
					) : null}
					<div>{children}</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
