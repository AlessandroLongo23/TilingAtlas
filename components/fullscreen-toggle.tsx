"use client";

// The fullscreen (immersive) control the parametric shelves share.
//
// /play grew this first and keeps its own copy inline, because its F/Esc branches live inside one long
// key chain that also owns every view toggle. The shelves here have no such chain, so the button and
// its shortcuts are one import: collapse the header and the sidebar, give the canvas the window.
//
// The sidebar is CLIPPED, not unmounted — see the wrapper each page puts around it. Unmounting would
// throw away the scroll position of a 93-entry type grid every time you looked at the tiling.

import { useEffect } from "react";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import { Maximize, Minimize } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import { useImmersive } from "@/stores/immersive";

/**
 * F toggles immersive mode, Esc leaves it, and leaving the route restores the chrome.
 *
 * The unmount reset is not optional: no other route carries a toggle, so a collapsed header that
 * survived the navigation would be unrecoverable without a reload.
 */
export function useImmersiveShortcuts() {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			// Skip modifier combos (Cmd+F is the browser's find) and anything typed into a control.
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (isTypingTarget(e)) return;
			if (e.key === "f" || e.key === "F") {
				e.preventDefault();
				useImmersive.getState().toggle();
			} else if (e.key === "Escape" && useImmersive.getState().immersive) {
				// Esc only exits immersive; otherwise leave it for whatever else handles it.
				e.preventDefault();
				useImmersive.getState().set(false);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	useEffect(() => () => useImmersive.getState().set(false), []);
}

/**
 * The button itself. Absolutely positioned, so its parent needs `relative`; stays visible while
 * immersive, since it is the only way back.
 */
export function FullscreenToggle({ className }: { className?: string }) {
	const immersive = useImmersive((s) => s.immersive);
	return (
		<Tooltip
			label={immersive ? "Exit fullscreen" : "Fullscreen canvas"}
			shortcut={immersive ? "F or Esc" : "F"}
			side="left"
			delay={0}
		>
			<button
				type="button"
				onClick={() => useImmersive.getState().toggle()}
				aria-label={immersive ? "Exit fullscreen" : "Enter fullscreen"}
				aria-pressed={immersive}
				className={cn(
					"absolute top-4 right-4 z-30 flex items-center justify-center rounded-lg p-2 text-fg-muted bg-surface-overlay/80 backdrop-blur-sm border border-line hover:text-fg hover:border-line-strong transition-colors",
					className,
				)}
			>
				{immersive ? <Minimize size={16} /> : <Maximize size={16} />}
			</button>
		</Tooltip>
	);
}
