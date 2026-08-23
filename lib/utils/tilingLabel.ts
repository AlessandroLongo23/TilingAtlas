// Tile-class display + capability helpers. Classification itself lives in ONE place — tileClassOf in
// lib/services/referenceAtlas.ts (source-driven, with a family-token fallback for source-less rows) —
// and both /library and /play read it through the TILE_CLASS_LABEL registry. This file only adds the
// capability gate below, which is keyed on the RENDERER rather than the class — see the note on it.
import { hasCurvedTiles, surfaceOf, type ShelfSurface } from "@/lib/services/shelfRegistry";

// The Hankin construction is shape-agnostic — it reads only vertices, edge midpoints, centroid, and
// per-edge inward normals — so it applies to every tile class the catalogue ships. Scaled tiles carry
// their T-junctions as flat 180° corners (scripts/build-scaled-atlas.ts), so `halfways` already holds
// one midpoint per unit sub-edge and the construction emits a ray-pair ("V") at each. Hyperbolic
// tilings run the same construction with geodesic rays (Kaplan & Salesin 2004, absolute geometry),
// baked over the Dirichlet domain by lib/render/hyperbolicIslamic.ts for the per-pixel renderer.
// Kept as a function (not a constant) so a future class can opt out without touching call sites.
//
// ⚑ THE GATE IS THE SURFACE, NOT THE CLASS (AL, 2026-08-21). It used to read the record's `source` and
// exclude freedraw and colors, which answered a different question: whether the tiles could carry the
// construction, not whether the renderer on screen draws it. Four shelves passed that test over canvases
// with no Islamic path at all, so the checkbox and its fifteen parameter controls sat there doing nothing
// — star polyhedra and the 3.4.n.4 solids (source "spherical", drawn by ico-freedraw), the 3.4.n.4
// hyperbolic tilings (source "hyperbolic", drawn by the colors shader), and the hollow shelf, whose flat
// layer canvas.tsx blanks.
//
// So the list below is the renderers that read `isIslamic` and draw something, and it is verifiable by
// grep: components/canvas.tsx with islamic-canvas/strap-canvas (flat), hyperbolic-developed-canvas
// (disk), spherical-canvas (sphere). Nothing else does. Adding a surface here without an implementation
// behind it puts a dead control back on the shelf.
//
// The construction itself is shape-agnostic — it reads only vertices, edge midpoints, centroid and
// per-edge inward normals — so every tile class on those three surfaces is admitted, which is why the
// gate names no class. A freedraw face would have failed it anyway: it can be an infinite strip or an
// annulus, with no vertex list and no centroid.
const ISLAMIC_SURFACES: ReadonlySet<ShelfSurface> = new Set<ShelfSurface>(["flat", "disk", "sphere"]);

export function polygonClassSupportsIslamic(t: Parameters<typeof surfaceOf>[0]): boolean {
	// Curved tiles are the one exclusion the surface alone does not catch: the construction reads
	// per-edge inward normals, and a flattened arc presents dozens of them where the tile has one.
	return ISLAMIC_SURFACES.has(surfaceOf(t)) && !hasCurvedTiles(t);
}
