import { Suspense } from "react";
import { FreedrawClient } from "./_freedraw-client";

// Freedraw viewer. The catalogue is a static JSON file under public/, no atlas data and no Supabase,
// so this route is fully static.
//
// HIDDEN FROM THE HEADER (components/nav.tsx has no link to it) since the patterns landed in the main
// atlas: they are the Freedraw tile class in /library and a Euclidean folder in /play, both reading this
// same public/freedraw/solutions.json. This page stays as the dense side-by-side workbench — the whole
// catalogue as a grid with the per-pattern face breakdown — which the card/canvas surfaces don't replace.
export const dynamic = "force-static";

export default function FreedrawPage() {
	// The client reads the query string (useSearchParams) to restore the tile filter from a shared link,
	// which client-renders the tree up to the nearest Suspense boundary. /library does the same for
	// ReferenceShelf. The fallback is null because the client's own "Loading the catalogue…" takes over
	// the moment it hydrates, and the JSON fetch dominates either way.
	return (
		<Suspense fallback={null}>
			<FreedrawClient />
		</Suspense>
	);
}
