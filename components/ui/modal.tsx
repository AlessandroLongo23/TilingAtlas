"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface ModalProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	title?: string;
	maxWidth?: string;
	showHeader?: boolean;
	header?: ReactNode;
	children: ReactNode;
}

export function Modal({
	isOpen,
	onOpenChange,
	title = "",
	maxWidth = "max-w-4xl",
	showHeader = true,
	header,
	children,
}: ModalProps) {
	return (
		<Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
				<Dialog.Content
					className={cn(
						"fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
						"bg-zinc-800 border border-zinc-700/50 rounded-lg shadow-xl w-full",
						maxWidth,
						"data-[state=open]:animate-in data-[state=closed]:animate-out",
					)}
				>
					{showHeader ? (
						<div className="flex items-center justify-between p-4 border-b border-zinc-700/50">
							<Dialog.Title className="text-lg font-medium text-white">{title}</Dialog.Title>
							<div className="flex items-center gap-2">
								{header}
								<Dialog.Close
									className="p-1 rounded-md hover:bg-zinc-700/70 transition-all text-white/80 hover:text-white/100"
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
