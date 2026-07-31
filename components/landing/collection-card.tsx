import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { WipBadge, WipTape } from "@/components/landing/work-in-progress";

// The collections-grid card frame (spec P3/P4/P8). Media sits slightly desaturated at rest and
// wakes on hover — the only hover motion the landing allows. Coming-soon cards are inert: no
// link, media faded back, hazard tape and a caution chip over the top.

// How many wall cells the card claims. Below `sm` the wall is a single column and everything
// collapses to 1×1 — a 2-wide span there would mint an implicit second column and break the grid.
const SPAN_CLASSES = {
	"1x1": "",
	"2x1": "sm:col-span-2",
	"2x2": "sm:col-span-2 sm:row-span-2",
} as const;

interface CollectionCardProps {
	title: string;
	/** Small line under the title, e.g. "4,596 tilings". */
	subtitle?: string;
	description: string;
	badge?: ReactNode;
	href?: string;
	comingSoon?: boolean;
	/**
	 * The media is a live canvas, not a picture. The card frame then stops being one big link — a drag
	 * inside an anchor navigates on release — and `href` moves onto the caption block below the media,
	 * which becomes the card's whole click target. The media is also left at full strength, since the
	 * rest-state desaturation exists to make a still read as a still.
	 */
	interactive?: boolean;
	/** Cells claimed on the wall (columns × rows). Default 1×1. */
	span?: keyof typeof SPAN_CLASSES;
	children: ReactNode;
}

export function CollectionCard({
	title,
	subtitle,
	description,
	badge,
	href,
	comingSoon,
	interactive,
	span = "1x1",
	children,
}: CollectionCardProps) {
	const captionIsLink = !!interactive && !!href && !comingSoon;

	const caption = (
		<>
			<div className="flex items-baseline justify-between gap-2">
				<h3
					className={cn(
						"text-sm font-semibold text-fg tracking-tight",
						captionIsLink && "transition-colors group-hover/caption:text-accent",
					)}
				>
					{title}
					{/* Inline, not a flex child: the row above aligns on the baseline, and an
					    inline-flex h3 would take its own baseline and drop out of line with the badge. */}
					{captionIsLink ? (
						<ArrowRight aria-hidden="true" className="ml-1 inline w-3.5 h-3.5 align-[-0.15em]" />
					) : null}
				</h3>
				{/* A coming-soon card wears the caution chip whatever the call site passed — there is
				    no completeness to report on a collection that has not been enumerated yet. */}
				{comingSoon ? <WipBadge /> : badge}
			</div>
			{subtitle ? <p className="text-xs font-mono text-fg-muted">{subtitle}</p> : null}
			{/* Exactly two lines, always — `line-clamp-2` caps it and `min-h-[2lh]` floors it. The
			    text block is what the media height is left over from, so a description that wraps to one
			    line on one card and three on its neighbour would hand them different-sized canvases
			    on the same row. Keep descriptions inside two lines at the narrowest 1×1 column (lg, ~230px
			    of text width) or the clamp will eat the tail. */}
			<p className="text-xs text-fg-secondary leading-relaxed line-clamp-2 min-h-[2lh]">{description}</p>
		</>
	);

	const body = (
		<>
			{/* The media takes whatever height the text block leaves, so a 2×2 card gets a big canvas
			    and a 2×1 a wide letterbox — no aspect ratio to fight the row track. */}
			<div className="relative flex-1 min-h-0 bg-surface-raised overflow-hidden">
				{/* The fade lives on an inner layer, not on the media box, so the tape stacked over it
				    stays at full strength — a 65%-opacity hazard stripe is not a hazard stripe. */}
				<div
					className={cn(
						"absolute inset-0",
						comingSoon
							? "opacity-45"
							: interactive
								? ""
								: "saturate-[0.88] opacity-95 transition-[filter,opacity] duration-300 group-hover:saturate-100 group-hover:opacity-100",
					)}
				>
					{children}
				</div>
				{comingSoon ? <WipTape /> : null}
			</div>
			{captionIsLink ? (
				// The caption carries the navigation for an interactive card: the media above it is a
				// canvas the reader drags, and a drag that starts inside an anchor fires the link on
				// release. `group/caption` so the hover treatment is the caption's own, not the card's.
				<Link
					href={href}
					className="group/caption flex flex-col gap-1.5 p-3.5 transition-colors hover:bg-surface-raised/60"
				>
					{caption}
				</Link>
			) : (
				<div className="flex flex-col gap-1.5 p-3.5">{caption}</div>
			)}
		</>
	);

	// Cells of the full-bleed collections wall: no rounding, no own border — the wall's gap-px
	// background draws the hairlines between cells. Opaque bg so those lines stay crisp.
	const frame = cn(
		"ta-wall-cell overflow-hidden group flex flex-col h-full bg-surface transition-colors",
		SPAN_CLASSES[span],
		!comingSoon && !interactive && "hover:bg-surface-raised/50",
	);

	if (href && !comingSoon && !interactive) {
		return (
			<Link href={href} className={frame}>
				{body}
			</Link>
		);
	}
	return <div className={frame}>{body}</div>;
}
