"use client";

import type { ReactNode } from "react";

import { RangeInput } from "./range-input";

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
	/** Readout override, for values that aren't just a number and a unit (0 reading as "off", say). */
	format?: (value: number) => ReactNode;
}

// Squared w/b design system: label + value readout above a RangeInput (2px square-ended track,
// 12px square fg thumb, ticks when the value set is short enough — see components/ui/range-input).
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
	format,
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
					<span className="text-xs text-fg font-medium tabular-nums whitespace-nowrap">
						{format ? format(value) : `${value} ${unit}`}
					</span>
				</div>
			) : null}
			<RangeInput
				id={id}
				value={value}
				onChange={onChange}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
			/>
		</div>
	);
}
