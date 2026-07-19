"use client";

import type { ReactNode } from "react";

interface SliderProps {
	id?: string;
	label?: string;
	/** Optional discoverability hint rendered beside the label (e.g. the gesture that also drives this value). */
	hint?: ReactNode;
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	disabled?: boolean;
	unit?: string;
}

export function Slider({
	id,
	label,
	hint,
	value,
	onChange,
	min = 1,
	max = 60,
	step = 1,
	disabled = false,
	unit = "",
}: SliderProps) {
	return (
		<div className="grid w-full gap-2">
			{label ? (
				<div className="flex flex-row justify-between items-center gap-2">
					<div className="flex items-center gap-1.5 min-w-0">
						<label htmlFor={id} className="text-sm font-medium text-fg-secondary">
							{label}
						</label>
						{hint}
					</div>
					<span className="text-xs text-accent font-medium whitespace-nowrap">
						{value} {unit}
					</span>
				</div>
			) : null}
			<input
				id={id}
				type="range"
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				className="w-full h-2 rounded-full appearance-none cursor-pointer bg-surface-overlay/70 accent-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-line-focus/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-raised disabled:cursor-not-allowed disabled:opacity-50 transition-all"
			/>
		</div>
	);
}
