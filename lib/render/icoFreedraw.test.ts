import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pushSphericalFace, type V3 } from "./icoFreedraw";
import type { SphPolyPattern } from "@/lib/tilings/sph-poly";

// What the sphere-mode face mesh must satisfy: a closed solid's faces TILE the sphere. The data tests
// (lib/tilings/sph-poly.test.ts) check the records close combinatorially; this checks the triangles we
// actually hand the GPU cover the sphere they claim to, which is a separate failure and was a real one:
// sp3-2-00001's hexagonal face renders as a hole unless the hemisphere case is handled.

/** Sum the flat areas of the triangles a face push emitted. Chord triangles undercount the curved area
 *  they approximate — 0.2% on a 90°-wide octahedron face at SPHERE_SUBDIV = 22 — so the bounds below are
 *  a half-percent wide. The failure they exist to catch misses by a factor of two. */
function meshArea(positions: number[]): number {
	let total = 0;
	for (let i = 0; i < positions.length; i += 9) {
		const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(i, i + 9);
		const ux = bx - ax, uy = by - ay, uz = bz - az;
		const vx = cx - ax, vy = cy - ay, vz = cz - az;
		total += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
	}
	return total;
}

function faceMesh(rings: V3[][], solidVerts?: V3[]): number[] {
	const positions: number[] = [];
	const normals: number[] = [];
	const colors: number[] = [];
	for (const ring of rings) pushSphericalFace(positions, normals, colors, ring, 1, [1, 1, 1], solidVerts);
	return positions;
}

const FULL_SPHERE = 4 * Math.PI;

describe("spherical face meshing", () => {
	it("covers the whole sphere for an ordinary solid", () => {
		// Octahedron: eight faces, none anywhere near a great circle.
		const V: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
		const rings: V3[][] = [];
		for (const x of [0, 1]) for (const y of [2, 3]) for (const z of [4, 5]) rings.push([V[x], V[y], V[z]]);
		const area = meshArea(faceMesh(rings, V));
		expect(area).toBeGreaterThan(FULL_SPHERE * 0.995);
		expect(area).toBeLessThanOrEqual(FULL_SPHERE);
	});

	it("fills a HEMISPHERE face instead of collapsing it onto its great circle", () => {
		// A regular hexagon of circumradius pi/2 — the shape of sp3-2-00001's base. Fanned from ring[0]
		// every sub-triangle is degenerate (three origin-coplanar vertices blend back onto their own great
		// circle), which is the hole. The tile is the half the other vertices are NOT in.
		const hex: V3[] = Array.from({ length: 6 }, (_, i) => {
			const t = (i * Math.PI) / 3;
			return [Math.cos(t), 0, Math.sin(t)] as V3;
		});
		const above: V3 = [0, 1, 0];
		const below: V3 = [0, -1, 0];

		for (const [others, sign] of [[[...hex, above], -1], [[...hex, below], +1]] as [V3[], number][]) {
			const positions = faceMesh([hex], others);
			expect(meshArea(positions)).toBeGreaterThan(FULL_SPHERE * 0.4975);
			expect(meshArea(positions)).toBeLessThanOrEqual(FULL_SPHERE * 0.5);
			// and on the correct side: the face lies away from the foreign vertex, never across it
			for (let i = 1; i < positions.length; i += 3) expect(sign * positions[i]).toBeGreaterThanOrEqual(-1e-9);
		}
	});

	it("meshes the shipped triangular cupola as a closed sphere", () => {
		const f = "public/spherical-poly/sp3-k2.json";
		if (!existsSync(f)) return;
		const rec = (JSON.parse(readFileSync(f, "utf8")) as SphPolyPattern[]).find((r) => r.id === "sp3-2-00001");
		expect(rec, "sp3-2-00001 is the corpus' one great-circle face").toBeDefined();
		expect(rec!.stats.greatCircleFaces).toBe(1);
		const rings = rec!.faces.map((ring) => ring.map((i) => rec!.vertices[i]));
		const area = meshArea(faceMesh(rings, rec!.vertices));
		expect(area).toBeGreaterThan(FULL_SPHERE * 0.995); // 2*PI — half the solid — before the fix
		expect(area).toBeLessThanOrEqual(FULL_SPHERE);
	});
});
