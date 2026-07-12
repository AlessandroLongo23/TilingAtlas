import { describe, it, expect } from "vitest";
import {
	LATTICE_REALIZABLE_GROUPS,
	WALLPAPER_GROUPS,
	isGroupOnLattice,
	type LatticeShape,
	type WallpaperGroup,
} from "@/lib/classes/symmetry/types";

const LATTICES: LatticeShape[] = ["oblique", "rectangular", "rhombic", "square", "hexagonal"];

describe("LATTICE_REALIZABLE_GROUPS — the crystallographic group↔lattice table", () => {
	it("every listed group is a real wallpaper group, with no duplicates", () => {
		for (const lattice of LATTICES) {
			const groups = LATTICE_REALIZABLE_GROUPS[lattice];
			for (const g of groups) expect(WALLPAPER_GROUPS).toContain(g);
			expect(new Set(groups).size).toBe(groups.length);
		}
	});

	it("every one of the 17 groups is realizable on at least one lattice", () => {
		for (const g of WALLPAPER_GROUPS) {
			expect(LATTICES.some((l) => isGroupOnLattice(g, l))).toBe(true);
		}
	});

	it("p1 and p2 (no point symmetry) sit on every lattice", () => {
		for (const l of LATTICES) {
			expect(isGroupOnLattice("p1", l)).toBe(true);
			expect(isGroupOnLattice("p2", l)).toBe(true);
		}
	});

	it("4-fold groups pin the square lattice; 3-/6-fold groups pin the hexagonal one", () => {
		const square: WallpaperGroup[] = ["p4", "p4m", "p4g"];
		const hex: WallpaperGroup[] = ["p3", "p3m1", "p31m", "p6", "p6m"];
		for (const g of square) {
			for (const l of LATTICES) expect(isGroupOnLattice(g, l)).toBe(l === "square");
		}
		for (const g of hex) {
			for (const l of LATTICES) expect(isGroupOnLattice(g, l)).toBe(l === "hexagonal");
		}
	});

	it("primitive mirror groups need a rectangular/square cell, centred ones a rhombic/square cell", () => {
		// primitive rectangular family
		for (const g of ["pm", "pg", "pmm", "pmg", "pgg"] as WallpaperGroup[]) {
			expect(isGroupOnLattice(g, "rectangular")).toBe(true);
			expect(isGroupOnLattice(g, "square")).toBe(true);
			expect(isGroupOnLattice(g, "rhombic")).toBe(false);
			expect(isGroupOnLattice(g, "oblique")).toBe(false);
		}
		// centred rectangular family
		for (const g of ["cm", "cmm"] as WallpaperGroup[]) {
			expect(isGroupOnLattice(g, "rhombic")).toBe(true);
			expect(isGroupOnLattice(g, "square")).toBe(true);
			expect(isGroupOnLattice(g, "rectangular")).toBe(false);
		}
	});

	it("the oblique lattice hosts only p1 and p2", () => {
		expect([...LATTICE_REALIZABLE_GROUPS.oblique].sort()).toEqual(["p1", "p2"]);
	});
});
