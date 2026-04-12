import { describe, it, expect } from "vitest";
import { Vector } from "@/classes/Vector";

describe("Vector", () => {
	it("constructs with x,y defaults", () => {
		const v = new Vector();
		expect(v.x).toBe(0);
		expect(v.y).toBe(0);
	});

	it("static add is pure", () => {
		const a = new Vector(1, 2);
		const b = new Vector(3, 4);
		const sum = Vector.add(a, b);
		expect(sum.x).toBe(4);
		expect(sum.y).toBe(6);
		expect(a.x).toBe(1); // original unchanged
	});

	it("instance add mutates", () => {
		const a = new Vector(1, 2);
		a.add(new Vector(3, 4));
		expect(a.x).toBe(4);
		expect(a.y).toBe(6);
	});

	it("mag + normalize", () => {
		const v = new Vector(3, 4);
		expect(v.mag()).toBe(5);
		const n = v.copy().normalize();
		expect(n.x).toBeCloseTo(0.6);
		expect(n.y).toBeCloseTo(0.8);
	});

	it("rotate around origin", () => {
		const v = new Vector(1, 0).rotate(Math.PI / 2);
		expect(v.x).toBeCloseTo(0);
		expect(v.y).toBeCloseTo(1);
	});

	it("rotateAround non-origin", () => {
		const v = new Vector(2, 0);
		const rotated = Vector.rotateAround(v, new Vector(1, 0), Math.PI);
		expect(rotated.x).toBeCloseTo(0);
		expect(rotated.y).toBeCloseTo(0);
	});

	it("distance", () => {
		expect(Vector.distance(new Vector(0, 0), new Vector(3, 4))).toBe(5);
	});

	it("dot + cross", () => {
		const a = new Vector(1, 2);
		const b = new Vector(3, 4);
		expect(a.dot(b)).toBe(11);
		expect(Vector.cross(a, b)).toBe(-2);
	});

	it("fromAngle / heading roundtrip", () => {
		const v = Vector.fromAngle(Math.PI / 3);
		expect(v.heading()).toBeCloseTo(Math.PI / 3);
	});

	it("isParallelTo", () => {
		const a = new Vector(1, 2);
		const b = new Vector(2, 4);
		const c = new Vector(1, 0);
		expect(a.isParallelTo(b)).toBe(true);
		expect(a.isParallelTo(c)).toBe(false);
	});

	it("encode", () => {
		const v = new Vector(1.5, -2.5);
		expect(v.encode()).toEqual({ x: 1.5, y: -2.5 });
	});
});
