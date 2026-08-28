"use client";

import { cn } from "@/lib/utils/cn";

interface ToggleProps {
	id?: string;
	label?: string;
	leftValue: string;
	rightValue: string;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	/** Padding on each segment. The default suits a sidebar row; the filter bar passes a tighter one. */
	padding?: string;
}

// A two-segment control: ONE track, TWO equal halves, the selection drawn as a pill inside the track.
//
// It used to be two separately bordered buttons in an `inline-flex`, which had three visible faults at
// once (AL, 2026-08-25). The pair sized to its own text, so it never filled the sidebar row and the
// leftover width read as an empty muted container. The halves came out unequal, since each one sized to
// its own label. And the seam showed the UNSELECTED button's border: the left button had `border-r-0`, so
// the divider was always the right button's left edge, whichever one was selected. A track with no
// per-segment borders has no seam to get wrong, and `grid-cols-2` makes the halves equal by construction.
export function Toggle({
	id,
	label,
	leftValue,
	rightValue,
	value,
	onChange,
	disabled = false,
	padding = "py-1.5 px-3",
}: ToggleProps) {
	const segment = (v: string) => (
		<button
			type="button"
			aria-label={v}
			role="radio"
			aria-checked={value === v}
			disabled={disabled}
			onClick={() => {
				if (value !== v && !disabled) onChange(v);
			}}
			className={cn(
				"rounded-[5px] text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-line-focus/60",
				padding,
				value === v ? "bg-accent-subtle text-fg shadow-sm" : "text-fg-secondary hover:text-fg",
				disabled ? "cursor-not-allowed" : "cursor-pointer",
			)}
		>
			{v.charAt(0).toUpperCase() + v.slice(1)}
		</button>
	);

	return (
		<div className={cn("grid w-full gap-1.5", disabled ? "opacity-50" : "")}>
			{label ? (
				<label htmlFor={id} className="text-sm font-medium leading-none text-fg-secondary">
					{label}
				</label>
			) : null}
			<div
				role="radiogroup"
				className="grid w-full grid-cols-2 gap-1 rounded-md border border-line bg-surface-overlay/40 p-1"
			>
				{segment(leftValue)}
				{segment(rightValue)}
			</div>
		</div>
	);
}
