import { describe, it, expect, vi } from "vitest";
import { makeCardControls, pinchCardControls, stepCardControls } from "@/lib/render/viewControls";
import { TouchGestures, TWIST_DEAD_DEG } from "@/lib/render/touchGestures";

// screen = zoom · Rot(θ) · w + offset, the map every CardControls consumer draws with (the y-flip of the
// real renderers is a fixed reflection on w and changes nothing here).
const toScreen = (c: ReturnType<typeof makeCardControls>, w: { x: number; y: number }) => {
	const r = (c.rotation * Math.PI) / 180;
	return {
		x: c.zoom * (Math.cos(r) * w.x - Math.sin(r) * w.y) + c.offset.x,
		y: c.zoom * (Math.sin(r) * w.x + Math.cos(r) * w.y) + c.offset.y,
	};
};
const toWorld = (c: ReturnType<typeof makeCardControls>, s: { x: number; y: number }) => {
	const r = (c.rotation * Math.PI) / 180;
	const x = (s.x - c.offset.x) / c.zoom, y = (s.y - c.offset.y) / c.zoom;
	return { x: Math.cos(r) * x + Math.sin(r) * y, y: -Math.sin(r) * x + Math.cos(r) * y };
};

describe("pinchCardControls", () => {
	it("keeps the world point under the fingers once the frame loop has applied the twist", () => {
		const c = makeCardControls(60);
		c.offset = { x: 30, y: -12 };
		c.targetOffset = { x: 30, y: -12 };
		stepCardControls(c);
		const step = { from: { x: 40, y: 25 }, to: { x: 55, y: 10 }, scale: 1.3, rotate: 0.4 };
		const w = toWorld(c, step.from);
		pinchCardControls(c, step);
		for (let i = 0; i < 400; i++) stepCardControls(c);
		const s = toScreen(c, w);
		expect(s.x).toBeCloseTo(step.to.x, 6);
		expect(s.y).toBeCloseTo(step.to.y, 6);
		expect(c.zoom).toBeCloseTo(78, 6);
	});
});

const el = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) } as unknown as Element;
// A clock the events carry as timeStamp, 20 ms per event unless a test moves it.
let clock = 0;
const ev = (pointerId: number, clientX: number, clientY: number, type = "pointermove", pointerType = "touch") => ({
	pointerId, pointerType, clientX, clientY, type, timeStamp: (clock += 20),
});

describe("TouchGestures", () => {
	it("ignores the mouse entirely", () => {
		const pinch = vi.fn();
		const t = new TouchGestures(() => el, { pinch });
		expect(t.down(ev(1, 10, 10, "pointerdown", "mouse"))).toBe(false);
		expect(t.move(ev(1, 50, 50, "pointermove", "mouse"))).toBe(false);
		expect(t.up(ev(1, 50, 50, "pointerup", "mouse"))).toBe(false);
		expect(pinch).not.toHaveBeenCalled();
	});

	it("reports spread and midpoint in centred px, and a twist only past the dead zone", () => {
		const pinch = vi.fn();
		const pinchStart = vi.fn();
		const pinchEnd = vi.fn();
		const t = new TouchGestures(() => el, { pinch, pinchStart, pinchEnd });
		expect(t.down(ev(1, 80, 100, "pointerdown"))).toBe(false);
		expect(t.down(ev(2, 120, 100, "pointerdown"))).toBe(true);
		expect(pinchStart).toHaveBeenCalledOnce();
		// Finger 2 swings from (120,100) to (100,140): spread 40 → √(20²+40²), turned 63° clockwise.
		expect(t.move(ev(2, 100, 140))).toBe(true);
		const step = pinch.mock.calls[0][0];
		expect(step.from).toEqual({ x: 0, y: 0 });
		expect(step.to).toEqual({ x: -10, y: 20 });
		expect(step.scale).toBeCloseTo(Math.hypot(20, 40) / 40, 9);
		// The first 12° of twist are swallowed; the rest comes through, and after that every step whole.
		const dead = (TWIST_DEAD_DEG * Math.PI) / 180;
		expect(step.rotate).toBeCloseTo(Math.atan2(40, 20) - dead, 9);
		expect(t.move(ev(2, 80, 140))).toBe(true);
		expect(pinch.mock.calls[1][0].rotate).toBeCloseTo(Math.PI / 2 - Math.atan2(40, 20), 9);
		expect(t.up(ev(2, 80, 140, "pointerup"))).toBe(true);
		// The finger left behind still belongs to the pinch until it lifts.
		expect(t.move(ev(1, 90, 90))).toBe(true);
		expect(pinchEnd).not.toHaveBeenCalled();
		expect(t.up(ev(1, 90, 90, "pointerup"))).toBe(true);
		expect(pinchEnd).toHaveBeenCalledOnce();
		expect(t.pinching).toBe(false);
	});

	it("never turns a pinch whose fingers drift less than the dead zone", () => {
		const pinch = vi.fn();
		const t = new TouchGestures(() => el, { pinch });
		t.down(ev(1, 60, 100, "pointerdown"));
		t.down(ev(2, 140, 100, "pointerdown"));
		// Spread 80 → 160 with 8° of drift, in 8 steps.
		for (let i = 1; i <= 8; i++) {
			const a = ((i * Math.PI) / 180), d = 40 + 5 * i;
			t.move(ev(1, 100 - d * Math.cos(a), 100 - d * Math.sin(a)));
			t.move(ev(2, 100 + d * Math.cos(a), 100 + d * Math.sin(a)));
		}
		expect(pinch).toHaveBeenCalled();
		for (const [s] of pinch.mock.calls) expect(s.rotate).toBe(0);
	});

	it("fires a tap in corner px, and a double-tap for two quick taps in place, not for a drag or a cancel", () => {
		const doubleTap = vi.fn();
		const tap = vi.fn();
		const t = new TouchGestures(() => el, { doubleTap, tap });
		const press = (x: number, type = "pointerup") => {
			t.down(ev(1, x, 50, "pointerdown"));
			t.up(ev(1, x, 50, type));
		};
		press(50);
		expect(tap).toHaveBeenCalledWith(50, 50);
		press(52);
		expect(doubleTap).toHaveBeenCalledOnce();
		expect(tap).toHaveBeenCalledTimes(2);
		press(50);
		press(50, "pointercancel");
		t.down(ev(1, 50, 50, "pointerdown"));
		t.move(ev(1, 90, 50));
		t.up(ev(1, 90, 50, "pointerup"));
		// Two taps a second apart are two taps.
		press(50);
		clock += 1000;
		press(50);
		expect(doubleTap).toHaveBeenCalledOnce();
		expect(tap).toHaveBeenCalledTimes(5);
	});
});
