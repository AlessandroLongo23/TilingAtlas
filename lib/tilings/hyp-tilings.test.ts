import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SUB_ORDER, familyOfSub, subOf } from "@/lib/services/referenceAtlas";
import { SUB_LABEL } from "@/lib/services/shelfLabels";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import {
	HYP_TILING_BOARDS,
	HYP_TILING_VALENCES,
	hypTilingBoardLabel,
	hypTilingBoardCount,
	hypTilingFacets,
	hypTilingSub,
	hypTilingSubOfBoard,
	hypTilingValenceLabel,
} from "./hyp-tilings";

// The board axis for the base hyperbolic shelf. The table is GENERATED off the shipped atlas
// (scripts/emit-hyp-tiling-boards.mjs), so what matters here is that it still describes that atlas and
// that the runtime derivation agrees with the one the emitter used — a generated table nobody checks is
// a hand-written table with extra steps.

const ATLAS = "public/reference-atlas-hyperbolic.json";
const shipped: { k: number; family: string }[] = existsSync(ATLAS)
	? decodeAtlas<{ k: number; family: string }>(JSON.parse(readFileSync(ATLAS, "utf8")))
	: [];

describe("the (valence, alphabet) board axis", () => {
	it("reads valence as the MAX over orbits and the alphabet as their union", () => {
		// The trap is a 2-uniform tiling: its valence is its busiest vertex, never the sum of both, and its
		// alphabet is the union. Summing would have put this record on a board of 15 tiles at a vertex.
		expect(hypTilingFacets("3.4.3.4.4.4.4 + 3.4.4.3.4.4.4")).toEqual({ valence: 7, alphabet: [3, 4] });
		expect(hypTilingFacets("6.6.7")).toEqual({ valence: 3, alphabet: [6, 7] });
		expect(hypTilingFacets("3.3.3.3.7")).toEqual({ valence: 5, alphabet: [3, 7] });
	});

	it("refuses anything that is not a plain configuration, leaving those records on the spine", () => {
		// A star family ("5*2"), a composite one ("cx"), an empty string: none of them name polygons at a
		// vertex, and inventing a board for them would file a tiling under a valence it does not have.
		for (const f of ["", "5*2", "cx", "3.4.α", "2.4.4"]) expect(hypTilingSub(f), f).toBe("");
	});

	it("gives every board a distinct id that round-trips through the runtime derivation", () => {
		expect(new Set(HYP_TILING_BOARDS.map((b) => b.id)).size).toBe(HYP_TILING_BOARDS.length);
		for (const b of HYP_TILING_BOARDS) {
			expect(b.id).toBe(`v${b.valence}-${b.alphabet.join("-")}`);
			expect(hypTilingSubOfBoard(b)).toBe(`hyt-${b.id}`);
			expect(b.alphabet).toEqual([...b.alphabet].sort((x, y) => x - y));
			expect(b.configs).toBeGreaterThan(0);
			expect(hypTilingBoardCount(b)).toBeGreaterThanOrEqual(b.configs);
		}
	});

	it("is valence-major, so the six families are contiguous runs of SUB_ORDER", () => {
		// The tree groups families by a SCAN over SUB_ORDER, not a re-sort, so a board filed out of order
		// would split its own family into two headings that toggle each other.
		const vs = HYP_TILING_BOARDS.map((b) => b.valence);
		expect(vs).toEqual([...vs].sort((a, b) => a - b));
		expect(HYP_TILING_VALENCES).toEqual([...new Set(vs)]);
	});

	it("puts every board on the sub axis with a label, under a valence family", () => {
		const order = new Set(SUB_ORDER);
		for (const b of HYP_TILING_BOARDS) {
			const sub = hypTilingSubOfBoard(b);
			expect(order.has(sub), sub).toBe(true);
			expect(familyOfSub(sub)).toBe(`hyt-v${b.valence}`);
			expect(SUB_LABEL[sub], sub).toBe(
				`${hypTilingBoardLabel(b)}, ${hypTilingValenceLabel(b.valence)}`,
			);
		}
	});
});

describe.skipIf(!shipped.length)("the table against the shipped atlas", () => {
	it("accounts for every record, with the counts the manifest states", () => {
		const counts = new Map<string, Map<number, number>>();
		const configs = new Map<string, Set<string>>();
		for (const r of shipped) {
			const sub = hypTilingSub(r.family);
			expect(sub, `no board for ${r.family}`).not.toBe("");
			const id = sub.slice(4);
			if (!counts.has(id)) counts.set(id, new Map());
			const per = counts.get(id)!;
			per.set(r.k, (per.get(r.k) ?? 0) + 1);
			(configs.get(id) ?? configs.set(id, new Set()).get(id)!).add(r.family);
		}
		expect(new Set(counts.keys())).toEqual(new Set(HYP_TILING_BOARDS.map((b) => b.id)));
		for (const b of HYP_TILING_BOARDS) {
			expect(Object.fromEntries(counts.get(b.id)!), b.id).toEqual(
				Object.fromEntries(Object.entries(b.counts).map(([k, n]) => [Number(k), n])),
			);
			expect(configs.get(b.id)!.size, b.id).toBe(b.configs);
		}
		expect(HYP_TILING_BOARDS.reduce((s, b) => s + hypTilingBoardCount(b), 0)).toBe(shipped.length);
	});

	it("routes those records through subOf, which is what the tree and the board wall read", () => {
		// subOf reaches the hyperbolic branch only after every decoration branch has passed on the record,
		// and only for source "hyperbolic" — a Euclidean family is a configuration too ("3.3.3.3.3.3"), and
		// an ungated derivation filed the plane's uniform tilings onto a hyperbolic board.
		for (const r of shipped.slice(0, 200))
			expect(subOf({ source: "hyperbolic", family: r.family })).toBe(hypTilingSub(r.family));
		expect(subOf({ source: "galebach", family: "3.3.3.3.3.3" })).toBe("");
	});

	it("keeps the biggest board honest: nothing bigger than the manifest's largest cell", () => {
		// The shelf's whole problem was two rows of 12,168 and 16,285. The board level has to actually
		// divide that, and this is the number to watch when a new hyperbolic corpus lands.
		const biggest = HYP_TILING_BOARDS.reduce((m, b) =>
			hypTilingBoardCount(b) > hypTilingBoardCount(m) ? b : m,
		);
		expect(biggest.id).toBe("v8-3-4");
		expect(hypTilingBoardCount(biggest)).toBe(5692);
		// …and under it, the configuration level takes the largest cell to 876.
		const perConfig = new Map<string, number>();
		for (const r of shipped)
			if (hypTilingSub(r.family) === "hyt-v8-3-4")
				perConfig.set(r.family, (perConfig.get(r.family) ?? 0) + 1);
		expect(Math.max(...perConfig.values())).toBe(876);
	});
});
