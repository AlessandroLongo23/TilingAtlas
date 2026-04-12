"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
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

	useEffect(() => {
		if (activeSearch === "") setLocal("");
	}, [activeSearch]);

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
			<span className="text-xs uppercase text-fg-muted font-medium tracking-wider">Search</span>
			<div className="relative">
				<Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
				<input
					type="text"
					value={local}
					onChange={handleInput}
					placeholder={placeholder}
					className="w-full h-9 rounded-md border border-line bg-surface-overlay/90 pl-9 pr-8 py-2 text-sm text-fg placeholder:text-fg-disabled focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-line-focus/40 focus-visible:border-line-focus transition-all"
				/>
				{local ? (
					<button
						className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-fg-muted hover:text-fg-secondary hover:bg-surface-overlay/50 transition-colors cursor-pointer"
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
