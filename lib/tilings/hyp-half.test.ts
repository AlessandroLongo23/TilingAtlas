import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	hypHalfFamilyLabel,
	hypHalfKGaps,
	hypHalfLazyShardsForK,
	hypHalfShardUrl,
	hypHalfSubOfBoard,
	HYP_HALF_BOARDS,
	type HypHalfBoard,
} from "./hyp-half";
// A half-tile record IS a HypPolyPattern — same quotient, same client renderer, no new type.
import type { HypPolyPattern } from "./hyp-poly";

// The halved-{p,q} shelf. Six boards, 23,372 tilings, and until this file existed nothing checked any of
// it — which is how two of them shipped calling a quadrilateral a triangle.
//
// The certificate is in develop_hyp_half.py and it is a proof, so this is not a second opinion on
// whether these tilings exist. What it guards is the SHELF: that the metadata's three different claims
// about a missing k stay apart, that the shards hold what the metadata says, and that the numbers on the
// tiles are the ones {p,q} forces — which is the part a typo in a palette would quietly break.

const shardOf = (b: HypHalfBoard, k: number): HypPolyPattern[] | null => {
	const f = `public${hypHalfShardUrl(b.id, k)}`;
	return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as HypPolyPattern[]) : null;
};

const anyShard = existsSync("public/hyperbolic-half/hyphalf-45-half-k2.json");
const shipped = (b: HypHalfBoard) => [...b.eagerKs, ...b.lazyKs].sort((x, y) => x - y);

/** Which {p,q} each board halves, and how. The boards do not carry p and q — their labels do, and a
 *  test that re-parsed the label would be checking the label against itself. */
const CUT: Record<string, { p: number; q: number; kind: "diagonal" | "mirror" }> = {
	"45-half": { p: 4, q: 5, kind: "diagonal" },
	"46-half": { p: 4, q: 6, kind: "diagonal" },
	"64-half": { p: 6, q: 4, kind: "diagonal" },
	"37-half": { p: 3, q: 7, kind: "mirror" },
	"38-half": { p: 3, q: 8, kind: "mirror" },
	"54-half": { p: 5, q: 4, kind: "mirror" },
};

/** The regular {p,q} tiling's own edge length and circumradius, from the characteristic triangle. */
const pqEdge = (p: number, q: number) => 2 * Math.acosh(Math.cos(Math.PI / p) / Math.sin(Math.PI / q));
const pqCircum = (p: number, q: number) => Math.acosh(1 / Math.tan(Math.PI / p) / Math.tan(Math.PI / q));

