"use client";

import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

const EASE = [0.23, 1, 0.32, 1] as const;

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
					{/* One glyph that turns, not two that swap (same as the catalogue tree's rows). */}
					<ChevronRight
						size={13}
						className={cn(
							"shrink-0 text-fg-muted transition-transform duration-200 ease-[var(--ease-out-strong)] motion-reduce:transition-none",
							open && "rotate-90",
						)}
					/>
				</button>
				{rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
			</div>
			<Fold open={open}>
				<div className={cn(padded ? "p-2" : "")}>{children}</div>
			</Fold>
		</div>
	);
}

/**
 * The body of a section that folds: height and opacity, with the opacity leading on the way in and
 * finishing first on the way out, so content never shows clipped mid-fold. Shared by SidebarSection and
 * the library's filter groups.
 */
export function Fold({ open, children }: { open: boolean; children: ReactNode }) {
	return (
		<AnimatePresence initial={false}>
			{open ? (
				<motion.div
					// Clipped only while it moves: once open it goes back to visible, or it would crop focus rings.
					initial={{ height: 0, opacity: 0, overflow: "hidden" }}
					animate={{
						height: "auto",
						opacity: 1,
						transitionEnd: { overflow: "visible" },
						transition: { height: { duration: 0.24, ease: EASE }, opacity: { duration: 0.18, delay: 0.04 } },
					}}
					exit={{
						height: 0,
						opacity: 0,
						overflow: "hidden",
						transition: { height: { duration: 0.18, ease: EASE }, opacity: { duration: 0.1 } },
					}}
				>
					{children}
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
