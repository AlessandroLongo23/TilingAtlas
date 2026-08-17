import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyPatchFaces } from "@/lib/freedraw/faces";
import {
	PENT_EDGE_DEFAULTS,
	SIDE_KEYS,
	solveEdgeBoard,
	type PentEdgeParams,
} from "./edge-board";
import type { PentEdgeRecord } from "./edgeDevelop";
import { buildPentEdgePatch } from "./edgePatch";
import { decodeAtlas } from "@/lib/services/atlasCodec";

const shard = (k: number) => `public/pentagon-edges/pe1-k${k}.json`;
const KS = [2, 4, 6, 8, 10].filter((k) => existsSync(shard(k)));
const read = (k: number): PentEdgeRecord[] =>
	decodeAtlas<PentEdgeRecord>(JSON.parse(readFileSync(shard(k), "utf8")));

const solved = (p: Partial<PentEdgeParams> = {}) => {
	const r = solveEdgeBoard({ ...PENT_EDGE_DEFAULTS, ...p });
	if (!r.ok) throw new Error(`solve failed: ${r.error}`);
	return r.board;
};

/** A spread of records from one shard without loading the whole thing into the assertion loop. */
const sample = (k: number, n: number) => {
	const recs = read(k);
	const step = Math.max(1, Math.floor(recs.length / n));
	const out: PentEdgeRecord[] = [];
	for (let i = 0; i < recs.length && out.length < n; i += step) out.push(recs[i]);
	return out;
};

const built = (rec: PentEdgeRecord, p: Partial<PentEdgeParams> = {}) => {
	const r = buildPentEdgePatch(rec, solved(p));
	if (!r.ok) throw new Error(`${rec.id}: ${r.reason}`);
	return r.patch;
};

describe.skipIf(KS.length === 0)("the certificate's shape, which the patch builder relies on", () => {
	it("gives every record exactly 12k darts, all of them glued", () => {
		// This is what lets the builder know the fundamental domain's area BEFORE it goes looking for the
		// lattice, and the area is what makes the second basis vector exact instead of merely independent.
		// Each vertex contributes two darts per incident edge (darts = 4E); every face is the one hexagon
		// (6F = 2E); Euler on the torus closes it (V - E + F = 0). So F = k, E = 3k, V = 2k.
		for (const k of KS) {
			for (const rec of read(k)) {
				expect(rec.rneig.length).toBe(12 * rec.k);
				expect(rec.glue.some((g) => g < 0)).toBe(false);
			}
		}
	});
});

