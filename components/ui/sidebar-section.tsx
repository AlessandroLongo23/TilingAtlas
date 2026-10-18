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
		<div className={cn("overflow-hidden", flush ? "" : "rounded-surface border border-line-subtle")}>
			<div className="flex w-full items-center gap-2 px-3 py-2">
				<button
					type="button"
					onClick={() => onOpenChange(!open)}
					aria-expanded={open}
					className="flex flex-1 cursor-pointer items-center justify-between gap-2 rounded-sm text-left transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 max-md:min-h-11"
				>
					<span className="ta-label">
						{title}
						{summary ? <span className="ml-1.5 tracking-normal text-fg normal-case">{summary}</span> : null}
					</span>
					{open ? (
						<ChevronDown size={13} className="shrink-0 text-fg-muted" />
					) : (
						<ChevronRight size={13} className="shrink-0 text-fg-muted" />
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
