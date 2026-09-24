"use client";

import type { Key, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Tooltip } from "./tooltip";

// ButtonGroup's wall-mounted twin: the same options in/value out, laid out as a fixed grid of cells
// instead of a wrapped row of chips. The 1px gaps between cells are the only separation, and the block
// is always a rectangle: a short last row stretches its cells to share the full width. (It used to be
// padded with blank cells, which read as missing buttons.) The grid is `columns × r` tracks, r being
// the last row's length: ordinary cells span r of them, last-row cells span `columns`.
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
	/** Stretch a short last row to the full width (default, right for words); `false` keeps the
	 *  column grid, which numbers and codes want so they line up. */
	fill?: boolean;
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
	const { options, columns, classes, fill = true } = props;
	const isPressed = (value: T): boolean =>
		props.multi ? props.selected.includes(value) : props.selected === value;
	const r = fill ? options.length % columns || columns : 1;
	const lastRow = fill ? options.length - r : options.length;

	return (
		<div
			className={cn("ta-seg grid", classes)}
			style={{ gridTemplateColumns: `repeat(${columns * r}, minmax(0, 1fr))` }}
		>
			{options.map((opt, i) => {
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
						style={{ gridColumn: `span ${i < lastRow ? r : columns}` }}
						className={cn(
							"ta-tab flex min-h-7 items-center justify-center px-1.5 py-1 text-center text-xs font-medium leading-tight transition-colors",
							"focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-accent/50",
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
		</div>
	);
}
