"use client";

import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
	type Ref,
	type RefObject,
} from "react";
import { SlidersHorizontal, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { isPhoneNow, useIsPhone } from "@/lib/hooks/useIsPhone";
import { useModalLayer } from "@/lib/hooks/useModalLayer";
import type { SheetSnap } from "@/stores/mobileSheet";

// Every phone sheet is built from this file: the dock sheet's motion (PageSidebar's tool-page dock),
// and the pieces of a modal sheet (backdrop, grab bar, header with title and close, swipe to dismiss,
// footer, and the layer behaviour: focus trap, Esc, Back, scroll lock). The modal sheets are
// PageSidebar's "modal" mode, the wall sheets in components/freedraw/filter-wall.tsx, the nav menu,
// and `Modal` on a phone. Desktop never renders or runs any of it.

// ── Modal sheets ────────────────────────────────────────────────────────────────────────────────────

/** Fixed full-height panel under the status bar, rounded on top. Spread on the element that is the sheet. */
export const SHEET_PANEL =
	"max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-[calc(env(safe-area-inset-top)+8px)] max-md:z-50 max-md:flex max-md:flex-col max-md:rounded-t-2xl max-md:shadow-xl max-md:overscroll-contain max-md:focus:outline-none";

/** Controls in a sheet's header keep their own presses; only bare header (and the grab bar) drags. */
const INTERACTIVE = 'button, a, input, select, textarea, label, [role="button"], [role="slider"], [role="tab"]';
const grabsHeader = (t: EventTarget) =>
	!!(t as HTMLElement).closest("[data-sheet-handle]") || !(t as HTMLElement).closest(INTERACTIVE);

/** Movement under this many px is a tap, not a drag. */
const TAP_SLOP = 6;
const SETTLE_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/**
 * Pull a sheet by its header to dismiss it: down for a bottom sheet, right for the side menu. Past 96px,
 * or flicked, it closes; short of that it springs back. The sheet follows the finger through an inline
 * transform that is cleared once it settles. Spread the returned handlers on the header, or with
 * `anywhere` on the whole sheet (the menu): there a drag starts on any control too, once the finger has
 * clearly gone along the axis, and a move across it is left to the content's own scroll.
 */
export function useSwipeDismiss(
	ref: RefObject<HTMLElement | null>,
	onClose: () => void,
	axis: "down" | "right" = "down",
	anywhere = false,
) {
	const drag = useRef<{ id: number; x: number; y: number; t: number; d: number; moved: boolean } | null>(null);
	const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (settle.current) clearTimeout(settle.current);
		},
		[],
	);
	const move = (el: HTMLElement, px: string) => {
		el.style.transform = axis === "down" ? `translateY(${px})` : `translateX(${px})`;
	};
	const end = (e: ReactPointerEvent) => {
		const d = drag.current;
		const el = ref.current;
		if (!d || !el || d.id !== e.pointerId) return;
		drag.current = null;
		if (!d.moved) return;
		const flick = d.d > 24 && d.d / Math.max(1, e.timeStamp - d.t) > 0.5;
		const close = e.type !== "pointercancel" && (d.d > 96 || flick);
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		el.style.transition = reduce ? "none" : `transform 200ms ${SETTLE_EASE}`;
		if (close) move(el, "100%");
		else el.style.transform = "";
		settle.current = setTimeout(
			() => {
				settle.current = null;
				if (close) onClose();
				requestAnimationFrame(() => {
					el.style.transition = "";
					el.style.transform = "";
				});
			},
			reduce ? 0 : 200,
		);
	};
	return {
		onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
			if (!isPhoneNow() || (e.pointerType === "mouse" && e.button !== 0)) return;
			const onHeader = grabsHeader(e.target);
			if (!onHeader && !anywhere) return;
			if (onHeader) e.currentTarget.setPointerCapture(e.pointerId);
			drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, d: 0, moved: false };
		},
		onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
			const d = drag.current;
			const el = ref.current;
			if (!d || !el || d.id !== e.pointerId) return;
			const along = axis === "down" ? e.clientY - d.y : e.clientX - d.x;
			d.d = Math.max(0, along);
			if (!d.moved) {
				const across = Math.abs(axis === "down" ? e.clientX - d.x : e.clientY - d.y);
				if (across > TAP_SLOP && across > Math.abs(along)) {
					drag.current = null;
					return;
				}
				if (d.d < TAP_SLOP) return;
				d.moved = true;
				// Captured now at the latest, so the release lands here and not as a click on a row.
				e.currentTarget.setPointerCapture(e.pointerId);
			}
			el.style.transition = "none";
			move(el, `${d.d}px`);
		},
		onPointerUp: end,
		onPointerCancel: end,
	};
}

