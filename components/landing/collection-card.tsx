import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

// The collections-grid card frame (spec P3/P4/P8). Media sits slightly desaturated at rest and
// wakes on hover, the only hover motion the landing allows.

// How many grid columns the card claims; rows are always one track tall, so every card on a row
// shares its height and its caption baseline. Below `sm` the grid is a single column and everything
// collapses to 1: a 2-wide span there would mint an implicit second column.
const SPAN_CLASSES = {
	"1x1": "",
	"2x1": "sm:col-span-2",
} as const;

interface CollectionCardProps {
	title: string;
	/** Small mono line under the title: a count or the collection's scope, e.g. "4,596 tilings". */
	subtitle: string;
	description: string;
	/** Completeness chip, floated over the media's top-left corner. */
	badge?: ReactNode;
	href: string;
	/**
	 * The media is a live canvas, not a picture. The card frame then stops being one big link (a drag
	 * inside an anchor navigates on release) and `href` moves onto the caption block below the media,
	 * which becomes the card's whole click target. The media is also left at full strength, since the
	 * rest-state desaturation exists to make a still read as a still.
	 */
	interactive?: boolean;
	/** Columns claimed on the grid. Default 1×1. */
	span?: keyof typeof SPAN_CLASSES;
	children: ReactNode;
}

export function CollectionCard({
	title,
	subtitle,
	description,
	badge,
	href,
	interactive,
	span = "1x1",
	children,
}: CollectionCardProps) {
	// `group/link` sits on whichever element navigates (the frame, or the caption of a live card), so
	// the title and arrow answer the pointer only where a click would actually go somewhere.
	const caption = (
		<>
			<h3 className="h-5 text-base font-semibold text-fg tracking-tight transition-colors group-hover/link:text-accent">
				{title}
				<ArrowRight
					aria-hidden="true"
					className="ml-1 inline w-3 h-3 align-[-0.05em] opacity-50 transition-transform group-hover/link:translate-x-0.5 group-hover/link:opacity-100"
				/>
			</h3>
			<p className="text-xs font-mono text-fg-muted truncate">{subtitle}</p>
			{/* Exactly two lines, always: `line-clamp-2` caps it and `min-h-[2lh]` floors it. The
			    text block is what the media height is left over from, so a description that wraps to one
			    line on one card and three on its neighbour would hand them different-sized canvases
			    on the same row. Keep descriptions inside two lines at the narrowest 1×1 column (lg, ~230px
			    of text width) or the clamp will eat the tail. */}
			<p className="text-[13px] text-fg-secondary leading-snug line-clamp-2 min-h-[2lh]">{description}</p>
		</>
	);

	const body = (
		<>
			{/* The media takes whatever height the text block leaves, so a 2×1 card gets a wide letterbox
			    at the same height as its 1×1 neighbours. Inset as a sunken plate: a canvas that has not
			    mounted yet reads as a quiet empty plate, never a white hole. */}
			<div className="relative flex-1 min-h-0 rounded-surface bg-surface-sunken overflow-hidden">
				<div
					className={cn(
						"absolute inset-0",
						!interactive &&
							"saturate-[0.88] opacity-95 transition-[filter,opacity] duration-300 group-hover:saturate-100 group-hover:opacity-100",
					)}
				>
					{children}
				</div>
				{/* pointer-events-none: on a live card the chip must not swallow the start of a drag. */}
				{badge ? <div className="pointer-events-none absolute top-2 left-2">{badge}</div> : null}
			</div>
			{interactive ? (
				<Link href={href} className="group/link flex flex-col gap-1 px-1 pb-0.5">
					{caption}
				</Link>
			) : (
				<div className="flex flex-col gap-1 px-1 pb-0.5">{caption}</div>
			)}
		</>
	);

	// A white panel with a hairline ring and a 12px inset; hover lifts the ring and adds a soft shadow.
	const frame = cn(
		"group flex flex-col gap-3 h-full p-3 overflow-hidden rounded-surface bg-surface-raised ring-1 ring-line-subtle transition-shadow hover:ring-line hover:shadow-sm",
		SPAN_CLASSES[span],
	);

	if (interactive) return <div className={frame}>{body}</div>;
	return (
		<Link href={href} className={cn(frame, "group/link")}>
			{body}
		</Link>
	);
}
