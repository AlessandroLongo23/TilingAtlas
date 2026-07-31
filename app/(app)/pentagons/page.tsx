import { Suspense } from "react";
import { PentagonsClient } from "./_pentagons-client";

export const metadata = {
	title: "Pentagons · Tiling Atlas",
	description:
		"The fifteen types of convex pentagon that tile the plane, from Reinhardt 1918 to Mann, McLoud-Mann and Von Derau 2015, with live angle and side parameters.",
};

// Static: every type is solved and assembled from data in the bundle, with nothing to fetch. Suspense
// because the client reads ?type= through useSearchParams.
export const dynamic = "force-static";

export default function PentagonsPage() {
	return (
		<Suspense fallback={null}>
			<PentagonsClient />
		</Suspense>
	);
}
