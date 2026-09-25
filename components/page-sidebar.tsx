"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { SlidersHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useIsPhone } from "@/lib/hooks/useIsPhone";
import { useImmersive } from "@/stores/immersive";
import { useMobileSheet, type SheetSnap } from "@/stores/mobileSheet";
import {
	SHEET_PANEL,
	SheetBackdrop,
	SheetBadge,
	SheetFooter,
	SheetGrabHandle,
	SheetHeader,
	snapCss,
	useDockSheet,
	useSheet,
} from "@/components/ui/bottom-sheet";

interface PageSidebarProps {
	children: ReactNode;
	scrollable?: boolean;
	/**
	 * Immersive (fullscreen-canvas) mode: slide the panel shut so the canvas beside it takes the window.
	 *
	 * The clip happens on the OUTER box while the `aside` keeps its w-80, which is what makes this a
	 * slide instead of a squeeze — a shrinking aside would reflow every label and chip on the way out.
	 * Nothing unmounts either, so the type grid's scroll position and every slider come back untouched.
	 */
	collapsed?: boolean;
	/**
	 * What the sidebar becomes on a phone (under 768px; desktop ignores this and every prop below).
	 * - `dock`: a bottom sheet over a full-bleed canvas, resting at peek / half / full. For tool pages.
	 * - `modal`: hidden until opened, then a full-height sheet over the page. For filter and contents
	 *   sidebars on reading pages. A floating pill opens it unless `mobileTrigger` is false.
	 */
	mobile?: "dock" | "modal";
	/** Name of the panel: the dock's default peek text, and the modal's title and pill label. */
	title?: string;
	/** Dock only: the content of the 44px peek row under the grab strip (name, k, prev/next...). */
	peek?: ReactNode;
	/** Dock only: the snap the sheet starts at. */
	defaultSnap?: SheetSnap;
	/** Dock only: the half snap's height as CSS. Default 50dvh. */
	halfHeight?: string;
	/** Modal only: the pill and title text ("Filters", "Contents"). Defaults to `title`. */
	mobileLabel?: string;
	/** Modal only: the pill's icon. Sliders by default (filters); a list for contents and browsing. */
	mobileIcon?: LucideIcon;
	/** Modal only: a count on the pill (active filters). Hidden when 0 or absent. */
	mobileBadge?: number;
	/** Modal only: a bar pinned under the sheet's content ("Show 240 results"). */
	mobileFooter?: ReactNode;
	/** Modal only: render the floating pill. Off when the page opens the sheet from its own button. */
	mobileTrigger?: boolean;
}

/**
 * Unified sidebar wrapper for all pages — consistent width + scroll behavior.
 *
 * On a phone the same `aside` is repositioned by CSS into a sheet: its children render once, in one
 * place, on the server and the client, so switching snaps or opening the modal never remounts a
 * catalogue. `useMobileSheet` holds the snap and the open state so the page can drive either.
 */
