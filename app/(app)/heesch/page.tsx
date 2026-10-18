import { Suspense } from "react";
import { HeeschClient } from "./_heesch-client";

export const metadata = {
	title: "Heesch numbers · Tiling Atlas",
	description:
		"Shapes that cannot tile the plane, and how many complete rings of copies can still surround them: every non-tiling polyomino by size, with its corona patch.",
};

// Static shell: the records are JSON under /heesch, fetched per set. Suspense because the client reads
// ?set= and ?shape= through useSearchParams.
export const dynamic = "force-static";

export default function HeeschPage() {
	return (
		<Suspense fallback={null}>
			<HeeschClient />
		</Suspense>
	);
}
