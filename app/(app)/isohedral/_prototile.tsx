"use client";

// The prototile itself, drawn with its edges named, above the sliders that bend them.
//
// The /pentagons shelf gets this for free: five sliders named A…E, five corners labelled A…E. Here the
// controls are named after Tactile's edge SHAPES, and a slider labelled "b · U" is unreadable without
// knowing which of the tile's three to six boundary edges is b — worse, several of them usually are,
// which is the whole content of the type. IH02's edge word is aabccB: dragging a moves two of its six
// edges and c moves two more, and until you can see which, the tile just changes in a way you did not
// ask for.
//
// What the drawing carries beyond the letters:
//   · the straight polygon underneath, dashed, so a bowed edge is visibly a deformation of a chord and
//     the 3-to-6 tiling vertices stay locatable when the boundary bulges past them;
//   · the edge's own symmetry element, since that is what J/U/S/I MEAN — a ring at a 2-fold centre, a
//     line where a mirror crosses. The slider hints say it in words; this says it in place.
//
// SVG, not a canvas: a six-sided outline with a handful of labels, redrawn only when a slider moves,
// and it has to take its colours from the theme. The page already holds one WebGL context.

import { useId } from "react";
import type { IsohedralCell } from "@/lib/isohedral/build";
import type { IsohedralTypeInfo } from "@/lib/isohedral/catalogue";
import type { TactilePoint } from "@/lib/isohedral/vendor/tactile";

const BOX = 132;
const PAD = 20;

/**
 * Drawn width, in CSS px.
 *
 * Capped, unlike /pentagons' full-width version, because this sidebar has already spent its height on
 * two filter rows and a scrolling 93-entry grid. A full-width drawing here pushed the very sliders it
 * explains below the fold, which is the failure the shelf's two-region split exists to prevent.
 */
const WIDTH_PX = 168;

/** Label offset from the edge, and the symmetry marks' half-length, in viewBox units. */
const LABEL_PUSH = 10;
const MARK = 4;