describe("board manifest", () => {
	it("gives every board a distinct id and sub, and no k both eager and lazy", () => {
		expect(new Set(HYP_HALF_BOARDS.map((b) => b.id)).size).toBe(HYP_HALF_BOARDS.length);
		expect(new Set(HYP_HALF_BOARDS.map(hypHalfSubOfBoard)).size).toBe(HYP_HALF_BOARDS.length);
		for (const b of HYP_HALF_BOARDS) {
			expect(shipped(b).length, b.id).toBeGreaterThan(0);
			expect(b.eagerKs.filter((k) => b.lazyKs.includes(k)), b.id).toEqual([]);
			expect(Object.keys(b.counts).map(Number).sort((x, y) => x - y)).toEqual(shipped(b));
		}
	});

	it("accounts for EVERY k the search covered, exactly once", () => {
		// The whole point of the three fields. `emptyKs` is the board having nothing there, `dropped` is
		// our budget, shipped is on the shelf — and above `enumeratedTo` nothing is claimed at all. If a k
		// could sit in two of them, or in none, the coverage statement would mean nothing.
		for (const b of HYP_HALF_BOARDS) {
			for (let k = 1; k <= b.enumeratedTo; k++) {
				const where = [
					b.eagerKs.includes(k) || b.lazyKs.includes(k),
					b.emptyKs.includes(k),
					b.dropped.includes(k),
				].filter(Boolean).length;
				expect(where, `${b.id} k=${k} is claimed ${where} times`).toBe(1);
			}
			for (const k of [...shipped(b), ...b.emptyKs, ...b.dropped]) {
				expect(k, `${b.id}: k=${k} is above enumeratedTo`).toBeLessThanOrEqual(b.enumeratedTo);
			}
			expect(b.counts[b.dropped[0]], `${b.id}: a dropped k must not carry a count`).toBeUndefined();
		}
	});

	it("ships a contiguous k range on every board, so a hole is never a shrug", () => {
		for (const b of HYP_HALF_BOARDS) expect(hypHalfKGaps(b), b.id).toEqual([]);
	});

	it("offers each lazy slice at its own k and nowhere else", () => {
		// The shelf and /play both fetch through this, so a board listed at the wrong k would leave its
		// chip permanently empty. Five lazy slices now, where the comment in reference-shelf.tsx said one.
		const lazy = HYP_HALF_BOARDS.flatMap((b) => b.lazyKs.map((k) => `${b.id}@${k}`)).sort();
		expect(lazy).toEqual(["45-half@4", "46-half@2", "46-half@3", "64-half@3", "64-half@4"]);
		for (const b of HYP_HALF_BOARDS) {
			for (let k = 1; k <= b.enumeratedTo; k++) {
				expect(hypHalfLazyShardsForK(k).some((x) => x.id === b.id), `${b.id} k=${k}`)
					.toBe(b.lazyKs.includes(k));
			}
		}
	});

	it("names {4,6} k=4 as the only thing enumerated and left off", () => {
		// Roughly 400,000 tilings. Everything else on the shelf is either shipped or provably absent, and
		// this test is what stops that quietly ceasing to be true.
		expect(HYP_HALF_BOARDS.filter((b) => b.dropped.length > 0).map((b) => `${b.id} k=${b.dropped}`))
			.toEqual(["46-half k=4"]);
	});
});

