"use client";

import { Info as InfoIcon } from "lucide-react";
import { Tooltip } from "./tooltip";
import { cn } from "@/lib/utils/cn";

/**
 * The "why" that would otherwise sit as a paragraph under a control, folded into a hover card on a muted
 * dot. The prose is read once and then costs its lines of panel forever; on the dot it stays one
 * pointer-move away and the controls sit close enough to compare.
 *
 * The click is swallowed because a dot can sit in a row that is itself a click target (a disclosure's
 * header, say), and asking what a control does must not also work it. A dot never sits INSIDE a control:
 * the Checkbox puts its hint beside the checkbox (a control nested in a control is unreachable).
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
				delay="instant"
				content={
					<div className="space-y-1.5 text-caption leading-relaxed text-fg-secondary max-md:text-ui">{children}</div>
				}
			>
				<button
					type="button"
					aria-label={label}
					className={cn(
						"inline-flex shrink-0 cursor-help items-center justify-center text-fg-muted transition-colors",
						// The 14px dot sits in a 24px box, the smallest target WCAG 2.5.8 allows, pulled in by 4px a side
						// so a row's layout barely moves. On a phone the box is 44px and takes that room in the row, so
						// it never lies over a neighbour's target or under one.
						"-m-1 size-control-xs max-md:m-0 max-md:size-control-touch max-md:rounded-control",
						"hover:text-fg hover:opacity-100 focus-visible:text-fg focus-visible:opacity-100",
						"rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
					)}
				>
					<InfoIcon className="size-icon-sm" strokeWidth={1.75} />
				</button>
			</Tooltip>
		</span>
	);
}