export type SwipeHandlers = ReturnType<typeof useSwipeDismiss>;

/**
 * A modal sheet's behaviour in one call: the layer (focus trap, Esc, Back, scroll lock) while it is
 * open on a phone, swipe to dismiss (from anywhere on a side panel), and the dialog attributes to
 * spread on the sheet element.
 */
export function useSheet(
	ref: RefObject<HTMLElement | null>,
	open: boolean,
	onClose: () => void,
	label: string,
	axis: "down" | "right" = "down",
) {
	const isPhone = useIsPhone();
	const active = isPhone && open;
	useModalLayer(ref, active, onClose);
	const swipe = useSwipeDismiss(ref, onClose, axis, axis === "right");
	// Crossing to a desktop width (a phone turned to landscape) closes the sheet for good, so it is not
	// waiting, with a new history entry, when the width comes back.
	const wasPhone = useRef(isPhone);
	useEffect(() => {
		if (wasPhone.current && !isPhone && open) onClose();
		wasPhone.current = isPhone;
	});
	const dialogProps = active
		? ({ role: "dialog", "aria-modal": true, "aria-label": label, tabIndex: -1 } as const)
		: ({} as const);
	return { active, swipe, dialogProps };
}

/** The dimmed page under an open sheet; a tap on it closes the sheet. */
export function SheetBackdrop({ onClose, className }: { onClose: () => void; className?: string }) {
	return <div aria-hidden onClick={onClose} className={cn("ta-backdrop-in fixed inset-0 z-50 bg-black/35 md:hidden", className)} />;
}

/** The short bar that says "this drags". Decorative; the header around it takes the gesture. */
export function SheetGrabBar({ className }: { className?: string }) {
	return (
		<span
			aria-hidden
			className={cn("absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-line-strong md:hidden", className)}
		/>
	);
}

/** The 44px close button every sheet header ends with. */
function SheetCloseButton({ onClick, label }: { onClick: () => void; label: string }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			className="flex size-11 shrink-0 items-center justify-center rounded-control text-fg-muted hover:bg-surface-overlay hover:text-fg"
		>
			<X size={20} />
		</button>
	);
}

/**
 * A sheet's title row: grab bar, title, the row's own controls (`children`), then close. The whole row
 * drags the sheet away (`swipe`), except the controls in it. Phone only.
 */
export function SheetHeader({
	title,
	onClose,
	closeLabel,
	swipe,
	grabBar = true,
	children,
	className,
}: {
	title: ReactNode;
	onClose: () => void;
	closeLabel: string;
	/** The drag handlers; left off when the whole sheet carries them (the menu). */
	swipe?: SwipeHandlers;
	/** Off for the side menu, which slides sideways. */
	grabBar?: boolean;
	children?: ReactNode;
	className?: string;
}) {
	return (
		<div
			{...swipe}
			className={cn(
				"relative flex h-14 shrink-0 touch-none select-none items-center gap-1 border-b border-line-subtle pl-4 pr-1.5 md:hidden",
				className,
			)}
		>
			{grabBar ? <SheetGrabBar /> : null}
			<h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-fg">{title}</h2>
			{children}
			<SheetCloseButton onClick={onClose} label={closeLabel} />
		</div>
	);
}

