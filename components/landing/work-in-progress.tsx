import { cn } from "@/lib/utils/cn";

// "Not built yet" signalling for the coming-soon collection cards (Aperiodic, Substitution).
// Three layers so the state cannot be missed: hazard tape across the media, a caution chip in
// the title row, and the card staying inert (no link, faded media — see CollectionCard).
// The label is real text, not a background image, so screen readers and find-in-page get it too.

/** Barricade tape laid across a card's media box. Expects a `relative` clipping parent. */
export function WipTape({ label = "Work in progress" }: { label?: string }) {
	return (
		<div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
			{/* Wider than the cell and rotated, so both ends run off the edges and get clipped —
			    a band that stopped short of the border would read as a label, not as tape.
			    `shrink-0` is load-bearing: as a flex item the band would otherwise be shrunk back
			    to the cell width, and the rotation would then pull its ends inside the corners. */}
			<div
				className={cn(
					"ta-hazard-stripes w-[170%] shrink-0 -rotate-[9deg] py-[3px] shadow-md",
					"border-y border-caution-ink flex items-center justify-center",
				)}
			>
				<span className="bg-caution text-caution-ink font-mono text-[10px] font-bold uppercase tracking-[0.16em] leading-none px-2 py-[5px] whitespace-nowrap">
					{label}
				</span>
			</div>
		</div>
	);
}

/** The chip that rides in the card's title row, where the completeness badge sits on live cards. */
export function WipBadge({ label = "not available yet" }: { label?: string }) {
	return (
		<span className="shrink-0 bg-caution text-caution-ink border border-caution-ink text-[10px] leading-none px-1.5 py-1 whitespace-nowrap">
			{label}
		</span>
	);
}
