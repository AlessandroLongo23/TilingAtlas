// Pure math for the hue ring (components/ui/hue-ring.tsx): an annular slider whose thumb angle is a
// global hue offset in degrees. Angle convention: 0° at 12 o'clock, increasing CLOCKWISE (screen y
// down), so the thumb literally points at the color that hue-0 (red) maps to. Positions are in ring
// pixels with the origin at the ring centre and y DOWN, matching pointer events.
// Spec: docs/superpowers/specs/2026-07-16-hue-ring-design.md.

/** Wrap any angle in degrees onto [0, 360). */
export function wrapHue(deg: number): number {
	return ((deg % 360) + 360) % 360;
}

/**
 * Pointer displacement from the ring centre (px, y down) → hue offset in degrees [0, 360),
 * 0 at the top, clockwise. Degenerate (dx = dy = 0) maps to 0.
 */
export function hueFromPointer(dx: number, dy: number): number {
	if (dx === 0 && dy === 0) return 0;
	// atan2(dx, -dy): 0 at up, +90 at right — the clockwise-from-top screen convention.
	return wrapHue((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/** Thumb centre for a hue offset, on the track centerline of radius `radius` (y down). */
export function thumbPosition(hueDeg: number, radius: number): { x: number; y: number } {
	const a = (wrapHue(hueDeg) * Math.PI) / 180;
	return { x: radius * Math.sin(a), y: -radius * Math.cos(a) };
}

/**
 * SVG path for a circular arc on the track centerline from `a0` to `a1` degrees (same clockwise-
 * from-top convention; a1 > a0, spans < 360°). Stroked with the segment's hue to build the rainbow.
 */
export function arcPath(cx: number, cy: number, radius: number, a0: number, a1: number): string {
	const p0 = thumbPosition(a0, radius);
	const p1 = thumbPosition(a1, radius);
	const large = a1 - a0 > 180 ? 1 : 0;
	// Quantize coords to fixed decimals so the emitted string is byte-identical on server and client.
	// Math.sin/cos aren't correctly-rounded per spec, so Node (SSR) and the browser's V8 disagree in
	// the last ULP; the raw values would surface as a React hydration mismatch on <path d>. toFixed is
	// fully specified, so both sides round to the same string. 3 decimals ≈ 0.001 of a 96u viewBox.
	const f = (n: number) => n.toFixed(3);
	// sweep=1: SVG's positive sweep is clockwise in screen coords, matching the hue direction.
	return `M ${f(cx + p0.x)} ${f(cy + p0.y)} A ${radius} ${radius} 0 ${large} 1 ${f(cx + p1.x)} ${f(cy + p1.y)}`;
}

/** Tile-fill palette color at a hue: HSB(h, 0.40, 1.0) expressed in CSS HSL — exactly HSL(h, 100%, 80%). */
export function ringColor(hueDeg: number): string {
	return `hsl(${wrapHue(hueDeg).toFixed(1)}, 100%, 80%)`;
}

/**
 * Tile-palette RGB (each channel 0–1) at a hue: HSB(h, 0.40, 1.0) — the RGB form of `ringColor`, and the
 * same conversion the flat shader's hsb2rgb applies to class-A star bodies. Feed a region-fill hue into a
 * WebGL/Three colour uniform through this so the fill is the same material as the tiles, differing only in
 * hue. Mirrors the degree-based hsb2rgb duplicated in lib/render/{sphericalIslamicFill,sphericalWireframe}.ts.
 */
export function tileHueRgb01(hueDeg: number): [number, number, number] {
	const h = (((hueDeg / 360) % 1) + 1) % 1;
	const s = 0.4, v = 1.0;
	const k = (o: number) => {
		const x = (((h * 6 + o) % 6) + 6) % 6;
		return Math.min(Math.max(Math.abs(x - 3) - 1, 0), 1);
	};
	const m = (kk: number) => v * (1 - s) + v * s * kk;
	return [m(k(0)), m(k(4)), m(k(2))];
}
