"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface SidebarSectionProps {
	title: ReactNode;
	/** Short text shown next to the title in the accent color (e.g. active-count, current value). */
	summary?: ReactNode;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Optional extra control rendered on the far right of the header (e.g. mode toggle). */
	rightSlot?: ReactNode;
	/** Body padding — set `false` if the child renders its own padding. */
	padded?: boolean;
	/** Render without an outer border/rounded shell (for tighter nested layouts). */
	flush?: boolean;
	children: ReactNode;
}

export function SidebarSection({
	title,
	summary,
	open,
	onOpenChange,
	rightSlot,
	padded = true,
	flush = false,
	children,
}: SidebarSectionProps) {
	return (
		<div
			className={cn(
				"overflow-hidden",
				flush ? "" : "border border-line rounded-control",
			)}
		>
			<div className="w-full flex items-center gap-2 px-3 py-2 bg-surface-overlay/50">
				<button
					type="button"
					onClick={() => onOpenChange(!open)}
					aria-expanded={open}
					className="flex-1 flex items-center justify-between gap-2 text-left cursor-pointer hover:text-fg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-line-focus rounded-sm"
				>
					<span className="text-xs font-medium text-fg-secondary">
						{title}
						{summary ? <span className="ml-1.5 text-accent">{summary}</span> : null}
					</span>
					{open ? (
						<ChevronDown size={13} className="text-fg-muted shrink-0" />
					) : (
						<ChevronRight size={13} className="text-fg-muted shrink-0" />
					)}
				</button>
				{rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
			</div>
			<AnimatePresence initial={false}>
				{open ? (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="overflow-hidden"
					>
						<div className={cn(padded ? "p-2" : "")}>{children}</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
