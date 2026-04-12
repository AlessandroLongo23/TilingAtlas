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
					className="peer h-4 w-4 appearance-none rounded border border-zinc-600/60 bg-zinc-800/50 checked:bg-green-500/90 checked:border-green-500/80 focus:outline-none focus:ring-1 focus:ring-green-500/40 focus:ring-offset-1 focus:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
				/>
				<Check className="absolute top-0 left-0 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
			</div>
			{label ? (
				<label className="text-sm font-medium text-white/80 cursor-pointer">{label}</label>
			) : null}
		</div>
	);
}
