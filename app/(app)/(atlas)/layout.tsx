import { Suspense, type ReactNode } from "react";
import { AtlasClient, AtlasShell } from "./_atlas-client";

// The catalogue is ONE page with two lenses: the grid of many tilings (/catalogue) and the viewer of one
// (/catalogue/view). The page lives here, in the layout the two routes share, because a layout stays
// mounted across a navigation between its pages (node_modules/next/dist/docs/01-app/01-getting-started/
// 03-layouts-and-pages.md: "layouts preserve state, remain interactive, and do not rerender"). Switching
// lens is therefore a route change that keeps every loaded shelf, the filters and the selection; the two
// pages render nothing of their own. /catalogue/about stays outside this group, so its articles are not
// wrapped in the atlas. The old /library and /play addresses redirect here (next.config.ts).
//
// /catalogue/view is prerendered and served from the CDN. AtlasClient reads the query string, which a
// prerender cannot know, so the prerender renders the Suspense fallback in its place: AtlasShell, the same
// viewer with no query string, which is what the server rendered for every share link anyway. The browser
// then renders AtlasClient from the real URL. Both routes were rendered per request until 2026-11-15, by a
// force-dynamic left over from when this layout fetched the catalogue itself; the grid still is, for its
// own reason (catalogue/page.tsx).
export default function AtlasLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<Suspense fallback={<AtlasShell />}>
				<AtlasClient />
			</Suspense>
			{children}
		</>
	);
}
