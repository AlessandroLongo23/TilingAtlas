"use client";

import { createContext, useEffect, useRef, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { CARD_LAYOUT_SPRING } from "@/components/interactive-tiling-preview-card";

// The grid a run of tiling cards renders into, built so a card expansion moves EVERYTHING smoothly:
// - LayoutGroup: a card's expansion only re-renders that card, so its siblings would never re-measure
//   and would snap to their reflowed spots. The group makes every card FLIP whenever one changes.
// - Animated real height on the wrapper: FLIP is transforms-only — the grid's actual height still
//   jumps instantly, snapping all the prose below. A ResizeObserver feeds the grid's true height into
//   a motion-animated `height` on the wrapper, so the document flow itself eases (same spring as the
//   FLIP, one visual movement). Animating a real layout property is deliberate here — it's the only
//   way to push static content — and it's one property on one element on a rare interaction.
// One figure box around the grid, its caption under it, as every article figure has
// (components/about/figure.tsx). Cards inside know they are in a grid through InCardGrid, so a lone
// card can take a figure box of its own instead.
export const InCardGrid = createContext(false);

// Module-level (not recreated per render) so the wrapper's height state survives re-renders.
export function CardGrid({
	cols,
	caption,
	children,
}: {
	cols?: string | number;
	caption?: string;
	children?: React.ReactNode;
}) {
	const innerRef = useRef<HTMLDivElement | null>(null);
	const [height, setHeight] = useState<number | "auto">("auto");
	const reduceMotion = useReducedMotion();

	useEffect(() => {
		const el = innerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	return (
		<motion.div
			className="not-prose my-8 border border-line bg-surface max-md:-mx-1"
			initial={false}
			animate={{ height }}
			transition={reduceMotion ? { duration: 0 } : CARD_LAYOUT_SPRING}
		>
			<div ref={innerRef} className="p-4 max-md:p-3">
				<div
					className={
						String(cols) === "2"
							? "grid grid-cols-1 gap-5 sm:grid-cols-2"
							: "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
					}
				>
					<InCardGrid value={true}>
						<LayoutGroup>{children}</LayoutGroup>
					</InCardGrid>
				</div>
				{caption && <p className="mt-3 text-sm leading-snug text-fg-muted">{caption}</p>}
			</div>
		</motion.div>
	);
}
