"use client";

import { cn } from "@/lib/utils/cn";
import { SphericalCanvas } from "@/components/spherical-canvas";
import { useCardActivation } from "@/lib/hooks/useCardActivation";
import { CardDoneChip } from "@/components/card-done-chip";
import { useInViewMount } from "@/lib/hooks/useInViewMount";

// The Spherical cell's media on the landing wall: the real /play sphere, not a baked still. It needs
// almost nothing added — SphericalCanvas owns its own input (ArcballControls: drag spins the free
// quaternion trackball, wheel dollies) — so this wrapper only decides WHEN that input is live.
//
// Inert until clicked, like every other live cell on the wall. That gate is what keeps the landing
// page scrollable: ArcballControls preventDefaults every wheel event it acts on, so a permanently
// live sphere would stop the page dead the moment the pointer crossed it, and its `touch-action:
// none` would eat the swipe on a phone.

export function InteractiveSphericalMini({ solidId }: { solidId: string }) {
	const { active, hostProps, deactivate } = useCardActivation();
	// The context is released when the card scrolls away: the wall carries three live canvases on top
	// of the shared thumbnail renderers, and browsers cap live WebGL contexts per document.
	const { ref, inView } = useInViewMount();

	return (
		<div
			ref={ref}
			role="application"
			aria-label="Interactive spherical tiling — drag to rotate, scroll to zoom"
			{...hostProps}
			// The canvas is a child and not itself focusable, so a click here would normally focus this
			// host anyway; doing it explicitly makes activation independent of what ArcballControls
			// decides to do with the event. A finger activates on a completed tap instead (useCardActivation),
			// or every scroll swipe that starts here would.
			onPointerDown={(e) => e.pointerType !== "touch" && e.currentTarget.focus()}
			className={cn(
				"absolute inset-0 select-none outline-none",
				active ? "cursor-grab" : "cursor-pointer",
			)}
		>
			{/* fitFraction 0.85: the perspective camera draws near vertices larger than the bounding
			    sphere, so a full-height fit let some solids spill past the plate. */}
			{inView ? (
				<SphericalCanvas solidId={solidId} interactive={active} fitFraction={0.85} />
			) : (
				// Out of view: the ball's silhouette as a quiet skeleton on the sunken plate.
				<div aria-hidden="true" className="absolute inset-0 m-auto h-full aspect-square rounded-full bg-surface-overlay" />
			)}
			<CardDoneChip active={active} onDone={deactivate} />
		</div>
	);
}
