import { describe, it, expect } from "vitest";
import {
	PAD_DEAD_ZONE,
	PAD_MAX_RATE,
	padPosition,
	padPositionFromVelocity,
	padVelocity,
} from "@/lib/render/velocityPad";

const R = 60;

describe("padPosition", () => {
	it("snaps to the origin inside the dead zone", () => {
		const dz = PAD_DEAD_ZONE * R;
		expect(padPosition(dz * 0.5, 0, R)).toEqual({ x: 0, y: 0 });
		expect(padPosition(dz * 0.6, dz * 0.6, R)).toEqual({ x: 0, y: 0 });
	});

	it("clamps to the rim, preserving direction", () => {
		const p = padPosition(300, 400, R); // 3-4-5 triangle, far outside
		expect(Math.hypot(p.x, p.y)).toBeCloseTo(R, 9);
		expect(p.x / p.y).toBeCloseTo(3 / 4, 9);
	});

	it("passes through positions between dead zone and rim", () => {
		expect(padPosition(30, -20, R)).toEqual({ x: 30, y: -20 });
	});
});

describe("padVelocity", () => {
	it("is zero at the origin", () => {
		expect(padVelocity({ x: 0, y: 0 }, R)).toEqual({ x: 0, y: 0 });
	});

	it("reaches PAD_MAX_RATE at the rim", () => {
		const v = padVelocity({ x: R, y: 0 }, R);
		expect(v.x).toBeCloseTo(PAD_MAX_RATE, 9);
		expect(v.y).toBeCloseTo(0, 12);
	});

	it("maps pad up (screen y negative) to positive spin", () => {
		const v = padVelocity({ x: 0, y: -R }, R);
		expect(v.x).toBeCloseTo(0, 12);
		expect(v.y).toBeCloseTo(PAD_MAX_RATE, 9);
	});

	it("is quadratic in the deflection past the dead zone", () => {
		// Halfway through the effective range → magnitude MAX/4.
		const len = (PAD_DEAD_ZONE + 0.5 * (1 - PAD_DEAD_ZONE)) * R;
		const v = padVelocity({ x: len, y: 0 }, R);
		expect(v.x).toBeCloseTo(PAD_MAX_RATE * 0.25, 9);
	});

	it("is monotone in the deflection", () => {
		let prev = 0;
		for (let f = PAD_DEAD_ZONE + 0.01; f <= 1; f += 0.1) {
			const v = padVelocity({ x: f * R, y: 0 }, R);
			expect(v.x).toBeGreaterThan(prev);
			prev = v.x;
		}
	});
});

describe("padPositionFromVelocity", () => {
	it("is zero for zero velocity", () => {
		expect(padPositionFromVelocity({ x: 0, y: 0 }, R)).toEqual({ x: 0, y: 0 });
	});

	it("round-trips positions outside the dead zone", () => {
		for (const pos of [
			{ x: 30, y: -20 },
			{ x: -R, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 45 },
		]) {
			const back = padPositionFromVelocity(padVelocity(pos, R), R);
			expect(back.x).toBeCloseTo(pos.x, 9);
			expect(back.y).toBeCloseTo(pos.y, 9);
		}
	});
});
