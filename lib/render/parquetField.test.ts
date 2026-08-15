import { describe, expect, it } from "vitest";
import {
  CORNER_KEYS,
  bilinearWeights,
  buildBlendField,
  evalProfile,
  keyframeCount,
  type FieldSpec,
} from "@/lib/render/parquetField";
import { TILINGS, buildDeformedTiling } from "@/lib/render/parquetTiling";
import { PARQUET_PRESETS } from "@/lib/render/parquetPresets";
import type { Pt } from "@/lib/render/parquetStrip";

// The blend field is the one place a bug shows up as a TORN tiling rather than an ugly one, so the
// invariants worth pinning are: weights are convex (the viewBox envelope is only exact while they
// are), the field is continuous (a jump would deform neighbouring edges by different amounts), and
// the corner keyframes actually land on the corners they are labelled with.

const spec = (over: Partial<FieldSpec> = {}): FieldSpec => ({
  mode: "1d",
  kind: "profile",
  profileX: "ramp",
  profileY: "ramp",
  noise: { frequency: 3, contrast: 1.5, speed: 0.1, seed: 1 },
  drift: { x: 0, y: 0 },
  time: 0,
  width: 24,
  height: 4,
  ...over,
});

const KINDS = ["profile", "noise"] as const;
const MODES = ["1d", "2d"] as const;

describe("keyframeCount", () => {
  it("is 4 only for the 2-D bilinear patch; noise is one scalar wherever it is read", () => {
    expect(keyframeCount("1d", "profile")).toBe(2);
    expect(keyframeCount("1d", "noise")).toBe(2);
    expect(keyframeCount("2d", "profile")).toBe(4);
    expect(keyframeCount("2d", "noise")).toBe(2);
  });
});

describe("blend weights", () => {
  it.each(MODES.flatMap((mode) => KINDS.map((kind) => [mode, kind] as const)))(
    "%s/%s: weights are convex everywhere — non-negative and summing to 1",
    (mode, kind) => {
      const s = spec({ mode, kind, profileX: "sine", profileY: "tent", time: 3.7 });
      const f = buildBlendField(s);
      expect(keyframeCount(mode, kind)).toBe(f(0, 0).length);
      for (let i = 0; i <= 40; i++) {
        for (let j = 0; j <= 40; j++) {
          const w = f((i / 40) * s.width, (j / 40) * s.height);
          let sum = 0;
          for (const v of w) {
            expect(v).toBeGreaterThanOrEqual(-1e-12);
            sum += v;
          }
          expect(sum).toBeCloseTo(1, 10);
        }
      }
    },
  );

  it.each(MODES.flatMap((mode) => KINDS.map((kind) => [mode, kind] as const)))(
    "%s/%s: the field is continuous — no jump that would tear the tiling",
    (mode, kind) => {
      const s = spec({ mode, kind, profileX: "sine", profileY: "sine", time: 1.3 });
      const f = buildBlendField(s);
      const N = 3000;
      let maxJump = 0;
      for (let i = 1; i <= N; i++) {
        const a = f(((i - 1) / N) * s.width, s.height * 0.4);
        const b = f((i / N) * s.width, s.height * 0.4);
        for (let k = 0; k < a.length; k++) maxJump = Math.max(maxJump, Math.abs(a[k] - b[k]));
      }
      expect(maxJump).toBeLessThan(0.02);
    },
  );
});

describe("bilinearWeights", () => {
  it("puts all the weight on the corner it is asked for, in CORNER_KEYS order", () => {
    const at: Record<string, [number, number]> = { "00": [0, 0], "10": [1, 0], "01": [0, 1], "11": [1, 1] };
    CORNER_KEYS.forEach((k, index) => {
      const w = bilinearWeights(...at[k]);
      expect(w[index], `corner ${k}`).toBeCloseTo(1, 12);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    });
  });

  it("splits evenly at the centre", () => {
    for (const v of bilinearWeights(0.5, 0.5)) expect(v).toBeCloseTo(0.25, 12);
  });
});

