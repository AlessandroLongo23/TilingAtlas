"use client";

import { useLayoutEffect, useRef, useState } from "react";

// The Part V door: what the Atlas actually holds, as one wall.
//
// The act is "Results, the Atlas and future work", and the single most convincing thing about the
// Atlas is its spread — three geometries, three kinds of decoration in every one of them, and a
// row of tile families that are not regular polygons at all. A count on a slide does not say that;
// sixteen pictures do, in the two seconds the door is up.
//
// The images are captures of the real library shelf (`.card-thumb` on /library, filtered by
// `?geo=…&dec=…&class=…`), not drawings. That matters for a slide about a catalogue: every cell
// here is a thing the platform renders, taken from the platform.
//
// Uncaptioned by design, like every other divider figure. A Poincaré disk, a sphere and a plane are
// not going to be confused with one another from the back of a room, and the point being made is
// coverage, not the identity of any one entry.

/** Row order is the argument: geometry down, decoration across, then the tile families. */
const ROWS: { alt: string; files: string[] }[] = [
	{
		alt: "Euclidean: a tiling, a colouring, an edge pattern, a star tiling",
		files: ["eu-tilings", "eu-colorings", "eu-edges", "star"],
	},
	{
		alt: "Hyperbolic: a tiling, a colouring, an edge pattern, an isotoxal family",
		files: ["hyp-tilings", "hyp-colorings", "hyp-edges", "isotoxal"],
	},
	{
		alt: "Spherical: a tiling, a colouring, an edge pattern, a polyomino tiling",
		files: ["sph-tilings", "sph-colorings", "sph-edges", "polyomino"],
	},
	{
		alt: "Further families: composite convex tiles, scaled tiles, hollow tiles, a k-uniform tiling",
		files: ["convex", "scaled", "hollow", "eu-highk"],
	},
];

/**
 * The wall is 4x4, so it is SQUARE: capping its width caps its height by the same number. That is
 * the whole sizing problem — a fixed `vh` cap has to be pessimistic enough for the shortest window
 * anyone might present from (and for the presenter notes pane, which takes up to 26vh when it is
 * open), which leaves the tiles small on every window that is not that one.
 *
 * So measure instead, the way <slide-grid> does. The height read is the box the slide frame is
 * ALLOWED to fill, never the frame itself: on a divider the frame is `max-h-full` and sized to its
 * content, so reading it would shrink the wall, which would shrink the frame, which would shrink
 * the wall again, all the way down.
 *
 * An inline max-width also outranks the `[&_figure]:max-w-[…]` cap the divider puts on its figure
 * column, which is what lets the wall use the full column when the height allows it. Until the
 * first measurement lands, that cap is the fallback and nothing overflows in the meantime.
 */
function useFitToFrame() {
	const ref = useRef<HTMLElement | null>(null);
	const [cap, setCap] = useState<number | null>(null);

	useLayoutEffect(() => {
		const el = ref.current;
		const frame = el?.closest(".slide-frame") as HTMLElement | null;
		const box = frame?.parentElement;
		if (!el || !frame || !box) return;
		const measure = () => {
			const boxStyle = getComputedStyle(box);
			const frameStyle = getComputedStyle(frame);
			const usable =
				box.clientHeight -
				(parseFloat(boxStyle.paddingTop) || 0) -
				(parseFloat(boxStyle.paddingBottom) || 0) -
				(parseFloat(frameStyle.paddingTop) || 0) -
				(parseFloat(frameStyle.paddingBottom) || 0);
			setCap(Math.max(120, Math.floor(usable)));
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(box);
		return () => ro.disconnect();
	}, []);

	return { ref, cap };
}

export function ShowcaseWall() {
	const { ref, cap } = useFitToFrame();

	return (
		<figure ref={ref} className="not-prose m-0 w-full" style={cap === null ? undefined : { maxWidth: cap }}>
			{/* Hairline gaps, not a 2% lane: sixteen tiles reading as one wall is the point, and the
			    gap is only there so neighbouring tilings do not appear to continue into each other. */}
			<div className="grid grid-cols-4 gap-[3px]">
				{ROWS.flatMap((row) =>
					row.files.map((file, i) => (
						// Each capture is the card's own <canvas> or <img>, never the `.card-thumb`
						// wrapper around it: that wrapper composites a rounded plate under the thumbnail,
						// and screenshotting it bakes the plate's edge into the file. Sixteen of those is a
						// grid of little frames, which is not what a wall looks like. The files are then
						// squared and cropped 6% in from every edge (scripts, one-off), which is what finally
						// took the rules off: a CSS overscan could not, since the artefact turned out to sit
						// inside the bitmap rather than on its boundary.
						<div key={file} className="overflow-hidden">
							{/* A plain <img>, deliberately outside the deck's figure styling: that rule
							    (components/slide-markdown.tsx) puts every image on a padded white plate with
							    a 46vh cap, right for a TikZ export on one slide and wrong for sixteen tiles
							    that have to meet edge to edge. */}
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={`/defense/figures/showcase/${file}.png`}
								alt={i === 0 ? row.alt : ""}
								className="block aspect-square w-full object-cover"
							/>
						</div>
					)),
				)}
			</div>
		</figure>
	);
}
