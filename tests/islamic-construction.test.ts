import { describe, it, expect } from "vitest";
import { Polygon, Vector } from "@/classes";

/**
 * Islamic / Hankin contact-angle LINE construction (docs/DEVELOPMENT_NOTES.md, the star-tiling fix).
 *
 * `Polygon.calculateIslamicSegments(theta)` is the correct, shape-agnostic replacement for the old
 * `calculateIslamicTips` closed form (which assumed a regular convex n-gon via `beta = π/n` and
 * `perp = centroid − midpoint`, and paired rays by fixed adjacent-edge index). The new method:
 *   - emits two rays per edge from the edge midpoint at ±theta from the TRUE inward edge-normal,
 *   - terminates each ray at its nearest forward intersection with any OTHER ray of the same tile,
 *   - returns one [midpoint, endpoint] segment per ray (2·edges segments total).
 *
 * theta is measured from the inward normal (0 ⇒ along the normal; π/2 ⇒ along the edge), matching
 * AL's drawing convention: at 0 the meeting points collapse onto the centroid.
 */

// Regular n-gon at unit circumradius, CCW, centred on the origin.
function regularPolygon(n: number): Polygon {
    const p = new Polygon(n);
    p.vertices = [];
    for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        p.vertices.push(new Vector(Math.cos(a), Math.sin(a)));
    }
    p.calculateHalfways();
    p.calculateCentroid();
    p.calculateAngles();
    return p;
}

// Isotoxal 4-pointed star: 4 convex points at radius 1, 4 reflex dents at radius `rInner`, CCW.
// D4-symmetric (whatever the edge lengths), which is all the construction relies on.
function fourStar(rInner: number): Polygon {
    const p = new Polygon(4); // n = point count, boundary is 8 edges — the shape the old code broke on
    p.vertices = [];
    for (let k = 0; k < 8; k++) {
        const a = (Math.PI / 4) * k;
        const r = k % 2 === 0 ? 1 : rInner;
        p.vertices.push(new Vector(r * Math.cos(a), r * Math.sin(a)));
    }
    p.calculateHalfways();
    p.calculateCentroid();
    p.calculateAngles();
    return p;
}

// Ray-cast point-in-polygon, correct for NON-convex polygons (unlike Polygon.containsPoint,
// which is a convex-hull test and wrongly accepts points in a star's dents — NOTES §9.4).
function insidePolygon(poly: Vector[], pt: Vector): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const crosses =
            yi > pt.y !== yj > pt.y &&
            pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
        if (crosses) inside = !inside;
    }
    return inside;
}

// Distance from p to segment ab (0 if p lies on the segment).
function distToSegment(p: Vector, a: Vector, b: Vector): number {
    const ab = Vector.sub(b, a);
    const len2 = ab.dot(ab);
    if (len2 < 1e-18) return Vector.distance(p, a);
    let t = Vector.sub(p, a).dot(ab) / len2;
    t = Math.max(0, Math.min(1, t));
    return Vector.distance(p, new Vector(a.x + ab.x * t, a.y + ab.y * t));
}

const TOL = 1e-6;

describe("calculateIslamicSegments — regular polygon", () => {
    it("emits two segments per edge, each rooted at that edge's midpoint", () => {
        const hex = regularPolygon(6);
        const segs = hex.calculateIslamicSegments((25 * Math.PI) / 180);
        expect(segs.length).toBe(12);
        for (let i = 0; i < 6; i++) {
            expect(Vector.distance(segs[2 * i][0], hex.halfways[i])).toBeLessThan(TOL);
            expect(Vector.distance(segs[2 * i + 1][0], hex.halfways[i])).toBeLessThan(TOL);
        }
    });

    it("collapses every meeting point onto the centroid at theta = 0", () => {
        const hex = regularPolygon(6);
        const segs = hex.calculateIslamicSegments(0);
        expect(segs.length).toBe(12);
        for (const [, end] of segs) {
            expect(Vector.distance(end, hex.centroid)).toBeLessThan(TOL);
        }
    });

    it("places all meeting points at one shared radius (n-fold symmetry), strictly inside", () => {
        const hex = regularPolygon(6);
        const segs = hex.calculateIslamicSegments((30 * Math.PI) / 180);
        const radii = segs.map(([, end]) => Vector.distance(end, hex.centroid));
        for (const r of radii) {
            expect(r).toBeGreaterThan(TOL); // not the centroid
            expect(r).toBeLessThan(1); // inside the circumradius
            expect(Math.abs(r - radii[0])).toBeLessThan(TOL); // all equal
        }
    });
});

describe("calculateIslamicSegments — 4-pointed star (the shape the old code broke on)", () => {
    it("emits two segments per edge (16 for an 8-edge star)", () => {
        const star = fourStar(0.45);
        const segs = star.calculateIslamicSegments((25 * Math.PI) / 180);
        expect(segs.length).toBe(16);
    });

    it("keeps every meeting point strictly inside the true (non-convex) star", () => {
        const star = fourStar(0.45);
        const segs = star.calculateIslamicSegments((25 * Math.PI) / 180);
        for (const [, end] of segs) {
            expect(insidePolygon(star.vertices, end)).toBe(true);
        }
    });

    it("closes: every ray ends on another ray's drawn body (no loose ends)", () => {
        // The property the first suite missed. A ray must terminate where it meets another ray's
        // actually-drawn segment — either a shared endpoint or a T-junction — never in open space.
        const shapes: [string, Polygon][] = [
            ["octagon", regularPolygon(8)],
            ["square", regularPolygon(4)],
            ["4-star", fourStar(0.45)],
        ];
        for (const [, poly] of shapes) {
            for (const th of [23, 35, 47, 65]) {
                const segs = poly.calculateIslamicSegments((th * Math.PI) / 180);
                for (let i = 0; i < segs.length; i++) {
                    const end = segs[i][1];
                    const lands = segs.some(
                        (s, j) => j !== i && distToSegment(end, s[0], s[1]) < 1e-6,
                    );
                    expect(lands).toBe(true);
                }
            }
        }
    });

    it("respects the star's 4-fold rotational symmetry", () => {
        const star = fourStar(0.45);
        const c = star.centroid;
        const segs = star.calculateIslamicSegments((25 * Math.PI) / 180);
        const ends = segs.map(([, e]) => e);
        for (const e of ends) {
            const rotated = Vector.rotateAround(e, c, Math.PI / 2);
            const matched = ends.some((o) => Vector.distance(o, rotated) < 1e-4);
            expect(matched).toBe(true);
        }
    });
});

describe("Polygon.islamicMarkers", () => {
    it("gives a regular tile only its centroid", () => {
        const hex = regularPolygon(6);
        const markers = hex.islamicMarkers();
        expect(markers.length).toBe(1);
        expect(markers[0].kind).toBe("centroid");
        expect(Vector.distance(markers[0].point, hex.centroid)).toBeLessThan(1e-9);
    });

    it("gives a 4-star one centroid, four dents, four tips", () => {
        const star = fourStar(0.45);
        star.isStar = true; // mark as star so tip/dent markers are emitted
        const markers = star.islamicMarkers();
        const count = (k: string) => markers.filter((m) => m.kind === k).length;
        expect(count("centroid")).toBe(1);
        expect(count("dent")).toBe(4);
        expect(count("tip")).toBe(4);
    });

    it("keeps every star marker strictly inside the tile", () => {
        const star = fourStar(0.45);
        star.isStar = true;
        for (const m of star.islamicMarkers()) {
            expect(insidePolygon(star.vertices, m.point)).toBe(true);
        }
    });
});
