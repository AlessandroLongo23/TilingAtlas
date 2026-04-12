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

const TRACK: Record<Size, string> = {
	sm: "w-9 h-5",
	md: "w-12 h-6",
};

const THUMB: Record<Size, string> = {
	sm: "w-3 h-3 top-1",
	md: "w-4 h-4 top-1",
};

const THUMB_OFFSET: Record<Size, { on: string; off: string }> = {
	sm: { on: "right-1", off: "left-1" },
	md: { on: "right-1", off: "left-1" },
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
				"relative rounded-pill transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-line-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
				TRACK[size],
				checked ? "bg-accent-subtle" : "bg-surface-overlay/60",
				disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
				classes,
			)}
		>
			<span
				className={cn(
					"absolute rounded-full transition-all",
					THUMB[size],
					checked ? `bg-accent ${THUMB_OFFSET[size].on}` : `bg-fg-muted ${THUMB_OFFSET[size].off}`,
				)}
			/>
		</button>
	);
}
