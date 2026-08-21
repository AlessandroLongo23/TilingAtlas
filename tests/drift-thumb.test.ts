import { describe, expect, it } from "vitest";
import { driftPhase, driftVector } from "@/lib/render/driftThumbStage";

// The drifting thumbnails walk a LATTICE VECTOR, which is what closes the loop seamlessly, so the
// direction cannot be imposed — it has to be chosen from what the lattice offers. What this pins down is
// that the choice is made for the GRID and not for each card alone: AL, on the first version, "they all
// go in different directions", because it took each lattice's shortest vector and those point wherever
// the lattice points.
//
// The bases below are in data units with y up, as `parseBaseCell` returns them.
const SQUARE: [[number, number], [number, number]] = [
	[1, 0],
	[0, 1],
];
const HEX: [[number, number], [number, number]] = [
	[1, 0],
	[0.5, Math.sqrt(3) / 2],
];
const RECT: [[number, number], [number, number]] = [
	[2.73, 0],
	[1.37, 2.37],
];
const SKEW: [[number, number], [number, number]] = [
	[1, 0],
	[0.2, 3],
];
const ALL = { SQUARE, HEX, RECT, SKEW };

const SCALE = 40;
const W = 320;
const H = 320;

describe("driftVector", () => {
	it("sends every lattice broadly the same way", () => {
		const angles: number[] = [];
		for (const [name, basis] of Object.entries(ALL)) {
			const v = driftVector(basis, SCALE, W, H);
			expect(v, name).not.toBeNull();
			// Rightward, which is the shared direction: the window walks right so the tiling slides left.
			expect(v!.dx, name).toBeGreaterThan(0);
			angles.push(Math.atan2(v!.dy, v!.dx));
		}
		// And within one bucket of each other, so a grid reads as one page instead of as noise.
		const spread = Math.max(...angles) - Math.min(...angles);
		expect(spread).toBeLessThanOrEqual(Math.PI / 3);
	});

	it("returns a real lattice vector, not the direction it would have preferred", () => {
		// The loop closes because the walk is a period. Every result has to be an integer combination of
		// the basis, or the wrap would land on a different picture and the card would jump.
		for (const [name, basis] of Object.entries(ALL)) {
			const v = driftVector(basis, SCALE, W, H)!;
			// Undo the render transform (scale(s, -s)) and solve v = i·b1 + j·b2 over the reals.
			const x = v.dx / SCALE;
			const y = -v.dy / SCALE;
			const det = basis[0][0] * basis[1][1] - basis[0][1] * basis[1][0];
			const i = (x * basis[1][1] - y * basis[1][0]) / det;
			const j = (y * basis[0][0] - x * basis[0][1]) / det;
			expect(Math.abs(i - Math.round(i)), `${name} i=${i}`).toBeLessThan(1e-9);
			expect(Math.abs(j - Math.round(j)), `${name} j=${j}`).toBeLessThan(1e-9);
		}
	});

	it("refuses a period too short to read and one that would dwarf the card", () => {
		// A hair of a period: every candidate is under the six-pixel floor.
		expect(driftVector(SQUARE, 0.5, W, H)).toBeNull();
		// And one where even the shortest vector is wider than two slots.
		expect(driftVector(SQUARE, 4000, W, H)).toBeNull();
	});

	it("keeps the walk inside the offscreen the caller sizes from it", () => {
		// The offscreen is the slot plus |dx| by the slot plus |dy|, and the window walks the whole vector,
		// so anything past twice the slot is refused rather than clipped mid-loop.
		for (const basis of Object.values(ALL)) {
			const v = driftVector(basis, SCALE, W, H);
			if (!v) continue;
			expect(Math.abs(v.dx)).toBeLessThanOrEqual(2 * W);
			expect(Math.abs(v.dy)).toBeLessThanOrEqual(2 * H);
		}
	});
});

describe("driftPhase", () => {
	it("is stable, in range, and spreads keys across the loop", () => {
		expect(driftPhase("t1005")).toBe(driftPhase("t1005"));
		const keys = ["t1001", "t1005", "cx-4571", "he667-13-2", "plen-hex"];
		for (const k of keys) {
			const p = driftPhase(k);
			expect(p).toBeGreaterThanOrEqual(0);
			expect(p).toBeLessThan(1);
		}
		// Distinct keys must not land on one phase, or the grid slides in lockstep anyway.
		expect(new Set(keys.map(driftPhase)).size).toBe(keys.length);
	});
});
