"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useImmersiveShortcuts } from "@/components/fullscreen-toggle";
import { PeekTitle } from "@/components/dock-peek";
import { useMobileSheet } from "@/stores/mobileSheet";
import { cn } from "@/lib/utils/cn";
import { AperiodicPeek, Section, Segmented } from "./_controls";
import { SubRosaView } from "./_subrosa-view";
import { MultigridView } from "./_multigrid-view";
import { PatchView } from "./_patch-view";
import { APERIODIC_VIEWS, DEFAULT_VIEW, isViewId, type AperiodicViewId } from "./_views";

// The aperiodic shelf. Every construction here refuses a translational cell, which is exactly what
// the rest of the atlas is built on — so each arrives as its own engine, not as a lattice of
// one cell, and the page is a switch over them. They share the interaction layer
// (lib/hooks/useAperiodicView.ts): drag, wheel, Shift+wheel, right-click mean the same in all of them.
//
// Only the selected view is mounted. Each owns a WebGL2 context, and a canvas can hold exactly one
// context type, so keeping the others alive would cost GPU state for panels nobody is looking at.
// Switching therefore resets that view's controls; the URL carries the view, not its parameters.
//
// The switcher is a title block (the active view and one line about it) over one segmented control
// listing every construction, three to a row so the nine fill three full rows. Each cell's tooltip names its construction group.

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

	useImmersiveShortcuts();

	// A pick at full snap drops the sheet to half, as on the other dock pages. The new view mounts its own
	// sidebar, which starts at peek, so the drop waits a task for that mount (run twice under StrictMode).
	const pickedAtFull = useRef(false);
	useEffect(() => {
		if (!pickedAtFull.current) return;
		pickedAtFull.current = false;
		const t = window.setTimeout(() => useMobileSheet.getState().setSnap("half"));
		return () => window.clearTimeout(t);
	}, [view]);
	const active = APERIODIC_VIEWS.find((v) => v.id === view) ?? APERIODIC_VIEWS[0];

	// The phone's peek row: the view's name and line as plain text, which is where a thumb grabs the
	// sheet, and a compact Construction button at the right. The button is a native select under a pill:
	// a tap opens the system picker with all nine at once, which a 64px row could never lay out as
	// buttons. It stays live at every snap, so on a phone it replaces the sheet's title block and
	// Construction grid, which would say the same things again just below it.
	const peek = (
		<>
			<PeekTitle title={active.label} sub={`${active.group} · ${active.blurb}`} />
			<div className="relative shrink-0">
				<select
					value={view}
					onChange={(e) => {
						pickedAtFull.current = useMobileSheet.getState().snap === "full";
						setView(e.target.value as AperiodicViewId);
					}}
					aria-label="Construction"
					className="peer absolute inset-0 size-full cursor-pointer opacity-0"
				>
					{APERIODIC_VIEWS.map((v) => (
						<option key={v.id} value={v.id}>
							{v.label}
						</option>
					))}
				</select>
				<span
					aria-hidden
					className="pointer-events-none flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface-raised pl-4 pr-3 text-sm font-medium text-fg shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50"
				>
					Construction
					<ChevronDown size={16} className="text-fg-muted" />
				</span>
			</div>
		</>
	);

	const header = (
		<>
			<div className="flex flex-col gap-1">
				<h1 className="text-[15px] font-semibold leading-tight text-fg">{active.label}</h1>
				<p className="text-xs text-fg-muted truncate" title={active.blurb}>
					{active.group} · {active.blurb}
				</p>
			</div>
			<Section label="Construction">
				<Segmented
					options={APERIODIC_VIEWS.map(({ id, label, group }) => ({ v: id, label, title: group }))}
					value={view}
					onChange={(v) => setView(v as AperiodicViewId)}
					cols={3}
				/>
			</Section>
		</>
	);

	return (
		<AperiodicPeek.Provider value={peek}>
			{/* The box every view fills. The multigrid is two panels stacked on a phone, and a sheet over the lower one would leave
			    the duality with one side hidden, so there the box stops at the top of the sheet: at half
			    height both panels share what is left. Capped at half the screen, so the full snap (which
			    covers the canvas anyway) does not squeeze the panels to nothing. */}
			<div
				className={cn(
					"flex-1 min-h-0 flex",
					view === "multigrid" && "max-md:pb-[min(var(--sheet-offset,0px),50dvh)]",
				)}
			>
				{view === "multigrid" ? (
					<MultigridView header={header} />
				) : view === "subrosa" ? (
					<SubRosaView header={header} />
				) : (
					<PatchView id={view} header={header} />
				)}
			</div>
		</AperiodicPeek.Provider>
	);
}
