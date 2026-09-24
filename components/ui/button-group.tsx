"use client";

import type { ComponentType, Key, ReactNode } from "react";
import { ToggleButton } from "./toggle-button";
import { Tooltip } from "./tooltip";
import { cn } from "@/lib/utils/cn";

export interface ButtonGroupOption<T> {
	value: T;
	label: ReactNode;
	icon?: ComponentType<{ className?: string }>;
	disabled?: boolean;
	/** Override the class on this specific button (e.g. fixed width for preset chips). */
	classes?: string;
	/** React key — defaults to `String(value)`, override when values aren't primitive. */
	key?: Key;
	/** Rich tooltip shown on hover/focus of this button. Omit for no tooltip. */
	tooltip?: ReactNode;
	/** Side the tooltip opens toward. Default `top`. */
	tooltipSide?: "top" | "right" | "bottom" | "left";
	/** Hover delay before the tooltip opens, in ms. Omit for the Tooltip default (400); 0 = instant. */
	tooltipDelay?: number;
}

type CommonProps<T> = {
	options: ButtonGroupOption<T>[];
	variant?: "chip" | "pill";
	size?: "sm" | "md";
	/** Tailwind gap class between items. */
	gap?: string;
	/** Extra classes on the outer flex container. */
	classes?: string;
	/** Wrap items onto multiple lines. Default `true`. */
	wrap?: boolean;
};

type SingleProps<T> = CommonProps<T> & {
	multi?: false;
	selected: T | null | undefined;
	onChange: (value: T) => void;
};

type MultiProps<T> = CommonProps<T> & {
	multi: true;
	selected: readonly T[];
	onChange: (value: T) => void;
};

export type ButtonGroupProps<T> = SingleProps<T> | MultiProps<T>;

export function ButtonGroup<T>(props: ButtonGroupProps<T>) {
	const {
		options,
		variant = "chip",
		size = "sm",
		gap = "gap-1.5",
		classes,
		wrap = true,
	} = props;

	const isPressed = (value: T): boolean =>
		props.multi ? props.selected.includes(value) : props.selected === value;

	return (
		<div className={cn("flex", wrap ? "flex-wrap" : "", gap, classes)}>
			{options.map((opt) => {
				const key = opt.key ?? String(opt.value);
				// A DISABLED option that carries a tooltip is disabled softly. The `disabled` attribute takes
				// `pointer-events: none` and browsers dispatch no hover on a disabled control at all, so the
				// tooltip explaining why the option is unavailable could never open, and that tooltip is
				// usually the only place the reason is written. Soft means: still hoverable and focusable,
				// `aria-disabled` for assistive tech, the same greyed look, and a press that does nothing.
				const soft = !!opt.disabled && opt.tooltip != null;
				const button = (
					<ToggleButton
						key={key}
						variant={variant}
						size={size}
						pressed={isPressed(opt.value)}
						onPressedChange={() => {
							if (!soft) props.onChange(opt.value);
						}}
						disabled={soft ? undefined : opt.disabled}
						aria-disabled={opt.disabled}
						icon={opt.icon}
						label={opt.label}
						classes={cn(soft ? "opacity-50 cursor-not-allowed" : "", opt.classes)}
					/>
				);
				return opt.tooltip != null ? (
					<Tooltip
						key={key}
						content={opt.tooltip}
						side={opt.tooltipSide ?? "top"}
						delay={opt.tooltipDelay}
					>
						{button}
					</Tooltip>
				) : (
					button
				);
			})}
		</div>
	);
}
