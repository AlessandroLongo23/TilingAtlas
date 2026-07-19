import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { WALLPAPER_GROUP_DIAGRAMS } from "@/components/wallpaper-group-diagram";
import { WALLPAPER_GROUPS } from "@/lib/classes/symmetry/types";

const PUBLIC_DIR = resolve(__dirname, "..", "public", "wallpaper-groups");

// Groups Wikipedia draws on more than one lattice/orientation → every diagram is shown.
const MULTI: Record<string, number> = {
	p1: 4,
	p2: 4,
	pm: 2,
	pg: 2,
	cm: 2,
	pmm: 2,
	pmg: 3,
	pgg: 3,
	cmm: 2,
};

describe("wallpaper group diagrams", () => {
	it("has an entry for every wallpaper group", () => {
		for (const g of WALLPAPER_GROUPS) {
			expect(WALLPAPER_GROUP_DIAGRAMS[g], `missing diagrams for ${g}`).toBeTruthy();
			expect(WALLPAPER_GROUP_DIAGRAMS[g].length).toBeGreaterThan(0);
		}
	});

	it("has no diagrams for groups outside WALLPAPER_GROUPS", () => {
		const known = new Set<string>(WALLPAPER_GROUPS);
		for (const g of Object.keys(WALLPAPER_GROUP_DIAGRAMS)) {
			expect(known.has(g), `unexpected group ${g}`).toBe(true);
		}
	});

	it("references only bundled SVG files that exist on disk", () => {
		for (const [g, diagrams] of Object.entries(WALLPAPER_GROUP_DIAGRAMS)) {
			for (const d of diagrams) {
				expect(d.src.endsWith(".svg"), `${g}: ${d.src} not an svg`).toBe(true);
				expect(existsSync(resolve(PUBLIC_DIR, d.src)), `${g}: missing file ${d.src}`).toBe(true);
			}
		}
	});

	it("shows all lattice diagrams for multi-lattice groups, one for the rest", () => {
		for (const g of WALLPAPER_GROUPS) {
			const count = WALLPAPER_GROUP_DIAGRAMS[g].length;
			expect(count, `${g} diagram count`).toBe(MULTI[g] ?? 1);
		}
	});

	it("captions every diagram of a multi-diagram group and none of a single one", () => {
		for (const g of WALLPAPER_GROUPS) {
			const diagrams = WALLPAPER_GROUP_DIAGRAMS[g];
			if (diagrams.length > 1) {
				for (const d of diagrams) expect(d.caption, `${g}: ${d.src} needs a caption`).toBeTruthy();
			} else {
				expect(diagrams[0].caption, `${g}: single diagram should have no caption`).toBeUndefined();
			}
		}
	});
});
