import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WALLPAPER_DIAGRAMS, LATTICE_SHAPES, diagramsForGroup } from "@/components/wallpaper-group-diagram";
import { LATTICE_REALIZABLE_GROUPS, WALLPAPER_GROUPS, isGroupOnLattice } from "@/lib/classes/symmetry/types";

const PUBLIC_DIR = resolve(__dirname, "..", "public", "wallpaper-groups");

// The wall on the /defense wallpaper slide draws one cell diagram per realizable (group, lattice)
// pair, and the set of pairs is owned by LATTICE_REALIZABLE_GROUPS, not by the component. Two things
// can break that quietly, neither of which raises an error at runtime: a pair with no file renders a
// broken image, and a pair the table gains later renders nothing at all. Same class of bug as a
// missing alphabet letter — the wall just gets smaller and nobody is told.
describe("wallpaper group diagrams", () => {
	it("covers exactly the realizable (group, lattice) pairs, and nothing else", () => {
		const drawn = WALLPAPER_DIAGRAMS.map((d) => `${d.group}:${d.lattice}`).sort();
		const realizable = WALLPAPER_GROUPS.flatMap((g) =>
			LATTICE_SHAPES.filter((l) => isGroupOnLattice(g, l)).map((l) => `${g}:${l}`),
		).sort();
		expect(drawn).toEqual(realizable);
		expect(WALLPAPER_DIAGRAMS).toHaveLength(32);
	});

	it("references only bundled SVG files that exist on disk", () => {
		const bad = WALLPAPER_DIAGRAMS.filter(
			(d) => !d.src.endsWith(".svg") || !existsSync(resolve(PUBLIC_DIR, d.src)),
		);
		expect(bad.map((d) => `${d.group}/${d.lattice} -> ${d.src || "(none)"}`)).toEqual([]);
	});

	// The wall lays a tile out from `aspect` before its SVG has loaded, so a declared aspect that does
	// not match the file makes the whole wall mis-fit its slide — and only once the images arrive,
	// which is after every layout measurement has been taken.
	it("declares the aspect each file actually has", () => {
		const wrong = WALLPAPER_DIAGRAMS.filter((d) => {
			const svg = readFileSync(resolve(PUBLIC_DIR, d.src), "utf8");
			const box = /viewBox="([^"]+)"/.exec(svg)?.[1].trim().split(/\s+/);
			if (!box || box.length !== 4) return true;
			return Math.abs(Number(box[2]) / Number(box[3]) - d.aspect) > 1e-6;
		});
		expect(wrong.map((d) => `${d.group}/${d.lattice} (${d.src}) declares ${d.aspect}`)).toEqual([]);
	});

	it("uses a distinct diagram for every pair", () => {
		const bySrc = new Map<string, string[]>();
		for (const d of WALLPAPER_DIAGRAMS) {
			bySrc.set(d.src, [...(bySrc.get(d.src) ?? []), `${d.group}/${d.lattice}`]);
		}
		expect([...bySrc.entries()].filter(([, pairs]) => pairs.length > 1)).toEqual([]);
	});

	it("gives every group at least one diagram, in lattice order", () => {
		for (const g of WALLPAPER_GROUPS) {
			const lattices = diagramsForGroup(g).map((d) => d.lattice);
			expect(lattices.length, `${g} has no diagram`).toBeGreaterThan(0);
			expect(lattices, `${g} out of lattice order`).toEqual(LATTICE_SHAPES.filter((l) => lattices.includes(l)));
		}
	});

	// A lattice may carry MORE symmetry than the pattern on it, never less. So the groups with no
	// point symmetry sit on all five, while an order-4 rotation pins the square lattice and orders 3
	// and 6 pin the hexagonal one. These are the counts the slide is read off.
	it("puts p1 and p2 on all five lattices and the high-rotation groups on exactly one", () => {
		expect(diagramsForGroup("p1").map((d) => d.lattice)).toEqual([...LATTICE_SHAPES]);
		expect(diagramsForGroup("p2").map((d) => d.lattice)).toEqual([...LATTICE_SHAPES]);
		for (const g of ["p4", "p4m", "p4g"] as const) {
			expect(diagramsForGroup(g).map((d) => d.lattice)).toEqual(["square"]);
		}
		for (const g of ["p3", "p3m1", "p31m", "p6", "p6m"] as const) {
			expect(diagramsForGroup(g).map((d) => d.lattice)).toEqual(["hexagonal"]);
		}
	});

	it("agrees with the per-lattice table read the other way round", () => {
		for (const lattice of LATTICE_SHAPES) {
			const fromWall = WALLPAPER_DIAGRAMS.filter((d) => d.lattice === lattice).map((d) => d.group);
			expect(fromWall.sort()).toEqual([...LATTICE_REALIZABLE_GROUPS[lattice]].sort());
		}
	});
});