describe.skipIf(KS.length === 0)("the periodic patch", () => {
	it("cuts a fundamental domain of exactly k tiles, 2k vertices and 3k edges", () => {
		for (const k of KS.slice(0, 4)) {
			for (const rec of sample(k, 8)) {
				const p = built(rec);
				expect(p.polys.length).toBe(rec.k);
				expect(p.verts.length).toBe(2 * rec.k);
				expect(p.edges.length).toBe(3 * rec.k);
				// Euler characteristic 0 — the fundamental domain is a torus, which is the statement that
				// it closes up under the two translations with nothing left over.
				expect(p.verts.length - p.edges.length + p.polys.length).toBe(0);
			}
		}
	});

	it("tiles the torus: every half-edge of the period is used once, and its twin exists", () => {
		// The check that the fold is right rather than merely plausible. If the lattice were a sublattice,
		// or a vertex class had been split, some half-edge would go unmatched here.
		for (const rec of sample(6, 6)) {
			const p = built(rec);
			const used = new Map<string, number>();
			for (const ring of p.polys) {
				for (let i = 0; i < ring.length; i++) {
					const [va, ax, ay] = ring[i];
					const [vb, bx, by] = ring[(i + 1) % ring.length];
					const key = `${va},${vb},${bx - ax},${by - ay}`;
					used.set(key, (used.get(key) ?? 0) + 1);
				}
			}
			for (const [key, n] of used) {
				expect(n).toBe(1);
				const [va, vb, dx, dy] = key.split(",").map(Number);
				expect(used.has(`${vb},${va},${-dx},${-dy}`)).toBe(true);
			}
			expect(used.size).toBe(6 * rec.k);
		}
	});

	it("puts every period edge at one of the five class lengths", () => {
		const board = solved();
		const lens = SIDE_KEYS.map((s) => board.sides[s]);
		for (const rec of sample(4, 10)) {
			const r = buildPentEdgePatch(rec, board);
			if (!r.ok) throw new Error(r.reason);
			const p = r.patch;
			for (const [vi, vj, ox, oy] of p.edges) {
				const dx = p.verts[vj][0] + ox * p.T1[0] + oy * p.T2[0] - p.verts[vi][0];
				const dy = p.verts[vj][1] + ox * p.T1[1] + oy * p.T2[1] - p.verts[vi][1];
				const d = Math.hypot(dx, dy);
				expect(Math.min(...lens.map((L) => Math.abs(d - L)))).toBeLessThan(1e-9);
			}
		}
	});

	it("spans a cell of exactly k tile areas, which rules out a sublattice", () => {
		const board = solved();
		// Shoelace over the board outline: the tile the whole tiling is made of.
		let tileArea = 0;
		for (let i = 0; i < board.outline.length; i++) {
			const a = board.outline[i];
			const b = board.outline[(i + 1) % board.outline.length];
			tileArea += a.x * b.y - b.x * a.y;
		}
		tileArea = Math.abs(tileArea / 2);
		for (const rec of sample(6, 6)) {
			const p = built(rec);
			const cell = Math.abs(p.T1[0] * p.T2[1] - p.T1[1] * p.T2[0]);
			expect(cell / tileArea).toBeCloseTo(rec.k, 6);
		}
	});

	it("keeps the COMBINATORICS fixed as the parameters move, and only the lattice moves", () => {
		// The shelf's whole claim, now stated where it bites: the record ships no geometry, so a different
		// parameter point must give the same period with a different shape.
		for (const rec of sample(6, 6)) {
			const a = built(rec);
			const b = built(rec, { A: 108, B: 130, D: 96, b: 2.1, t: 0.2 });
			expect(b.polys.length).toBe(a.polys.length);
			expect(b.verts.length).toBe(a.verts.length);
			expect(b.edges.map((e) => e[4])).toEqual(a.edges.map((e) => e[4]));
			expect(b.compRank).toEqual(a.compRank);
			expect(b.compCells).toEqual(a.compCells);
			// ...and the lattice really did move, or the assertions above prove nothing.
			expect(Math.hypot(b.T1[0] - a.T1[0], b.T1[1] - a.T1[1])).toBeGreaterThan(1e-3);
		}
	});

	it("reads the bare board as one unbounded tile, and a fully drawn one as k separate tiles", () => {
		const recs = read(2);
		const bare = recs.find((r) => !r.drawn.includes("1"))!;
		const p = built(bare);
		// Nothing drawn: every face merges with every neighbour, in both directions, forever.
		expect(p.compRank).toEqual([2]);
		expect(p.compCells).toEqual([bare.k]);

		// The opposite end: a record whose every edge is a boundary has each tile to itself.
		const solid = recs.find((r) => !r.drawn.includes("0"));
		if (solid) {
			const q = built(solid);
			expect(q.compRank).toEqual(new Array(solid.k).fill(0));
			expect(q.compCells).toEqual(new Array(solid.k).fill(1));
		}
	});

	it("feeds the freedraw fill classifier without special-casing", () => {
		// Shape and pose colouring run off the patch geometry alone (lib/freedraw/faces.ts), which is the
		// point of handing back a FreedrawPatch instead of a bespoke scene.
		for (const rec of sample(6, 4)) {
			const p = built(rec);
			const c = classifyPatchFaces(p);
			expect(c.pose.length).toBe(p.compRank.length);
			expect(c.shape.length).toBe(p.compRank.length);
			// Pose refines shape: two tiles of different shape can never share a pose class.
			expect(c.poseCount).toBeGreaterThanOrEqual(c.shapeCount);
		}
	});

	it("survives the ends of the family, where the tile goes to a sliver", () => {
		// Both extremes stretch the period cell — one side of the tile heads for zero, so the cell gets
		// long and thin and the second generator moves far out of the first develop's reach. The builder
		// re-sizes from what it learned instead of doubling blindly, and that is what this pins.
		for (const pt of [{ t: 0.002 }, { t: 0.998 }, { b: 0.1 }, { b: 3 }] as Partial<PentEdgeParams>[]) {
			for (const rec of sample(8, 3)) {
				const r = buildPentEdgePatch(rec, solved(pt));
				expect(r.ok, `${rec.id} at ${JSON.stringify(pt)}: ${r.reason}`).toBe(true);
			}
		}
	});
});
