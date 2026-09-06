// The nine hemipolyhedra, re-measured off the shipped geometry.
//
// lib/render/hemiSolids.ts is the one generated shelf that is CONSTRUCTED and not searched, so its
// claims are checkable here from the coordinates alone: every face regular, every edge one length,
// every edge in exactly two faces, one vertex orbit, and the V − E + F and orientability that are the
// reason the class exists. The face census and the names are the only tabulated facts, and they are
// checked against the literature in the generator's own table (Coxeter–Longuet-Higgins–Miller 1954,
// cross-checked against Wikipedia's uniform-polyhedron list, 2026-08-30).
import { describe, expect, it } from "vitest";
import { HEMI_SOLIDS, HEMI_STAR_FACED } from "@/lib/render/hemiSolids";
import { hasSphereView, sphericalSolidSub } from "@/lib/tilings/sph-inscribed";

type V3 = [number, number, number];
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// name -> [V, E, F, chi, orientable]. The published signature of each; a rebuild that moves any of
// these numbers has changed which solid it is emitting.
const EXPECT: Record<string, [number, number, number, number, boolean]> = {
	"hemi-tetrahemihexahedron": [6, 12, 7, 1, false],
	"hemi-octahemioctahedron": [12, 24, 12, 0, true],
	"hemi-cubohemioctahedron": [12, 24, 10, -2, false],
	"hemi-small-icosihemidodecahedron": [30, 60, 26, -4, false],
	"hemi-small-dodecahemidodecahedron": [30, 60, 18, -12, false],
	"hemi-small-dodecahemicosahedron": [30, 60, 22, -8, false],
	"hemi-great-dodecahemicosahedron": [30, 60, 22, -8, false],
	"hemi-great-icosihemidodecahedron": [30, 60, 26, -4, false],
	"hemi-great-dodecahemidodecahedron": [30, 60, 18, -12, false],
};

function edges(faces: number[][]) {
	const c = new Map<string, number>();
	for (const f of faces) {
		for (let i = 0; i < f.length; i++) c.set(key(f[i], f[(i + 1) % f.length]), (c.get(key(f[i], f[(i + 1) % f.length])) ?? 0) + 1);
	}
	return c;
}

/** Consistent orientation of the face rings, or false when the surface is one-sided. */
function orientable(faces: number[][]) {
	const dart = new Map<string, number[]>();
	faces.forEach((f, i) => {
		for (let j = 0; j < f.length; j++) {
			const d = `${f[j]}>${f[(j + 1) % f.length]}`;
			dart.set(d, [...(dart.get(d) ?? []), i]);
		}
	});
	const flip = new Map<number, number>([[0, 1]]);
	const stack = [0];
	while (stack.length) {
		const i = stack.pop() as number;
		const ring = flip.get(i) === -1 ? [...faces[i]].reverse() : faces[i];
		for (let j = 0; j < ring.length; j++) {
			const a = ring[j], b = ring[(j + 1) % ring.length];
			const fwd = dart.get(`${a}>${b}`) ?? [];
			for (const n of [...fwd, ...(dart.get(`${b}>${a}`) ?? [])]) {
				if (n === i) continue;
				const want = fwd.includes(n) ? -1 : 1;
				const seen = flip.get(n);
				if (seen === undefined) { flip.set(n, want); stack.push(n); }
				else if (seen !== want) return false;
			}
		}
	}
	return true;
}

