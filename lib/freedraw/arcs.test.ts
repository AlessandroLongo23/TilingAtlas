import { describe, expect, it } from "vitest";
import {
	PORT_END,
	PORT_START,
	figureSelfIntersects,
	randomWiring,
	tileFigure,
	wiringCount,
	wiringCrosses,
	wiringPermutation,
	type Pt,
	type Seg,
	type TileLoop,
	type Wiring,
} from "./arcs";

const SQ: Pt[] = [
	[0, 0],
	[1, 0],
	[1, 1],
	[0, 1],
]; // edge 0 south, 1 east, 2 north, 3 west, counterclockwise
const TRI: Pt[] = [
	[0, 0],
	[1, 0],
	[0.5, Math.sqrt(3) / 2],
];
const HEX: Pt[] = Array.from({ length: 6 }, (_, i): Pt => {
	const a = (i * Math.PI) / 3;
	return [Math.cos(a), Math.sin(a)];
});
// A scalene tile — the Schwarz drafter — where the two ports of a pair have different widths and the
// interior boundary is no longer circular.
const DRAFTER: Pt[] = [
	[0, 0],
	[2, 0],
	[0, Math.sqrt(3)],
];

const on = (n: number, ...ids: number[]) => Array.from({ length: n }, (_, i) => ids.includes(i));

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Walk a loop's vertices: its start plus every segment endpoint. */
const points = (l: TileLoop): Pt[] => [l.start, ...l.segs.map((s) => s.to)];

/** Sample a segment that starts at `from`. */
const at = (from: Pt, s: Seg, t: number): Pt => {
	if (s.kind === "line") return [from[0] + (s.to[0] - from[0]) * t, from[1] + (s.to[1] - from[1]) * t];
	const u = 1 - t;
	const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
	const ps = [from, s.c1, s.c2, s.to];
	return [ps.reduce((a, p, i) => a + w[i] * p[0], 0), ps.reduce((a, p, i) => a + w[i] * p[1], 0)];
};

/** Every point on a tile's boundary loops, as one flat list. */
const allPoints = (loops: TileLoop[]) => loops.flatMap(points);

const ALL_WIRINGS: Wiring[] = ["ribbons", "junction", "caps"];

describe("the port is the middle third of the edge", () => {
	it("is where every loop meets the boundary, on a square", () => {
		const loops = tileFigure(SQ, on(4, 0), { wiring: "caps", twist: 0 });
		expect(loops).toHaveLength(1);
		// The south edge runs (0,0) -> (1,0), so its port is x from 1/3 to 2/3 at y = 0.
		expect(loops[0].start).toEqual([PORT_START, 0]);
		expect(loops[0].segs[0]).toEqual({ kind: "line", to: [PORT_END, 0] });
	});

	it("takes its share of a long edge and a short one alike", () => {
		// The drafter's legs are 2 and sqrt(3); each port is a third of ITS OWN edge, which is what makes
		// two tiles agree across a shared edge whatever the tiling and whatever the tile.
		const loops = tileFigure(DRAFTER, on(3, 0, 2), { wiring: "caps", twist: 0 });
		const widths = loops.map((l) => dist(l.start, l.segs[0].to));
		expect(widths[0]).toBeCloseTo(2 / 3, 12);
		expect(widths[1]).toBeCloseTo(Math.sqrt(3) / 3, 12);
	});

	it("draws nothing when no edge is connected", () => {
		for (const wiring of ALL_WIRINGS) expect(tileFigure(SQ, on(4), { wiring, twist: 0 })).toEqual([]);
	});
});

describe("the count of drawings is c factorial", () => {
	// Every bijection on the connected edges is a drawing, and every drawing is one — which is what makes
	// 24 the number of distinct pairwise connections of a square's edge points with all four connected.
	const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
	for (const c of [0, 1, 2, 3, 4]) {
		it(`${c} connected edges of a square give ${fact(c)}`, () => {
			const perms = permutations(c);
			expect(perms).toHaveLength(fact(c));
			const state = on(4, ...Array.from({ length: c }, (_, i) => i));
			// Each one builds, and each closes every loop it opens.
			for (const p of perms) {
				const loops = tileFigure(SQ, state, undefined, p);
				expect(loops.reduce((n, l) => n + l.segs.length, 0)).toBe(2 * c);
			}
		});
	}
	it("gives 24 with all four connected — Carlson's figure", () => {
		expect(permutations(4)).toHaveLength(24);
	});
});

