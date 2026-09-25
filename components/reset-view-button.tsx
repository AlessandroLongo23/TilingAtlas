"use client";

// The phone's way home. On the desktop a canvas resets its view on right-click; a touch screen has no
// right button, and a pinch strays far more easily than a wheel, so every explorer canvas gets this
// button on a phone and nothing on a desktop.
//
// It does not call into any canvas. requestViewReset broadcasts, and every live view on the page
// (useAperiodicView, the automata board, the 3D surface) listens and eases back to its own home, so
// the multigrid's two panels both return from one tap.

import { LocateFixed } from "lucide-react";
import { requestViewReset } from "@/lib/render/touchGestures";
import { cn } from "@/lib/utils/cn";

/**
 * Positioned by the caller (absolute or fixed); styled as FullscreenToggle's twin, 44px, phone only.
 * `onClick` replaces the broadcast for a view that is not listening (a wall's detail preview).
 */
export function ResetViewButton({ className, onClick = requestViewReset }: { className?: string; onClick?: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label="Reset view"
			title="Reset view"
			className={cn(
				"z-30 hidden size-11 items-center justify-center ta-float text-fg-secondary transition-colors hover:text-fg max-md:flex max-md:touch-pan-x max-md:touch-pan-y",
				className,
			)}
		>
			<LocateFixed size={18} />
		</button>
	);
}
