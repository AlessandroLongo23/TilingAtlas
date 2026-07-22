import { describe, expect, it } from "vitest";
import {
  D_PROFILES,
  D_PROFILE_META,
  resolveDProfile,
  PARQUET_PRESETS,
  type DProfileId,
} from "@/lib/render/parquetPresets";
import { TILINGS, buildDeformedTiling } from "@/lib/render/parquetTiling";

// D(x) is sampled at the edge midpoint's NORMALIZED x. The strip's rightmost edges sit at x = width,
// i.e. nx = 1 exactly — the one sample the wrap-around `% 1` used to alias back to nx = 0, flattening
// the last column. Wrapping is only needed to make the animation travel; a static strip must not wrap,
// and an animated one is only coherent if D itself is periodic.

const IDS = Object.keys(D_PROFILES) as DProfileId[];
const EPS = 1e-9;

describe("D(x) profiles", () => {
  it.each(IDS)("%s: the periodic flag matches the function's actual wrap behaviour", (id) => {
    const f = D_PROFILES[id];
    const jump = Math.abs(f(1 - EPS) - f(0));
    expect(jump < 1e-6).toBe(D_PROFILE_META[id].periodic);
  });

  it("offers at least two periodic profiles, so animation is not down to a single choice", () => {
    expect(IDS.filter((id) => D_PROFILE_META[id].periodic).length).toBeGreaterThanOrEqual(2);
  });

  it("ramp is the end-to-end (non-periodic) profile: D(0)=0, D(1)=1", () => {
    expect(D_PROFILES.ramp(0)).toBeCloseTo(0, 12);
    expect(D_PROFILES.ramp(1)).toBeCloseTo(1, 12);
    expect(D_PROFILE_META.ramp.periodic).toBe(false);
  });
});

describe("resolveDProfile", () => {
  it.each(IDS)("%s: static (animate off) samples the profile straight, reaching D(1) at nx=1", (id) => {
    const d = resolveDProfile(id, { animate: false, phase: 0.42 });
    for (const nx of [0, 0.25, 0.5, 0.75, 1]) {
      expect(d(nx)).toBeCloseTo(D_PROFILES[id](nx), 12);
    }
  });

  it("static ramp reaches full deformation at the right edge (nx=1 is not aliased to 0)", () => {
    expect(resolveDProfile("ramp", { animate: false })(1)).toBeCloseTo(1, 12);
  });

  it.each(IDS.filter((id) => D_PROFILE_META[id].periodic))(
    "%s: animated, the travelling wrap introduces no discontinuity",
    (id) => {
      for (const phase of [0, 0.17, 0.5, 0.83]) {
        const d = resolveDProfile(id, { animate: true, phase });
        // Walk the strip finely; a wrap seam shows up as a jump far larger than the local slope.
        const N = 2000;
        let maxJump = 0;
        for (let i = 1; i <= N; i++) {
          maxJump = Math.max(maxJump, Math.abs(d(i / N) - d((i - 1) / N)));
        }
        expect(maxJump, `phase ${phase}`).toBeLessThan(0.05);
      }
    },
  );

  it("animated, D stays within [0,1] so the from→to blend never extrapolates", () => {
    for (const id of IDS) {
      for (const phase of [0, 0.31, 0.77]) {
        const d = resolveDProfile(id, { animate: true, phase });
        for (let i = 0; i <= 100; i++) {
          const v = d(i / 100);
          expect(v).toBeGreaterThanOrEqual(-1e-9);
          expect(v).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  });
});

describe("the strip's last column", () => {
  // The reported symptom: a flat wall at the right end instead of a finished column of pinwheels.
  it("is deformed as strongly as D(1) demands, not reset to D(0)", () => {
    const cols = 9;
    const instance = TILINGS.square.build(cols, 2);
    const tiles = buildDeformedTiling(instance, {
      from: PARQUET_PRESETS.straight.edge,
      to: PARQUET_PRESETS.pinwheel.edge,
      amount: 0.8,
      d: resolveDProfile("ramp", { animate: false }),
    });

    // Max perpendicular bulge of the vertical edges in each column.
    const bulge = new Map<number, number>();
    for (const t of tiles) {
      for (const curve of t.edges) {
        const a = curve[0];
        const b = curve[curve.length - 1];
        if (Math.abs(a[0] - b[0]) > 1e-9) continue; // horizontal-ish edge
        const off = Math.max(...curve.map((p) => Math.abs(p[0] - a[0])));
        bulge.set(a[0], Math.max(bulge.get(a[0]) ?? 0, off));
      }
    }
    // Under a ramp the bulge grows monotonically left→right, all the way to the last column.
    const columns = [...bulge.keys()].sort((x, y) => x - y);
    expect(columns[columns.length - 1]).toBe(cols);
    for (let i = 1; i < columns.length; i++) {
      expect(bulge.get(columns[i])!, `column x=${columns[i]}`).toBeGreaterThan(bulge.get(columns[i - 1])!);
    }
  });
});
