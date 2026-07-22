import { describe, it, expect } from "vitest";
import { PLATONIC_SOLIDS, type Polyhedron, type Vec3 } from "@/lib/render/platonicSolids";
import { archimedeanById } from "@/lib/render/archimedeanSolids";
import { PRISM_ANTIPRISM_SOLIDS } from "@/lib/render/prismSolids";
import { sphericalIslamicRaySegments } from "@/lib/render/sphericalIslamic";
import { buildSphericalInterlace } from "@/lib/render/sphericalInterlace";

function bySolid(id: string): Polyhedron {
	const p = PLATONIC_SOLIDS.find((s) => s.id === id) ?? archimedeanById(id);
	if (!p) throw new Error(`missing solid ${id}`);
	return p;
}

const key = (p: Vec3): string => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)},${Math.round(p[2] * 1e6)}`;
function edgeCount(poly: Polyhedron): number {
	let s = 0;
	for (const f of poly.faces) s += f.length;
	return s / 2; // handshake: Σ face degrees = 2E
}

const SOLIDS = ["cube", "icosahedron", "dodecahedron", "cuboctahedron", "rhombicuboctahedron"];

describe("buildSphericalInterlace — cross-face weave crossings at every polyhedron edge", () => {
	// The whole weave lives at the shared edge-midpoints: two rays from each adjacent face root there, so a
	// correct GLOBAL map must dedupe them into one degree-4 vertex. There is exactly one midpoint per
	// polyhedron edge, and tips are degree ≤ 2, so #(degree-4 vertices) must equal the edge count. A per-face
	// map would see degree 2 at every midpoint and weave nothing — this is the guard against that regression.
	for (const id of SOLIDS) {
		it(`${id}: #(degree-4 vertices) === edge count`, () => {
			const poly = bySolid(id);
			const rays = sphericalIslamicRaySegments(poly, { angleRad: (40 * Math.PI) / 180 });
			const deg = new Map<string, number>();
			for (const [a, b] of rays) {
				deg.set(key(a), (deg.get(key(a)) ?? 0) + 1);
				deg.set(key(b), (deg.get(key(b)) ?? 0) + 1);
			}
			const deg4 = [...deg.values()].filter((d) => d === 4).length;
			expect(deg4).toBe(edgeCount(poly));
		});
	}
});

describe("buildSphericalInterlace — one band per ray, corners on the sphere", () => {
	for (const id of SOLIDS) {
		it(`${id}: bands === rays, every strap corner is unit length`, () => {
			const poly = bySolid(id);
			const opts = { angleRad: (40 * Math.PI) / 180, width: 0.06 };
			const rays = sphericalIslamicRaySegments(poly, opts);
			const { bands } = buildSphericalInterlace(poly, opts);
			expect(bands.length).toBe(rays.length);
			for (const band of bands) {
				expect(band.fillCorners.length).toBe(4);
				for (const c of band.fillCorners) expect(Math.hypot(c[0], c[1], c[2])).toBeCloseTo(1, 4);
				for (const seg of band.outline) {
					for (const p of [seg.a, seg.b, seg.oa, seg.ob]) expect(Math.hypot(p[0], p[1], p[2])).toBeCloseTo(1, 4);
				}
			}
		});
	}
});

// The border is world-space geometry, not a fixed-width sweep: the corner construction runs twice per
// edge-end, at half-width h and at h + border, and the quad between the two rings IS the border. So the outer
// ring must sit OUTSIDE the fill ring — that gap is the whole mechanism (it is what makes the outline style's
// silhouette come out as union(outer) \ union(fill)), and at border 0 the two rings must coincide so no
// border is drawn at all.
//
// The gap is the projected `border` where an end butts (a crossing) and MORE at a mitred bend, where the join
// point slides out by border/sin(θ/2) — same as the flat buildBands. "Projected" because the corners are built
// in the vertex's tangent plane and mapped back by normalize(pos + x·u + y·v), a gnomonic map: an in-plane
// offset d lands atan(d) along the sphere. The band's own half-width already carries that same 0.1%-scale
// compression, so border and band stay in proportion; the floor below just states it exactly. The ceiling pins
// the overshoot as a mitre rather than an unbounded spike.
describe("buildSphericalInterlace — the border ring is offset outward by `border` radians", () => {
	const arc = (a: Vec3, b: Vec3): number => Math.acos(clamp3(dot3(norm3(a), norm3(b))));
	for (const id of SOLIDS) {
		it(`${id}: outer ring is outside the fill ring, and collapses onto it at 0`, () => {
			const poly = bySolid(id);
			const width = 0.06;
			const base = { angleRad: (40 * Math.PI) / 180, width };
			const border = 0.01;
			const butt = Math.atan(width / 2 + border) - Math.atan(width / 2); // the gnomonic-projected gap
			const { bands } = buildSphericalInterlace(poly, { ...base, border });
			let butted = 0;
			for (const band of bands) {
				// The two long sides only (index 0 and 1) — a tip cap also slides along the strap axis.
				for (const seg of band.outline.slice(0, 2)) {
					for (const [inner, outer] of [[seg.a, seg.oa], [seg.b, seg.ob]] as const) {
						const gap = arc(inner, outer);
						expect(gap).toBeGreaterThanOrEqual(butt - 1e-9);
						expect(gap).toBeLessThan(border * 4);
						if (Math.abs(gap - butt) < 1e-9) butted++;
					}
				}
			}
			expect(butted).toBeGreaterThan(0); // every crossing end butts, and there is one per polyhedron edge
			const flat = buildSphericalInterlace(poly, base);
			for (const band of flat.bands) for (const seg of band.outline) expect(arc(seg.a, seg.oa)).toBeCloseTo(0, 6);
		});
	}
});

