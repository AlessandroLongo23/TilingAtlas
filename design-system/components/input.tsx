"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ComponentProps } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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

// On a phone every field is 44px tall, so each of the two stacked steppers gets half of that.
// The control scale, as Button's: 28, 32 (the default) and 36; a phone takes the 44px floor.
const SIZE_CLASSES: Record<InputSize, string> = {
	sm: "h-control-sm px-2.5 text-small max-md:h-control-touch",
	md: "h-control-md px-3 text-ui max-md:h-control-touch",
	lg: "h-control-lg px-3.5 text-body max-md:h-control-touch",
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
	className,
	...rest
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

	// Pointer events, not mouse events, so press-and-hold repeats under a finger too; a mouse gets the
	// same sequence it always did. A touch that drifts into a scroll ends in pointercancel, which stops.
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

	const incOff = disabled || (max !== undefined && Number(internal) >= max);
	const decOff = disabled || (min !== undefined && Number(internal) <= min);
	const HOT = "cursor-pointer hover:bg-surface-overlay/40 hover:text-fg";

	return (
		<div className={cn("w-full gap-1.5", align === "center" ? "flex flex-col items-center" : "grid", className)}>
			{label ? (
				<label
					htmlFor={id}
					className={cn(
						align === "center" ? "text-heading font-semibold" : "text-ui font-medium",
						"leading-none text-fg-secondary",
					)}
				>
					{label}
				</label>
			) : null}
			<div className="relative w-full">
				<input
					{...rest}
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
						"ta-field flex w-full [appearance:textfield] py-2 text-fg file:border-0 file:bg-transparent file:text-body file:font-medium placeholder:text-fg-muted disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
						SIZE_CLASSES[size],
						align === "center" && "text-center",
					)}
				/>
				{type === "number" ? (
					// The steppers are a pointer's shortcut for the field, which is the control: a full-size spinbutton
					// that takes typing and the arrow keys. As buttons they were two 16px targets inside one control;
					// as drawing they are neither (WCAG 2.5.8, an equivalent control).
					<div
						aria-hidden
						className="absolute inset-y-0 right-0 flex flex-col border-l border-line-strong text-fg-secondary"
					>
						<span
							onPointerDown={incOff ? undefined : startInc}
							onPointerUp={stop}
							onPointerLeave={stop}
							onPointerCancel={stop}
							className={cn(
								"flex w-control-md flex-1 items-center justify-center transition-colors max-md:w-control-touch max-md:touch-manipulation max-md:select-none",
								"rounded-tr-control border-b border-line-strong",
								incOff ? "cursor-not-allowed" : HOT,
							)}
						>
							<ChevronUp className="size-icon-xs" strokeWidth={2} />
						</span>
						<span
							onPointerDown={decOff ? undefined : startDec}
							onPointerUp={stop}
							onPointerLeave={stop}
							onPointerCancel={stop}
							className={cn(
								"flex w-control-md flex-1 items-center justify-center transition-colors max-md:w-control-touch max-md:touch-manipulation max-md:select-none",
								"rounded-br-control",
								decOff ? "cursor-not-allowed" : HOT,
							)}
						>
							<ChevronDown className="size-icon-xs" strokeWidth={2} />
						</span>
					</div>
				) : null}
			</div>
		</div>
	);
}
