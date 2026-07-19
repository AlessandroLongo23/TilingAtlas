import { describe, it, expect } from "vitest";
import { Vector, Polygon } from "@/classes";
import { extractFaces, colorFacesAbc, type Segment, type Marker } from "@/utils/islamicArrangement";

// Real tile patches (shared edges => coincident halfway points), same construction the app pools.
function regPoly(cx: number, cy: number, R: number, n: number, phi: number, hue: number): Polygon {
	const p = new Polygon(n);
	p.vertices = [];
	for (let i = 0; i < n; i++) { const a = phi + (2 * Math.PI * i) / n; p.vertices.push(new Vector(cx + R * Math.cos(a), cy + R * Math.sin(a))); }
	p.calculateHalfways(); p.calculateCentroid(); p.calculateAngles(); p.hue = hue;
	return p;
}
function squares(): Polygon[] {
	const out: Polygon[] = []; let h = 0;
	for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) out.push(regPoly(i + 0.5, j + 0.5, Math.SQRT1_2, 4, Math.PI / 4, (h += 37) % 360));
	return out;
}
function truncatedSquare(): Polygon[] {
	const out: Polygon[] = []; let h = 0;
	const R8 = 1 / (2 * Math.sin(Math.PI / 8)), L = 1 + Math.SQRT2, r4 = Math.SQRT1_2;
	for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
		out.push(regPoly(a * L, b * L, R8, 8, Math.PI / 8, (h += 41) % 360));
		out.push(regPoly((a + 0.5) * L, (b + 0.5) * L, r4, 4, 0, (h += 41) % 360));
	}
	return out;
}

function pool(nodes: Polygon[], thetaDeg: number, offset: number) {
	const angle = (thetaDeg * Math.PI) / 180;
	const segments: Segment[] = []; const markers: Marker[] = [];
	for (const n of nodes) { for (const s of n.calculateIslamicSegments(angle, offset, 1)) segments.push(s); for (const m of n.islamicMarkers()) markers.push(m); }
	const faces = extractFaces(segments, offset > 0);
	return { faces, markers };
}
const classesOf = (r: { faces: { klass: string }[] }) => new Set(r.faces.map((f) => f.klass));

describe("colorFacesAbc — A = star body, B/C = background split by bipartite parity", () => {
	it("offset 0: two classes only (A + B), no C", () => {
		const { faces, markers } = pool(squares(), 45, 0);
		const r = colorFacesAbc(faces, markers);
		const cls = classesOf(r);
		expect(cls.has("A")).toBe(true);
		expect(cls.has("B")).toBe(true);
		expect(cls.has("C")).toBe(false);
		expect(r.degenerate).toBe(false);
	});

	it("offset > 0 on squares: all three classes appear", () => {
		const { faces, markers } = pool(squares(), 45, 0.35);
		const r = colorFacesAbc(faces, markers);
		expect(classesOf(r)).toEqual(new Set(["A", "B", "C"]));
		expect(r.degenerate).toBe(false);
	});

	it("offset > 0 on 4.8.8: all three classes appear", () => {
		const { faces, markers } = pool(truncatedSquare(), 45, 0.35);
		const r = colorFacesAbc(faces, markers);
		expect(classesOf(r)).toEqual(new Set(["A", "B", "C"]));
		expect(r.degenerate).toBe(false);
	});

	it("A faces carry a real tile hue; B/C do not depend on it", () => {
		const { faces, markers } = pool(squares(), 45, 0.35);
		const r = colorFacesAbc(faces, markers);
		const aFaces = r.faces.filter((f) => f.klass === "A");
		expect(aFaces.length).toBeGreaterThan(0);
		// every A hue is one the tiles actually emitted (markers carry the tile hue)
		const tileHues = new Set(markers.map((m) => m.hue));
		for (const f of aFaces) expect(tileHues.has(f.hue)).toBe(true);
	});

	it("every face is classified exactly once (no drops)", () => {
		const { faces, markers } = pool(squares(), 45, 0.35);
		const r = colorFacesAbc(faces, markers);
		expect(r.faces.length).toBe(faces.length);
	});
});
