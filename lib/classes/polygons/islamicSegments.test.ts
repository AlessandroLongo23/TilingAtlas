// The Hankin construction must be CONTINUOUS in the contact angle. It was not: at the angle where a tile's
// two adjacent-edge rays go collinear, `calculateIslamicSegments` discarded the pair as "parallel" and each
// ray ran the full midpoint-to-midpoint chord instead of stopping halfway at the star tip — every segment
// exactly twice its length, at one slider step only. That fed `bandWidth × mean(segment length)`, so the
// interlace straps doubled in width at exactly that angle (regular hexagon at 30°, square at 45°, triangle
// at 60°, 12-gon at 15° — and 30/45/60 are the Acute/Median/Obtuse presets).
//
// The critical slider value is 90° − interior/2 (half the exterior angle): the value at which the ray leaving
// edge i and the ray leaving edge i+1 both lie ON the chord joining the two edge midpoints.

import "@/classes";
import { describe, expect, it } from "vitest";
import { Polygon } from "@/classes/polygons/Polygon";
import { Vector } from "@/classes/Vector";
import { islamicNormalAngleFromSlider } from "@/utils/islamicNoise";

function fromVerts(name: string, pts: [number, number][]): Polygon {
	const p = new Polygon(pts.length);
	p.name = name;
	p.vertices = pts.map(([x, y]) => new Vector(x, y));
	p.calculateHalfways();
	p.calculateCentroid();
	return p;
}

/** Regular n-gon, circumradius 1, first vertex on +x. */
function regular(n: number): Polygon {
	return fromVerts(
		`${n}-gon`,
		Array.from({ length: n }, (_, i) => [Math.cos((2 * Math.PI * i) / n), Math.sin((2 * Math.PI * i) / n)] as [number, number]),
	);
}

function meanLength(p: Polygon, sliderDeg: number): number {
	const segs = p.calculateIslamicSegments(islamicNormalAngleFromSlider(sliderDeg), 0, 1, false);
	expect(segs).toHaveLength(2 * p.vertices.length); // no ray may be dropped
	const total = segs.reduce((acc, [a, b]) => acc + Vector.distance(a, b), 0);
	return total / segs.length;
}

describe("calculateIslamicSegments — collinear adjacent rays", () => {
	// slider = 90 − interior/2, i.e. half the exterior angle.
	const critical: [number, number][] = [
		[3, 60],
		[4, 45],
		[6, 30],
		[12, 15],
	];

	it.each(critical)("regular %i-gon is continuous through its critical angle %i°", (n, s) => {
		const p = regular(n);
		const below = meanLength(p, s - 0.1);
		const at = meanLength(p, s);
		const above = meanLength(p, s + 0.1);
		// Continuity: the degenerate value is the limit from both sides, not twice it.
		expect(at).toBeCloseTo(below, 3);
		expect(at).toBeCloseTo(above, 3);
	});

	it("regular hexagon at 30° stops each ray at the chord midpoint, not the far midpoint", () => {
		const p = regular(6);
		// Adjacent edge midpoints of a unit-circumradius hexagon are sin(60°) = 0.8660 apart; two rays
		// growing head-on along that chord meet at its midpoint, 0.4330.
		expect(meanLength(p, 30)).toBeCloseTo(Math.sin(Math.PI / 3) / 2, 6);
	});

	it("emits each chord once, not twice, at the critical angle", () => {
		const p = regular(6);
		const segs = p.calculateIslamicSegments(islamicNormalAngleFromSlider(30), 0, 1, false);
		// A duplicated chord shows up as two segments sharing both endpoints (in either order).
		const key = ([a, b]: [Vector, Vector]) => {
			const k = (v: Vector) => `${v.x.toFixed(6)},${v.y.toFixed(6)}`;
			return [k(a), k(b)].sort().join("|");
		};
		const keys = segs.map(key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("leaves the non-degenerate angles alone", () => {
		// A regression fence on the ordinary path: known values from the pre-fix implementation.
		expect(meanLength(regular(6), 45)).toBeCloseTo(0.44829, 5);
		expect(meanLength(regular(4), 30)).toBeCloseTo(0.51764, 5);
		expect(meanLength(regular(12), 45)).toBeCloseTo(0.28868, 5);
	});

	it("keeps rays that are parallel but NOT collinear un-joined", () => {
		// Same edge directions as a regular hexagon (every corner 120°, so adjacent rays still go parallel
		// at 30°) but alternating edge lengths, so the parallel pair is offset and must never meet. The
		// mean was already continuous here before the fix; it must stay that way.
		const pts: [number, number][] = [];
		let x = 0, y = 0;
		const lens = [1, 1.6, 1, 1.6, 1, 1.6];
		for (let i = 0; i < 6; i++) {
			const t = (Math.PI / 3) * i;
			pts.push([x, y]);
			x += lens[i] * Math.cos(t);
			y += lens[i] * Math.sin(t);
		}
		const p = fromVerts("stretched-hex", pts);
		expect(meanLength(p, 30)).toBeCloseTo(meanLength(p, 29.9), 2);
		expect(meanLength(p, 30)).toBeCloseTo(meanLength(p, 30.1), 2);
		expect(meanLength(p, 30)).toBeCloseTo(1.12583, 5); // unchanged from pre-fix
	});

	it("still meets at the centroid when every ray runs along its inward normal (slider 90°)", () => {
		// a = 0: opposite edges' rays are collinear and head-on. Their meeting point is the centroid,
		// which is also where every other pair meets — so the fix must not move anything here.
		const p = regular(6);
		expect(meanLength(p, 90)).toBeCloseTo(Math.cos(Math.PI / 6), 6); // the inradius
	});
});
