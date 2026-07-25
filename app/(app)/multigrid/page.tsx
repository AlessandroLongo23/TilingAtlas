import { Suspense } from "react";
import { MultigridClient } from "./_multigrid-client";

// de Bruijn multigrid constructor: quasiperiodic rhombic tilings (Penrose, Ammann–Beenker, …) built
// as the dual of n line families. The projection counterpart to the Sub Rosa substitution shelf.
// Fully client-side and static — the engine (lib/multigrid) derives everything from n + offsets.
export const dynamic = "force-static";

export default function MultigridPage() {
	return (
		<Suspense fallback={null}>
			<MultigridClient />
		</Suspense>
	);
}
