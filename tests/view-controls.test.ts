import { describe, it, expect } from "vitest";
import {
	ZOOM_MIN,
	ZOOM_MAX,
	ZOOM_RESET,
	ZOOM_WHEEL_FACTOR,
	ROTATE_PX_PER_STEP,
	accumulateDetents,
	defaultZoomForCell,
	makeCardControls,
	resetCardControls,
	rotateOffsetAboutCentre,
	shortestDeltaDeg,
	stepCardControls,
	wheelDeltaPx,
	wrap360,
	zoomAtPoint,
} from "@/lib/render/viewControls";

describe("wrap360 / shortestDeltaDeg", () => {
	it("wraps into [0, 360)", () => {
		expect(wrap360(0)).toBe(0);
		expect(wrap360(365)).toBe(5);
		expect(wrap360(-5)).toBe(355);
		expect(wrap360(720)).toBe(0);
	});

	it("takes the short way round the 0/360 seam", () => {
		expect(shortestDeltaDeg(350)).toBe(-10);
		expect(shortestDeltaDeg(-350)).toBe(10);
		expect(shortestDeltaDeg(10)).toBe(10);
		expect(shortestDeltaDeg(180)).toBe(-180); // boundary maps to [-180, 180)
	});
});

describe("wheelDeltaPx", () => {
	it("normalizes line and page delta modes to px", () => {
		expect(wheelDeltaPx({ deltaY: 3, deltaMode: 0 })).toBe(3);
		expect(wheelDeltaPx({ deltaY: 3, deltaMode: 1 })).toBe(48);
		expect(wheelDeltaPx({ deltaY: 1, deltaMode: 2 })).toBe(800);
	});
});

describe("zoomAtPoint", () => {
	it("holds the world point under the cursor fixed on screen", () => {
		const mouse = { x: 40, y: -25 };
		const off = { x: 7, y: -3 };
		const z0 = 60;
		const { zoom, offset } = zoomAtPoint(mouse, off, z0, -1); // zoom in
		expect(zoom).toBeCloseTo(z0 * ZOOM_WHEEL_FACTOR, 12);
		// The world point under the mouse before must land on the mouse after.
		const worldX = (mouse.x - off.x) / z0;
		const worldY = (mouse.y - off.y) / z0;
		expect(worldX * zoom + offset.x).toBeCloseTo(mouse.x, 10);
		expect(worldY * zoom + offset.y).toBeCloseTo(mouse.y, 10);
	});

	it("clamps at the zoom bounds without moving the view", () => {
		const atMax = zoomAtPoint({ x: 10, y: 10 }, { x: 0, y: 0 }, ZOOM_MAX, -1);
		expect(atMax.zoom).toBe(ZOOM_MAX);
		expect(atMax.offset).toEqual({ x: 0, y: 0 }); // unchanged zoom -> unchanged offset
		const atMin = zoomAtPoint({ x: 10, y: 10 }, { x: 0, y: 0 }, ZOOM_MIN, 1);
		expect(atMin.zoom).toBe(ZOOM_MIN);
		expect(atMin.offset).toEqual({ x: 0, y: 0 });
	});
});

describe("accumulateDetents", () => {
	it("fires one detent per ROTATE_PX_PER_STEP of accumulated scroll", () => {
		let state = { steps: 0, accum: 0 };
		// Two half-steps: no detent on the first, one on the second.
		state = accumulateDetents(state.accum, ROTATE_PX_PER_STEP / 2);
		expect(state.steps).toBe(0);
		state = accumulateDetents(state.accum, ROTATE_PX_PER_STEP / 2);
		expect(state.steps).toBe(1);
		expect(state.accum).toBe(0);
	});

	it("handles multi-step flicks and negative scroll", () => {
		const fwd = accumulateDetents(0, 3.5 * ROTATE_PX_PER_STEP);
		expect(fwd.steps).toBe(3);
		expect(fwd.accum).toBeCloseTo(0.5 * ROTATE_PX_PER_STEP, 12);
		const back = accumulateDetents(0, -2.25 * ROTATE_PX_PER_STEP);
		expect(back.steps).toBe(-2);
		expect(back.accum).toBeCloseTo(-0.25 * ROTATE_PX_PER_STEP, 12);
	});
});

