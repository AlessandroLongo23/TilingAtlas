import { Suspense } from "react";
import { AperiodicClient } from "./_aperiodic-client";

// The aperiodic shelf: two views of the same quasiperiodic rhombic tilings, chosen from the sidebar.
// Sub Rosa is the substitution side (Kari & Rissanen 2016, edge word Σ(n)); Multigrid is de Bruijn's
// projection side (n line families dualized). Fully client-side and static — both engines derive
// everything from n, no data files. Suspense is required because the client reads ?view= to restore
// the selected view from a shared link.
export const dynamic = "force-static";

export default function AperiodicPage() {
	return (
		<Suspense fallback={null}>
			<AperiodicClient />
		</Suspense>
	);
}
