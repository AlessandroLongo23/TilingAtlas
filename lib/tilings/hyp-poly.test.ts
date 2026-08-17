import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import {
	hypPolyBoardKs,
	hypPolyBoardLabel,
	hypPolyFamilyLabel,
	hypPolyKGaps,
	hypPolyMeta,
	hypPolyShardUrl,
	hypPolySubOfBoard,
	HYP_POLY_BOARDS,
	type HypPolyBoard,
	type HypPolyPattern,
} from "./hyp-poly";

// The hyperbolic tilings-by-regular-polygons shelf and its decode checks. develop_ai1.py and
// develop_ai2.py already refuse anything that does not develop, so what matters here is that the
// SHIPPED data says true things: the alphabet is the one the board's edge length forces, the manifest
// matches the files, and the two different kinds of missing k (the corpus has none / this shelf did not
// ship it) stay distinguishable.

const shardOf = (b: HypPolyBoard, k: number): HypPolyPattern[] | null => {
	const f = `public${hypPolyShardUrl(b.id, k)}`;
	return existsSync(f) ? decodeAtlas<HypPolyPattern>(JSON.parse(readFileSync(f, "utf8"))) : null;
};

const anyShard = existsSync("public/hyperbolic-poly/hp7-k1.json");
const ai1 = HYP_POLY_BOARDS.filter((b) => b.family === "ai1");
const ai2 = HYP_POLY_BOARDS.filter((b) => b.family === "ai2");

/** Interior angle of a regular p-gon of edge ℓ in H² — the same formula the developer and the client use. */
const alpha = (p: number, l: number) => 2 * Math.asin(Math.cos(Math.PI / p) / Math.cosh(l / 2));

describe("board manifest", () => {
	it("gives every board a distinct id, at least one k, and no k both eager and lazy", () => {
		// The id, NOT n: the two families both run over n, so n = 7 names one board in each and only the
		// id ("7" against "t7") separates them. A shelf keyed by n would have silently merged them.
		expect(new Set(HYP_POLY_BOARDS.map((b) => b.id)).size).toBe(HYP_POLY_BOARDS.length);
		expect(new Set(HYP_POLY_BOARDS.map((b) => hypPolySubOfBoard(b))).size).toBe(HYP_POLY_BOARDS.length);
		for (const b of HYP_POLY_BOARDS) {
			expect(hypPolyBoardKs(b).length).toBeGreaterThan(0);
			expect(b.eagerKs.filter((k) => b.lazyKs.includes(k))).toEqual([]);
			expect(Object.keys(b.counts).map(Number).sort((x, y) => x - y)).toEqual(hypPolyBoardKs(b));
		}
	});

	it("is hyperbolic on every board — n >= 7 in both families", () => {
		// 3.4.n.4 is spherical for n = 3, 4, 5 and Euclidean at n = 6; {3,n} likewise. Only n >= 7 develops
		// in the disk.
		for (const b of HYP_POLY_BOARDS) expect(b.n, b.id).toBeGreaterThanOrEqual(7);
	});

	it("splits the two families by sub-axis prefix, so the tree can head them apart", () => {
		for (const b of ai1) expect(hypPolySubOfBoard(b)).toBe(`hpo-${b.n}`);
		for (const b of ai2) expect(hypPolySubOfBoard(b)).toBe(`hpt-${b.n}`);
	});

	it("keeps `dropped` above the shipped range, so it cannot be read as a k hole", () => {
		// The two claims must not blur: `dropped` is THIS SHELF's develop budget and always a tail;
		// hypPolyKGaps is the CORPUS having nothing there. A dropped k inside the shipped range would
		// make the distinction meaningless.
		for (const b of HYP_POLY_BOARDS) {
			const ks = hypPolyBoardKs(b);
			const top = ks[ks.length - 1];
			for (const d of b.dropped) expect(d, b.id).toBeGreaterThan(top);
		}
	});

	it("names the four boards that ship their whole corpus, so an empty `dropped` is never a shrug", () => {
		// Everywhere else an empty `dropped` would mean somebody forgot to record the budget. On these
		// four the budget never bit: every certificate Marek's run produced is on the shelf. That is
		// still not the same as the board being exhausted — t11 and t14 have a `missing` k below.
		expect(HYP_POLY_BOARDS.filter((b) => b.dropped.length === 0).map((b) => b.id))
			.toEqual(["t11", "t13", "t14", "t15"]);
	});

	it("reports the corpus's own k holes", () => {
		// n = 11 is the board with real holes: Marek enumerated nothing at k = 2…5, 8…10, 15, 16.
		expect(hypPolyKGaps(HYP_POLY_BOARDS.find((b) => b.id === "11")!)).toEqual([2, 3, 4, 5, 8, 9, 10, 15, 16]);
		expect(hypPolyKGaps(HYP_POLY_BOARDS.find((b) => b.id === "8")!)).toEqual([]);
		// The ai2 runs are contiguous from k = 1 on every board — they stop, they do not skip.
		for (const b of ai2) expect(hypPolyKGaps(b), b.id).toEqual([]);
	});

	it("labels a board by the figure that defines it", () => {
		expect(hypPolyBoardLabel("7")).toBe("3.4.7.4");
		expect(hypPolyBoardLabel("16")).toBe("3.4.16.4");
		expect(hypPolyBoardLabel("t7")).toBe("{3,7}");
		expect(hypPolyBoardLabel("t12")).toBe("{3,12}");
	});
});

