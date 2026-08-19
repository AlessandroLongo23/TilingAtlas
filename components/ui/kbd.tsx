import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

// A small keycap badge for showing a keyboard shortcut next to a control's label.
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<kbd
			className={cn(
				"inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line bg-surface-overlay/70 px-1 font-mono text-[10px] font-medium leading-none text-fg-muted",
				className,
			)}
		>
			{children}
		</kbd>
	);
}
