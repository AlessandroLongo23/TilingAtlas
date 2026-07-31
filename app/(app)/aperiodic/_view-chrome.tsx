"use client";

// The view block every /aperiodic view carries: how far the view is turned, and how heavy the tile
// outlines are. Every view drives the same interaction layer (lib/hooks/useAperiodicView.ts), so this
// is stated once, not per view.
//
// Both are sliders in /play's Options grammar — same primitive, same label/value row, and rotation
// carries the same `Shift + scroll` hint chip that /play's does, which is where the gesture is
// documented. A sidebar states values you can set; it is not the place to narrate the mouse.
//
// Outlines are a width, not a checkbox: how heavy the tile edges are is the single thing that decides
// whether a deep patch reads as a tiling or as a field of colour, and the right weight depends on the
// patch — a 5-level Penrose wants a hairline where a bare star seed can take a real line. Zero is off,
// so the old toggle is still reachable, at one end of a control that also answers "thinner".

import { Kbd } from "@/components/ui/kbd";
import { Slider } from "@/components/ui/slider";
import type { AperiodicView } from "@/lib/hooks/useAperiodicView";
import { Section } from "./_controls";

/** Outline width in CSS px: the slider's range, and the width a view starts at. The default is
 *  /play's `lineWidth`, so "1.5 px" draws the same line on both pages. */
export const STROKE_WIDTH = { min: 0, max: 3, step: 0.25, def: 1.5 } as const;

/** Tile outline colour, as /play draws it: opaque black. It has to stay opaque: the outline pass
 *  (lib/render/subrosaGL.ts) draws one line per polygon side without deduplicating shared sides, so a
 *  semi-transparent stroke would come out darker on every interior edge than on the patch boundary. */
export const STROKE_RGBA: [number, number, number, number] = [0, 0, 0, 1];
export const STROKE_CSS = "#000";

/** Most an outline may take of a tile edge. Beyond this the tiling reads as a grid of lines with
 *  colour in the gaps, which is what a 10,997-rhombus multigrid at 5 px a tile did at a flat 1.5 px. */
const STROKE_MAX_FRACTION = 0.15;

/**
 * The width to actually draw at this zoom, in CSS px. `zoom` is px per world unit, which in every
 * aperiodic view is px per tile edge.
 *
 * The slider's width is what a tile gets once it is big enough to carry it — from ~10 px an edge up.
 * Below that the line is capped to a fraction of the tile, and under ~2 px an edge it is dropped: at
 * that size neighbouring outlines are closer together than the line is wide, so every width paints
 * the same grey wash and the pattern is gone. Zooming in is what shows you the edges.
 */
export function strokePxAt(width: number, zoom: number): number {
	if (width <= 0 || zoom <= 2.2) return 0;
	return Math.min(width, zoom * STROKE_MAX_FRACTION);
}

export function ViewFooter({
	view,
	strokeWidth,
	onStrokeWidth,
	children,
}: {
	view: Pick<AperiodicView, "rotationDeg" | "setRotation">;
	strokeWidth: number;
	onStrokeWidth: (v: number) => void;
	/** View-specific display options, above the shared ones. */
	children?: React.ReactNode;
}) {
	return (
		<Section label="View">
			{children}
			<Slider
				id="aperiodic-rotation"
				label="Rotation"
				hint={
					<span className="inline-flex items-center gap-1 text-[10px] text-fg-muted whitespace-nowrap">
						<Kbd>Shift</Kbd>
						<span>+ scroll</span>
					</span>
				}
				value={view.rotationDeg}
				onChange={view.setRotation}
				min={0}
				// 359, not 360: the angle wraps, so a slider that ran to 360 would snap its own thumb back
				// to the left the moment the value was published. The wheel's detents are 15°, all in range.
				max={359}
				step={1}
				unit="°"
			/>
			<Slider
				id="aperiodic-outlines"
				label="Tile outlines"
				value={strokeWidth}
				onChange={onStrokeWidth}
				min={STROKE_WIDTH.min}
				max={STROKE_WIDTH.max}
				step={STROKE_WIDTH.step}
				format={(v) => (v === 0 ? "off" : `${v} px`)}
			/>
		</Section>
	);
}

/** The facts block each view ends on: a definition list, no prose. */
export function Details({ rows }: { rows: [string, string][] }) {
	return (
		<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
			{rows.map(([k, v]) => (
				<div key={k} className="contents">
					<dt className="text-fg-muted">{k}</dt>
					<dd className="text-fg-secondary tabular-nums">{v}</dd>
				</div>
			))}
		</dl>
	);
}
