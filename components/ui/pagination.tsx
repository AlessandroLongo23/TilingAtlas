"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useIsPhone } from "@/lib/hooks/useIsPhone";

interface PaginationProps {
	totalItems: number;
	pageSize?: number;
	currentPage: number;
	onPageChange: (page: number) => void;
	/** Show the "1–25 of N" range at the left. Off where the page already states its count. */
	showRange?: boolean;
}

export function Pagination({
	totalItems,
	pageSize = 24,
	currentPage,
	onPageChange,
	showRange = true,
}: PaginationProps) {
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

	useEffect(() => {
		if (currentPage > totalPages) onPageChange(totalPages);
		else if (currentPage < 1) onPageChange(1);
	}, [currentPage, totalPages, onPageChange]);

	const goto = (page: number) => {
		onPageChange(Math.max(1, Math.min(totalPages, page)));
	};

	// Seven slots, or five on a phone: first, last, the current page with a neighbour each side (none on
	// a phone), and gaps. Five 40px cells, two gaps and the arrows fit a 360px screen.
	const maxVisible = useIsPhone() ? 5 : 7;
	const visiblePages = useMemo(() => {
		const pages: (number | null)[] = [];
		const side = (maxVisible - 5) / 2;
		if (totalPages <= maxVisible) {
			for (let i = 1; i <= totalPages; i++) pages.push(i);
			return pages;
		}
		pages.push(1);
		let start = Math.max(2, currentPage - side);
		let end = Math.min(totalPages - 1, currentPage + side);
		if (currentPage <= 3) {
			start = 2;
			end = Math.min(maxVisible - 2, totalPages - 1);
		} else if (currentPage >= totalPages - 2) {
			start = Math.max(2, totalPages - (maxVisible - 3));
			end = totalPages - 1;
		}
		if (start > 2) pages.push(null);
		for (let i = start; i <= end; i++) pages.push(i);
		if (end < totalPages - 1) pages.push(null);
		pages.push(totalPages);
		return pages;
	}, [currentPage, totalPages, maxVisible]);

	const startItem = (currentPage - 1) * pageSize + 1;
	const endItem = Math.min(currentPage * pageSize, totalItems);

	const [focused, setFocused] = useState(false);
	const [inputValue, setInputValue] = useState("");

	const submitPage = () => {
		const page = parseInt(inputValue, 10);
		if (!Number.isNaN(page)) goto(page);
		setInputValue("");
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			submitPage();
			(e.currentTarget as HTMLInputElement).blur();
		}
	};

	if (totalPages <= 1) return null;

	return (
		// `relative` anchors the absolutely-positioned sr-only <label> below to THIS row, not to <html>.
		// Without a positioned ancestor the label's containing block is the document, so it sits at its
		// static offset deep inside a scroll pane and stretches <html> that far — a phantom scroll region
		// of empty space below the content. Owning it here means no caller has to remember the `relative`.
		// On a phone the strip is the row's only visible part, so it centres across the full width, whatever
		// the parent does (a size container has no width of its own inside a centring flex).
		<div className="@container relative flex items-center justify-between gap-4 select-none max-md:w-full max-md:justify-center">
			{showRange ? (
				<span className="hidden @lg:inline text-[13px] text-fg-muted tabular-nums whitespace-nowrap">
					{startItem.toLocaleString("en-US")}–{endItem.toLocaleString("en-US")} of {totalItems.toLocaleString("en-US")}
				</span>
			) : (
				<span />
			)}
			<div className="flex items-center gap-3">
				{/* Jump to any page: the strip below only ever shows seven. Sized off the pagination's own
				    width (container query), so a narrow host keeps the strip and drops this first. */}
				<span className="hidden @2xl:flex items-center gap-1.5 text-[13px] text-fg-muted whitespace-nowrap">
					<label htmlFor="pagination-page-input" className="sr-only">Page number</label>
					Page
					<input
						id="pagination-page-input"
						type="number"
						min={1}
						max={totalPages}
						className="h-8 w-12 rounded-control border border-line bg-surface-raised px-1 text-center text-[13px] font-medium text-fg tabular-nums shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
						value={focused ? inputValue : currentPage}
						onFocus={() => {
							setFocused(true);
							setInputValue(String(currentPage));
						}}
						onBlur={() => {
							submitPage();
							setFocused(false);
						}}
						onChange={(e) => setInputValue(e.currentTarget.value)}
						onKeyDown={handleKeyDown}
						aria-label="Current page"
					/>
					of {totalPages.toLocaleString("en-US")}
				</span>
				{/* The page strip is the app's segmented control (.ta-seg): the current page is the raised pill. */}
				<nav aria-label="Pagination" className="ta-seg flex items-center">
					<PageBtn onClick={() => goto(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">
						<ChevronLeft size={15} />
					</PageBtn>
					{visiblePages.map((p, i) =>
						p === null ? (
							<span key={`ellipsis-${i}`} className="flex h-7 w-5 items-center justify-center text-xs font-medium text-fg-muted tabular-nums pointer-events-none">…</span>
						) : (
							<button
								key={p}
								type="button"
								onClick={() => goto(p)}
								aria-current={currentPage === p ? "page" : undefined}
								aria-pressed={currentPage === p}
								className={cn(
									"ta-tab flex h-7 min-w-7 items-center justify-center px-1.5 text-xs font-medium tabular-nums cursor-pointer transition-colors max-md:min-w-10",
									"focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
									currentPage === p ? "text-fg" : "text-fg-muted hover:text-fg",
								)}
							>
								{p.toLocaleString("en-US")}
							</button>
						),
					)}
					<PageBtn onClick={() => goto(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Next page">
						<ChevronRight size={15} />
					</PageBtn>
				</nav>
			</div>
		</div>
	);
}

function PageBtn({ children, ...rest }: React.ComponentProps<"button">) {
	return (
		<button
			type="button"
			{...rest}
			className="ta-tab flex h-7 w-7 max-md:w-10 items-center justify-center text-fg-muted hover:text-fg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
		>
			{children}
		</button>
	);
}
