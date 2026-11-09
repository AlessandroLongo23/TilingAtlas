"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { fmMotion } from "../motion";

// THE show/hide motion. A block that appears or goes on a toggle (a sub-control, a revealed slider, the
// body of a Disclosure) slides its siblings instead of popping in: height and opacity, the opacity
// leading on the way in and finishing first on the way out, so content never shows clipped mid-fold.
// (Fold, the same motion with other timings, was merged in here.)
//
// Keyed on `show`. `initial={false}`: nothing animates on first paint, only on a later toggle, so
// switching tiling does not animate every control in. Hidden, it renders no node, so a parent's
// `space-y-*` gap closes with it. Overflow is clipped only while the height moves, then released, so a
// settled block does not crop a slider thumb or a focus ring. With reduced motion it simply appears.
export function Reveal({ show, children }: { show: boolean; children: ReactNode }) {
	const reduce = useReducedMotion();
	return (
		<AnimatePresence initial={false}>
			{show ? (
				<motion.div
					initial={{ height: 0, opacity: 0, overflow: "hidden" }}
					animate={{
						height: "auto",
						opacity: 1,
						transitionEnd: { overflow: "visible" },
						transition: reduce
							? { duration: 0 }
							: { height: fmMotion("glide"), opacity: { ...fmMotion("feedback"), delay: 0.03 } },
					}}
					exit={{
						height: 0,
						opacity: 0,
						overflow: "hidden",
						transition: reduce
							? { duration: 0 }
							: { height: fmMotion("glideExit"), opacity: fmMotion("feedback") },
					}}
				>
					{children}
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
