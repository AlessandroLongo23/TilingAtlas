import { describe, it, expect } from "vitest";
import { Vector } from "@/classes";
import { signedArea, pointInPolygon, lineIntersect, tipPoint } from "@/utils/islamicArrangement";

describe("islamicArrangement geometry helpers", () => {
    it("signedArea is positive for a CCW triangle, negative for CW", () => {
        const ccw = [new Vector(0, 0), new Vector(1, 0), new Vector(0, 1)];
        expect(signedArea(ccw)).toBeCloseTo(0.5, 9);
        expect(signedArea([...ccw].reverse())).toBeCloseTo(-0.5, 9);
    });

    it("pointInPolygon is true inside and false outside a non-convex polygon", () => {
        const poly = [new Vector(0, 0), new Vector(2, 1), new Vector(0, 2), new Vector(0.5, 1)];
        expect(pointInPolygon(poly, new Vector(0.3, 1))).toBe(false);
        expect(pointInPolygon(poly, new Vector(1.5, 1))).toBe(true);
    });

    it("lineIntersect finds the crossing of two lines given point+direction", () => {
        const p = lineIntersect(new Vector(0, 0), new Vector(1, 0), new Vector(2, -1), new Vector(0, 1));
        expect(p!.x).toBeCloseTo(2, 9);
        expect(p!.y).toBeCloseTo(0, 9);
    });

    it("tipPoint of a unit square's two edges at a corner is the centroid", () => {
        const hPrev = new Vector(0.5, 0), nPrev = new Vector(0, 1);
        const hCur = new Vector(1, 0.5), nCur = new Vector(-1, 0);
        const p = tipPoint(hPrev, nPrev, hCur, nCur);
        expect(p!.x).toBeCloseTo(0.5, 9);
        expect(p!.y).toBeCloseTo(0.5, 9);
    });
});
