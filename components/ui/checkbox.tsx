"use client";

import { Check } from "lucide-react";
import { sounds } from "@/lib/utils/sounds";

interface CheckboxProps {
	id?: string;
	label?: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	disabled?: boolean;
}

export function Checkbox({ id, label, checked, onCheckedChange, disabled = false }: CheckboxProps) {
	const toggle = () => {
		if (disabled) return;
		const next = !checked;
		onCheckedChange(next);
		if (next) sounds.toggleOn();
		else sounds.toggleOff();
	};

	return (
		<div
			tabIndex={0}
			role="checkbox"
			aria-checked={checked}
			className="flex items-center space-x-3 cursor-pointer"
			onClick={toggle}
			onKeyDown={(e) => {
				if (e.key === " " || e.key === "Enter") {
					e.preventDefault();
					toggle();
				}
			}}
		>
			<div className="relative flex items-center">
				<input
					type="checkbox"
					id={id}
					checked={checked}
					onChange={(e) => {
						onCheckedChange(e.target.checked);
						if (e.target.checked) sounds.toggleOn();
						else sounds.toggleOff();
					}}
					disabled={disabled}
					className="peer h-4 w-4 appearance-none rounded border border-line-strong bg-surface-overlay/50 checked:bg-accent-subtle checked:border-line-focus focus:outline-none focus:ring-1 focus:ring-line-focus/40 focus:ring-offset-1 focus:ring-offset-surface-raised disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
				/>
				<Check className="absolute top-0 left-0 w-4 h-4 text-fg opacity-0 peer-checked:opacity-100 transition-opacity" />
			</div>
			{label ? (
				<label className="text-sm font-medium text-fg-secondary cursor-pointer">{label}</label>
			) : null}
		</div>
	);
}
