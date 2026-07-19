// Cross-check the k=1 spherical developer output against the atlas's hand-authored solids.
//
// The Čtrnáct spherical (positive-defect) search emits 28 combinatorial k=1 blocks; the developer
// (tools/ctrnact-oracle/develop_spherical.py) embeds each on S² by geodesic flood-fill. This test
// proves the developed polyhedra ARE exactly the known uniform solids: the 5 Platonic + 13
// Archimedean the atlas draws by hand (matched against PLATONIC_SOLIDS / ARCHIMEDEAN_SOLIDS), plus
// the prism/antiprism slice the fixed {3,4,5,6,8,10} palette produces (checked by closed form, since
// the atlas has none). Match is by metric + combinatorial invariants (V, E, F, face-size multiset,
// edges-equal, faces-regular) — never exact coordinates, since developed frames differ from the
// authored ones.
//
// Fixture: tests/fixtures/spherical-cells-k1.json — regenerate with
//   cd tools/ctrnact-oracle && PALETTE=spherical ./run-oracle.sh 1
//   cp run-k1-spherical/ctrnact-cells-k1.json ../../tests/fixtures/spherical-cells-k1.json

import { describe, it, expect } from "vitest";
import { PLATONIC_SOLIDS, type Polyhedron, type Vec3 } from "@/lib/render/platonicSolids";
import { ARCHIMEDEAN_SOLIDS } from "@/lib/render/archimedeanSolids";
import cells from "./fixtures/spherical-cells-k1.json";

interface DevCell {
	id: string;
	vertexConfig: string;
	vertices: Vec3[];
	faces: number[][];
}

const TOL = 1e-4;

function edgeSet(faces: number[][]): Set<string> {
	const E = new Set<string>();
	for (const ring of faces) {
		for (let i = 0; i < ring.length; i++) {
			const a = ring[i];
			const b = ring[(i + 1) % ring.length];
			E.add(a < b ? `${a}-${b}` : `${b}-${a}`);
		}
	}
	return E;
}

function faceMultiset(faces: number[][]): string {
	return faces.map((f) => f.length).sort((x, y) => x - y).join(",");
}

// (V, E, F, face-size multiset) — a complete invariant key across these 28 uniform solids.
function invariantKey(V: number, E: number, F: number, fm: string): string {
	return `${V}|${E}|${F}|${fm}`;
}

function keyOfPolyhedron(p: Polyhedron): string {
	return invariantKey(p.vertices.length, edgeSet(p.faces).size, p.faces.length, faceMultiset(p.faces));
}

// Closed-form invariants for the prism/antiprism slice the palette emits (the atlas has none).
function prismKey(n: number): string {
	// V=2n, faces = 2 n-gons + n squares, E=3n
	const fm = [
		...Array(n).fill(4),
		n,
		n,
	].sort((x, y) => x - y).join(",");
	return invariantKey(2 * n, 3 * n, n + 2, fm);
}
function antiprismKey(n: number): string {
	// V=2n, faces = 2 n-gons + 2n triangles, E=4n
	const fm = [
		...Array(2 * n).fill(3),
		n,
		n,
	].sort((x, y) => x - y).join(",");
	return invariantKey(2 * n, 4 * n, 2 * n + 2, fm);
}

// Build the target index: authored Platonic + Archimedean, plus the emittable prism/antiprism slice.
function buildTargets(): Map<string, string> {
	const m = new Map<string, string>();
	for (const p of [...PLATONIC_SOLIDS, ...ARCHIMEDEAN_SOLIDS]) m.set(keyOfPolyhedron(p), p.id);
	for (const n of [3, 5, 6, 8, 10]) m.set(prismKey(n), `prism-${n}`);
	for (const n of [4, 5, 6, 8, 10]) m.set(antiprismKey(n), `antiprism-${n}`);
	return m;
}

function dist(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// Max deviation of a face's vertices from their best-fit plane (via the mean point + Newell normal).
function planarity(pts: Vec3[]): number {
	const c: Vec3 = [0, 0, 0];
	for (const p of pts) {
		c[0] += p[0]; c[1] += p[1]; c[2] += p[2];
	}
	c[0] /= pts.length; c[1] /= pts.length; c[2] /= pts.length;
	// Newell's method for a robust polygon normal
	const n: Vec3 = [0, 0, 0];
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i];
		const q = pts[(i + 1) % pts.length];
		n[0] += (p[1] - q[1]) * (p[2] + q[2]);
		n[1] += (p[2] - q[2]) * (p[0] + q[0]);
		n[2] += (p[0] - q[0]) * (p[1] + q[1]);
	}
	const len = Math.hypot(n[0], n[1], n[2]) || 1;
	n[0] /= len; n[1] /= len; n[2] /= len;
	let worst = 0;
	for (const p of pts) {
		worst = Math.max(worst, Math.abs((p[0] - c[0]) * n[0] + (p[1] - c[1]) * n[1] + (p[2] - c[2]) * n[2]));
	}
	return worst;
}

describe("spherical k=1 developer output", () => {
	const records = cells as DevCell[];
	const targets = buildTargets();

	it("has 28 developed records", () => {
		expect(records.length).toBe(28);
	});

	it("the target index has 28 distinct invariant keys (18 authored + 10 prism/antiprism)", () => {
		expect(targets.size).toBe(28);
	});

	it("every vertex is a unit vector on S²", () => {
		for (const r of records) {
			for (const v of r.vertices) {
				expect(Math.abs(Math.hypot(v[0], v[1], v[2]) - 1)).toBeLessThan(TOL);
			}
		}
	});

	it("every developed solid is metrically regular (all edges equal, all faces planar and equilateral)", () => {
		for (const r of records) {
			const E = [...edgeSet(r.faces)].map((k) => {
				const [a, b] = k.split("-").map(Number);
				return dist(r.vertices[a], r.vertices[b]);
			});
			const mean = E.reduce((s, x) => s + x, 0) / E.length;
			const cv = Math.max(...E.map((e) => Math.abs(e - mean))) / mean;
			expect(cv, `${r.id} edge-length CV`).toBeLessThan(TOL);
			for (const ring of r.faces) {
				const pts = ring.map((i) => r.vertices[i]);
				expect(planarity(pts), `${r.id} face planarity`).toBeLessThan(TOL);
				const fe = ring.map((_, i) => dist(pts[i], pts[(i + 1) % pts.length]));
				const fm = fe.reduce((s, x) => s + x, 0) / fe.length;
				expect(Math.max(...fe.map((e) => Math.abs(e - fm))) / fm, `${r.id} face edge CV`).toBeLessThan(TOL);
			}
		}
	});

	it("each developed solid matches exactly one known solid; all 28 targets are hit (bijection)", () => {
		const hit = new Map<string, string[]>();
		for (const r of records) {
			const key = invariantKey(r.vertices.length, edgeSet(r.faces).size, r.faces.length, faceMultiset(r.faces));
			const name = targets.get(key);
			expect(name, `developed ${r.id} (config ${r.vertexConfig}) has no known-solid match`).toBeDefined();
			const arr = hit.get(name!) ?? [];
			arr.push(r.id);
			hit.set(name!, arr);
		}
		// bijection: 28 distinct targets, none matched twice
		expect(hit.size).toBe(28);
		for (const [name, ids] of hit) {
			expect(ids.length, `known solid ${name} matched by ${ids.length} developed records`).toBe(1);
		}
	});
});
