"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { InteractiveHyperbolicMini } from "@/components/landing/interactive-hyperbolic-mini";
import type { CataloguePatch } from "@/lib/tilings/hyp-developed";

// A hyperbolic tiling as a FIGURE in a theory article: the live Poincaré disk with /play's controls
// (drag pans, wheel rotates, click folds a tile to the centre, right-click recentres), a caption naming
// what the reader is looking at, and a link into /play. Like the Euclidean <tiling-card> it waits for a
// click before it takes the wheel, and it mounts its WebGL context only while on screen.
//
// The patch record arrives from the server route (see app/(app)/theory/hyperbolic/page.tsx), so the
// page ships only the few tilings it shows, not the whole developed catalogue.
interface HyperbolicFigureCardProps {
	patchId: string;
	patch: CataloguePatch;
	/** Caption under the disk — say what this figure demonstrates, not just its name. */
	caption?: string;
	/** Small monospace label above the caption, e.g. the vertex configuration. */
	label?: string;
}

export function HyperbolicFigureCard({ patchId, patch, caption, label }: HyperbolicFigureCardProps) {
	return (
		<figure className="not-prose m-0 flex flex-col border border-line bg-surface-raised">
			<div className="relative aspect-square bg-surface-raised">
				<InteractiveHyperbolicMini patchId={patchId} patch={patch} />
				<Link
					href={`/play?source=reference&tiling=${encodeURIComponent(patchId)}`}
					aria-label={`Open ${patch.config} in Play`}
					className="absolute top-2 right-2 z-10 flex items-center gap-1 border border-line bg-surface-overlay/85 px-2 py-1 text-[10px] text-fg-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 max-md:min-h-11 max-md:px-3 max-md:text-xs max-md:opacity-100 [figure:hover_&]:opacity-100"
				>
					Open in Play <ArrowUpRight size={11} />
				</Link>
			</div>
			<figcaption className="flex flex-col gap-1 border-t border-line px-3 py-2.5">
				{label ? <span className="font-mono text-xs text-fg">{label}</span> : null}
				{caption ? <span className="text-[11px] leading-snug text-fg-muted max-md:text-[13px]">{caption}</span> : null}
			</figcaption>
		</figure>
	);
}
