import { describe, expect, it } from "vitest";
import { arcPath, hueFromPointer, ringColor, thumbPosition, wrapHue } from "@/lib/render/hueRing";

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
		// Starts at the top (48, 10), sweep=1, small arc.
		expect(d.startsWith("M 48 10 A 38 38 0 0 1 ")).toBe(true);
	});

	it("uses the large-arc flag past 180°", () => {
		expect(arcPath(0, 0, 10, 0, 270)).toContain(" A 10 10 0 1 1 ");
	});
});

describe("ringColor", () => {
	// HSB(h, 0.40, 1.0) — the tile-fill convention — is exactly HSL(h, 100%, 80%): the ring previews
	// the real achievable fill colors (see hsbToHsla in lib/utils/renderTiling.ts).
	it("matches the tile-fill palette conversion", () => {
		expect(ringColor(0)).toBe("hsl(0.0, 100%, 80%)");
		expect(ringColor(137.25)).toBe("hsl(137.3, 100%, 80%)");
		expect(ringColor(360)).toBe("hsl(0.0, 100%, 80%)");
	});
});
