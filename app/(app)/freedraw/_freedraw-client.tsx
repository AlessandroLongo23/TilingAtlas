"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { FreedrawGeometry } from "@/components/freedraw/filter-wall";
import { PlanarFreedraw } from "@/components/freedraw/planar-freedraw";
import { SphericalFreedraw } from "@/components/freedraw/spherical-freedraw";

// The freedraw workbench. A high-level geometry selector picks the arm — planar (the grid catalogues) or
// spherical (the Platonic-solid catalogues) — and each arm lays its filters, thumbnail catalogue and
// interactive preview out the same way. The two arms mount one-at-a-time, own disjoint filter state, and
// each writes its own share-link query (see the note on `geo` below).

export function FreedrawClient() {
	const searchParams = useSearchParams();
	// Read once on mount; `geo=spherical` opens on the spherical arm, anything else on planar (the default,
	// so a planar share link carries no `geo`). Only WRITE the URL after this, never read it again.
	const [geometry, setGeometry] = useState<FreedrawGeometry>(() =>
		searchParams.get("geo") === "spherical" ? "spherical" : "planar",
	);

	const switchGeometry = (g: FreedrawGeometry) => {
		setGeometry(g);
		// Persist the arm so a reload lands back on it. The child that mounts next rewrites the rest of the
		// query on its own mount effect (planar drops `geo` entirely, spherical re-adds it with solid/sk),
		// so here we only need the URL to be correct for the instant before that runs.
		const url =
			g === "spherical"
				? `${window.location.pathname}?geo=spherical`
				: window.location.pathname;
		window.history.replaceState(null, "", url);
	};

	return geometry === "spherical" ? (
		<SphericalFreedraw geometry={geometry} onGeometryChange={switchGeometry} />
	) : (
		<PlanarFreedraw geometry={geometry} onGeometryChange={switchGeometry} />
	);
}
