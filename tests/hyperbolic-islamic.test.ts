import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HyperbolicDeveloper, type Darts } from "@/lib/render/hyperbolicDevelopClient";
import {
	KLEIN_SCALE,
	islamicSegmentsForTile,
	kleinToPoincare,
	STRAP_RANGE,
	islamicLayers,
	islamicTileLayer,
	poincareToKlein,
} from "@/lib/render/hyperbolicIslamic";
import { hypMidpoint, su11Apply, su11Mul, su11Rotation, su11Translation, type Complex, type Su11 } from "@/lib/render/hyperbolic";
import { ISLAMIC_MARGIN, buildWalk, islamicWedgeBox } from "@/lib/render/hyperbolicWalk";
import { islamicNormalAngleFromSlider } from "@/utils/islamicNoise";
import type { DevelopedPatch } from "@/lib/render/hyperbolicDevelopedDraw";


interface ShippedPatch extends DevelopedPatch {
	darts?: Darts;
}
const atlas: ShippedPatch[] = JSON.parse(
	readFileSync(join(__dirname, "..", "public", "hyperbolic-developed.json"), "utf8"),
);
const byId = (id: string) => {
	const p = atlas.find((x) => x.id === id);
	if (!p) throw new Error(`patch ${id} not in atlas`);
	return p;
};
const metaOf = (p: ShippedPatch) => ({ id: p.id, name: p.name, config: p.config, edge: p.edge });

const identity: Su11 = { a: { x: 1, y: 0 }, b: { x: 0, y: 0 } };

function facePolyP(patch: DevelopedPatch, fi: number): Complex[] {
	return patch.faces[fi].map((i) => ({ x: patch.vertices[i][0], y: patch.vertices[i][1] }));
}

