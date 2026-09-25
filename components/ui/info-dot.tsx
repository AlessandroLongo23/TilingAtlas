"use client";

import { Info as InfoIcon } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";

/**
 * The "why" that would otherwise sit as a paragraph under a control, folded into a hover card on a muted
 * dot. The prose is read once and then costs its lines of panel forever; on the dot it stays one
 * pointer-move away and the controls sit close enough to compare.
 *
 * The click is swallowed because these dots live inside rows that are themselves click targets — the
 * Checkbox row toggles on click, and asking what a control does must not also flip it.
 */
export function InfoDot({
	children,
	side = "right",
	label = "What this control does",
}: {
	children: React.ReactNode;
	side?: "top" | "right" | "bottom" | "left";
	label?: string;
}) {
	return (
		<span className="inline-flex" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
			<Tooltip
				side={side}
				delay={120}
				content={<div className="space-y-1.5 text-[11px] leading-relaxed text-fg-secondary max-md:text-[13px]">{children}</div>}
			>
				<button
					type="button"
					aria-label={label}
					className={cn(
						"inline-flex shrink-0 cursor-help text-fg-muted transition-colors",
						// A 14px dot is too small to tap: on a phone the button is a 44px box around it, and it takes
						// that room in the row, so it never lies over a neighbour's target or under one.
						"max-md:size-11 max-md:items-center max-md:justify-center max-md:rounded-control",
						"hover:opacity-100 hover:text-fg focus-visible:opacity-100 focus-visible:text-fg",
						"rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
					)}
				>
					<InfoIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
				</button>
			</Tooltip>
		</span>
	);
}
