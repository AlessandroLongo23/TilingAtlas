import { describe, it, expect } from "vitest";
import { Polygon, Vector } from "@/classes";
import { keyOf, signedArea, pointInPolygon, extractFaces } from "@/utils/islamicArrangement";
import { buildInterlaceMap, assignOverUnder, buildIslamicInterlace, twoColorFaces } from "@/utils/islamicInterlace";

const seg = (ax: number, ay: number, bx: number, by: number): [Vector, Vector] =>
    [new Vector(ax, ay), new Vector(bx, by)];

describe("buildInterlaceMap", () => {
    it("gives a crossing where two strands meet the degree 4 of a 4-valent vertex", () => {
        // Two straight strands crossing at the origin, each drawn as two rays ROOTED at the origin —
        // exactly how the construction roots rays at a shared edge midpoint (two tiles × two rays).
        const map = buildInterlaceMap([
            seg(0, 0, 1, 1), seg(0, 0, -1, -1),
            seg(0, 0, 1, -1), seg(0, 0, -1, 1),
        ]);
        const hub = map.vertices[map.vertexOf.get(keyOf(new Vector(0, 0)))!];
        expect(hub.ends.length).toBe(4);
    });
});

describe("assignOverUnder", () => {
    // Two straight strands crossing at the origin; each strand is two collinear rays from the origin.
    const crossingMap = () => buildInterlaceMap([
        seg(0, 0, 1, 1), seg(0, 0, -1, -1),  // strand A
        seg(0, 0, 1, -1), seg(0, 0, -1, 1),  // strand B
    ]);
    // Every ray is rooted at the origin (endpoint A), so its state is edge.underA. Find by far endpoint.
    const underRayTo = (map: ReturnType<typeof crossingMap>, bx: number, by: number) => {
        const e = map.edges.find((e) => Math.abs(e.b.x - bx) < 1e-9 && Math.abs(e.b.y - by) < 1e-9)!;
        return e.underA;
    };

    it("keeps collinear strands in phase and crosses the two strands opposite", () => {
        const map = crossingMap();
        assignOverUnder(map, false);
        for (const e of map.edges) expect(e.underA).toBe(!e.underB); // an edge flips along its length
        expect(underRayTo(map, 1, 1)).toBe(underRayTo(map, -1, -1));  // strand A collinear → same state
        expect(underRayTo(map, 1, -1)).toBe(underRayTo(map, -1, 1));  // strand B collinear → same state
        expect(underRayTo(map, 1, 1)).toBe(!underRayTo(map, 1, -1));  // the two strands are opposite
    });

    it("chirality flip inverts the weave at every crossing", () => {
        const a = crossingMap(); assignOverUnder(a, false);
        const b = crossingMap(); assignOverUnder(b, true);
        for (let i = 0; i < a.edges.length; i++) {
            expect(b.edges[i].underA).toBe(!a.edges[i].underA);
            expect(b.edges[i].underB).toBe(!a.edges[i].underB);
        }
    });
});