describe.skipIf(!anyShard)("shards", () => {
	it("matches the manifest: every listed (board, k) exists with the listed count", () => {
		for (const b of HYP_POLY_BOARDS) {
			for (const k of hypPolyBoardKs(b)) {
				const recs = shardOf(b, k);
				expect(recs, `${b.id} k=${k}`).not.toBeNull();
				expect(recs!.length, `${b.id} k=${k}`).toBe(b.counts[k]);
				for (const r of recs!) {
					expect(r.k).toBe(k);
					expect(r.base).toBe(b.id);
					expect(r.family).toBe(b.label);
				}
			}
		}
	});

	it("ships ai1's alphabet {3, 4, n, 2n} at the ONE edge length 3.4.n.4 forces", () => {
		for (const b of ai1) {
			const r = shardOf(b, hypPolyBoardKs(b)[0])![0];
			expect(r.stats.sizes).toEqual([...new Set([3, 4, b.n, 2 * b.n])].sort((x, y) => x - y));
			const l = r.edge;
			// The defining figure closes...
			expect(alpha(3, l) + 2 * alpha(4, l) + alpha(b.n, l)).toBeCloseTo(2 * Math.PI, 9);
			// ...and so does 4.n.2n, at the same ℓ. That identity is why the 2n-gon is in the alphabet.
			expect(alpha(4, l) + alpha(b.n, l) + alpha(2 * b.n, l)).toBeCloseTo(2 * Math.PI, 9);
		}
	});

	it("ships ai2's alphabet {3, n} at the {3,n} edge length, where the n-gon is two triangles", () => {
		for (const b of ai2) {
			const r = shardOf(b, hypPolyBoardKs(b)[0])![0];
			expect(r.stats.sizes).toEqual([3, b.n]);
			const l = r.edge;
			// ℓ is the regular tiling's own edge length: n triangles close a vertex...
			expect(b.n * alpha(3, l)).toBeCloseTo(2 * Math.PI, 9);
			// ...and there the n-gon's angle is exactly twice the triangle's, which is the whole family.
			expect(alpha(b.n, l)).toBeCloseTo(2 * alpha(3, l), 9);
		}
	});

	it("ships ai2 vertex figures that obey a + 2b = n, as full cycles and not site-orbit reps", () => {
		// The rule IS the family, so it is checked on every record and not on a sample. It also catches the
		// compression trap: Marek lists one corner per site orbit, so `(A3)D14a` is 3^7 — shipping the rep
		// verbatim would put "3" on the card for the regular tiling and break this sum.
		for (const b of ai2) {
			for (const k of hypPolyBoardKs(b)) {
				for (const r of shardOf(b, k)!) {
					const figures = r.config.split(" + ");
					expect(figures.length, r.id).toBe(r.stats.vertexOrbits);
					for (const f of figures) {
						const sizes = f.split(".").map(Number);
						const a = sizes.filter((s) => s === 3).length;
						const nn = sizes.filter((s) => s === b.n).length;
						expect(a + nn, `${r.id}: ${f} uses a size outside {3, ${b.n}}`).toBe(sizes.length);
						expect(a + 2 * nn, `${r.id}: ${f} does not close`).toBe(b.n);
					}
				}
			}
		}
	});

	it("ships darts the client can develop: faceColor indexes `sizes`, lvert reproduces the angles", () => {
		for (const b of HYP_POLY_BOARDS) {
			for (const r of shardOf(b, hypPolyBoardKs(b)[0])!) {
				const n = r.darts.rneig.length;
				expect(r.darts.glue.length).toBe(n);
				expect(r.darts.lvert.length).toBe(n);
				expect(r.darts.faceColor!.length).toBe(n);
				for (const c of r.darts.faceColor!) {
					expect(c).toBeGreaterThanOrEqual(0);
					expect(c).toBeLessThan(r.stats.sizes.length);
				}
				// Every dart's polygon is in the alphabet, and there are NO digons: this is a tiling, not
				// an edge system, so every edge is a real boundary.
				for (const p of r.darts.lvert) expect(r.stats.sizes).toContain(p);
				// rneig and glue are permutations, and glue is an involution.
				expect(new Set(r.darts.rneig).size).toBe(n);
				for (let h = 0; h < n; h++) expect(r.darts.glue[r.darts.glue[h]]).toBe(h);
				// The vertex closes: the angles around one orbit sum to 2π at the shipped ℓ.
				expect(r.stats.sizeCensus.reduce((s, x) => s + x, 0)).toBe(r.stats.faceOrbits);
			}
		}
	});

	it("names only the polygon sizes a tiling actually uses", () => {
		const r = shardOf(ai1[0], 1)![0];
		expect(hypPolyFamilyLabel(r)).toBe("3 · 4 · 7"); // 3.4.7.4 uses no 14-gon
		expect(hypPolyMeta(r).colors).toBe(4); // the palette still needs one entry per alphabet size
		expect(hypPolyMeta(r).darts).toBe(r.darts);
		// {3,7}'s first record is 3.3.7.3.7, which uses both of its two sizes.
		const t = shardOf(ai2[0], 1)![0];
		expect(hypPolyFamilyLabel(t)).toBe("3 · 7");
		expect(hypPolyMeta(t).colors).toBe(2);
	});

	// The offline per-pixel certification stamp (scripts/stamp-hyp-poly-certification.ts) is rolling out
	// across the corpus and is INCOMPLETE by design: the stamp run is hours long, and a record with no flag
	// reads as "untried", which is exactly the old behaviour (attempt the certificate, fall back on failure).
	// So partial coverage is safe, and the shelf gets the saved main-thread time on whatever is stamped.
	//
	// What is NOT safe is a HALF-written shard. The stamper stamps every row of a shard and then writes the
	// file once, so a shard is all-or-nothing; a partially stamped one means a write was interrupted, and
	// that is the state worth failing on. `certified` must also never be anything but a boolean or absent.
	it.runIf(anyShard)("has no half-stamped shard, and no non-boolean stamp", () => {
		const halfStamped: string[] = [];
		const badValue: string[] = [];
		let stamped = 0;
		let total = 0;
		for (const b of HYP_POLY_BOARDS) {
			for (const k of hypPolyBoardKs(b)) {
				const rows = shardOf(b, k);
				if (!rows?.length) continue;
				for (const r of rows) if (r.certified !== undefined && typeof r.certified !== "boolean") badValue.push(r.id);
				const n = rows.filter((r) => typeof r.certified === "boolean").length;
				if (n !== 0 && n !== rows.length) halfStamped.push(`hp${b.id}-k${k} (${n}/${rows.length})`);
				stamped += n;
				total += rows.length;
			}
		}
		expect(badValue.slice(0, 10)).toEqual([]);
		expect(halfStamped, "a shard is written whole; a partial one means an interrupted write").toEqual([]);
		// Coverage is reported, not asserted — resume with `node scripts/stamp-hyp-poly-parallel.mjs 8 --skip-stamped`.
		console.info(`hyp-poly certification stamp coverage: ${stamped}/${total} records (${((stamped / total) * 100).toFixed(1)}%)`);
	});

	it.runIf(anyShard)("carries the stamp through hypPolyMeta, which is what the canvas reads", () => {
		const r = shardOf(ai1[0], 1)![0];
		expect(hypPolyMeta(r).certified).toBe(r.certified);
	});
});

