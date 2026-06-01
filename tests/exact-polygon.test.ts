import { describe, it, expect } from "vitest";
import { RegularPolygon } from "@/classes/polygons/RegularPolygon";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";
import { Vector } from "@/classes/Vector";

const ring = CyclotomicRing.create(24);
const ZERO = Cyclotomic.ZERO(ring);

/** Compare two vertex lists (same order) within tolerance. */
function verticesClose(a: Vector[], b: Vector[], eps = 1e-9): boolean {
	if (a.length !== b.length) return false;
	return a.every((v, i) => Math.abs(v.x - b[i].x) < eps && Math.abs(v.y - b[i].y) < eps);
}

describe("Exact RegularPolygon (boundary walk) parity", () => {
	const coreNs = [3, 4, 6, 8, 12]; // the {3,4,6,8,12} gate set, all divide N=24

	it("exact construction matches float construction from origin, dir (1,0)", () => {
		for (const n of coreNs) {
			const float = RegularPolygon.fromAnchorAndDir(n, new Vector(0, 0), new Vector(1, 0));
			const exact = RegularPolygon.fromAnchorAndDirExact(n, ZERO, 0);
			expect(exact.exactVertices?.length).toBe(n);
			expect(verticesClose(exact.vertices, float.vertices)).toBe(true);
			// centroid (vertex mean) matches float centroid for regular polygons
			expect(Math.abs(exact.centroid.x - float.centroid.x)).toBeLessThan(1e-9);
			expect(Math.abs(exact.centroid.y - float.centroid.y)).toBeLessThan(1e-9);
		}
	});

	it("edgeDirs are the exterior-turn progression N/n", () => {
		const sq = RegularPolygon.fromAnchorAndDirExact(4, ZERO, 0);
		expect(sq.edgeDirs).toEqual([0, 6, 12, 18]); // square: +90° = +6 steps each
		const hex = RegularPolygon.fromAnchorAndDirExact(6, ZERO, 0);
		expect(hex.edgeDirs).toEqual([0, 4, 8, 12, 16, 20]); // +60° = +4 steps
	});

	it("rotateZeta matches float rotation about origin", () => {
		const exact = RegularPolygon.fromAnchorAndDirExact(4, ZERO, 0);
		const float = RegularPolygon.fromAnchorAndDir(4, new Vector(0, 0), new Vector(1, 0));
		exact.rotateZeta(ZERO, 2); // +30°
		float.rotate(new Vector(0, 0), (2 * Math.PI * 2) / 24);
		// compare as sets (rotate doesn't reorder, so order matches)
		expect(verticesClose(exact.vertices, float.vertices)).toBe(true);
		// edgeDirs advanced by 2
		expect(exact.edgeDirs).toEqual([2, 8, 14, 20]);
	});

	it("translateExact matches float translation", () => {
		const exact = RegularPolygon.fromAnchorAndDirExact(3, ZERO, 0);
		const t = Cyclotomic.zeta(ring, 4).add(Cyclotomic.zeta(ring, 0)); // some lattice vector
		exact.translateExact(t);
		const tv = t.toVector();
		const float = RegularPolygon.fromAnchorAndDir(3, new Vector(0, 0), new Vector(1, 0));
		float.translate(tv);
		expect(verticesClose(exact.vertices, float.vertices)).toBe(true);
		expect(exact.edgeDirs).toEqual([0, 8, 16]); // unchanged by translation
	});

	it("mirrorZeta reflects exactly and recomputes integer edgeDirs", () => {
		const exact = RegularPolygon.fromAnchorAndDirExact(4, ZERO, 0);
		exact.mirrorZeta(ZERO, 0); // reflect across the real axis (z ↦ conj z)
		// every edge direction must resolve to a valid integer (unit edges preserved)
		expect(exact.edgeDirs?.every((d) => d >= 0)).toBe(true);
		// reflecting twice across the same axis is the identity (vertex set restored)
		const key1 = exact.exactVertices!.map((v) => v.key()).sort().join("|");
		exact.mirrorZeta(ZERO, 0);
		const key2 = exact.exactVertices!.map((v) => v.key()).sort().join("|");
		const original = RegularPolygon.fromAnchorAndDirExact(4, ZERO, 0)
			.exactVertices!.map((v) => v.key()).sort().join("|");
		expect(key2).toBe(original);
		expect(key1).not.toBe(original); // single reflection changed it
	});

	it("clone preserves the exact representation", () => {
		const exact = RegularPolygon.fromAnchorAndDirExact(6, ZERO, 0);
		const cl = exact.clone();
		expect(cl.hasExact()).toBe(true);
		expect(cl.exactVertices!.map((v) => v.key())).toEqual(
			exact.exactVertices!.map((v) => v.key())
		);
		expect(cl.edgeDirs).toEqual(exact.edgeDirs);
	});
});
