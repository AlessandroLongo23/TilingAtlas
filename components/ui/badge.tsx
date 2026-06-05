import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

// Small status/metadata chip — extracted from the inline <span> badges in tiling-card.tsx so the
// run console and the gallery share one primitive (design-system: reuse over copy-paste).
export type BadgeTone = "neutral" | "accent" | "info" | "success" | "warn" | "danger";

const TONE: Record<BadgeTone, string> = {
	neutral: "text-fg-muted bg-surface-overlay/50",
	accent: "text-accent bg-accent-subtle",
	info: "text-info bg-info-subtle",
	success: "text-emerald-400 bg-emerald-400/10",
	warn: "text-yellow-400 bg-yellow-400/10",
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
				pill ? "rounded-full" : "rounded",
				mono && "font-mono tabular-nums",
				TONE[tone],
				className,
			)}
		>
			{children}
		</span>
	);
}
