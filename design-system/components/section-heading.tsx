import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface SectionHeadingProps {
	children: ReactNode;
	count?: number | null;
	className?: string;
}

export function SectionHeading({ children, count, className }: SectionHeadingProps) {
	return (
		<h3 className={cn("ta-label flex items-center gap-1.5", className)}>
			<span>{children}</span>
			{count != null ? (
				<span className="bg-surface-overlay px-1.5 py-0.5 text-fg-secondary tabular-nums">{count}</span>
			) : null}
		</h3>
	);
}
