"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface PaginationProps {
	totalItems: number;
	pageSize?: number;
	currentPage: number;
	onPageChange: (page: number) => void;
}

export function Pagination({
	totalItems,
	pageSize = 24,
	currentPage,
	onPageChange,
}: PaginationProps) {
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

	useEffect(() => {
		if (currentPage > totalPages) onPageChange(totalPages);
		else if (currentPage < 1) onPageChange(1);
	}, [currentPage, totalPages, onPageChange]);

	const goto = (page: number) => {
		onPageChange(Math.max(1, Math.min(totalPages, page)));
	};

	const visiblePages = useMemo(() => {
		const pages: (number | null)[] = [];
		const maxVisible = 7;
		if (totalPages <= maxVisible) {
			for (let i = 1; i <= totalPages; i++) pages.push(i);
			return pages;
		}
		pages.push(1);
		let start = Math.max(2, currentPage - 1);
		let end = Math.min(totalPages - 1, currentPage + 1);
		if (currentPage <= 3) {
			start = 2;
			end = Math.min(5, totalPages - 1);
		} else if (currentPage >= totalPages - 2) {
			start = Math.max(2, totalPages - 4);
			end = totalPages - 1;
		}
		if (start > 2) pages.push(null);
		for (let i = start; i <= end; i++) pages.push(i);
		if (end < totalPages - 1) pages.push(null);
		pages.push(totalPages);
		return pages;
	}, [currentPage, totalPages]);

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
		<div className="relative flex items-center justify-between gap-4 select-none">
			<span className="text-xs text-fg-muted tabular-nums whitespace-nowrap">
				{startItem}–{endItem} of {totalItems}
			</span>
			{/* One joined wall strip: every element is a cell separated by hairlines, with the
			    ta-wall-cell radius drawing the little intersection stars between them. */}
			<div className="ta-wall inline-flex items-stretch gap-px p-px">
				<PageBtn onClick={() => goto(1)} disabled={currentPage <= 1} aria-label="First page">
					<ChevronsLeft size={14} />
				</PageBtn>
				<PageBtn onClick={() => goto(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">
					<ChevronLeft size={14} />
				</PageBtn>
				<label htmlFor="pagination-page-input" className="sr-only">Page number</label>
				<input
					id="pagination-page-input"
					type="number"
					min={1}
					max={totalPages}
					className="ta-wall-cell w-10 h-7 px-1 bg-surface text-fg text-xs font-medium tabular-nums text-center hover:bg-surface-raised focus:outline-none focus:bg-surface-raised transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
				<span className="ta-wall-cell flex items-center h-7 px-2 bg-surface text-fg-muted text-xs whitespace-nowrap">
					of {totalPages}
				</span>
				{visiblePages.map((p, i) =>
					p === null ? (
						<span key={`ellipsis-${i}`} className="ta-wall-cell flex items-center justify-center w-5 h-7 bg-surface text-fg-disabled text-xs pointer-events-none">…</span>
					) : (
						<button
							key={p}
							onClick={() => goto(p)}
							aria-current={currentPage === p ? "page" : undefined}
							className={cn(
								"ta-wall-cell flex items-center justify-center min-w-7 h-7 px-1 text-xs font-medium tabular-nums transition-colors cursor-pointer",
								currentPage === p
									? "bg-fg text-fg-inverse hover:bg-fg"
									: "bg-surface text-fg-muted hover:bg-surface-raised hover:text-fg-secondary",
							)}
						>
							{p}
						</button>
					),
				)}
				<PageBtn onClick={() => goto(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Next page">
					<ChevronRight size={14} />
				</PageBtn>
				<PageBtn onClick={() => goto(totalPages)} disabled={currentPage >= totalPages} aria-label="Last page">
					<ChevronsRight size={14} />
				</PageBtn>
			</div>
		</div>
	);
}

function PageBtn({ children, ...rest }: React.ComponentProps<"button">) {
	return (
		<button
			{...rest}
			className="ta-wall-cell flex items-center justify-center w-7 h-7 bg-surface text-fg-muted hover:bg-surface-raised hover:text-fg-secondary cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
		>
			{children}
		</button>
	);
}
