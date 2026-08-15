import { create } from "zustand";
import type { DProfileId, ParquetPresetId } from "@/lib/render/parquetPresets";
import type { FieldKind, ParquetMode, Vec2 } from "@/lib/render/parquetField";
import type { TilingId } from "@/lib/render/parquetTiling";

// State for the /parquet deformation viewer. Its own store so the strip and the control panel share
// state without threading props, mirroring the other feature slices. See the vault note
// "Parquet Deformations / 08 Atlas Integration".
interface ParquetState {
  mode: ParquetMode; // 1-D strip, or 2-D patch deforming in both directions
  fieldKind: FieldKind; // analytic D profile, or Perlin noise
  tiling: TilingId; // which base tiling the deformation runs on

  // Two-keyframe shapes: the ends of a 1-D strip, and both modes' noise endpoints.
  fromPreset: ParquetPresetId;
  toPreset: ParquetPresetId;
  // Four-keyframe shapes for the 2-D bilinear patch, in CORNER_KEYS order: 00, 10, 01, 11
  // (bottom-left, bottom-right, top-left, top-right in tiling coordinates, y up).
  cornerPresets: [ParquetPresetId, ParquetPresetId, ParquetPresetId, ParquetPresetId];

  dProfile: DProfileId; // D along x (and the only profile in 1-D mode)
  dProfileY: DProfileId; // D along y — 2-D profile mode only

  noiseFrequency: number; // cycles of noise across the patch width
  noiseContrast: number; // stretch about 0.5 so the field reaches both keyframes
  noiseSpeed: number; // rate of the noise's own time axis ("boiling")
  noiseSeed: number;

  gridDrift: Vec2; // tiles translate through a static field (patch-fractions / second)
  fieldDrift: Vec2; // the field translates over static tiles (patch-fractions / second)

  amount: number; // 0..1, overall deformation strength
  cols: number; // patch width in tiles
  rows: number; // patch height in tiles
  showGuides: boolean; // draw the undeformed tiling faintly underneath
  colour: boolean; // fill tiles by the field's blend weights
  set: (patch: Partial<ParquetState>) => void;
}

/** Patch shape per mode: a long strip reads the 1-D evolution, a squarish patch is needed before a
 *  deformation in two directions is legible at all. Applied on every mode switch. */
export const MODE_PATCH: Record<ParquetMode, { cols: number; rows: number }> = {
  "1d": { cols: 24, rows: 4 },
  "2d": { cols: 12, rows: 10 },
};

export const useParquet = create<ParquetState>()((set) => ({
  mode: "1d",
  fieldKind: "profile",
  tiling: "square",

  fromPreset: "straight",
  toPreset: "pinwheel",
  cornerPresets: ["straight", "pinwheel", "wavy", "fret"],

  dProfile: "ramp",
  dProfileY: "ramp",

  noiseFrequency: 3,
  noiseContrast: 1.5,
  noiseSpeed: 0.12,
  noiseSeed: 1,

  gridDrift: { x: 0, y: 0 },
  fieldDrift: { x: 0, y: 0 },

  amount: 0.8,
  cols: MODE_PATCH["1d"].cols,
  rows: MODE_PATCH["1d"].rows,
  showGuides: false,
  colour: false,
  set: (patch) => set(patch),
}));

// Dev-only: expose on window for the Playwright visual-inspection tool (see CLAUDE.md), matching
// the pattern in configuration.ts. Stripped from production by the NODE_ENV guard.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((window as any).__stores ??= {}).parquet = useParquet;
}
