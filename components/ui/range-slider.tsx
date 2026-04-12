"use client";

import { useEffect, useRef, type ChangeEvent, type MouseEvent } from "react";
import { sounds } from "@/lib/utils/sounds";

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

	const lastLow = useRef(min);
	const lastHigh = useRef(max);

	useEffect(() => {
		if (isRange) {
			const [a, b] = value as RangeValue;
			lastLow.current = a;
			lastHigh.current = b;
		} else {
			const v = value as SingleValue;
			lastLow.current = v;
			lastHigh.current = v;
		}
	}, [value, isRange]);

	const handleSingleMouseMove = (e: MouseEvent<HTMLInputElement>) => {
		if (e.buttons === 1) {
			const next = Number((e.target as HTMLInputElement).value);
			if (next !== lastLow.current) {
				sounds.slider(0.02);
				lastLow.current = next;
			}
			onChange(next);
		}
	};

	const handleCollapsedInput = (e: ChangeEvent<HTMLInputElement>) => {
		const v = Number(e.target.value);
		const current = rangeMin;
		if (v > current) onChange([current, v]);
		else if (v < current) onChange([v, current]);
		else onChange([v, v]);
	};

	const handleLowInput = (e: ChangeEvent<HTMLInputElement>) => {
		const v = Number(e.target.value);
		const high = (value as RangeValue)[1];
		onChange([Math.min(v, high), high]);
	};

	const handleHighInput = (e: ChangeEvent<HTMLInputElement>) => {
		const v = Number(e.target.value);
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
					<span className="text-[10px] text-accent font-medium tabular-nums">{displayValue}</span>
				</div>
			) : null}

			{isRange && isCollapsed ? (
				<input
					id={id}
					type="range"
					value={rangeMin}
					onChange={handleCollapsedInput}
					min={min}
					max={max}
					step={step}
					disabled={disabled}
					className="range-track w-full h-1.5 rounded-full appearance-none cursor-pointer bg-surface-overlay/60 accent-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
					aria-label="Exact value"
				/>
			) : isRange ? (
				<div className="relative w-full h-5 flex items-center">
					<div className="absolute h-1.5 rounded-full bg-surface-overlay/60 w-full pointer-events-none" aria-hidden="true" />
					<div
						className="absolute h-1.5 rounded-full bg-accent-subtle pointer-events-none transition-all"
						style={{ left: `${lowPercent}%`, width: `${highPercent - lowPercent}%` }}
						aria-hidden="true"
					/>
					<input
						type="range"
						className="range-thumb absolute w-full h-1.5 rounded-full appearance-none cursor-pointer bg-transparent accent-transparent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						min={min}
						max={max}
						step={step}
						value={rangeMin}
						onChange={handleLowInput}
						disabled={disabled}
						aria-label="Range minimum"
					/>
					<input
						type="range"
						className="range-thumb absolute w-full h-1.5 rounded-full appearance-none cursor-pointer bg-transparent accent-transparent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						min={min}
						max={max}
						step={step}
						value={rangeMax}
						onChange={handleHighInput}
						disabled={disabled}
						aria-label="Range maximum"
					/>
				</div>
			) : (
				<input
					id={id}
					type="range"
					value={value as SingleValue}
					onChange={(e) => onChange(Number(e.target.value))}
					onMouseMove={handleSingleMouseMove}
					min={min}
					max={max}
					step={step}
					disabled={disabled}
					className="range-track w-full h-1.5 rounded-full appearance-none cursor-pointer bg-surface-overlay/60 accent-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
				/>
			)}
		</div>
	);
}
