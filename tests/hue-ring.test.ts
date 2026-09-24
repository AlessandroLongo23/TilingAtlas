import { describe, expect, it } from "vitest";
import { arcPath, hueFromPointer, ringColor, thumbPosition, wrapHue } from "@/lib/render/hueRing";
import { FILL_MAX_SAT_PCT, tileFill, tileHueRgb01 } from "@/lib/render/tilePalette";

describe("wrapHue", () => {
	it("wraps onto [0, 360)", () => {
		expect(wrapHue(0)).toBe(0);
		expect(wrapHue(360)).toBe(0);
		expect(wrapHue(725)).toBe(5);
		expect(wrapHue(-90)).toBe(270);
		expect(wrapHue(-360)).toBe(0);
	});
});

describe("hueFromPointer", () => {
	it("maps the four compass points (screen y down, clockwise from top)", () => {
		expect(hueFromPointer(0, -10)).toBeCloseTo(0); // up
		expect(hueFromPointer(10, 0)).toBeCloseTo(90); // right
		expect(hueFromPointer(0, 10)).toBeCloseTo(180); // down
		expect(hueFromPointer(-10, 0)).toBeCloseTo(270); // left
	});

	it("is radius-independent", () => {
		expect(hueFromPointer(3, -3)).toBeCloseTo(hueFromPointer(300, -300));
		expect(hueFromPointer(1, -1)).toBeCloseTo(45);
	});

	it("degenerate centre point maps to 0", () => {
		expect(hueFromPointer(0, 0)).toBe(0);
	});
});

describe("thumbPosition", () => {
	it("inverts hueFromPointer on the track circle", () => {
		const R = 38;
		for (const h of [0, 37, 90, 180, 233, 359]) {
			const p = thumbPosition(h, R);
			expect(Math.hypot(p.x, p.y)).toBeCloseTo(R);
			expect(hueFromPointer(p.x, p.y)).toBeCloseTo(h);
		}
	});

	it("puts 0° at the top and 90° at the right", () => {
		expect(thumbPosition(0, 10).x).toBeCloseTo(0);
		expect(thumbPosition(0, 10).y).toBeCloseTo(-10);
		expect(thumbPosition(90, 10).x).toBeCloseTo(10);
		expect(thumbPosition(90, 10).y).toBeCloseTo(0);
	});
});

describe("arcPath", () => {
	it("spans endpoints on the circle with the clockwise sweep flag", () => {
		const d = arcPath(48, 48, 38, 0, 5);
		// Starts at the top (48, 10), sweep=1, small arc. Coords are toFixed(3) (quantized to kill an
		// SSR/client hydration mismatch — see hueRing.ts), so the endpoints read as "48.000 10.000".
		expect(d.startsWith("M 48.000 10.000 A 38 38 0 0 1 ")).toBe(true);
	});

	it("uses the large-arc flag past 180°", () => {
		expect(arcPath(0, 0, 10, 0, 270)).toContain(" A 10 10 0 1 1 ");
	});
});

describe("ringColor", () => {
	// The ring has to preview the colour the canvas will actually paint, so `ringColor` IS `tileFill`
	// (lib/render/tilePalette.ts).
	it("is the tile fill under the ring's name", () => {
		expect(ringColor(0)).toBe(tileFill(0));
		expect(ringColor(137.25)).toBe(tileFill(137.25));
	});

	it("wraps the hue onto [0, 360)", () => {
		expect(ringColor(360)).toBe(ringColor(0));
		expect(ringColor(-90)).toBe(ringColor(270));
	});
});

// The OKLCH palette. Relative luminance stands in for perceived lightness, since OKLab L is a cube
// root of a luminance-like mix: the point of the ramp is that no hue is much lighter than another.
describe("tile palette", () => {
	const lum = ([r, g, b]: [number, number, number]) => {
		const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
		return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
	};

	it("keeps every hue at about the same lightness", () => {
		const ls = Array.from({ length: 36 }, (_, i) => lum(tileHueRgb01(i * 10)));
		expect(Math.max(...ls) - Math.min(...ls)).toBeLessThan(0.06);
	});

	// polygonHue still means what it did: triangle 0 → red, hexagon 108 → green, 12-gon 217 → blue.
	it("keeps the polygon identity hues", () => {
		const [r0, g0, b0] = tileHueRgb01(0);
		expect(r0).toBeGreaterThan(Math.max(g0, b0));
		const [r6, g6, b6] = tileHueRgb01(108);
		expect(g6).toBeGreaterThan(Math.max(r6, b6));
		const [r12, g12, b12] = tileHueRgb01(217);
		expect(b12).toBeGreaterThan(Math.max(r12, g12));
	});

	it("deepens as the Fill slider rises", () => {
		expect(lum(tileHueRgb01(108, FILL_MAX_SAT_PCT))).toBeLessThan(lum(tileHueRgb01(108, 10)));
	});
});
