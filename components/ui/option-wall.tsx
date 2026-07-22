"use client";

import type { Key, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Tooltip } from "./tooltip";

// ButtonGroup's wall-mounted twin: the same options in/value out, laid out as a fixed grid of cells
// instead of a wrapped row of chips. Every cell is the same size, the 1px gaps between them are the
// only separation, and the last row is padded with blanks so the block stays rectangular — a ragged
// edge would break the grid the whole design is made of.
//
// State rides on aria-pressed, which is what `.ta-tab` (globals.css) styles off: idle cells take the
// panel fill, the selected one goes to pure white/black, hover moves toward the line colour.

export interface OptionWallItem<T> {
	value: T;
	label: ReactNode;
	disabled?: boolean;
	/** React key — defaults to `String(value)`, override when values aren't primitive. */
	key?: Key;
	title?: string;
	/** Rich tooltip shown on hover/focus. Omit for none. */
	tooltip?: ReactNode;
	tooltipSide?: "top" | "right" | "bottom" | "left";
	tooltipDelay?: number;
}

type CommonProps<T> = {
	options: OptionWallItem<T>[];
	/** Cells per row. Pick it from the label lengths: 6 for numbers, 2–3 for words. */
	columns: number;
	classes?: string;
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

export function OptionWall<T>(props: SingleProps<T> | MultiProps<T>) {
	const { options, columns, classes } = props;
	const isPressed = (value: T): boolean =>
		props.multi ? props.selected.includes(value) : props.selected === value;
	const blanks = (columns - (options.length % columns)) % columns;

	return (
		<div
			className={cn("grid gap-px", classes)}
			style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
		>
			{options.map((opt) => {
				const key = opt.key ?? String(opt.value);
				const button = (
					<button
						key={key}
						type="button"
						aria-pressed={isPressed(opt.value)}
						disabled={opt.disabled}
						aria-disabled={opt.disabled}
						title={opt.title}
						onClick={() => props.onChange(opt.value)}
						className={cn(
							"ta-tab ta-wall-cell flex min-h-8 items-center justify-center px-1.5 py-1.5 text-center text-xs font-medium leading-tight transition-colors",
							"focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg",
							isPressed(opt.value) ? "text-fg" : "text-fg-muted hover:text-fg-secondary",
							opt.disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
						)}
					>
						{opt.label}
					</button>
				);
				return opt.tooltip != null ? (
					<Tooltip key={key} content={opt.tooltip} side={opt.tooltipSide ?? "top"} delay={opt.tooltipDelay}>
						{button}
					</Tooltip>
				) : (
					button
				);
			})}
			{Array.from({ length: blanks }, (_, i) => (
				<div key={`blank-${i}`} className="ta-wall-cell bg-surface-chrome" />
			))}
		</div>
	);
}
