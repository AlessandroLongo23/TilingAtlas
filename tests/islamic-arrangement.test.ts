import { describe, it, expect } from "vitest";
import { Vector } from "@/classes";
import { signedArea, pointInPolygon, lineIntersect, tipPoint } from "@/utils/islamicArrangement";
import { extractFaces, buildArrangement } from "@/utils/islamicArrangement";
import { colorFaces, colorFacesBySourceTile, HUE } from "@/utils/islamicArrangement";

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

    it("splits transversally crossing segments at the crossing (splitCrossings = true)", () => {
        // Unit square boundary + both diagonals. The diagonals cross transversally at the centre,
        // which is NOT an endpoint of any segment — the case the count>1 construction introduces and
        // the T-junction-only tracer misses. With the crossing split it yields four triangles.
        const segments = [
            seg(-1, -1, 1, -1), seg(1, -1, 1, 1), seg(1, 1, -1, 1), seg(-1, 1, -1, -1), // boundary
            seg(-1, -1, 1, 1), seg(1, -1, -1, 1), // diagonals crossing at the origin
        ];
        const faces = extractFaces(segments, true);
        expect(faces.length).toBe(4);
        for (const f of faces) expect(f.vertices.length).toBe(3); // triangles corner–corner–centre
    });

    it("finds a crossing between long segments that span many grid cells (grid broad-phase)", () => {
        // Guards the spatial-grid broad-phase in buildArrangement(splitCrossings): a long horizontal and
        // long vertical segment cross at the origin; the two short segments pull the mean length (and thus
        // the grid cell) far below the long ones, so the long segments span many cells. The crossing is
        // only found if each segment is binned into EVERY cell its bounding box covers, not just its ends.
        const { pts } = buildArrangement([
            seg(-10, 0, 10, 0), seg(0, -10, 0, 10),   // long crossing pair
            seg(5, 5, 5.1, 5), seg(-5, -5, -5.1, -5), // short segments shrink the mean length
        ], true);
        // Endpoints (8) + the origin crossing = 9. Without the crossing split (or with a grid that misses
        // it) the origin vertex is absent.
        expect(pts.some((p) => Math.abs(p.x) < 1e-6 && Math.abs(p.y) < 1e-6)).toBe(true);
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

describe("colorFacesBySourceTile", () => {
    const box = (x0: number, y0: number, s: number, hue: number) => ({
        vertices: [new Vector(x0, y0), new Vector(x0 + s, y0), new Vector(x0 + s, y0 + s), new Vector(x0, y0 + s)],
        hue,
    });

    it("colors each face by the tile that contains its centroid", () => {
        const tileA = box(0, 0, 2, 10);
        const tileB = box(2, 0, 2, 20);
        const faceInA = { vertices: [new Vector(0.4, 0.4), new Vector(1.6, 0.4), new Vector(1.6, 1.6), new Vector(0.4, 1.6)] };
        const faceInB = { vertices: [new Vector(2.4, 0.4), new Vector(3.6, 0.4), new Vector(3.6, 1.6), new Vector(2.4, 1.6)] };
        const out = colorFacesBySourceTile([faceInA, faceInB], [tileA, tileB]);
        expect(out.find((o) => o.face === faceInA)!.hue).toBe(10);
        expect(out.find((o) => o.face === faceInB)!.hue).toBe(20);
    });

    it("omits a face whose centroid is in no tile", () => {
        const out = colorFacesBySourceTile(
            [{ vertices: [new Vector(5, 5), new Vector(6, 5), new Vector(6, 6), new Vector(5, 6)] }],
            [box(0, 0, 1, 10)],
        );
        expect(out.length).toBe(0);
    });
});
