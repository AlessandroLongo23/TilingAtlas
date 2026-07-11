import { describe, it, expect } from "vitest";
import { Vector } from "@/classes";
import { signedArea, pointInPolygon, lineIntersect, tipPoint } from "@/utils/islamicArrangement";
import { extractFaces } from "@/utils/islamicArrangement";
import { colorFaces, HUE } from "@/utils/islamicArrangement";

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

describe("extractFaces", () => {
    const seg = (ax: number, ay: number, bx: number, by: number): [Vector, Vector] =>
        [new Vector(ax, ay), new Vector(bx, by)];

    it("returns one bounded face for a single triangle", () => {
        const faces = extractFaces([seg(0, 0, 1, 0), seg(1, 0, 0, 1), seg(0, 1, 0, 0)]);
        expect(faces.length).toBe(1);
        expect(Math.abs(signedArea(faces[0].vertices))).toBeCloseTo(0.5, 6);
    });

    it("splits an edge at a T-junction, yielding two faces", () => {
        // triangle (0,0),(2,0),(0,2) plus a spoke from apex (0,2) to midpoint (1,0) of the base.
        const faces = extractFaces([
            seg(0, 0, 2, 0), seg(2, 0, 0, 2), seg(0, 2, 0, 0), seg(0, 2, 1, 0),
        ]);
        expect(faces.length).toBe(2);
    });

    it("returns four inner faces for a square with a center hub (no outer face)", () => {
        const faces = extractFaces([
            seg(0, 0, 2, 0), seg(2, 0, 2, 2), seg(2, 2, 0, 2), seg(0, 2, 0, 0), // square
            seg(1, 1, 0, 0), seg(1, 1, 2, 0), seg(1, 1, 2, 2), seg(1, 1, 0, 2), // hub to corners
        ]);
        expect(faces.length).toBe(4);
        for (const f of faces) expect(signedArea(f.vertices)).toBeGreaterThan(0); // CCW, outer dropped
    });
});

describe("colorFaces", () => {
    const unit = [new Vector(0, 0), new Vector(1, 0), new Vector(1, 1), new Vector(0, 1)];
    const faceAt = (cx: number) => ({ vertices: unit.map((v) => new Vector(v.x + cx, v.y)) });

    it("colors a face by the only marker inside it", () => {
        const face = faceAt(0);
        const out = colorFaces([face], [{ point: new Vector(0.5, 0.5), kind: "dent" }]);
        expect(out.length).toBe(1);
        expect(out[0].hue).toBe(HUE.dent);
    });

    it("centroid wins when a face contains several markers", () => {
        const face = faceAt(0);
        const out = colorFaces([face], [
            { point: new Vector(0.3, 0.5), kind: "tip" },
            { point: new Vector(0.5, 0.5), kind: "centroid" },
            { point: new Vector(0.7, 0.5), kind: "dent" },
        ]);
        expect(out[0].hue).toBe(HUE.centroid);
    });

    it("leaves marker-free faces unfilled", () => {
        const out = colorFaces([faceAt(0), faceAt(5)], [{ point: new Vector(0.5, 0.5), kind: "tip" }]);
        expect(out.length).toBe(1); // only the face containing the tip
        expect(out[0].hue).toBe(HUE.tip);
    });
});
