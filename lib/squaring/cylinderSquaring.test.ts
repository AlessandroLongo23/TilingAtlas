import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { buildBall, diskLayout } from "./hyperbolicBall";
import { squareCylinder } from "./cylinderSquaring";
import { planarMapFromFaces } from "./planarMap";
import type { CylinderIndex, CylinderRecord } from "./shelf";

// The hyperbolic case, tested on invariants like the other two. The construction is exact inside
// squareCylinder and only the shipped coordinates are rounded, so the assertions here re-run the exact
// solve and check the integers, then check that the shipped floats agree with them.

const SHELF = path.join(process.cwd(), "public", "squarings", "cylinder");

const records = (): CylinderRecord[] =>
	readdirSync(SHELF)
		.filter((f) => f.endsWith(".json") && f !== "index.json")
		.map((f) => JSON.parse(readFileSync(path.join(SHELF, f), "utf8")) as CylinderRecord);

// Pairs whose EXACT solve is affordable in a test run. Bareiss is cubic in the free-vertex count with
// entries that grow to the spanning-tree count, so {3,12} at r=3 is not a bigger case, it is a
// different order of problem: it ran for three and a half minutes before this list existed.
const AFFORDABLE: [number, number][] = [
	[6, 1], [6, 2], [6, 3], [6, 4],
	[7, 1], [7, 2], [7, 3],
	[8, 1], [8, 2],
	[9, 1], [9, 2],
	[12, 1], [12, 2],
];
const VERTEX_BUDGET = 120;

const solve = (q: number, r: number) => {
	const ball = buildBall(q, r);
	const map = planarMapFromFaces(ball.faces, ball.vertexCount);
	if (!map) throw new Error(`{3,${q}} r=${r}: not a planar map`);
	const s = squareCylinder(map, 0, ball.sink);
	if (s.ok === false) throw new Error(`{3,${q}} r=${r}: ${s.error.reason} — ${s.error.detail}`);
	return { ball, map, squaring: s.squaring };
};

describe("the hyperbolic ball", () => {
	it("closes up as a sphere once the boundary is wired, for every q and r", () => {
		for (const q of [6, 7, 8, 9, 12]) {
			for (let r = 1; r <= 3; r++) {
				const ball = buildBall(q, r);
				const map = planarMapFromFaces(ball.faces, ball.vertexCount);
				if (!map) throw new Error(`{3,${q}} r=${r}: face rings do not form a planar map`);
				const chi = map.vertexCount - map.edges.length + map.faces.length;
				expect(`{3,${q}} r=${r}: χ=${chi}`).toBe(`{3,${q}} r=${r}: χ=2`);
			}
		}
	});

	it("gives every interior vertex degree q, which is what makes it {3,q}", () => {
		for (const q of [6, 7, 8, 9]) {
			const ball = buildBall(q, 3);
			const map = planarMapFromFaces(ball.faces, ball.vertexCount);
			if (!map) throw new Error("no map");
			// Interior = not on the last layer and not the sink; those are the ones with a full star.
			let checked = 0;
			for (let v = 0; v < ball.vertexCount; v++) {
				if (v === ball.sink || ball.layerOf[v] >= ball.radius) continue;
				expect(`{3,${q}} v${v}: deg ${map.adjacency[v].size}`).toBe(`{3,${q}} v${v}: deg ${q}`);
				checked += 1;
			}
			expect(checked).toBeGreaterThan(0);
		}
	});

	it("lays every edge out at the same hyperbolic length in the disk", () => {
		// The layout unfolds by rotating one triangle onto the next, so a wrong angle shows up as edges
		// of different lengths. Checked in the disk metric, not the Euclidean one.
		const ball = buildBall(7, 3);
		const map = planarMapFromFaces(ball.faces, ball.vertexCount);
		if (!map) throw new Error("no map");
		const pos = diskLayout(ball, map.faces);
		const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => {
			const num = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
			return Math.acosh(1 + (2 * num) / ((1 - a.x ** 2 - a.y ** 2) * (1 - b.x ** 2 - b.y ** 2)));
		};
		let first: number | null = null;
		for (const [u, v] of map.edges) {
			const a = pos[u];
			const b = pos[v];
			if (!a || !b) continue;
			const d = dist(a, b);
			if (first === null) first = d;
			else expect(Math.abs(d - first)).toBeLessThan(1e-9);
		}
		expect(first).not.toBeNull();
	});
});

