"use client";

import type { ComponentProps, ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "chip" | "pill";
type Size = "sm" | "md";

interface ToggleButtonProps extends Omit<ComponentProps<"button">, "className" | "onChange"> {
	pressed: boolean;
	onPressedChange?: (pressed: boolean) => void;
	variant?: Variant;
	size?: Size;
	icon?: ComponentType<{ className?: string }>;
	label?: ReactNode;
	fullWidth?: boolean;
	classes?: string;
}

// Both shapes share the control radius; the variant prop survives so call sites don't churn.
const SHAPE: Record<Variant, string> = {
	chip: "",
	pill: "",
};

const SIZE_CLASSES: Record<Size, string> = {
	sm: "h-7 px-2.5 text-xs gap-1.5",
	md: "h-9 px-3 text-sm gap-2",
};

const ICON_SIZE: Record<Size, string> = {
	sm: "w-3.5 h-3.5",
	md: "w-4 h-4",
};

// Selected = raised paper with an ink edge, the same look as a selected OptionWall cell (.ta-tab), so
// every "pick one" control in the app selects the same way.
const STATE_CLASSES = {
	on: "bg-surface-raised border-line-strong text-fg shadow-sm",
	off: "bg-transparent border-line text-fg-muted hover:text-fg hover:bg-surface-overlay",
};

export function ToggleButton({
	pressed,
	onPressedChange,
	variant = "chip",
	size = "md",
	icon: Icon,
	label,
	fullWidth = false,
	classes,
	children,
	disabled,
	onClick,
	// Read off `rest` so a caller can say "disabled by intent" without the native attribute, which
	// would take pointer-events with it and kill any tooltip explaining the refusal (see ButtonGroup).
	"aria-disabled": ariaDisabled,
	// Forwarded so consumers like the Base UI Tooltip trigger can anchor to the real <button>.
	ref,
	...rest
}: ToggleButtonProps) {
	return (
		<button
			type="button"
			{...rest}
			ref={ref}
			aria-pressed={pressed}
			disabled={disabled}
			aria-disabled={ariaDisabled ?? disabled}
			onClick={(e) => {
				onClick?.(e);
				if (!e.defaultPrevented) onPressedChange?.(!pressed);
			}}
			className={cn(
				"inline-flex items-center justify-center rounded-control font-medium border transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
				SHAPE[variant],
				SIZE_CLASSES[size],
				pressed ? STATE_CLASSES.on : STATE_CLASSES.off,
				fullWidth ? "w-full" : "",
				disabled ? "opacity-50 cursor-not-allowed pointer-events-none" : "cursor-pointer",
				classes,
			)}
		>
			{Icon ? <Icon className={ICON_SIZE[size]} /> : null}
			{label ?? children}
		</button>
	);
}
