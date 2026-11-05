import { Suspense, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { fetchCatalogue, type CatalogueTiling } from "@/lib/services/catalogueService";
import { AtlasClient } from "./_atlas-client";

export const dynamic = "force-dynamic";

// /play and /library are ONE page with two lenses: the grid of many tilings (/library) and the viewer of
// one (/play). The page lives here, in the layout the two routes share, because a layout stays mounted
// across a navigation between its pages (node_modules/next/dist/docs/01-app/01-getting-started/
// 03-layouts-and-pages.md: "layouts preserve state, remain interactive, and do not rerender"). Switching
// lens is therefore a route change that keeps every loaded shelf, the filters and the selection; the two
// pages render nothing of their own and exist so that both URLs, and every link already shared, keep
// working. /play/about stays outside this group, so its pages are not wrapped in the atlas.
export default async function AtlasLayout({ children }: { children: ReactNode }) {
	// The certified catalogue is only the viewer's fallback while the atlas loads (it is empty since the
	// certified/reference split was retired); the atlas itself is fetched on the client.
	let tilings: CatalogueTiling[] = [];
	try {
		const sb = await createClient();
		tilings = await fetchCatalogue(sb);
	} catch (e) {
		console.error("Atlas: failed to load the certified catalogue", e);
	}
	return (
		<>
			{/* useSearchParams needs a Suspense boundary so the app shell can still prerender around it. */}
			<Suspense fallback={null}>
				<AtlasClient tilings={tilings} />
			</Suspense>
			{children}
		</>
	);
}
