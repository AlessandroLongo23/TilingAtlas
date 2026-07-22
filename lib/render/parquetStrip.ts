// Shared types for the parquet-deformation feature. The geometry itself lives in parquetTiling.ts
// (a general edge-graph model over any periodic tiling); this file holds the small vocabulary those
// modules share. See the vault note "Parquet Deformations".

export type Pt = readonly [number, number];

/** One control point of an edge, in edge-local coordinates: `s` runs 0→1 along the edge,
 *  `d` is the perpendicular offset (before scaling by `amount` and the local time `t`). */
export interface ControlPoint {
  s: number;
  d: number;
}

/** An edge's END-keyframe shape. Must start at s=0,d=0 and end at s=1,d=0 so edges meet at corners. */
export type EdgeProfile = ControlPoint[];

/** D(x): maps normalized horizontal position (0 at the left of the strip, 1 at the right) to the
 *  deformation time t ∈ [0,1] for edges at that position. */
export type DProfile = (normalizedX: number) => number;

/** The trivial (straight) edge profile. */
export const STRAIGHT_EDGE: EdgeProfile = [
  { s: 0, d: 0 },
  { s: 1, d: 0 },
];
