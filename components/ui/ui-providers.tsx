"use client";

import { useEffect, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { Tooltip } from "@base-ui/react/tooltip";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";

/**
 * App-wide interaction settings, mounted once at the root.
 * - Motion follows the OS reduced-motion setting: transforms and layout animations are skipped,
 *   opacity fades are kept.
 * - Tooltips form one group: once one has shown, the next one the pointer reaches opens at once and
 *   without its fade, so running along a toolbar reads its labels off like a strip instead of waiting
 *   out the delay on every button.
 * - A shortcut presses its keycap: hit V and the V cap on the View options tab dips, so the key and the
 *   control it drives are seen to be the same thing.
 */
export function UiProviders({ children }: { children: ReactNode }) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || isTypingTarget(e)) return;
			for (const cap of document.querySelectorAll<HTMLElement>(`kbd[data-key="${CSS.escape(e.key.toLowerCase())}"]`)) {
				cap.classList.remove("ta-kbd-hit");
				void cap.offsetWidth; // restart the animation on a quick second press
				cap.classList.add("ta-kbd-hit");
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	return (
		<MotionConfig reducedMotion="user">
			<Tooltip.Provider timeout={500}>{children}</Tooltip.Provider>
		</MotionConfig>
	);
}
