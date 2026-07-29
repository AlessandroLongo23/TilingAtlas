// The load-bearing property of the packer: the lattice-space bucket a pixel lands in must contain EVERY
// primitive copy that covers it. If it doesn't, the shader silently drops tiles — the failure mode is a
// hole in the tiling, not a crash, so it has to be tested, not eyeballed.
//
// Both tests below compare the bucket lookup (what the shader does) against a brute-force sweep over a
// wide range of lattice shifts (what the answer is).

import { describe, expect, it } from "vitest";
import { PRIM_TEXELS, packPeriodicCell, type PackedCell, type PeriodicCell } from "./periodicCell";

/** Point-in-ring, even-odd — the same crossing test the shader runs. */
function inside(vs: number[], px: number, py: number): boolean {
	let hit = false;
	const n = vs.length >> 1;
	for (let i = 0, j = n - 1; i < n; j = i++) {
		const xi = vs[2 * i], yi = vs[2 * i + 1];
		const xj = vs[2 * j], yj = vs[2 * j + 1];
		if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
	}
	return hit;
}

/** Read prim `p`'s packed world vertices back out of the textures. */
function primVerts(packed: PackedCell, p: number): number[] {
	const m = p * PRIM_TEXELS * 4;
	const start = packed.meta[m];
	const count = packed.meta[m + 1];
	const out: number[] = [];
	for (let i = 0; i < count; i++) {
		const o = (start + i) * 4;
		out.push(packed.verts[o], packed.verts[o + 1]);
	}
	return out;
}

/** What the SHADER sees: reduce into the unit cell, read one bucket, test only its entries. */
function lookupViaBucket(packed: PackedCell, wx: number, wy: number): number[] {
	const [m00, m01, m10, m11] = packed.minv;
	const a = m00 * wx + m01 * wy;
	const b = m10 * wx + m11 * wy;
	const fa = a - Math.floor(a);
	const fb = b - Math.floor(b);
	const G = packed.grid;
	const bi = Math.min(G - 1, Math.floor(fa * G));
	const bj = Math.min(G - 1, Math.floor(fb * G));
	const h = (bj * G + bi) * 4;
	const start = packed.head[h];
	const count = packed.head[h + 1];

	// The reduced world point, then each entry's own lattice shift — exactly the shader's `q`.
	const qx = wx - Math.floor(a) * packed.v1[0] - Math.floor(b) * packed.v2[0];
	const qy = wy - Math.floor(a) * packed.v1[1] - Math.floor(b) * packed.v2[1];

	const hits: number[] = [];
	for (let i = 0; i < count; i++) {
		const o = (start + i) * 4;
		const p = packed.list[o];
		const di = packed.list[o + 1];
		const dj = packed.list[o + 2];
		const x = qx - (di * packed.v1[0] + dj * packed.v2[0]);
		const y = qy - (di * packed.v1[1] + dj * packed.v2[1]);
		if (inside(primVerts(packed, p), x, y)) hits.push(p);
	}
	return hits.sort((x, y) => x - y);
}

/** The answer: reduce the same way, then sweep every prim over a generous range of lattice shifts. The
 *  reduction has to happen here too — sweeping shifts around the RAW point only reaches copies within a
 *  few cells of the origin, and the samples below deliberately sit far outside that. */
function lookupBruteForce(packed: PackedCell, wx: number, wy: number): number[] {
	const [m00, m01, m10, m11] = packed.minv;
	const a = Math.floor(m00 * wx + m01 * wy);
	const b = Math.floor(m10 * wx + m11 * wy);
	const qx = wx - a * packed.v1[0] - b * packed.v2[0];
	const qy = wy - a * packed.v1[1] - b * packed.v2[1];

	const hits: number[] = [];
	for (let p = 0; p < packed.primCount; p++) {
		const vs = primVerts(packed, p);
		for (let dj = -3; dj <= 3; dj++) {
			for (let di = -3; di <= 3; di++) {
				const x = qx - (di * packed.v1[0] + dj * packed.v2[0]);
				const y = qy - (di * packed.v1[1] + dj * packed.v2[1]);
				if (inside(vs, x, y)) {
					hits.push(p);
					break;
				}
			}
		}
	}
	return hits.sort((x, y) => x - y);
}

