// Presets for the parquet-deformation feature: end-keyframe edge shapes and D(x) profiles, keyed by
// the string ids stored in the parquet store. Pure data + functions, no React. In a regular tiling
// all edges are equivalent, so one `edge` profile is applied to every edge (see parquetTiling.ts).

import { STRAIGHT_EDGE, type DProfile, type EdgeProfile } from "@/lib/render/parquetStrip";

export type ParquetPresetId = "straight" | "pinwheel" | "wavy" | "fret";
export type DProfileId = "ramp" | "tent" | "sine";

export interface ParquetPreset {
  id: ParquetPresetId;
  label: string;
  edge: EdgeProfile;
}

// An S-edge: point-symmetric about its midpoint (d(s) = −d(1−s)). Applied identically to every edge,
// the same-handed S makes each tile look like it is spinning — the classic pinwheel / whirl. (A single
// asymmetric bump instead shears the lattice into a herringbone, which is NOT a pinwheel.)
const pinwheelEdge: EdgeProfile = [
  { s: 0, d: 0 },
  { s: 0.3, d: 0.3 },
  { s: 0.5, d: 0 },
  { s: 0.7, d: -0.3 },
  { s: 1, d: 0 },
];

// A symmetric smooth arch → gentle interlocking waves.
const waveEdge: EdgeProfile = [
  { s: 0, d: 0 },
  { s: 0.25, d: 0.16 },
  { s: 0.5, d: 0.24 },
  { s: 0.75, d: 0.16 },
  { s: 1, d: 0 },
];

// A rectilinear square tab → interlocking crosses / Greek-key feel. The near-vertical steps use
// distinct s-values (not exact duplicates) so the edge stays strictly increasing in s and resamples
// cleanly when morphed against another profile.
const fretEdge: EdgeProfile = [
  { s: 0, d: 0 },
  { s: 0.34, d: 0 },
  { s: 0.36, d: 0.34 },
  { s: 0.64, d: 0.34 },
  { s: 0.66, d: 0 },
  { s: 1, d: 0 },
];

export const PARQUET_PRESETS: Record<ParquetPresetId, ParquetPreset> = {
  straight: { id: "straight", label: "Straight", edge: STRAIGHT_EDGE },
  pinwheel: { id: "pinwheel", label: "Pinwheel", edge: pinwheelEdge },
  wavy: { id: "wavy", label: "Wavy", edge: waveEdge },
  fret: { id: "fret", label: "Fret", edge: fretEdge },
};

// D(x): normalized x ∈ [0,1] → deformation time t ∈ [0,1]. See the vault note
// "Directions and shapes for D(x)".
export const D_PROFILES: Record<DProfileId, DProfile> = {
  ramp: (tx) => tx,
  tent: (tx) => 1 - Math.abs(2 * tx - 1),
  // One FULL cycle. An earlier 1.5 ended at the peak (D(1)=1 ≠ D(0)=0), which cannot be animated:
  // sliding the phase then dragged a hard step — finished pinwheels abutting undeformed squares —
  // across the strip once per cycle.
  sine: (tx) => 0.5 - 0.5 * Math.cos(2 * Math.PI * tx),
};

export interface DProfileMeta {
  label: string;
  /** D(0) === D(1⁻): the strip may be treated as a loop, so the phase can travel without a seam.
   *  Only periodic profiles may be animated — `resolveDProfile` is what enforces it, and the UI
   *  disables the Animate switch when a non-periodic profile is selected. */
  periodic: boolean;
}

export const D_PROFILE_META: Record<DProfileId, DProfileMeta> = {
  ramp: { label: "Ramp", periodic: false },
  tent: { label: "Tent", periodic: true },
  sine: { label: "Sine", periodic: true },
};

/**
 * The D(x) actually handed to `buildDeformedTiling`.
 *
 * Static: the profile is sampled as-is over [0,1]. It must NOT wrap — the strip's rightmost edges
 * sit at x = width, i.e. nx = 1 exactly, and `1 % 1 === 0` would alias them back to D(0), leaving
 * the last column undeformed while its neighbours were fully deformed.
 *
 * Animated: the phase slides the profile along the strip (Kaplan's "static tiles, moving
 * interpolation function"), which needs the wrap — both to keep sampling inside [0,1] and to make
 * the travel loop. That is only coherent for a periodic D, so a non-periodic one is left static
 * rather than wrapped into a discontinuity.
 */
export function resolveDProfile(
  id: DProfileId,
  opts: { animate?: boolean; phase?: number } = {},
): DProfile {
  const base = D_PROFILES[id];
  if (!opts.animate || !D_PROFILE_META[id].periodic) return base;
  const phase = opts.phase ?? 0;
  return (nx) => base((nx + phase) % 1);
}
