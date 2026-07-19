// Cross-check the k=2 spherical developer output.
//
// The Čtrnáct spherical search emits 132 combinatorial k=2 (2-orbit) blocks. Only vertex figures
// that close at a COMMON edge length can form an equal-edge spherical tiling; two genuinely different
// configs close at different edge lengths, so of the 132 only the 2 blocks whose orbits share a face-
// angle multiset realize. They are the two "gyro-twin" Johnson solids of the Archimedean cupola
// solids, distinguished from their uniform look-alikes by being 2-orbit:
//   J27 — triangular orthobicupola   (twin of the cuboctahedron):      6×3.4.3.4 + 6×3.3.4.4
//   J37 — elongated square gyrobicupola = pseudo-rhombicuboctahedron
//         (twin of the rhombicuboctahedron):                           24×3.4.4.4, two orbits
// The J27 identity hinges on the presence of adjacent-square 3.3.4.4 vertices (a cuboctahedron has
// none), so the test computes true cyclic vertex configs, not just multisets.
//
// Fixture: tests/fixtures/spherical-cells-k2.json — regenerate with
//   cd tools/ctrnact-oracle && make PALETTE=spherical MAXNUM=2 && (cd run-k2-spherical && ../eu_solver.spherical >/dev/null) \
//     && EU_OUT=run-k2-spherical/out EU_KMIN=1 EU_KMAX=2 ../eu_pruner.spherical && \
//     python3 ../develop_spherical.py --pruned run-k2-spherical/out/pruned --kmin 2 --kmax 2 --out run-k2-spherical/ctrnact-cells-k2.json
//   cp run-k2-spherical/ctrnact-cells-k2.json ../../tests/fixtures/spherical-cells-k2.json

import { describe, it, expect } from "vitest";
import cells from "./fixtures/spherical-cells-k2.json";

type Vec3 = [number, number, number];
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
			const a = ring[i], b = ring[(i + 1) % ring.length];
			E.add(a < b ? `${a}-${b}` : `${b}-${a}`);
		}
	}
	return E;
}

function dist(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// canonical form of a cyclic sequence up to rotation + reflection
function canonCycle(seq: number[]): string {
	const n = seq.length;
	const cands: string[] = [];
	const rev = [...seq].reverse();
	for (let i = 0; i < n; i++) {
		cands.push([...seq.slice(i), ...seq.slice(0, i)].join("."));
		cands.push([...rev.slice(i), ...rev.slice(0, i)].join("."));
	}
	return cands.sort()[0];
}

// cyclic vertex config (ordered face sizes around each vertex) tallied over all vertices
function cyclicConfigHistogram(r: DevCell): Record<string, number> {
	const V = r.vertices.length;
	const inc: { size: number; c: Vec3 }[][] = Array.from({ length: V }, () => []);
	for (const face of r.faces) {
		const c: Vec3 = [0, 0, 0];
		for (const k of face) {
			c[0] += r.vertices[k][0]; c[1] += r.vertices[k][1]; c[2] += r.vertices[k][2];
		}
		c[0] /= face.length; c[1] /= face.length; c[2] /= face.length;
		for (const v of face) inc[v].push({ size: face.length, c });
	}
	const hist: Record<string, number> = {};
	for (let i = 0; i < V; i++) {
		const p = r.vertices[i];
		const nlen = Math.hypot(p[0], p[1], p[2]);
		const n: Vec3 = [p[0] / nlen, p[1] / nlen, p[2] / nlen];
		let a: Vec3 = Math.abs(n[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
		let e1: Vec3 = [a[0] - (a[0] * n[0] + a[1] * n[1] + a[2] * n[2]) * n[0],
			a[1] - (a[0] * n[0] + a[1] * n[1] + a[2] * n[2]) * n[1],
			a[2] - (a[0] * n[0] + a[1] * n[1] + a[2] * n[2]) * n[2]];
		const e1n = Math.hypot(...e1) as number; e1 = [e1[0] / e1n, e1[1] / e1n, e1[2] / e1n];
		const e2: Vec3 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
		const ordered = inc[i]
			.map(({ size, c }) => {
				const dproj = c[0] * n[0] + c[1] * n[1] + c[2] * n[2];
				const d: Vec3 = [c[0] - dproj * n[0], c[1] - dproj * n[1], c[2] - dproj * n[2]];
				return { size, ang: Math.atan2(d[0] * e2[0] + d[1] * e2[1] + d[2] * e2[2], d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2]) };
			})
			.sort((x, y) => x.ang - y.ang)
			.map((o) => o.size);
		const key = canonCycle(ordered);
		hist[key] = (hist[key] ?? 0) + 1;
	}
	return hist;
}

function assertRegular(r: DevCell) {
	const E = [...edgeSet(r.faces)].map((k) => {
		const [a, b] = k.split("-").map(Number);
		return dist(r.vertices[a], r.vertices[b]);
	});
	const mean = E.reduce((s, x) => s + x, 0) / E.length;
	expect(Math.max(...E.map((e) => Math.abs(e - mean))) / mean, `${r.id} edge CV`).toBeLessThan(TOL);
	for (const v of r.vertices) {
		expect(Math.abs(Math.hypot(v[0], v[1], v[2]) - 1), `${r.id} on S²`).toBeLessThan(TOL);
	}
}

describe("spherical k=2 developer output", () => {
	const records = cells as DevCell[];

	it("realizes exactly 2 of the 132 k=2 blocks (both gyro-twin Johnson solids)", () => {
		expect(records.length).toBe(2);
	});

	it("both are metrically regular equal-edge tilings on S²", () => {
		for (const r of records) assertRegular(r);
	});

	it("one is the triangular orthobicupola J27: V12 E24 F14, 6×3.4.3.4 + 6×3.3.4.4 (genuine 2-orbit, not the cuboctahedron)", () => {
		const j27 = records.find((r) => r.vertices.length === 12);
		expect(j27, "no V=12 solid").toBeDefined();
		expect(edgeSet(j27!.faces).size).toBe(24);
		expect(j27!.faces.length).toBe(14);
		expect(j27!.faces.map((f) => f.length).sort()).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4]);
		const hist = cyclicConfigHistogram(j27!);
		expect(hist).toEqual({ "3.3.4.4": 6, "3.4.3.4": 6 });
	});

	it("one is the pseudo-rhombicuboctahedron J37: V24 E48 F26, 24×3.4.4.4 (two orbits)", () => {
		const j37 = records.find((r) => r.vertices.length === 24);
		expect(j37, "no V=24 solid").toBeDefined();
		expect(edgeSet(j37!.faces).size).toBe(48);
		expect(j37!.faces.length).toBe(26);
		const fm = j37!.faces.map((f) => f.length).sort((a, b) => a - b);
		expect(fm.filter((x) => x === 3).length).toBe(8);
		expect(fm.filter((x) => x === 4).length).toBe(18);
		const hist = cyclicConfigHistogram(j37!);
		expect(hist).toEqual({ "3.4.4.4": 24 });
	});
});
