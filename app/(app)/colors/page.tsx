import { Suspense } from "react";
import { ColorsClient } from "./_colors-client";

// Colored-tiling viewer: periodic 2-colorings of the square grid, decoded from Marek Čtrnáct's PT
// certificates (tools/ctrnact-oracle/develop_colors.py). Static JSON under public/colors, no atlas
// data and no Supabase, so the route is fully static. Not in the header nav yet — the inspection
// workbench for a class that has not joined the main atlas.
export const dynamic = "force-static";

export default function ColorsPage() {
	// Same shape as /freedraw: the client reads the query string once to restore a shared link, which
	// client-renders up to the nearest Suspense boundary.
	return (
		<Suspense fallback={null}>
			<ColorsClient />
		</Suspense>
	);
}
