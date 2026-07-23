import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface PageSidebarProps {
	children: ReactNode;
	scrollable?: boolean;
}

/** Unified sidebar wrapper for all pages — consistent width + scroll behavior. */
export function PageSidebar({ children, scrollable = true }: PageSidebarProps) {
	return (
		<aside className="h-full w-80 shrink-0 flex flex-col bg-surface-chrome border-r border-line-subtle overflow-hidden">
			<div
				className={cn(
					"flex-1",
					// overflow-x-hidden explicitly: with only overflow-y set, overflow-x computes to auto, and any
				// invisible overflow (e.g. a transformed slider part) would give the sidebar a phantom
				// horizontal scroll. A sidebar never scrolls sideways.
				scrollable ? "overflow-y-auto overflow-x-hidden scrollbar-hide" : "overflow-hidden",
				)}
			>
				{children}
			</div>
		</aside>
	);
}
