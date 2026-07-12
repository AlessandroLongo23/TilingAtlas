"use client";

import { Check } from "lucide-react";
import { Kbd } from "./kbd";

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
				<div className="relative flex items-center">
					<input
						type="checkbox"
						id={id}
						checked={checked}
						onChange={(e) => onCheckedChange(e.target.checked)}
						disabled={disabled}
						className="peer h-4 w-4 appearance-none rounded border border-line-strong bg-surface-overlay/50 checked:bg-accent-subtle checked:border-line-focus focus:outline-none focus:ring-1 focus:ring-line-focus/40 focus:ring-offset-1 focus:ring-offset-surface-raised disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
					/>
					<Check className="absolute top-0 left-0 w-4 h-4 text-fg opacity-0 peer-checked:opacity-100 transition-opacity" />
				</div>
				{label ? (
					<label className="text-sm font-medium text-fg-secondary cursor-pointer truncate">{label}</label>
				) : null}
			</div>
			{shortcut ? <Kbd>{shortcut}</Kbd> : null}
		</div>
	);
}
