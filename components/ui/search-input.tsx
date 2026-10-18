"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Search, X } from "lucide-react";

interface SearchInputProps {
	activeSearch: string;
	onSearchChange: (value: string) => void;
	placeholder?: string;
	debounceMs?: number;
}

export function SearchInput({
	activeSearch,
	onSearchChange,
	placeholder = "Filter by name...",
	debounceMs = 200,
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
			onSearchChange(v.trim().toLowerCase());
		}, debounceMs);
	};

	const clear = () => {
		setLocal("");
		onSearchChange("");
	};

	return (
		<div className="flex flex-col gap-2">
			<span className="ta-label">Search</span>
			<div className="relative">
				<Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
				<input
					type="text"
					value={local}
					onChange={handleInput}
					placeholder={placeholder}
					className="h-9 w-full rounded-md border border-line bg-surface-raised py-2 pr-8 pl-9 text-sm text-fg shadow-sm transition-all placeholder:text-fg-disabled focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none max-md:h-11"
				/>
				{local ? (
					<button
						className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-fg-muted transition-colors hover:bg-surface-overlay/50 hover:text-fg-secondary max-md:right-0 max-md:p-3"
						onClick={clear}
						aria-label="Clear search"
					>
						<X size={14} />
					</button>
				) : null}
			</div>
		</div>
	);
}