describe("the hemipolyhedra", () => {
	it("ships exactly the nine, each with its published signature", () => {
		expect(HEMI_SOLIDS.map((s) => s.id).sort()).toEqual(Object.keys(EXPECT).sort());
		for (const s of HEMI_SOLIDS) {
			const [V, E, F, chi, ori] = EXPECT[s.id];
			const ec = edges(s.faces);
			expect([s.vertices.length, ec.size, s.faces.length], s.id).toEqual([V, E, F]);
			expect(s.vertices.length - ec.size + s.faces.length, `${s.id}: V - E + F`).toBe(chi);
			expect(orientable(s.faces), `${s.id}: orientability`).toBe(ori);
		}
	});

	it("is a closed surface: every edge lies in exactly two faces", () => {
		for (const s of HEMI_SOLIDS) {
			for (const [e, n] of edges(s.faces)) expect(n, `${s.id} edge ${e}`).toBe(2);
		}
	});

	it("is regular-faced: one edge length, and every face equilateral and planar", () => {
		for (const s of HEMI_SOLIDS) {
			const V = s.vertices as V3[];
			const lens = [...edges(s.faces).keys()].map((e) => {
				const [a, b] = e.split("-").map(Number);
				return dist(V[a], V[b]);
			});
			expect((Math.max(...lens) - Math.min(...lens)) / Math.max(...lens), `${s.id}: edge spread`).toBeLessThan(1e-8);
			for (const f of s.faces) {
				// Planar: every vertex of the ring on the plane of its first three.
				const [p, q, r] = [V[f[0]], V[f[1]], V[f[2]]];
				const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], w = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
				const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
				const L = Math.hypot(...(n as [number, number, number]));
				for (const i of f) {
					const d = ((V[i][0] - p[0]) * n[0] + (V[i][1] - p[1]) * n[1] + (V[i][2] - p[2]) * n[2]) / L;
					expect(Math.abs(d), `${s.id}: a ${f.length}-gon is not planar`).toBeLessThan(1e-8);
				}
			}
		}
	});

	// The count is the census's hemi half; the tolerance is 1e-7 and not 0 because the shipped
	// coordinates are rounded to nine decimals, which puts an exactly-central plane up to ~1e-9 off.
	it("has HEMI faces — a face plane through the centre — which is the whole class", () => {
		const HEMI_COUNT: Record<string, number> = {
			"hemi-tetrahemihexahedron": 3, "hemi-octahemioctahedron": 4, "hemi-cubohemioctahedron": 4,
			"hemi-small-icosihemidodecahedron": 6, "hemi-small-dodecahemidodecahedron": 6,
			"hemi-small-dodecahemicosahedron": 10, "hemi-great-dodecahemicosahedron": 10,
			"hemi-great-icosihemidodecahedron": 6, "hemi-great-dodecahemidodecahedron": 6,
		};
		for (const s of HEMI_SOLIDS) {
			const V = s.vertices as V3[];
			let through = 0;
			for (const f of s.faces) {
				const [p, q, r] = [V[f[0]], V[f[1]], V[f[2]]];
				const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], w = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
				const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
				const L = Math.hypot(...(n as [number, number, number]));
				if (Math.abs((p[0] * n[0] + p[1] * n[1] + p[2] * n[2]) / L) < 1e-7) through++;
			}
			expect(through, `${s.id}: faces through the centre`).toBe(HEMI_COUNT[s.id]);
		}
	});

	it("is uniform: every vertex on one sphere, and one vertex orbit", () => {
		for (const s of HEMI_SOLIDS) {
			const V = s.vertices as V3[];
			// A circumsphere EXISTS — these are their parent quasiregular solid's vertices...
			const radii = V.map((v) => Math.hypot(...v));
			expect(Math.max(...radii) - Math.min(...radii), `${s.id}: not on a circumsphere`).toBeLessThan(1e-8);
			// ...and is still refused, because a hemi face projects to a great circle, not a polygon.
			expect(hasSphereView(s.id), `${s.id}: offered a sphere view`).toBe(false);
			// One orbit, read off the face census at each vertex: same multiset of face sizes everywhere.
			const at = V.map((_, i) => s.faces.filter((f) => f.includes(i)).map((f) => f.length).sort().join("."));
			expect(new Set(at).size, `${s.id}: ${new Set(at).size} vertex types`).toBe(1);
		}
	});

	// They SPLIT by face type (AL, 2026-08-30), which is the split those two headings already make: the
	// six all-convex-faced ones fill the non-convex shelf's k = 1 row — empty until now because the
	// class was missing, k = 1 regular-faced meaning vertex-transitive meaning uniform — and the three
	// with a {5/2} or {10/3} face go to the star shelf's. The partition is asserted against the face
	// census, so a record cannot drift onto the wrong heading without this failing.
	it("splits by face type: six under Regular polygons, three under Star polyhedra", () => {
		const starFaced = new Set<string>();
		for (const s of HEMI_SOLIDS) {
			// A {n/d} face is one whose ring winds more than once — d > 1 means the boundary crosses.
			const star = /\d+\/\d+/.test(s.vertexConfig);
			if (star) starFaced.add(s.id);
			expect(HEMI_STAR_FACED.has(s.id), `${s.id}: HEMI_STAR_FACED disagrees with its face census`).toBe(star);
			expect(sphericalSolidSub(s.id), s.id).toBe(star ? "sst" : "spn-solid");
		}
		expect(starFaced.size, "three of the nine carry a star face").toBe(3);
	});
});
