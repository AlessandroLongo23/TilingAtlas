"use client";

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
}

const BOX_SIZE: Record<NonNullable<CheckboxBoxProps["size"]>, { box: string; check: string }> = {
	sm: { box: "h-3.5 w-3.5", check: "w-2.5 h-2.5" },
	md: { box: "h-4 w-4", check: "w-3 h-3" },
};

export function CheckboxBox({ id, checked, onCheckedChange, disabled = false, size = "md" }: CheckboxBoxProps) {
	return (
		<div className="relative flex items-center">
			<input
				type="checkbox"
				id={id}
				checked={checked}
				onChange={(e) => onCheckedChange(e.target.checked)}
				disabled={disabled}
				className={cn(
					"peer appearance-none border border-line-strong bg-transparent cursor-pointer",
					"checked:bg-fg checked:border-fg",
					"focus:outline-none focus-visible:ring-1 focus-visible:ring-fg focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
					"disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
					BOX_SIZE[size].box,
				)}
			/>
			<Check
				strokeWidth={3}
				className={cn(
					"absolute inset-0 m-auto text-fg-inverse opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none",
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
}

export function Checkbox({ id, label, checked, onCheckedChange, disabled = false, shortcut }: CheckboxProps) {
	const toggle = () => {
		if (disabled) return;
		onCheckedChange(!checked);
	};

	return (
		<div
			tabIndex={0}
			role="checkbox"
			aria-checked={checked}
			className="flex items-center justify-between gap-3 cursor-pointer"
			onClick={toggle}
			onKeyDown={(e) => {
				if (e.key === " " || e.key === "Enter") {
					e.preventDefault();
					toggle();
				}
			}}
		>
			<div className="flex items-center space-x-3 min-w-0">
				<CheckboxBox id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
				{label ? (
					<label className="text-sm font-medium text-fg-secondary cursor-pointer truncate">{label}</label>
				) : null}
			</div>
			{shortcut ? <Kbd>{shortcut}</Kbd> : null}
		</div>
	);
}
