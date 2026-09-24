"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useImmersiveShortcuts } from "@/components/fullscreen-toggle";
import { Section, Segmented } from "./_controls";
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
	const active = APERIODIC_VIEWS.find((v) => v.id === view) ?? APERIODIC_VIEWS[0];

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

	switch (view) {
		case "multigrid":
			return <MultigridView header={header} />;
		case "penrose":
			return <PatchView id="penrose" header={header} />;
		case "hat":
			return <PatchView id="hat" header={header} />;
		case "chair":
			return <PatchView id="chair" header={header} />;
		case "sphinx":
			return <PatchView id="sphinx" header={header} />;
		case "half-hex":
			return <PatchView id="half-hex" header={header} />;
		case "pinwheel":
			return <PatchView id="pinwheel" header={header} />;
		case "half-hex-3":
			return <PatchView id="half-hex-3" header={header} />;
		default:
			return <SubRosaView header={header} />;
	}
}
