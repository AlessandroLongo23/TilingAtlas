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

// The stroke rules live with the patch canvas (lib/hooks/usePatchCanvas.ts), which /heesch draws through too.
export { strokePxAt, STROKE_CSS, STROKE_RGBA, STROKE_WIDTH } from "@/lib/hooks/usePatchCanvas";
import { STROKE_WIDTH } from "@/lib/hooks/usePatchCanvas";

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
						{/* Kbd hides on a phone, which would leave "+ scroll" dangling; a finger twists. */}
						<span className="max-md:hidden">+ scroll</span>
						<span className="md:hidden max-md:text-xs">Twist two fingers</span>
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

/** The facts block each view ends on. Shared with the other shelves. */
export { Details } from "@/components/shelf";
