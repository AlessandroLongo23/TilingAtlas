// Tile-class display + capability helpers. Classification itself lives in ONE place — tileClassOf in
// lib/services/referenceAtlas.ts (source-driven, with a family-token fallback for source-less rows) —
// and both /library and /play read it through the TILE_CLASS_LABEL registry. This file only adds the
// capability gate below, kept class-based so it stays in lockstep with that classifier.
import { tileClassOf, type ReferenceTiling } from "@/lib/services/referenceAtlas";

// The Islamic/Hankin construction is wired only for the regular and star tile classes; convex-irregular,
// isotoxal, mixed, and doubled are excluded until their edge geometry is folded into the construction.
export function polygonClassSupportsIslamic(t: { family: string; source?: ReferenceTiling["source"] }): boolean {
	const c = tileClassOf(t);
	return c === "regular" || c === "star";
}