/** A square grid of `n`×`n` unit tiles on an n×n period — a cell with enough prims to exercise the grid. */
function squareGridCell(n: number, anchor = 0): PeriodicCell {
	const prims = [];
	for (let y = 0; y < n; y++) {
		for (let x = 0; x < n; x++) {
			const ax = x + anchor, ay = y + anchor;
			prims.push({
				verts: [ax, ay, ax + 1, ay, ax + 1, ay + 1, ax, ay + 1],
				fillRgb: [x / n, y / n, 0.5] as [number, number, number],
				z: y * n + x,
			});
		}
	}
	return { v1: [n, 0], v2: [0, n], prims, feature: 1 };
}

/**
 * The same grid slid half a tile off the lattice origin, so every tile STRADDLES the fundamental-domain
 * boundary. This is the case that distinguishes the two possible sign conventions for the index's lattice
 * shifts: when every prim sits neatly inside the unit cell, both signs file it under shift (0,0) and a
 * flipped sign is invisible. A real catalogue cell straddles constantly.
 */
function straddlingGridCell(n: number): PeriodicCell {
	const prims = [];
	for (let y = 0; y < n; y++) {
		for (let x = 0; x < n; x++) {
			const ax = x + 0.5, ay = y + 0.5;
			prims.push({
				verts: [ax, ay, ax + 1, ay, ax + 1, ay + 1, ax, ay + 1],
				fillRgb: [x / n, y / n, 0.5] as [number, number, number],
				z: y * n + x,
			});
		}
	}
	return { v1: [n, 0], v2: [0, n], prims, feature: 1 };
}

/**
 * A rhombic lattice with tiles crossing both boundaries — the shape of the composable-k3 catalogue cell
 * whose lens render came out with a wedge-shaped hole. Rhombic because v1 and v2 both have nonzero x and
 * y, so a world bbox maps to a lattice box strictly larger than the polygon's own extent.
 */
function rhombicCell(): PeriodicCell {
	const v1: [number, number] = [2.366, -4.098];
	const v2: [number, number] = [2.366, 4.098];
	const prims = [];
	// Nine parallelogram tiles covering the fundamental domain, each anchored off the origin so the
	// centroid normalisation has real work to do.
	for (let j = 0; j < 3; j++) {
		for (let i = 0; i < 3; i++) {
			const s = i / 3, t = j / 3;
			const ox = s * v1[0] + t * v2[0] + 7 * v1[0];
			const oy = s * v1[1] + t * v2[1] + 7 * v1[1];
			prims.push({
				verts: [
					ox, oy,
					ox + v1[0] / 3, oy + v1[1] / 3,
					ox + v1[0] / 3 + v2[0] / 3, oy + v1[1] / 3 + v2[1] / 3,
					ox + v2[0] / 3, oy + v2[1] / 3,
				],
				fillRgb: [s, t, 0.4] as [number, number, number],
				z: j * 3 + i,
			});
		}
	}
	return { v1, v2, prims, feature: 1.4 };
}

/** A sheared lattice with triangular tiles — the case an axis-aligned index would get wrong. */
function shearedTriangleCell(): PeriodicCell {
	const s = Math.sqrt(3) / 2;
	const prims = [];
	for (let y = 0; y < 3; y++) {
		for (let x = 0; x < 3; x++) {
			const ox = x + 0.5 * y, oy = s * y;
			prims.push({
				verts: [ox, oy, ox + 1, oy, ox + 0.5, oy + s],
				fillRgb: [0.2, 0.6, 0.9] as [number, number, number],
				z: 2 * (y * 3 + x),
			});
			prims.push({
				verts: [ox + 1, oy, ox + 1.5, oy + s, ox + 0.5, oy + s],
				fillRgb: [0.9, 0.4, 0.2] as [number, number, number],
				z: 2 * (y * 3 + x) + 1,
			});
		}
	}
	return { v1: [3, 0], v2: [1.5, 3 * s], prims, feature: 1 };
}

