// Colour conversion for the periodic-cell adapters. The 2D renderers build CSS `hsl(...)` strings; the
// shader wants linear-indexed RGB in 0..1, so each adapter converts with the SAME h/s/l numbers its
// renderer bakes into the string. Sharing this helper is what keeps the lens and the flat canvas from
// drifting apart on colour.

/** CSS hsl (h degrees, s/l percent) to RGB in 0..1. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const S = s / 100;
	const L = l / 100;
	const c = (1 - Math.abs(2 * L - 1)) * S;
	const hp = (((h % 360) + 360) % 360) / 60;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	let r = 0, g = 0, b = 0;
	if (hp < 1) [r, g, b] = [c, x, 0];
	else if (hp < 2) [r, g, b] = [x, c, 0];
	else if (hp < 3) [r, g, b] = [0, c, x];
	else if (hp < 4) [r, g, b] = [0, x, c];
	else if (hp < 5) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];
	const m = L - c / 2;
	return [r + m, g + m, b + m];
}
