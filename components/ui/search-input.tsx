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
			<span className="text-xs uppercase text-zinc-400 font-medium tracking-wider">Search</span>
			<div className="relative">
				<Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
				<input
					type="text"
					value={local}
					onChange={handleInput}
					placeholder={placeholder}
					className="w-full h-9 rounded-md border border-zinc-700/50 bg-zinc-800/90 pl-9 pr-8 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-500/40 focus-visible:border-green-500/70 transition-all"
				/>
				{local ? (
					<button
						className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors"
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
