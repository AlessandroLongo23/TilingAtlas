import { describe, expect, it } from "vitest";
import { familyOfSub, SUB_ORDER, type SubFamily } from "@/lib/services/referenceAtlas";

// The /play sidebar gathers sub rows into families (catalogue-list-panel). That gathering is a SCAN of
// SUB_ORDER, not a re-sort, which is the only way the tree can show the same sequence the ← / → browse
// order walks. It works exactly as long as each family occupies ONE contiguous run of SUB_ORDER.
//
// So this file is the guard on that invariant. Inserting a sub into the wrong place fails here, loudly,
// instead of silently splitting a family into two headings with the same name, or worse, reordering the
// tree away from the browse order.

describe("sub families", () => {
	it("each occupy one contiguous run of SUB_ORDER", () => {
		const seen = new Map<SubFamily, { first: number; last: number }>();
		SUB_ORDER.forEach((sub, i) => {
			const f = familyOfSub(sub);
			if (!f) return;
			const at = seen.get(f);
			if (!at) seen.set(f, { first: i, last: i });
			else at.last = i;
		});
		for (const [family, { first, last }] of seen) {
			const run = SUB_ORDER.slice(first, last + 1);
			const strays = run.filter((s) => familyOfSub(s) !== family);
			expect(strays, `${family} is split by ${strays.join(", ")}`).toEqual([]);
		}
	});

	it("leave the anonymous spine unfamilied, so every other class renders as it did", () => {
		// sub "" is the spine the non-freedraw classes share. A family row there would wrap every
		// tiling in the catalogue in a heading that says nothing.
		expect(familyOfSub("")).toBeNull();
	});

	it("put the four fixed grids together and each parametric board in its own family", () => {
		// The split AL asked for, stated as a test: fixed grids, the Schwarz mirror boards, and one
		// family per parametric board.
		for (const s of ["square", "triangle", "hex", "ts"]) expect(familyOfSub(s)).toBe("grid");
		for (const s of ["sch236", "sch244"]) expect(familyOfSub(s)).toBe("schwarz-eu");
		expect(familyOfSub("pen-1")).toBe("pent");
		for (const s of ["ih-1", "ih-2", "ih-3", "ih-4"]) expect(familyOfSub(s)).toBe("ih");
	});

	it("group the coloring grids apart from the edge-pattern grids, and that is deliberate", () => {
		// Same heading, different family: the two runs are separated in SUB_ORDER by the Schwarz grids,
		// so one family spanning both would break the contiguity the first test pins. They never share a
		// list, since a list is filtered to one class first.
		expect(familyOfSub("square")).toBe("grid");
		expect(familyOfSub("square-2")).toBe("grid-colors");
		expect(familyOfSub("ts-3")).toBe("grid-colors");
	});

	it("are ready for pentagon and isohedral COLORINGS, which is the point of a shared axis", () => {
		// The coloring searches on these boards have not run yet. When they land, their subs will carry
		// the same namespaces the edge shelves use, so they fall into the same families with no new
		// code — this asserts the namespace, which is the part a future corpus has to match.
		expect(familyOfSub("pen-2")).toBe("pent");
		expect(familyOfSub("ih-12")).toBe("ih");
	});
});
