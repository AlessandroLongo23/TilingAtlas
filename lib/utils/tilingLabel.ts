// The set of regular polygons that can appear in an edge-to-edge k-uniform tiling of regular polygons
// is PROVEN to be exactly {3,4,6,8,12} (and the octagon only ever in 4.8.8) — so enumerating it as a
// "family" carries no information: such a tiling is simply made of "regular polygons". Tilings that
// also use star polygons are "star polygons". The atlas marks star tiles in the family string with a
// "*" token (e.g. "4*.8"); the certified catalogue's family is the regular-set string with no "*".
//
// The composable demo shelf uses composite convex super-tiles, whose family strings carry a "cx" token
// (e.g. "(cx4-2.4.2.4@1,6,…)F"); that marker is source-independent (the /play CatalogueTiling has no
// `source` field) and never collides with a regular/star family. Checked first.
export function polygonClassLabel(family: string | null | undefined): string {
	if (family?.includes("cx")) return "composable tiles";
	return family?.includes("*") ? "star polygons" : "regular polygons";
}
