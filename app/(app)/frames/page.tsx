import { Suspense } from "react";
import { FramesClient } from "./_frames-client";

export const metadata = {
	title: "Frames · Tiling Atlas",
	description:
		"Regions a polyform tiles in exactly two ways, with no tile in the same place in both: every free polyform by size, on ten grids, with all its frames up to a number of tiles.",
};

// Static shell: the census is JSON under /frames, fetched per set and per shape. Suspense because the
// client reads ?set=, ?shape= and ?frame= through useSearchParams.
export const dynamic = "force-static";

export default function FramesPage() {
	return (
		<Suspense fallback={null}>
			<FramesClient />
		</Suspense>
	);
}
