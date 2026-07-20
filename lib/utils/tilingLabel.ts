// Tile-class display + capability helpers. Classification itself lives in ONE place — tileClassOf in
// lib/services/referenceAtlas.ts (source-driven, with a family-token fallback for source-less rows) —
// and both /library and /play read it through the TILE_CLASS_LABEL registry. This file only adds the
// capability gate below, kept class-based so it stays in lockstep with that classifier.
import { tileClassOf, type ReferenceTiling } from "@/lib/services/referenceAtlas";

// The flat Hankin construction (Polygon.calculateIslamicSegments) is shape-agnostic — it reads only
// vertices, edge midpoints, centroid, and per-edge inward normals — so it applies to every flat and
// spherical tile class the catalogue ships. Scaled tiles carry their T-junctions as flat 180° corners
// (scripts/build-scaled-atlas.ts), so `halfways` already holds one midpoint per unit sub-edge and the
// construction emits a ray-pair ("V") at each. Only "hyperbolic" is excluded here: its developed
// per-pixel Poincaré-disk renderer does not draw the Islamic construction.
export function polygonClassSupportsIslamic(t: { family: string; source?: ReferenceTiling["source"] }): boolean {
	return tileClassOf(t) !== "hyperbolic";
}
