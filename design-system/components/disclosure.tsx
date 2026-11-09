"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Reveal } from "./reveal";

/** The turning chevron of everything that folds: one glyph, one quarter turn, one timing. Trees, sections
 *  and disclosures all use it, so a fold reads the same wherever it is. */
export function FoldChevron({ open, size = 13, className }: { open: boolean; size?: number; className?: string }) {
	return (
		<ChevronRight
			size={size}
			aria-hidden
			className={cn(
				"shrink-0 text-fg-muted transition-transform motion-glide motion-reduce:transition-none",
				open && "rotate-90",
				className,
			)}
		/>
	);
}

interface DisclosureProps {
	title: ReactNode;
	/** Short text shown after the title, in ink (an active count, the current value). */
	summary?: ReactNode;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Optional extra control on the far right of the header (e.g. a mode toggle). */
	rightSlot?: ReactNode;
	/** The header row's padding; the button fills the row. */
	headerClassName?: string;
	className?: string;
	children: ReactNode;
}

/** A section label that folds what follows it: the label and a turning chevron, then the body, shown and
 *  hidden by Reveal. Give it a frame through `className` where a section needs one. */
export function Disclosure({
	title,
	summary,
	open,
	onOpenChange,
	rightSlot,
	headerClassName,
	className,
	children,
}: DisclosureProps) {
	return (
		<div className={className}>
			<div className={cn("flex w-full items-center gap-2", headerClassName)}>
				<button
					type="button"
					onClick={() => onOpenChange(!open)}
					aria-expanded={open}
					className="flex flex-1 cursor-pointer items-center justify-between gap-2 rounded-tag text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 max-md:min-h-control-touch"
				>
					<span className="ta-label">
						{title}
						{summary ? <span className="ml-1.5 tracking-normal text-fg normal-case">{summary}</span> : null}
					</span>
					<FoldChevron open={open} />
				</button>
				{rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
			</div>
			<Reveal show={open}>{children}</Reveal>
		</div>
	);
}
