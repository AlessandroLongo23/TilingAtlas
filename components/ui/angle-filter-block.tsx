"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
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

	useEffect(() => {
		if (angle !== Number(inputValue)) setInputValue(angle);
	}, [angle]); // eslint-disable-line react-hooks/exhaustive-deps

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
				<span className="text-xs uppercase text-fg-muted font-medium tracking-wider">Angle Modulo</span>
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
					className="w-full h-9 rounded-md border border-line bg-surface-overlay/90 px-3 py-2 text-sm text-fg placeholder:text-fg-disabled focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-line-focus/40 focus-visible:border-line-focus transition-all disabled:opacity-40 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
				/>
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-muted pointer-events-none">deg</span>
			</div>
		</div>
	);
}
