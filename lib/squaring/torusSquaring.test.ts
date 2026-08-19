import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { buildTorusMap, halfTurn } from "./torusMap";
import { squareTorus, torusClasses } from "./torusSquaring";
import type { TorusIndex, TorusRecord } from "./shelf";

// The genus-1 construction, tested against the invariants rather than against snapshots — the same
// discipline as smith.test.ts, and for the same reason: the arithmetic is exact, so every assertion
// here is an equality with no tolerance anywhere.
//
// The load-bearing one is the area identity Σ side² = covolume. That is the discrete Riemann bilinear
// relation ‖ω‖² = ∫ ω ∧ ⋆ω, and it fails the instant the potential or the stream function is wrong, so
// it certifies the tiling without anyone having to trust the drawing.

const SHELF = path.join(process.cwd(), "public", "squarings", "torus");

const records = (): TorusRecord[] =>
	readdirSync(SHELF)
		.filter((f) => f.endsWith(".json") && f !== "index.json")
		.map((f) => JSON.parse(readFileSync(path.join(SHELF, f), "utf8")) as TorusRecord);

const index = (): TorusIndex => JSON.parse(readFileSync(path.join(SHELF, "index.json"), "utf8")) as TorusIndex;

const mapOf = (r: TorusRecord) => {
	const built = buildTorusMap(r.cell);
	if (built.ok === false) throw new Error(`${r.id}: ${built.error.reason} — ${built.error.detail}`);
	return built.map;
};

const CLASSES = torusClasses(4);

describe("the toroidal quotient", () => {
	it("has Euler characteristic zero for every shipped tiling", () => {
		for (const r of records()) {
			const m = mapOf(r);
			expect(`${r.id}: V-E+F=${m.chi}`).toBe(`${r.id}: V-E+F=0`);
		}
	});

	it("has a 2-dimensional space of harmonic 1-forms, which is dim H¹ of a torus", () => {
		// dim ker Δ₁ = E − (V−1) − (F−1). No genus is assumed anywhere; it drops out of the counts.
		for (const r of records()) {
			const m = mapOf(r);
			const dim = m.E - (m.V - 1) - (m.F - 1);
			expect(`${r.id}: dim=${dim}`).toBe(`${r.id}: dim=2`);
		}
	});
});

describe("every squared torus certifies itself", () => {
	it("has Σ side² equal to the covolume of its image lattice", () => {
		for (const r of records()) {
			const m = mapOf(r);
			for (const [a, b] of CLASSES) {
				const s = squareTorus(m, a, b);
				if (s.ok === false) continue;
				const area = s.squaring.squares.reduce((acc, q) => acc + BigInt(q.side) * BigInt(q.side), 0n);
				expect(`${r.id} (${a},${b}): ${area}`).toBe(`${r.id} (${a},${b}): ${s.squaring.covolume}`);
			}
		}
	});

	it("tiles without overlap, checked against every nearby translate of the image lattice", () => {
		for (const r of records()) {
			const m = mapOf(r);
			if (m.E > 14) continue; // the pairwise test is O(n²·25); the area identity covers the rest
			for (const [a, b] of CLASSES.slice(0, 12)) {
				const s = squareTorus(m, a, b);
				if (s.ok === false) continue;
				const L = s.squaring.lattice.map((v) => [BigInt(v[0]), BigInt(v[1])]);
				const q = s.squaring.squares.map((x) => [BigInt(x.x), BigInt(x.y), BigInt(x.side)]);
				let clashes = 0;
				for (let i = 0; i < q.length; i++) {
					for (let j = 0; j < q.length; j++) {
						for (let u = -2n; u <= 2n; u++) {
							for (let v = -2n; v <= 2n; v++) {
								if (i === j && u === 0n && v === 0n) continue;
								const X = q[j][0] + u * L[0][0] + v * L[1][0];
								const Y = q[j][1] + u * L[0][1] + v * L[1][1];
								if (X < q[i][0] + q[i][2] && q[i][0] < X + q[j][2] && Y < q[i][1] + q[i][2] && q[i][1] < Y + q[j][2])
									clashes += 1;
							}
						}
					}
				}
				expect(`${r.id} (${a},${b}): ${clashes} overlaps`).toBe(`${r.id} (${a},${b}): 0 overlaps`);
			}
		}
	});

	it("turns each edge of the quotient into exactly one tile, counting the degenerate ones", () => {
		// The correspondence is edge-to-square and nothing else: no edge may be dropped and none may be
		// used twice. Edges carrying zero current still exist, they just have no area, so they are counted
		// separately instead of quietly disappearing.
		for (const r of records()) {
			const m = mapOf(r);
			for (const [a, b] of CLASSES.slice(0, 10)) {
				const s = squareTorus(m, a, b);
				if (s.ok === false) continue;
				const used = new Set(s.squaring.squares.map((q) => q.edge));
				expect(`${r.id} (${a},${b}): ${used.size} distinct edges for ${s.squaring.order} tiles`).toBe(
					`${r.id} (${a},${b}): ${s.squaring.order} distinct edges for ${s.squaring.order} tiles`,
				);
				expect(`${r.id} (${a},${b}): ${s.squaring.order + s.squaring.degenerate}`).toBe(
					`${r.id} (${a},${b}): ${m.E}`,
				);
				for (const q of s.squaring.squares) expect(BigInt(q.side) > 0n).toBe(true);
			}
		}
	});
});