describe("the three named wirings", () => {
	it('"caps" leaves each port capped where it stands', () => {
		const loops = tileFigure(SQ, on(4, 0, 1, 2, 3), { wiring: "caps", twist: 0 });
		expect(loops).toHaveLength(4);
		// Each loop is exactly its own port plus one cap: two segments, both ends on one edge.
		for (const l of loops) expect(l.segs).toHaveLength(2);
		// The cap is a semicircle over the port. Its deepest point is half a port width in.
		const south = loops[0];
		const mid = at(south.segs[0].to, south.segs[1], 0.5);
		expect(mid[0]).toBeCloseTo(0.5, 12);
		expect(mid[1]).toBeCloseTo(1 / 6, 2);
	});

	it('"junction" closes one loop through every connected edge', () => {
		for (const c of [1, 2, 3, 4]) {
			const state = on(4, ...Array.from({ length: c }, (_, i) => i));
			const loops = tileFigure(SQ, state, { wiring: "junction", twist: 0 });
			expect(loops).toHaveLength(1);
			expect(loops[0].segs).toHaveLength(2 * c);
		}
	});

	it('"junction" on all four is the cross, with quarter-circle corners of radius 1/3', () => {
		const [loop] = tileFigure(SQ, on(4, 0, 1, 2, 3), { wiring: "junction", twist: 0 });
		// The arc leaving the south port's far end curves round the (1,0) corner to where the east port
		// opens. That is the inner wall of the bend: radius 1/3, centred on the corner.
		const arc = loop.segs[1];
		for (const t of [0.2, 0.5, 0.8]) {
			expect(dist(at([PORT_END, 0], arc, t), [1, 0])).toBeCloseTo(1 / 3, 3);
		}
	});

	it('"ribbons" pairs neighbours into bands, and the band has constant width', () => {
		const loops = tileFigure(SQ, on(4, 0, 1, 2, 3), { wiring: "ribbons", twist: 0 });
		expect(loops).toHaveLength(2);
		for (const l of loops) expect(l.segs).toHaveLength(4);
		// The south–east band: its inner wall rides the corner at radius 1/3, its outer at 2/3, so the
		// band is a third of an edge wide everywhere — the property the whole construction rests on.
		const band = loops[0];
		const inner = band.segs[1];
		const outer = band.segs[3];
		for (const t of [0.25, 0.5, 0.75]) {
			expect(dist(at([PORT_END, 0], inner, t), [1, 0])).toBeCloseTo(1 / 3, 3);
			expect(dist(at([1, PORT_END], outer, t), [1, 0])).toBeCloseTo(2 / 3, 3);
		}
	});

	it('"ribbons" caps the odd one out', () => {
		const loops = tileFigure(SQ, on(4, 0, 1, 2), { wiring: "ribbons", twist: 0 });
		expect(loops).toHaveLength(2);
		expect(loops.map((l) => l.segs.length).sort()).toEqual([2, 4]); // one cap, one band
	});

	it("`twist` picks a different pairing, and no turn of the square undoes it", () => {
		const a = tileFigure(SQ, on(4, 0, 1, 2, 3), { wiring: "ribbons", twist: 0 });
		const b = tileFigure(SQ, on(4, 0, 1, 2, 3), { wiring: "ribbons", twist: 1 });
		expect(wiringPermutation(4, { wiring: "ribbons", twist: 0 })).toEqual([1, 0, 3, 2]);
		expect(wiringPermutation(4, { wiring: "ribbons", twist: 1 })).toEqual([3, 2, 1, 0]);
		// Untwisted bends round the (1,0) and (0,1) corners; twisted rounds (1,1) and (0,0). Read off the
		// MIDPOINTS of the interior arcs, not the loop's corners: a port endpoint sits a third from a
		// corner in every wiring, so those cannot tell the two pairings apart.
		const bendsRound = (loops: TileLoop[], corner: Pt) => {
			let from: Pt;
			for (const l of loops) {
				from = l.start;
				for (const s of l.segs) {
					if (s.kind === "curve" && dist(at(from, s, 0.5), corner) < 0.4) return true;
					from = s.to;
				}
			}
			return false;
		};
		expect(bendsRound(a, [1, 0])).toBe(true);
		expect(bendsRound(b, [1, 0])).toBe(false);
		expect(bendsRound(b, [1, 1])).toBe(true);
	});

	it("opposite connected edges give a straight bar under every wiring that joins them", () => {
		for (const wiring of ["ribbons", "junction"] as const) {
			const [loop] = tileFigure(SQ, on(4, 0, 2), { wiring, twist: 0 });
			// Both interior segments are straight: a cubic whose turn is zero degenerates to its chord.
			for (const s of loop.segs) {
				if (s.kind !== "curve") continue;
				expect(Math.abs(s.c1[0] - s.c2[0])).toBeLessThan(1e-9);
			}
			expect(loop.segs).toHaveLength(4);
		}
	});
});

