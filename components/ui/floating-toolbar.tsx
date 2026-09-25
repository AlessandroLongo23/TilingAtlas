"use client";

import type { ComponentProps, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils/cn";
import { Tooltip } from "./tooltip";

// The floating toolbar a tool page parks over its canvas (bottom centre): one white pill holding the
// page's canvas-level actions, so they read as one control and not as a column of loose squares.
//
// On a phone it rides above the dock sheet (`--sheet-offset`, published by the sheet; the home-indicator
// inset when there is none), never wider than the screen less 16px a side, and scrolls sideways with
// snap when its buttons do not fit. A pinch that starts on it does not zoom the page.

export function FloatingToolbar({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div
			role="toolbar"
			className={cn(
				"absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-xl bg-surface-raised/95 p-1 shadow-lg ring-1 ring-line-subtle backdrop-blur-sm",
				"max-md:bottom-[calc(max(var(--sheet-offset,0px),env(safe-area-inset-bottom))+12px)] max-md:max-w-[calc(100%-32px)] max-md:overflow-x-auto max-md:snap-x scrollbar-hide max-md:transition-[bottom] max-md:duration-300 max-md:motion-reduce:transition-none",
				// It scrolls sideways; a pinch that starts on it must not zoom the whole page.
				"max-md:touch-pan-x max-md:touch-pan-y",
				className,
			)}
		>
			{children}
		</div>
	);
}

/**
 * A group that comes and goes with a mode (the editor's tools, say). It opens from zero width with a
 * fade, so the centred toolbar grows and shrinks around it smoothly while every other group holds
 * still. Overflow is clipped only while the width animates; once open it goes back to visible, or it
 * would crop the focus rings.
 */
export function ToolbarReveal({ show, children }: { show: boolean; children: ReactNode }) {
	const reduce = useReducedMotion();
	return (
		<AnimatePresence initial={false}>
			{show ? (
				<motion.div
					className="flex items-center gap-0.5"
					initial={{ width: 0, opacity: 0, overflow: "hidden" }}
					animate={{ width: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
					exit={{ width: 0, opacity: 0, overflow: "hidden" }}
					transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
				>
					{children}
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

export function ToolbarDivider() {
	return <span aria-hidden="true" className="mx-1 h-5 w-px bg-line-subtle max-md:shrink-0" />;
}

interface ToolbarButtonProps extends Omit<ComponentProps<"button">, "children"> {
	/** Accessible name and tooltip text. */
	label: string;
	shortcut?: string;
	/** The primary action: filled with the accent and labelled, not an icon alone. */
	primary?: boolean;
	children: ReactNode;
}

export function ToolbarButton({ label, shortcut, primary, className, children, ...rest }: ToolbarButtonProps) {
	return (
		<Tooltip label={label} shortcut={shortcut} side="top" delay={0}>
			<button
				type="button"
				aria-label={primary ? undefined : label}
				className={cn(
					"flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13px] font-medium transition-colors",
					"max-md:h-11 max-md:shrink-0 max-md:snap-start",
					"focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-40",
					primary
						? "bg-accent px-3 text-accent-contrast hover:bg-accent-hover"
						: "w-8 max-md:min-w-11 text-fg-secondary hover:bg-surface-overlay hover:text-fg aria-pressed:bg-surface-sunken aria-pressed:text-fg",
					className,
				)}
				{...rest}
			>
				{children}
			</button>
		</Tooltip>
	);
}