describe("the squared cylinder certifies itself", () => {
	it("satisfies Σ current² = I·H, checked in exact integers inside the solve", () => {
		// squareCylinder returns a failure rather than a squaring if this identity breaks, so reaching a
		// squaring at all is the assertion. Spelled out so the invariant is named where it is tested.
		for (const [q, r] of AFFORDABLE) {
			expect(() => solve(q, r)).not.toThrow();
		}
	});

	it("tiles the cylinder without overlap, modulo the circumference", () => {
		for (const [q, r] of [
			[7, 2],
			[8, 2],
			[6, 3],
		] as [number, number][]) {
			const { squaring } = solve(q, r);
			const C = squaring.circumference;
			const sq = squaring.squares;
			// Neighbouring squares share an edge EXACTLY, so the epsilon only has to clear the
			// fixed-point rounding in the coordinates; the smallest tile at these radii is around 1e-3.
			const EPS = 1e-9;
			let clashes = 0;
			for (let i = 0; i < sq.length; i++) {
				for (let j = i + 1; j < sq.length; j++) {
					if (sq[i].y + sq[i].side <= sq[j].y + EPS || sq[j].y + sq[j].side <= sq[i].y + EPS) continue;
					for (const shift of [-C, 0, C]) {
						const X = sq[j].x + shift;
						if (X < sq[i].x + sq[i].side - EPS && sq[i].x < X + sq[j].side - EPS) clashes += 1;
					}
				}
			}
			expect(`{3,${q}} r=${r}: ${clashes} overlaps`).toBe(`{3,${q}} r=${r}: 0 overlaps`);
		}
	});

	it("reproduces the effective conductances computed by hand", () => {
		// 7/2, 22/5 and 8117/1717 for {3,7} at r = 1, 2, 3. These came out of an independent exact
		// rational prototype; if a refactor moves them, the solve has changed.
		const want: [number, number, number][] = [
			[7, 1, 7 / 2],
			[7, 2, 22 / 5],
			[7, 3, 8117 / 1717],
			[8, 1, 4],
			[6, 1, 3],
		];
		for (const [q, r, c] of want) {
			const { squaring } = solve(q, r);
			expect(`{3,${q}} r=${r}: ${squaring.circumference.toFixed(9)}`).toBe(`{3,${q}} r=${r}: ${c.toFixed(9)}`);
		}
	});

	it("turns every edge into one square, bar the ones carrying no current", () => {
		for (const [q, r] of [
			[7, 3],
			[9, 2],
		] as [number, number][]) {
			const { map, squaring } = solve(q, r);
			const used = new Set(squaring.squares.map((s) => s.edge));
			expect(used.size).toBe(squaring.squares.length);
			expect(squaring.squares.length).toBeLessThanOrEqual(map.edges.length);
			for (const s of squaring.squares) expect(s.side).toBeGreaterThan(0);
		}
	});
});

describe("transience is the difference", () => {
	// The circumference is the effective conductance from the centre out to the boundary, so it settles
	// on a positive limit exactly when the walk escapes. That is the whole content of the hyperbolic
	// case, and it is why {3,6} is in the corpus: it is the one that fails.
	it("has the hyperbolic conductance climbing and the Euclidean one turning over", () => {
		const seq = (q: number, upto: number) =>
			Array.from({ length: upto }, (_, i) => solve(q, i + 1).squaring.circumference);
		const hyp = seq(7, 3);
		expect(hyp[1] > hyp[0] && hyp[2] > hyp[1]).toBe(true);
		const euc = seq(6, 4);
		expect(`{3,6} peaks then falls: ${euc[3] < euc[1]}`).toBe("{3,6} peaks then falls: true");
	});
});

describe("the shipped shelf", () => {
	it("agrees with a fresh exact solve at every radius small enough to re-run", () => {
		for (const rec of records()) {
			for (const layer of rec.layers) {
				if (layer.counts.vertices > VERTEX_BUDGET) continue;
				const { squaring } = solve(rec.q, layer.radius);
				expect(`${rec.id} r=${layer.radius}: ${layer.circumference.toFixed(6)}`).toBe(
					`${rec.id} r=${layer.radius}: ${squaring.circumference.toFixed(6)}`,
				);
				expect(`${rec.id} r=${layer.radius}: ${layer.squares.length}`).toBe(
					`${rec.id} r=${layer.radius}: ${squaring.squares.length}`,
				);
			}
		}
	});

	it("labels {3,6} Euclidean and everything else hyperbolic", () => {
		const idx = JSON.parse(readFileSync(path.join(SHELF, "index.json"), "utf8")) as CylinderIndex;
		for (const e of idx.entries) {
			expect(`${e.id}: ${e.geometry}`).toBe(`${e.id}: ${e.q === 6 ? "euclidean" : "hyperbolic"}`);
		}
		expect(idx.entries.length).toBe(records().length);
	});

	it("carries a picker thumbnail whose middle vertex has q neighbours, which is what identifies it", () => {
		const idx = JSON.parse(readFileSync(path.join(SHELF, "index.json"), "utf8")) as CylinderIndex;
		for (const e of idx.entries) {
			const deg = new Array<number>(e.thumb.points.length).fill(0);
			for (const [u, v] of e.thumb.edges) {
				deg[u] += 1;
				deg[v] += 1;
			}
			// Vertex 0 is the centre of the ball, so at 54px the count around it IS the {3,q} label.
			expect(`${e.id}: centre degree ${deg[0]}`).toBe(`${e.id}: centre degree ${e.q}`);
			for (const p of e.thumb.points) expect(Math.hypot(p[0], p[1])).toBeLessThanOrEqual(0.961);
			expect(e.thumb.points.length).toBeLessThanOrEqual(60);
		}
	});
});
