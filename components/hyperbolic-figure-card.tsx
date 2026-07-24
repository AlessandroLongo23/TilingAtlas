"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { HyperbolicDevelopedThumbnail } from "@/components/hyperbolic-developed-thumbnail";
import type { CataloguePatch } from "@/lib/render/hyperbolicDevelopedDraw";

// A hyperbolic tiling as a FIGURE in a theory article: the Poincaré disk, a caption naming what the
// reader is looking at, and a link into /play where the same tiling is interactive.
//
// Deliberately static, unlike the Euclidean <tiling-card>. A hyperbolic view is a per-pixel WebGL2
// reduction with its own context, and an article embeds several — the interactive version belongs on
// /play, which is one tiling at a time and already built for it. Here the disk is baked once.
//
// The patch record arrives from the server route (see app/(app)/theory/hyperbolic/page.tsx), so the
// page ships only the few tilings it shows rather than the whole developed catalogue.
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
		// The article's prose CSS styles every <img> as an inline illustration (one-third width, centred,
		// with its own border and rounding — see markdown-renderer). A rendered Poincaré disk is the
		// card's content, not an illustration inside it, so those rules are overridden locally rather
		// than loosened globally, where they would change every plain markdown image on every article.
		<figure className="not-prose m-0 flex flex-col border border-line bg-surface-raised [&_img]:!m-0 [&_img]:!w-full [&_img]:!rounded-none [&_img]:!border-0 [&_img]:!bg-transparent">
			<div className="relative aspect-square bg-surface-raised">
				<HyperbolicDevelopedThumbnail patch={patchId} data={patch} size={420} />
				<Link
					href={`/play?source=reference&tiling=${encodeURIComponent(patchId)}`}
					aria-label={`Open ${patch.config} in Play`}
					className="absolute right-2 top-2 flex items-center gap-1 border border-line bg-surface-overlay/85 px-2 py-1 text-[10px] text-fg-muted opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover:opacity-100 [figure:hover_&]:opacity-100"
				>
					Open in Play <ArrowUpRight size={11} />
				</Link>
			</div>
			<figcaption className="flex flex-col gap-1 border-t border-line px-3 py-2.5">
				{label ? <span className="font-mono text-xs text-fg">{label}</span> : null}
				{caption ? <span className="text-[11px] leading-snug text-fg-muted">{caption}</span> : null}
			</figcaption>
		</figure>
	);
}
