"use client";

import dynamic from "next/dynamic";

// Client wrappers that code-split the heavy GL thumbnail stacks out of the landing bundle:
// the spherical preview pulls three.js and the hyperbolic one its WebGL2 per-pixel renderer —
// neither belongs in the landing's initial chunk. No SSR: both render to data-URL <img>s anyway.

const HyperbolicDevelopedThumbnail = dynamic(
	() => import("@/components/hyperbolic-developed-thumbnail").then((m) => m.HyperbolicDevelopedThumbnail),
	{ ssr: false },
);

const SphericalThumbnail = dynamic(
	() => import("@/components/spherical-thumbnail").then((m) => m.SphericalThumbnail),
	{ ssr: false },
);

export function HyperbolicMini({ patch }: { patch: string }) {
	return (
		<div className="w-full h-full flex items-center justify-center p-3">
			<div className="h-full aspect-square">
				<HyperbolicDevelopedThumbnail patch={patch} size={320} />
			</div>
		</div>
	);
}

export function SphericalMini({ solidId }: { solidId: string }) {
	return (
		<div className="w-full h-full flex items-center justify-center p-2">
			<div className="h-full aspect-square">
				<SphericalThumbnail solidId={solidId} size={320} />
			</div>
		</div>
	);
}