/** The bar pinned under a sheet's content ("Show 240 results"), clear of the home indicator. */
export function SheetFooter({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				"flex shrink-0 items-center gap-3 border-t border-line-subtle bg-inherit p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] md:hidden",
				className,
			)}
		>
			{children}
		</div>
	);
}

/**
 * The one button that opens a phone sheet ("Filters 3", "Contents"): a dark 44px pill with an icon, the
 * sheet's name and a count (active filters; nothing at 0). It sits in the page header where there is
 * one; `floating` pins it bottom centre, for a page with no header or once the header has scrolled away.
 * Phone only.
 */
export function SheetTrigger({
	label,
	icon: Icon = SlidersHorizontal,
	count,
	onClick,
	floating = false,
	expanded,
	controls,
	ref,
	className,
}: {
	label: string;
	icon?: LucideIcon;
	count?: number;
	onClick: () => void;
	floating?: boolean;
	/** The sheet's open state and id, when the sheet is an element on the page (aria-expanded/controls). */
	expanded?: boolean;
	controls?: string;
	ref?: Ref<HTMLButtonElement>;
	className?: string;
}) {
	return (
		<button
			ref={ref}
			type="button"
			onClick={onClick}
			aria-haspopup="dialog"
			aria-expanded={expanded}
			aria-controls={controls}
			className={cn(
				"hidden h-11 shrink-0 items-center gap-2 rounded-full bg-fg px-4 text-sm font-medium text-fg-inverse max-md:inline-flex",
				floating && "fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] left-1/2 z-40 -translate-x-1/2 px-5 shadow-lg",
				className,
			)}
		>
			<Icon size={16} aria-hidden />
			{label}
			{count ? (
				<span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-xs tabular-nums leading-5 text-accent-contrast">
					{count}
				</span>
			) : null}
		</button>
	);
}

// ── The dock sheet ──────────────────────────────────────────────────────────────────────────────────
//
// The snap heights, the drag, and the `--sheet-offset` it publishes. PageSidebar owns the markup (its
// aside IS the sheet, so the sidebar's children mount once); this part owns everything that moves.
//
// How it moves without reflowing the sidebar on every frame: at rest the sheet is exactly as tall as
// its snap (a CSS height, so the server HTML is already right), which keeps each page's own scroll
// regions sized to what is visible. The moment a drag or a snap change starts, the sheet is made as
// tall as the "full" snap and pushed down by a transform so nothing on screen moves; the gesture and
// the settle animation then only ever change that transform. When the settle ends, the inline height
// and transform are dropped and the CSS height of the new snap takes over. Two layouts per gesture,
// none per frame, and because the sheet is anchored to the bottom edge the content never jumps.

export type SheetTarget = SheetSnap | "hidden";

/** The dock header: a 20px grab strip over a 44px peek row, with 4px under it. */
const PEEK_PX = 68;

/** Resting height of each snap, as CSS. Also used to measure the snaps in px during a gesture. */
const SNAP_CSS: Record<SheetTarget, string> = {
	peek: `calc(${PEEK_PX}px + env(safe-area-inset-bottom))`,
	half: "50dvh",
	full: "calc(100dvh - var(--topbar-h, 48px))",
	hidden: "0px",
};

/** A snap's resting height as CSS, with the page's own half height when it sets one. */
export const snapCss = (t: SheetTarget, half?: string) => (t === "half" && half ? half : SNAP_CSS[t]);

const SNAPS: SheetSnap[] = ["peek", "half", "full"];
const SETTLE_MS = 280;
/** A release faster than this (px/ms) goes to the next snap in its direction, however short the drag. */
const FLING = 0.45;

/** A CSS length resolved to px, through a throwaway fixed box (env() and dvh only resolve in layout). */
function measure(css: string): number {
	const probe = document.createElement("div");
	probe.style.cssText = `position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:${css}`;
	document.body.appendChild(probe);
	const px = probe.getBoundingClientRect().height;
	probe.remove();
	return px;
}

