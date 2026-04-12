"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";

export type KMode = "upto" | "specific";

interface KSelectorProps {
	mode: KMode;
	onModeChange: (mode: KMode) => void;
	uptoK: number;
	onUptoKChange: (k: number) => void;
	specificKValues: number[];
	onSpecificKValuesChange: (values: number[]) => void;
}

const K_MAX = 6;
const K_OPTIONS = Array.from({ length: K_MAX }, (_, i) => i + 1);

/** Derived kValues for the current mode — callers can reuse this helper. */
export function kValuesFor(mode: KMode, uptoK: number, specificKValues: number[]): number[] {
	return mode === "upto"
		? K_OPTIONS.slice(0, uptoK)
		: [...specificKValues].sort((a, b) => a - b);
}

export function KSelector({
	mode,
	onModeChange,
	uptoK,
	onUptoKChange,
	specificKValues,
	onSpecificKValuesChange,
}: KSelectorProps) {
	const kValues = useMemo(
		() => kValuesFor(mode, uptoK, specificKValues),
		[mode, uptoK, specificKValues],
	);

	const toggleSpecificK = (k: number) => {
		if (specificKValues.includes(k)) {
			onSpecificKValuesChange(specificKValues.filter((v) => v !== k));
		} else {
			onSpecificKValuesChange([...specificKValues, k]);
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex rounded-lg overflow-hidden border border-zinc-700/50 w-fit">
				{(["upto", "specific"] as const).map((tab) => (
					<button
						key={tab}
						onClick={() => onModeChange(tab)}
						className={cn(
							"px-3 py-1.5 text-xs font-medium transition-colors border-r border-zinc-700/50 last:border-r-0",
							mode === tab
								? "bg-green-500/15 text-green-400"
								: "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800",
						)}
					>
						{tab === "upto" ? "Up to k" : "Specific"}
					</button>
				))}
			</div>

			{mode === "upto" ? (
				<div className="flex items-center gap-3">
					<input
						type="range"
						min={1}
						max={K_MAX}
						value={uptoK}
						onChange={(e) => onUptoKChange(Number(e.target.value))}
						className="w-32 accent-green-400"
					/>
					<span className="text-sm text-zinc-300">
						k = 1 … <span className="text-green-400 font-semibold">{uptoK}</span>
					</span>
				</div>
			) : (
				<div className="flex gap-1.5">
					{K_OPTIONS.map((k) => {
						const selected = specificKValues.includes(k);
						return (
							<button
								key={k}
								onClick={() => toggleSpecificK(k)}
								className={cn(
									"w-8 h-8 rounded-md text-sm font-medium transition-colors border",
									selected
										? "bg-green-500/20 text-green-400 border-green-500/40"
										: "bg-zinc-800 text-zinc-400 border-zinc-700/50 hover:border-zinc-600",
								)}
							>
								{k}
							</button>
						);
					})}
				</div>
			)}

			<p className="text-xs text-zinc-500">
				Searching k ∈ {"{"}
				{kValues.join(", ")}
				{"}"}
			</p>
		</div>
	);
}
