"use client";

import { useId } from "react";
import { METHOD_FIGURES } from "@/components/method-card";

// The Part II door: the four abandoned architectures threaded onto one dashed sine, in the order
// they were tried.
//
// The curve is the argument. Four boxes in a grid would say "here are four things"; a line that
// wanders through all four and leaves the frame says "this took a year and it went somewhere" —
// which is what the act is about, and it saves the words on a slide that has none.
//
// The drawings are the same components `<method-card>` uses (METHOD_FIGURES), scaled into place, so
// the room recognises them again on the strip two slides later. No panel and no border: the
// schematics have no background of their own, and a box round each would fight the curve.

const MUTED = "var(--color-text-muted)";

/** Edge of one drawing, in viewBox units. */
const SIZE = 27;
/** Radius of the hole each drawing punches in the curve. */
const HOLE = SIZE * 0.54;

/**
 * Half the peak-to-peak width of the wave, about the vertical centre line.
 *
 * Deliberately much wider than a drawing is: a sine does all of its bending at the turns, and the
 * turns are where the drawings sit, so a narrow wave shows nothing but its straight middles and
 * reads as a zigzag of ruled lines (measured — the first version had amplitude 28 against a
 * drawing of 35, which left 7% of the visible arc's slope variation on screen).
 */
const AMPLITUDE = 36;
/** Where the first drawing sits, which is the wave's first extreme. */
const FIRST = 15;
/** Extreme to extreme, so the four drawings land on four consecutive turning points. */
const HALF_PERIOD = 22;

/**
 * The wave, as a function of height: x = 50 − A·cos(π(y − FIRST)/HALF_PERIOD).
 *
 * Written out and sampled instead of drawn as bezier segments. Hand-placed control points is how
 * the first two attempts got a curve that crossed itself and curled at the turns; a sampled
 * cosine cannot do either, and the four extremes are exactly where the drawings go by construction.
 */
function waveX(y: number): number {
	return 50 - AMPLITUDE * Math.cos(((y - FIRST) * Math.PI) / HALF_PERIOD);
}

/** In the order they were built, which is the order the strip on "The methods I explored" uses. */
const NODES = ["growth", "wallpaper", "torus", "delaney"].map((fig, i) => {
	const cy = FIRST + i * HALF_PERIOD;
	return { fig, cx: waveX(cy), cy };
});

// Sampled from above the frame to below it, so the wave reads as something passing through rather
// than something that starts and stops here.
const CURVE = Array.from({ length: 181 }, (_, i) => {
	const y = -4 + (i * 108) / 180;
	return `${i === 0 ? "M" : "L"} ${waveX(y).toFixed(2)},${y.toFixed(2)}`;
}).join(" ");

export function FailedPath() {
	// The deck renders this markup twice at once — the slide, and its Esc-overview thumbnail — and
	// two masks sharing an id would leave the second one referencing the first.
	const maskId = `failed-path-${useId()}`;

	return (
		<figure className="not-prose m-0 w-full">
			<svg
				viewBox="0 0 100 100"
				role="img"
				aria-label="Four abandoned architectures on one path"
				className="block aspect-square w-full"
			>
				<defs>
					{/* A mask, not a painted rectangle behind each drawing: a rectangle needs a fill,
					    any fill differs from whatever the slide's background happens to be, and four
					    grey squares is the boxing this figure exists to avoid.
					    Round, and not the drawing's bounding box: at a turn the curve passes through
					    the box's corners, where none of these drawings puts any ink, and squaring the
					    hole there swallows the only part of the bend there was room to show. */}
					<mask id={maskId}>
						<rect x={-6} y={-6} width={112} height={112} fill="white" />
						{NODES.map(({ fig, cx, cy }) => (
							<circle key={fig} cx={cx} cy={cy} r={HOLE} fill="black" />
						))}
					</mask>
				</defs>

				<path
					d={CURVE}
					mask={`url(#${maskId})`}
					fill="none"
					stroke={MUTED}
					strokeWidth={1.5}
					strokeDasharray="4 3.6"
					strokeLinecap="round"
				/>

				{NODES.map(({ fig, cx, cy }) => {
					const Figure = METHOD_FIGURES[fig];
					return (
						<g key={fig} transform={`translate(${cx - SIZE / 2},${cy - SIZE / 2}) scale(${SIZE / 100})`}>
							<Figure />
						</g>
					);
				})}
			</svg>
		</figure>
	);
}
