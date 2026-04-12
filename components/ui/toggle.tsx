"use client";

import { sounds } from "@/lib/utils/sounds";
import { cn } from "@/lib/utils/cn";

interface ToggleProps {
	id?: string;
	label?: string;
	leftValue: string;
	rightValue: string;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	align?: "left" | "center";
	padding?: string;
}

export function Toggle({
	id,
	label,
	leftValue,
	rightValue,
	value,
	onChange,
	disabled = false,
	align = "left",
	padding = "py-2 px-4",
}: ToggleProps) {
	const click = (v: string, sfx: "on" | "off") => {
		if (value !== v && !disabled) {
			onChange(v);
			if (sfx === "on") sounds.toggleOn();
			else sounds.toggleOff();
		}
	};

	return (
		<div className={cn("w-full gap-1.5", align === "center" ? "flex flex-col items-center" : "grid")}>
			{label ? (
				<label htmlFor={id} className={cn(align === "center" ? "text-lg font-bold" : "text-sm font-medium", "leading-none text-white/80")}>
					{label}
				</label>
			) : null}
			<div className="relative inline-flex rounded-md shadow-sm">
				<button
					type="button"
					aria-label={leftValue}
					role="radio"
					aria-checked={value === leftValue}
					disabled={disabled}
					onClick={() => click(leftValue, "on")}
					className={cn(
						"relative text-sm font-medium transition-all duration-200 ease-in-out rounded-l-md border border-r-0 focus:z-10 focus:outline-none focus:ring-1 focus:ring-green-500/40",
						padding,
						value === leftValue
							? "bg-green-500/50 text-white hover:bg-green-600/50 border-green-500/80"
							: "bg-zinc-800/40 text-zinc-200 hover:bg-zinc-700/60 border-zinc-700/50",
						disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
					)}
				>
					{leftValue.charAt(0).toUpperCase() + leftValue.slice(1)}
				</button>
				<button
					type="button"
					aria-label={rightValue}
					role="radio"
					aria-checked={value === rightValue}
					disabled={disabled}
					onClick={() => click(rightValue, "off")}
					className={cn(
						"relative text-sm font-medium transition-all duration-200 ease-in-out rounded-r-md border focus:z-10 focus:outline-none focus:ring-1 focus:ring-green-500/40",
						padding,
						value === rightValue
							? "bg-green-500/50 text-white hover:bg-green-600/50 border-green-500/80"
							: "bg-zinc-800/40 text-zinc-200 hover:bg-zinc-700/60 border-zinc-700/50",
						disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
					)}
				>
					{rightValue.charAt(0).toUpperCase() + rightValue.slice(1)}
				</button>
			</div>
		</div>
	);
}
