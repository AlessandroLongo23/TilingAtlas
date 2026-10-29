// What a hyperbolic disk draws and how it paints it, shared by the interactive canvas
// (components/hyperbolic-canvas.tsx) and the thumbnail (components/hyperbolic-thumbnail.tsx). Both hand
// the result to the one per-pixel renderer (hyperbolicPerPixelGL.ts), so a card and /play cannot drift.

import type { ConfigurationState } from "@/stores/configuration";
import { paletteRgb255 } from "@/lib/colors/render";
import { fillAmountToSatPct } from "@/lib/render/tilePalette";
import type { Darts } from "@/lib/render/hyperbolicDevelopClient";
import type { HypFamily } from "@/lib/render/hypStarFamily";
import type { PerPixelDrawParams } from "@/lib/render/hyperbolicPerPixelGL";
import { loadDevelopedPatch } from "@/lib/tilings/hyp-developed";

/** Everything a disk reads off a record. Every hyperbolic shelf supplies it as it is. */
export interface HypDiskTiling {
	id: string;
	edge: number;
	darts: Darts;
	/** Colourings: how many colours `darts.faceColor` indexes. */
	colors?: number;
	/** Tiling mode: `darts.faceColor` holds each face's hue in degrees, overriding the side-count ramp. The
	 *  Tegula shelf's rule, so a type keeps its colours on the plane, the sphere and the disk. */
	faceHue?: boolean;
	/** A star family's free point angle (hypStarFamily.ts). The hyp-poly shelf uses the field for a plain
	 *  label, hence the string; starFamilyOf tells them apart. */
	family?: HypFamily | string;
}

export const starFamilyOf = (t: HypDiskTiling): HypFamily | undefined =>
	typeof t.family === "object" ? t.family : undefined;

/** A record in hand, or the id of one in the developed catalogue (loaded on first use). */
export type HypDiskSource = HypDiskTiling | string;

export const resolveHypTiling = (s: HypDiskSource): Promise<HypDiskTiling | null> =>
	typeof s === "string" ? loadDevelopedPatch(s) : Promise.resolve(s);

/**
 * How the faces are painted.
 * - `tiling`: every face is a tile, filled by its polygon size (the shared hue ramp); the Islamic
 *   construction applies.
 * - `edges`: an edge system: one backdrop hue, drawn edges bold over the faint undrawn scaffold.
 * - `colors`: a colouring: each face takes its colour index through the colourings palette.
 */
export type HypDiskMode = "tiling" | "edges" | "colors";

/** Only an edge system has undrawn edges. Everywhere else the walk marks every edge a boundary, and the
 *  overlay (orbits, symmetry marks) can read the faces. */
export const allEdgesDrawn = (mode: HypDiskMode): boolean => mode !== "edges";

export type HypDiskSettings = Pick<
	ConfigurationState,
	| "fillAmount"
	| "lineWidth"
	| "hueOffset"
	| "hyperbolicLineMode"
	| "hyperbolicDepthShade"
	| "freedrawScaffold"
	| "colorsPalette"
>;

/** The mode- and settings-dependent half of a draw; the caller adds the view, the frame and the Islamic
 *  layers. `dpr` scales the stroke from CSS to device px. */
export function diskStyle(
	mode: HypDiskMode,
	tiling: HypDiskTiling,
	s: HypDiskSettings,
	dark: boolean,
	dpr: number,
): Omit<PerPixelDrawParams, "view" | "face" | "R" | "cx" | "cy" | "canvasH"> {
	return {
		dark,
		showFill: s.fillAmount > 0,
		fillSatPct: fillAmountToSatPct(s.fillAmount),
		// A colouring's colours are palette slots, which the hue ring does not turn.
		hueOffset: mode === "colors" ? 0 : s.hueOffset || 0,
		// 0 = no stroke; a tile edge runs a tenth heavier than an edge-system line.
		strokePx: s.lineWidth <= 0 ? 0 : Math.max(s.lineWidth, 0.5) * dpr * (mode === "tiling" ? 1.1 : 1),
		taper: s.hyperbolicLineMode !== "constant",
		depth: s.hyperbolicDepthShade,
		edgeMode: mode !== "tiling",
		scaffold: mode === "edges" && s.freedrawScaffold,
		colorsMode: mode === "colors",
		faceHue: mode === "tiling" && !!tiling.faceHue,
		palette:
			mode === "colors"
				? paletteRgb255(tiling.colors ?? 1, s.colorsPalette, dark).map(
						([r, g, b]) => [r / 255, g / 255, b / 255] as [number, number, number],
					)
				: undefined,
	};
}
