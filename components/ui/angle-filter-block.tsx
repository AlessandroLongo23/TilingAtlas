"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Checkbox } from "./checkbox";

interface AngleFilterBlockProps {
	enabled: boolean;
	onEnabledChange: (enabled: boolean) => void;
	angle: number;
	onAngleChange: (angle: number) => void;
	debounceMs?: number;
}

export function AngleFilterBlock({
	enabled,
	onEnabledChange,
	angle,
	onAngleChange,
	debounceMs = 300,
}: AngleFilterBlockProps) {
	const [inputValue, setInputValue] = useState<number | string>(angle);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Follow an angle changed from outside (adjusted during render).
	const [prevAngle, setPrevAngle] = useState(angle);
	if (prevAngle !== angle) {
		setPrevAngle(angle);
		if (angle !== Number(inputValue)) setInputValue(angle);
	}

	const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
		const v = e.target.value;
		setInputValue(v);
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			const n = Number(v);
			if (!Number.isNaN(n)) onAngleChange(n);
		}, debounceMs);
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<span className="ta-label">Angle Modulo</span>
			</div>
			<Checkbox id="angleEnabled" label="Enable angle filter" checked={enabled} onCheckedChange={onEnabledChange} />
			<div className="relative">
				<input
					type="number"
					id="angleFilter"
					value={inputValue}
					onChange={handleInput}
					disabled={!enabled}
					min={1}
					max={180}
					className="h-9 w-full [appearance:textfield] rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-fg shadow-sm transition-all placeholder:text-fg-disabled focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 max-md:h-11 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
				/>
				<span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-fg-muted">deg</span>
			</div>
		</div>
	);
}
