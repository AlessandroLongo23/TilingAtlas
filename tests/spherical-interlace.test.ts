import { describe, it, expect } from "vitest";
import { PLATONIC_SOLIDS, type Polyhedron, type Vec3 } from "@/lib/render/platonicSolids";
import { archimedeanById } from "@/lib/render/archimedeanSolids";
import { sphericalIslamicRaySegments } from "@/lib/render/sphericalIslamic";
import { buildSphericalInterlace } from "@/lib/render/sphericalInterlace";

function bySolid(id: string): Polyhedron {
	const p = PLATONIC_SOLIDS.find((s) => s.id === id) ?? archimedeanById(id);
	if (!p) throw new Error(`missing solid ${id}`);
	return p;
}

const key = (p: Vec3): string => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)},${Math.round(p[2] * 1e6)}`;
function edgeCount(poly: Polyhedron): number {
	let s = 0;
	for (const f of poly.faces) s += f.length;
	return s / 2; // handshake: Σ face degrees = 2E
}

const SOLIDS = ["cube", "icosahedron", "dodecahedron", "cuboctahedron", "rhombicuboctahedron"];

describe("buildSphericalInterlace — cross-face weave crossings at every polyhedron edge", () => {
	// The whole weave lives at the shared edge-midpoints: two rays from each adjacent face root there, so a
	// correct GLOBAL map must dedupe them into one degree-4 vertex. There is exactly one midpoint per
	// polyhedron edge, and tips are degree ≤ 2, so #(degree-4 vertices) must equal the edge count. A per-face
	// map would see degree 2 at every midpoint and weave nothing — this is the guard against that regression.
	for (const id of SOLIDS) {
		it(`${id}: #(degree-4 vertices) === edge count`, () => {
			const poly = bySolid(id);
			const rays = sphericalIslamicRaySegments(poly, { angleRad: (40 * Math.PI) / 180 });
			const deg = new Map<string, number>();
			for (const [a, b] of rays) {
				deg.set(key(a), (deg.get(key(a)) ?? 0) + 1);
				deg.set(key(b), (deg.get(key(b)) ?? 0) + 1);
			}
			const deg4 = [...deg.values()].filter((d) => d === 4).length;
			expect(deg4).toBe(edgeCount(poly));
		});
	}
});

describe("buildSphericalInterlace — one band per ray, corners on the sphere", () => {
	for (const id of SOLIDS) {
		it(`${id}: bands === rays, every strap corner is unit length`, () => {
			const poly = bySolid(id);
			const opts = { angleRad: (40 * Math.PI) / 180, width: 0.06 };
			const rays = sphericalIslamicRaySegments(poly, opts);
			const { bands } = buildSphericalInterlace(poly, opts);
			expect(bands.length).toBe(rays.length);
			for (const band of bands) {
				expect(band.fillCorners.length).toBe(4);
				for (const c of band.fillCorners) expect(Math.hypot(c[0], c[1], c[2])).toBeCloseTo(1, 4);
				for (const seg of band.outline) {
					expect(Math.hypot(seg.a[0], seg.a[1], seg.a[2])).toBeCloseTo(1, 4);
					expect(Math.hypot(seg.b[0], seg.b[1], seg.b[2])).toBeCloseTo(1, 4);
				}
			}
		});
	}
});

describe("buildSphericalInterlace — the weave is consistent (bipartite, not degenerate)", () => {
	// Even degree at every real crossing ⇒ the alternating over/under assignment never conflicts. If any solid
	// came back degenerate at a generic angle, the weave would silently fall back to flat straps.
	for (const id of SOLIDS) {
		it(`${id}: assignment is non-degenerate at 40°`, () => {
			const poly = bySolid(id);
			const { degenerate } = buildSphericalInterlace(poly, { angleRad: (40 * Math.PI) / 180, width: 0.06 });
			expect(degenerate).toBe(false);
		});
	}
});