describe("every loop stays inside its tile and closes", () => {
	const tiles: [string, Pt[]][] = [
		["square", SQ],
		["triangle", TRI],
		["hexagon", HEX],
		["drafter", DRAFTER],
	];

	for (const [name, corners] of tiles) {
		it(name, () => {
			const n = corners.length;
			for (let mask = 0; mask < 1 << n; mask++) {
				const state = Array.from({ length: n }, (_, i) => ((mask >> i) & 1) === 1);
				for (const wiring of ALL_WIRINGS) {
					for (const twist of [0, 1] as const) {
						const loops = tileFigure(corners, state, { wiring, twist });
						const live = state.filter(Boolean).length;
						// Two segments per connected edge — one port, one interior arc — across all loops.
						expect(loops.reduce((a, l) => a + l.segs.length, 0)).toBe(2 * live);
						for (const l of loops) {
							// Sampled densely, no point escapes the tile.
							let from = l.start;
							for (const s of l.segs) {
								for (let i = 0; i <= 8; i++) expect(inside(corners, at(from, s, i / 8))).toBe(true);
								from = s.to;
							}
							// And the walk returns to where it started.
							expect(dist(from, l.start)).toBeLessThan(1e-9);
						}
					}
				}
			}
		});
	}
});

/** Is p inside the convex polygon (tolerantly — the boundary counts)? */
function inside(corners: readonly Pt[], p: Pt): boolean {
	const n = corners.length;
	let area2 = 0;
	for (let i = 0; i < n; i++) {
		area2 += corners[i][0] * corners[(i + 1) % n][1] - corners[(i + 1) % n][0] * corners[i][1];
	}
	const sign = area2 >= 0 ? 1 : -1;
	for (let i = 0; i < n; i++) {
		const a = corners[i];
		const b = corners[(i + 1) % n];
		const cross = ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) * sign;
		if (cross < -1e-9) return false;
	}
	return true;
}

function permutations(c: number): number[][] {
	if (c === 0) return [[]];
	const out: number[][] = [];
	const walk = (left: number[], acc: number[]) => {
		if (left.length === 0) {
			out.push([...acc]);
			return;
		}
		for (let i = 0; i < left.length; i++) {
			walk([...left.slice(0, i), ...left.slice(i + 1)], [...acc, left[i]]);
		}
	};
	walk(
		Array.from({ length: c }, (_, i) => i),
		[],
	);
	return out;
}

