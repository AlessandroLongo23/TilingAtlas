import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HyperbolicDeveloper, type Darts } from "@/lib/render/hyperbolicDevelopClient";
import { su11Identity, su11Mul, su11Translation, su11Normalize, su11Apply, hypDist, type Complex } from "@/lib/render/hyperbolic";
import type { DevelopedPatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { sampleAtlas } from "./hyperbolic-sample";

interface ShippedPatch extends DevelopedPatch {
	darts?: Darts;
}

const atlas: ShippedPatch[] = JSON.parse(
	readFileSync(join(__dirname, "..", "public", "hyperbolic-developed.json"), "utf8"),
);

/** Reference geometry from the PYTHON developer (tools/ctrnact-oracle/develop_hyperbolic.py), frozen so
 *  the cross-implementation check survives the catalogue dropping its baked vertices/faces. */
const golden: ShippedPatch[] = JSON.parse(
	readFileSync(join(__dirname, "fixtures", "hyperbolic-golden-patches.json"), "utf8"),
);
const goldenById = (id: string) => {
	const p = golden.find((x) => x.id === id);
	if (!p) throw new Error(`golden ${id} missing`);
	return p;
};

const byId = (id: string) => {
	const p = atlas.find((x) => x.id === id);
	if (!p) throw new Error(`patch ${id} not in atlas`);
	return p;
};

/** Multiset of face sizes among faces whose vertices are all within `cut` of the origin — rotation- and
 *  truncation-robust, so it identifies the tiling independent of how the finite rim was cut. */
function centralFaceSig(vertices: [number, number][], faces: number[][], cut = 0.7): string {
	const sizes: number[] = [];
	for (const f of faces) {
		if (f.every((v) => Math.hypot(vertices[v][0], vertices[v][1]) <= cut)) sizes.push(f.length);
	}
	return sizes.sort((a, b) => a - b).join(",");
}

/** Fraction of a polar sample grid (radii out to `rMax`) NOT covered by any developed face — the hole
 *  detector. Even-odd point-in-polygon on the straight-edge faces; geodesic edges bow inward so this
 *  slightly under-counts coverage near edges, making the test conservative. */
function coverMiss(vertices: [number, number][], faces: number[][], rMax = 0.7, m = 90): number {
	const polys = faces.map((f) => f.map((v) => vertices[v]));
	const inside = (x: number, y: number): boolean => {
		for (const pts of polys) {
			let c = false;
			for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
				const [xi, yi] = pts[i];
				const [xj, yj] = pts[j];
				if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
			}
			if (c) return true;
		}
		return false;
	};
	let miss = 0;
	let tot = 0;
	for (const frac of [0.3, 0.55, 0.8, 1]) {
		const r = frac * rMax;
		for (let k = 0; k < m; k++) {
			tot++;
			if (!inside(r * Math.cos((2 * Math.PI * k) / m), r * Math.sin((2 * Math.PI * k) / m))) miss++;
		}
	}
	return miss / tot;
}