describe("the tile is the one {p,q} forces", () => {
	it("halves the face: two tiles' angles are the whole face's, and the area works out", () => {
		for (const b of HYP_HALF_BOARDS) {
			const { p, q } = CUT[b.id];
			// A {p,q} face has p corners of 2*pi/q, so its area is p*(2*pi/q) - (p-2)*pi by Gauss-Bonnet
			// (negated: it is the DEFICIT). Half of that is the tile's deficit against its own flat sum.
			const faceDeficit = (p - 2) * Math.PI - (p * 2 * Math.PI) / q;
			const flat = (b.angles.length - 2) * 180;
			const tileDeficit = ((flat - b.angles.reduce((s, a) => s + a, 0)) * Math.PI) / 180;
			expect(tileDeficit, b.id).toBeGreaterThan(0); // hyperbolic, not Euclidean or spherical
			// 7 places, because `angles` is rounded for display and {3,7}'s 360/7 carries 2.5e-9 of that
			// rounding into the area. Still four orders tighter than any real shape error.
			expect(tileDeficit, b.id).toBeCloseTo(faceDeficit / 2, 7);
		}
	});

	it("puts the {p,q} edge and the cut at the lengths the regular tiling forces", () => {
		for (const b of HYP_HALF_BOARDS) {
			const { p, q, kind } = CUT[b.id];
			const edge = pqEdge(p, q);
			if (kind === "diagonal") {
				// Vertex to opposite vertex through the centre, so the cut is 2R; the other side is the
				// {p,q} edge itself. (A {4,q} diagonal joins opposite corners of a square, likewise 2R.)
				expect(b.sides, b.id).toHaveLength(2);
				expect(b.sides[0], b.id).toBeCloseTo(edge, 8);
				expect(b.sides[1], b.id).toBeCloseTo(2 * pqCircum(p, q), 8);
			} else {
				// The foot lands at an edge MIDPOINT, so the board carries both the {p,q} edge and half of
				// it — AL's 2:1 observation, and it holds on all three mirror boards. Which POSITION the
				// full edge takes is not fixed: it is the longest side on {3,7} and {3,8} and the middle
				// one on {5,4}, where the mirror segment outruns it. Asserting a position instead of the
				// relation is what this test did first, and {3,7} failed it.
				expect(b.sides, b.id).toHaveLength(3);
				const has = (x: number) => b.sides.some((s) => Math.abs(s - x) < 1e-8);
				expect(has(edge), `${b.id} carries the {p,q} edge ${edge}`).toBe(true);
				expect(has(edge / 2), `${b.id} carries half of it`).toBe(true);
			}
		}
	});

	it("gives the dual pair {6,4} and {4,6} the SAME cut edge", () => {
		// cosh R = cot(pi/p)cot(pi/q) is symmetric in p and q, so dual pairs share a circumradius and both
		// diagonals are 2R. Nothing else about the two tiles matches — one is a triangle, one a
		// quadrilateral — which is why this reads as a coincidence until you write the formula down.
		const by = (id: string) => HYP_HALF_BOARDS.find((b) => b.id === id)!;
		expect(by("64-half").sides[1]).toBeCloseTo(by("46-half").sides[1], 9);
		expect(by("64-half").sides[0]).not.toBeCloseTo(by("46-half").sides[0], 3);
	});

	it("has a k=1 slice exactly when 2q/p is a whole number", () => {
		// The counting argument: a diagonal puts 2 cut-endpoints on the face, pF = qV, so the average
		// vertex is an endpoint of 2q/p diagonals — and a vertex-transitive tiling needs every vertex to
		// hit that average. 5/2 and 4/3 are not whole, 3 is. This is the ONLY board with tilings at k=1.
		for (const b of HYP_HALF_BOARDS.filter((x) => CUT[x.id].kind === "diagonal")) {
			const { p, q } = CUT[b.id];
			const whole = (2 * q) % p === 0;
			expect(shipped(b).includes(1), `${b.id}: 2q/p = ${(2 * q) / p}`).toBe(whole);
			expect(b.emptyKs.includes(1), b.id).toBe(!whole);
		}
	});
});

