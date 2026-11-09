import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

// Small status/metadata chip — extracted from the inline <span> badges in tiling-card.tsx so the
// run console and the gallery share one primitive (design-system: reuse over copy-paste).
// The tag looks: `solid` (a requirement, in the accent), `ink` (the strongest claim, in the text colour),
// `outline` (an option, in the accent), `line` (a plain outlined tag), `dashed` (something not yet established) and `raised` (a tag that sits on a
// figure and needs its own paper).
export type BadgeTone =
	| "neutral"
	| "accent"
	| "info"
	| "success"
	| "warn"
	| "danger"
	| "solid"
	| "ink"
	| "outline"
	| "line"
	| "dashed"
	| "raised";

// Status tones other than danger and accent resolve to neutral ink in the token layer; the tone names
// survive as semantic call-site vocabulary.
const TONE: Record<BadgeTone, string> = {
	neutral: "text-fg-secondary bg-surface-sunken",
	accent: "text-fg-accent bg-accent-subtle",
	info: "text-info bg-info-subtle",
	success: "text-success bg-success-subtle",
	warn: "text-warning bg-warning-subtle",
	danger: "text-danger bg-danger-subtle",
	solid: "text-accent-contrast bg-accent",
	ink: "text-fg-inverse bg-fg",
	outline: "text-fg-accent bg-surface-raised ring-1 ring-inset ring-accent/60",
	raised: "text-fg-secondary bg-surface-raised shadow-raised",
	dashed: "text-fg-secondary bg-surface-raised border border-dashed border-line-strong",
	line: "text-fg-secondary ring-1 ring-inset ring-line",
};

interface BadgeProps extends ComponentProps<"span"> {
	tone?: BadgeTone;
	mono?: boolean;
	/** Small caps with wide tracking: the metadata tags laid over a card's thumbnail. */
	caps?: boolean;
}

export function Badge({ tone = "neutral", mono = false, caps = false, className, children, ...rest }: BadgeProps) {
	return (
		<span
			{...rest}
			className={cn(
				// One line always; a tag longer than its room ends in an ellipsis instead of wrapping or spilling.
				"inline-flex max-w-full min-w-0 items-center gap-1 min-h-4 rounded-tag px-1.5 py-0.5 text-micro leading-none font-medium whitespace-nowrap",
				mono && "font-mono tabular-nums",
				caps && "text-micro tracking-wide uppercase",
				TONE[tone],
				className,
			)}
		>
			{typeof children === "string" ? <span className="truncate">{children}</span> : children}
		</span>
	);
}
