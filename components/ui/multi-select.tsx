"use client";

import { cn } from "@/lib/utils/cn";

export interface MultiSelectOption {
	id: string;
	label: string;
}

interface MultiSelectProps {
	label?: string | null;
	options: MultiSelectOption[];
	selected: string[];
	onSelectedChange: (selected: string[]) => void;
}

export function MultiSelect({ label = null, options, selected, onSelectedChange }: MultiSelectProps) {
	const toggle = (id: string) => {
		if (selected.includes(id)) {
			onSelectedChange(selected.filter((s) => s !== id));
		} else {
			onSelectedChange([...selected, id]);
		}
	};

	const selectAll = () => onSelectedChange(options.map((o) => o.id));
	const deselectAll = () => onSelectedChange([]);

	const allSelected = selected.length === options.length;

	return (
		<div className="flex flex-col gap-2">
			{label ? (
				<div className="flex items-center justify-between">
					<span className="ta-label">{label}</span>
					<button
						className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-fg-muted transition-colors hover:bg-surface-overlay hover:text-fg max-md:min-h-11 max-md:px-3 max-md:text-[13px]"
						onClick={() => (allSelected ? deselectAll() : selectAll())}
					>
						{allSelected ? "Clear" : "All"}
					</button>
				</div>
			) : null}
			<div className="flex flex-wrap gap-1.5">
				{options.map((option) => (
					<button
						key={option.id}
						onClick={() => toggle(option.id)}
						className={cn(
							"h-7 cursor-pointer rounded-control border px-2.5 text-xs font-medium transition-colors select-none max-md:min-h-11 max-md:px-3.5 max-md:text-[13px]",
							selected.includes(option.id)
								? "border-line-strong bg-surface-raised text-fg shadow-sm"
								: "border-line bg-transparent text-fg-muted hover:bg-surface-overlay hover:text-fg",
						)}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	);
}
