import { describe, expect, it } from "vitest";
import {
  NOISE_AMP_2D,
  NOISE_AMP_3D,
  noiseField,
  remapNoise,
} from "@/lib/render/parquetNoise";

// The [0,1] remap in parquetField.ts divides by NOISE_AMP_*. Those constants are not free parameters:
// too small and the field clips flat over large patches (every tile pinned at one keyframe), too
// large and it never leaves mid-blend. These tests MEASURE the real amplitude over a dense sample and
// pin the constants to it, so the calibration cannot silently drift if the gradients change.

const field = noiseField(1);

function sample2(n: number) {
  let peak = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      peak = Math.max(peak, Math.abs(field.noise2((i * 7.13) / n, (j * 5.31) / n)));
    }
  }
  return peak;
}

function sample3(n: number) {
  let peak = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        peak = Math.max(
          peak,
          Math.abs(field.noise3((i * 7.13) / n, (j * 5.31) / n, (k * 3.77) / n)),
        );
      }
    }
  }
  return peak;
}

describe("perlin noise", () => {
  it("2D peaks near NOISE_AMP_2D: the constant is neither over- nor under-stated", () => {
    const peak = sample2(300);
    expect(peak).toBeLessThanOrEqual(NOISE_AMP_2D);
    expect(peak).toBeGreaterThan(NOISE_AMP_2D * 0.75);
  });

  it("3D peaks near NOISE_AMP_3D", () => {
    const peak = sample3(60);
    expect(peak).toBeLessThanOrEqual(NOISE_AMP_3D);
    expect(peak).toBeGreaterThan(NOISE_AMP_3D * 0.6);
  });

  it("is zero at the integer lattice — the defining property of gradient noise", () => {
    for (const [x, y] of [
      [0, 0],
      [3, 5],
      [-2, 7],
    ]) {
      expect(field.noise2(x, y)).toBeCloseTo(0, 12);
      expect(field.noise3(x, y, 2)).toBeCloseTo(0, 12);
    }
  });

  it("is smooth: no step larger than the local slope allows", () => {
    // A D-field with a jump would tear the tiling — neighbouring edges would deform by wildly
    // different amounts. Walk a line finely; the largest step must stay tiny.
    let maxJump = 0;
    const N = 20000;
    for (let i = 1; i <= N; i++) {
      const a = field.noise2(((i - 1) * 20) / N, 0.37);
      const b = field.noise2((i * 20) / N, 0.37);
      maxJump = Math.max(maxJump, Math.abs(b - a));
    }
    expect(maxJump).toBeLessThan(0.01);
  });

  it("is deterministic per seed, and different seeds give different fields", () => {
    expect(noiseField(7).noise3(1.3, 2.7, 0.4)).toBe(noiseField(7).noise3(1.3, 2.7, 0.4));
    expect(noiseField(7).noise2(1.3, 2.7)).not.toBeCloseTo(noiseField(8).noise2(1.3, 2.7), 6);
  });

  it("3D reduces to a smooth 2D slice as z varies — the time axis does not jump", () => {
    let maxJump = 0;
    const N = 5000;
    for (let i = 1; i <= N; i++) {
      const a = field.noise3(1.4, 2.2, ((i - 1) * 10) / N);
      const b = field.noise3(1.4, 2.2, (i * 10) / N);
      maxJump = Math.max(maxJump, Math.abs(b - a));
    }
    expect(maxJump).toBeLessThan(0.01);
  });
});

describe("remapNoise", () => {
  it("centres on 0.5 and stays inside [0,1] however hard the contrast pushes", () => {
    expect(remapNoise(0, NOISE_AMP_2D, 1.5)).toBeCloseTo(0.5, 12);
    for (const raw of [-1, -0.5, 0, 0.4, 1]) {
      for (const contrast of [0.5, 1, 4, 50]) {
        const t = remapNoise(raw, NOISE_AMP_2D, contrast);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
      }
    }
  });

  it("reaches both keyframes at the default contrast — the field is not stuck mid-blend", () => {
    // With contrast 1.5 a peak-amplitude sample must saturate, or the deformation never resolves
    // into either shape and the whole strip reads as one mushy average.
    expect(remapNoise(NOISE_AMP_2D, NOISE_AMP_2D, 1.5)).toBe(1);
    expect(remapNoise(-NOISE_AMP_2D, NOISE_AMP_2D, 1.5)).toBe(0);
  });
});
