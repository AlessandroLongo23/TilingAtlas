"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { SubRosaView } from "./_subrosa-view";
import { MultigridView } from "./_multigrid-view";
import { PatchView } from "./_patch-view";
import { APERIODIC_VIEWS, DEFAULT_VIEW, groupedViews, isViewId, type AperiodicViewId } from "./_views";

// The aperiodic shelf. Every construction here refuses a translational cell, which is exactly what
// the rest of the atlas is built on — so each arrives as its own engine, not as a lattice of
// one cell, and the page is a switch over them. They share the interaction layer
// (lib/hooks/useAperiodicView.ts): drag, wheel, Shift+wheel, right-click mean the same in all of them.
//
// Only the selected view is mounted. Each owns a WebGL2 context, and a canvas can hold exactly one
// context type, so keeping the others alive would cost GPU state for panels nobody is looking at.
// Switching therefore resets that view's controls; the URL carries the view, not its parameters.
//
// The switcher below is built as bare wall cells (see AperiodicSidebar): a metadata cell carrying the
// active view's name and one line about it, then one segment row per construction group. That is the
// /play sidebar's own shape — selected-thing metadata over segmented rows — so the two pages read as
// one piece of software, not two. Cells are text only: a flower, a hexagon and a snowflake say
// nothing a reader can act on about which construction they pick, and next to `Segmented`'s bare-label
// cells further down the same panel they made the switcher look like a different control.

export function AperiodicClient() {
	const searchParams = useSearchParams();
	// Read the URL once on mount, write-only afterwards (replaceState) — the /colors pattern.
	const [view, setView] = useState<AperiodicViewId>(() => {
		const v = searchParams.get("view");
		return isViewId(v) ? v : DEFAULT_VIEW;
	});

	useEffect(() => {
		const s = view === DEFAULT_VIEW ? "" : `?view=${view}`;
		window.history.replaceState(null, "", `${window.location.pathname}${s}`);
	}, [view]);

	const active = APERIODIC_VIEWS.find((v) => v.id === view) ?? APERIODIC_VIEWS[0];

	const header = (
		<>
			{/* Metadata cell, as /play's NavHeader: what is selected, and what it is. */}
			<div className="ta-wall-cell bg-surface-chrome px-3 py-2.5 flex flex-col gap-1">
				<span className="text-xs font-mono text-fg-secondary">
					{active.label} · {active.group.toLowerCase()}
				</span>
				<span className="text-[10px] font-mono text-fg-disabled truncate" title={active.blurb}>
					{active.blurb}
				</span>
			</div>

			{/* One segment row per construction group — the same control at two altitudes, as /play's
			    geometry-then-decoration rows. The row IS the grouping; the group's name is not repeated on
			    each of its cells (three cells all reading "Substitution" is noise), it rides on the
			    metadata cell above, which names the active view's group. Adding a group costs one row. */}
			{groupedViews().map(({ group, views }) => (
				<div
					key={group}
					className="grid gap-px"
					style={{ gridTemplateColumns: `repeat(${Math.max(views.length, 1)}, minmax(0, 1fr))` }}
				>
					{views.map(({ id, label }) => {
						const on = view === id;
						return (
							<button
								key={id}
								type="button"
								aria-pressed={on}
								onClick={() => setView(id)}
								title={group}
								className={cn(
									"ta-tab ta-wall-cell flex cursor-pointer items-center justify-center px-1 py-2.5 transition-colors",
									"focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg",
									on ? "text-fg" : "text-fg-muted hover:text-fg-secondary",
								)}
							>
								<span className="text-xs font-medium leading-tight text-center text-balance">{label}</span>
							</button>
						);
					})}
				</div>
			))}
		</>
	);

	switch (view) {
		case "multigrid":
			return <MultigridView header={header} />;
		case "penrose":
			return <PatchView id="penrose" header={header} />;
		case "hat":
			return <PatchView id="hat" header={header} />;
		default:
			return <SubRosaView header={header} />;
	}
}
