import { describe, it, expect } from "vitest";
import { buildOrbitDotMesh } from "@/lib/render/buildOrbitDotMesh";
import type { OrbitData } from "@/lib/services/orbitsFromExactSource";

// Unit square centred at the origin, CCW, in a unit-square lattice.
const squareVerts = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
const cell = { p: [{ v: squareVerts, n: 4 }], b: [[1, 0], [0, 1]] };

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

describe("buildOrbitDotMesh", () => {
	it("emits one 6-vertex quad per tiling-vertex corner, skipping orbit -1", () => {
		const mesh = buildOrbitDotMesh(cell, orbitData)!;
		expect(mesh).not.toBeNull();
		// Two corners qualify (orbit 0 and 1); the other two are -1 and dropped.
		expect(mesh.dots).toHaveLength(2);
		expect(mesh.vertexCount).toBe(12); // 2 dots x 6 verts
		expect(mesh.pos.length).toBe(24);
		expect(mesh.orbit.length).toBe(12);
		expect(mesh.k).toBe(2);
	});

	it("tags every vertex of a dot's quad with that dot's orbit id", () => {
		const mesh = buildOrbitDotMesh(cell, orbitData)!;
		// First quad = corner (-0.5,-0.5), orbit 0; second quad = (0.5,0.5), orbit 1.
		for (let v = 0; v < 6; v++) expect(mesh.orbit[v]).toBe(0);
		for (let v = 6; v < 12; v++) expect(mesh.orbit[v]).toBe(1);
		expect(mesh.dots[0]).toEqual({ x: -0.5, y: -0.5, orbit: 0 });
		expect(mesh.dots[1]).toEqual({ x: 0.5, y: 0.5, orbit: 1 });
	});

	it("returns null when there is no orbit data or no tiling-vertex corner", () => {
		expect(buildOrbitDotMesh(cell, null)).toBeNull();
		const allMinusOne: OrbitData = { k: 1, orbitAt: () => -1 };
		expect(buildOrbitDotMesh(cell, allMinusOne)).toBeNull();
	});
});
