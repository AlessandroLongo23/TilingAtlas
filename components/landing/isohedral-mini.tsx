import { isohedralPatchCells } from "@/lib/render/landingPatches";
import { hsbToHsla, polygonHue } from "@/lib/utils/renderTiling";

// The Isohedral card's media: a patch of IH1, the type the /isohedral page opens on — a hexagon whose
// opposite edges are translates of each other, so every tile is the same tile moved. The edges are
// curved because that is the page's whole subject: an isohedral type fixes how the tiles meet and
// leaves the edges free, and a straight-edged IH1 is just a hexagon grid with nothing to say.
//
// Coloured the way the page colours it — the by-side-count ramp for a hexagon, three-cycled by the
// offsets lib/isohedral/build.ts uses — so the card and the page it links to are the same picture.
//
// (This file held the hat outline and the coming-soon minis while /aperiodic and /isohedral were
// unbuilt. Both pages are live now; the hat card renders a real patch — see interactive-hat-mini.tsx.)

const toPoints = (poly: ReadonlyArray<readonly [number, number]>) =>
	poly.map(([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`).join(" ");

// A window into the middle of the patch, not the patch's own extent: the outer tiles of a finite
// lattice patch make a jagged silhouette, and what the card is showing is a tiling, not a shape. The
// radius is large enough that the window is filled at every corner.
//
// The window is sized to put ~5 tiles across (a tile is ~2 units wide). Two and a half, which a 5.4
// window gave, read as a piece of decoration; the shared edge between neighbours is the whole point
// of an isohedral type and it takes several tiles to see it.
const PATCH_RADIUS = 3;
const WINDOW: readonly [number, number] = [9.6, 7.8];

/** The hexagon's ramp hue, cycled by the same three offsets lib/isohedral/build.ts applies. */
const BASE_HUE = polygonHue(6);
const COLOUR_OFFSETS = [0, 40, 80];

export function IsohedralMini() {
	const cells = isohedralPatchCells(PATCH_RADIUS);
	const viewBox = `${-WINDOW[0] / 2} ${-WINDOW[1] / 2} ${WINDOW[0]} ${WINDOW[1]}`;
	return (
		<div className="w-full h-full flex items-center justify-center">
			<svg
				viewBox={viewBox}
				preserveAspectRatio="xMidYMid slice"
				className="w-full h-full"
				aria-label="A patch of IH1, the general translation-hexagon isohedral tiling"
			>
				{cells.map(({ poly, a, b }, i) => (
					<polygon
						key={i}
						points={toPoints(poly)}
						fill={hsbToHsla(
							(BASE_HUE + COLOUR_OFFSETS[(((a + b) % 3) + 3) % 3]) % 360,
							40,
							100,
							1,
						)}
						stroke="rgba(0, 0, 0, 0.45)"
						strokeWidth={0.035}
						strokeLinejoin="round"
					/>
				))}
			</svg>
		</div>
	);
}
