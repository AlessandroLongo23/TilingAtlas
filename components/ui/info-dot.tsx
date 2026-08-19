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
				content={<div className="space-y-1.5 text-[11px] leading-relaxed text-fg-secondary">{children}</div>}
			>
				<button
					type="button"
					aria-label={label}
					className={cn(
						"inline-flex shrink-0 cursor-help text-fg-muted opacity-50 transition-[color,opacity]",
						"hover:opacity-100 hover:text-fg focus-visible:opacity-100 focus-visible:text-fg",
						"focus:outline-none focus-visible:ring-1 focus-visible:ring-fg",
					)}
				>
					<InfoIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
				</button>
			</Tooltip>
		</span>
	);
}
