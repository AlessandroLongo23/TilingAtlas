"use client";

import { RangeInput } from "./range-input";

type SingleValue = number;
type RangeValue = [number, number];

interface RangeSliderProps {
	id?: string;
	label?: string;
	value: RangeValue | SingleValue;
	onChange: (value: RangeValue | SingleValue) => void;
	min?: number;
	max?: number;
	step?: number;
	disabled?: boolean;
	unit?: string;
}

// Squared w/b design system: single-value branches are a RangeInput (2px square-ended track, 12px
// square fg thumb, ticks for short value sets); the dual-thumb branch draws its own flat track and
// selected span and stacks two .ta-range-overlay inputs on top — invisible except for their thumbs.
export function RangeSlider({
	id,
	label,
	value,
	onChange,
	min = 0,
	max = 100,
	step = 1,
	disabled = false,
	unit = "",
}: RangeSliderProps) {
	const isRange = Array.isArray(value);
	const rangeMin = isRange ? (value as RangeValue)[0] : min;
	const rangeMax = isRange ? (value as RangeValue)[1] : max;
	const isCollapsed = isRange && rangeMin === rangeMax;

	const handleCollapsedInput = (v: number) => {
		const current = rangeMin;
		if (v > current) onChange([current, v]);
		else if (v < current) onChange([v, current]);
		else onChange([v, v]);
	};

	const handleLowInput = (v: number) => {
		const high = (value as RangeValue)[1];
		onChange([Math.min(v, high), high]);
	};

	const handleHighInput = (v: number) => {
		const low = (value as RangeValue)[0];
		onChange([low, Math.max(v, low)]);
	};

	const displayValue = isRange
		? rangeMin === rangeMax
			? `${rangeMin}${unit ? " " + unit : ""}`
			: `${(value as RangeValue)[0]} – ${(value as RangeValue)[1]}${unit ? " " + unit : ""}`
		: `${value}${unit ? " " + unit : ""}`;

	const lowPercent = ((rangeMin - min) / (max - min)) * 100;
	const highPercent = ((rangeMax - min) / (max - min)) * 100;

	return (
		<div className="grid w-full gap-1.5">
			{label ? (
				<div className="flex flex-row justify-between items-center">
					<label htmlFor={id} className="text-xs font-medium text-fg-muted">{label}</label>
					<span className="text-[10px] text-fg font-medium tabular-nums">{displayValue}</span>
				</div>
			) : null}

			{isRange && isCollapsed ? (
				<RangeInput
					id={id}
					value={rangeMin}
					onChange={handleCollapsedInput}
					min={min}
					max={max}
					step={step}
					disabled={disabled}
					aria-label="Exact value"
				/>
			) : isRange ? (
				<div className="relative w-full h-5 flex items-center">
					<div className="absolute h-[2px] bg-line w-full pointer-events-none" aria-hidden="true" />
					<div
						className="absolute h-[2px] bg-fg pointer-events-none"
						style={{ left: `${lowPercent}%`, width: `${highPercent - lowPercent}%` }}
						aria-hidden="true"
					/>
					<input
						type="range"
						className="ta-range ta-range-overlay absolute"
						min={min}
						max={max}
						step={step}
						value={rangeMin}
						onChange={(e) => handleLowInput(Number(e.target.value))}
						disabled={disabled}
						aria-label="Range minimum"
					/>
					<input
						type="range"
						className="ta-range ta-range-overlay absolute"
						min={min}
						max={max}
						step={step}
						value={rangeMax}
						onChange={(e) => handleHighInput(Number(e.target.value))}
						disabled={disabled}
						aria-label="Range maximum"
					/>
				</div>
			) : (
				<RangeInput
					id={id}
					value={value as SingleValue}
					onChange={onChange}
					min={min}
					max={max}
					step={step}
					disabled={disabled}
				/>
			)}
		</div>
	);
}
