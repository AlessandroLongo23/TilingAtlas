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

export function MultiSelect({
	label = null,
	options,
	selected,
	onSelectedChange,
}: MultiSelectProps) {
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
						className="text-xs text-fg-muted hover:text-fg transition-colors px-1.5 py-0.5 rounded hover:bg-surface-overlay cursor-pointer"
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
							"h-7 rounded-control px-2.5 text-xs font-medium transition-colors border select-none cursor-pointer",
							selected.includes(option.id)
								? "bg-surface-raised text-fg border-line-strong shadow-sm"
								: "bg-transparent text-fg-muted border-line hover:bg-surface-overlay hover:text-fg",
						)}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	);
}
