import { Suspense, type ReactNode } from "react";
import { AtlasClient } from "./_atlas-client";

export const dynamic = "force-dynamic";

// The catalogue is ONE page with two lenses: the grid of many tilings (/catalogue) and the viewer of one
// (/catalogue/view). The page lives here, in the layout the two routes share, because a layout stays
// mounted across a navigation between its pages (node_modules/next/dist/docs/01-app/01-getting-started/
// 03-layouts-and-pages.md: "layouts preserve state, remain interactive, and do not rerender"). Switching
// lens is therefore a route change that keeps every loaded shelf, the filters and the selection; the two
// pages render nothing of their own. /catalogue/about stays outside this group, so its articles are not
// wrapped in the atlas. The old /library and /play addresses redirect here (next.config.ts).
export default function AtlasLayout({ children }: { children: ReactNode }) {
	return (
		<>
			{/* useSearchParams needs a Suspense boundary so the app shell can still prerender around it. */}
			<Suspense fallback={null}>
				<AtlasClient />
			</Suspense>
			{children}
		</>
	);
}
