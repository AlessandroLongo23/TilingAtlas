"use client";

import { useCallback, type ReactNode } from "react";
import { X } from "lucide-react";
import { useIsPhone } from "@/lib/hooks/useIsPhone";

// The four-stage board: a control rail beside a 2x2 grid of stages, sized to one screen.
//
// The layout exists to solve a specific problem. Every one of these pages has a control that changes all
// four stages at once — the battery edge, the homology class, the ball radius — and the class control in
// particular is a continuous drag. With the control above a 2x2 grid, the grid runs past the fold, and
// watching what a drag DOES means moving it, scrolling down, and scrolling back. The whole point of
// putting four stages on one page is that they answer each other, so they have to be visible together.
//
// So the board takes the height it is given and does not scroll. The rail is the only scrolling part,
// which is where the prose lives: reading is the thing you can afford to scroll for, and the figures are
// not. Below `lg` it degrades to the old stacked column, since a phone has no width to rail off.

export interface BoardStage {
	n: number;
	title: string;
	blurb: string;
	node: ReactNode;
}

export function StageBoard({
	control,
	stages,
	empty,
}: {
	control: ReactNode;
	stages: BoardStage[];
	/** Shown in place of the stages when there is nothing to draw; the rail stays so the control can undo it. */
	empty?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row">
			<aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[20rem] lg:min-h-0 lg:overflow-y-auto lg:pr-1">
				{control}
			</aside>
			{empty ? <div className="lg:min-h-0 lg:flex-1">{empty}</div> : null}
			<div className={empty ? "hidden" : "grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:grid-rows-2"}>
				{stages.map((s) => (
					<section key={s.n} className="flex min-h-0 flex-col border border-line bg-surface-raised">
						<header className="shrink-0 border-b border-line px-2.5 py-1.5">
							<h2 className="text-[12px] leading-tight text-fg max-md:text-sm">
								<span className="font-mono text-[10px] text-fg-muted max-md:text-xs">stage {s.n}</span> · {s.title}
							</h2>
							{/* One line, clipped, with the full text on hover: the blurbs are worth having and not
							    worth two rows of a height budget that the figures need. A phone stacks the stages
							    and has no hover, so there the blurb wraps in full. */}
							<p className="mt-0.5 truncate text-[10px] leading-snug text-fg-muted max-md:overflow-visible max-md:whitespace-normal max-md:text-xs" title={s.blurb}>
								{s.blurb}
							</p>
						</header>
						<div className="min-h-0 flex-1 p-2">{s.node}</div>
					</section>
				))}
			</div>
		</div>
	);
}

/** A panel in the control rail, matching the stage cells' frame. */
export function RailPanel({ label, title, hint, children }: { label: string; title: string; hint?: string; children: ReactNode }) {
	return (
		<section className="flex shrink-0 flex-col border border-line bg-surface-raised">
			<header className="border-b border-line px-2.5 py-1.5">
				<h2 className="text-[12px] leading-tight text-fg max-md:text-sm">
					<span className="font-mono text-[10px] text-fg-muted max-md:text-xs">{label}</span> · {title}
				</h2>
				{hint ? <p className="mt-0.5 text-[10px] leading-snug text-fg-muted max-md:text-xs">{hint}</p> : null}
			</header>
			<div className="p-2.5">{children}</div>
		</section>
	);
}

/**
 * The caption under a figure, at a FIXED two-line height.
 *
 * The height has to be fixed. Every one of these captions changes with the control above it — the order
 * changes, the class leaves the lattice, the radius grows — and a caption that flips between one line
 * and two resizes the figure it sits under, because the figure is the flexible part of the cell. The
 * picture then jumps while you are working the control, which is the same defect as a drag target that
 * moves under the cursor. Two lines is the budget; anything longer belongs in the article.
 */
export function FigureCaption({ children }: { children: ReactNode }) {
	return (
		<span className="h-[26px] shrink-0 overflow-hidden px-1 font-mono text-[10px] leading-[13px] text-fg-muted max-md:h-auto max-md:min-h-[26px] max-md:text-xs max-md:leading-4">
			{children}
		</span>
	);
}

/** The same fixed height, for the caption rows that carry a button. */
export function FigureControls({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-[26px] shrink-0 items-center justify-between gap-2 px-1 max-md:h-auto max-md:min-h-11">
			{children}
		</div>
	);
}

/**
 * A finger's hit line for one edge of a stage figure. A fingertip is about 40 CSS px across and the edges
 * are 1-2px lines, so on a phone every edge also carries an invisible wide line that takes the same
 * pointer events. It is display:none on desktop, which keeps pointing at the drawn line itself.
 */
export function EdgeHitLine({
	p,
	q,
	width = 18,
	onEnter,
	onPick,
}: {
	p: { x: number; y: number };
	q: { x: number; y: number };
	width?: number;
	onEnter: () => void;
	onPick: () => void;
}) {
	return (
		<line
			className="md:hidden"
			x1={p.x}
			y1={p.y}
			x2={q.x}
			y2={q.y}
			stroke="transparent"
			strokeWidth={width}
			onPointerEnter={onEnter}
			onClick={onPick}
		/>
	);
}

/**
 * One label/value pair of a rail's fact grid (a two-column `dl`). `wide` takes both columns on a phone,
 * where half the rail is too narrow for a rectangle's two sides and the numbers would break mid-digit.
 */
export function Fact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
	return (
		<div className={wide ? "flex flex-col max-md:col-span-2" : "flex flex-col"}>
			<dt className="text-[9px] uppercase tracking-wide text-fg-muted max-md:text-xs">{label}</dt>
			<dd className="break-all text-fg">{value}</dd>
		</div>
	);
}

/** The small bordered text button of a figure's control row (pause, replay, reset), 44px on a phone. */
export const FIGURE_BUTTON =
	"shrink-0 border border-line px-2 py-0.5 text-[10px] text-fg-muted transition-colors hover:text-fg max-md:min-h-11 max-md:px-3 max-md:text-xs";

/**
 * The stages' shared hover, made to survive a finger. On touch the figure's pointerleave fires the
 * moment the finger lifts, so a tap would light an edge for a single frame. On a phone the highlight
 * stays where the last tap put it (a tap on another edge moves it) and the `InspectBar` clears it.
 */
export function useTapHover<K>(set: (key: K | null) => void): (key: K | null) => void {
	const isPhone = useIsPhone();
	return useCallback(
		(key: K | null) => {
			if (key === null && isPhone) return;
			set(key);
		},
		[isPhone, set],
	);
}

/**
 * Phone only: what the last tap is inspecting, pinned above the Browse pill, with a clear button and
 * room for an action that applies it (the polyhedron's "make it the battery"). Inspecting and changing
 * are separate taps, because on desktop they are separate gestures: pointing and clicking.
 */
export function InspectBar({ children, onClear }: { children: ReactNode; onClear: () => void }) {
	return (
		<div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-30 flex items-center gap-2 rounded-xl border border-line bg-surface-raised py-1 pl-3.5 pr-1 shadow-lg md:hidden">
			<div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-fg">{children}</div>
			<button
				type="button"
				onClick={onClear}
				aria-label="Clear the highlight"
				className="flex size-11 shrink-0 items-center justify-center text-fg-muted hover:text-fg"
			>
				<X size={18} />
			</button>
		</div>
	);
}
