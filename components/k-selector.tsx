"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import { RangeInput } from "@/components/ui/range-input";

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
	return mode === "upto" ? K_OPTIONS.slice(0, uptoK) : [...specificKValues].sort((a, b) => a - b);
}

export function KSelector({
	mode,
	onModeChange,
	uptoK,
	onUptoKChange,
	specificKValues,
	onSpecificKValuesChange,
}: KSelectorProps) {
	const kValues = useMemo(() => kValuesFor(mode, uptoK, specificKValues), [mode, uptoK, specificKValues]);

	const toggleSpecificK = (k: number) => {
		if (specificKValues.includes(k)) {
			onSpecificKValuesChange(specificKValues.filter((v) => v !== k));
		} else {
			onSpecificKValuesChange([...specificKValues, k]);
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex w-fit overflow-hidden rounded-lg border border-line">
				{(["upto", "specific"] as const).map((tab) => (
					<button
						key={tab}
						onClick={() => onModeChange(tab)}
						className={cn(
							"border-r border-line px-3 py-1.5 text-xs font-medium transition-colors last:border-r-0",
							mode === tab
								? "bg-surface-overlay text-fg"
								: "text-fg-muted hover:bg-surface-overlay hover:text-fg-secondary",
						)}
					>
						{tab === "upto" ? "Up to k" : "Specific"}
					</button>
				))}
			</div>

			{mode === "upto" ? (
				<div className="flex items-center gap-3">
					<RangeInput
						min={1}
						max={K_MAX}
						value={uptoK}
						onChange={onUptoKChange}
						className="w-32"
						aria-label="maximum k"
					/>
					<span className="text-sm text-fg-secondary">
						k = 1 … <span className="font-semibold text-fg">{uptoK}</span>
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
									"h-8 w-8 rounded-md border text-sm font-medium transition-colors",
									selected
										? "border-line-focus bg-surface-overlay text-fg"
										: "border-line bg-surface-overlay text-fg-muted hover:border-line-strong",
								)}
							>
								{k}
							</button>
						);
					})}
				</div>
			)}

			<p className="text-xs text-fg-muted">
				Searching k ∈ {"{"}
				{kValues.join(", ")}
				{"}"}
			</p>
		</div>
	);
}
