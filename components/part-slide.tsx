"use client";

import { Children } from "react";
import { BACKUP_PART, TALK_PARTS, type TalkPart } from "@/lib/defense/parts";
import { cn } from "@/lib/utils/cn";

// The act divider. All five parts in their real order, the one being entered set large and in the
// accent, the rest small and muted — so the slide answers "where are we" and "what is next" at the
// same time, which a bare part title on an empty slide does not.
//
// No `<p>`, `<ol>` or `<li>` anywhere in here on purpose. The deck's typography is a set of
// descendant variants on the markdown wrapper (`[&_p]:…`, `[&_li]:…` in components/slide-markdown.tsx),
// and those outrank anything a custom tag renders inside it; `not-prose` does not cancel them, since
// they are arbitrary variants and not Tailwind Typography. Divs and spans are what stays under our
// own control.
//
// Sized in `cqw` against the card, not in `vh`/`vw` against the viewport, for the same reason
// <method-card> is: the identical markup is rendered full-width on a slide and at ~160px in the
// Esc overview, and a viewport-relative clamp would set both to the same number.

interface PartSlideProps {
	/** `"1"`–`"5"`, or `"backup"`. An unknown key lights nothing, leaving the map with no position. */
	part?: string;
	/** One figure, authored between the tags, shown beside the list. Omit it and the list runs alone. */
	children?: React.ReactNode;
	/**
	 * Jump to another part's divider. Supplied by the deck, which is the only thing that knows what
	 * slide number a part landed on; omitted in the Esc overview, where the whole thumbnail is one
	 * button and a second target inside it would be a nested control.
	 *
	 * Rendered as a `<span role="link">` and not a `<button>` or an `<a>` on purpose: the overview
	 * DOES render this markup inside its own `<button>`, and either of those would be invalid HTML
	 * there whether or not it is clickable.
	 */
	onSelect?: (key: string) => void;
}

export function PartSlide({ part, children, onSelect }: PartSlideProps) {
	const key = part === undefined ? "" : String(part);
	const rows: TalkPart[] = key === BACKUP_PART.key ? [...TALK_PARTS, BACKUP_PART] : TALK_PARTS;
	// Whitespace between the tags arrives as text children; counting it would open an empty column.
	const figure = Children.toArray(children).filter((c) => typeof c !== "string" || c.trim().length > 0);

	return (
		// The list sizes itself against the COLUMN it ends up in, not the slide, which is what keeps
		// the `cqw` type identical whether a divider carries a figure or not.
		<div
			className={cn(
				"not-prose grid w-full items-center gap-[3vw]",
				figure.length > 0 ? "grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]" : "grid-cols-1",
			)}
		>
			<div className="@container flex flex-col gap-[min(2.6cqw,1.5rem)]">
				{rows.map((p) => {
					const here = p.key === key;
					return (
						<div
							key={p.key}
							className={cn(
								"flex items-baseline gap-[min(2.8cqw,1.7rem)] border-l-2 pl-[min(2.8cqw,1.7rem)]",
								here ? "border-accent" : "border-transparent",
							)}
						>
							<span
								className={cn(
									"shrink-0 text-right font-mono tabular-nums",
									// One rail width for every row, so the titles line up whatever numeral
									// sits beside them and the backup row's empty rail still indents.
									"w-[min(7cqw,3.4rem)]",
									here
										? "text-[min(4cqw,2.1rem)] text-accent"
										: "text-[min(2.9cqw,1.5rem)] text-fg-muted opacity-70",
								)}
							>
								{p.numeral}
							</span>
							<span className="min-w-0">
								<span
									role={onSelect ? "link" : undefined}
									tabIndex={onSelect ? 0 : undefined}
									onClick={onSelect ? () => onSelect(p.key) : undefined}
									onKeyDown={
										onSelect
											? (e) => {
													if (e.key === "Enter") {
														e.preventDefault();
														onSelect(p.key);
													}
												}
											: undefined
									}
									className={cn(
										"block leading-tight font-bold tracking-tight text-balance",
										here
											? "text-[min(5.4cqw,3rem)] text-accent"
											: "text-[min(3.2cqw,1.7rem)] text-fg-muted",
										// Nothing marks these as clickable at rest: five underlined titles would be
										// five pieces of chrome on a slide meant to carry one word. The hover is for
										// the presenter, who is the only one in the room holding a pointer.
										onSelect && "cursor-pointer transition-colors hover:text-accent",
									)}
								>
									{p.title}
								</span>
							</span>
						</div>
					);
				})}
			</div>
			{figure.length > 0 && (
				// Capped in viewport HEIGHT, not column width: the column is a fraction of a 69rem frame
				// and would hand a square card ~430px on any projector, which overruns a 720p slide.
				<div className="[&_figure]:mx-auto [&_figure]:max-w-[52vh]">{figure}</div>
			)}
		</div>
	);
}
