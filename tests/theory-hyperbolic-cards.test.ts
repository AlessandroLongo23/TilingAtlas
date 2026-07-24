import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// The hyperbolic theory page embeds Poincaré figures by PATCH id, and its route resolves them out of
// public/hyperbolic-developed.json at build time (app/(app)/theory/hyperbolic/page.tsx). Nothing in
// the type system connects the markdown to that file, so a re-export that retires an id would turn a
// figure into an "Unknown patch id" box with a green build. Guard the join.
//
// The article also leans on specific NUMBERS from the enumeration (the two 4.4.4.6 tilings sharing a
// forced edge length is the whole point of its central figure), so those are checked against the
// shipped data too — prose that silently goes stale is worse than prose that fails a test.

const MD = readFileSync(
	path.join(process.cwd(), "public", "theory", "hyperbolic-enumeration.md"),
	"utf8",
);
const patches = JSON.parse(
	readFileSync(path.join(process.cwd(), "public", "hyperbolic-developed.json"), "utf8"),
) as { id: string; config: string; edge: number; darts?: unknown }[];
const byId = new Map(patches.map((p) => [p.id, p]));

const embedded = [...MD.matchAll(/<hyperbolic-card[^>]*\bpatch="([^"]+)"/g)].map((m) => m[1]);

describe("hyperbolic theory page figures", () => {
	it("embeds at least one figure", () => {
		expect(embedded.length).toBeGreaterThan(0);
	});

	it("every embedded patch id exists and carries the darts the renderer needs", () => {
		for (const id of embedded) {
			const p = byId.get(id);
			expect(p, `patch ${id} in hyperbolic-developed.json`).toBeDefined();
			expect(p!.darts, `darts for ${id}`).toBeDefined();
		}
	});

	it("the 4.4.4.6 pair really is two tilings with one configuration and one edge length", () => {
		// The claim the central figure makes. If a re-export ever merges these two, the figure stops
		// demonstrating anything and the surrounding paragraph becomes false.
		const a = byId.get("hyp-4-4-4-6");
		const b = byId.get("hyp-4-4-4-6-b");
		expect(a).toBeDefined();
		expect(b).toBeDefined();
		expect(a!.config).toBe(b!.config);
		expect(a!.edge).toBeCloseTo(b!.edge, 9);
		expect(JSON.stringify(a!.darts)).not.toBe(JSON.stringify(b!.darts));
	});

	it("the edge length and variant count quoted in the prose still match the data", () => {
		expect(byId.get("hyp-4-4-4-6")!.edge).toBeCloseTo(0.6974, 4);
		const family = patches.filter((p) => p.config === "4.6.6.6.6.6.6.6");
		expect(family.length).toBe(147); // "147 distinct 1-uniform tilings"
		for (const p of family) expect(p.edge).toBeCloseTo(2.8628, 4);
	});
});
