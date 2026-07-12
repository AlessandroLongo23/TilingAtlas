// The set of regular polygons that can appear in an edge-to-edge k-uniform tiling of regular polygons
// is PROVEN to be exactly {3,4,6,8,12} (and the octagon only ever in 4.8.8) — so enumerating it as a
// "family" carries no information: such a tiling is simply made of "regular polygons". Tilings that
// also use star polygons are "star polygons". The atlas marks star tiles in the family string with a
// "*" token (e.g. "4*.8"); the certified catalogue's family is the regular-set string with no "*".
//
// The convex-irregular demo shelf uses convex unit-edge super-tiles, whose family strings carry a "cx"
// token (e.g. "(cx4-2.4.2.4@1,6,…)F"); that marker is source-independent (the /play CatalogueTiling has
// no `source` field) and never collides with a regular/star family. Checked first.
// The isotoxal shelf marks each alternating-angle tile in the family string with an "α" token (e.g.
// "3.3.6α", from build-isotoxal-atlas's familyLabel). That marker is source-independent (like "cx") and
// never appears in a regular/star/convex family, so isotoxal tilings split into their own class rather
// than folding into "regular polygons".
export function polygonClassLabel(family: string | null | undefined): string {
	if (family?.includes("cx")) return "convex irregular polygons";
	if (family?.includes("α")) return "isotoxal polygons";
	return family?.includes("*") ? "star polygons" : "regular polygons";
}
