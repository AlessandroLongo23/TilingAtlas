// The grid lens of the catalogue. The page itself is the shared layout (../layout.tsx), which reads the
// path to pick the lens; this route exists so /catalogue and every filtered /catalogue?… link resolve.
//
// Rendered per request, unlike /catalogue/view: the grid's first render follows the query string (?geo=,
// ?dec= and the shelf's filters), which a prerender cannot know. Prerendered, a /catalogue?geo=hyperbolic
// link painted the Euclidean defaults until the page's JavaScript ran (2.3 s on Fast 4G with a 4x slower
// CPU), then switched. Per request it costs about 5 min of Vercel CPU a month at 2026-11 traffic.
export const dynamic = "force-dynamic";

export default function CataloguePage() {
	return null;
}
