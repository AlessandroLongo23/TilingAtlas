import { describe, expect, it } from "vitest";
import { buildParquetSvgModel, parquetViewBox } from "@/lib/render/parquetSvg";
import { PARQUET_PRESETS, resolveDProfile } from "@/lib/render/parquetPresets";
import { TILINGS, buildDeformedTiling } from "@/lib/render/parquetTiling";
import type { Pt } from "@/lib/render/parquetStrip";

// The animated strip (components/landing/parquet-mini.tsx) sizes its viewBox once for the whole
// phase sweep. If the envelope ever failed to contain a frame, tiles would clip; if it were fitted
// per frame instead, the box would breathe and the element's height with it — measured at 224 ↔ 234
// px on the landing card before parquetViewBox existed.

const SAMPLES = 24;

const frameAt = (phase: number): Pt[][] =>
	buildDeformedTiling(TILINGS.square.build(12, 3), {
		from: PARQUET_PRESETS.straight.edge,
		to: PARQUET_PRESETS.pinwheel.edge,
		amount: 0.85,
		d: resolveDProfile("sine", { animate: true, phase }),
	}).map((t) => t.outline);

const frames = Array.from({ length: SAMPLES }, (_, i) => frameAt(i / SAMPLES));
const box = (s: string) => {
	const [x, y, w, h] = s.split(" ").map(Number);
	return { x, y, w, h, right: x + w, bottom: y + h };
};

describe("parquetViewBox", () => {
	it("contains every frame's own box", () => {
		const envelope = box(parquetViewBox(frames));
		for (const [i, frame] of frames.entries()) {
			const b = box(buildParquetSvgModel(frame).viewBox);
			expect(b.x, `frame ${i} left`).toBeGreaterThanOrEqual(envelope.x - 1e-9);
			expect(b.y, `frame ${i} top`).toBeGreaterThanOrEqual(envelope.y - 1e-9);
			expect(b.right, `frame ${i} right`).toBeLessThanOrEqual(envelope.right + 1e-9);
			expect(b.bottom, `frame ${i} bottom`).toBeLessThanOrEqual(envelope.bottom + 1e-9);
		}
	});

	it("is one box for the whole sweep, where per-frame fitting keeps moving it", () => {
		// Not all 24 differ — the sine profile is symmetric and the box rounds to 4 decimals — but
		// the count is what matters: per frame the box moves, over the sweep it does not.
		expect(new Set(frames.map((f) => parquetViewBox([f]))).size).toBeGreaterThan(4);
		expect(new Set(frames.map(() => parquetViewBox(frames))).size).toBe(1);
	});

	it("matches the single-frame box when handed one frame", () => {
		expect(parquetViewBox([frames[0]])).toBe(buildParquetSvgModel(frames[0]).viewBox);
	});
});
