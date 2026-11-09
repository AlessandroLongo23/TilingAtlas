"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface SearchInputProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	debounceMs?: number;
	/** Pass the text as typed (trimmed only): for a query whose names keep their case. */
	raw?: boolean;
	/** The label above the box; "Search" by default, none for null. */
	label?: ReactNode;
	/** The box's accessible name when the label is not a string (or there is none). */
	"aria-label"?: string;
	/** `sm`: the 32px box of a dense sidebar. */
	size?: "sm" | "md";
}

export function SearchInput({
	value: activeSearch,
	onChange: onSearchChange,
	placeholder = "Filter by name...",
	debounceMs = 200,
	raw = false,
	label = "Search",
	"aria-label": ariaLabel,
	size = "md",
}: SearchInputProps) {
	const [local, setLocal] = useState(activeSearch);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// A search cleared from outside clears the box too (adjusted during render).
	const [prevActive, setPrevActive] = useState(activeSearch);
	if (prevActive !== activeSearch) {
		setPrevActive(activeSearch);
		if (activeSearch === "") setLocal("");
	}

	const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
		const v = e.target.value;
		setLocal(v);
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			onSearchChange(raw ? v.trim() : v.trim().toLowerCase());
		}, debounceMs);
	};

	const clear = () => {
		setLocal("");
		onSearchChange("");
	};

	return (
		<div className="flex flex-col gap-2">
			{label === null ? null : <span className="ta-label">{label}</span>}
			<div className="relative">
				<Search className="pointer-events-none absolute top-1/2 left-3 size-icon-sm -translate-y-1/2 text-fg-muted" />
				<input
					type="text"
					value={local}
					onChange={handleInput}
					placeholder={placeholder}
					aria-label={typeof label === "string" ? label : (ariaLabel ?? "Search")}
					className={cn(
						"ta-field w-full py-2 pr-8 pl-8 text-fg placeholder:text-fg-muted max-md:h-control-touch",
						size === "sm" ? "h-control-sm text-small" : "h-control-md text-ui",
					)}
				/>
				{local ? (
					<button
						className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-tag p-0.5 text-fg-muted transition-colors hover:bg-surface-overlay/50 hover:text-fg-secondary max-md:right-0 max-md:p-3"
						onClick={clear}
						aria-label="Clear search"
					>
						<X className="size-icon-sm" />
					</button>
				) : null}
			</div>
		</div>
	);
}
