"use client";

import dynamic from "next/dynamic";
import type { CataloguePatch } from "@/lib/render/hyperbolicDevelopedDraw";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

// Client wrappers that code-split the heavy GL stacks out of the landing bundle: the spherical cell
// pulls three.js, the hyperbolic one its WebGL2 per-pixel renderer, and the hat cell the metatile
// substitution plus the ear-clipping triangulator — none of it belongs in the landing's initial
// chunk. No SSR: all four are canvases, so there is nothing to render on the server.
//
// The four live cells (Play, Hyperbolic, Spherical, Aperiodic) each own their input and are inert
// until clicked; see the components themselves.

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

const InteractiveHat = dynamic(
	() => import("@/components/landing/interactive-hat-mini").then((m) => m.InteractiveHatMini),
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

// The hat patch fills its cell the same way: the tiling has no natural frame, so the card is its frame.
export function HatMini() {
	return <InteractiveHat />;
}