describe("known squared tori", () => {
	// Morley's catalogue at squaring.net lists an order-2 perfect squared torus on a 5×5 torus. It is the
	// plain square lattice at class (4, 3), and getting it out unprompted is the one external check
	// available: if this drifts, the construction is wrong in a way no internal invariant would catch.
	const squareLattice = {
		polygons: [
			[
				[0, 0],
				[1, 0],
				[1, 1],
				[0, 1],
			],
		],
		basis: [
			[1, 0],
			[0, 1],
		],
	} as const;

	it("reproduces the order-2 perfect squared torus of area 25 from the square lattice", () => {
		const m = mapOf({ cell: squareLattice } as unknown as TorusRecord);
		const s = squareTorus(m, 4, 3);
		if (s.ok === false) throw new Error(s.error.detail);
		const sides = s.squaring.squares.map((q) => q.side).sort((a, b) => Number(a) - Number(b));
		expect(sides.join(",")).toBe("3,4");
		expect(s.squaring.covolume).toBe("25");
		expect(s.squaring.perfect).toBe(true);
	});

	it("reproduces the 13×13 one at class (12, 5)", () => {
		const m = mapOf({ cell: squareLattice } as unknown as TorusRecord);
		const s = squareTorus(m, 12, 5);
		if (s.ok === false) throw new Error(s.error.detail);
		expect(s.squaring.squares.map((q) => q.side).sort((a, b) => Number(a) - Number(b)).join(",")).toBe("5,12");
		expect(s.squaring.covolume).toBe("169");
	});

	it("gives the same tiling for a class and its multiples, since scaling a class only scales the form", () => {
		const m = mapOf({ cell: squareLattice } as unknown as TorusRecord);
		const one = squareTorus(m, 4, 3);
		const two = squareTorus(m, 8, 6);
		if (one.ok === false || two.ok === false) throw new Error("no squaring");
		expect(two.squaring.covolume).toBe(one.squaring.covolume);
		expect(two.squaring.squares.map((q) => q.side).sort().join(",")).toBe(
			one.squaring.squares.map((q) => q.side).sort().join(","),
		);
	});
});

describe("the half-turn rule", () => {
	// A symmetry g acts on H¹, and the harmonic form of class σ pulls back to the one of class g*σ, so g
	// forces two edges to carry equal current inside ONE squaring only when g*σ = ±σ. A half-turn acts as
	// −1 on H¹ for every class at once, so ω(g·e) = −ω(e) and the sides pair up along every orbit it
	// moves — at every class, without exception.
	//
	// This is stated ONE WAY ONLY and must stay that way. The converse is false: a tiling with no
	// half-turn may still fail to produce a perfect squaring at any class, and 57 of the 63 half-turn-free
	// records measured on the wider corpus did exactly that. Do not "strengthen" this to a biconditional.
	it("means a tiling whose half-turn moves an edge has no perfect squaring, at any class", () => {
		for (const r of records()) {
			if (!r.halfTurn) continue;
			const m = mapOf(r);
			for (const [a, b] of CLASSES) {
				const s = squareTorus(m, a, b);
				if (s.ok === false) continue;
				expect(`${r.id} (${a},${b}): perfect=${s.squaring.perfect}`).toBe(`${r.id} (${a},${b}): perfect=false`);
			}
		}
	});

	it("is detected consistently with what the shelf recorded", () => {
		for (const r of records()) {
			const ht = halfTurn(mapOf(r));
			expect(`${r.id}: ${ht.present && ht.moves > 0}`).toBe(`${r.id}: ${r.halfTurn}`);
		}
	});
});

describe("the shipped index", () => {
	it("agrees with the shards on counts and on the class it opens with", () => {
		const idx = index();
		const byId = new Map(records().map((r) => [r.id, r]));
		expect(idx.entries.length).toBe(byId.size);
		for (const e of idx.entries) {
			const r = byId.get(e.id);
			if (!r) throw new Error(`index names ${e.id} but no shard exists`);
			expect(`${e.id}: ${e.counts.edges}`).toBe(`${e.id}: ${r.counts.edges}`);
			expect(`${e.id}: ${e.bestClass.join(",")}`).toBe(`${e.id}: ${r.bestClass.join(",")}`);
		}
	});

	it("names every record distinctly, so two rows in the picker are never the same tiling", () => {
		const names = index().entries.map((e) => e.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("carries a drawable thumbnail on every entry, with the same faces the shard's quotient has", () => {
		// The picker draws two dozen rows at once, so the patch travels on the index. If it ever went
		// missing the sidebar would render two dozen empty boxes and nothing else would complain.
		const byId = new Map(records().map((r) => [r.id, r]));
		for (const e of index().entries) {
			const r = byId.get(e.id);
			if (!r) throw new Error(`index names ${e.id} but no shard exists`);
			expect(`${e.id}: ${e.thumb.polygons.length} faces`).toBe(`${e.id}: ${r.counts.faces} faces`);
			for (const poly of e.thumb.polygons) expect(poly.length).toBeGreaterThanOrEqual(3);
			const [a1, a2] = e.thumb.basis;
			// Normalised by the longer lattice vector at build time, so neither is degenerate and the
			// longer one is a unit.
			expect(`${e.id}: ${Math.abs(a1[0] * a2[1] - a1[1] * a2[0]) > 1e-6}`).toBe(`${e.id}: true`);
			const longer = Math.max(Math.hypot(a1[0], a1[1]), Math.hypot(a2[0], a2[1]));
			expect(Math.abs(longer - 1)).toBeLessThan(1e-3);
		}
	});
});
