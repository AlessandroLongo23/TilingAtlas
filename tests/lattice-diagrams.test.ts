import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { LATTICE_DIAGRAMS } from "@/components/lattice-diagram";
import { LATTICE_REALIZABLE_GROUPS, type LatticeShape } from "@/lib/classes/symmetry/types";

const PUBLIC_DIR = resolve(__dirname, "..", "public", "lattices");
const ALL_SHAPES = Object.keys(LATTICE_REALIZABLE_GROUPS) as LatticeShape[];

describe("lattice diagrams", () => {
	it("has an entry for every Bravais lattice shape", () => {
		for (const s of ALL_SHAPES) {
			expect(LATTICE_DIAGRAMS[s], `missing diagram for ${s}`).toBeTruthy();
			expect(LATTICE_DIAGRAMS[s].note, `missing note for ${s}`).toBeTruthy();
		}
	});

	it("has no diagrams for shapes outside the lattice set", () => {
		const known = new Set<string>(ALL_SHAPES);
		for (const s of Object.keys(LATTICE_DIAGRAMS)) {
			expect(known.has(s), `unexpected lattice ${s}`).toBe(true);
		}
	});

	it("references only bundled SVG files that exist on disk", () => {
		for (const [s, d] of Object.entries(LATTICE_DIAGRAMS)) {
			expect(d.src.endsWith(".svg"), `${s}: ${d.src} not an svg`).toBe(true);
			expect(existsSync(resolve(PUBLIC_DIR, d.src)), `${s}: missing file ${d.src}`).toBe(true);
		}
	});
});
