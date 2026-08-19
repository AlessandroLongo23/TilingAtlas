import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PipelineIndex, PipelineRecord } from "./shelf";

// The four-stage page ships a solve, not just a picture: potentials per vertex, currents per edge, and
// a Tutte embedding. Each of those is a mathematical object with a defining property, so each is
// checked against its own definition rather than against a stored copy of itself.

const dir = path.join(process.cwd(), "public", "squarings", "pipeline");
const index = JSON.parse(readFileSync(path.join(dir, "index.json"), "utf8")) as PipelineIndex;
const load = (id: string) => JSON.parse(readFileSync(path.join(dir, `${id}.json`), "utf8")) as PipelineRecord;

describe("the pipeline set", () => {
	it("curates only rectangles whose tile sizes fit inside the tiles", () => {
		expect(index.entries.length, "curated polyhedra").toBeGreaterThan(20);
		for (const e of index.entries) {
			expect(e.order, `${e.id}: order ${e.order} exceeds the legibility cap`).toBeLessThanOrEqual(index.maxOrder);
		}
	});

	it("names every entry distinguishably", () => {
		// The corpora overlap: sp4-1-00002 IS the octagonal prism, and both produce 118x218. Two rows
		// reading "octagonal prism" with identical numbers is a picker nobody can use.
		const names = index.entries.map((e) => e.name);
		expect(new Set(names).size, `duplicate names among ${names.length} entries`).toBe(names.length);
	});

	it("agrees with its own shards", () => {
		for (const e of index.entries) {
			const r = load(e.id);
			expect(r.squaring.order, `${e.id}: order`).toBe(e.order);
			expect(r.squaring.width, `${e.id}: width`).toBe(e.width);
			expect(r.squaring.height, `${e.id}: height`).toBe(e.height);
			expect(r.squaring.perfect, `${e.id}: perfect flag`).toBe(e.perfect);
			expect(r.vertices.length, `${e.id}: vertex count`).toBe(e.counts.vertices);
			expect(r.edges.length, `${e.id}: edge count`).toBe(e.counts.edges);
		}
	});

	it("puts every vertex at the average of its neighbours, which is what harmonic means", () => {
		// The defining property of the electrical solve. Away from the two poles, deg(v)·V(v) must equal
		// the sum of the neighbours' potentials — exactly, in integers, with no tolerance.
		for (const e of index.entries) {
			const r = load(e.id);
			const adjacency: number[][] = Array.from({ length: r.vertices.length }, () => []);
			for (const [a, b] of r.edges) {
				// The battery edge is removed before the solve, so it must not count toward the balance.
				if ((a === r.battery[0] && b === r.battery[1]) || (a === r.battery[1] && b === r.battery[0])) continue;
				adjacency[a].push(b);
				adjacency[b].push(a);
			}
			for (let v = 0; v < r.vertices.length; v++) {
				if (v === r.battery[0] || v === r.battery[1]) continue;
				const sum = adjacency[v].reduce((acc, w) => acc + BigInt(r.potential[w]), 0n);
				const scaled = BigInt(adjacency[v].length) * BigInt(r.potential[v]);
				expect(
					scaled,
					`${e.id}: vertex ${v} sits at ${r.potential[v]}, neighbours average ${sum}/${adjacency[v].length}`,
				).toBe(sum);
			}
		}
	});

	it("conserves current at every node and delivers the width out of the positive pole", () => {
		for (const e of index.entries) {
			const r = load(e.id);
			const net = new Map<number, bigint>();
			for (const c of r.currents) {
				net.set(c.from, (net.get(c.from) ?? 0n) - BigInt(c.value));
				net.set(c.to, (net.get(c.to) ?? 0n) + BigInt(c.value));
			}
			const [a, b] = r.battery;
			const positive = BigInt(r.potential[a]) >= BigInt(r.potential[b]) ? a : b;
			const negative = positive === a ? b : a;
			for (let v = 0; v < r.vertices.length; v++) {
				if (v === positive || v === negative) continue;
				expect(net.get(v) ?? 0n, `${e.id}: node ${v} leaks ${net.get(v)}`).toBe(0n);
			}
			// All the current the poles push in has to come back out, and its size is the rectangle's width.
			expect(-(net.get(positive) ?? 0n), `${e.id}: current out of the + pole vs width`).toBe(
				BigInt(r.squaring.width),
			);
			expect(net.get(negative) ?? 0n, `${e.id}: current into the − pole vs width`).toBe(BigInt(r.squaring.width));
		}
	});

	it("draws every Tutte vertex inside the pinned outer polygon", () => {
		// Tutte's theorem: for a 3-connected planar graph the barycentric drawing is crossing-free with
		// every face convex, so nothing may escape the pinned boundary. A vertex outside it would mean
		// the solve, not the solid, went wrong.
		for (const e of index.entries) {
			const r = load(e.id);
			expect(r.tutte.length, `${e.id}: one position per vertex`).toBe(r.vertices.length);
			for (const [x, y] of r.tutte) {
				expect(Number.isFinite(x) && Number.isFinite(y), `${e.id}: non-finite Tutte position`).toBe(true);
				expect(Math.hypot(x, y), `${e.id}: vertex at (${x}, ${y}) escaped the unit boundary`).toBeLessThanOrEqual(
					1.0001,
				);
			}
			// The pinned face's own vertices sit exactly on the circle.
			for (const v of r.outerFace) {
				expect(Math.hypot(r.tutte[v][0], r.tutte[v][1]), `${e.id}: pinned vertex ${v} off the circle`).toBeCloseTo(
					1,
					6,
				);
			}
		}
	});

	it("puts both battery poles on the pinned outer face", () => {
		// The electrical construction assumes the two poles lie on the outer face; if they did not, the
		// stream function would not be single-valued and stage 4 would not be a rectangle.
		for (const e of index.entries) {
			const r = load(e.id);
			const outer = new Set(r.outerFace);
			expect(outer.has(r.battery[0]) && outer.has(r.battery[1]), `${e.id}: poles not on the outer face`).toBe(true);
		}
	});

	it("keeps the spanning-tree identity in the shipped numbers", () => {
		// W + H = tau(G) once the gcd reduction is undone. The shard carries tau directly, so this pins
		// the reduction factor as a whole number and catches a shard built from a stale solve.
		for (const e of index.entries) {
			const r = load(e.id);
			const sum = BigInt(r.squaring.width) + BigInt(r.squaring.height);
			const tau = BigInt(r.spanningTrees);
			expect(tau % sum, `${e.id}: spanning trees ${tau} is not a multiple of W+H = ${sum}`).toBe(0n);
		}
	});
});
