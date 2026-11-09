"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Kbd } from "./kbd";

// Squared w/b design system: the box is a sharp rectangle; checked is full inversion — solid fg
// fill with the check drawn in the surface colour. CheckboxBox is the bare box for inline use
// (e.g. the polygon picker's category headers); Checkbox is the labelled row primitive.

interface CheckboxBoxProps {
	id?: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	disabled?: boolean;
	size?: "sm" | "md";
	/** Drawing only: the row around it is the control (Checkbox), so the box is a plain element with no focus,
	 *  no name and no presses of its own. Not an input, even an unfocusable one: a control inside a control
	 *  is one a screen reader cannot reach. */
	decorative?: boolean;
}

const BOX_SIZE: Record<NonNullable<CheckboxBoxProps["size"]>, { box: string; check: string }> = {
	sm: { box: "h-3.5 w-3.5", check: "w-2.5 h-2.5" },
	md: { box: "h-4 w-4", check: "w-3 h-3" },
};

export function CheckboxBox({
	id,
	checked,
	onCheckedChange,
	disabled = false,
	size = "md",
	decorative = false,
}: CheckboxBoxProps) {
	const box = cn(
		"peer rounded-tag border border-line-strong bg-surface-raised shadow-raised transition-colors",
		"checked:border-accent checked:bg-accent data-checked:border-accent data-checked:bg-accent",
		BOX_SIZE[size].box,
	);
	return (
		<div className="relative flex items-center">
			{decorative ? (
				<span
					aria-hidden
					data-checked={checked || undefined}
					className={cn(box, "pointer-events-none", disabled && "opacity-50")}
				/>
			) : (
				<input
					type="checkbox"
					id={id}
					checked={checked}
					onChange={(e) => onCheckedChange(e.target.checked)}
					disabled={disabled}
					className={cn(
						box,
						"cursor-pointer appearance-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
						"disabled:cursor-not-allowed disabled:opacity-50",
					)}
				/>
			)}
			<Check
				strokeWidth={3}
				className={cn(
					// The tick springs up from half size as the box fills, so checking reads as a mark being made.
					"pointer-events-none absolute inset-0 m-auto scale-50 text-accent-contrast opacity-0",
					"peer-checked:scale-100 peer-checked:opacity-100 peer-data-checked:scale-100 peer-data-checked:opacity-100",
					"transition-[opacity,scale] motion-glide motion-reduce:transition-none",
					BOX_SIZE[size].check,
				)}
			/>
		</div>
	);
}

interface CheckboxProps {
	id?: string;
	label?: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	disabled?: boolean;
	/** Keyboard-shortcut key shown as a keycap badge at the right of the row. */
	shortcut?: string;
	/** Optional node beside the label — an info dot carrying the control's description, say. */
	hint?: ReactNode;
}

export function Checkbox({ id, label, checked, onCheckedChange, disabled = false, shortcut, hint }: CheckboxProps) {
	const toggle = () => {
		if (disabled) return;
		onCheckedChange(!checked);
	};

	return (
		// The checkbox is the box and its label; the hint beside it is a control of its own, so it sits next to
		// the checkbox and not inside it (a control inside a control is unreachable to a screen reader).
		<div className="flex items-center justify-between gap-3 max-md:min-h-control-touch">
			<div className="flex min-w-0 items-center gap-1.5">
				<div
					// ⚑ `disabled` used to reach only the input: the row kept its pointer cursor, its full contrast and
					// its tab stop, so a disabled control looked and felt live and only refused on click. It now dims
					// and drops out of the tab order, the way Button already does (2026-08-21).
					tabIndex={disabled ? -1 : 0}
					role="checkbox"
					aria-checked={checked}
					aria-disabled={disabled}
					className={cn(
						// At least 24px tall (WCAG 2.5.8); on a phone the row is 44px and the checkbox fills it.
						"flex min-h-6 min-w-0 items-center gap-3 rounded-control max-md:self-stretch",
						"focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
						disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
					)}
					onClick={toggle}
					onKeyDown={(e) => {
						if (e.key === " " || e.key === "Enter") {
							e.preventDefault();
							toggle();
						}
					}}
				>
					<CheckboxBox id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} decorative />
					{label ? <span className="truncate text-ui text-fg">{label}</span> : null}
				</div>
				{hint}
			</div>
			{/* A row without a key still reserves the column, so the keycaps down a list stay aligned. A phone
			    shows no keycaps, so it reserves nothing. */}
			{shortcut ? <Kbd>{shortcut}</Kbd> : <span aria-hidden className="w-[18px] shrink-0 max-md:hidden" />}
		</div>
	);
}
