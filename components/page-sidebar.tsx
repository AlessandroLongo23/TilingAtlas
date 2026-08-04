import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface PageSidebarProps {
	children: ReactNode;
	scrollable?: boolean;
	/**
	 * Immersive (fullscreen-canvas) mode: slide the panel shut so the canvas beside it takes the window.
	 *
	 * The clip happens on the OUTER box while the `aside` keeps its w-80, which is what makes this a
	 * slide instead of a squeeze — a shrinking aside would reflow every label and chip on the way out.
	 * Nothing unmounts either, so the type grid's scroll position and every slider come back untouched.
	 */
	collapsed?: boolean;
}

/** Unified sidebar wrapper for all pages — consistent width + scroll behavior. */
export function PageSidebar({ children, scrollable = true, collapsed = false }: PageSidebarProps) {
	return (
		<div
			className={cn(
				"h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out",
				collapsed ? "w-0" : "w-80",
			)}
		>
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
		</div>
	);
}
