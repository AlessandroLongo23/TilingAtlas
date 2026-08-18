import { describe, expect, it } from "vitest";
import {
	DEFORM_MIN_DET,
	PAD_GRID,
	PAD_RANGE,
	clampToBox,
	cross,
	deformFromVectors,
	enforceDeterminant,
	isAdmissibleDeform,
	padToWorld,
	resolveDrag,
	snapToGrid,
	vectorsFromDeform,
	worldToPad,
	type PadGeom,
} from "@/lib/render/basisPad";
import { mat2Det } from "@/lib/render/flatView";

describe("matrix <-> the two vectors the pad draws", () => {
	it("red is the first column, blue the second", () => {
		const m = deformFromVectors({ x: 1, y: 0.3 }, { x: -0.4, y: 1.2 });
		expect(m).toEqual([1, 0.3, -0.4, 1.2]);
		expect(vectorsFromDeform(m)).toEqual({ red: { x: 1, y: 0.3 }, blue: { x: -0.4, y: 1.2 } });
	});

	// The pad's determinant readout and the renderers' degeneracy guards must be the same number.
	it("the parallelogram the vectors span is the matrix determinant", () => {
		const red = { x: 1.3, y: -0.2 }, blue = { x: 0.5, y: 0.9 };
		expect(cross(red, blue)).toBeCloseTo(mat2Det(deformFromVectors(red, blue)), 12);
	});
});

describe("clamping", () => {
	it("holds a drag inside the plot", () => {
		expect(clampToBox({ x: 9, y: -9 })).toEqual({ x: PAD_RANGE, y: -PAD_RANGE });
		expect(clampToBox({ x: 0.4, y: -1.1 })).toEqual({ x: 0.4, y: -1.1 });
	});

	it("snaps to the 0.25 rules", () => {
		expect(snapToGrid({ x: 0.31, y: -0.6 })).toEqual({ x: 0.25, y: -0.5 });
		expect(snapToGrid({ x: 1, y: 0 })).toEqual({ x: 1, y: 0 });
	});
});

describe("determinant floor", () => {
	const q = { x: 0, y: 1 }; // blue held at the identity

	it("leaves an admissible drag exactly where the pointer is", () => {
		const p = { x: 1.4, y: -0.7 };
		expect(enforceDeterminant(p, q, { x: 1, y: 0 })).toEqual(p);
	});

	it("stops the two vectors collapsing onto one line", () => {
		// p parallel to q => det 0. The push must restore the floor, not the original vector.
		const got = enforceDeterminant({ x: 0, y: 0.5 }, q, { x: 1, y: 0 });
		expect(Math.abs(cross(got, q))).toBeCloseTo(DEFORM_MIN_DET, 12);
	});

	it("keeps the side it came from, so a constrained drag slides instead of flipping", () => {
		const fromRight = enforceDeterminant({ x: 0.01, y: 0.5 }, q, { x: 1, y: 0 });
		expect(cross(fromRight, q)).toBeGreaterThan(0);
		const fromLeft = enforceDeterminant({ x: -0.01, y: 0.5 }, q, { x: -1, y: 0 });
		expect(cross(fromLeft, q)).toBeLessThan(0);
	});

	it("takes the side from the previous value when the pointer lands exactly on the line", () => {
		const got = enforceDeterminant({ x: 0, y: 0.5 }, q, { x: -1, y: 0 });
		expect(cross(got, q)).toBeLessThan(0);
	});

	it("slides along the constraint rather than off it", () => {
		// Every point on the segment stays admissible as the pointer sweeps through the forbidden line.
		let prev = { x: 1, y: 0 };
		for (let x = 1; x >= -1; x -= 0.05) {
			prev = resolveDrag({ x, y: 0.8 }, q, prev);
			expect(Math.abs(cross(prev, q))).toBeGreaterThanOrEqual(DEFORM_MIN_DET - 1e-9);
		}
		// It came out the other side, so the constraint is a wall to slide on, not a trap.
		expect(prev.x).toBeLessThan(0);
	});

	it("holds the previous value when the push would leave the box", () => {
		// q is short, so clearing the floor needs a long push; from the far corner it cannot fit.
		const shortQ = { x: 0.02, y: 0 };
		const prev = { x: PAD_RANGE, y: PAD_RANGE };
		expect(enforceDeterminant({ x: PAD_RANGE, y: 0 }, shortQ, prev)).toEqual(prev);
	});

	it("gives up rather than dividing by zero when the other vector is itself degenerate", () => {
		const prev = { x: 1, y: 0 };
		expect(enforceDeterminant({ x: 0.5, y: 0.5 }, { x: 0, y: 0 }, prev)).toEqual(prev);
	});
});

describe("resolveDrag", () => {
	it("clamps, then snaps, then enforces — in that order", () => {
		const got = resolveDrag({ x: 5, y: 0.31 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { snap: true });
		expect(got).toEqual({ x: PAD_RANGE, y: 0.25 });
	});

	it("keeps a snapped drag on the grid when the determinant does not bind", () => {
		const got = resolveDrag({ x: 0.77, y: -0.13 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { snap: true });
		expect(got.x % PAD_GRID).toBeCloseTo(0, 12);
		expect(got.y % PAD_GRID).toBeCloseTo(0, 12);
	});
});

describe("isAdmissibleDeform — the gate a shared link goes through", () => {
	it("accepts what a drag could have produced", () => {
		expect(isAdmissibleDeform([1, 0, 0, 1])).toBe(true);
		expect(isAdmissibleDeform([1, 0, 0.6, 1])).toBe(true);
		expect(isAdmissibleDeform([-1, 0, 0, 1])).toBe(true); // a reflection is a legal deformation
	});

	it("rejects singular, out-of-box and non-finite matrices", () => {
		expect(isAdmissibleDeform([1, 0, 2, 0])).toBe(false);
		expect(isAdmissibleDeform([1, 0, 0, 0.01])).toBe(false); // |det| under the floor
		expect(isAdmissibleDeform([9, 0, 0, 1])).toBe(false);
		expect(isAdmissibleDeform([NaN, 0, 0, 1])).toBe(false);
	});
});

describe("pad pixel geometry", () => {
	const g: PadGeom = { ox: 70, oy: 70, scale: 30 };

	it("puts world y UP on a y-down canvas", () => {
		expect(worldToPad({ x: 0, y: 1 }, g)).toEqual({ x: 70, y: 40 });
		expect(worldToPad({ x: 1, y: 0 }, g)).toEqual({ x: 100, y: 70 });
	});

	it("round-trips px <-> world", () => {
		const p = { x: -1.37, y: 0.82 };
		const back = padToWorld(worldToPad(p, g).x, worldToPad(p, g).y, g);
		expect(back.x).toBeCloseTo(p.x, 12);
		expect(back.y).toBeCloseTo(p.y, 12);
	});
});