describe.skipIf(!anyShard)("shards", () => {
	it("matches the manifest: every shipped (board, k) exists with the listed count", () => {
		for (const b of HYP_HALF_BOARDS) {
			for (const k of shipped(b)) {
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
		// And no shard for a k the metadata does not claim — a dropped or empty k with a file on disk
		// would be a slice the shelf can never reach.
		for (const b of HYP_HALF_BOARDS) {
			for (const k of [...b.emptyKs, ...b.dropped]) {
				expect(existsSync(`public${hypHalfShardUrl(b.id, k)}`), `${b.id} k=${k}`).toBe(false);
			}
		}
	});

	it("calls a face by its real side count, on the quadrilateral boards too", () => {
		// {5,4} and {6,4} halve into QUADRILATERALS and both shipped `sizes: [3]` and `lvert: 3`. The
		// client reads lvert for the face-size term of its develop margin — asinh(sinh(l/2)/sin(pi/p))
		// grows with p — so calling a quadrilateral a triangle under-reserves the radius and can clip a
		// face at the view rim. One entry, because the palette has one tile; the VALUE is the tile.
		for (const b of HYP_HALF_BOARDS) {
			const n = b.angles.length;
			for (const r of shardOf(b, shipped(b)[0])!) {
				expect(r.stats.sizes, r.id).toEqual([n]);
				expect(r.stats.sizeCensus, r.id).toEqual([r.stats.faceOrbits]);
				for (const p of r.darts.lvert) expect(p, r.id).toBe(n);
			}
		}
	});

	it("ships darts that close: rneig a permutation, glue an involution, every vertex a full turn", () => {
		// The certificate again, in a second language and on the SHIPPED bytes rather than on the
		// developer's own arrays. The quotient is folded, so a vertex cycle is the star divided by the
		// site symmetry: it sums to 2*pi/m for a whole m, not to 2*pi.
		//
		// The checking is plain JS and the assertion is ONE per shard. Written as an expect() per dart it
		// made ~3.5 M assertion calls over 23,372 quotients, which passed alone and timed out inside the
		// full suite — and a guard that is flaky under load is worse than no guard.
		const bad: string[] = [];
		for (const b of HYP_HALF_BOARDS) {
			for (const k of shipped(b)) {
				const rows = shardOf(b, k)!;
				for (const r of rows) {
					const { rneig, glue, alpha, elen, drawn } = r.darts;
					const n = rneig.length;
					const say = (why: string) => bad.push(`${r.id}: ${why}`);
					if (new Set(rneig).size !== n) say("rneig is not a permutation");
					for (let h = 0; h < n; h++) {
						if (glue[glue[h]] !== h) { say("glue is not an involution"); break; }
						if (Math.abs(elen![h] - elen![glue[h]]) > 1e-12) { say("an edge disagrees with its partner"); break; }
						if (drawn![h] !== 1) { say("an edge is not drawn"); break; } // every edge is a real boundary
					}
					const seen = new Set<number>();
					let orbits = 0;
					for (let s = 0; s < n; s++) {
						if (seen.has(s)) continue;
						let x = s;
						let tot = 0;
						while (!seen.has(x)) {
							seen.add(x);
							tot += alpha![x];
							x = rneig[x];
						}
						const m = (2 * Math.PI) / tot;
						if (Math.abs(m - Math.round(m)) > 1e-9) say(`a vertex sums to ${tot}, not 2pi/m`);
						orbits++;
					}
					if (orbits !== r.stats.vertexOrbits) say("vertexOrbits disagrees with the rneig cycles");
					// k is the number of vertex ORBITS; the dart set is chirality-doubled, so a vertex shows
					// up as two rneig cycles unless a mirror through it identifies them.
					if (orbits < k || orbits > 2 * k) say(`${orbits} vertex cycles outside [k, 2k] for k=${k}`);
				}
				expect(bad.slice(0, 5), `${b.id} k=${k} (${bad.length} of ${rows.length} bad)`).toEqual([]);
			}
		}
	});

	it("uses only the board's own angles and lengths, to full precision", () => {
		for (const b of HYP_HALF_BOARDS) {
			const angles = b.angles.map((a) => (a * Math.PI) / 180);
			for (const r of shardOf(b, shipped(b)[0])!) {
				for (const a of r.darts.alpha!) {
					// 1e-7, not 1e-9: `angles` is display metadata rounded to six decimal places, and
					// {3,7}'s 180/7 = 25.714286 is 5e-9 rad away from the value the darts carry. The darts
					// are the exact ones; it is the board's own label that is rounded.
					expect(angles.some((x) => Math.abs(x - a) < 1e-7), `${r.id}: stray angle ${a}`).toBe(true);
				}
				for (const l of r.darts.elen!) {
					expect(b.sides.some((x) => Math.abs(x - l) < 1e-8), `${r.id}: stray length ${l}`).toBe(true);
				}
				// `edge` is the develop-radius margin's input, so it must be the LONGEST class, not the
				// scalar a regular board would carry.
				expect(r.edge).toBeCloseTo(Math.max(...b.sides), 8);
			}
		}
	});

	it("names the board, the tile's shape and the quotient size on the card", () => {
		const tri = shardOf(HYP_HALF_BOARDS.find((b) => b.id === "46-half")!, 1)![0];
		expect(hypHalfFamilyLabel(tri)).toBe(`{4,6} halved · 60-30-30 triangle · ${tri.tiles} tiles per quotient`);
		// The quadrilateral boards said "triangle" here before the shape was read off the angle count.
		const quad = shardOf(HYP_HALF_BOARDS.find((b) => b.id === "64-half")!, 2)![0];
		expect(hypHalfFamilyLabel(quad)).toContain("90-90-45-45 quadrilateral");
	});
});
