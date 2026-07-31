import { isohedralPatch, type Pt } from "@/lib/render/landingPatches";

// The static inline SVG for the one coming-soon card left on the wall: a patch of IH1, the first of
// the 93 isohedral types, standing in for the parametric shelf being prepared. Drawn in currentColor
// at low opacity — faint by design, this is a promise, not a product.
//
// (The hat's outline lived here too while /aperiodic was unbuilt. That card is live now and renders a
// real patch — see interactive-hat-mini.tsx.)

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
const WINDOW: Pt = [9.6, 7.8];

export function IsohedralMini() {
	const patch = isohedralPatch(PATCH_RADIUS);
	const viewBox = `${-WINDOW[0] / 2} ${-WINDOW[1] / 2} ${WINDOW[0]} ${WINDOW[1]}`;
	return (
		<div className="w-full h-full flex items-center justify-center text-fg-secondary">
			<svg
				viewBox={viewBox}
				preserveAspectRatio="xMidYMid slice"
				className="w-full h-full"
				aria-label="A patch of IH1, the general translation-hexagon isohedral tiling"
			>
				{patch.map((tile, i) => (
					<polygon
						key={i}
						points={toPoints(tile)}
						fill="currentColor"
						fillOpacity={0.1}
						stroke="currentColor"
						strokeOpacity={0.65}
						strokeWidth={0.035}
						strokeLinejoin="round"
					/>
				))}
			</svg>
		</div>
	);
}
