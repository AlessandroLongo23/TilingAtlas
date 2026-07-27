"use client";

import { cn } from "@/lib/utils/cn";
import { useCardActivation } from "@/lib/hooks/useCardActivation";
import { useFlatCellPreview } from "@/lib/hooks/useFlatCellPreview";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

// The Play cell's media on the landing wall: a live Euclidean patch instead of a baked thumbnail.
// Same GL pipeline and same feel as /play's flat view and the /theory preview cards — they all run
// useFlatCellPreview. Inert until clicked (useCardActivation) so the wheel keeps scrolling the page.

// Px per tile edge at rest, matching the pxPerEdge the baked thumbnail here used before it went live.
// A fixed edge size rather than a period count, because this card shows whatever the atlas dealt this
// request: fitting N periods of a large k=7 cell into it lands a mat of 2-pixel triangles.
const HOME_ZOOM = 44;

export function InteractivePlayMini({ cell }: { cell: TranslationalCellData }) {
	const { active, hostProps } = useCardActivation();
	// homePeriods is unused while homeZoom is set; it is the fallback if that ever comes off.
	const { hostRef, pointerProps } = useFlatCellPreview({ cell, homePeriods: 4, homeZoom: HOME_ZOOM, active });

	return (
		<div
			ref={hostRef}
			role="application"
			aria-label="Interactive tiling — drag to pan, scroll to zoom"
			{...hostProps}
			{...pointerProps}
			className={cn(
				"absolute inset-0 select-none overflow-hidden outline-none",
				active ? "cursor-grab" : "cursor-pointer",
			)}
		/>
	);
}
