"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { animate } from "motion/react";
import { cn } from "@/lib/utils/cn";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * A count that rolls to its new value instead of jumping (a filter narrowing 14,556 tilings to 212).
 * Tabular figures, so the digits do not jostle while they roll. React renders the first value only;
 * after that the effect owns the text node, so a re-render never fights the animation.
 */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
	const ref = useRef<HTMLSpanElement>(null);
	const [initial] = useState(value);
	const shown = useRef(value);
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el || shown.current === value) return;
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (reduce) {
			shown.current = value;
			el.textContent = fmt(value);
			return;
		}
		const run = animate(shown.current, value, {
			duration: 0.6,
			ease: [0.23, 1, 0.32, 1],
			onUpdate: (v) => {
				shown.current = v;
				el.textContent = fmt(v);
			},
		});
		return () => run.stop();
	}, [value]);
	return (
		<span ref={ref} className={cn("tabular-nums", className)}>
			{fmt(initial)}
		</span>
	);
}
