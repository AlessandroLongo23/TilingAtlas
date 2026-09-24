"use client";

import type { ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { PAINT_SCOPES, type PaintScope, type Rejection } from "@/lib/studio/types";
import { useStudio } from "@/stores/studio";
import { cn } from "@/lib/utils/cn";

// The editor's readout: what the period cell currently contains, and why the last gesture did nothing.
//
// Chrome and placement follow components/isohedral-edges-controls.tsx, the other panel that sits in this
// corner of the /play canvas, so two shelves' overlays do not read as two designs.
//
// EVERY NUMBER IS A PROP. The counts come off the built patch, which the canvas owns; recomputing them
// here would be a second answer to the same question, and the two would drift.
//
// The panel MINIMIZES BUT NEVER CLOSES. Collapsed, the chip is still the affordance that brings it back,
// and it still carries a rejection: the editor blocks a gesture instead of flagging a bad result, so
// this panel is the only place a refused drag is ever explained. A closable panel could hide that
// explanation for good.

/** The gloss the paint scopes already carry, so the inspector's class rows and the palette strip's scope
 *  chips cannot end up describing the same word differently. */
const scopeHelp = (value: PaintScope): string | undefined =>
	PAINT_SCOPES.find((s) => s.value === value)?.help;

const RANKS_HELP =
	"What a merged piece is: bounded, a strip repeating in one direction, or spread over the plane. A strip or an unbounded piece is not a tile, which is why the merge tool refuses the drag that would make one.";

function Row({ label, value, title }: { label: string; value: ReactNode; title?: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3" title={title}>
			<span className="text-fg-secondary">{label}</span>
			<span className="font-mono tabular-nums text-fg">{value}</span>
		</div>
	);
}

interface StudioInspectorProps {
	tileCount: number;
	faceCount: number;
	vertexCount: number;
	edgeCount: number;
	ranks: { finite: number; strips: number; unbounded: number };
	shapeClasses: number;
	orientationClasses: number;
	/** Set while a vertex is grabbed under Wallpaper mode: the site symmetry constraining it. */
	grabbedSiteSymmetry?: string | null;
	/** Reason the last gesture was refused. */
	rejection?: Rejection | null;
	/** Cut in progress: the labels of the points clicked so far, e.g. ["v3", "c1"]. */
	cutLabels?: string[];
}

export function StudioInspector({
	tileCount,
	faceCount,
	vertexCount,
	edgeCount,
	ranks,
	shapeClasses,
	orientationClasses,
	grabbedSiteSymmetry,
	rejection,
	cutLabels,
}: StudioInspectorProps) {
	const open = useStudio((s) => s.inspectorOpen);
	const setOpen = (next: boolean) => useStudio.getState().set({ inspectorOpen: next });

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-expanded={false}
				className={cn(
					"absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs backdrop-blur transition-colors",
					// A refusal survives the collapse, in the colour it would have had in the panel: minimizing
					// the panel must not be a way to lose the one sentence saying why a drag did nothing.
					rejection
						? "border-danger/40 bg-danger-subtle text-danger"
						: "border-line bg-surface-overlay/95 text-fg-secondary hover:text-fg",
				)}
			>
				{rejection ? <AlertTriangle size={12} /> : null}
				<span className="max-w-[16rem] truncate">{rejection ? rejection.message : "Cell"}</span>
				<ChevronUp size={12} />
			</button>
		);
	}

	return (
		<div className="absolute bottom-3 left-3 z-20 flex w-60 flex-col gap-1 rounded-md bg-surface-overlay/95 p-3 text-xs backdrop-blur">
			<div className="flex items-center justify-between gap-4 pb-1">
				<span className="font-mono text-fg-secondary">Cell</span>
				<button
					type="button"
					onClick={() => setOpen(false)}
					aria-label="Minimize the inspector"
					className="text-fg-muted transition-colors hover:text-fg"
				>
					<ChevronDown size={14} />
				</button>
			</div>

			{/* The refusal leads the panel, in danger ink, because it is the only report a blocked gesture
			    makes: there is no red outline on the canvas to interpret and nothing else changed. */}
			{rejection ? (
				<p className="flex items-start gap-1.5 rounded border border-danger/40 bg-danger-subtle p-1.5 leading-snug text-danger">
					<AlertTriangle size={13} className="mt-px shrink-0" />
					<span>{rejection.message}</span>
				</p>
			) : null}

			{/* A constrained vertex looks like a stuck one. Saying which element holds it turns a bug report
			    into an explanation. */}
			{grabbedSiteSymmetry ? (
				<p className="leading-snug text-fg-secondary">
					Site symmetry <span className="font-mono text-fg">{grabbedSiteSymmetry}</span>: this vertex
					sits on a symmetry element, so it only moves where that element allows. On a mirror it slides
					along the mirror; on a rotation centre it cannot move at all.
				</p>
			) : null}

			{cutLabels?.length ? (
				<p className="leading-snug text-fg-secondary">
					Cut <span className="font-mono text-fg">{cutLabels.join(" → ")}</span>. It commits once both
					ends sit on the boundary of one face.
				</p>
			) : null}

			<Row label="Tiles" value={tileCount} title="Connected pieces in the period." />
			<Row label="Faces" value={faceCount} title="Before merging: the faces the pieces are made of." />
			<Row label="Vertices" value={vertexCount} />
			<Row label="Edges" value={edgeCount} />

			<div className="flex flex-col gap-1 border-t border-line pt-1.5" title={RANKS_HELP}>
				<span className="text-[10px] uppercase tracking-wide text-fg-muted">Ranks</span>
				<Row label="Finite" value={ranks.finite} />
				<Row label="Strips" value={ranks.strips} />
				<Row label="Unbounded" value={ranks.unbounded} />
			</div>

			<div className="flex flex-col gap-1 border-t border-line pt-1.5">
				<Row label="Shape classes" value={shapeClasses} title={scopeHelp("shape")} />
				<Row label="Orientation classes" value={orientationClasses} title={scopeHelp("orientation")} />
			</div>
		</div>
	);
}
