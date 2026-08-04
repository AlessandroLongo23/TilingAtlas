import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	hypPolyBoardKs,
	hypPolyBoardLabel,
	hypPolyFamilyLabel,
	hypPolyKGaps,
	hypPolyMeta,
	hypPolyShardUrl,
	HYP_POLY_BOARDS,
	type HypPolyBoard,
	type HypPolyPattern,
} from "./hyp-poly";

// The 3.4.n.4 shelf's decode checks. develop_ai1.py already refuses anything that does not develop, so
// what matters here is that the SHIPPED data says true things: the alphabet is the one the board's edge
// length forces, the manifest matches the files, and the two different kinds of missing k (the corpus
// has none / this shelf did not ship it) stay distinguishable.

const shardOf = (b: HypPolyBoard, k: number): HypPolyPattern[] | null => {
	const f = `public${hypPolyShardUrl(b.n, k)}`;
	return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as HypPolyPattern[]) : null;
};

const anyShard = existsSync("public/hyperbolic-poly/hp7-k1.json");

/** Interior angle of a regular p-gon of edge ℓ in H² — the same formula the developer and the client use. */
const alpha = (p: number, l: number) => 2 * Math.asin(Math.cos(Math.PI / p) / Math.cosh(l / 2));

describe("3.4.n.4 board manifest", () => {
	it("gives every board a distinct n, at least one k, and no k both eager and lazy", () => {
		expect(new Set(HYP_POLY_BOARDS.map((b) => b.n)).size).toBe(HYP_POLY_BOARDS.length);
		for (const b of HYP_POLY_BOARDS) {
			expect(hypPolyBoardKs(b).length).toBeGreaterThan(0);
			expect(b.eagerKs.filter((k) => b.lazyKs.includes(k))).toEqual([]);
			expect(Object.keys(b.counts).map(Number).sort((x, y) => x - y)).toEqual(hypPolyBoardKs(b));
		}
	});

	it("is hyperbolic on every board — n >= 7", () => {
		// 3.4.n.4 is spherical for n = 3, 4, 5 and Euclidean at n = 6; only n >= 7 develops in the disk.
		for (const b of HYP_POLY_BOARDS) expect(b.n).toBeGreaterThanOrEqual(7);
	});

	it("keeps `dropped` above the shipped range, so it cannot be read as a k hole", () => {
		// The two claims must not blur: `dropped` is THIS SHELF's develop budget and always a tail;
		// hypPolyKGaps is the CORPUS having nothing there. A dropped k inside the shipped range would
		// make the distinction meaningless.
		for (const b of HYP_POLY_BOARDS) {
			const ks = hypPolyBoardKs(b);
			const top = ks[ks.length - 1];
			for (const d of b.dropped) expect(d, `n=${b.n}`).toBeGreaterThan(top);
			expect(b.dropped.length, `n=${b.n} is truncated, so it must say where`).toBeGreaterThan(0);
		}
	});

	it("reports the corpus's own k holes", () => {
		// n = 11 is the board with real holes: Marek enumerated nothing at k = 2…5, 8…10, 15, 16.
		expect(hypPolyKGaps(HYP_POLY_BOARDS.find((b) => b.n === 11)!)).toEqual([2, 3, 4, 5, 8, 9, 10, 15, 16]);
		expect(hypPolyKGaps(HYP_POLY_BOARDS.find((b) => b.n === 8)!)).toEqual([]);
	});

	it("labels a board by the vertex figure that defines it", () => {
		expect(hypPolyBoardLabel("7")).toBe("3.4.7.4");
		expect(hypPolyBoardLabel("16")).toBe("3.4.16.4");
	});
});

describe.skipIf(!anyShard)("3.4.n.4 shards", () => {
	it("matches the manifest: every listed (board, k) exists with the listed count", () => {
		for (const b of HYP_POLY_BOARDS) {
			for (const k of hypPolyBoardKs(b)) {
				const recs = shardOf(b, k);
				expect(recs, `n=${b.n} k=${k}`).not.toBeNull();
				expect(recs!.length, `n=${b.n} k=${k}`).toBe(b.counts[k]);
				for (const r of recs!) {
					expect(r.k).toBe(k);
					expect(r.base).toBe(String(b.n));
					expect(r.family).toBe(`3.4.${b.n}.4`);
				}
			}
		}
	});

	it("ships the alphabet {3, 4, n, 2n} at the ONE edge length 3.4.n.4 forces", () => {
		for (const b of HYP_POLY_BOARDS) {
			const r = shardOf(b, hypPolyBoardKs(b)[0])![0];
			expect(r.stats.sizes).toEqual([...new Set([3, 4, b.n, 2 * b.n])].sort((x, y) => x - y));
			const l = r.edge;
			// The defining figure closes...
			expect(alpha(3, l) + 2 * alpha(4, l) + alpha(b.n, l)).toBeCloseTo(2 * Math.PI, 9);
			// ...and so does 4.n.2n, at the same ℓ. That identity is why the 2n-gon is in the alphabet.
			expect(alpha(4, l) + alpha(b.n, l) + alpha(2 * b.n, l)).toBeCloseTo(2 * Math.PI, 9);
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
		const r = shardOf(HYP_POLY_BOARDS[0], 1)![0];
		expect(hypPolyFamilyLabel(r)).toBe("3 · 4 · 7"); // 3.4.7.4 uses no 14-gon
		expect(hypPolyMeta(r).colors).toBe(4); // the palette still needs one entry per alphabet size
		expect(hypPolyMeta(r).darts).toBe(r.darts);
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
				if (n !== 0 && n !== rows.length) halfStamped.push(`hp${b.n}-k${k} (${n}/${rows.length})`);
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
		const r = shardOf(HYP_POLY_BOARDS[0], 1)![0];
		expect(hypPolyMeta(r).certified).toBe(r.certified);
	});
});
