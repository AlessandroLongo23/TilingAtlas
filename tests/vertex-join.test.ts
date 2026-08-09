import { describe, expect, it } from "vitest";
import { COMPAT_EDGES, COMPAT_NODES } from "@/lib/defense/vcCompatibility";
import { figureFromPlacedPolys } from "@/lib/render/vertexFigure";
import { attemptJoin, joinFigures } from "@/lib/render/vertexJoin";
import type { RawPolygon } from "@/lib/utils/renderTiling";

// The defense slide "When two vertices can meet" draws a compatible pair as an actual patch. That
// picture is a claim — these two configurations fit at the ends of one edge — and the claim has to
// agree with the relation the deck's graph is drawn from, which comes from the enumeration's own
// `VertexConfiguration.isCompatible`. Two independent pieces of code, one answer.

const words = COMPAT_NODES.map((n) => n.word);
const edges = new Set(COMPAT_EDGES.map(([a, b]) => `${a}|${b}`));
const compatible = (a: string, b: string) => edges.has(`${a}|${b}`) || edges.has(`${b}|${a}`);

/** Move a tile so `at` is the origin: figureFromPlacedPolys names the figure around the origin. */
function around(polys: RawPolygon[], at: [number, number]): RawPolygon[] {
	return polys
		.filter((p) => p.vertices.some((v) => Math.hypot(v.x - at[0], v.y - at[1]) < 1e-6))
		.map((p) => ({ n: p.n, vertices: p.vertices.map((v) => ({ x: v.x - at[0], y: v.y - at[1] })) }));
}

describe("joinFigures", () => {
	it("places a patch for every compatible pair", () => {
		const missing: string[] = [];
		for (const [a, b] of COMPAT_EDGES) if (!joinFigures(a, b)) missing.push(`${a} ~ ${b}`);
		expect(missing).toEqual([]);
	});

	it("places nothing for an incompatible pair", () => {
		const wrong: string[] = [];
		for (const a of words)
			for (const b of words) {
				if (a === b || compatible(a, b)) continue;
				if (joinFigures(a, b)) wrong.push(`${a} ~ ${b}`);
			}
		expect(wrong).toEqual([]);
	});

	it("gives each end of the shared edge its own configuration", () => {
		for (const [a, b] of COMPAT_EDGES) {
			const join = joinFigures(a, b)!;
			const all = [...join.a, ...join.b];
			expect(figureFromPlacedPolys(around(all, join.ends[0]))?.word).toBe(a);
			expect(figureFromPlacedPolys(around(all, join.ends[1]))?.word).toBe(b);
		}
	});

	it("shares exactly the two tiles either side of that edge", () => {
		for (const [a, b] of COMPAT_EDGES) {
			const join = joinFigures(a, b)!;
			const [p, q] = join.shared.map((i) => join.a[i]);
			for (const tile of [p, q]) {
				const on = join.ends.filter((e) =>
					tile.vertices.some((v) => Math.hypot(v.x - e[0], v.y - e[1]) < 1e-6),
				);
				expect(on).toHaveLength(2);
			}
		}
	});

	it("is symmetric: the pair joins whichever way round it is asked", () => {
		for (const [a, b] of COMPAT_EDGES) expect(joinFigures(b, a)).not.toBeNull();
	});
});

// The failing half of the slide rests on this: the best placement of an incompatible pair still has
// tiles on top of each other, and that overlap IS the incompatibility. Both figures close 360° around
// their own vertex, so each side of the shared edge is covered from both ends; two different tiles
// covering the same side must overlap. So "no clash" and "compatible" have to be the same statement,
// and the drawing of the near miss is never a drawing of something that would actually have worked.
describe("attemptJoin", () => {
	it("clashes exactly when the pair is incompatible", () => {
		const wrong: string[] = [];
		for (let i = 0; i < words.length; i++)
			for (let j = i + 1; j < words.length; j++) {
				const [a, b] = [words[i], words[j]];
				const clashFree = attemptJoin(a, b)!.clashes.length === 0;
				if (clashFree !== compatible(a, b)) wrong.push(`${a} ~ ${b}`);
			}
		expect(wrong).toEqual([]);
	});

	it("draws the near miss as one agreed tile and a real overlap", () => {
		const attempt = attemptJoin("6.6.6", "3.4.6.4")!;
		expect(attempt.shared).toHaveLength(1);
		expect(attempt.clashes.length).toBeGreaterThan(0);
		for (const region of attempt.clashes) {
			expect(region.length).toBeGreaterThanOrEqual(3);
			let area = 0;
			for (let k = 0; k < region.length; k++) {
				const w = region[(k + 1) % region.length];
				area += region[k].x * w.y - w.x * region[k].y;
			}
			expect(Math.abs(area) / 2).toBeGreaterThan(0.01);
		}
	});
});
