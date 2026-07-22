import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyseFaces, summarise, type FaceSummary } from "./faces";
import {
	DEFAULT_FILTER,
	matches,
	parseFilter,
	regularActive,
	serializeFilter,
	sizeOptions,
	type FreedrawFilter,
} from "./filter";
import type { FreedrawPattern } from "./pattern";
import { classifyRegular, type RegularInfo } from "./regular";

/** A summary standing in for a pattern, so the predicate can be tested without building a tiling. */
const stats = (over: Partial<FaceSummary> = {}): FaceSummary => ({
	faceOrbits: 1,
	finite: 0,
	strips: 0,
	unbounded: 0,
	withHoles: 0,
	sizes: [],
	...over,
});

const filter = (over: Partial<FreedrawFilter> = {}): FreedrawFilter => ({
	...DEFAULT_FILTER,
	...over,
});

describe("matches — the rank toggles", () => {
	const tetrominoes = stats({ faceOrbits: 2, finite: 2, sizes: [4, 4] });
	const stripAndSheet = stats({ faceOrbits: 2, strips: 1, unbounded: 1 });

	it("lets everything through by default", () => {
		expect(matches(tetrominoes, filter())).toBe(true);
		expect(matches(stripAndSheet, filter())).toBe(true);
	});

	it("requires and excludes each class independently", () => {
		expect(matches(stripAndSheet, filter({ strip: "require" }))).toBe(true);
		expect(matches(stripAndSheet, filter({ strip: "exclude" }))).toBe(false);
		expect(matches(tetrominoes, filter({ strip: "require" }))).toBe(false);
		expect(matches(tetrominoes, filter({ strip: "exclude" }))).toBe(true);
		expect(matches(stripAndSheet, filter({ unbounded: "require" }))).toBe(true);
		expect(matches(tetrominoes, filter({ unbounded: "require" }))).toBe(false);
		expect(matches(tetrominoes, filter({ finite: "require" }))).toBe(true);
		expect(matches(stripAndSheet, filter({ finite: "require" }))).toBe(false);
	});

	it("treats holes as a fourth class of its own", () => {
		const holed = stats({ faceOrbits: 2, finite: 2, withHoles: 1, sizes: [1, 8] });
		expect(matches(holed, filter({ holes: "require" }))).toBe(true);
		expect(matches(holed, filter({ holes: "exclude" }))).toBe(false);
		expect(matches(tetrominoes, filter({ holes: "require" }))).toBe(false);
	});

	it("matches nothing when all three ranks are excluded", () => {
		const none = filter({ unbounded: "exclude", strip: "exclude", finite: "exclude" });
		expect(matches(tetrominoes, none)).toBe(false);
		expect(matches(stripAndSheet, none)).toBe(false);
	});
});

describe("matches — the size sub-filter", () => {
	const mixed = stats({ faceOrbits: 2, finite: 2, sizes: [4, 6] });
	const pure = stats({ faceOrbits: 2, finite: 2, sizes: [4, 4] });

	it("splits all from any on a mixed pattern", () => {
		const all = filter({ finite: "require", sizes: [4], sizeMode: "all" });
		const any = filter({ finite: "require", sizes: [4], sizeMode: "any" });
		expect(matches(mixed, all)).toBe(false);
		expect(matches(mixed, any)).toBe(true);
		expect(matches(pure, all)).toBe(true);
		expect(matches(pure, any)).toBe(true);
	});

	it("accepts a set of sizes, not just one", () => {
		expect(matches(mixed, filter({ finite: "require", sizes: [4, 6] }))).toBe(true);
		expect(matches(mixed, filter({ finite: "require", sizes: [4, 5] }))).toBe(false);
	});

	it("ignores sizes unless the finite class is required", () => {
		// Otherwise "all finite tiles are tetrominoes" would silently also admit patterns with no
		// finite tile at all, through the vacuous truth of `every` on an empty list.
		const noFinite = stats({ strips: 1 });
		expect(matches(noFinite, filter({ sizes: [4] }))).toBe(true);
		expect(matches(noFinite, filter({ finite: "require", sizes: [4] }))).toBe(false);
		expect(matches(mixed, filter({ finite: "any", sizes: [4] }))).toBe(true);
		expect(matches(mixed, filter({ finite: "exclude", sizes: [4] }))).toBe(false);
	});

	it("expresses AL's two target gestures in one selection each", () => {
		// "both unbounded and tetrominoes only, and not care about the strips"
		const a = filter({ unbounded: "require", finite: "require", sizes: [4], sizeMode: "all" });
		expect(matches(stats({ faceOrbits: 3, finite: 1, unbounded: 1, strips: 1, sizes: [4] }), a)).toBe(true);
		expect(matches(stats({ faceOrbits: 2, finite: 1, unbounded: 1, sizes: [5] }), a)).toBe(false);
		expect(matches(stats({ faceOrbits: 2, finite: 2, sizes: [4, 4] }), a)).toBe(false);

		// "not unbounded, not strips, and only pentominoes"
		const b = filter({
			unbounded: "exclude",
			strip: "exclude",
			finite: "require",
			sizes: [5],
			sizeMode: "all",
		});
		expect(matches(stats({ faceOrbits: 2, finite: 2, sizes: [5, 5] }), b)).toBe(true);
		expect(matches(stats({ faceOrbits: 2, finite: 1, strips: 1, sizes: [5] }), b)).toBe(false);
	});
});

