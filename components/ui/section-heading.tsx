import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface SectionHeadingProps {
	children: ReactNode;
	count?: number | null;
	loading?: boolean;
	className?: string;
}

export function SectionHeading({ children, count, loading = false, className }: SectionHeadingProps) {
	return (
		<h3 className={cn("ta-label flex items-center gap-1.5", className)}>
			<span>{children}</span>
			{count != null ? (
				<span className="bg-surface-overlay px-1.5 py-0.5 text-fg-secondary tabular-nums">{count}</span>
			) : null}
			{loading ? <span className="text-xs text-fg-muted normal-case">(loading…)</span> : null}
		</h3>
	);
}
