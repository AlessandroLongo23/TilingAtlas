"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

// A headerless height:auto reveal for sidebar controls that appear/disappear on a toggle (Islamic,
// Inversive, style-specific sliders, sub-checkboxes) — so a revealed block slides its siblings down/up
// instead of popping in. Mirrors the catalogue's SidebarSection motion (150ms, ease-standard) so the whole
// sidebar reveals uniformly, but also honours prefers-reduced-motion (which SidebarSection predates).
//
// Keyed on an external `show` boolean. `initial={false}` means the block never animates on first paint —
// only on a later toggle, so switching tiling doesn't animate every control in. When `show` is false and
// nothing is exiting, this renders no DOM node, so a parent `space-y-*` gap closes with it.
//
// Overflow is clipped ONLY while the height is animating (so growing/shrinking content stays inside the
// box), then released to `visible` once open (transitionEnd) — otherwise a settled block would clip any
// child that paints outside its layout box, e.g. a slider thumb overhanging the last row's bottom.
export function Reveal({ show, children }: { show: boolean; children: ReactNode }) {
	const reduce = useReducedMotion();
	return (
		<AnimatePresence initial={false}>
			{show ? (
				<motion.div
					initial={{ height: 0, opacity: 0, overflow: "hidden" }}
					animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
					exit={{ height: 0, opacity: 0, overflow: "hidden" }}
					transition={reduce ? { duration: 0 } : { duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
				>
					{children}
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