describe("sizeOptions", () => {
	it("lists the sizes present, ascending and deduplicated", () => {
		expect(
			sizeOptions([stats({ sizes: [4, 4, 1] }), stats({ sizes: [9, 4] }), stats()]),
		).toEqual([1, 4, 9]);
	});
});

describe("matches — the regular-polygon axes", () => {
	// A minimal RegularInfo stub; matches() only reads kinds / allRegular / allUnit.
	const reg = (kinds: number[], allRegular: boolean, allUnit: boolean) =>
		({ perFace: [], kinds: new Set(kinds), allRegular, allUnit }) as unknown as RegularInfo;
	const s = stats({ finite: 1, sizes: [1] });

	it("requires and excludes individual polygons", () => {
		expect(matches(s, filter({ polygons: { ...DEFAULT_FILTER.polygons, 6: "require" } }), reg([3, 6], true, true))).toBe(true);
		expect(matches(s, filter({ polygons: { ...DEFAULT_FILTER.polygons, 6: "require" } }), reg([3, 4], true, true))).toBe(false);
		expect(matches(s, filter({ polygons: { ...DEFAULT_FILTER.polygons, 4: "exclude" } }), reg([3, 6], true, true))).toBe(true);
		expect(matches(s, filter({ polygons: { ...DEFAULT_FILTER.polygons, 4: "exclude" } }), reg([3, 4], true, true))).toBe(false);
	});

	it("gates on regularity", () => {
		expect(matches(s, filter({ regularity: "unit" }), reg([3], true, true))).toBe(true);
		expect(matches(s, filter({ regularity: "unit" }), reg([3], true, false))).toBe(false);
		expect(matches(s, filter({ regularity: "regular" }), reg([4], true, false))).toBe(true);
		expect(matches(s, filter({ regularity: "regular" }), reg([], false, false))).toBe(false);
	});

	it("needs RegularInfo when an axis is active, and ignores it otherwise", () => {
		// No RegularInfo but a polygon required -> cannot pass.
		expect(matches(s, filter({ polygons: { ...DEFAULT_FILTER.polygons, 3: "require" } }))).toBe(false);
		// No regular axes -> the summary-only call still works.
		expect(matches(s, filter({ finite: "require" }))).toBe(true);
	});
});

describe("URL codec", () => {
	const round = (f: FreedrawFilter) => parseFilter(new URLSearchParams(serializeFilter(f)));

	it("round-trips a spread of states", () => {
		const cases: FreedrawFilter[] = [
			DEFAULT_FILTER,
			filter({ grid: "triangle", k: 3 }),
			filter({ grid: "ts", k: 2, finite: "require", sizes: [3] }),
			filter({ unbounded: "require", strip: "exclude", finite: "require", holes: "exclude" }),
			filter({ finite: "require", sizes: [4, 5, 12], sizeMode: "any" }),
			filter({ grid: "triangle", k: 2, strip: "exclude", finite: "require", sizes: [6] }),
			filter({ grid: "ts", regularity: "unit" }),
			filter({ grid: "ts", regularity: "regular", polygons: { 3: "require", 4: "any", 6: "require", 12: "exclude" } }),
			filter({ grid: "ts", polygons: { 3: "exclude", 4: "require", 6: "any", 12: "require" } }),
		];
		for (const f of cases) expect(round(f)).toEqual(f);
	});

	it("emits nothing for the default view", () => {
		expect(serializeFilter(DEFAULT_FILTER)).toBe("");
	});

	it("falls back to the default on hostile input rather than injecting it", () => {
		const f = parseFilter(
			new URLSearchParams("g=hexagon&k=-2&u=maybe&s=x&sz=4,abc,0,-3,4&m=nonsense"),
		);
		expect(f.grid).toBe("square");
		expect(f.k).toBe(0);
		expect(f.unbounded).toBe("any");
		expect(f.strip).toBe("exclude");
		expect(f.sizes).toEqual([4]);
		expect(f.sizeMode).toBe("all");
	});

	it("survives a link with no query string at all", () => {
		expect(parseFilter(new URLSearchParams(""))).toEqual(DEFAULT_FILTER);
	});
});

// ── the real catalogue ────────────────────────────────────────────────────────────────────────────
// Counts measured 2026-07-22 and recorded in the spec. They are the regression anchor: a change to
// analyseFaces or to the predicate that moves any of these numbers is a change in what the page shows.

