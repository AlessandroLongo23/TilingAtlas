import { describe, expect, it } from "vitest";
import { HAT_ICON_PATH } from "@/components/icons/hat-monotile";
import { hatOutline } from "@/lib/render/landingPatches";

// The nav icon draws the real monotile, so it has to be derived rather than drawn. This re-derives
// it: `hatOutline()`, scaled to span 22 of lucide's 24 grid and centred, straight into the SVG's
// y-down frame. When the icon needs regenerating, change the rule here and take the string it prints.
const LIVE = 22;

function derivePath(): string {
	const hat = hatOutline();
	const xs = hat.map(([x]) => x);
	const ys = hat.map(([, y]) => y);
	const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
	const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
	const scale = LIVE / Math.max(x1 - x0, y1 - y0);
	const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
	const at = (v: number, c: number) => +(12 + (v - c) * scale).toFixed(2);
	return `M${hat.map(([x, y]) => `${at(x, cx)} ${at(y, cy)}`).join("L")}Z`;
}

/** The path's points back out of the `d` string, for measuring what it actually draws. */
function pathPoints(d: string): [number, number][] {
	return d
		.replace(/[MZ]/g, "")
		.split("L")
		.map((p) => p.trim().split(/\s+/).map(Number) as [number, number]);
}

describe("the hat nav icon", () => {
	it("is the derived hat outline, not a hand-drawn one", () => {
		expect(HAT_ICON_PATH).toBe(derivePath());
	});

	it("draws all 13 vertices", () => {
		expect(pathPoints(HAT_ICON_PATH)).toHaveLength(13);
	});

	it("keeps the hat's 1 : √3 : 2 edge lengths", () => {
		const pts = pathPoints(HAT_ICON_PATH);
		const unit = LIVE / 6; // the outline spans 6 short edges across
		const lengths = pts.map(([x, y], i) => {
			const [nx, ny] = pts[(i + 1) % pts.length];
			return Math.hypot(nx - x, ny - y) / unit;
		});
		const count = (target: number) => lengths.filter((l) => Math.abs(l - target) < 0.02).length;
		expect(count(1)).toBe(6);
		expect(count(Math.sqrt(3))).toBe(6);
		expect(count(2)).toBe(1);
	});

	it("keeps a strokeWidth-2 outline inside the viewBox, so nothing clips", () => {
		// The root <svg> clips at the viewBox, and a round join reaches half the stroke width past
		// its vertex — so every point has to sit at least 1 in from the 0..24 edges.
		for (const [x, y] of pathPoints(HAT_ICON_PATH)) {
			expect(x).toBeGreaterThanOrEqual(1);
			expect(x).toBeLessThanOrEqual(23);
			expect(y).toBeGreaterThanOrEqual(1);
			expect(y).toBeLessThanOrEqual(23);
		}
	});
});
