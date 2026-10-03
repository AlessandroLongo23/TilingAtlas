// The noble shelf regenerates every solid from a point group, a seed and one face, so nothing about a
// record is asserted by its data: it has to be measured off what the runtime builds. These are the
// measurements. scripts/build-noble-shelf.ts makes the stronger check, against Connor Hill's own models,
// but it needs his repository; everything here runs from this one.

import { describe, it, expect } from "vitest";
import { NOBLE_ORBITS, NOBLE_SOLIDS } from "@/lib/render/nobleData";
import {
	NOBLE_FAMILY_DEFAULTS,
	NOBLE_IDS,
	nobleFaceShape,
	nobleFamilySolid,
	nobleGroup,
	nobleSolid,
	stephanoidChoices,
} from "@/lib/render/nobleSolids";
import { isConvexRing, planarFillRings, maxWinding } from "@/lib/render/planarFill";
import { starFaceRings } from "@/lib/render/sphStar";
import { faceKindCount, flatSolidTriangles, partialFill, vertexConfigs } from "@/lib/render/sphericalGeometry";
import type { Polyhedron, Vec3 } from "@/lib/render/platonicSolids";

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

/** Total area of a set of convex rings. */
function area(rings: number[][], verts: Vec3[]): number {
	let s = 0;
	for (const r of rings) for (let k = 1; k + 1 < r.length; k++) s += len(cross(sub(verts[r[k]], verts[r[0]]), sub(verts[r[k + 1]], verts[r[0]]))) / 2;
	return s;
}

/** What makes it a polyhedron in Hill's sense, measured: returns V, E, F after asserting the rest. */
function census(p: Polyhedron) {
	const edges = new Map<string, number>();
	for (const f of p.faces) {
		expect(new Set(f).size, `${p.id}: a face revisits a vertex`).toBe(f.length);
		f.forEach((a, k) => {
			const b = f[(k + 1) % f.length];
			const key = a < b ? `${a},${b}` : `${b},${a}`;
			edges.set(key, (edges.get(key) ?? 0) + 1);
		});
		// Planar: every vertex in the plane of the first three.
		const n = cross(sub(p.vertices[f[1]], p.vertices[f[0]]), sub(p.vertices[f[2]], p.vertices[f[1]]));
		for (const i of f) {
			const d = sub(p.vertices[i], p.vertices[f[0]]);
			expect(Math.abs(d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) / len(n), `${p.id}: face not planar`).toBeLessThan(1e-12);
		}
	}
	expect([...edges.values()].every((c) => c === 2), `${p.id}: an edge is not in exactly two faces`).toBe(true);
	expect(new Set(p.faces.map((f) => f.length)).size, `${p.id}: face sizes differ`).toBe(1);
	const degree = new Map<number, number>();
	for (const f of p.faces) for (const v of f) degree.set(v, (degree.get(v) ?? 0) + 1);
	expect(new Set(degree.values()).size, `${p.id}: vertex degrees differ`).toBe(1);
	return { V: p.vertices.length, E: edges.size, F: p.faces.length };
}

describe("noble polyhedra: the listed ones", () => {
	it("the five point groups have the orders they should", () => {
		expect((["Td", "O", "Oh", "I", "Ih"] as const).map((g) => nobleGroup(g).length)).toEqual([24, 24, 48, 60, 120]);
	});

	it("every orbit parameter is a root of the minimal polynomial beside it", () => {
		const value = (poly: string, x: number) =>
			// "5a^10 - 4*a^6 + 2a - 1" as arithmetic: an implicit product gets its sign, ^ becomes **.
			new Function("a", "b", `return ${poly.replace(/(\d)\*?([ab])/g, "$1*$2").replace(/\^/g, "**")};`)(x, x) as number;
		for (const [orbit, [a, pa, b, pb]] of Object.entries(NOBLE_ORBITS)) {
			// Relative to the polynomial's own scale at the root: its coefficients run to the thousands.
			const tol = (x: number) => 1e-9 * Math.max(1, Math.abs(x)) ** 12 * 5000;
			expect(Math.abs(value(pa, a)), `${orbit}: a`).toBeLessThan(tol(a));
			if (pb) expect(Math.abs(value(pb, b!)), `${orbit}: b`).toBeLessThan(tol(b!));
		}
	});

	it("there are 146, plus the two fissary figures Hill sets apart", () => {
		expect(NOBLE_SOLIDS.filter((r) => !r[0].endsWith("-F"))).toHaveLength(146);
		expect(NOBLE_SOLIDS.filter((r) => r[0].endsWith("-F")).map((r) => r[0])).toEqual(["tI-F", "rD-F"]);
		expect(new Set(NOBLE_IDS).size).toBe(148);
	});

	it("each is a polyhedron on one sphere, with one kind of face and one kind of vertex", () => {
		for (const id of NOBLE_IDS) {
			const p = nobleSolid(id)!;
			census(p);
			for (const v of p.vertices) expect(len(v)).toBeCloseTo(1, 12);
			// Vertex-transitive and face-transitive hold by construction: both are one orbit of the group.
		}
	});

	it("the counts by orbit type are the ones the classification states", () => {
		// Hill, Section 5.2. The fissary pair is left out of his 146 and out of these.
		const byType = new Map<string, number>();
		for (const [symbol] of NOBLE_SOLIDS) {
			if (symbol.endsWith("-F")) continue;
			const type = symbol.split("-")[0];
			byType.set(type, (byType.get(type) ?? 0) + 1);
		}
		expect(Object.fromEntries(byType)).toEqual({ T: 1, O: 1, C: 1, I: 4, ID: 6, D: 7, tO: 1, tC: 1, rC: 1, tI: 17, tD: 6, rD: 19, sC: 7, gC: 3, sD: 33, gD: 38 });
	});

	it("four rows of the paper's Appendix A disagree with the solids, and these are the solids", () => {
		// arXiv:2607.28711v1 prints D-2 as {9,3}, D-7 as {5,3}, rD-5.2 with 180 edges and 60 faces, and
		// tI-5.6 as {5,5} with 150 edges. Each contradicts its own dual row; these are what is built.
		const read = (s: string) => {
			const p = nobleSolid(`noble-${s}`)!;
			return [...p.schlafli, ...Object.values(census(p))];
		};
		expect(read("d-2")).toEqual([3, 9, 20, 90, 60]);
		expect(read("d-7")).toEqual([3, 9, 20, 90, 60]);
		expect(read("rd-5-2")).toEqual([8, 4, 60, 120, 30]);
		expect(read("ti-5-6")).toEqual([6, 6, 60, 180, 60]);
	});
});