describe("rotateOffsetAboutCentre", () => {
	it("rotates the offset vector by the given angle", () => {
		const o = { x: 10, y: 0 };
		rotateOffsetAboutCentre(o, Math.PI / 2);
		expect(o.x).toBeCloseTo(0, 12);
		expect(o.y).toBeCloseTo(10, 12);
	});
});

describe("stepCardControls", () => {
	it("converges zoom and offset to their targets and settles", () => {
		const c = makeCardControls(50);
		c.targetZoom = 100;
		c.targetOffset = { x: 40, y: -20 };
		let easing = true;
		for (let i = 0; i < 500 && easing; i++) easing = stepCardControls(c);
		expect(easing).toBe(false);
		expect(c.zoom).toBeCloseTo(100, 2);
		expect(c.offset.x).toBeCloseTo(40, 1);
		expect(c.offset.y).toBeCloseTo(-20, 1);
	});

	it("converges rotation exactly onto the detent", () => {
		const c = makeCardControls(50);
		c.targetRotation = 35;
		for (let i = 0; i < 500; i++) stepCardControls(c);
		expect(c.rotation).toBe(35); // exact: the ease snaps onto the detent
	});

	it("eases rotation across the 0/360 seam the short way", () => {
		const c = makeCardControls(50);
		c.rotation = 355;
		c.prevRotation = 355;
		c.targetRotation = 5; // +10° the short way, not -350°
		stepCardControls(c);
		expect(c.rotation).toBeGreaterThan(355);
	});

	it("pivots the pan offset with the rotation so the centre stays fixed", () => {
		const c = makeCardControls(50);
		c.offset = { x: 10, y: 0 };
		c.targetOffset = { x: 10, y: 0 };
		c.targetRotation = 90;
		for (let i = 0; i < 500; i++) stepCardControls(c);
		// After a net +90° spin, the offset must have rotated with it: (10,0) -> (0,10).
		expect(c.offset.x).toBeCloseTo(0, 6);
		expect(c.offset.y).toBeCloseTo(10, 6);
	});
});

describe("resetCardControls", () => {
	it("returns targets to home (clamped zoom, origin offset, zero rotation)", () => {
		const c = makeCardControls(50);
		c.targetZoom = 120;
		c.targetOffset = { x: 33, y: 44 };
		c.targetRotation = 125;
		c.scrollAccum = 12;
		resetCardControls(c, 999); // out-of-range home zoom clamps
		expect(c.targetZoom).toBe(ZOOM_MAX);
		expect(c.targetOffset).toEqual({ x: 0, y: 0 });
		expect(c.targetRotation).toBe(0);
		expect(c.scrollAccum).toBe(0);
	});
});

describe("defaultZoomForCell", () => {
	it("fits the requested number of periods across the card", () => {
		// |v1| = 2, card 300px, 3 periods -> zoom 50 (within bounds).
		expect(defaultZoomForCell({ x: 2, y: 0 }, { x: 0, y: 1 }, 300, 3)).toBe(50);
	});

	it("clamps to the shared zoom bounds", () => {
		expect(defaultZoomForCell({ x: 100, y: 0 }, { x: 0, y: 100 }, 300, 3)).toBe(ZOOM_MIN);
		expect(defaultZoomForCell({ x: 0.001, y: 0 }, { x: 0, y: 0.001 }, 300, 3)).toBe(ZOOM_MAX);
	});

	it("falls back to the /play reset zoom on degenerate input", () => {
		expect(defaultZoomForCell({ x: 0, y: 0 }, { x: 0, y: 0 }, 300)).toBe(ZOOM_RESET);
		expect(defaultZoomForCell({ x: 1, y: 0 }, { x: 0, y: 1 }, 0)).toBe(ZOOM_RESET);
	});
});