describe("evalProfile outside [0,1]", () => {
  // The old code wrapped everything with `% 1`, which dragged a hard step across the strip and is
  // why the ramp could not be animated. Periodic profiles wrap; non-periodic ones clamp. Neither
  // introduces a discontinuity.
  it("wraps periodic profiles so a drifting field loops", () => {
    for (const u of [0.17, 0.5, 0.93]) {
      expect(evalProfile("sine", u + 3)).toBeCloseTo(evalProfile("sine", u), 12);
      expect(evalProfile("tent", u - 2)).toBeCloseTo(evalProfile("tent", u), 12);
    }
  });

  it("clamps the ramp instead of wrapping it — a sweep that ends, never a seam", () => {
    expect(evalProfile("ramp", 1.6)).toBe(1);
    expect(evalProfile("ramp", -0.4)).toBe(0);
    let maxJump = 0;
    for (let i = 1; i <= 4000; i++) {
      const a = evalProfile("ramp", -2 + ((i - 1) * 6) / 4000);
      const b = evalProfile("ramp", -2 + (i * 6) / 4000);
      maxJump = Math.max(maxJump, Math.abs(b - a));
    }
    expect(maxJump).toBeLessThan(0.01);
  });
});

describe("2-D corner patch", () => {
  it("each corner of the patch is deformed by its own keyframe", () => {
    const instance = TILINGS.square.build(8, 8);
    const s = spec({ mode: "2d", kind: "profile", width: instance.width, height: instance.height });
    const bumpUp = [
      { s: 0, d: 0 },
      { s: 0.5, d: 0.4 },
      { s: 1, d: 0 },
    ];
    const flat = PARQUET_PRESETS.straight.edge;
    // Only the bottom-left corner (CORNER_KEYS[0] = "00") carries a bump.
    const tiles = buildDeformedTiling(instance, {
      keyframes: [bumpUp, flat, flat, flat],
      amount: 1,
      weights: buildBlendField(s),
    });
    const bulgeOf = (tile: (typeof tiles)[number]) =>
      Math.max(
        ...tile.edges.flatMap((edge) => {
          const a = edge[0];
          const b = edge[edge.length - 1];
          return edge.map((p) => {
            // perpendicular distance from the chord
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const len = Math.hypot(dx, dy) || 1;
            return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
          });
        }),
      );
    const centroid = (f: Pt[]) => [
      f.reduce((t, p) => t + p[0], 0) / f.length,
      f.reduce((t, p) => t + p[1], 0) / f.length,
    ];
    const nearest = (x: number, y: number) => {
      let best = 0;
      let bd = Infinity;
      instance.faces.forEach((f, i) => {
        const [cx, cy] = centroid(f);
        const d = Math.hypot(cx - x, cy - y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return tiles[best];
    };
    const bl = bulgeOf(nearest(0, 0));
    const tr = bulgeOf(nearest(instance.width, instance.height));
    const br = bulgeOf(nearest(instance.width, 0));
    const tl = bulgeOf(nearest(0, instance.height));
    expect(bl).toBeGreaterThan(0.2); // its own keyframe
    for (const [name, v] of [
      ["bottom-right", br],
      ["top-left", tl],
      ["top-right", tr],
    ] as const) {
      expect(v, name).toBeLessThan(bl / 2);
    }
  });
});

describe("drift", () => {
  it("equal grid and field drift cancel in the sample coordinate: the shapes ride along", () => {
    const s0 = buildBlendField(spec({ profileX: "sine", time: 0 }));
    const t = 2.5;
    const drift = 0.1;
    const s1 = buildBlendField(spec({ profileX: "sine", time: t, drift: { x: drift, y: 0 } }));
    // A tile that started at x and moved with the grid is now at x + drift·t·width.
    for (const x of [0, 5, 11.5, 24]) {
      expect(s1(x + drift * t * 24, 0)[1]).toBeCloseTo(s0(x, 0)[1], 10);
    }
  });

  it("field drift alone moves the pattern to the right for a positive rate", () => {
    const f0 = buildBlendField(spec({ profileX: "sine", time: 0 }));
    const f1 = buildBlendField(spec({ profileX: "sine", time: 1, drift: { x: 0.1, y: 0 } }));
    // The value that was at x = 0 has travelled to x = 0.1·width.
    expect(f1(0.1 * 24, 0)[1]).toBeCloseTo(f0(0, 0)[1], 10);
  });
});
