// The editor's palette.
//
// Built on lib/colors/render.ts instead of beside it: `ColorChoice`, `paletteFor` and `cellFill` are
// already the app's one answer to "what colour is this tile, in this theme", and `cellFill` is what
// makes a hue legible in dark mode without the caller thinking about it. `paletteFor` already takes any
// slot count, so widening the palette needed no change there.
//
// What the editor does NOT do is write `configuration.colorsPalette`. That array belongs to the
// Colorings shelf, where the slots are a solved pattern's colour classes and the count comes from the
// data. Here the slots are a painter's palette and the count is a UI decision, so they are separate
// state that happens to share a renderer.

import { type ColorChoice, cellFill } from "@/lib/colors/render";

/**
 * Ten slots, in swatch order.
 *
 * The first three are `DEFAULT_PALETTE` unchanged (cream, the deep blue at 215, terracotta at 15), so
 * a tiling painted in the editor and a catalogued colouring read as the same family. `dark` follows as
 * the near-black counterpart, then six hues spread far enough apart to stay distinct at tile size.
 *
 * Red-green colour blindness drove two of the choices, the same consideration that put terracotta
 * third in `DEFAULT_PALETTE`: the palette leans on the blue-to-orange axis, which survives it, and
 * carries a single green (95) instead of a green and a red pair that would collapse into each other.
 */
export const STUDIO_PALETTE: readonly ColorChoice[] = [
	"cream",
	215,
	15,
	"dark",
	45,
	190,
	265,
	340,
	95,
	30,
];

/** A slot's CSS colour in the current theme. Thin, but it keeps `cellFill` from being imported into
 *  every component that needs a swatch. */
export const slotFill = (
	palette: readonly ColorChoice[],
	slot: number,
	dark: boolean,
	alpha = 1,
): string => cellFill(palette[slot] ?? STUDIO_PALETTE[slot % STUDIO_PALETTE.length], dark, alpha);

/** Where a slot sits on the hue wheel, for the ring editor. The two named specials have no hue, so the
 *  ring shows a neutral position and the swatch buttons carry the actual choice. */
export const slotHue = (palette: readonly ColorChoice[], slot: number): number => {
	const c = palette[slot];
	return typeof c === "number" ? c : 215;
};
