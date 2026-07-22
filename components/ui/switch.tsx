"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

type Size = "sm" | "md";

interface SwitchProps extends Omit<ComponentProps<"button">, "className" | "onChange"> {
	checked: boolean;
	onCheckedChange?: (checked: boolean) => void;
	size?: Size;
	classes?: string;
}

// Track box + knob edge. Both sizes are picked so the knob sits in a uniform 3px gutter:
// (track height − 2px border − thumb) / 2 = 3px at sm (20−2−12) and md (24−2−16).
const TRACK: Record<Size, string> = {
	sm: "w-9 h-5 [--sw-thumb:12px]",
	md: "w-12 h-6 [--sw-thumb:16px]",
};

export function Switch({
	checked,
	onCheckedChange,
	size = "md",
	classes,
	disabled,
	onClick,
	...rest
}: SwitchProps) {
	return (
		<button
			type="button"
			role="switch"
			{...rest}
			aria-checked={checked}
			disabled={disabled}
			aria-disabled={disabled}
			onClick={(e) => {
				onClick?.(e);
				if (!e.defaultPrevented) onCheckedChange?.(!checked);
			}}
			className={cn(
				// Squared w/b design system: a rectangle, no radii. ON is a solid fg track carrying a
				// surface-coloured square knob (pure inversion); OFF an outlined track with a muted knob.
				"group relative border focus:outline-none focus-visible:ring-1 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
				"transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]",
				TRACK[size],
				checked ? "bg-fg border-fg" : "bg-transparent border-line-strong",
				disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
				!disabled && !checked ? "hover:border-fg" : "",
				classes,
			)}
		>
			{/* Travel corridor. Its width IS the knob's travel — the padding box (which excludes the
			    border) less the two 3px gutters and the knob itself — so `translate-x-full` parks the
			    knob flush against the far gutter at any size, with no hardcoded offsets to drift.
			    The glide lives here because it must: the old left-1 ⇄ right-1 swap interpolated from
			    `auto`, which CSS cannot animate, so the knob teleported. Centring is flexbox rather
			    than `top-1`, so the knob is exactly centred instead of the old 4px-above/2px-below. */}
			<span
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute top-0 left-[3px] flex h-full items-center",
					"w-[calc(100%_-_6px_-_var(--sw-thumb))]",
					"transition-[translate] duration-[var(--duration-fast)] ease-[var(--ease-out)] motion-reduce:transition-none",
					checked ? "translate-x-full" : "translate-x-0",
				)}
			>
				{/* Pressing stretches the knob toward where it is about to go — a tactile confirm of
				    the hit that is over in 120ms. Origin flips with state so it never stretches
				    backwards out of the track. */}
				<span
					className={cn(
						"block h-[var(--sw-thumb)] w-[var(--sw-thumb)] shrink-0",
						"transition-[scale,background-color] duration-[var(--duration-fast)] ease-[var(--ease-out)] motion-reduce:transition-none",
						checked ? "origin-right bg-surface" : "origin-left bg-fg-muted",
						disabled ? "" : "group-active:scale-x-110 motion-reduce:group-active:scale-x-100",
						!disabled && !checked ? "group-hover:bg-fg" : "",
					)}
				/>
			</span>
		</button>
	);
}
