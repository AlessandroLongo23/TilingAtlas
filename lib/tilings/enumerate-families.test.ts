import { describe, it, expect } from "vitest";
import { vertexTypes, enumerateFamilies } from "@/lib/tilings/enumerate-families";
import { ENUMERATED_FAMILIES, ENUMERATION_SCOPE } from "@/lib/tilings/enumerated-families.generated";
import { evaluateParamCell } from "@/lib/utils/paramCell";
import { ENUM_FAMILIES } from "@/lib/tilings/length-families";

const PAL = { ns: [3, 4, 6], maxFlats: 12 };

type Pt = [number, number];
function inPolygon(p: Pt, vs: Pt[]): boolean {
	let hit = false;
	for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
		const [xi, yi] = vs[i], [xj, yj] = vs[j];
		if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
	}
	return hit;
}

describe("the oracle-free enumerator", () => {
	it("stage 1: the vertex alphabet is finite and contains the T-junction types", () => {
		const vt = vertexTypes(PAL).map((w) => w.map((u) => u * 30).join("."));
		expect(vt.length).toBe(15);
		// every type sums to 360 and carries at most one flat
		for (const w of vertexTypes(PAL)) {
			expect(w.reduce((a, b) => a + b, 0)).toBe(12);
			expect(w.filter((a) => a === 6).length).toBeLessThanOrEqual(1);
			expect(w.length).toBeGreaterThanOrEqual(3);
			expect(w.length).toBeLessThanOrEqual(6);
		}
		// the three T-junction vertices the whole non-edge-to-edge story runs on
		expect(vt).toContain("90.90.180");
		expect(vt).toContain("60.60.60.180");
		expect(vt).toContain("60.120.180");
	});

	it("stage 2+3: the sweep at V <= 3 is reproducible and finds seven families", () => {
		const fams = enumerateFamilies(PAL, { Vmax: 3 });
		expect(fams.length).toBe(7);
		expect(fams.every((f) => f.dim === 2)).toBe(true); // one essential parameter each
		const sig = fams.map((f) => `${f.V}-${f.E}-${f.F}-${f.tiles.join(",")}`).sort();
		expect(sig).toEqual([
			"2-3-1-4", "2-4-2-3,3", "3-5-2-4,4", "3-5-2-4,4",
			"3-6-3-3,3,3", "3-6-3-3,3,4", "3-7-4-3,3,3,3",
		]);
	});

	it("rediscovers, without being told, three families that were built by hand", () => {
		// The check that gives the argument teeth: the search knows nothing about the literature or about
		// length-families.ts, yet the offset squares (Wikipedia 1-2), the offset triangles (3) and the
		// three size triangles (7) come out of it with the map counts those families measure.
		const by = new Map(enumerateFamilies(PAL, { Vmax: 3 })
			.map((f) => [`${f.V}-${f.E}-${f.F}-${f.tiles.join(",")}`, f]));
		expect(by.get("2-3-1-4")).toBeDefined();      // plen-strip-s
		expect(by.get("2-4-2-3,3")).toBeDefined();    // plen-strip-t
		expect(by.get("3-6-3-3,3,3")).toBeDefined();  // plen-tri-three-size
	});

	it("every corner of every slider box is a real tiling, and the box is not loose", () => {
		// `ranges` is not a guess. Edge e has length K[0][e] + sum_i c_i*K[i+1][e], and the box is the
		// largest cube about the sample on which every one of them stays positive — so every CORNER is
		// still a tiling (that is what interval arithmetic buys), and stepping past the box in the worst
		// direction is not. (This is a statement about THIS map, not about the plane: past the brick's
		// endpoint the tiling still exists, it is just described by a different map with the pieces
		// relabelled.)
		for (const f of enumerateFamilies(PAL, { Vmax: 3 })) {
			const minLen = (c: number[]) =>
				Math.min(...f.cone[0].map((v, e) => v + c.reduce((a, x, i) => a + x * f.cone[i + 1][e], 0)));
			const P = f.c0.length;
			expect(P, "a parametric family has at least one slider").toBeGreaterThan(0);
			expect(minLen(f.c0), "interior").toBeGreaterThan(1e-9);
			for (let mask = 0; mask < (1 << P); mask++) {
				const c = f.c0.map((_, i) => f.ranges[i][(mask >> i) & 1]);
				expect(minLen(c), `box corner ${mask}`).toBeGreaterThan(-1e-9);
			}
			expect(f.ranges.every((r, i) => r[0] < f.c0[i] && f.c0[i] < r[1]), "sample inside the box").toBe(true);
			// Not loose: push every end 5% further from the sample and some corner goes non-positive —
			// unless every end sits at the FAR cap, which is what an unbounded direction looks like.
			const CAP = 3.9;   // see FAR in realize(): an unbounded direction stops 4 past the sample
			const capped = f.ranges.every((r, i) => Math.abs(r[0] - f.c0[i]) > CAP && Math.abs(r[1] - f.c0[i]) > CAP);
			if (!capped) {
				const worst = Math.min(...Array.from({ length: 1 << P }, (_, mask) =>
					minLen(f.c0.map((v, i) => v + (f.ranges[i][(mask >> i) & 1] - v) * 1.05))));
				expect(worst, "the box is the largest one that fits").toBeLessThan(1e-6);
			}
			expect(f.lengths.every((l) => l > 1e-9)).toBe(true);
		}
	});

	it("every enumerated family really tiles, at both ends of its slider and in the middle", () => {
		// The search can be wrong in a way the linear algebra cannot see — a bad lattice, a face laid out
		// the wrong way round. Covering multiplicity is the arbiter: exactly one tile over each sample.
		for (const row of ENUM_FAMILIES) {
			const [lo, hi] = row.cell.params[0].alphaRangeDegOpen;
			for (const t of [lo + (hi - lo) * 0.05, (lo + hi) / 2, hi - (hi - lo) * 0.05]) {
				const cell = evaluateParamCell(row.cell, [t]);
				const [t1, t2] = cell.basis as number[][];
				const polys = (cell.cellPolygons as { v: Pt[] }[]) ?? [];
				const long = Math.max(Math.hypot(t1[0], t1[1]), Math.hypot(t2[0], t2[1]));
				const short = Math.min(Math.hypot(t1[0], t1[1]), Math.hypot(t2[0], t2[1]));
				const det = Math.abs(t1[0] * t2[1] - t1[1] * t2[0]);
				const span = long * 2;
				const R = Math.ceil(span / Math.min(short, det / long)) + 2;
				for (let s = 1; s <= 24; s++) {
					const p: Pt = [((s * Math.SQRT2) % 1) * span - span / 2, ((s * Math.E) % 1) * span - span / 2];
					let n = 0;
					for (let i = -R; i <= R; i++)
						for (let j = -R; j <= R; j++) {
							const q: Pt = [p[0] - i * t1[0] - j * t2[0], p[1] - i * t1[1] - j * t2[1]];
							for (const poly of polys) if (inPolygon(q, poly.v)) n++;
						}
					expect(n, `${row.id} t=${t.toFixed(3)} point (${p[0].toFixed(2)}, ${p[1].toFixed(2)})`).toBe(1);
				}
			}
		}
	});

	it("the generated data file's V <= 3 part matches what the enumerator produces now", () => {
		// The committed file is swept to ENUMERATION_SCOPE.Vmax, which is expensive to reproduce in a
		// unit test (V = 4 runs for tens of minutes). Re-running the CHEAP prefix and checking it against
		// the corresponding slice of the file is the same consistency guarantee at a fraction of the cost.
		expect(ENUMERATION_SCOPE.Vmax).toBeGreaterThanOrEqual(3);
		const fams = enumerateFamilies(PAL, { Vmax: 3 });
		const got = ENUMERATED_FAMILIES.filter((f) => f.V <= 3).map((f) => `${f.V}-${f.E}-${f.F}`).sort();
		expect(got).toEqual(fams.map((f) => `${f.V}-${f.E}-${f.F}`).sort());
	});
});
