import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { InfoDot } from "./info-dot";

/** A labelled control: the section label, an explanation behind an InfoDot when there is one, then the
 *  control. Every settings row in both apps is this, so the label and its dot sit the same everywhere. */
export function Field({
	label,
	hint,
	hintSide,
	hintLabel,
	inline = false,
	aside,
	className,
	children,
}: {
	label: ReactNode;
	hint?: ReactNode;
	hintSide?: "top" | "right" | "bottom" | "left";
	/** The dot's accessible name, when "What is this?" says too little. */
	hintLabel?: string;
	/** The label beside the control on one line, for a short control (a stepper, a small toggle). */
	inline?: boolean;
	/** A small control at the end of the label line ("All", "Clear"). */
	aside?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn(inline ? "flex items-center justify-between gap-3" : "space-y-1.5", className)}>
			{aside ? (
				<div className="flex items-center justify-between gap-2">
					<div className="ta-label flex items-center gap-1.5">
						{label}
						{hint ? (
							<InfoDot side={hintSide} label={hintLabel}>
								{hint}
							</InfoDot>
						) : null}
					</div>
					{aside}
				</div>
			) : (
				<div className="ta-label flex items-center gap-1.5">
					{label}
					{hint ? (
						<InfoDot side={hintSide} label={hintLabel}>
							{hint}
						</InfoDot>
					) : null}
				</div>
			)}
			{children}
		</div>
	);
}
