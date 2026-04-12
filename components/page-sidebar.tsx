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
					scrollable ? "overflow-y-auto scrollbar-hide" : "overflow-hidden",
				)}
			>
				{children}
			</div>
		</aside>
	);
}