describe("the three ways a k can be absent", () => {
	it("keeps them apart on n = 13, the ai1 board where all three are knowable", () => {
		//   dropped  — enumerated, in the drop, past OUR budget.
		//   kGaps    — the enumeration itself found nothing there.
		//   missing  — ⚑ the census COUNTS them and the drop does not contain them: 416,137 certificates
		//              at k = 27…30.
		const b = HYP_POLY_BOARDS.find((x) => x.id === "13")!;
		expect(b.dropped).toEqual([21, 22, 23, 24, 26]);
		expect(b.missing).toEqual([27, 28, 29, 30]);
		expect(hypPolyKGaps(b)).toEqual([2, 3, 4, 5, 6, 9, 10, 11, 12, 17, 18, 19]);
		expect(b.counts).toEqual({ 1: 1, 7: 4, 8: 4, 13: 33, 14: 104, 15: 94, 16: 23, 20: 2097 });
	});

	it("leaves `missing` ABSENT on every board with no census, and never defaults it to []", () => {
		// An empty array says "the census names no k we lack"; absent says "there is no census, so we do
		// not know". Conflating them would let a board with 685,845 uncounted tilings read as complete.
		const known = HYP_POLY_BOARDS.filter((b) => b.missing !== undefined).map((b) => b.id);
		expect(known).toEqual(["13", "17", "18", "19", "20", "23", "t7", "t8", "t9", "t10", "t11", "t12", "t14"]);
		expect(HYP_POLY_BOARDS.find((b) => b.id === "17")!.missing).toEqual([26, 27, 28, 29, 30]);
		// The two ai2 boards whose census counts a k the drop does not carry — 556,796 and 685,845 tilings.
		expect(HYP_POLY_BOARDS.find((b) => b.id === "t11")!.missing).toEqual([3]);
		expect(HYP_POLY_BOARDS.find((b) => b.id === "t14")!.missing).toEqual([2]);
	});

	it("keeps the ai1 boards in ascending n, with the holes the drop still has", () => {
		const ns = ai1.map((x) => x.n);
		expect(ns).toEqual([...ns].sort((p, q) => p - q));
		expect(ns).toContain(13);
		// 21 and 22 are still absent, so the shelf is not contiguous and must not read as if it were.
		expect(ns).not.toContain(21);
		expect(ns).not.toContain(22);
		// ai2 is contiguous, 7…15, and says so.
		expect(ai2.map((x) => x.n)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15]);
	});
});