describe("buildIslamicInterlace band geometry", () => {
    const bbox = (poly: Vector[]) => ({
        minX: Math.min(...poly.map((p) => p.x)), maxX: Math.max(...poly.map((p) => p.x)),
        minY: Math.min(...poly.map((p) => p.y)), maxY: Math.max(...poly.map((p) => p.y)),
    });

    it("a lone segment with butt caps is a width-wide rectangle", () => {
        const w = 0.4;
        const { bands } = buildIslamicInterlace([seg(0, 0, 2, 0)], { width: w, startUnder: false, squareCap: false });
        expect(bands.length).toBe(1);
        const poly = bands[0].fill;
        expect(Math.abs(signedArea(poly))).toBeCloseTo(w * 2, 9); // width × length
        const b = bbox(poly);
        expect(b.minX).toBeCloseTo(0, 9);
        expect(b.maxX).toBeCloseTo(2, 9);
        expect(b.minY).toBeCloseTo(-w / 2, 9);
        expect(b.maxY).toBeCloseTo(w / 2, 9);
    });

    it("mitres two segments at a 90° bend where their offset lines meet", () => {
        const w = 0.4, h = 0.2;
        // L-bend (0,0)->(1,0)->(1,1); the shared vertex (1,0) is a degree-2 bend. The inner miter sits
        // at (1-h, h) and the outer at (1+h, -h) — the intersections of the two edges' offset lines.
        const { bands } = buildIslamicInterlace(
            [seg(0, 0, 1, 0), seg(1, 0, 1, 1)],
            { width: w, startUnder: false, squareCap: false },
        );
        const pts = bands.flatMap((b) => b.fill);
        const near = (x: number, y: number) => pts.some((p) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9);
        expect(near(1 - h, h)).toBe(true);   // inner (concave) miter
        expect(near(1 + h, -h)).toBe(true);  // outer (convex) miter
    });

    it("tucks the under strand fully under and breaks its outline on the over edge", () => {
        const w = 0.4, h = 0.2;
        // Perpendicular X at the origin. startUnder=false seeds the first edge ((0,0)->(1,0), horizontal)
        // OVER, so the vertical strand is UNDER.
        const { bands } = buildIslamicInterlace(
            [seg(0, 0, 1, 0), seg(0, 0, -1, 0), seg(0, 0, 0, 1), seg(0, 0, 0, -1)],
            { width: w, startUnder: false, squareCap: false },
        );
        const fillPts = bands.flatMap((b) => b.fill);
        const outPts = bands.flatMap((b) => b.outline.flatMap((s) => [s.a, s.b]));
        const near = (pts: Vector[], x: number, y: number) =>
            pts.some((p) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9);
        // The under (vertical) strand's FILL runs to the crossing centre (y = 0) — it tucks fully under.
        expect(near(fillPts, 0.2, 0)).toBe(true);
        expect(near(fillPts, -0.2, 0)).toBe(true);
        // Its OUTLINE stops on the over strand's edge (y = h): the break follows the over edge exactly.
        expect(near(outPts, 0.2, h)).toBe(true);
        expect(near(outPts, -0.2, h)).toBe(true);
        // The over (horizontal) strand runs straight through: fill and outline reach the crossing at y=±h.
        expect(near(fillPts, 0, h)).toBe(true);
        expect(near(outPts, 0, h)).toBe(true);
    });

    it("aligns the under-strand break to the over edge at an OBLIQUE crossing too", () => {
        const w = 0.4, h = 0.2;
        // Horizontal over strand + a strand crossing at 60° to it (not 45°). The under strand's outline
        // corners must lie on the over edge line y = ±h — proving the fix is angle-independent.
        const c = Math.cos(Math.PI / 3), s = Math.sin(Math.PI / 3); // 60°
        const { bands } = buildIslamicInterlace(
            [seg(0, 0, 1, 0), seg(0, 0, -1, 0), seg(0, 0, c, s), seg(0, 0, -c, -s)],
            { width: w, startUnder: false, squareCap: false },
        );
        const outPts = bands.flatMap((b) => b.outline.flatMap((s) => [s.a, s.b]));
        // Every outline corner that came from clipping the under strand sits exactly on y = ±h.
        const onOverEdge = outPts.filter((p) => Math.abs(Math.abs(p.y) - h) < 1e-9);
        expect(onOverEdge.length).toBeGreaterThan(0);
    });

    it("the outline style (weave off) keeps crossings flat: the under strand is not clipped", () => {
        const w = 0.4, h = 0.2;
        const { bands } = buildIslamicInterlace(
            [seg(0, 0, 1, 0), seg(0, 0, -1, 0), seg(0, 0, 0, 1), seg(0, 0, 0, -1)],
            { width: w, startUnder: false, squareCap: false, weave: false },
        );
        const outPts = bands.flatMap((b) => b.outline.flatMap((s) => [s.a, s.b]));
        const near = (x: number, y: number) => outPts.some((p) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9);
        expect(near(0.2, 0)).toBe(true);   // under-strand outline reaches the crossing centre (butt)
        expect(near(0.2, h)).toBe(false);  // and is NOT broken on the over edge
    });
});