function publishOffset(px: number | null) {
	const root = document.documentElement;
	if (px === null) root.style.removeProperty("--sheet-offset");
	else root.style.setProperty("--sheet-offset", `${Math.round(px)}px`);
}

interface DockSheetOptions {
	/** Phone and dock mode. Off, the hook leaves the element alone and publishes nothing. */
	enabled: boolean;
	/** Where the sheet should rest. */
	target: SheetTarget;
	/** A drag ended on this snap. */
	onSnap: (snap: SheetSnap) => void;
	/** The header was tapped without dragging. */
	onTap: () => void;
	/** The half snap's height as CSS, when the page wants other than 50dvh. */
	half?: string;
	/** The scrolling content under the header: a pull down on it at its top moves the sheet. */
	content?: RefObject<HTMLElement | null>;
}

export function useDockSheet(
	ref: RefObject<HTMLElement | null>,
	{ enabled, target, onSnap, onTap, half, content }: DockSheetOptions,
) {
	// Visible height in px the sheet is at, or heading to.
	const visibleRef = useRef(0);
	// The target the sheet is at or heading to; null before the first measure.
	const settledRef = useRef<SheetTarget | null>(null);
	const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const dragRef = useRef<{
		id: number;
		startY: number;
		startVisible: number;
		full: number;
		moved: boolean;
		samples: { y: number; t: number }[];
	} | null>(null);

	const clearInline = useCallback((el: HTMLElement) => {
		el.style.height = "";
		el.style.transform = "";
		el.style.transition = "";
	}, []);

	/** The sheet's current visible height, mid-animation included (read off the live transform). */
	const currentVisible = useCallback((el: HTMLElement, full: number) => {
		if (!el.style.transform) return el.getBoundingClientRect().height;
		const ty = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
		return full - ty;
	}, []);

	const animateTo = useCallback(
		(to: SheetTarget) => {
			const el = ref.current;
			if (!el) return;
			if (settleTimer.current) clearTimeout(settleTimer.current);
			const full = measure(SNAP_CSS.full);
			const from = el.style.transform ? currentVisible(el, full) : visibleRef.current;
			const toPx = measure(snapCss(to, half));
			settledRef.current = to;
			visibleRef.current = toPx;
			publishOffset(toPx);
			const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			if (reduce || Math.abs(from - toPx) < 1) {
				clearInline(el);
				return;
			}
			el.style.transition = "none";
			el.style.height = `${full}px`;
			el.style.transform = `translateY(${full - from}px)`;
			el.getBoundingClientRect(); // commit the start position before the transition begins
			el.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASE}`;
			el.style.transform = `translateY(${full - toPx}px)`;
			// A timer and not transitionend: a transition that is interrupted or never starts (tab in the
			// background) fires no end event, and a stuck inline height would pin the sheet.
			settleTimer.current = setTimeout(() => {
				settleTimer.current = null;
				if (!dragRef.current) clearInline(el);
			}, SETTLE_MS + 40);
		},
		[ref, clearInline, currentVisible, half],
	);

	// Follow the target: first sight measures in place, later changes animate.
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (!enabled) {
			if (settledRef.current !== null) {
				clearInline(el);
				settledRef.current = null;
				publishOffset(null);
			}
			return;
		}
		if (settledRef.current === null) {
			settledRef.current = target;
			visibleRef.current = el.getBoundingClientRect().height;
			publishOffset(visibleRef.current);
			return;
		}
		if (settledRef.current !== target) animateTo(target);
	}, [enabled, target, ref, animateTo, clearInline]);

	// The resting height is CSS (dvh, safe-area insets), so the browser chrome showing or hiding changes
	// it with no event of ours; keep the published offset honest.
	useEffect(() => {
		const el = ref.current;
		if (!enabled || !el) return;
		const ro = new ResizeObserver(() => {
			if (dragRef.current || settleTimer.current || el.style.height) return;
			visibleRef.current = el.getBoundingClientRect().height;
			publishOffset(visibleRef.current);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [enabled, ref]);

	useEffect(
		() => () => {
			if (settleTimer.current) clearTimeout(settleTimer.current);
			if (settledRef.current !== null) publishOffset(null);
		},
		[],
	);

	// The drag, fed by the header's pointer events and by a pull on the content (below).
	const begin = (id: number, y: number, t: number) => {
		const el = ref.current;
		if (!el) return false;
		if (settleTimer.current) {
			clearTimeout(settleTimer.current);
			settleTimer.current = null;
		}
		const full = measure(SNAP_CSS.full);
		const visible = currentVisible(el, full);
		el.style.transition = "none";
		el.style.height = `${full}px`;
		el.style.transform = `translateY(${full - visible}px)`;
		dragRef.current = { id, startY: y, startVisible: visible, full, moved: false, samples: [{ y, t }] };
		return true;
	};

	const follow = (id: number, y: number, t: number) => {
		const drag = dragRef.current;
		const el = ref.current;
		if (!drag || !el || drag.id !== id) return;
		const dy = y - drag.startY;
		if (!drag.moved && Math.abs(dy) < TAP_SLOP) return;
		drag.moved = true;
		const visible = Math.min(drag.full, Math.max(0, drag.startVisible - dy));
		el.style.transform = `translateY(${drag.full - visible}px)`;
		drag.samples.push({ y, t });
		// Velocity from the last ~100ms only, so a drag that paused before release does not fling.
		while (drag.samples.length > 2 && t - drag.samples[0].t > 100) drag.samples.shift();
	};

	const release = (id: number, cancelled: boolean) => {
		const drag = dragRef.current;
		const el = ref.current;
		if (!drag || !el || drag.id !== id) return;
		dragRef.current = null;
		if (!drag.moved) {
			// A tap: put the sheet back as it was, then let the page decide what a tap means.
			clearInline(el);
			if (!cancelled) onTap();
			return;
		}
		const visible = currentVisible(el, drag.full);
		const first = drag.samples[0];
		const last = drag.samples[drag.samples.length - 1];
		const dt = last.t - first.t;
		// Positive = growing (finger moving up).
		const v = cancelled || dt <= 0 ? 0 : (first.y - last.y) / dt;
		const snap = SNAPS[pickSnap(visible, v, SNAPS.map((s) => measure(snapCss(s, half))))];
		animateTo(snap);
		onSnap(snap);
	};

	// Pulling down on the content while it is scrolled to the top moves the sheet, as on iOS: the pull
	// takes over only once the finger has gone down past the tap slop with nothing under it scrolled, so
	// every other touch scrolls the content as before. Touch events, because a pan that the content's
	// touch-action allows ends the pointer stream (pointercancel) before a drag could be seen.
	const pull = useRef({ begin, follow, release });
	useEffect(() => {
		pull.current = { begin, follow, release };
	});
	useEffect(() => {
		const box = content?.current;
		if (!enabled || !box) return;
		let start: { id: number; y: number } | null = null;
		let taken = -1;
		const onStart = (e: TouchEvent) => {
			const t = e.touches[0];
			start = e.touches.length === 1 && !dragRef.current && pullable(e.target, box) ? { id: t.identifier, y: t.clientY } : null;
		};
		const onMove = (e: TouchEvent) => {
			const t = Array.from(e.changedTouches).find((c) => c.identifier === (start?.id ?? taken));
			if (!t) return;
			if (start) {
				const dy = t.clientY - start.y;
				if (Math.abs(dy) < TAP_SLOP) return;
				const s = start;
				start = null;
				if (dy < 0 || scrolledDown(e.target, box) || !e.cancelable || !pull.current.begin(s.id, s.y, e.timeStamp)) return;
				taken = s.id;
			}
			if (taken !== t.identifier) return;
			e.preventDefault();
			pull.current.follow(taken, t.clientY, e.timeStamp);
		};
		const onEnd = (e: TouchEvent) => {
			start = null;
			if (taken < 0 || !Array.from(e.changedTouches).some((c) => c.identifier === taken)) return;
			pull.current.release(taken, e.type === "touchcancel");
			taken = -1;
		};
		box.addEventListener("touchstart", onStart, { passive: true });
		box.addEventListener("touchmove", onMove, { passive: false });
		box.addEventListener("touchend", onEnd);
		box.addEventListener("touchcancel", onEnd);
		return () => {
			box.removeEventListener("touchstart", onStart);
			box.removeEventListener("touchmove", onMove);
			box.removeEventListener("touchend", onEnd);
			box.removeEventListener("touchcancel", onEnd);
		};
	}, [enabled, content]);

	return {
		headerProps: {
			onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
				if (!enabled || target === "hidden") return;
				if (e.pointerType === "mouse" && e.button !== 0) return;
				if (!grabsHeader(e.target)) return;
				if (begin(e.pointerId, e.clientY, e.timeStamp)) e.currentTarget.setPointerCapture(e.pointerId);
			},
			onPointerMove: (e: ReactPointerEvent<HTMLElement>) => follow(e.pointerId, e.clientY, e.timeStamp),
			onPointerUp: (e: ReactPointerEvent<HTMLElement>) => release(e.pointerId, false),
			onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => release(e.pointerId, true),
		},
	};
}

/** Every box from `t` up to `box` lets a vertical pan through (a pad or a canvas that takes its own drags does not). */
function pullable(t: EventTarget | null, box: HTMLElement) {
	for (let el = t as HTMLElement | null; el && el !== box.parentElement; el = el.parentElement) {
		const ta = getComputedStyle(el).touchAction;
		if (ta !== "auto" && ta !== "manipulation" && !ta.includes("pan-y")) return false;
	}
	return true;
}

/** Some box from `t` up to `box` is scrolled away from its top, so a pull down scrolls it. */
function scrolledDown(t: EventTarget | null, box: HTMLElement) {
	for (let el = t as HTMLElement | null; el && el !== box.parentElement; el = el.parentElement) if (el.scrollTop > 0) return true;
	return false;
}

/**
 * Where a released dock settles, as an index into `snaps` (resting heights in px, ascending). A fling
 * (|v| over FLING px/ms; positive = growing) goes to the next snap in its direction however short the
 * drag; otherwise the nearest snap to a short throw ahead of the release point.
 */
export function pickSnap(visible: number, v: number, snaps: number[]): number {
	if (v > FLING) {
		const i = snaps.findIndex((h) => h > visible + 1);
		return i < 0 ? snaps.length - 1 : i;
	}
	if (v < -FLING) {
		for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i] < visible - 1) return i;
		return 0;
	}
	const projected = visible + v * 150;
	let pick = 0;
	for (let i = 1; i < snaps.length; i++) if (Math.abs(snaps[i] - projected) < Math.abs(snaps[pick] - projected)) pick = i;
	return pick;
}

/**
 * The dock's grab strip: a full-width, 20px button over the peek row, so a keyboard can open and close
 * the sheet and a finger always has somewhere to drag, whatever the page puts in the peek row.
 */
export function SheetGrabHandle({ expanded, onToggle, label }: { expanded: boolean; onToggle: () => void; label: string }) {
	return (
		<button
			type="button"
			data-sheet-handle
			aria-expanded={expanded}
			aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
			// Pointer taps are handled by the header's gesture code (which sees the whole press); only a
			// keyboard activation, which reports detail 0, toggles here, so a tap never toggles twice.
			onClick={(e) => {
				if (e.detail === 0) onToggle();
			}}
			className="group flex h-5 w-full shrink-0 cursor-grab items-center justify-center focus:outline-none"
		>
			<span
				aria-hidden
				className="h-1 w-9 rounded-full bg-line-strong group-focus-visible:h-1.5 group-focus-visible:w-12 group-focus-visible:bg-accent"
			/>
		</button>
	);
}
