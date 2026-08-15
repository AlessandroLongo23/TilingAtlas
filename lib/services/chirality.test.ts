import { describe, expect, it } from "vitest";
import { CHIRAL_WALLPAPER_GROUPS, chiralityOf, isChiralTiling, reflectRenderCell } from "@/lib/services/chirality";
import { WALLPAPER_GROUPS } from "@/classes/symmetry/types";

describe("isChiralTiling", () => {
	it("calls exactly the five orientation-preserving groups chiral", () => {
		const chiral = WALLPAPER_GROUPS.filter((g) => isChiralTiling({ wallpaperGroup: g }) === true);
		expect([...chiral].sort()).toEqual([...CHIRAL_WALLPAPER_GROUPS].sort());
		expect(chiral).toHaveLength(5);
	});

	it("treats glide-reflection groups as ACHIRAL — a glide reverses orientation like a mirror", () => {
		expect(isChiralTiling({ wallpaperGroup: "pg" })).toBe(false);
		expect(isChiralTiling({ wallpaperGroup: "pgg" })).toBe(false);
	});

	it("calls p6 chiral — the snub trihexagonal 3.3.3.3.6 case that fixes the convention", () => {
		expect(isChiralTiling({ wallpaperGroup: "p6" })).toBe(true);
		expect(isChiralTiling({ wallpaperGroup: "p6m" })).toBe(false);
	});

	it("reports unknown as undefined, never as achiral", () => {
		expect(isChiralTiling({ wallpaperGroup: undefined })).toBeUndefined();
		expect(chiralityOf({ wallpaperGroup: undefined })).toBeNull();
		expect(chiralityOf({ wallpaperGroup: "p3" })).toBe("chiral");
		expect(chiralityOf({ wallpaperGroup: "cm" })).toBe("achiral");
	});
});

describe("reflectRenderCell", () => {
	const cell = {
		cellPolygons: [{ n: 3, vertices: [[0, 0], [1, 0], [0.5, 0.866]] }],
		basis: [[1, 0], [0.5, 0.866]],
	};
	const verts = (c: typeof cell) => (c.cellPolygons[0] as { vertices: number[][] }).vertices;

	it("negates y on every vertex and basis vector", () => {
		const r = reflectRenderCell(cell);
		expect(verts(r as typeof cell)).toEqual([[0, -0], [1, -0], [0.5, -0.866]]);
		expect(r.basis).toEqual([[1, -0], [0.5, -0.866]]);
	});

	it("is an involution", () => {
		expect(reflectRenderCell(reflectRenderCell(cell))).toEqual(cell);
	});

	it("reverses signed area — it really is a reflection, not a rotation", () => {
		const area = (v: number[][]) =>
			v.reduce((s, [x, y], i) => {
				const [nx, ny] = v[(i + 1) % v.length];
				return s + (x * ny - nx * y);
			}, 0) / 2;
		const before = area(verts(cell));
		const after = area(verts(reflectRenderCell(cell) as typeof cell));
		expect(Math.sign(after)).toBe(-Math.sign(before));
		expect(Math.abs(after)).toBeCloseTo(Math.abs(before), 12);
	});

	it("does not mutate its input", () => {
		const snapshot = JSON.parse(JSON.stringify(cell));
		reflectRenderCell(cell);
		expect(cell).toEqual(snapshot);
	});
});