export function PageSidebar({
	children,
	scrollable = true,
	collapsed = false,
	mobile = "modal",
	title,
	peek,
	defaultSnap = "peek",
	halfHeight,
	mobileLabel,
	mobileIcon: PillIcon = SlidersHorizontal,
	mobileBadge,
	mobileFooter,
	mobileTrigger = true,
}: PageSidebarProps) {
	const isPhone = useIsPhone();
	const immersive = useImmersive((s) => s.immersive);
	const storeSnap = useMobileSheet((s) => s.snap);
	const open = useMobileSheet((s) => s.open);
	const asideRef = useRef<HTMLElement>(null);
	const dock = mobile === "dock";
	const label = mobileLabel ?? title ?? (dock ? "Controls" : "Options");

	// A page starts with its own default snap and a closed sheet, whatever the previous page left.
	useEffect(() => {
		const { setSnap, setOpen } = useMobileSheet.getState();
		setSnap(defaultSnap);
		setOpen(false);
		return () => {
			setSnap(null);
			setOpen(false);
		};
	}, [defaultSnap]);

	const snap = storeSnap ?? defaultSnap;
	// Immersive hides the dock entirely, the way it clips the column on desktop.
	const target = collapsed || immersive ? "hidden" : snap;
	const { headerProps } = useDockSheet(asideRef, {
		enabled: isPhone && dock,
		target,
		onSnap: (s) => useMobileSheet.getState().setSnap(s),
		onTap: () => useMobileSheet.getState().toggleSnap(),
		half: halfHeight,
	});

	const close = () => useMobileSheet.getState().setOpen(false);
	const sheet = useSheet(asideRef, !dock && open, close, label);
	// A docked sheet at peek shows only its header: the content below is out of reach for Tab and screen
	// readers too, the way it is out of sight.
	const buried = isPhone && dock && (target === "peek" || target === "hidden");

	return (
		<div
			className={cn(
				"h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out",
				collapsed ? "w-0" : "w-80",
				// The phone sheet is position:fixed, so it escapes this clip box; the box itself takes no
				// room and the page's canvas or content gets the full width.
				"max-md:w-0",
			)}
		>
			{sheet.active ? <SheetBackdrop onClose={close} /> : null}
			{!dock && mobileTrigger && !open && !collapsed ? (
				<button
					type="button"
					onClick={() => useMobileSheet.getState().setOpen(true)}
					className="fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] left-1/2 z-40 hidden h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-fg px-5 text-sm font-medium text-fg-inverse shadow-lg max-md:flex"
				>
					<PillIcon size={16} aria-hidden />
					{label}
					<SheetBadge count={mobileBadge} />
				</button>
			) : null}
			<aside
				ref={asideRef}
				{...(dock && isPhone ? { role: "region", "aria-label": label } : sheet.dialogProps)}
				style={dock ? ({ "--sheet-h": snapCss(target, halfHeight) } as CSSProperties) : undefined}
				className={cn(
					"h-full w-80 shrink-0 flex flex-col bg-surface-chrome border-r border-line-subtle overflow-hidden",
					"max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:w-full max-md:rounded-t-2xl max-md:border-r-0 max-md:overscroll-contain max-md:focus:outline-none",
					dock
						? cn(
								"max-md:z-40 max-md:h-[var(--sheet-h)] max-md:pb-[env(safe-area-inset-bottom)] max-md:shadow-[0_-6px_24px_oklch(0_0_0/0.14)]",
								target === "hidden" ? "max-md:border-t-0" : "max-md:border-t",
							)
						: cn(SHEET_PANEL, "max-md:h-auto", !mobileFooter && "max-md:pb-[env(safe-area-inset-bottom)]", open ? "ta-sheet-in" : "max-md:hidden"),
				)}
			>
				{dock ? (
					<div {...headerProps} className="flex h-[68px] shrink-0 cursor-grab touch-none select-none flex-col pb-1 md:hidden">
						<SheetGrabHandle
							expanded={snap !== "peek"}
							onToggle={() => useMobileSheet.getState().toggleSnap()}
							label={label}
						/>
						<div className="flex h-11 min-w-0 shrink-0 items-center gap-2 px-4">
							{peek ?? <span className="truncate text-[15px] font-semibold text-fg">{label}</span>}
						</div>
					</div>
				) : (
					<SheetHeader title={label} onClose={close} closeLabel={`Close ${label}`} swipe={sheet.swipe} />
				)}
				<div
					inert={buried}
					className={cn(
						"flex-1",
						// overflow-x-hidden explicitly: with only overflow-y set, overflow-x computes to auto, and any
						// invisible overflow (e.g. a transformed slider part) would give the sidebar a phantom
						// horizontal scroll. A sidebar never scrolls sideways.
						scrollable ? "ta-scroll-fade overflow-y-auto overflow-x-hidden scrollbar-hide pb-6" : "overflow-hidden",
						"max-md:min-h-0",
					)}
				>
					{children}
				</div>
				{!dock && mobileFooter ? <SheetFooter className="block">{mobileFooter}</SheetFooter> : null}
			</aside>
		</div>
	);
}
