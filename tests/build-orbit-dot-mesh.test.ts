import { describe, it, expect } from "vitest";
import { buildOrbitDotMesh } from "@/lib/render/buildOrbitDotMesh";
import type { OrbitData } from "@/lib/services/orbitsFromExactSource";
import { buildCellMesh } from "@/lib/render/buildCellMesh";
import { ORBIT_MARK_FLOATS } from "@/lib/render/flatTilingGL";
import { hoveredEdgeAt, hoveredTileAt } from "@/lib/render/orbitHover";

// Unit square centred at the origin, CCW, in a unit-square lattice.
const squareVerts = [
	[-0.5, -0.5],
	[0.5, -0.5],
	[0.5, 0.5],
	[-0.5, 0.5],
];
const cell = {
	p: [{ v: squareVerts, n: 4 }],
	b: [
		[1, 0],
		[0, 1],
	],
};

// Orbit data that tags two of the four corners as tiling vertices (orbits 0 and 1) and the other two as
// non-vertices (-1). Quantise to match orbitsFromExactSource's 1e-4 key tolerance.
const q = (x: number, y: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
const orbitData: OrbitData = {
	k: 2,
	orbitAt: (x, y) => {
		const m: Record<string, number> = { [q(-0.5, -0.5)]: 0, [q(0.5, 0.5)]: 1 };
		return m[q(x, y)] ?? -1;
	},
};

// Mark vertex v's fields: [x, y, end x, end y, corner x, corner y, orbit].
const at = (marks: Float32Array, v: number) => [...marks.subarray(v * ORBIT_MARK_FLOATS, (v + 1) * ORBIT_MARK_FLOATS)];

describe("buildOrbitDotMesh", () => {
	it("emits one 6-vertex quad per tiling-vertex corner, skipping orbit -1", () => {
		const mesh = buildOrbitDotMesh(cell, orbitData)!;
		expect(mesh).not.toBeNull();
		// Two corners qualify (orbit 0 and 1); the other two are -1 and dropped.
		expect(mesh.dots).toHaveLength(2);
		expect(mesh.vertexCount).toBe(12); // 2 dots x 6 verts
		expect(mesh.marks.length).toBe(12 * ORBIT_MARK_FLOATS);
		expect(mesh.k).toBe(2);
	});

	it("tags every vertex of a dot's quad with that dot's orbit id, both ends at the dot", () => {
		const mesh = buildOrbitDotMesh(cell, orbitData)!;
		// First quad = corner (-0.5,-0.5), orbit 0; second quad = (0.5,0.5), orbit 1.
		for (let v = 0; v < 6; v++)
			expect(at(mesh.marks, v)).toEqual([-0.5, -0.5, -0.5, -0.5, ...at(mesh.marks, v).slice(4, 6), 0]);
		for (let v = 6; v < 12; v++) expect(at(mesh.marks, v)[6]).toBe(1);
		expect(mesh.dots[0]).toEqual({ x: -0.5, y: -0.5, orbit: 0 });
		expect(mesh.dots[1]).toEqual({ x: 0.5, y: 0.5, orbit: 1 });
	});

	it("draws each side as a bar between its ends, and lines tile orbit ids up with the fill", () => {
		// The square lattice: the vertical sides are one edge orbit, the horizontal ones another.
		const withFeatures: OrbitData = {
			...orbitData,
			edges: { count: 2, at: (x, y) => (Math.abs(Math.abs(x) - 0.5) < 1e-9 && Math.abs(y) < 1e-9 ? 0 : 1) },
			faces: { count: 1, at: () => 0 },
		};
		const mesh = buildOrbitDotMesh(cell, withFeatures)!;
		const cellMesh = buildCellMesh(cell)!;
		expect(mesh.edges!.marks.length).toBe(4 * 6 * ORBIT_MARK_FLOATS);
		expect(mesh.faces!.orbit.length).toBe(cellMesh.fillVertexCount);
		// sides in ring order: bottom, right, top, left; six vertices each
		expect([0, 6, 12, 18].map((v) => at(mesh.edges!.marks, v)[6])).toEqual([1, 0, 1, 0]);
		expect(at(mesh.edges!.marks, 6).slice(0, 4)).toEqual([0.5, -0.5, 0.5, 0.5]); // the right side, end to end
		expect([...mesh.faces!.orbit].every((o) => o === 0)).toBe(true);
		// hit tests: the pointer just inside the right side, in another lattice copy, and inside the tile
		expect(hoveredEdgeAt(mesh.edges!.features, { x: 3.49, y: 7 }, [1, 0], [0, 1], 1, 100)).toBe(0);
		expect(hoveredEdgeAt(mesh.edges!.features, { x: 3.2, y: 7 }, [1, 0], [0, 1], 1, 100)).toBe(-1);
		expect(hoveredTileAt(mesh.faces!.features, { x: -4.1, y: 2.3 }, [1, 0], [0, 1], 1)).toBe(0);
	});

	it("returns null when there is no orbit data or no tiling-vertex corner", () => {
		expect(buildOrbitDotMesh(cell, null)).toBeNull();
		const allMinusOne: OrbitData = { k: 1, orbitAt: () => -1 };
		expect(buildOrbitDotMesh(cell, allMinusOne)).toBeNull();
	});
});
