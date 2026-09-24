import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface SectionHeadingProps {
	children: ReactNode;
	count?: number | null;
	loading?: boolean;
	className?: string;
}

export function SectionHeading({
	children,
	count,
	loading = false,
	className,
}: SectionHeadingProps) {
	return (
		<h3
			className={cn(
				"ta-label flex items-center gap-1.5",
				className,
			)}
		>
			<span>{children}</span>
			{count != null ? (
				<span className="text-fg-secondary bg-surface-overlay px-1.5 py-0.5 tabular-nums">
					{count}
				</span>
			) : null}
			{loading ? <span className="text-fg-muted normal-case text-xs">(loading…)</span> : null}
		</h3>
	);
}
