import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type Tone = "danger" | "warning" | "success" | "info";

const TONE: Record<Tone, string> = {
	danger: "border-danger/30 bg-danger-subtle text-danger",
	warning: "border-warning/30 bg-warning-subtle text-fg",
	success: "border-success/30 bg-success-subtle text-success",
	info: "border-line-subtle bg-surface-sunken text-fg-secondary",
};

/** A message in a panel or a dialog: an export that failed, a tiling that cannot be drawn, a note on what
 *  is shown. One box per tone, so an error reads as an error wherever it appears. */
export function Notice({
	tone = "danger",
	icon,
	className,
	children,
}: {
	tone?: Tone;
	/** A glyph before the text. */
	icon?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			role={tone === "danger" ? "alert" : undefined}
			className={cn("flex gap-2 rounded-control border px-3 py-2 text-body", TONE[tone], className)}
		>
			{icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
			<div className="min-w-0">{children}</div>
		</div>
	);
}
