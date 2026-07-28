import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { seedFromCell, SEED_WINDOW_RADIUS } from "./seedPatch";
import { parseBaseCell, type TranslationalCellData } from "@/lib/utils/renderTiling";
import type { OrbitData } from "@/lib/services/orbitsFromExactSource";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { orbitsFromExactSource } from "@/lib/services/orbitsFromExactSource";
import type { ExactCellSource } from "@/lib/services/cellCodecService";

/** The square tiling: one unit square per cell, so every vertex sits on an integer point. */
const SQUARE_CELL: TranslationalCellData = {
	p: [{ v: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], n: 4 }],
	b: [[1, 0], [0, 1]],
};

/** A synthetic 2-orbit partition of the square tiling: colour the integer points like a chessboard. */
const CHESSBOARD: OrbitData = {
	k: 2,
	orbitAt: (x, y) => (Math.round(x) + Math.round(y) + 200) % 2,
};

const vertexKeys = (cell: TranslationalCellData) => {
	const base = parseBaseCell(cell)!;
	const out = new Set<string>();
	for (const p of base.polys) for (const v of p.vertices) out.add(`${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)}`);
	return out;
};

describe("seedFromCell", () => {
	it("returns a cell carrying the original basis", () => {
		const seed = seedFromCell(SQUARE_CELL, CHESSBOARD)!;
		expect(seed.b).toEqual([[1, 0], [0, 1]]);
	});

	it("contains a vertex of every orbit", () => {
		const seed = seedFromCell(SQUARE_CELL, CHESSBOARD)!;
		const base = parseBaseCell(seed)!;
		const orbits = new Set<number>();
		for (const p of base.polys) for (const v of p.vertices) orbits.add(CHESSBOARD.orbitAt(v.x, v.y));
		expect([...orbits].sort()).toEqual([0, 1]);
	});

	it("is a vertex figure per orbit — four squares each, sharing one", () => {
		// Both representatives are integer points, and four unit squares meet at each. The two chosen
		// points are adjacent (the second orbit picks nearest the first), so they share two squares:
		// 4 + 4 − 2 = 6.
		const seed = seedFromCell(SQUARE_CELL, CHESSBOARD)!;
		expect(seed.p).toHaveLength(6);
	});

	it("emits no polygon twice", () => {
		const seed = seedFromCell(SQUARE_CELL, CHESSBOARD)!;
		const base = parseBaseCell(seed)!;
		const centroids = base.polys.map((p) => {
			const cx = p.vertices.reduce((s, v) => s + v.x, 0) / p.vertices.length;
			const cy = p.vertices.reduce((s, v) => s + v.y, 0) / p.vertices.length;
			return `${Math.round(cx * 1e4)},${Math.round(cy * 1e4)}`;
		});
		expect(new Set(centroids).size).toBe(centroids.length);
	});

	it("is deterministic under a tie", () => {
		// (0,0) and (1,1) are equidistant from the cell centre; (x, then y) has to settle it, or the
		// slide's picture changes between builds.
		const a = JSON.stringify(seedFromCell(SQUARE_CELL, CHESSBOARD));
		const b = JSON.stringify(seedFromCell(SQUARE_CELL, CHESSBOARD));
		expect(a).toBe(b);
		expect(vertexKeys(seedFromCell(SQUARE_CELL, CHESSBOARD)!).has("0,0")).toBe(true);
	});

	it("returns null when no vertex has an orbit", () => {
		expect(seedFromCell(SQUARE_CELL, { k: 1, orbitAt: () => -1 })).toBeNull();
	});

	it("cuts from a window inside the one orbitAt can answer for", () => {
		// orbitsFromExactSource builds its map over a ±3-cell block; a wider window would ask about
		// vertices it has no answer for, and those would silently drop out of the partition.
		expect(SEED_WINDOW_RADIUS).toBeLessThanOrEqual(3);
	});
});

describe("seedFromCell on a real k=4 atlas tiling", () => {
	const atlas = JSON.parse(
		readFileSync(path.join(process.cwd(), "public", "reference-atlas.json"), "utf8"),
	) as { id: string; renderCell: TranslationalCellData; exactSource?: ExactCellSource }[];
	const t4001 = atlas.find((t) => t.id === "t4001")!;

	setActiveRing(CyclotomicRing.create(24));
	const orbits = orbitsFromExactSource(CyclotomicRing.create(24), "t4001", t4001.exactSource!)!;

	it("finds four orbits in the atlas cell", () => {
		expect(orbits.k).toBe(4);
	});

	it("holds one vertex of each of the four orbits", () => {
		const seed = seedFromCell(t4001.renderCell, orbits)!;
		const base = parseBaseCell(seed)!;
		const found = new Set<number>();
		for (const p of base.polys) for (const v of p.vertices) {
			const o = orbits.orbitAt(v.x, v.y);
			if (o >= 0) found.add(o);
		}
		expect([...found].sort()).toEqual([0, 1, 2, 3]);
	});

	it("is a small patch, not the window it was cut from", () => {
		const seed = seedFromCell(t4001.renderCell, orbits)!;
		const cellPolys = parseBaseCell(t4001.renderCell)!.polys.length;
		const windowPolys = cellPolys * (2 * SEED_WINDOW_RADIUS + 1) ** 2;
		expect(seed.p!.length).toBeLessThan(windowPolys / 4);
		expect(seed.p!.length).toBeGreaterThan(4);
	});
});