export function PrototileInspector({
	info,
	cell,
}: {
	info: IsohedralTypeInfo;
	cell: IsohedralCell;
}) {
	const uid = useId();

	// Frame the outline AND the straight polygon.
	//
	// Both, because neither contains the other: an edge can bow outward past its chord or inward past it,
	// and the dashed polygon has to stay inside the box either way. Fitting the drawn outline alone would
	// also hide half of what a bulge slider does — the drawing would rescale as the edge bowed, shrinking
	// the tile by roughly what the bow gained. Reserving room for the widest possible bow up front was
	// worse still: at rest, which is where the tile is read, it left the drawing half empty.
	let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
	for (const p of [...cell.prototile, ...cell.tilingVertices]) {
		if (p.x < minx) minx = p.x;
		if (p.x > maxx) maxx = p.x;
		if (p.y < miny) miny = p.y;
		if (p.y > maxy) maxy = p.y;
	}

	const w = maxx - minx || 1;
	const h = maxy - miny || 1;
	const s = (BOX - 2 * PAD) / Math.max(w, h);
	const ox = PAD + (BOX - 2 * PAD - w * s) / 2;
	const oy = PAD + (BOX - 2 * PAD - h * s) / 2;
	/**
	 * Project a tile point into the viewBox, rounded to a hundredth of a unit.
	 *
	 * The rounding is not cosmetic, it is what makes this component hydrate. Node's `Math.cos` and
	 * Chromium's disagree in the last bit — different V8 versions, different polynomial — so a tile whose
	 * vertices come from a cosine renders `cy="105.83716857408417"` on the server and 105.83716857408416
	 * in the browser, and React reports the attribute mismatch. It surfaced on the marked hexagon of
	 * IH19, where the prototile is built from cos(60k°), but nothing about it is specific to that type:
	 * any float wide enough to print all seventeen digits is exposed. Two decimals is far finer than a
	 * 132-unit box can show.
	 *
	 * y is flipped so the drawing agrees with the canvas next to it.
	 */
	const round2 = (v: number) => Math.round(v * 100) / 100;
	const px = (p: TactilePoint) => ({
		x: round2(ox + (p.x - minx) * s),
		y: round2(BOX - (oy + (p.y - miny) * s)),
	});

	const path = (pts: { x: number; y: number }[]) =>
		pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

	const outline = cell.prototile.map(px);
	const corners = cell.tilingVertices.map(px);

	// Centroid of the CORNERS, not of the outline: it holds still while an edge bows, so a label does not
	// drift sideways as its own edge moves.
	const cx = corners.reduce((a, p) => a + p.x, 0) / corners.length;
	const cy = corners.reduce((a, p) => a + p.y, 0) / corners.length;

	const marks = cell.edges.map((e) => {
		const a = px(e.from);
		const b = px(e.to);
		const chord = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
		const mid = px(e.mid);
		// Outward normal to the chord, oriented away from the centroid so labels sit outside the tile.
		let nx = -(b.y - a.y);
		let ny = b.x - a.x;
		const nl = Math.hypot(nx, ny) || 1;
		nx /= nl;
		ny /= nl;
		if (nx * (chord.x - cx) + ny * (chord.y - cy) < 0) {
			nx = -nx;
			ny = -ny;
		}
		// Push the letter out from whichever is further out, the curve's midpoint or the chord's. Pushing
		// from the curve alone parked the label on top of the dashed chord whenever the edge bowed INWARD,
		// which is exactly where it is hardest to read.
		const bow = Math.max(0, (mid.x - chord.x) * nx + (mid.y - chord.y) * ny);
		return {
			e,
			mid,
			// Rounded for the same reason `px` is: `Math.hypot` above is another place two V8 builds may
			// disagree in the last bit, and every number here becomes an SVG attribute React diffs.
			label: {
				x: round2(chord.x + nx * (bow + LABEL_PUSH)),
				y: round2(chord.y + ny * (bow + LABEL_PUSH)),
			},
			arm: { x: round2(nx * MARK), y: round2(ny * MARK) },
		};
	});

	return (
		<div className="flex flex-col gap-2">
			<svg
				viewBox={`0 0 ${BOX} ${BOX}`}
				className="mx-auto h-auto w-full"
				style={{ maxWidth: WIDTH_PX }}
				role="img"
				aria-labelledby={`${uid}-title`}
			>
				<title id={`${uid}-title`}>
					{`${info.label} prototile: ${info.numVertices} tiling vertices, edge word ${info.edgeWord}`}
				</title>

				{/* The combinatorial polygon. Drawn first, so at zero bulge the solid outline covers it
				    exactly and no second line appears. */}
				<polygon
					points={path(corners)}
					fill="none"
					className="stroke-fg-disabled"
					strokeWidth={0.75}
					strokeDasharray="2 2"
				/>

				<polygon
					points={path(outline)}
					className="fill-accent-subtle stroke-fg-secondary"
					strokeWidth={1.25}
					strokeLinejoin="round"
				/>

				{/* Each edge's symmetry element, where it acts. J is unconstrained and gets none; I is
				    visibly straight already. */}
				{marks.map(({ e, mid, arm }, i) =>
					e.kind === "S" ? (
						// The 2-fold centre the edge turns about. An S curve is antisymmetric about it, so this
						// point sits on the chord however hard the edge bows.
						<circle
							key={`m${i}`}
							cx={mid.x}
							cy={mid.y}
							r={2}
							fill="none"
							className="stroke-fg-muted"
							strokeWidth={0.9}
						/>
					) : e.kind === "U" ? (
						// The perpendicular bisector the edge mirrors across, where it crosses. Solid, with
						// dashes kept for the chords, because that is the standard reading: a solid line is a
						// mirror, a dashed one is construction.
						//
						// Centred on the DRAWN edge, not on the chord. Anchoring it to the chord and stretching
						// it out to reach the curve pointed the wrong way on every inward bow — IH18 drew three
						// spokes hanging outside a concave edge, touching nothing.
						<line
							key={`m${i}`}
							x1={mid.x - arm.x}
							y1={mid.y - arm.y}
							x2={mid.x + arm.x}
							y2={mid.y + arm.y}
							className="stroke-fg-muted"
							strokeWidth={0.9}
						/>
					) : null,
				)}

				{/* The tiling vertices. Unlabelled on purpose: the sliders above are PARAMETERS, and a
				    parameter is an affine coefficient that can move several vertices at once, so naming a
				    dot after a slider would be a lie. */}
				{corners.map((p, i) => (
					<circle key={`v${i}`} cx={p.x} cy={p.y} r={1.6} className="fill-fg-secondary" />
				))}

				{/* Which curve draws which edge. Same convention as `edgeWord` and the info panel:
				    uppercase means the shared curve runs backwards along this edge. */}
				{marks.map(({ e, label }, i) => {
					const letter = String.fromCharCode(97 + e.id);
					return (
						<text
							key={`l${i}`}
							x={label.x}
							y={label.y}
							textAnchor="middle"
							dominantBaseline="middle"
							className="fill-fg"
							style={{ fontSize: 9, fontWeight: 600 }}
						>
							{e.rev ? letter.toUpperCase() : letter}
						</text>
					);
				})}
			</svg>

			{cell.degenerate ? (
				<p className="text-[11px] text-fg-muted">
					Self-overlapping: at these vertices the outline crosses itself, so the tiles overlap
					instead of tiling. Tactile ships no parameter ranges, so the sliders can reach here.
				</p>
			) : null}
		</div>
	);
}
