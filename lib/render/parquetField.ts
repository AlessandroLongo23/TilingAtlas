// The D-field for the parquet deformation: everything that decides HOW FAR ALONG the evolution a
// given point of the plane is. `parquetTiling.ts` owns the geometry and asks this module one
// question per edge — "what are the blend weights here?" — so every new field shape (a profile, a
// noise, later a scattered-keyframe Shepard interpolation) plugs in without touching the geometry.
//
// Vault: "The D(x) Parameter Space", "Directions and shapes for D(x)", "Multi-dimensional scatter
// interpolation".
//
// Two independent knobs, per Kaplan's decoupling:
//   • the TILES may drift (handled by the caller translating the instance), and
//   • the FIELD may drift (handled here, by offsetting the sample point).
// Both are expressed in patch-fractions per second, so equal drifts cancel in the sample coordinate
// and each tile carries its own shape along as it slides — the clearest demonstration that the two
// are separate things. (Exactly, until the grid drift wraps on the tiling's own lattice period,
// which is much shorter than the patch; after that the tiles have re-entered and the field has moved
// on, so the cancellation is a within-period effect.)

import {
  D_PROFILES,
  D_PROFILE_META,
  type DProfileId,
} from "./parquetPresets";
import { NOISE_AMP_2D, NOISE_AMP_3D, noiseField, remapNoise } from "./parquetNoise";
import type { BlendField } from "./parquetTiling";

/** 1-D: the deformation runs along the strip. 2-D: it runs in both directions at once. */
export type ParquetMode = "1d" | "2d";

/** What drives the field. `profile` is an analytic D (ramp/tent/sine); `noise` is Perlin — 2-D
 *  (x, time) in 1-D mode, 3-D (x, y, time) in 2-D mode. */
export type FieldKind = "profile" | "noise";

export interface NoiseSettings {
  /** Cycles of noise across the patch width. */
  frequency: number;
  /** Stretch about 0.5 so the field actually reaches both keyframes instead of hovering mid-blend. */
  contrast: number;
  /** How fast the noise evolves in its own time axis — the "boiling" rate, distinct from drift. */
  speed: number;
  seed: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface FieldSpec {
  mode: ParquetMode;
  kind: FieldKind;
  /** Profile along x (and the only profile in 1-D mode). */
  profileX: DProfileId;
  /** Profile along y — 2-D profile mode only. */
  profileY: DProfileId;
  noise: NoiseSettings;
  /** Field drift, patch-fractions per second. Positive x ⇒ the pattern travels right. */
  drift: Vec2;
  /** Elapsed animation time in seconds. */
  time: number;
  /** Core patch extents, used to normalize world coordinates. */
  width: number;
  height: number;
}

/**
 * How many keyframe shapes the field blends.
 *
 * 4 only for the 2-D corner patch (one shape per corner, bilinear between them). Noise is a single
 * scalar wherever it is read, so it interpolates two shapes in both modes.
 */
export function keyframeCount(mode: ParquetMode, kind: FieldKind): 2 | 4 {
  return mode === "2d" && kind === "profile" ? 4 : 2;
}

/**
 * Evaluate a D profile outside [0,1] without introducing a seam.
 *
 * Periodic profiles (tent, sine) wrap, so a drifting field loops forever. Non-periodic ones (ramp)
 * CLAMP — the old code wrapped everything with `% 1`, which dragged a hard step across the strip and
 * is why animation had to be disabled for the ramp. Clamping has no discontinuity: the ramp's
 * transition band simply sweeps across the patch once and then the patch sits at one extreme. Finite,
 * but never broken, so drift no longer needs a hard guard — only the "does not loop" note in the UI.
 */
export function evalProfile(id: DProfileId, u: number): number {
  const f = D_PROFILES[id];
  if (D_PROFILE_META[id].periodic) return f(u - Math.floor(u));
  return f(u < 0 ? 0 : u > 1 ? 1 : u);
}

/** Corner order for the 2-D bilinear patch, in tiling coordinates (y UP). */
export const CORNER_KEYS = ["00", "10", "01", "11"] as const;
export type CornerKey = (typeof CORNER_KEYS)[number];

/** Screen-facing labels: SVG flips y, so v = 1 is the TOP of the drawing. */
export const CORNER_LABELS: Record<CornerKey, string> = {
  "01": "Top left",
  "11": "Top right",
  "00": "Bottom left",
  "10": "Bottom right",
};

/** Bilinear weights over the four corners, in CORNER_KEYS order. Convex for u,v ∈ [0,1], which is
 *  what keeps `keyframeExtremes` an exact bound. The CDT guide lists this as its bilinear method;
 *  it is the two-keyframe blend applied once per axis. */
export function bilinearWeights(u: number, v: number): number[] {
  return [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
}

/**
 * Build the weight field handed to `buildDeformedTiling`.
 *
 * World (x, y) is normalized to the core patch, then shifted by the field drift. Noise is sampled on
 * a coordinate that divides BOTH axes by the width, so its cells stay square on a patch that is not
 * — otherwise a 24×4 strip gets noise stretched six to one.
 */
export function buildBlendField(spec: FieldSpec): BlendField {
  const w = spec.width > 0 ? spec.width : 1;
  const h = spec.height > 0 ? spec.height : 1;
  const aspect = h / w; // ny·aspect converts the y fraction back into width units
  const ox = spec.drift.x * spec.time;
  const oy = spec.drift.y * spec.time;

  if (spec.kind === "noise") {
    const { frequency, contrast, speed, seed } = spec.noise;
    const field = noiseField(seed);
    const z = speed * spec.time;
    if (spec.mode === "1d") {
      return (x) => {
        const nx = x / w - ox;
        const t = remapNoise(field.noise2(nx * frequency, z), NOISE_AMP_2D, contrast);
        return [1 - t, t];
      };
    }
    return (x, y) => {
      const nx = x / w - ox;
      const ny = y / h - oy;
      const t = remapNoise(
        field.noise3(nx * frequency, ny * aspect * frequency, z),
        NOISE_AMP_3D,
        contrast,
      );
      return [1 - t, t];
    };
  }

  if (spec.mode === "1d") {
    return (x) => {
      const t = evalProfile(spec.profileX, x / w - ox);
      return [1 - t, t];
    };
  }

  return (x, y) =>
    bilinearWeights(evalProfile(spec.profileX, x / w - ox), evalProfile(spec.profileY, y / h - oy));
}

/** Per-keyframe base colours, blended by the same weights that blend the shapes — so the fill shows
 *  the field directly. Index 0/1 keep the old blue→orange strip gradient. */
const KEYFRAME_RGB: readonly (readonly [number, number, number])[] = [
  [74, 144, 226],
  [240, 150, 60],
  [70, 190, 150],
  [210, 90, 190],
];

/** Weighted-average fill for a tile. Blended in RGB, not HSL: hue is circular, and averaging it
 *  sends a blue↔orange mix through green instead of through grey. */
export function blendFill(weights: number[]): string {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < weights.length; i++) {
    const c = KEYFRAME_RGB[i % KEYFRAME_RGB.length];
    r += weights[i] * c[0];
    g += weights[i] * c[1];
    b += weights[i] * c[2];
  }
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
}
