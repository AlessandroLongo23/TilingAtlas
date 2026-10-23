"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useIsPhone } from "@/lib/hooks/useIsPhone";
import { SegIndicator } from "@/components/ui/seg-indicator";

interface PaginationProps {
	totalItems: number;
	pageSize?: number;
	currentPage: number;
	onPageChange: (page: number) => void;
	/** Show the "1–25 of N" range at the left. Off where the page already states its count. */
	showRange?: boolean;
}

const fmt = (n: number) => n.toLocaleString("en-US");
// Width estimates for the layout choice, measured off the strip's 12px tabular figures: a digit is 7.3px,
// a thousands comma 3.2px, a cell pads 12px and is never under 28px. "927" is 34px, "1,199" 44.5px.
const textWidth = (s: string) => s.replace(/,/g, "").length * 7.3 + (s.match(/,/g)?.length ?? 0) * 3.2;
const cellWidth = (p: number) => Math.max(28, 12 + textWidth(fmt(p)));

/**
 * A pager that fits wherever it is put. With room, it is the full strip (first, last, the current page
 * and its neighbours) with the "Page [n] of N" field and the item range beside it, dropped in reverse
 * order of importance as the room shrinks. When even the bare strip would not fit (a sidebar paging
 * through 30,000 pages has five-digit cells), it becomes a stepper: ‹ [page] of N ›, which spans its
 * column and cannot overflow. The layout follows the pager's own measured width, not the viewport, so
 * the same component is right in a sidebar and under a grid.
 */
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
	// a phone), and gaps.
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

	// The room the pager has, measured before paint so the first frame already has the right layout.
	const rootRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		const el = rootRef.current;
		if (!el) return;
		setWidth(el.clientWidth);
		if (typeof ResizeObserver === "undefined") return;
		const ro = new ResizeObserver(() => setWidth(el.clientWidth));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const startItem = (currentPage - 1) * pageSize + 1;
	const endItem = Math.min(currentPage * pageSize, totalItems);
	const rangeText = `${fmt(startItem)}–${fmt(endItem)} of ${fmt(totalItems)}`;

	// The strip at its widest for this many pages, which is its last stretch ("1 … 926 927 928 929 930":
	// one gap, every other cell as wide as the last page's number). Chosen once per result set, so the
	// pager never changes shape while paging. Plus the track's padding, its 2px gaps and the two arrows.
	const cells =
		totalPages <= maxVisible
			? Array.from({ length: totalPages }, (_, i) => cellWidth(i + 1)).reduce((a, b) => a + b, 0)
			: 28 + 20 + (maxVisible - 2) * cellWidth(totalPages);
	const stripW = 6 + 2 * 28 + cells + 2 * (Math.min(totalPages, maxVisible) + 2) + 4;
	const lastW = textWidth(fmt(totalPages));
	const fieldW = 12 + 34 + 6 + (lastW + 20) + 6 + 20 + lastW;
	const rangeW = 16 + rangeText.length * 6.8;
	const stepper = width > 0 && stripW > width;
	const showField = !stepper && width >= stripW + fieldW;
	const showRangeHere = showRange && !stepper && width >= stripW + (showField ? fieldW : 0) + rangeW;

	if (totalPages <= 1) return null;

	return (
		// `relative` keeps anything absolutely positioned inside anchored to this row and not to <html>,
		// where it would stretch the document into a phantom scroll region below the app shell.
		<div
			ref={rootRef}
			className={cn(
				"relative flex w-full items-center gap-3 select-none",
				stepper ? "justify-center" : showRangeHere ? "justify-between" : "justify-end max-md:justify-center",
			)}
		>
			{stepper ? (
				<nav aria-label="Pagination" className="ta-seg flex w-full items-center justify-between">
					<PageBtn onClick={() => goto(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">
						<ChevronLeft size={15} />
					</PageBtn>
					<span className="flex min-w-0 items-center gap-1.5 text-xs whitespace-nowrap text-fg-muted tabular-nums">
						<PageField current={currentPage} total={totalPages} onSubmit={goto} />
						of {fmt(totalPages)}
					</span>
					<PageBtn onClick={() => goto(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Next page">
						<ChevronRight size={15} />
					</PageBtn>
				</nav>
			) : (
				<>
					{showRangeHere ? (
						<span className="text-[13px] whitespace-nowrap text-fg-muted tabular-nums">{rangeText}</span>
					) : null}
					<div className="flex items-center gap-3">
						{/* Jump to any page: the strip only ever shows seven. */}
						{showField ? (
							<span className="flex items-center gap-1.5 text-[13px] whitespace-nowrap text-fg-muted tabular-nums">
								Page
								<PageField current={currentPage} total={totalPages} onSubmit={goto} />
								of {fmt(totalPages)}
							</span>
						) : null}
						{/* The page strip is the app's segmented control (.ta-seg): the current page is the raised pill. */}
						<nav aria-label="Pagination" className="ta-seg flex items-center">
							<SegIndicator />
							<PageBtn onClick={() => goto(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">
								<ChevronLeft size={15} />
							</PageBtn>
							{visiblePages.map((p, i) =>
								p === null ? (
									<span
										key={`ellipsis-${i}`}
										className="pointer-events-none flex h-7 w-5 items-center justify-center text-xs font-medium text-fg-muted"
									>
										…
									</span>
								) : (
									<button
										key={p}
										type="button"
										onClick={() => goto(p)}
										aria-current={currentPage === p ? "page" : undefined}
										aria-pressed={currentPage === p}
										className={cn(
											"ta-tab flex h-7 min-w-7 cursor-pointer items-center justify-center px-1.5 text-xs font-medium whitespace-nowrap tabular-nums max-md:min-w-10",
											"focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
											currentPage === p ? "text-fg" : "text-fg-muted hover:text-fg",
										)}
									>
										{fmt(p)}
									</button>
								),
							)}
							<PageBtn
								onClick={() => goto(currentPage + 1)}
								disabled={currentPage >= totalPages}
								aria-label="Next page"
							>
								<ChevronRight size={15} />
							</PageBtn>
						</nav>
					</div>
				</>
			)}
		</div>
	);
}

/** The editable page number: shows the current page, takes a typed one on Enter or blur. Sized to the
 *  digits of the last page, so five-digit pages are not cropped and two-digit ones are not swimming. */
function PageField({ current, total, onSubmit }: { current: number; total: number; onSubmit: (p: number) => void }) {
	const [draft, setDraft] = useState<string | null>(null);
	// Escape blurs too, and the blur would otherwise submit the abandoned draft.
	const cancelled = useRef(false);
	const submit = () => {
		const page = parseInt((draft ?? "").replace(/[^\d]/g, ""), 10);
		if (!cancelled.current && !Number.isNaN(page)) onSubmit(page);
		cancelled.current = false;
		setDraft(null);
	};
	return (
		<input
			type="text"
			inputMode="numeric"
			aria-label={`Page, of ${fmt(total)}`}
			style={{ width: `calc(${fmt(total).length}ch + 18px)` }}
			className="h-7 rounded-control border border-line bg-surface-raised px-1.5 text-center text-xs font-medium text-fg tabular-nums shadow-sm focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 max-md:h-10 max-md:text-base"
			value={draft ?? fmt(current)}
			onFocus={(e) => {
				setDraft(String(current));
				requestAnimationFrame(() => e.target.select());
			}}
			onChange={(e) => setDraft(e.currentTarget.value)}
			onBlur={submit}
			onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
				if (e.key === "Enter") {
					e.preventDefault();
					e.currentTarget.blur();
				} else if (e.key === "Escape") {
					cancelled.current = true;
					e.currentTarget.blur();
				}
			}}
		/>
	);
}

function PageBtn({ children, ...rest }: React.ComponentProps<"button">) {
	return (
		<button
			type="button"
			{...rest}
			className="ta-tab flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center text-fg-muted hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-30 max-md:w-10"
		>
			{children}
		</button>
	);
}
