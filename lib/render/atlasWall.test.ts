import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { buildWallCells } from "./atlasWall";

// The wall is driven by the real 4.6.12 atlas entry (t1003) — same file the page loads.
const atlas = JSON.parse(readFileSync("public/reference-atlas.json", "utf8"));
const t1003 = atlas.find((e: { id: string }) => e.id === "t1003");

describe("buildWallCells", () => {
	const cells = buildWallCells(t1003.renderCell, 1920, 1200, 46)!;

	it("classifies the three families", () => {
		expect(cells.dodecagons.length).toBeGreaterThan(4);
		expect(cells.hexagons.length).toBeGreaterThan(cells.dodecagons.length);
		expect(cells.squares.length).toBeGreaterThan(cells.hexagons.length);
		for (const d of cells.dodecagons) expect(d.vertices.length).toBe(12);
		for (const h of cells.hexagons) expect(h.vertices.length).toBe(6);
		for (const s of cells.squares) expect(s.vertices.length).toBe(4);
	});

	it("covers the canvas", () => {
		const all = [...cells.dodecagons, ...cells.hexagons, ...cells.squares];
		let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
		for (const p of all)
			for (const v of p.vertices) {
				minX = Math.min(minX, v.x);
				maxX = Math.max(maxX, v.x);
				minY = Math.min(minY, v.y);
				maxY = Math.max(maxY, v.y);
			}
		expect(minX).toBeLessThanOrEqual(0);
		expect(maxX).toBeGreaterThanOrEqual(1920);
		expect(minY).toBeLessThanOrEqual(0);
		expect(maxY).toBeGreaterThanOrEqual(1200);
	});

	it("keys are unique and stable across builds", () => {
		const again = buildWallCells(t1003.renderCell, 1920, 1200, 46)!;
		const keys = [...cells.dodecagons, ...cells.hexagons, ...cells.squares].map((p) => p.key);
		expect(new Set(keys).size).toBe(keys.length);
		expect(again.dodecagons[0].key).toBe(cells.dodecagons[0].key);
		expect(again.dodecagons[0].cx).toBeCloseTo(cells.dodecagons[0].cx, 9);
	});

	it("centroid radius is positive and honest", () => {
		for (const p of [...cells.dodecagons, ...cells.hexagons, ...cells.squares]) {
			expect(p.r).toBeGreaterThan(0);
			for (const v of p.vertices) {
				expect(Math.hypot(v.x - p.cx, v.y - p.cy)).toBeLessThanOrEqual(p.r + 1e-6);
			}
		}
	});
});