const CATALOGUE = "public/freedraw";

const load = (file: string): FreedrawPattern[] | null =>
	existsSync(`${CATALOGUE}/${file}`)
		? (JSON.parse(readFileSync(`${CATALOGUE}/${file}`, "utf8")) as FreedrawPattern[])
		: null;

const count = (patterns: FreedrawPattern[], f: Partial<FreedrawFilter>) => {
	const full = filter(f);
	return patterns.filter((p) => {
		const a = analyseFaces(p);
		const reg = regularActive(full) ? classifyRegular(p, a) : undefined;
		return matches(summarise(a), full, reg);
	}).length;
};

describe("the shipped catalogue", () => {
	const square = load("solutions.json");
	const k4 = load("solutions-k4.json");
	const tri = load("tri-solutions.json");

	it.skipIf(!square)("counts the square k<=3 slice", () => {
		const all = square as FreedrawPattern[];
		expect(all).toHaveLength(1420);
		const finiteOnly = { unbounded: "exclude", strip: "exclude" } as const;
		expect(count(all, finiteOnly)).toBe(454);
		expect(count(all, { strip: "require" })).toBe(846);
		expect(count(all, { unbounded: "require" })).toBe(120);
		expect(count(all, { holes: "require" })).toBe(9);
		// The 17 patterns whose every tile is a tetromino, and the 132 that merely contain one.
		expect(count(all, { ...finiteOnly, finite: "require", sizes: [4] })).toBe(17);
		expect(count(all, { finite: "require", sizes: [4], sizeMode: "any" })).toBe(132);
	});

	it.skipIf(!k4)("counts the square k=4 slice", () => {
		const all = k4 as FreedrawPattern[];
		expect(all).toHaveLength(7848);
		expect(count(all, { unbounded: "exclude", strip: "exclude" })).toBe(1944);
	});

	it.skipIf(!tri)("counts the triangle slice", () => {
		const all = tri as FreedrawPattern[];
		expect(all).toHaveLength(5059);
		expect(count(all, { unbounded: "exclude", strip: "exclude" })).toBe(3357);
	});

	it.skipIf(!square)("partitions the catalogue by rank without overlap or remainder", () => {
		const all = square as FreedrawPattern[];
		expect(
			count(all, { unbounded: "exclude", strip: "exclude" }) +
				count(all, { strip: "require" }) +
				count(all, { strip: "exclude", unbounded: "require" }),
		).toBe(all.length);
	});
});

describe("the combined-grid catalogue — regular-polygon filter", () => {
	const ts = [load("ts-solutions-k1.json"), load("ts-solutions-k2.json"), load("ts-solutions-k3.json")];
	const have = ts.every(Boolean);
	const all = have ? (ts.flat() as FreedrawPattern[]) : [];
	const only = (n: number): Partial<FreedrawFilter> => {
		const polygons = { ...DEFAULT_FILTER.polygons };
		for (const m of [3, 4, 6, 12] as const) polygons[m] = m === n ? "require" : "exclude";
		return { regularity: "unit", polygons };
	};

	it.skipIf(!have)("counts every edge-to-edge tiling by regular polygons", () => {
		// 4 + 10 + 22 across k = 1..3, measured against the corrected boundary walk.
		expect(count(all, { regularity: "unit" })).toBe(36);
	});

	it.skipIf(!have)("admits dilations when regularity is 'regular', not 'unit'", () => {
		// allRegular is 4 + 11 + 27; the extra 5 over allUnit are the side-2 and mixed-scale tilings.
		expect(count(all, { regularity: "regular" })).toBe(42);
	});

	it.skipIf(!have)("isolates the honeycomb as the only all-hexagon tiling", () => {
		expect(count(all, only(6))).toBe(1);
	});

	it.skipIf(!have)("reproduces the tri-square oracle on the squares+triangles slice", () => {
		// Edge-to-edge, no hexagon, no dodecagon: every tile is a unit triangle or square. This is the
		// classical k-uniform {3,4} catalogue, so it must match the tri-square oracle palette: 4/7/17.
		const polygons = { 3: "any", 4: "any", 6: "exclude", 12: "exclude" } as const;
		expect(count(all, { regularity: "unit", polygons })).toBe(28); // 4 + 7 + 17
	});

	it.skipIf(!have)("finds no dodecagon anywhere below k=4", () => {
		expect(count(all, only(12))).toBe(0);
		expect(count(all, { polygons: { ...DEFAULT_FILTER.polygons, 12: "require" } })).toBe(0);
	});

	it.skipIf(!have)("counts patterns merely CONTAINING a hexagon, dilations and mixtures included", () => {
		expect(count(all, { polygons: { ...DEFAULT_FILTER.polygons, 6: "require" } })).toBe(56);
	});
});
