"use client";

// The six obligations as six boxes, five of them filled.
//
// Drawn for the Part IV door, where every other divider reuses a figure from the act behind it and
// this one had nothing square to reuse: the proof's own slide is a table, and a table read at a
// glance from the back of a room is a grey rectangle. Uncaptioned, like every divider figure — the
// mark is the claim (six obligations, five of them new), said before the table arrives.
//
// Numbering matches the table on "The proof splits into six obligations". Four is Čtrnáct's, the
// single theorem their paper proves, and it is the one drawn hollow.

const INK = "var(--color-text-primary)";
const SOFT = "var(--color-border-default)";
const MUTED = "var(--color-text-muted)";
const TINT = "var(--color-accent-subtle)";

/** Which of the six is not mine. */
const THEIRS = 4;

const COLS = 3;
// Sized so three boxes plus their gaps span the viewBox: the panel already pads by 6%, and a mark
// that leaves a margin inside that padding reads as a small graphic in a big frame from the back.
const BOX = 29;
const GAP = 6;

export function ObligationsMark() {
	const width = COLS * BOX + (COLS - 1) * GAP;
	const rows = 2;
	const height = rows * BOX + (rows - 1) * GAP;
	const x0 = (100 - width) / 2;
	const y0 = (100 - height) / 2;

	return (
		<figure className="not-prose m-0 flex flex-col">
			{/* No border and no background: the mark is line work on the slide, like every other
			    divider figure that draws itself instead of rendering a tiling. */}
			<div className="aspect-square w-full p-[6%]">
				<svg viewBox="0 0 100 100" role="img" aria-label="Six obligations, five of them new" className="h-full w-full">
					{Array.from({ length: 6 }, (_, i) => {
						const n = i + 1;
						const mine = n !== THEIRS;
						const x = x0 + (i % COLS) * (BOX + GAP);
						const y = y0 + Math.floor(i / COLS) * (BOX + GAP);
						return (
							<g key={n}>
								<rect
									x={x}
									y={y}
									width={BOX}
									height={BOX}
									rx={2.5}
									fill={mine ? TINT : "none"}
									stroke={mine ? INK : SOFT}
									strokeWidth={mine ? 1.8 : 1.3}
									strokeDasharray={mine ? undefined : "3.2 2.6"}
								/>
								<text
									x={x + BOX / 2}
									y={y + BOX / 2 + 4.6}
									textAnchor="middle"
									fontSize={13}
									fontFamily="var(--font-mono, monospace)"
									fill={mine ? INK : MUTED}
									fontWeight={mine ? 600 : 400}
								>
									{n}
								</text>
							</g>
						);
					})}
				</svg>
			</div>
		</figure>
	);
}
