import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface PageSidebarProps {
	children: ReactNode;
	scrollable?: boolean;
}

/** Unified sidebar wrapper for all pages — consistent width + scroll behavior. */
export function PageSidebar({ children, scrollable = true }: PageSidebarProps) {
	return (
		<aside className="h-full w-72 shrink-0 flex flex-col bg-zinc-800/50 border-r border-zinc-800/80 overflow-hidden">
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