/** Euclidean distance from point p to Klein segment [a,b] — all scaled-Klein. */
function kleinSegDist(p: Complex, a: Complex, b: Complex): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const l2 = dx * dx + dy * dy;
	let t = l2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("hyperbolic Islamic plain (Klein-model Hankin construction)", () => {
	it("Klein <-> Poincaré round-trips, and geodesic midpoints are Klein-collinear", () => {
		let s = 424242;
		const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
		for (let n = 0; n < 200; n++) {
			const r = 0.999 * Math.sqrt(rnd());
			const th = 2 * Math.PI * rnd();
			const p = { x: r * Math.cos(th), y: r * Math.sin(th) };
			const back = kleinToPoincare(poincareToKlein(p));
			expect(Math.hypot(back.x - p.x, back.y - p.y)).toBeLessThan(1e-12);
		}
		// a geodesic is a straight chord in Klein: endpoints and hyperbolic midpoint are collinear
		for (let n = 0; n < 50; n++) {
			const a = { x: 0.9 * (rnd() * 2 - 1), y: 0.9 * (rnd() * 2 - 1) };
			const b = { x: 0.9 * (rnd() * 2 - 1), y: 0.9 * (rnd() * 2 - 1) };
			if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-3) continue;
			const ka = poincareToKlein(a);
			const kb = poincareToKlein(b);
			const km = poincareToKlein(hypMidpoint(a, b));
			const cross = (kb.x - ka.x) * (km.y - ka.y) - (kb.y - ka.y) * (km.x - ka.x);
			expect(Math.abs(cross)).toBeLessThan(1e-9);
		}
	});

	it.each([0, 0.5])("tile segments are EQUIVARIANT under isometries (offset %s)", (frac) => {
		const p = byId("hyp-3-6-4-6");
		const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
		const patch = dev.develop(metaOf(p), identity, 0.8, 4000);
		const theta = islamicNormalAngleFromSlider(45);
		const poly = facePolyP(patch, 0);
		const base = islamicSegmentsForTile(poly, theta, frac);
		// any isometry will do: the construction reads nothing but the tile
		const isometries = [su11Rotation(0.7), su11Translation({ x: 0.3, y: -0.2 }), su11Mul(su11Translation({ x: -0.5, y: 0.1 }), su11Rotation(2.1))];
		for (const g of isometries) {
			const movedPoly = poly.map((v) => su11Apply(g, v));
			const moved = islamicSegmentsForTile(movedPoly, theta, frac);
			expect(moved.length).toBe(base.length);
			// map the base segments through g (Klein -> Poincaré -> g -> Klein) and match as a set
			const mapped = base.map(([a, b]) =>
				[a, b].map((q) => {
					const w = su11Apply(g, kleinToPoincare({ x: q.x / KLEIN_SCALE, y: q.y / KLEIN_SCALE }));
					const k = poincareToKlein(w);
					return { x: k.x * KLEIN_SCALE, y: k.y * KLEIN_SCALE };
				}),
			);
			for (const [ma, mb] of moved) {
				let best = Infinity;
				for (const [qa, qb] of mapped) {
					const straight = Math.max(Math.hypot(ma.x - qa.x, ma.y - qa.y), Math.hypot(mb.x - qb.x, mb.y - qb.y));
					const flipped = Math.max(Math.hypot(ma.x - qb.x, ma.y - qb.y), Math.hypot(mb.x - qa.x, mb.y - qa.y));
					best = Math.min(best, straight, flipped);
				}
				expect(best).toBeLessThan(1e-5 * KLEIN_SCALE);
			}
		}
	});

	it.each(["hyp-8-8-8", "hyp-5x5", "hyp-k2-3-3-4-3-4-4__3-3-4-3-4-4"])(
		"rosette closes on every tile ray for %s (no dangling construction line)",
		(id) => {
			const p = byId(id);
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
			const patch = dev.develop(metaOf(p), identity, 0.7, 2000);
			for (const [slider, frac] of [
				[30, 0],
				[45, 0],
				[60, 0],
				[45, 0.4],
				[60, 0.8],
			] as [number, number][]) {
				const theta = islamicNormalAngleFromSlider(slider);
				for (let fi = 0; fi < Math.min(patch.faces.length, 6); fi++) {
					const poly = facePolyP(patch, fi);
					const segs = islamicSegmentsForTile(poly, theta, frac);
					expect(segs.length).toBe(2 * poly.length); // two rays per edge, none dropped
					// every ray endpoint terminates ON another ray's body (T-junction or shared crossing)
					for (let i = 0; i < segs.length; i++) {
						let d = Infinity;
						for (let j = 0; j < segs.length; j++) {
							if (i === j) continue;
							d = Math.min(d, kleinSegDist(segs[i][1], segs[j][0], segs[j][1]));
						}
						expect(d).toBeLessThan(1e-6 * KLEIN_SCALE);
					}
				}
			}
			expect(warn).not.toHaveBeenCalled();
		},
	);

	it("slider 0 (rays along the edges) retraces the tile boundary exactly", () => {
		const p = byId("hyp-8-8-8");
		const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
		const patch = dev.develop(metaOf(p), identity, 0.9, 4000);
		expect(patch.faces.length).toBeGreaterThan(0);
		const poly = facePolyP(patch, 0);
		const theta = islamicNormalAngleFromSlider(0); // 90° from the normal = along the edge
		const segs = islamicSegmentsForTile(poly, theta);
		// expected endpoints: the Klein images of the edge midpoints and the vertices
		const anchors: Complex[] = [];
		for (let i = 0; i < poly.length; i++) {
			const m = poincareToKlein(hypMidpoint(poly[i], poly[(i + 1) % poly.length]));
			const v = poincareToKlein(poly[i]);
			anchors.push({ x: m.x * KLEIN_SCALE, y: m.y * KLEIN_SCALE }, { x: v.x * KLEIN_SCALE, y: v.y * KLEIN_SCALE });
		}
		for (const [a, b] of segs) {
			for (const q of [a, b]) {
				let best = Infinity;
				for (const an of anchors) best = Math.min(best, Math.hypot(q.x - an.x, q.y - an.y));
				expect(best).toBeLessThan(1e-6 * KLEIN_SCALE);
			}
		}
	});

	// ---- the per-polygon layer (islamicTileLayer) ----------------------------------------------------
	const EDGE = byId("hyp-3-6-4-6").edge;
	const RES = 128;
	/** The texel of a point of the p-gon's frame: turned and mirrored into the layer's wedge, as the shader does. */
	const at = (p: number, q: Complex, res = RES) => {
		const [X, Y] = islamicWedgeBox(p, EDGE);
		const sector = (2 * Math.PI) / p;
		const ang = Math.atan2(q.y, q.x);
		const a = Math.abs(ang - Math.round(ang / sector) * sector);
		const r = Math.hypot(q.x, q.y);
		const tx = (u: number) => Math.max(0, Math.min(res - 1, Math.floor(((u + ISLAMIC_MARGIN) / (1 + ISLAMIC_MARGIN)) * res)));
		return (tx((r * Math.sin(a)) / Y) * res + tx((r * Math.cos(a)) / X)) * 4;
	};
	const classes = (layer: Uint8Array) => {
		const n = [0, 0, 0, 0];
		for (let o = 0; o < layer.length; o += 4) n[layer[o]]++;
		return n;
	};
	const agreement = (a: Uint8Array, b: Uint8Array) => {
		let same = 0;
		for (let o = 0; o < a.length; o += 4) if (a[o] === b[o]) same++;
		return same / (a.length / 4);
	};

	it.each([3, 4, 6, 7, 17])("bakes a total layer for the %s-gon, star body at the centre (offsets 0 and 50 %%)", (p) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		for (const frac of [0, 0.5]) {
			const layer = islamicTileLayer(p, EDGE, islamicNormalAngleFromSlider(45), frac, RES);
			const n = classes(layer);
			expect(n[0], "a texel with no class").toBe(0);
			expect(layer[at(p, { x: 0, y: 0 })]).toBe(1);
			expect(n[1]).toBeGreaterThan(0);
			expect(n[2]).toBeGreaterThan(0);
			// the diamonds exist exactly when the offset opens them
			if (frac === 0) expect(n[3]).toBe(0);
			else expect(n[3]).toBeGreaterThan(0);
		}
		warn.mockRestore();
	});

	it("the margin past the wedge mirrors it, so a tap across the axis reads the same face", () => {
		const layer = islamicTileLayer(6, EDGE, islamicNormalAngleFromSlider(45), 0.4, RES);
		const below = Math.floor((ISLAMIC_MARGIN / (1 + ISLAMIC_MARGIN)) * RES) - 1; // last row under the axis
		for (let i = 8; i < RES; i += 8) {
			const a = (below * RES + i) * 4;
			const b = ((below + 1) * RES + i) * 4;
			expect(layer[a]).toBe(layer[b]);
		}
	});

	it("the line-distance channel is zero on a construction line and grows away from it", () => {
		const p = 4;
		const theta = islamicNormalAngleFromSlider(45);
		const layer = islamicTileLayer(p, EDGE, theta, 0, RES);
		const [rv] = islamicWedgeBox(p, EDGE);
		const poly: Complex[] = Array.from({ length: p }, (_, i) => ({ x: rv * Math.cos(((2 * i - 1) * Math.PI) / p), y: rv * Math.sin(((2 * i - 1) * Math.PI) / p) }));
		for (const [a, b] of islamicSegmentsForTile(poly, theta)) {
			const mid = kleinToPoincare({ x: (a.x + b.x) / 2 / KLEIN_SCALE, y: (a.y + b.y) / 2 / KLEIN_SCALE });
			expect(layer[at(p, mid) + 1]).toBeLessThan(30); // within a texel of the line
		}
		expect(layer[at(p, { x: 0, y: 0 }) + 1]).toBeGreaterThan(60);
	});

	it("colour continuity at the slider end stops (angle 89↔90, offset 95↔100, offset 0↔5)", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const bake = (slider: number, frac: number) => islamicTileLayer(6, EDGE, islamicNormalAngleFromSlider(slider), frac, RES);
		const a89 = bake(89, 0);
		const a90 = bake(90, 0);
		expect(classes(a89)[3]).toBe(0);
		expect(classes(a90)[3]).toBe(0);
		// the star bodies are slivers along the apothems at 89 and gone at 90; in one wedge they are 5 % of it
		expect(agreement(a89, a90)).toBeGreaterThan(0.93);
		expect(agreement(bake(45, 0.99), bake(45, 1))).toBeGreaterThan(0.97);
		expect(agreement(bake(45, 0.95), bake(45, 1))).toBeGreaterThan(0.9);
		expect(agreement(bake(45, 0), bake(45, 0.05))).toBeGreaterThan(0.95);
		warn.mockRestore();
	});

	it("the doubly degenerate corner (angle 90 + offset 100 %) still bakes a total layer", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		for (const p of [3, 4, 6]) expect(classes(islamicTileLayer(p, EDGE, islamicNormalAngleFromSlider(90), 1, RES))[0]).toBe(0);
		warn.mockRestore();
	});

	it("stacks one layer per polygon size of the tiling, in the walk table's order", () => {
		const p = byId("hyp-3-6-4-6");
		const walk = buildWalk(p.darts as Darts, p.edge, { allDrawn: true });
		expect(walk.sizes).toEqual([3, 4, 6]);
		const theta = islamicNormalAngleFromSlider(45);
		const stack = islamicLayers(walk.sizes, p.edge, theta, 0, 64);
		expect(stack.length).toBe(3 * 64 * 64 * 4);
		expect(Array.from(stack.subarray(64 * 64 * 4, 64 * 64 * 4 + 64))).toEqual(Array.from(islamicTileLayer(4, p.edge, theta, 0, 64).subarray(0, 64)));
	});

	it("bakes the apeirogon's strip: star body up the cusp, side fields by the vertices, no empty texel", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const edge = 1.7627; // the hybrid board (4, ∞)
		for (const frac of [0, 0.4]) {
			const layer = islamicTileLayer(0, edge, islamicNormalAngleFromSlider(45), frac, RES);
			const n = classes(layer);
			expect(n[0]).toBe(0);
			const texel = (u: number, v: number) => {
				const tx = (c: number) => Math.floor(((c + ISLAMIC_MARGIN) / (1 + ISLAMIC_MARGIN)) * RES);
				return layer[(tx(v) * RES + tx(u)) * 4];
			};
			expect(texel(0.5, 0.9)).toBe(1); // high in the cusp
			expect(texel(0.02, 0.03)).toBe(2); // just above the vertex
			if (frac > 0) expect(n[3]).toBeGreaterThan(0);
			else expect(n[3]).toBe(0);
		}
		warn.mockRestore();
	});

	it("a strap layer is zero on its strands and flags a crossing only around an edge's midpoint", () => {
		const p = 6;
		const theta = islamicNormalAngleFromSlider(45);
		const layer = islamicTileLayer(p, EDGE, theta, 0, RES, "strap");
		const [rv] = islamicWedgeBox(p, EDGE);
		const dist = (o: number) => [(((layer[o] & 127) << 8) | layer[o + 1]) / 32767, ((layer[o + 2] << 8) | layer[o + 3]) / 32767].map((d) => d * STRAP_RANGE);
		const poly: Complex[] = Array.from({ length: p }, (_, i) => ({ x: rv * Math.cos(((2 * i - 1) * Math.PI) / p), y: rv * Math.sin(((2 * i - 1) * Math.PI) / p) }));
		const segs = islamicSegmentsForTile(poly, theta);
		// ray 0 leaves side 0's midpoint into the upper half of the wedge: the + strand there
		const [a, b] = segs[0];
		const along = (t: number) => kleinToPoincare({ x: (a.x + t * (b.x - a.x)) / KLEIN_SCALE, y: (a.y + t * (b.y - a.y)) / KLEIN_SCALE });
		expect(dist(at(p, along(0.5)))[0]).toBeLessThan(0.03);
		// by the midpoint the two rays of the side cross; by the ray's far end it has turned a corner
		expect(layer[at(p, along(0.1))] & 128).toBe(128);
		expect(layer[at(p, along(0.9))] & 128).toBe(0);
		// at the midpoint both strands are at hand, and the centre is far from either
		const root = dist(at(p, along(0.02)));
		expect(Math.max(root[0], root[1])).toBeLessThan(0.08);
		expect(Math.min(...dist(at(p, { x: 0, y: 0 })))).toBeGreaterThan(0.2);
	});
});
