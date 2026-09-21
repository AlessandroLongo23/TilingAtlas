import { describe, expect, it } from "vitest";
import { arcPath, hueFromPointer, ringColor, thumbPosition, wrapHue } from "@/lib/render/hueRing";
import { hsbToHsl, TILE_SAT, TILE_SAT_PCT, TILE_VAL, TILE_VAL_PCT, tileFill } from "@/lib/render/tilePalette";

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
	// (lib/render/tilePalette.ts). Asserted against the palette constants, not against a colour string:
	// the point of the test is that the two stay the same colour when TILE_SAT moves, and a hardcoded
	// "hsl(h, 100%, 80%)" would have to be re-typed on every change — which is exactly how the numbers
	// drifted apart across ~45 sites before the constant existed.
	const { s, l } = hsbToHsl(0, TILE_SAT_PCT, TILE_VAL_PCT);
	const at = (h: string) => `hsla(${h}, ${s.toFixed(1)}%, ${l.toFixed(1)}%, 1)`;

	it("is the tile fill under the ring's name", () => {
		expect(ringColor(0)).toBe(tileFill(0));
		expect(ringColor(137.25)).toBe(at("137.3"));
	});

	it("wraps the hue onto [0, 360)", () => {
		expect(ringColor(360)).toBe(at("0.0"));
		expect(ringColor(-90)).toBe(at("270.0"));
	});

	// With TILE_VAL pinned at 1 the fill is ALREADY fully saturated in HSL, and TILE_SAT only moves
	// lightness: HSB(h, s, 1) ≡ HSL(h, 100%, 100·(1 − s/2)%). That identity is the reason "make the
	// tiles more saturated" is carried out by raising TILE_SAT, and it is worth failing loudly on.
	it("is a pure lightness dial while TILE_VAL is 1", () => {
		expect(TILE_VAL).toBe(1);
		expect(s).toBeCloseTo(100, 10);
		expect(l).toBeCloseTo(100 - 50 * TILE_SAT, 10);
	});
});
