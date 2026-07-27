"use client";

import dynamic from "next/dynamic";
import type { CataloguePatch } from "@/lib/render/hyperbolicDevelopedDraw";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

// Client wrappers that code-split the heavy GL stacks out of the landing bundle: the spherical cell
// pulls three.js and the hyperbolic one its WebGL2 per-pixel renderer — neither belongs in the
// landing's initial chunk. No SSR: all three are canvases, so there is nothing to render on the
// server.
//
// The three live cells (Play, Hyperbolic, Spherical) each own their input and are inert until
// clicked; see the components themselves.

const InteractivePlay = dynamic(
	() => import("@/components/landing/interactive-play-mini").then((m) => m.InteractivePlayMini),
	{ ssr: false },
);

const InteractiveHyperbolic = dynamic(
	() => import("@/components/landing/interactive-hyperbolic-mini").then((m) => m.InteractiveHyperbolicMini),
	{ ssr: false },
);

const InteractiveSpherical = dynamic(
	() => import("@/components/landing/interactive-spherical-mini").then((m) => m.InteractiveSphericalMini),
	{ ssr: false },
);

export function PlayMini({ cell }: { cell: TranslationalCellData }) {
	return (
		<div className="absolute inset-0">
			<InteractivePlay cell={cell} />
		</div>
	);
}

// Both fill the whole media cell — no square box, no padding. A square wrapper inside a wider cell
// crops the canvas at its own edge, so zooming in ran the tiling into an invisible wall well short of
// the cell; the shapes are round anyway, so their own geometry is the only frame they need.

export function HyperbolicMini({ patch, data }: { patch: string; data?: CataloguePatch }) {
	return <InteractiveHyperbolic patchId={patch} patch={data} />;
}

export function SphericalMini({ solidId }: { solidId: string }) {
	return <InteractiveSpherical solidId={solidId} />;
}
