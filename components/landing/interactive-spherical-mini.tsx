"use client";

import { cn } from "@/lib/utils/cn";
import { SphericalCanvas } from "@/components/spherical-canvas";
import { useCardActivation } from "@/lib/hooks/useCardActivation";
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
	const { active, hostProps } = useCardActivation();
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
			// decides to do with the event.
			onPointerDown={(e) => e.currentTarget.focus()}
			className={cn(
				"absolute inset-0 select-none outline-none",
				active ? "cursor-grab" : "cursor-pointer",
			)}
		>
			{/* fitFraction 1: the cell IS the picture, so the solid meets its top and bottom edges — the
			    same framing the disk next to it gets from diskPadPx 0. */}
			{inView ? <SphericalCanvas solidId={solidId} interactive={active} fitFraction={1} /> : null}
		</div>
	);
}
