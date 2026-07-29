"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { FreedrawGeometry } from "@/components/freedraw/filter-wall";
import { PlanarFreedraw } from "@/components/freedraw/planar-freedraw";
import { SphericalFreedraw } from "@/components/freedraw/spherical-freedraw";
import { HyperbolicFreedraw } from "@/components/freedraw/hyperbolic-freedraw";

// The freedraw workbench. A high-level geometry selector picks the arm — planar (the grid catalogues),
// spherical (the Platonic solids and the spherical Schwarz boards) or hyperbolic (the hyperbolic Schwarz
// boards) — and each arm lays its filters, thumbnail catalogue and interactive preview out the same way.
// The arms mount one-at-a-time, own disjoint filter state, and each writes its own share-link query (see
// the note on `geo` below).

export function FreedrawClient() {
	const searchParams = useSearchParams();
	// Read once on mount; `geo=spherical` opens on the spherical arm, anything else on planar (the default,
	// so a planar share link carries no `geo`). Only WRITE the URL after this, never read it again.
	const [geometry, setGeometry] = useState<FreedrawGeometry>(() => {
		const g = searchParams.get("geo");
		return g === "spherical" || g === "hyperbolic" ? g : "planar";
	});

	const switchGeometry = (g: FreedrawGeometry) => {
		setGeometry(g);
		// Persist the arm so a reload lands back on it. The child that mounts next rewrites the rest of the
		// query on its own mount effect (planar drops `geo` entirely, spherical re-adds it with solid/sk),
		// so here we only need the URL to be correct for the instant before that runs.
		const url = g === "planar" ? window.location.pathname : `${window.location.pathname}?geo=${g}`;
		window.history.replaceState(null, "", url);
	};

	if (geometry === "spherical") return <SphericalFreedraw geometry={geometry} onGeometryChange={switchGeometry} />;
	if (geometry === "hyperbolic") return <HyperbolicFreedraw geometry={geometry} onGeometryChange={switchGeometry} />;
	return <PlanarFreedraw geometry={geometry} onGeometryChange={switchGeometry} />;
}
