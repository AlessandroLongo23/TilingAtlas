"use client";

import type { ReactNode } from "react";

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

export function StageBoard({ control, stages }: { control: ReactNode; stages: BoardStage[] }) {
	return (
		<div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row">
			<aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[20rem] lg:min-h-0 lg:overflow-y-auto lg:pr-1">
				{control}
			</aside>
			<div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:grid-rows-2">
				{stages.map((s) => (
					<section key={s.n} className="flex min-h-0 flex-col border border-line bg-surface-raised">
						<header className="shrink-0 border-b border-line px-2.5 py-1.5">
							<h2 className="text-[12px] leading-tight text-fg">
								<span className="font-mono text-[10px] text-fg-muted">stage {s.n}</span> · {s.title}
							</h2>
							{/* One line, clipped, with the full text on hover: the blurbs are worth having and not
							    worth two rows of a height budget that the figures need. */}
							<p className="mt-0.5 truncate text-[10px] leading-snug text-fg-muted" title={s.blurb}>
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
				<h2 className="text-[12px] leading-tight text-fg">
					<span className="font-mono text-[10px] text-fg-muted">{label}</span> · {title}
				</h2>
				{hint ? <p className="mt-0.5 text-[10px] leading-snug text-fg-muted">{hint}</p> : null}
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
		<span className="h-[26px] shrink-0 overflow-hidden px-1 font-mono text-[10px] leading-[13px] text-fg-muted">
			{children}
		</span>
	);
}

/** The same fixed height, for the caption rows that carry a button. */
export function FigureControls({ children }: { children: ReactNode }) {
	return <div className="flex h-[26px] shrink-0 items-center justify-between gap-2 px-1">{children}</div>;
}