describe("HyperbolicDeveloper (TS port of develop_patch)", () => {
	it("every shipped patch carries a well-formed dart structure", () => {
		for (const p of atlas) {
			expect(p.darts, `${p.id} missing darts`).toBeTruthy();
			const d = p.darts as Darts;
			const n = d.rneig.length;
			expect(d.glue.length).toBe(n);
			expect(d.lvert.length).toBe(n);
			// permutations index within range
			for (const x of d.rneig) expect(x).toBeGreaterThanOrEqual(0), expect(x).toBeLessThan(n);
			for (const x of d.glue) expect(x).toBeGreaterThanOrEqual(0), expect(x).toBeLessThan(n);
			// glue is an involution
			for (let i = 0; i < n; i++) expect(d.glue[d.glue[i]]).toBe(i);
		}
	});

	const samples = [
		"hyp-8-8-8", // regular {8,3}, 1 dart
		"hyp-3-6-4-6", // mixed k=1, valence 4
		"hyp-3-3-4-3-5", // dense k=1, valence 5
		"hyp-7-7-7", // {7,3}
		"hyp-3-3-3-3-3-3-3-3", // {3,8}, valence 8
		"hyp-k2-3-4-6-6__3-6-4-6", // k=2
		"hyp-k2-3-3-3-4-3-4__3-3-3-4-3-4", // k=2, valence 6
	];

	it.each(samples)("develops %s to a geometrically valid patch matching the shipped tiling", (id) => {
		const p = byId(id);
		const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
		// identity view, high bound so the visible disk fills (large-tile tilings need boundR near 1)
		const out = dev.develop({ id: p.id, name: p.name, config: p.config, edge: p.edge }, su11Identity(), 0.99, 20000);

		// (0) no holes in the developed interior (the failure the user hates)
		expect(coverMiss(out.vertices, out.faces), `${id}: interior not fully covered (holes)`).toBe(0);

		// (1) every developed edge is a geodesic of length ℓ (regular polygons of the forced edge length)
		let worstEdge = 0;
		for (const f of out.faces) {
			for (let i = 0; i < f.length; i++) {
				const a: Complex = { x: out.vertices[f[i]][0], y: out.vertices[f[i]][1] };
				const b: Complex = { x: out.vertices[f[(i + 1) % f.length]][0], y: out.vertices[f[(i + 1) % f.length]][1] };
				worstEdge = Math.max(worstEdge, Math.abs(hypDist(a, b) - p.edge));
			}
		}
		expect(worstEdge, `${id}: developed edge length drifts from ℓ`).toBeLessThan(1e-2);

		// (2) all inside the disk
		for (const v of out.vertices) expect(Math.hypot(v[0], v[1])).toBeLessThan(1);

		// (3) central face-size multiset matches the PYTHON developer's patch for the same tiling
		// (rotation/truncation-robust) — the cross-implementation check.
		const ref = goldenById(id);
		expect(centralFaceSig(out.vertices, out.faces)).toBe(
			centralFaceSig(ref.vertices as [number, number][], ref.faces),
		);
	});

	it("fills a wider disk when asked (fill-to-rim: more tiles at a larger bound)", () => {
		const p = byId("hyp-3-6-4-6");
		const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
		const near = dev.develop({ id: p.id, name: p.name, config: p.config, edge: p.edge }, su11Identity(), 0.8, 20000);
		const far = dev.develop({ id: p.id, name: p.name, config: p.config, edge: p.edge }, su11Identity(), 0.95, 20000);
		expect(far.faces.length).toBeGreaterThan(near.faces.length);
	});

	it("stays hole-free while panning across the tiling (persistent develop + prune)", () => {
		const p = byId("hyp-3-6-4-6");
		const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
		const meta = { id: p.id, name: p.name, config: p.config, edge: p.edge };
		let view = su11Identity();
		// walk the view across the tiling in steps; a small cap forces prune to fire repeatedly
		for (let step = 0; step < 12; step++) {
			view = su11Normalize(su11Mul(su11Translation({ x: 0.18, y: 0.05 }), view));
			const out = dev.develop(meta, view, 0.97, 500);
			// coverage of the VISIBLE disk: project vertices through the view, sample the inner screen disk
			// (r ≤ 0.45, comfortably inside the cap-limited fill and where geodesic edges barely bow)
			const screenVerts = out.vertices.map((v) => {
				const s = su11Apply(view, { x: v[0], y: v[1] });
				return [s.x, s.y] as [number, number];
			});
			expect(coverMiss(screenVerts, out.faces, 0.45), `hole after pan step ${step}`).toBe(0);
		}
	});

	it("a deterministic sample of shipped patches develops hole-free", { timeout: 120_000 }, () => {
		// Was "all 59"; the shelf is thousands now (D-symbol re-count), so this checks a seeded sample —
		// the same sampling the dirichlet/reduce suites use (tests/hyperbolic-sample.ts).
		const bad: string[] = [];
		for (const p of sampleAtlas(atlas, 80)) {
			const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
			const out = dev.develop({ id: p.id, name: p.name, config: p.config, edge: p.edge }, su11Identity(), 0.99, 20000);
			if (coverMiss(out.vertices, out.faces) > 0) bad.push(p.id);
		}
		expect(bad, `patches with interior holes: ${bad.join(", ")}`).toEqual([]);
	});

	it("deepDedup mode develops the same patch as the default at moderate depth", () => {
		for (const id of ["hyp-3-6-4-6", "hyp-k2-3-4-6-6__3-6-4-6"]) {
			const p = byId(id);
			const meta = { id: p.id, name: p.name, config: p.config, edge: p.edge };
			const a = new HyperbolicDeveloper(p.darts as Darts, p.edge).develop(meta, su11Identity(), 0.9, 20000);
			const b = new HyperbolicDeveloper(p.darts as Darts, p.edge, { deepDedup: true }).develop(
				meta, su11Identity(), 0.9, 20000,
			);
			expect(centralFaceSig(b.vertices, b.faces)).toBe(centralFaceSig(a.vertices, a.faces));
			expect(b.faces.length).toBe(a.faces.length);
		}
	});

	it("extendTo grows the instance set monotonically and reports uncapped fills", () => {
		const p = byId("hyp-7-7-7");
		const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge, { deepDedup: true });
		expect(dev.extendTo(su11Identity(), 0.8, 100000)).toBe(true);
		const n1 = dev.instanceCount();
		expect(n1).toBeGreaterThan(10);
		expect(dev.extendTo(su11Identity(), 0.95, 100000)).toBe(true);
		const n2 = dev.instanceCount();
		expect(n2).toBeGreaterThan(n1);
		// a tiny cap must be reported as capped
		const dev2 = new HyperbolicDeveloper(p.darts as Darts, p.edge, { deepDedup: true });
		expect(dev2.extendTo(su11Identity(), 0.99, 50)).toBe(false);
	});
});
