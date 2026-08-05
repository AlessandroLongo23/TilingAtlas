import { describe, expect, it } from "vitest";
import {
	BOARD_FAMILIES,
	BOARD_VALUES,
	boardFamiliesFor,
	COLORS_COUNT_ORDER,
	SHAPE_CLASS_ORDER,
} from "@/lib/services/facets";
import {
	boardOf,
	familyOfSub,
	matchesReferenceFilters,
	SUB_ORDER,
	TILE_CLASS_ORDER,
	type ReferenceTiling,
	type SubFamily,
} from "@/lib/services/referenceAtlas";
import { shortSubLabel } from "@/lib/services/shelfLabels";
import { IH_EDGE_BOARDS, ihEdgeSubOfBoard } from "@/lib/isohedral/edge-shelf";
import { PENT_EDGE_BOARDS, pentEdgeSubOfBoard } from "@/lib/pentagon/edge-shelf";

// /play and /library browse the SAME records — both call loadReferenceAtlas and the same nine lazy shard
// loaders — but each used to describe those records with its own hand-typed lists. That drift is silent:
// a board with no chip does not throw, it just becomes unreachable behind a paginated wall.
//
// It shipped. The pentagon and isohedral edge shelves had no entry in /library's grid facet, so 128,944
// edge-pattern records paginated with no way to narrow to them, and the boards read as missing from the
// catalogue. Underneath, `freedrawGridOf` read only `t.freedraw`, so those records had no board at all.
//
// This file is the guard. It asserts the two surfaces answer the board question with one function over one
// list, so the next board Marek sends reaches both from the single edit that adds it to its shelf table.

/** A record on a given shelf, carrying only what the facet functions read. */
const rec = (over: Partial<ReferenceTiling>): ReferenceTiling =>
	({ id: "t", k: 1, family: "", source: "freedraw", ...over }) as ReferenceTiling;

