// lib/services/orbitsFromExactSource.ts
import type { CyclotomicRing } from "@/classes/Cyclotomic";
import { deserializeCell } from "@/classes/algorithm/cellCodec";
import { reconstructOracleCell } from "@/classes/algorithm/oracleCellReconstruct";
import { KUniformityChecker } from "@/classes/algorithm/KUniformityChecker";
import type { PeriodCell } from "@/classes/algorithm/PeriodSolver";
import type { ExactCellSource } from "@/lib/services/cellCodecService";

export type OrbitData = {
  /** Number of vertex orbits (= k for a k-uniform tiling). */
  k: number;
  /** Orbit id at an absolute float vertex position, or -1 if no vertex maps there. */
  orbitAt: (x: number, y: number) => number;
};

// Absolute-position key. renderCell and the reconstructed exact cell share one coordinate frame
// (verified empirically), and tiling edges are unit length, so quantizing to 1e-4 keys every distinct
// vertex uniquely with a ~5000x margin over the vertex spacing.
const key = (x: number, y: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;

/**
 * Orbit id per vertex of an oracle tiling, computed from its exact cell. Mirrors
 * symmetryFromExactSource: the caller must have set the active ring to `ring`. Returns null when the
 * cell cannot be reconstructed or the orbit gate is degenerate (caller then draws no orbit partition).
 */
export function orbitsFromExactSource(
  ring: CyclotomicRing,
  id: string,
  source: ExactCellSource,
): OrbitData | null {
  let cell: PeriodCell;
  if (source.kind === "seed") {
    const rec = reconstructOracleCell(ring, id, { T1: source.T1, T2: source.T2, Seed: source.Seed });
    if ("error" in rec) return null;
    cell = rec.cell;
  } else {
    cell = deserializeCell(ring, source.cell);
  }

  const res = new KUniformityChecker().vertexOrbits(
    cell.cellPolygons,
    cell.basisExact[0],
    cell.basisExact[1],
  );
  if (!res) return null;

  // Key every vertex of the replicated block by absolute position. The block spans a ±3-cell window, so
  // it covers the whole base cell (and then some) — every base-polygon corner the canvas draws is found.
  const map = new Map<string, number>();
  for (const poly of res.block) {
    for (const vx of poly.exactVertices ?? []) {
      const o = res.orbitOf(vx);
      if (o == null) continue;
      const p = vx.toVector();
      map.set(key(p.x, p.y), o);
    }
  }

  return { k: res.orbits, orbitAt: (x, y) => map.get(key(x, y)) ?? -1 };
}
