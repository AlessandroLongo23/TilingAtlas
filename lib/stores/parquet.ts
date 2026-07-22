import { create } from "zustand";
import type { DProfileId, ParquetPresetId } from "@/lib/render/parquetPresets";
import type { TilingId } from "@/lib/render/parquetTiling";

// State for the /parquet deformation viewer. Its own store so the strip and the control panel share
// state without threading props, mirroring the other feature slices. See the vault note
// "Parquet Deformations / 08 Atlas Integration".
interface ParquetState {
  tiling: TilingId; // which base tiling the deformation runs on
  fromPreset: ParquetPresetId; // edge shape at the left of the strip (t = 0)
  toPreset: ParquetPresetId; // edge shape at the right of the strip (t = 1)
  dProfile: DProfileId; // shape of D(x) across the strip
  amount: number; // 0..1, overall deformation strength
  cols: number; // strip length in tiles
  rows: number; // strip height in tiles
  showGuides: boolean; // draw the undeformed tiling faintly underneath
  colour: boolean; // fill tiles with a gradient across the strip
  animate: boolean; // slide D(x) over the (static) tiles in time
  set: (patch: Partial<ParquetState>) => void;
}

export const useParquet = create<ParquetState>()((set) => ({
  tiling: "square",
  fromPreset: "straight",
  toPreset: "pinwheel",
  dProfile: "ramp",
  amount: 0.8,
  cols: 24,
  rows: 4,
  showGuides: false,
  colour: false,
  animate: false,
  set: (patch) => set(patch),
}));

// Dev-only: expose on window for the Playwright visual-inspection tool (see CLAUDE.md), matching
// the pattern in configuration.ts. Stripped from production by the NODE_ENV guard.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((window as any).__stores ??= {}).parquet = useParquet;
}