describe("noble polyhedra: the two infinite families", () => {
	it("a disphenoid is four congruent triangles for any box", () => {
		for (const [boxB, boxC] of [[1, 1], [1.4, 0.7], [0.3, 2.5]]) {
			const p = nobleFamilySolid("noble-disphenoid", { ...NOBLE_FAMILY_DEFAULTS, boxB, boxC })!;
			expect(census(p)).toEqual({ V: 4, E: 6, F: 4 });
			const sides = p.faces.map((f) => f.map((a, k) => len(sub(p.vertices[a], p.vertices[f[(k + 1) % 3]])).toFixed(9)).sort().join());
			expect(new Set(sides).size).toBe(1);
		}
	});

	it("every stephanoid up to n = 14 is a torus of 2n crossed quadrilaterals, at any height", () => {
		let seen = 0;
		for (const anti of [false, true]) {
			const id = anti ? "noble-stephanoid-antiprismatic" : "noble-stephanoid-prismatic";
			for (let n = 4; n <= 14; n++) {
				stephanoidChoices(anti, n).forEach((_, member) => {
					for (const height of [0.4, 1, 2.2]) {
						const p = nobleFamilySolid(id, { ...NOBLE_FAMILY_DEFAULTS, n, member, height })!;
						expect(census(p), p.name).toEqual({ V: 2 * n, E: 4 * n, F: 2 * n });
						// Crossed, not convex: two of its four sides meet away from a vertex.
						expect(planarFillRings(p.faces[0], [...p.vertices]).length, p.name).toBeGreaterThan(1);
					}
					seen++;
				});
			}
		}
		// The smallest of each, by Hill's Definitions 4.1 and 4.2.
		expect(stephanoidChoices(false, 5)).toEqual([[3, 1]]);
		expect(stephanoidChoices(true, 4)).toEqual([[2, 1]]);
		expect(stephanoidChoices(false, 4)).toEqual([]);
		expect(seen).toBeGreaterThan(40);
	});
});