describe("twoColorFaces", () => {
    const seg2 = (ax: number, ay: number, bx: number, by: number): [Vector, Vector] =>
        [new Vector(ax, ay), new Vector(bx, by)];

    it("checkerboards a 2×2 grid: adjacent faces differ, diagonal faces match", () => {
        const S: [Vector, Vector][] = [];
        for (let y = 0; y <= 2; y++) for (let x = 0; x < 2; x++) S.push(seg2(x, y, x + 1, y)); // horizontals
        for (let x = 0; x <= 2; x++) for (let y = 0; y < 2; y++) S.push(seg2(x, y, x, y + 1)); // verticals
        const faces = extractFaces(S);
        expect(faces.length).toBe(4);
        const color = twoColorFaces(faces);
        const faceAt = (cx: number, cy: number) => faces.findIndex((f) => pointInPolygon(f.vertices, new Vector(cx, cy)));
        const c00 = color[faceAt(0.5, 0.5)], c10 = color[faceAt(1.5, 0.5)];
        const c01 = color[faceAt(0.5, 1.5)], c11 = color[faceAt(1.5, 1.5)];
        expect(c00).toBe(c11);       // diagonal neighbours share a colour
        expect(c00).not.toBe(c10);   // edge-adjacent neighbours differ
        expect(c00).not.toBe(c01);
    });

    it("checkerboards a two-point (edge-offset) octagon tiling only when crossings are split", () => {
        // The octagon-square (4.8.8) construction at edge offset has transversal crossings. Without
        // splitting them extractFaces closes NO faces (the all-white bug); with splitting it recovers a
        // proper 2-colourable field. Mirrors t2001 + Edge Offset in the app.
        const SP = 1 + Math.SQRT2;
        const oct = (cx: number, cy: number) => {
            const p = new Polygon(8); const R = 1 / (2 * Math.sin(Math.PI / 8)); p.vertices = [];
            for (let k = 0; k < 8; k++) { const a = (Math.PI / 180) * (22.5 + 45 * k); p.vertices.push(new Vector(cx + R * Math.cos(a), cy + R * Math.sin(a))); }
            p.calculateHalfways(); p.calculateCentroid(); p.name = "o"; return p;
        };
        const sq = (cx: number, cy: number) => {
            const p = new Polygon(4); const R = Math.SQRT1_2; p.vertices = [];
            for (let k = 0; k < 4; k++) { const a = (Math.PI / 180) * (45 + 90 * k); p.vertices.push(new Vector(cx + R * Math.cos(a), cy + R * Math.sin(a))); }
            p.calculateHalfways(); p.calculateCentroid(); p.name = "s"; return p;
        };
        const tiles: Polygon[] = [];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) tiles.push(oct(i * SP, j * SP));
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) tiles.push(sq((i + 0.5) * SP, (j + 0.5) * SP));
        const segs = tiles.flatMap((t) => t.calculateIslamicSegments((60 * Math.PI) / 180, 0.45, 1));

        expect(extractFaces(segs, false).length).toBe(0); // the bug: no faces close without splitting
        const faces = extractFaces(segs, true);
        expect(faces.length).toBeGreaterThan(0);
        const colors = twoColorFaces(faces);
        expect(colors.includes(0) && colors.includes(1)).toBe(true); // a genuine two-colour field
    });
});

describe("interlace on a real tiling patch", () => {
    const unitSquare = (ox: number, oy: number): Polygon => {
        const p = new Polygon(4);
        p.vertices = [new Vector(ox, oy), new Vector(ox + 1, oy), new Vector(ox + 1, oy + 1), new Vector(ox, oy + 1)];
        p.calculateHalfways();
        p.calculateCentroid();
        p.name = `sq_${ox}_${oy}`;
        return p;
    };

    it("weaves a 3×3 square grid: shared edge midpoints are 4-valent crossings and the weave trims", () => {
        const squares: Polygon[] = [];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) squares.push(unitSquare(i, j));
        // Real Hankin construction (median, from-normal 45°), pooled across the whole patch.
        const segments = squares.flatMap((s) => s.calculateIslamicSegments((45 * Math.PI) / 180, 0, 1));

        const map = buildInterlaceMap(segments);
        const deg = (x: number, y: number) => {
            const idx = map.vertexOf.get(keyOf(new Vector(x, y)));
            return idx === undefined ? 0 : map.vertices[idx].ends.length;
        };
        // Two tiles share each interior edge, so its midpoint is 4-valent (the X the weave crosses).
        expect(deg(1, 0.5)).toBe(4);  // vertical edge shared by sq(0,0) and sq(1,0)
        expect(deg(0.5, 1)).toBe(4);  // horizontal edge shared by sq(0,0) and sq(0,1)

        const { bands, degenerate } = buildIslamicInterlace(segments, { width: 0.2, startUnder: false });
        expect(degenerate).toBe(false); // clean 4-valent crossings, no odd-degree fallback
        expect(bands.length).toBe(map.edges.length); // one band per deduped edge (45° squares double up)
        const allPts = bands.flatMap((b) => [...b.fill, ...b.outline.flatMap((s) => [s.a, s.b])]);
        expect(allPts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
        expect(bands.some((b) => b.outline.length >= 2)).toBe(true); // straps have side borders
    });

    it("weaves the two-point construction (edge offset): splitting surfaces the transversal crossings", () => {
        const squares: Polygon[] = [];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) squares.push(unitSquare(i, j));
        // Contact slid 40% off the midpoint (Bonner's two-point family). The crossings are now transversal,
        // so they are invisible to the map until it splits them.
        const segments = squares.flatMap((s) => s.calculateIslamicSegments((35 * Math.PI) / 180, 0.4, 1));
        const deg4 = (m: ReturnType<typeof buildInterlaceMap>) => m.vertices.filter((v) => v.ends.length === 4).length;
        expect(deg4(buildInterlaceMap(segments, false))).toBe(0);       // no crossings without splitting
        expect(deg4(buildInterlaceMap(segments, true))).toBeGreaterThan(0); // splitting surfaces them
        const { bands } = buildIslamicInterlace(segments, { width: 0.12, startUnder: false, splitCrossings: true });
        expect(bands.length).toBeGreaterThan(0);
        expect(bands.every((b) => b.fill.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))).toBe(true);
    });
});
