// Shared vocabulary for the four pipeline stages, so the same edge means the same thing in all of them.
//
// The pipeline page shows one object four ways: a solid, a flat graph, a circuit, a tiling. What makes
// it a pipeline and not four pictures is that an edge keeps its identity the whole way through, so
// every stage keys on the same `edgeKey`, and hovering an edge anywhere lights it up everywhere.
//
// Potential is drawn as a blue-to-red ramp in all of them. That is the video's colour scheme and it is
// worth keeping: once the reader has seen the circuit settle into a smooth gradient, the same gradient
// running up the finished rectangle says without a caption that the tiling's vertical axis IS voltage.

/** Undirected edge identity, order-insensitive. The join between all four stages. */
export const edgeKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

const INK_DARK = "oklch(0.24 0.012 250)";
const INK_LIGHT = "oklch(0.97 0.003 250)";

/**
 * Ink for a label printed ON a tile: dark on a light fill, light on a dark one.
 *
 * A theme token is the wrong thing here and was the bug. Tile palettes (`squareFills`, `torusFills`)
 * encode SIZE, not chrome, so they do not flip with the theme; a label taking `--color-fg-muted` for
 * its colour therefore turns near-white the moment dark mode is on and disappears into a near-white
 * tile. Ink has to follow the surface it sits on, and here that surface is the data.
 *
 * The threshold is where the two inks give equal WCAG contrast against the fill, Y ≈ 0.21, so whichever
 * side of it a fill lands on, the label clears roughly 3.7:1 at worst. That matters for `torusFills`,
 * whose hue ramp at one fixed lightness runs from a pale green (Y ≈ 0.50) to a deep blue (Y ≈ 0.09):
 * no single ink reads on both. Labels drawn on the PAGE background keep using the tokens.
 */
export function tileInk(fill: string): string {
	const m = /hsla?\(\s*(-?[\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/.exec(fill);
	if (!m) return INK_DARK;
	const s = Number(m[2]) / 100;
	const l = Number(m[3]) / 100;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const hp = ((((Number(m[1]) % 360) + 360) % 360) / 60) % 6;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	const base = [
		[c, x, 0],
		[x, c, 0],
		[0, c, x],
		[0, x, c],
		[x, 0, c],
		[c, 0, x],
	][Math.floor(hp)];
	const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
	const off = l - c / 2;
	const Y = 0.2126 * lin(base[0] + off) + 0.7152 * lin(base[1] + off) + 0.0722 * lin(base[2] + off);
	return Y > 0.21 ? INK_DARK : INK_LIGHT;
}

/**
 * Voltage colour: blue at the negative pole, red at the positive one.
 *
 * @param t normalised potential in [0, 1]
 * @param alpha fill opacity
 */
export function voltageColor(t: number, alpha = 1): string {
	const clamped = Math.min(1, Math.max(0, t));
	// 225° (blue) down to 0° (red), through violet. Saturation and lightness stay put so the ramp reads
	// as one quantity changing, not as several unrelated colours.
	const hue = 225 * (1 - clamped);
	return `hsla(${hue.toFixed(1)}, 72%, 58%, ${alpha})`;
}

/** Rotation + orthographic projection for the 3D stage. Returns screen x, y and a depth for sorting. */
export function project(
	v: readonly [number, number, number],
	yaw: number,
	pitch: number,
): { x: number; y: number; depth: number } {
	const cy = Math.cos(yaw);
	const sy = Math.sin(yaw);
	const x1 = v[0] * cy + v[2] * sy;
	const z1 = -v[0] * sy + v[2] * cy;
	const cp = Math.cos(pitch);
	const sp = Math.sin(pitch);
	const y2 = v[1] * cp - z1 * sp;
	const z2 = v[1] * sp + z1 * cp;
	// SVG's y axis points down, so the world's up becomes negative y here.
	return { x: x1, y: -y2, depth: z2 };
}

/** Fit a set of 2D points into a viewBox of the given size, leaving a margin. */
export function fitToBox(
	points: { x: number; y: number }[],
	size: number,
	margin: number,
): (p: { x: number; y: number }) => { x: number; y: number } {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const p of points) {
		minX = Math.min(minX, p.x);
		maxX = Math.max(maxX, p.x);
		minY = Math.min(minY, p.y);
		maxY = Math.max(maxY, p.y);
	}
	const span = Math.max(maxX - minX, maxY - minY) || 1;
	const scale = (size - 2 * margin) / span;
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	return (p) => ({ x: size / 2 + (p.x - cx) * scale, y: size / 2 + (p.y - cy) * scale });
}

/**
 * Ratio of two decimal integer strings as a float in [0, 1], for positioning and colour.
 *
 * Via BigInt and a fixed-point divide, because these numerators reach 27 digits in the wider corpus and
 * `Number(hugeString) / Number(otherHugeString)` silently loses the distinction between two nearly
 * equal potentials — which is precisely the distinction the drawing is trying to show.
 */
export function ratio(numerator: string, denominator: string): number {
	const d = BigInt(denominator);
	if (d === 0n) return 0;
	const SCALE = 1_000_000n;
	return Number((BigInt(numerator) * SCALE) / d) / Number(SCALE);
}