describe("the fill of an irregular face", () => {
	const flat = (pts: [number, number][]): Vec3[] => pts.map(([x, y]) => [x, y, 0]);

	it("a concave simple polygon fills to its shoelace area", () => {
		const verts = flat([[0, 0], [4, 0], [4, 3], [2, 1], [0, 3]]);
		const rings = planarFillRings([0, 1, 2, 3, 4], verts);
		expect(area(rings, verts)).toBeCloseTo(8, 12);
	});

	it("a crossed quadrilateral fills both lobes, though its signed area is zero", () => {
		const verts = flat([[-1, -1], [1, 1], [1, -1], [-1, 1]]);
		for (const mod2 of [false, true]) {
			const v = [...verts];
			expect(area(planarFillRings([0, 1, 2, 3], v, mod2), v)).toBeCloseTo(2, 12);
		}
		expect(maxWinding([0, 1, 2, 3], verts)).toBe(1);
	});

	it("agrees with the closed-form star fill on a regular {n/d}, under both rules", () => {
		for (const [n, d] of [[5, 2], [7, 2], [7, 3], [9, 4]]) {
			const ring = Array.from({ length: n }, (_, k) => k);
			const star = (): Vec3[] => ring.map((k) => [Math.cos((2 * Math.PI * d * k) / n), Math.sin((2 * Math.PI * d * k) / n), 0]);
			for (const mod2 of [false, true]) {
				const a = star();
				const b = star();
				expect(area(planarFillRings(ring, a, mod2), a), `{${n}/${d}} mod2=${mod2}`).toBeCloseTo(area(starFaceRings(ring, d, b, mod2), b), 9);
			}
			expect(maxWinding(ring, star())).toBe(d);
		}
	});

	it("the renderer's fill of a noble face is the measured one, on every solid", () => {
		// Through the DISPATCH the canvas uses (flatSolidTriangles), against planarFillRings called
		// directly. The equal-area test below cannot see a face filled wrongly, because a wrong fill is
		// wrong on every face alike: a star-like face mistaken for convex passed it for exactly that reason.
		for (const id of NOBLE_IDS) {
			const p = nobleSolid(id)!;
			const verts = [...p.vertices];
			const direct = area(planarFillRings(p.faces[0], verts), verts) * p.faces.length;
			const { positions } = flatSolidTriangles(p);
			let drawn = 0;
			for (let t = 0; t < positions.length; t += 9) {
				const v = (k: number): Vec3 => [positions[t + 3 * k], positions[t + 3 * k + 1], positions[t + 3 * k + 2]];
				drawn += len(cross(sub(v(1), v(0)), sub(v(2), v(0)))) / 2;
			}
			expect(Math.abs(drawn - direct) / direct, id).toBeLessThan(1e-4);
		}
	});

	it("a ring that goes round twice is not convex, however consistently it turns", () => {
		const star: Vec3[] = [0, 1, 2, 3, 4].map((k) => [Math.cos((4 * Math.PI * k) / 5), Math.sin((4 * Math.PI * k) / 5), 0]);
		expect(isConvexRing(star, [0, 1, 2, 3, 4])).toBe(false);
		const pentagon: Vec3[] = [0, 1, 2, 3, 4].map((k) => [Math.cos((2 * Math.PI * k) / 5), Math.sin((2 * Math.PI * k) / 5), 0]);
		expect(isConvexRing(pentagon, [0, 1, 2, 3, 4])).toBe(true);
		const propeller = nobleSolid("noble-d-3")!;
		expect(isConvexRing(propeller.vertices, propeller.faces[0])).toBe(false);
	});

	it("fills every face of a noble solid to the same area, since they are one orbit", () => {
		for (const id of NOBLE_IDS) {
			const p = nobleSolid(id)!;
			const { positions, triFace } = flatSolidTriangles(p);
			const per = new Array<number>(p.faces.length).fill(0);
			triFace.forEach((f, t) => {
				const v = (k: number): Vec3 => [positions[9 * t + 3 * k], positions[9 * t + 3 * k + 1], positions[9 * t + 3 * k + 2]];
				per[f] += len(cross(sub(v(1), v(0)), sub(v(2), v(0)))) / 2;
			});
			expect(Math.min(...per), id).toBeGreaterThan(1e-6);
			// Float32 positions, so equal to single precision and no better.
			expect((Math.max(...per) - Math.min(...per)) / Math.max(...per), id).toBeLessThan(1e-4);
		}
	});
});

describe("reading a noble polyhedron: one vertex, one face, and the face laid flat", () => {
	it("a noble polyhedron has one vertex configuration and one face shape, so one of each stands for all", () => {
		for (const id of NOBLE_IDS) {
			const p = nobleSolid(id)!;
			// The fissary pair are two rings of faces on one point; still one configuration.
			expect(vertexConfigs(p.vertices, p.faces), id).toHaveLength(1);
			expect(faceKindCount(p.vertices, p.faces), id).toBe(1);
			const round = partialFill(p.vertices, p.faces, "vertex")!;
			expect(round, id).toHaveLength(p.schlafli[1]);
			expect(round.every((i) => p.faces[i].includes(0)), id).toBe(true);
			expect(partialFill(p.vertices, p.faces, "face"), id).toEqual([0]);
			expect(partialFill(p.vertices, p.faces, "all"), id).toBeNull();
		}
	});

	it("names the face for what it is", () => {
		const kind = (id: string) => nobleFaceShape(nobleSolid(id)!)!.kind;
		expect(kind("noble-c-1")).toBe("regular quadrilateral");
		expect(kind("noble-i-2")).toBe("regular star pentagon"); // the small stellated dodecahedron's pentagram
		expect(kind("noble-i-3")).toBe("regular pentagon"); // the great dodecahedron
		expect(kind("noble-rc-1-1")).toBe("self-intersecting pentagon"); // Webb's 2008 solid's dual pair
		expect(kind("noble-stephanoid-prismatic")).toBe("self-intersecting quadrilateral");
		expect(kind("noble-disphenoid")).toBe("triangle");
	});

	it("draws a face with as many corners as its type says, and the census closes", () => {
		for (const id of NOBLE_IDS) {
			const p = nobleSolid(id)!;
			const shape = nobleFaceShape(p)!;
			expect(shape.points, id).toHaveLength(p.schlafli[0]);
			// p F = q V = 2 E, for any polyhedron of type {p,q}.
			expect(p.schlafli[0] * shape.F, id).toBe(2 * shape.E);
			expect(p.schlafli[1] * shape.V, id).toBe(2 * shape.E);
		}
	});
});
