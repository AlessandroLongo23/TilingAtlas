"use client";

import type { ComponentType, Key, ReactNode } from "react";
import { ToggleButton } from "./toggle-button";
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
			{options.map((opt) => (
				<ToggleButton
					key={opt.key ?? String(opt.value)}
					variant={variant}
					size={size}
					pressed={isPressed(opt.value)}
					onPressedChange={() => props.onChange(opt.value)}
					disabled={opt.disabled}
					icon={opt.icon}
					label={opt.label}
					classes={opt.classes}
				/>
			))}
		</div>
	);
}
