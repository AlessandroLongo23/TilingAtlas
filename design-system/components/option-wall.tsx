"use client";

import type { ComponentType, Key, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { HoverPill } from "./hover-pill";
import { Kbd } from "./kbd";
import { SegIndicator } from "./seg-indicator";
import { Tooltip, type TooltipDelay } from "./tooltip";

// THE choice control: pick one of N, or several with `multi`, in both the atlas and the Searcher. A
// segmented track (.ta-seg) of .ta-tab options: the selection pill slides to the chosen one and the hover
// pill follows the pointer (SegIndicator). A change to how a choice looks or moves is made here once.
// (ButtonGroup, ToggleButton and Toggle drew the same job as bordered chips; they were folded in here.)
//
// Two layouts. With `columns` the options fill a grid that is always a rectangle: a short last row
// stretches its cells to share the full width. The grid is `columns × r` tracks, r being the last row's
// length: ordinary cells span r of them, last-row cells span `columns`. Without `columns` the options sit
// in one row at their own widths and wrap.
//
// State rides on aria-pressed, which is what `.ta-tab` (globals.css) styles off.

export interface OptionWallItem<T> {
	value: T;
	label: ReactNode;
	/** A glyph before the label. */
	icon?: ComponentType<{ className?: string }>;
	/** The key that picks it: a keycap after the label, as in Tabs. The caller handles the key. */
	shortcut?: string;
	disabled?: boolean;
	/** React key — defaults to `String(value)`, override when values aren't primitive. */
	key?: Key;
	/** Names the option in a plain Tooltip under the pointer. */
	title?: string;
	/** The name a screen reader says, for an option whose label is a drawing. */
	ariaLabel?: string;
	/** A second line under the label: a count, a size. */
	sub?: ReactNode;
	/** Dimmed but still selectable: an option that matches nothing in view. */
	dim?: boolean;
	/** Rich tooltip shown on hover/focus, and on a touch screen by a press held on the cell. Omit for none. */
	tooltip?: ReactNode;
	tooltipSide?: "top" | "right" | "bottom" | "left";
	tooltipDelay?: TooltipDelay;
}

type CommonProps<T> = {
	options: OptionWallItem<T>[];
	/** Cells per row. Pick it from the label lengths: 6 for numbers, 2–3 for words. Omit for one row of
	 *  options at their own widths, wrapping. */
	columns?: number;
	/** Stretch a short last row to the full width (default, right for words); `false` keeps the
	 *  column grid, which numbers and codes want so they line up. */
	fill?: boolean;
	/** Small cells (20px, 11px text) for a matrix of many options. */
	dense?: boolean;
	className?: string;
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
	const { options, columns, className, fill = true, dense = false } = props;
	const isPressed = (value: T): boolean => (props.multi ? props.selected.includes(value) : props.selected === value);
	const r = columns && fill ? options.length % columns || columns : 1;
	const lastRow = fill ? options.length - r : options.length;
	// A dim option is still a control, so its label stays at the muted ink (4.5:1 on the track); the options
	// beside it lift one step to show which are dim.
	const rest = options.some((o) => o.dim) ? "text-fg-secondary hover:text-fg" : "text-fg-muted hover:text-fg-secondary";

	return (
		<div
			className={cn("ta-seg", columns ? "grid" : "flex w-fit max-w-full flex-wrap", className)}
			style={{
				...(columns
					? {
							gridTemplateColumns: `repeat(${columns * r}, minmax(0, 1fr))`,
							// Every cell a 24px target (WCAG 2.5.8): the wall is never narrower than its columns at
							// 24px each plus the track's 2px gaps and 3px padding (controls.css).
							minWidth: `calc(${columns} * var(--control-xs) + ${2 * (columns - 1) + 6}px)`,
						}
					: {}),
				...(dense ? { padding: 2 } : {}),
			}}
		>
			{/* A multi-select wall has no one option for the selection pill to sit under; the hover pill stays. */}
			{props.multi ? <HoverPill /> : <SegIndicator />}
			{options.map((opt, i) => {
				const key = opt.key ?? String(opt.value);
				// A disabled option with a tooltip stays hoverable so the tooltip can say why: it is marked
				// disabled and ignores clicks, instead of taking the attribute, which would mute the pointer.
				const explained = !!opt.disabled && (opt.tooltip != null || !!opt.title);
				const Icon = opt.icon;
				const button = (
					<button
						key={key}
						type="button"
						aria-pressed={isPressed(opt.value)}
						aria-label={opt.ariaLabel}
						disabled={explained ? undefined : opt.disabled}
						aria-disabled={opt.disabled}
						aria-keyshortcuts={opt.shortcut}
						onClick={() => {
							if (!opt.disabled) props.onChange(opt.value);
						}}
						style={columns ? { gridColumn: `span ${i < lastRow ? r : columns}` } : undefined}
						className={cn(
							"ta-tab flex min-w-control-xs items-center justify-center gap-1.5 text-center leading-tight font-medium transition-colors",
							opt.sub != null && "flex-col gap-0",
							dense ? "min-h-5 py-0 text-caption" : "min-h-control-sm py-1 text-small",
							columns ? "px-1.5" : "px-2.5",
							"focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-accent/50",
							isPressed(opt.value) ? "text-fg" : opt.dim ? "text-fg-muted hover:text-fg-secondary" : rest,
							opt.disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
						)}
					>
						{opt.sub != null ? (
							<>
								<span className="flex items-center gap-1.5 text-balance">
									{Icon ? <Icon className="size-3.5 shrink-0" /> : null}
									{opt.label}
									{opt.shortcut ? <Kbd>{opt.shortcut}</Kbd> : null}
								</span>
								<span className="font-mono text-caption leading-tight text-fg-muted tabular-nums">{opt.sub}</span>
							</>
						) : (
							<>
								{Icon ? <Icon className="size-3.5 shrink-0" /> : null}
								{opt.label}
								{opt.shortcut ? <Kbd>{opt.shortcut}</Kbd> : null}
							</>
						)}
					</button>
				);
				return opt.tooltip != null ? (
					// A tap on a cell selects it; a press held on it explains it (a tap that also popped the card
					// covered the options below, and it stayed up until the next tap).
					<Tooltip
						key={key}
						content={opt.tooltip}
						side={opt.tooltipSide ?? "top"}
						delay={opt.tooltipDelay}
						tapToOpen="hold"
					>
						{button}
					</Tooltip>
				) : opt.title ? (
					<Tooltip key={key} label={opt.title} side={opt.tooltipSide ?? "top"} delay={opt.tooltipDelay}>
						{button}
					</Tooltip>
				) : (
					button
				);
			})}
		</div>
	);
}
