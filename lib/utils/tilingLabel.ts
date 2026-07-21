// Tile-class display + capability helpers. Classification itself lives in ONE place — tileClassOf in
// lib/services/referenceAtlas.ts (source-driven, with a family-token fallback for source-less rows) —
// and both /library and /play read it through the TILE_CLASS_LABEL registry. This file only adds the
// capability gate below, kept class-based so it stays in lockstep with that classifier.
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

// The Hankin construction is shape-agnostic — it reads only vertices, edge midpoints, centroid, and
// per-edge inward normals — so it applies to every tile class the catalogue ships. Scaled tiles carry
// their T-junctions as flat 180° corners (scripts/build-scaled-atlas.ts), so `halfways` already holds
// one midpoint per unit sub-edge and the construction emits a ray-pair ("V") at each. Hyperbolic
// tilings run the same construction with geodesic rays (Kaplan & Salesin 2004, absolute geometry),
// baked over the Dirichlet domain by lib/render/hyperbolicIslamic.ts for the per-pixel renderer.
// Kept as a function (not a constant) so a future class can opt out without touching call sites.
export function polygonClassSupportsIslamic(_t: { family: string; source?: ReferenceTiling["source"] }): boolean {
	return true;
}
