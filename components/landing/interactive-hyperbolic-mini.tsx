"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { HyperbolicCanvas } from "@/components/hyperbolic-canvas";
import { useCardActivation } from "@/lib/hooks/useCardActivation";
import { CardDoneChip } from "@/components/card-done-chip";
import { useInViewMount } from "@/lib/hooks/useInViewMount";
import { useDiskInput } from "@/lib/render/diskInput";
import type { CataloguePatch } from "@/lib/tilings/hyp-developed";

// The Hyperbolic cell's media on the landing wall: the real Poincaré disk, not a baked still.
//
// Unlike the sphere, HyperbolicCanvas does not own its input: on /play the p5 layer writes pan
// and rotation into the global configuration store and the disk reads them there. A landing card must not
// steer that store (it would follow the reader into /play), so its gestures go through useDiskInput
// (lib/render/diskInput.ts) into a per-instance input, handed to the canvas through its `input` prop.
// Same maths, same feel as /play, no shared state.

export function InteractiveHyperbolicMini({ patchId, patch }: { patchId: string; patch?: CataloguePatch }) {
	const { active, activeRef, hostProps, deactivate } = useCardActivation();
	const { ref: mountRef, inView } = useInViewMount();
	const hostRef = useRef<HTMLDivElement | null>(null);
	const { inputRef, handlers, release } = useDiskInput(hostRef, activeRef, inView);

	// Deactivating mid-drag (focus moved away, Esc) must not leave the pan latched to a pointer that is
	// no longer ours.
	useEffect(() => {
		if (!active) release();
	}, [active, release]);

	return (
		<div
			ref={(el) => {
				hostRef.current = el;
				mountRef.current = el;
			}}
			role="application"
			aria-label="Interactive hyperbolic tiling — drag to pan, scroll to rotate"
			{...hostProps}
			{...handlers}
			className={cn("absolute inset-0 outline-none select-none", active ? "cursor-grab" : "cursor-pointer")}
		>
			{inView ? (
				// diskPadPx 0: nothing floats over this canvas, so the rim goes to the cell edge.
				<HyperbolicCanvas tiling={patch ?? patchId} mode="tiling" input={inputRef} diskPadPx={0} />
			) : (
				// Out of view: the disk's silhouette as a quiet skeleton on the sunken plate.
				<div
					aria-hidden="true"
					className="absolute inset-0 m-auto aspect-square h-full rounded-full bg-surface-overlay"
				/>
			)}
			<CardDoneChip active={active} onDone={deactivate} />
		</div>
	);
}