describe("only the non-crossing wirings are drawings", () => {
	// A crossed wiring's loops overlap, and the overlap is inside two of them at once — so its colour
	// has to come from a winding rule, and there is no honest black/white answer for it. The embedded
	// ones are the non-crossing perfect matchings of the boundary points: Catalan(c), not c!.
	const cat = [1, 1, 2, 5, 14, 42, 132, 429];

	for (let c = 1; c <= 6; c++) {
		it(`${c} connected edges: ${cat[c]} of the ${[1, 1, 2, 6, 24, 120, 720][c]} wirings are embedded`, () => {
			expect(wiringCount(c)).toBe(cat[c]);
			// Brute force agrees with the Catalan count, which is what makes wiringCrosses the definition.
			const embedded = permutations(c).filter((p) => !wiringCrosses(p));
			expect(embedded).toHaveLength(cat[c]);
		});
	}

	it("the three named wirings are all embedded, at every port count", () => {
		for (let c = 1; c <= 8; c++) {
			for (const wiring of ALL_WIRINGS) {
				for (const twist of [0, 1] as const) {
					expect(wiringCrosses(wiringPermutation(c, { wiring, twist }))).toBe(false);
				}
			}
		}
	});

	it("randomWiring only ever draws embedded ones, and reaches all of them", () => {
		let s = 12345;
		const next = () => {
			s ^= s << 13;
			s ^= s >>> 17;
			s ^= s << 5;
			return (s >>> 0) / 0x100000000;
		};
		for (const c of [1, 2, 3, 4, 5, 6]) {
			const seen = new Set<string>();
			for (let i = 0; i < 4000; i++) {
				const w = randomWiring(c, next);
				expect(w).toHaveLength(c);
				expect([...w].sort((a, b) => a - b)).toEqual(Array.from({ length: c }, (_, k) => k));
				expect(wiringCrosses(w)).toBe(false);
				seen.add(w.join(","));
			}
			// 4000 draws over at most 132 outcomes: anything missing would be a hole in the sampler.
			expect(seen.size).toBe(cat[c]);
		}
	});

	it("on a REGULAR tile, every embedded wiring is disjoint on the page too", () => {
		// Non-crossing chords CAN be drawn disjointly; that these particular cubics are is a separate,
		// geometric fact, and it is only guaranteed where the tile is regular. All 14 of a square, all 5
		// of a triangle, all 132 of a hexagon.
		for (const corners of [SQ, TRI, HEX]) {
			const c = corners.length;
			for (const perm of permutations(c).filter((p) => !wiringCrosses(p))) {
				const loops = tileFigure(corners, on(c, ...Array.from({ length: c }, (_, i) => i)), undefined, perm);
				const arcs: Pt[][] = [];
				for (const l of loops) {
					let from = l.start;
					for (const s of l.segs) {
						if (s.kind === "curve") {
							arcs.push(Array.from({ length: 21 }, (_, i) => at(from, s, i / 20)));
						}
						from = s.to;
					}
				}
				for (let i = 0; i < arcs.length; i++) {
					for (let j = i + 1; j < arcs.length; j++) {
						for (let u = 0; u + 1 < arcs[i].length; u++) {
							for (let v = 0; v + 1 < arcs[j].length; v++) {
								expect(segmentsCross(arcs[i][u], arcs[i][u + 1], arcs[j][v], arcs[j][v + 1])).toBe(false);
							}
						}
					}
				}
			}
		}
	});

	it("on a long enough SCALENE tile it is not, which is why the random draw checks", () => {
		// The 30-60-90 drafter: one wiring of its five sends the band's outer wall through the third
		// edge's cap, because the tile is long enough for the sweep to reach. Nothing combinatorial sees
		// this, so `drawWiring` (lib/render/truchetTiling.ts) redraws when figureSelfIntersects says so.
		const all = on(3, 0, 1, 2);
		const bad = permutations(3)
			.filter((p) => !wiringCrosses(p))
			.filter((p) => figureSelfIntersects(tileFigure(DRAFTER, all, undefined, p)));
		expect(bad).toHaveLength(1);
		expect(bad[0]).toEqual([2, 1, 0]);
		// And the three named wirings are not among them, on this tile or any tested one.
		for (const wiring of ALL_WIRINGS) {
			for (const corners of [SQ, TRI, HEX, DRAFTER]) {
				const state = corners.map(() => true);
				const perm = wiringPermutation(corners.length, { wiring, twist: 0 });
				expect(figureSelfIntersects(tileFigure(corners, state, undefined, perm))).toBe(false);
			}
		}
	});
});

/** Do two closed segments properly cross? Shared endpoints (arcs meeting at a port) do not count. */
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
	const side = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
	const EPS = 1e-9;
	for (const [p, q] of [[a, c], [a, d], [b, c], [b, d]] as [Pt, Pt][]) {
		if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-7) return false; // they meet, they don't cross
	}
	const d1 = side(a, b, c);
	const d2 = side(a, b, d);
	const d3 = side(c, d, a);
	const d4 = side(c, d, b);
	return d1 * d2 < -EPS && d3 * d4 < -EPS;
}
