import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

// Small status/metadata chip — extracted from the inline <span> badges in tiling-card.tsx so the
// run console and the gallery share one primitive (design-system: reuse over copy-paste).
export type BadgeTone = "neutral" | "accent" | "info" | "success" | "warn" | "danger";

// Monochrome design system: every tone but danger resolves to neutral ink (the tokens themselves
// are monochrome now); tones survive as semantic call-site vocabulary.
const TONE: Record<BadgeTone, string> = {
	neutral: "text-fg-muted bg-surface-overlay/50",
	accent: "text-accent bg-accent-subtle",
	info: "text-info bg-info-subtle",
	success: "text-success bg-success-subtle",
	warn: "text-warning bg-warning-subtle",
	danger: "text-danger bg-danger-subtle",
};

interface BadgeProps {
	tone?: BadgeTone;
	mono?: boolean;
	pill?: boolean;
	className?: string;
	children: ReactNode;
}

export function Badge({ tone = "neutral", mono = false, pill = false, className, children }: BadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium leading-none",
				mono && "font-mono tabular-nums",
				TONE[tone],
				className,
			)}
		>
			{children}
		</span>
	);
}
