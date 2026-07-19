import { describe, it, expect } from "vitest";
import { ARCHIMEDEAN_SOLIDS, vertexConfigOf } from "@/lib/render/archimedeanSolids";
import type { Polyhedron, Vec3 } from "@/lib/render/platonicSolids";

function dist(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function canonConfig(cfg: string): string {
	const ns = cfg.split(".").map(Number);
	const m = ns.length;
	const cand: string[] = [];
	for (let s = 0; s < m; s++) cand.push(ns.map((_, i) => ns[(i + s) % m]).join("."));
	const r = ns.slice().reverse();
	for (let s = 0; s < m; s++) cand.push(r.map((_, i) => r[(i + s) % m]).join("."));
	return cand.sort()[0];
}
function edgesOf(poly: Polyhedron): Set<string> {
	const e = new Set<string>();
	for (const f of poly.faces)
		for (let k = 0; k < f.length; k++) {
			const a = f[k];
			const b = f[(k + 1) % f.length];
			e.add(a < b ? `${a}-${b}` : `${b}-${a}`);
		}
	return e;
}

// Expected invariants for each built solid: V/E/F, the face-size histogram, and the vertex config.
const EXPECTED: Record<string, { V: number; E: number; F: number; faces: Record<number, number>; config: string }> = {
	"truncated-tetrahedron": { V: 12, E: 18, F: 8, faces: { 3: 4, 6: 4 }, config: "3.6.6" },
	cuboctahedron: { V: 12, E: 24, F: 14, faces: { 3: 8, 4: 6 }, config: "3.4.3.4" },
	"truncated-cube": { V: 24, E: 36, F: 14, faces: { 3: 8, 8: 6 }, config: "3.8.8" },
	"truncated-octahedron": { V: 24, E: 36, F: 14, faces: { 4: 6, 6: 8 }, config: "4.6.6" },
	rhombicuboctahedron: { V: 24, E: 48, F: 26, faces: { 3: 8, 4: 18 }, config: "3.4.4.4" },
	"truncated-cuboctahedron": { V: 48, E: 72, F: 26, faces: { 4: 12, 6: 8, 8: 6 }, config: "4.6.8" },
	"snub-cube": { V: 24, E: 60, F: 38, faces: { 3: 32, 4: 6 }, config: "3.3.3.3.4" },
	icosidodecahedron: { V: 30, E: 60, F: 32, faces: { 3: 20, 5: 12 }, config: "3.5.3.5" },
	"truncated-dodecahedron": { V: 60, E: 90, F: 32, faces: { 3: 20, 10: 12 }, config: "3.10.10" },
	"truncated-icosahedron": { V: 60, E: 90, F: 32, faces: { 5: 12, 6: 20 }, config: "5.6.6" },
	rhombicosidodecahedron: { V: 60, E: 120, F: 62, faces: { 3: 20, 4: 30, 5: 12 }, config: "3.4.5.4" },
	"truncated-icosidodecahedron": { V: 120, E: 180, F: 62, faces: { 4: 30, 6: 20, 10: 12 }, config: "4.6.10" },
	"snub-dodecahedron": { V: 60, E: 150, F: 92, faces: { 3: 80, 5: 12 }, config: "3.3.3.3.5" },
};

describe("Archimedean solids — constructed geometry is exact", () => {
	it("all 13 Archimedean solids are present and distinct", () => {
		expect(ARCHIMEDEAN_SOLIDS.length).toBe(13);
		expect(new Set(ARCHIMEDEAN_SOLIDS.map((s) => s.id)).size).toBe(13);
	});

	for (const solid of ARCHIMEDEAN_SOLIDS) {
		const exp = EXPECTED[solid.id];

		it(`${solid.id}: V/E/F = ${exp.V}/${exp.E}/${exp.F} (Euler = 2)`, () => {
			const V = solid.vertices.length;
			const E = edgesOf(solid).size;
			const F = solid.faces.length;
			expect({ V, E, F }).toEqual({ V: exp.V, E: exp.E, F: exp.F });
			expect(V - E + F).toBe(2);
		});

		it(`${solid.id}: face-size histogram ${JSON.stringify(exp.faces)}`, () => {
			const hist: Record<number, number> = {};
			for (const f of solid.faces) hist[f.length] = (hist[f.length] ?? 0) + 1;
			expect(hist).toEqual(exp.faces);
		});

		it(`${solid.id}: every face is a regular polygon (equal edges) and all edges share one length`, () => {
			// global edge length = first edge
			const first = solid.faces[0];
			const L = dist(solid.vertices[first[0]], solid.vertices[first[1]]);
			for (const f of solid.faces) {
				for (let k = 0; k < f.length; k++) {
					const a = solid.vertices[f[k]];
					const b = solid.vertices[f[(k + 1) % f.length]];
					expect(Math.abs(dist(a, b) - L) / L).toBeLessThan(1e-6);
				}
			}
		});

		it(`${solid.id}: vertex configuration is ${exp.config}`, () => {
			expect(canonConfig(solid.vertexConfig)).toBe(canonConfig(exp.config));
			// and the geometry actually realises it (config read off the built faces)
			expect(canonConfig(vertexConfigOf(solid.vertices, solid.faces))).toBe(canonConfig(exp.config));
		});
	}
});
