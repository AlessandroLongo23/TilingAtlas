import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { buildWallCells, planWall, type WallDoorSpec } from "./atlasWall";

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

describe("planWall", () => {
	const cells = buildWallCells(t1003.renderCell, 1920, 1200, 46)!;
	const doorSpecs: WallDoorSpec[] = [
		{ id: "play", href: "/play", label: "Play" },
		{ id: "library", href: "/library", label: "Library" },
		{ id: "theory", href: "/theory", label: "Theory" },
		{ id: "parquet", href: "/parquet", label: "Parquet" },
	];
	const reservedSpecs: WallDoorSpec[] = [
		{ id: "aperiodic", href: "/theory", label: "Aperiodic" },
		{ id: "substitution", href: "/theory", label: "Substitution" },
	];
	const opts = {
		width: 1920,
		height: 1200,
		seed: 20260721,
		doorSpecs,
		reservedSpecs,
		anchors: [
			{ x: 0.68, y: 0.36 },
			{ x: 0.32, y: 0.68 },
			{ x: 0.18, y: 0.32 },
			{ x: 0.82, y: 0.7 },
			{ x: 0.5, y: 0.85 },
			{ x: 0.52, y: 0.14 },
		],
		exclude: { x: 0, y: 0, w: 0.34, h: 0.3 },
		glyphTexts: ["3.4.6.4", "4.6.12", "3.6.3.6"],
	};

	it("is deterministic for a fixed seed", () => {
		expect(planWall(cells, opts)).toEqual(planWall(cells, opts));
	});

	it("assigns six distinct dodecagon doors outside the masthead rect", () => {
		const plan = planWall(cells, opts);
		const all = [...plan.doors, ...plan.reserved];
		expect(plan.doors.length).toBe(4);
		expect(plan.reserved.length).toBe(2);
		const keys = all.map((d) => d.cell.key);
		expect(new Set(keys).size).toBe(6);
		for (const d of all) {
			expect(d.cell.vertices.length).toBe(12);
			// fully inside the canvas
			expect(d.cell.cx - d.cell.r).toBeGreaterThanOrEqual(0);
			expect(d.cell.cx + d.cell.r).toBeLessThanOrEqual(1920);
			expect(d.cell.cy - d.cell.r).toBeGreaterThanOrEqual(0);
			expect(d.cell.cy + d.cell.r).toBeLessThanOrEqual(1200);
			// centroid outside the masthead exclusion
			const inExclude = d.cell.cx < 0.34 * 1920 && d.cell.cy < 0.3 * 1200;
			expect(inExclude).toBe(false);
		}
	});

	it("daily specimen is a hexagon, not among the muted specimens", () => {
		const plan = planWall(cells, opts);
		expect(plan.daily.vertices.length).toBe(6);
		expect(plan.specimens.some((s) => s.key === plan.daily.key)).toBe(false);
		expect(plan.specimens.length).toBeGreaterThan(10);
	});

	it("glyph squares carry the provided texts", () => {
		const plan = planWall(cells, opts);
		expect(plan.glyphs.length).toBeGreaterThan(0);
		for (const g of plan.glyphs) {
			expect(g.cell.vertices.length).toBe(4);
			expect(opts.glyphTexts).toContain(g.text);
		}
	});
});
