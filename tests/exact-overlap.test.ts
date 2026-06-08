import { describe, it, expect } from "vitest";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";
import { RegularPolygon } from "@/classes/polygons/RegularPolygon";
import { ExactStarPolygon } from "@/classes/polygons/ExactStarPolygon";
import {
	exactPolygonsOverlap,
	pointInPolygon,
	segmentsProperlyCross,
	collinearSameSideOverlap,
	orient2D,
} from "@/classes/algorithm/exact/exactOverlap";

const ring = CyclotomicRing.create(24);
const ZERO = Cyclotomic.ZERO(ring);
const I = Cyclotomic.zeta(ring, 6); // i = (0,1)

/** Exact lattice point (x,y) with integer coordinates. */
function pt(x: number, y: number): Cyclotomic {
	return Cyclotomic.fromRational(ring, BigInt(x), 1n).add(I.scaleRational(BigInt(y), 1n));
}
/** Unit square (CCW) with lower-left corner at (x,y). */
function square(x: number, y: number): RegularPolygon {
	return RegularPolygon.fromAnchorAndDirExact(4, pt(x, y), 0);
}

describe("exact orient2D / pointInPolygon", () => {
	const sq = square(0, 0).exactVertices!; // (0,0),(1,0),(1,1),(0,1)
	it("orient2D signs", () => {
		expect(orient2D(pt(0, 0), pt(1, 0), pt(0, 1))).toBe(1); // left turn
		expect(orient2D(pt(0, 0), pt(1, 0), pt(0, -1))).toBe(-1); // right turn
		expect(orient2D(pt(0, 0), pt(1, 0), pt(2, 0))).toBe(0); // collinear
	});
	it("strict point-in-polygon: in / on / out", () => {
		const half = (a: Cyclotomic, b: Cyclotomic) => a.add(b).scaleRational(1n, 2n);
		expect(pointInPolygon(sq, half(pt(0, 0), pt(1, 1)))).toBe("in"); // centre
		expect(pointInPolygon(sq, half(pt(0, 0), pt(1, 0)))).toBe("on"); // edge midpoint
		expect(pointInPolygon(sq, pt(0, 0))).toBe("on"); // vertex
		expect(pointInPolygon(sq, pt(2, 2))).toBe("out");
		expect(pointInPolygon(sq, pt(-1, 0))).toBe("out");
	});
});

describe("segment primitives", () => {
	it("proper crossing (X) is strict; touching is not", () => {
		expect(segmentsProperlyCross(pt(0, 0), pt(2, 2), pt(0, 2), pt(2, 0))).toBe(true);
		// T-touch (endpoint on the other segment) is NOT a proper cross
		expect(segmentsProperlyCross(pt(0, 0), pt(2, 0), pt(1, 0), pt(1, 2))).toBe(false);
	});
	it("collinear same-side (parallel) overlap vs legal antiparallel shared edge", () => {
		// parallel, overlapping [1,2] → same-side overlap
		expect(collinearSameSideOverlap(pt(0, 0), pt(2, 0), pt(1, 0), pt(3, 0))).toBe(true);
		// antiparallel shared edge (the normal CCW tile adjacency) → legal, false
		expect(collinearSameSideOverlap(pt(0, 0), pt(2, 0), pt(2, 0), pt(0, 0))).toBe(false);
		// collinear but disjoint → false
		expect(collinearSameSideOverlap(pt(0, 0), pt(1, 0), pt(2, 0), pt(3, 0))).toBe(false);
		// not collinear → false
		expect(collinearSameSideOverlap(pt(0, 0), pt(1, 0), pt(0, 1), pt(1, 1))).toBe(false);
	});
});

describe("exactPolygonsOverlap — convex", () => {
	it("squares sharing a full edge do NOT overlap (edge adjacency is legal)", () => {
		expect(exactPolygonsOverlap(square(0, 0).exactVertices!, square(1, 0).exactVertices!)).toBe(false);
	});
	it("squares touching at a single corner do NOT overlap", () => {
		expect(exactPolygonsOverlap(square(0, 0).exactVertices!, square(1, 1).exactVertices!)).toBe(false);
	});
	it("genuinely overlapping squares DO overlap", () => {
		// B shifted by half a unit in x ⇒ interiors intersect
		const a = square(0, 0).exactVertices!;
		const bAnchor = pt(0, 0).add(Cyclotomic.fromRational(ring, 1n, 2n)); // (0.5, 0)
		const b = RegularPolygon.fromAnchorAndDirExact(4, bAnchor, 0).exactVertices!;
		expect(exactPolygonsOverlap(a, b)).toBe(true);
	});
	it("agrees with float Polygon.intersects on a batch of convex pairs", () => {
		const polys = [
			square(0, 0), square(1, 0), square(1, 1), square(5, 5),
			RegularPolygon.fromAnchorAndDirExact(3, ZERO, 0),
			RegularPolygon.fromAnchorAndDirExact(6, pt(0, 0), 0),
		];
		for (let i = 0; i < polys.length; i++) {
			for (let j = i + 1; j < polys.length; j++) {
				const exact = exactPolygonsOverlap(polys[i].exactVertices!, polys[j].exactVertices!);
				const float = polys[i].intersects(polys[j]);
				expect(exact, `pair ${i},${j}`).toBe(float);
			}
		}
	});
});

describe("exactPolygonsOverlap — non-convex star (the soundness surface)", () => {
	const star = ExactStarPolygon.fourStarPi4(ZERO, 0);

	it("an octagon seated edge-to-edge in a star dent does NOT overlap (legal dent-fill)", () => {
		// Dent at v1=(1,0); the 135° octagon corner fills the 225° dent's 135° external gap (dOut=12),
		// sharing edges v1→v0 (dir 12) and v1→v2 (dir 21).
		const oct = RegularPolygon.fromAnchorAndDirExact(8, star.exactVertices![1], 12);
		expect(exactPolygonsOverlap(star.exactVertices!, oct.exactVertices!)).toBe(false);
	});
	it("two identical stars fully overlap", () => {
		const star2 = ExactStarPolygon.fourStarPi4(ZERO, 0);
		expect(exactPolygonsOverlap(star.exactVertices!, star2.exactVertices!)).toBe(true);
	});
	it("a star translated far away does NOT overlap", () => {
		const far = ExactStarPolygon.fourStarPi4(pt(20, 0), 0);
		expect(exactPolygonsOverlap(star.exactVertices!, far.exactVertices!)).toBe(false);
	});
	it("a star nudged half a unit into another DOES overlap", () => {
		const nudged = ExactStarPolygon.fourStarPi4(Cyclotomic.fromRational(ring, 1n, 2n), 0);
		expect(exactPolygonsOverlap(star.exactVertices!, nudged.exactVertices!)).toBe(true);
	});
});
