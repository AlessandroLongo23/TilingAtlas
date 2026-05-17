"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

type InputSize = "sm" | "md" | "lg";

interface InputProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "min" | "max" | "step" | "size"> {
	id?: string;
	label?: string | null;
	value: string | number;
	onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
	placeholder?: string;
	type?: "text" | "number";
	min?: number;
	max?: number;
	step?: number;
	disabled?: boolean;
	align?: "left" | "center";
	size?: InputSize;
}

const SIZE_CLASSES: Record<InputSize, string> = {
	sm: "h-8 px-2.5 text-xs",
	md: "h-9 px-3 text-sm",
	lg: "h-11 px-4 text-base",
};

const STEPPER_HEIGHT: Record<InputSize, string> = {
	sm: "h-[14px]",
	md: "h-[18px]",
	lg: "h-[22px]",
};

const INITIAL_DELAY = 300;
const REPEAT_INTERVAL = 80;

export function Input({
	id,
	label = null,
	value,
	onChange,
	placeholder = "",
	type = "text",
	min = 0,
	max = 100,
	step = 1,
	disabled = false,
	align,
	size = "md",
}: InputProps) {
	const [internal, setInternal] = useState(value);
	const incTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const decTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		setInternal(value);
	}, [value]);

	const emit = (next: number) => {
		setInternal(next);
		onChange?.({ target: { value: String(next) } } as unknown as ChangeEvent<HTMLInputElement>);
	};

	const increment = () => {
		if (disabled || type !== "number") return;
		const next = Number(internal) + (step || 1);
		if (max !== undefined && next > max) return;
		emit(next);
	};

	const decrement = () => {
		if (disabled || type !== "number") return;
		const next = Number(internal) - (step || 1);
		if (min !== undefined && next < min) return;
		emit(next);
	};

	const startInc = () => {
		increment();
		incTimer.current = setTimeout(() => {
			incTimer.current = setInterval(increment, REPEAT_INTERVAL);
		}, INITIAL_DELAY);
	};

	const startDec = () => {
		decrement();
		decTimer.current = setTimeout(() => {
			decTimer.current = setInterval(decrement, REPEAT_INTERVAL);
		}, INITIAL_DELAY);
	};

	const stop = () => {
		if (incTimer.current) {
			clearTimeout(incTimer.current);
			clearInterval(incTimer.current as unknown as NodeJS.Timeout);
			incTimer.current = null;
		}
		if (decTimer.current) {
			clearTimeout(decTimer.current);
			clearInterval(decTimer.current as unknown as NodeJS.Timeout);
			decTimer.current = null;
		}
	};

	const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
		if (type === "number") {
			setInternal(Number(e.target.value));
		} else {
			setInternal(e.target.value);
		}
		onChange?.(e);
	};

	return (
		<div className={cn("w-full gap-1.5", align === "center" ? "flex flex-col items-center" : "grid")}>
			{label ? (
				<label
					htmlFor={id}
					className={cn(
						align === "center" ? "text-lg font-bold" : "text-sm font-medium",
						"leading-none text-fg-secondary",
					)}
				>
					{label}
				</label>
			) : null}
			<div className="relative w-full">
				<input
					id={id}
					type={type}
					value={internal}
					onChange={handleInput}
					placeholder={placeholder}
					min={min}
					max={max}
					step={step}
					disabled={disabled}
					className={cn(
						"flex w-full rounded-control border border-line-strong bg-surface-overlay/90 py-2 text-fg ring-offset-surface-raised file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-line-focus/40 focus-visible:border-line-focus focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
						SIZE_CLASSES[size],
						align === "center" && "text-center",
					)}
				/>
				{type === "number" ? (
					<div className="absolute inset-y-0 right-0 flex flex-col border-l border-line-strong text-fg-secondary">
						<button
							type="button"
							onMouseDown={startInc}
							onMouseUp={stop}
							onMouseLeave={stop}
							className={cn("flex items-center justify-center w-8 cursor-pointer disabled:cursor-not-allowed hover:bg-surface-overlay/40 hover:text-fg border-b border-line-strong rounded-tr-md transition-colors", STEPPER_HEIGHT[size])}
							disabled={disabled || (max !== undefined && Number(internal) >= max)}
							aria-label="Increment"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
						</button>
						<button
							type="button"
							onMouseDown={startDec}
							onMouseUp={stop}
							onMouseLeave={stop}
							className={cn("flex items-center justify-center w-8 cursor-pointer disabled:cursor-not-allowed hover:bg-surface-overlay/40 hover:text-fg rounded-br-md transition-colors", STEPPER_HEIGHT[size])}
							disabled={disabled || (min !== undefined && Number(internal) <= min)}
							aria-label="Decrement"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
						</button>
					</div>
				) : null}
			</div>
		</div>
	);
}