// The outline style crosses its straps flat, so nothing lifts: every band's level must be 0 at both ends.
// The mesh reads that to decide the border sits UNDER the bodies (which is what paints the interior borders
// out); a stray non-zero level would put a strap above its neighbour's body and break the silhouette.
describe("buildSphericalInterlace — weave off leaves every level at 0", () => {
	for (const id of SOLIDS) {
		it(`${id}: weave:false ⇒ all levels 0, weave:true ⇒ some are not`, () => {
			const poly = bySolid(id);
			const opts = { angleRad: (40 * Math.PI) / 180, width: 0.06, border: 0.01 };
			const flat = buildSphericalInterlace(poly, { ...opts, weave: false });
			expect(flat.bands.every((b) => b.levelA === 0 && b.levelB === 0)).toBe(true);
			const woven = buildSphericalInterlace(poly, opts);
			expect(woven.bands.some((b) => b.levelA !== 0 || b.levelB !== 0)).toBe(true);
		});
	}
});

describe("buildSphericalInterlace — the weave is consistent (bipartite, not degenerate)", () => {
	// Even degree at every real crossing ⇒ the alternating over/under assignment never conflicts. If any solid
	// came back degenerate at a generic angle, the weave would silently fall back to flat straps.
	for (const id of SOLIDS) {
		it(`${id}: assignment is non-degenerate at 40°`, () => {
			const poly = bySolid(id);
			const { degenerate } = buildSphericalInterlace(poly, { angleRad: (40 * Math.PI) / 180, width: 0.06 });
			expect(degenerate).toBe(false);
		});
	}
});

// --- prism / antiprism family: construction rays stay inside their own face ---
// These solids mix a large n-gon cap with small band quads/triangles. On such faces two construction rays can
// be near-parallel great circles whose only forward crossing is far across the sphere; unbounded, a ray gets
// drawn to it (the long stray line seen on the decagonal prism at ~38–39°) and, having left its face, crosses
// OTHER faces' rays mid-body — an endpoint-shared-by-neither crossing that the weave can't lift, so the straps
// render coplanar with a border notch. computeFaceRays now clamps every ray to where it exits its own face, so
// rays stay contained: at the default construction every crossing sits at a shared endpoint and the weave is
// clean with nothing to split. midArcCrossings() below counts exactly the escaping crossings — it must be 0.
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const norm3 = (a: Vec3): Vec3 => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
const clamp3 = (x: number): number => Math.min(1, Math.max(-1, x));

// Transversal crossings between drawn construction rays that share NO endpoint — the un-woven crossings that
// appear only when a ray escapes its face. A correct (contained) construction produces zero of these.
function midArcCrossings(rays: Array<[Vec3, Vec3]>): Vec3[] {
	const N = rays.length;
	const pn = rays.map(([O, E]) => norm3(cross3(O, E)));
	const tang = rays.map(([O, E]) => norm3(sub3(E, scale3(O, dot3(O, E)))));
	const alen = rays.map(([O, E]) => Math.acos(clamp3(dot3(O, E))));
	const ends = rays.map(([O, E]) => new Set([key(O), key(E)]));
	const paramOn = (i: number, X: Vec3): number => Math.atan2(dot3(X, tang[i]), dot3(X, rays[i][0]));
	const EPS = 1e-4;
	const out: Vec3[] = [];
	for (let i = 0; i < N; i++) {
		for (let j = i + 1; j < N; j++) {
			let shares = false;
			for (const k of ends[i]) if (ends[j].has(k)) { shares = true; break; }
			if (shares) continue;
			const line = cross3(pn[i], pn[j]);
			if (Math.hypot(line[0], line[1], line[2]) < 1e-9) continue;
			for (const sgn of [1, -1] as const) {
				const X = norm3(scale3(line, sgn));
				const ti = paramOn(i, X);
				const tj = paramOn(j, X);
				if (ti > EPS && ti < alen[i] - EPS && tj > EPS && tj < alen[j] - EPS) out.push(X);
			}
		}
	}
	return out;
}

describe("buildSphericalInterlace — prism/antiprism rays stay contained, weave is clean", () => {
	// 39° is the angle where the decagonal prism's square-face ray used to run away across the sphere.
	for (const poly of PRISM_ANTIPRISM_SOLIDS) {
		for (const angleDeg of [30, 39, 45, 60]) {
			it(`${poly.id} @ ${angleDeg}°: no escaping ray crossings, weave non-degenerate`, () => {
				const opts = { angleRad: (angleDeg * Math.PI) / 180, width: 0.06 };
				const raw = sphericalIslamicRaySegments(poly, opts);
				expect(midArcCrossings(raw).length).toBe(0);
				const { degenerate } = buildSphericalInterlace(poly, opts);
				expect(degenerate).toBe(false);
			});
		}
	}
});