/** Deterministic LCG — a seeded sweep beats Math.random for a test that must reproduce on failure. */
function lcg(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

describe("packPeriodicCell", () => {
	it("bucket lookup agrees with brute force on a square grid", () => {
		const packed = packPeriodicCell(squareGridCell(5));
		expect(packed).not.toBeNull();
		const rnd = lcg(12345);
		for (let i = 0; i < 4000; i++) {
			// Sample well outside the fundamental domain, so the reduction is doing real work.
			const wx = (rnd() - 0.5) * 60;
			const wy = (rnd() - 0.5) * 60;
			expect(lookupViaBucket(packed!, wx, wy)).toEqual(lookupBruteForce(packed!, wx, wy));
		}
	});

	it("survives geometry anchored many lattice cells from the origin", () => {
		// The centroid normalisation is what makes this work; without it these tiles index out of range
		// and render as holes.
		const packed = packPeriodicCell(squareGridCell(4, 137));
		expect(packed).not.toBeNull();
		const rnd = lcg(777);
		for (let i = 0; i < 3000; i++) {
			const wx = (rnd() - 0.5) * 50;
			const wy = (rnd() - 0.5) * 50;
			expect(lookupViaBucket(packed!, wx, wy)).toEqual(lookupBruteForce(packed!, wx, wy));
		}
	});

	it("finds tiles that straddle the fundamental-domain boundary", () => {
		const packed = packPeriodicCell(straddlingGridCell(5));
		expect(packed).not.toBeNull();
		const rnd = lcg(4242);
		for (let i = 0; i < 4000; i++) {
			const wx = (rnd() - 0.5) * 60;
			const wy = (rnd() - 0.5) * 60;
			expect(lookupViaBucket(packed!, wx, wy)).toEqual(lookupBruteForce(packed!, wx, wy));
		}
	});

	it("leaves no hole in the fundamental domain of a rhombic cell", () => {
		// Coverage, not just agreement: every sample inside the unit cell must be claimed by some tile.
		// This is the property the lens magnifies — a 1% gap near the pole fills a quarter of the screen.
		const packed = packPeriodicCell(rhombicCell())!;
		const N = 120;
		let uncovered = 0;
		for (let j = 0; j < N; j++) {
			for (let i = 0; i < N; i++) {
				const a = (i + 0.5) / N, b = (j + 0.5) / N;
				const wx = a * packed.v1[0] + b * packed.v2[0];
				const wy = a * packed.v1[1] + b * packed.v2[1];
				if (lookupViaBucket(packed, wx, wy).length === 0) uncovered++;
			}
		}
		expect(uncovered).toBe(0);
	});

	it("bucket lookup agrees with brute force on a sheared triangular lattice", () => {
		const packed = packPeriodicCell(shearedTriangleCell());
		expect(packed).not.toBeNull();
		const rnd = lcg(99);
		for (let i = 0; i < 4000; i++) {
			const wx = (rnd() - 0.5) * 40;
			const wy = (rnd() - 0.5) * 40;
			expect(lookupViaBucket(packed!, wx, wy)).toEqual(lookupBruteForce(packed!, wx, wy));
		}
	});

	it("orders every bucket by z so the shader can composite in one pass", () => {
		const packed = packPeriodicCell(squareGridCell(6))!;
		for (let b = 0; b < packed.grid * packed.grid; b++) {
			const start = packed.head[b * 4];
			const count = packed.head[b * 4 + 1];
			let prev = -Infinity;
			for (let i = 0; i < count; i++) {
				const p = packed.list[(start + i) * 4];
				const z = packed.meta[p * PRIM_TEXELS * 4 + 17];
				expect(z).toBeGreaterThanOrEqual(prev);
				prev = z;
			}
		}
	});

	it("rejects a degenerate lattice instead of emitting a divide-by-zero index", () => {
		expect(packPeriodicCell({ v1: [1, 0], v2: [2, 0], prims: [{ verts: [0, 0, 1, 0, 1, 1] }], feature: 1 }))
			.toBeNull();
		expect(packPeriodicCell({ v1: [1, 0], v2: [0, 1], prims: [], feature: 1 })).toBeNull();
	});
});
