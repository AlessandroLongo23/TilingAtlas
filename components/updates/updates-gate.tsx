"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UpdatesModal } from "@/components/updates/updates-modal";
import { useUpdates } from "@/stores/updates";
import { UPDATES } from "@/lib/updates/entries";
import { shouldAutoOpen, unseenSince } from "@/lib/updates/unseen";

// Decides whether the "what's new" modal opens on arrival, and renders it.
//
// Mounted in app/(app)/layout.tsx AND app/page.tsx, not once in the root layout. That is
// deliberate: /defense lives outside the (app) group too, and a structural exclusion cannot regress
// into popping a modal mid-talk the way a pathname check could.
//
// The rule (see lib/updates/unseen.ts for why):
//   no marker    → the store writes the current version; nothing shows
//   nothing new  → nothing shows
//   MINOR/MAJOR  → opens on arrival
//   PATCH only   → stays shut; the nav dot carries it until clicked
//
// ?updates=force opens it against the newest release whatever the stored marker says, so the modal
// can be looked at without clearing localStorage.

// useSearchParams suspends, and this mounts inside layouts that serve statically-rendered pages
// (/theory and friends are force-static). Without the boundary those builds fail outright.
export function UpdatesGate() {
	return (
		<Suspense fallback={null}>
			<UpdatesGateInner />
		</Suspense>
	);
}

function UpdatesGateInner() {
	const searchParams = useSearchParams();
	// Read ONCE, on mount. /play mirrors its own state back into the query string from a whitelist
	// (lib/services/playUrlState.ts), so ?updates=force is stripped a beat after load — tracking it
	// reactively made the modal open and then immediately vanish there.
	const [forced] = useState(() => searchParams.get("updates") === "force");

	const lastSeen = useUpdates((s) => s.lastSeen);
	const isOpen = useUpdates((s) => s.isOpen);
	const init = useUpdates((s) => s.init);
	const open = useUpdates((s) => s.open);
	const close = useUpdates((s) => s.close);

	useEffect(() => {
		init();
	}, [init]);

	// Auto-open once the marker is known. `lastSeen === undefined` means init() has not run yet.
	useEffect(() => {
		if (lastSeen === undefined) return;
		if (forced || shouldAutoOpen(lastSeen)) open();
	}, [lastSeen, forced, open]);

	const entries = useMemo(() => {
		if (forced) return UPDATES.slice(0, 1);
		const unseen = lastSeen === undefined ? [] : unseenSince(lastSeen);
		// Someone caught up who clicks the nav button still gets the latest release, not a
		// button that visibly does nothing. Auto-open never reaches this branch — shouldAutoOpen is
		// false whenever `unseen` is empty — so this only ever answers a deliberate click.
		return unseen.length > 0 ? unseen : UPDATES.slice(0, 1);
	}, [lastSeen, forced]);

	// Nothing is mounted until something asks for it: no modal markup, and no cell fetch, on a visit
	// that shows nothing.
	if (!isOpen) return null;
	return <UpdatesModal isOpen onClose={close} entries={entries} />;
}
