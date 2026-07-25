import { Suspense } from "react";
import { SubstitutionsClient } from "./_substitutions-client";

// Sub Rosa substitution-tiling editor: aperiodic 2n-fold rhombic tilings built from an edge word
// Σ(n) (Kari & Rissanen 2016). First member of the planned "substitutions" section. Fully
// client-side and static — the engine (lib/subrosa) derives everything from n, no data files.
export const dynamic = "force-static";

export default function SubstitutionsPage() {
	return (
		<Suspense fallback={null}>
			<SubstitutionsClient />
		</Suspense>
	);
}
