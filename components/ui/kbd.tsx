"use client";

import type { ReactNode } from "react";
import { usePadShortcut } from "@/lib/stores/gamepad";
import { cn } from "@/lib/utils/cn";

// A small keycap badge for showing a keyboard shortcut next to a control's label. Hidden on a phone,
// which has no keys to press. With a controller in use it shows the button mapped to that shortcut, or
// nothing where no button is.
// `literal` shows the children as given on any device: a cap that already names a controller button.
export function Kbd({ children, className, literal }: { children: ReactNode; className?: string; literal?: boolean }) {
	const pad = usePadShortcut(!literal && typeof children === "string" ? children : undefined);
	if (pad === null) return null;
	return (
		<kbd
			className={cn(
				"inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line bg-surface-overlay/70 px-1 font-mono text-[10px] font-medium leading-none text-fg-muted max-md:hidden",
				className,
			)}
		>
			{pad ?? children}
		</kbd>
	);
}
