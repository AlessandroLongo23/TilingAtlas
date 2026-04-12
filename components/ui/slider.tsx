"use client";

import { useRef, type MouseEvent } from "react";
import { sounds } from "@/lib/utils/sounds";

interface SliderProps {
	id?: string;
	label?: string;
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
	value,
	onChange,
	min = 1,
	max = 60,
	step = 1,
	disabled = false,
	unit = "",
}: SliderProps) {
	const last = useRef(value);

	const handleMouseMove = (e: MouseEvent<HTMLInputElement>) => {
		if (e.buttons === 1) {
			const next = Number((e.target as HTMLInputElement).value);
			if (next !== last.current) {
				sounds.slider(0.02);
				last.current = next;
			}
			onChange(next);
		}
	};

	return (
		<div className="grid w-full gap-2">
			{label ? (
				<div className="flex flex-row justify-between items-center">
					<label htmlFor={id} className="text-sm font-medium text-white/80">
						{label}
					</label>
					<span className="text-xs text-green-400/90 font-medium">
						{value} {unit}
					</span>
				</div>
			) : null}
			<input
				id={id}
				type="range"
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				onMouseMove={handleMouseMove}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				className="w-full h-2 rounded-full appearance-none cursor-pointer bg-zinc-700/70 accent-green-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-green-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
			/>
		</div>
	);
}
