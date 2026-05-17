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
					<span className="text-xs uppercase text-fg-muted font-medium tracking-wider">{label}</span>
					<button
						className="text-[10px] text-fg-muted hover:text-fg-secondary transition-colors px-1.5 py-0.5 rounded hover:bg-surface-overlay/40 cursor-pointer"
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
							"px-3 py-1 text-xs rounded-full transition-all border select-none cursor-pointer",
							selected.includes(option.id)
								? "bg-accent-subtle text-accent border-line-focus hover:bg-accent-subtle"
								: "bg-surface-overlay/80 text-fg-muted border-line hover:bg-surface-overlay/50 hover:text-fg-secondary",
						)}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	);
}
