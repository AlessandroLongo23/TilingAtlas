// tests/orbits-from-exact-source.test.ts
import { describe, it, expect } from "vitest";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { reconstructOracleCell } from "@/classes/algorithm/oracleCellReconstruct";
import { orbitsFromExactSource } from "@/lib/services/orbitsFromExactSource";
import type { ExactCellSource } from "@/lib/services/cellCodecService";

// Real atlas record t2001 (k=2). {T1,T2,Seed} in the ζ12 power basis. `kind` is `as const` so the
// fixture's own type keeps T1/T2/Seed directly accessible (an ExactCellSource union would hide them),
// while still being assignable to ExactCellSource where the service needs it.
const T2001 = {
  kind: "seed" as const,
  T1: [0, 2, 2, 2],
  T2: [2, 4, 0, -2],
  Seed: [
    [0, 0, 0, 0], [0, 1, 0, 1], [0, 1, 1, 1], [0, 2, 0, -1], [0, 2, 0, 0], [0, 2, 1, 0],
    [0, 2, 1, 2], [0, 3, 1, 0], [0, 3, 1, 1], [0, 3, 2, 1], [1, 3, 1, 1], [1, 3, 1, 0],
    [1, 4, 1, 1], [1, 4, 1, -1], [2, 4, 0, -1], [1, 5, 1, -1], [1, 5, 1, 0], [2, 5, 1, 0],
  ],
};

describe("orbitsFromExactSource", () => {
  it("returns k=2 and partitions the cell's vertices into 2 orbits", () => {
    const ring = CyclotomicRing.create(24);
    setActiveRing(ring);

    const data = orbitsFromExactSource(ring, "t2001", T2001 satisfies ExactCellSource);
    expect(data).not.toBeNull();
    expect(data!.k).toBe(2);

    // Independently reconstruct the cell to get its vertex positions.
    const rec = reconstructOracleCell(ring, "t2001", { T1: T2001.T1, T2: T2001.T2, Seed: T2001.Seed });
    expect("cell" in rec).toBe(true);
    const cell = (rec as { cell: { cellPolygons: { exactVertices?: unknown[] }[] } }).cell;

    const orbits = new Set<number>();
    for (const poly of cell.cellPolygons) {
      for (const vx of (poly as { exactVertices: { toVector(): { x: number; y: number } }[] }).exactVertices) {
        const p = vx.toVector();
        const o = data!.orbitAt(p.x, p.y);
        expect(o).toBeGreaterThanOrEqual(0); // every cell corner is a real tiling vertex
        orbits.add(o);
      }
    }
    expect(orbits.size).toBe(2);
  });

  it("returns null on a degenerate seed rather than throwing", () => {
    const ring = CyclotomicRing.create(24);
    setActiveRing(ring);
    const bad: ExactCellSource = { kind: "seed", T1: [0, 0, 0, 0], T2: [0, 0, 0, 0], Seed: [[0, 0, 0, 0]] };
    expect(orbitsFromExactSource(ring, "bad", bad)).toBeNull();
  });
});

// append to tests/orbits-from-exact-source.test.ts
import { GenericPolygon } from "@/classes/polygons/GenericPolygon";
import { Vector } from "@/classes/Vector";

describe("GenericPolygon orbitOfCorner", () => {
  it("carries orbitOfCorner through translatedCopy", () => {
    const square = GenericPolygon.fromVertices([
      new Vector(0, 0), new Vector(1, 0), new Vector(1, 1), new Vector(0, 1),
    ]);
    square.orbitOfCorner = [0, 1, 0, 1];
    const moved = square.translatedCopy(5, 5);
    expect(moved.orbitOfCorner).toEqual([0, 1, 0, 1]);
  });
});
