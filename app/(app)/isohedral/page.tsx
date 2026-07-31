import { Suspense } from "react";
import { IsohedralClient } from "./_isohedral-client";

export const metadata = {
	title: "Isohedral · Tiling Atlas",
	description:
		"The ninety-three isohedral tiling types, IH1 to IH93, with live vertex parameters and edge shapes.",
};

// Static: the whole catalogue is derived from a vendored table at build time and there is nothing to
// fetch. Suspense because the client reads ?type= through useSearchParams.
export const dynamic = "force-static";

export default function IsohedralPage() {
	return (
		<Suspense fallback={null}>
			<IsohedralClient />
		</Suspense>
	);
}
