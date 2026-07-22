import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

// The collections-grid card frame (spec P3/P4/P8). Media sits slightly desaturated at rest and
// wakes on hover — the only hover motion the landing allows. Coming-soon cards are inert:
// dashed border, muted media, no link.

// How many wall cells the card claims. Below `sm` the wall is a single column and everything
// collapses to 1×1 — a 2-wide span there would mint an implicit second column and break the grid.
const SPAN_CLASSES = {
	"1x1": "",
	"2x1": "sm:col-span-2",
	"2x2": "sm:col-span-2 sm:row-span-2",
} as const;

interface CollectionCardProps {
	title: string;
	blurb: string;
	/** Small line under the title, e.g. "4,596 tilings". */
	count?: string;
	badge?: ReactNode;
	href?: string;
	/** Link only the title, keeping the frame plain — for cards whose media is itself interactive. */
	titleHref?: string;
	comingSoon?: boolean;
	/** Cells claimed on the wall (columns × rows). Default 1×1. */
	span?: keyof typeof SPAN_CLASSES;
	children: ReactNode;
}

export function CollectionCard({ title, blurb, count, badge, href, titleHref, comingSoon, span = "1x1", children }: CollectionCardProps) {
	const body = (
		<>
			{/* The media takes whatever height the text block leaves, so a 2×2 card gets a big canvas
			    and a 2×1 a wide letterbox — no aspect ratio to fight the row track. */}
			<div
				className={cn(
					"relative flex-1 min-h-0 bg-surface-raised overflow-hidden",
					comingSoon
						? "opacity-65"
						: "saturate-[0.88] opacity-95 transition-[filter,opacity] duration-300 group-hover:saturate-100 group-hover:opacity-100",
				)}
			>
				{children}
			</div>
			<div className="flex flex-col gap-1.5 p-3.5">
				<div className="flex items-baseline justify-between gap-2">
					<h3 className="text-sm font-semibold text-fg tracking-tight">
						{titleHref ? (
							<Link href={titleHref} className="hover:text-accent transition-colors">
								{title} <span aria-hidden="true">→</span>
							</Link>
						) : (
							title
						)}
					</h3>
					{badge}
				</div>
				{count ? <p className="text-xs font-mono text-fg-muted">{count}</p> : null}
				{/* Exactly two lines, always — `line-clamp-2` caps it and `min-h-[2lh]` floors it. The
				    text block is what the media height is left over from, so a blurb that wraps to one
				    line on one card and three on its neighbour would hand them different-sized canvases
				    on the same row. Keep blurbs inside two lines at the narrowest 1×1 column (lg, ~230px
				    of text width) or the clamp will eat the tail. */}
				<p className="text-xs text-fg-secondary leading-relaxed line-clamp-2 min-h-[2lh]">{blurb}</p>
			</div>
		</>
	);

	// Cells of the full-bleed collections wall: no rounding, no own border — the wall's gap-px
	// background draws the hairlines between cells. Opaque bg so those lines stay crisp.
	const frame = cn(
		"ta-wall-cell overflow-hidden group flex flex-col h-full bg-surface transition-colors",
		SPAN_CLASSES[span],
		!comingSoon && "hover:bg-surface-raised/50",
	);

	if (href && !comingSoon) {
		return (
			<Link href={href} className={frame}>
				{body}
			</Link>
		);
	}
	return <div className={frame}>{body}</div>;
}