describe("one taxonomy behind both surfaces", () => {
	it("gives every SUB_ORDER family a board row, so nothing in /play's tree is unreachable in /library", () => {
		// The tree /play renders and the wall /library renders are the same list. A family present in
		// SUB_ORDER but absent from BOARD_FAMILIES is a corpus a visitor can browse in one surface only.
		const inTree = new Set<SubFamily>();
		for (const sub of SUB_ORDER) {
			const f = familyOfSub(sub);
			if (f) inTree.add(f);
		}
		const inFacet = new Set(BOARD_FAMILIES.map((f) => f.family));
		expect([...inTree].filter((f) => !inFacet.has(f))).toEqual([]);
	});

	it("routes every board family to a (geometry, decoration) segment that can show it", () => {
		// A family in BOARD_FAMILIES that no segment claims renders nowhere. This is the check that would
		// have failed when the pentagon and isohedral boards existed but no panel listed them.
		const shown = new Set<SubFamily>();
		for (const g of ["euclidean", "hyperbolic", "spherical"] as const)
			for (const d of ["tilings", "edges", "colorings"] as const)
				for (const fam of boardFamiliesFor(g, d)) shown.add(fam.family);
		const orphans = BOARD_FAMILIES.map((f) => f.family).filter((f) => !shown.has(f));
		expect(orphans, `no segment shows: ${orphans.join(", ")}`).toEqual([]);
	});

	it("puts the parametric boards on the EUCLIDEAN edge segment, which is the bug that shipped", () => {
		const euclideanEdges = boardFamiliesFor("euclidean", "edges");
		const families = euclideanEdges.map((f) => f.family);
		expect(families).toContain("pent");
		expect(families).toContain("ih");
		// Every board of both shelves, not just the family heading — the isohedral corpus grew from four
		// boards to eight in a day, and a facet that lists only the first four is the same failure again.
		const subs = new Set(euclideanEdges.flatMap((f) => f.boards.map((b) => b.sub)));
		for (const b of PENT_EDGE_BOARDS) expect(subs).toContain(pentEdgeSubOfBoard(b));
		for (const b of IH_EDGE_BOARDS) expect(subs).toContain(ihEdgeSubOfBoard(b));
	});

	it("resolves a board for the shelves whose records carry no `freedraw` field", () => {
		// The root cause, stated directly: freedrawGridOf read t.freedraw and nothing else, so every record
		// on a parametric board answered null and no chip could ever match it.
		//
		// The record fields come from the BOARD TABLES, not from literals. An earlier draft of this test
		// hardcoded `{ ih: "IH01" }` and passed while asserting `boardOf` returned "ih-IH01" — but the real
		// records carry `ih: 1` and the real sub is "ih-1", so the test agreed with itself and with nothing
		// else. Deriving both sides from the table is what makes it able to fail.
		for (const b of PENT_EDGE_BOARDS) {
			const t = rec({ pentEdges: { type: b.type } as never });
			expect(boardOf(t)).toBe(pentEdgeSubOfBoard(b));
			expect(matchesReferenceFilters(t, { board: pentEdgeSubOfBoard(b) })).toBe(true);
		}
		for (const b of IH_EDGE_BOARDS) {
			const t = rec({ ihEdges: { ih: b.ih } as never });
			expect(boardOf(t)).toBe(ihEdgeSubOfBoard(b));
			expect(matchesReferenceFilters(t, { board: ihEdgeSubOfBoard(b) })).toBe(true);
		}
		// ...and a board chip excludes the other shelf, or it is not filtering at all.
		const ih0 = rec({ ihEdges: { ih: IH_EDGE_BOARDS[0].ih } as never });
		expect(matchesReferenceFilters(ih0, { board: pentEdgeSubOfBoard(PENT_EDGE_BOARDS[0]) })).toBe(false);
	});

	it("offers exactly the board values the URL parser will accept", () => {
		// The chip writes ?board=<sub> and the parser validates against BOARD_VALUES. If a wall could render
		// a sub the parser rejects, the link would silently drop the filter — which is how the first browser
		// check of this feature failed, on a sub that looked plausible and did not exist.
		const rendered = new Set(
			(["euclidean", "hyperbolic", "spherical"] as const).flatMap((g) =>
				(["tilings", "edges", "colorings"] as const).flatMap((d) =>
					boardFamiliesFor(g, d).flatMap((f) => f.boards.map((b) => b.sub)),
				),
			),
		);
		expect([...rendered].filter((s) => !BOARD_VALUES.includes(s))).toEqual([]);
	});

	it("leaves the undecorated classes without a board instead of inventing one", () => {
		// The spine every shape class shares has no board, and a board filter must EXCLUDE those rather than
		// match them by accident.
		const plain = rec({ source: "galebach", family: "3.3.3.3.3.3" });
		expect(boardOf(plain)).toBeNull();
		expect(matchesReferenceFilters(plain, { board: "square" })).toBe(false);
	});

	it("collapses a colouring sub to its grid stem on BOTH sides, or the chip matches nothing", () => {
		// "square-3" names the grid and the palette size at once. Both surfaces split those into two axes,
		// so the BOARD is the stem — and the option row and the record resolver have to agree on that or
		// the wall offers a chip that filters to zero.
		const colored = rec({ source: "colors", colors: { grid: "square", colors: 3 } as never });
		expect(boardOf(colored)).toBe("square");
		expect(matchesReferenceFilters(colored, { board: "square" })).toBe(true);
		const stems = boardFamiliesFor("euclidean", "colorings").flatMap((f) => f.boards.map((b) => b.sub));
		expect(stems).toContain("square");
		expect(stems.some((s) => /-\d+$/.test(s)), `combined subs leaked in: ${stems.join(", ")}`).toBe(false);
		// The palette size survives as its own axis, read off the subs instead of hand-typed.
		expect(COLORS_COUNT_ORDER).toContain(3);
	});

	it("offers no chip that cannot be produced by boardOf", () => {
		// A dead chip filters every record away and looks like an empty corpus. Every board value has to be
		// something the resolver can actually return, which means a real sub or a real colouring stem.
		const reachable = new Set(
			SUB_ORDER.flatMap((s) => (familyOfSub(s) ? [/^(square|triangle|hex|ts)-\d+$/.exec(s)?.[1] ?? s] : [])),
		);
		expect(BOARD_VALUES.filter((v) => !reachable.has(v))).toEqual([]);
	});

	it("drops the family word from a row that renders under its family heading", () => {
		// "Isohedral families ▸ Isohedral IH01 edges" says isohedral twice and wraps the chip onto three
		// lines. Under a heading a row only names its member. Both surfaces read this same table, so the
		// tree and the board wall cannot disagree about what a board is called.
		expect(shortSubLabel("square")).toBe("Square");
		expect(shortSubLabel("sch236")).toBe("(2,3,6)");
		expect(shortSubLabel("hys-237")).toBe("(2,3,7)");
		expect(shortSubLabel("hpo-7")).toBe("3.4.7.4");
		expect(shortSubLabel("hyp-37")).toBe("{3,7}");
		expect(shortSubLabel("spc-cube")).toBe("Cube");
		expect(shortSubLabel(pentEdgeSubOfBoard(PENT_EDGE_BOARDS[0]))).toBe("Kershner 1");
		expect(shortSubLabel(ihEdgeSubOfBoard(IH_EDGE_BOARDS[0]))).toBe(IH_EDGE_BOARDS[0].label);
		// Every board row has a short name, and none of them keeps a trailing shelf word.
		for (const fam of BOARD_FAMILIES)
			for (const b of fam.boards) {
				expect(b.label, `${b.sub} has no short label`).toBeTruthy();
				expect(b.label, `${b.sub} kept a shelf word`).not.toMatch(
					/\s(grid|edges|colored|tilings|solids|board)$/i,
				);
			}
	});

	it("keeps the shape-class wall to the classes that are shape classes", () => {
		// hyperbolic/spherical are geometries and freedraw/colors are decorations; each already has its own
		// axis, so a chip here would restate a choice made one level up. Derived, so a new TileClass joins
		// the wall by existing instead of by being remembered.
		expect(SHAPE_CLASS_ORDER).not.toContain("freedraw");
		expect(SHAPE_CLASS_ORDER).not.toContain("colors");
		expect(SHAPE_CLASS_ORDER).not.toContain("hyperbolic");
		expect(SHAPE_CLASS_ORDER).not.toContain("spherical");
		expect(SHAPE_CLASS_ORDER.length).toBe(TILE_CLASS_ORDER.length - 4);
	});
});
